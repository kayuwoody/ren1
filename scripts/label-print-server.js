#!/usr/bin/env node
/**
 * Local Label Print Server for CT221B
 *
 * Runs on localhost and accepts HTTP requests to print labels
 * Sends TSPL commands to the printer via USB
 *
 * Usage:
 *   node scripts/label-print-server.js
 *
 * Then POST to http://localhost:9100/print with JSON body:
 *   { "orderNumber": "123", "itemName": "Hot Latte" }
 */

const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const PORT = 9100;

// Find the printer device
async function findPrinter() {
  // Common locations for USB printers on Linux
  const possibleDevices = [
    '/dev/usb/lp0',
    '/dev/usb/lp1',
    '/dev/usblp0',
    '/dev/usblp1',
    '/dev/lp0',
    '/dev/lp1',
  ];

  for (const device of possibleDevices) {
    if (fs.existsSync(device)) {
      console.log(`Found printer at: ${device}`);
      return device;
    }
  }

  // Try to find via lsusb and create device
  return null;
}

// Generate TSPL commands for a label
function generateTSPL(orderNumber, itemName, quantity = 1) {
  // Clean item name
  const cleanName = itemName
    .replace(/[^\x20-\x7E]/g, '') // ASCII only
    .substring(0, 18); // Truncate to fit

  const orderText = `#${orderNumber}`;
  const qtyText = quantity > 1 ? ` x${quantity}` : '';

  // TSPL commands for 30mm x 15mm label
  const commands = [
    'SIZE 30 mm, 15 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    `TEXT 8,2,"2",0,1,1,"${orderText}"`,
    `TEXT 8,38,"1",0,1,1,"${cleanName}${qtyText}"`,
    'PRINT 1',
    ''
  ].join('\r\n');

  return commands;
}

// Send data to printer
async function printLabel(device, tsplData) {
  return new Promise((resolve, reject) => {
    // Method 1: Direct write to device
    if (device && fs.existsSync(device)) {
      try {
        fs.writeFileSync(device, tsplData);
        resolve({ success: true, method: 'direct' });
        return;
      } catch (err) {
        console.log('Direct write failed, trying lp command...');
      }
    }

    // Method 2: Use lp command (works with CUPS)
    const tmpFile = `/tmp/label-${Date.now()}.tspl`;
    fs.writeFileSync(tmpFile, tsplData);

    // Try to find printer name
    exec('lpstat -p -d', (err, stdout) => {
      let printerName = null;

      // Look for CT221B or similar
      const lines = stdout?.split('\n') || [];
      for (const line of lines) {
        if (line.toLowerCase().includes('ct221') ||
            line.toLowerCase().includes('label') ||
            line.toLowerCase().includes('thermal')) {
          const match = line.match(/printer (\S+)/i);
          if (match) {
            printerName = match[1];
            break;
          }
        }
      }

      if (!printerName) {
        // Try default printer or first available
        const defaultMatch = stdout?.match(/system default destination: (\S+)/);
        if (defaultMatch) {
          printerName = defaultMatch[1];
        }
      }

      if (printerName) {
        exec(`lp -d "${printerName}" -o raw "${tmpFile}"`, (err, stdout, stderr) => {
          fs.unlinkSync(tmpFile);
          if (err) {
            reject({ success: false, error: stderr || err.message });
          } else {
            resolve({ success: true, method: 'lp', printer: printerName });
          }
        });
      } else {
        // Try without specifying printer (use default)
        exec(`lp -o raw "${tmpFile}"`, (err, stdout, stderr) => {
          fs.unlinkSync(tmpFile);
          if (err) {
            reject({ success: false, error: stderr || err.message });
          } else {
            resolve({ success: true, method: 'lp-default' });
          }
        });
      }
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
    return;
  }

  // Print endpoint
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { orderNumber, itemName, quantity } = data;

        if (!orderNumber || !itemName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing orderNumber or itemName' }));
          return;
        }

        const tspl = generateTSPL(orderNumber, itemName, quantity || 1);
        console.log(`Printing label: #${orderNumber} - ${itemName}`);
        console.log('TSPL:', tspl);

        const device = await findPrinter();
        const result = await printLabel(device, tspl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        console.error('Print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Print failed' }));
      }
    });
    return;
  }

  // Test print
  if (req.method === 'POST' && req.url === '/test') {
    try {
      const tspl = generateTSPL('TEST', 'Test Label', 1);
      console.log('Test print TSPL:', tspl);

      const device = await findPrinter();
      const result = await printLabel(device, tspl);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      console.error('Test print error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Test print failed' }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`\n🏷️  Label Print Server running on http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log('  GET  /health  - Health check');
  console.log('  POST /print   - Print label { orderNumber, itemName, quantity }');
  console.log('  POST /test    - Print test label');

  const device = await findPrinter();
  if (device) {
    console.log(`\n✅ Printer found at: ${device}`);
  } else {
    console.log('\n⚠️  No direct USB device found. Will try CUPS/lp command.');
    exec('lpstat -p', (err, stdout) => {
      if (stdout) {
        console.log('\nAvailable printers:');
        console.log(stdout);
      }
    });
  }
});

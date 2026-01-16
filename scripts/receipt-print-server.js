#!/usr/bin/env node
/**
 * Local Receipt Print Server for USB Thermal Printer
 *
 * Works on Windows with USB thermal printers (Type-B USB)
 * Sends ESC/POS commands via USB
 *
 * Setup:
 *   npm install escpos escpos-usb
 *
 * Usage:
 *   node scripts/receipt-print-server.js
 *
 * Then POST to http://localhost:9101/print with order JSON
 */

const http = require('http');

const PORT = 9101;

// We'll use Windows raw printing directly - no escpos needed

// USB Vendor/Product IDs for common thermal printers
const KNOWN_PRINTERS = [
  { vendor: 0x0416, product: 0x5011, name: 'Generic Thermal' },
  { vendor: 0x0483, product: 0x5720, name: 'POS-58' },
  { vendor: 0x0493, product: 0x8760, name: 'XP-58' },
  { vendor: 0x6868, product: 0x0200, name: 'Generic' },
  { vendor: 0x1fc9, product: 0x2016, name: 'NXP' },
];

// ESC/POS command helpers
const ESC = 0x1B;
const GS = 0x1D;

function buildEscPosReceipt(order) {
  const commands = [];
  const encoder = new TextEncoder();

  // Initialize
  commands.push(new Uint8Array([ESC, 0x40])); // ESC @ - Initialize

  // Bold + Center for header
  commands.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold ON
  commands.push(new Uint8Array([ESC, 0x61, 0x01])); // Center

  commands.push(encoder.encode('COFFEE OASIS\n'));
  commands.push(encoder.encode(`Receipt #${order.id || order.number}\n`));

  const dateStr = order.date_created
    ? new Date(order.date_created).toLocaleString('en-MY')
    : new Date().toLocaleString('en-MY');
  commands.push(encoder.encode(`${dateStr}\n\n`));

  // Regular + Left for items
  commands.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold OFF
  commands.push(new Uint8Array([ESC, 0x61, 0x00])); // Left align

  commands.push(encoder.encode('--------------------------------\n'));

  // Line items
  const lineItems = order.line_items || order.items || [];
  for (const item of lineItems) {
    const name = (item.name || 'Unknown').replace(/[^\x20-\x7E]/g, '').substring(0, 24);
    const qty = item.quantity || 1;
    const price = parseFloat(item.total || item.price || 0).toFixed(2);

    commands.push(encoder.encode(`${qty}x ${name}\n`));
    const priceStr = `RM ${price}`;
    commands.push(encoder.encode(`${' '.repeat(32 - priceStr.length)}${priceStr}\n`));
  }

  commands.push(encoder.encode('--------------------------------\n'));

  // Total
  commands.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold ON
  const total = parseFloat(order.total || 0).toFixed(2);
  const totalLine = `TOTAL: RM ${total}`;
  commands.push(encoder.encode(`${' '.repeat(32 - totalLine.length)}${totalLine}\n`));
  commands.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold OFF

  // Payment method
  const paymentMethod = order.payment_method_title || order.payment_method || 'Cash';
  commands.push(encoder.encode(`\nPaid by: ${paymentMethod}\n`));

  // Footer
  commands.push(new Uint8Array([ESC, 0x61, 0x01])); // Center
  commands.push(encoder.encode('\n\nThank you!\n'));
  commands.push(encoder.encode('Come again soon\n\n\n'));

  // Cut paper (partial cut)
  commands.push(new Uint8Array([GS, 0x56, 0x01])); // GS V - Cut

  // Combine all commands
  const totalLength = commands.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const cmd of commands) {
    result.set(cmd, offset);
    offset += cmd.length;
  }

  return Buffer.from(result);
}

// Find Windows printer name
function findWindowsPrinter() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('wmic printer get name,portname', { encoding: 'utf8' });
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const name = line.trim();
      if (name.toLowerCase().includes('pos') ||
          name.toLowerCase().includes('thermal') ||
          name.toLowerCase().includes('receipt') ||
          name.toLowerCase().includes('xprinter') ||
          name.toLowerCase().includes('58') ||
          name.toLowerCase().includes('80')) {
        // Extract just the printer name (first column)
        const printerName = name.split(/\s{2,}/)[0];
        if (printerName && printerName !== 'Name') {
          return printerName;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Print raw bytes on Windows using file copy to printer port
async function printRawWindows(data, printerName) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');

  // Write to temp file
  const tmpFile = path.join(process.env.TEMP || '.', `receipt-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, data);

  try {
    if (!printerName) {
      printerName = findWindowsPrinter();
    }

    if (!printerName) {
      throw new Error('No thermal printer found. Please share your printer or check printer name.');
    }

    console.log(`Printing to: ${printerName}`);

    // Method 1: Try USB port directly (most reliable for raw ESC/POS)
    const ports = ['USB003', 'USB001', 'USB002', 'LPT1'];
    for (const port of ports) {
      try {
        execSync(`copy /b "${tmpFile}" ${port}`, { encoding: 'utf8', shell: true });
        fs.unlinkSync(tmpFile);
        return { success: true, method: 'port', port };
      } catch (e) {
        // Try next port
      }
    }

    // Method 2: Try direct copy to shared printer
    try {
      execSync(`copy /b "${tmpFile}" "\\\\%COMPUTERNAME%\\${printerName}"`, {
        encoding: 'utf8',
        shell: true
      });
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'copy', printer: printerName };
    } catch (e) {
      console.log('Direct copy failed, trying print command...');
    }

    // Method 3: Use print command (fallback)
    try {
      execSync(`print /D:"${printerName}" "${tmpFile}"`, { encoding: 'utf8', shell: true });
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'print', printer: printerName };
    } catch (e) {
      console.log('Print command failed...');
    }

    throw new Error(`Could not print to ${printerName}. Try sharing the printer.`);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    throw err;
  }
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
    res.end(JSON.stringify({
      status: 'ok',
      port: PORT,
      escpos: !!escpos
    }));
    return;
  }

  // Print receipt
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body);
        console.log(`\n📄 Printing receipt for order #${order.id || order.number}`);

        const rawData = buildEscPosReceipt(order);
        const result = await printRawWindows(rawData);

        console.log('✅ Receipt printed:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('❌ Print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Test print (accepts both GET and POST for easy browser testing)
  if ((req.method === 'POST' || req.method === 'GET') && req.url === '/test') {
    try {
      const testOrder = {
        id: 'TEST',
        number: 'TEST',
        date_created: new Date().toISOString(),
        line_items: [
          { name: 'Test Item', quantity: 1, total: '5.00' }
        ],
        total: '5.00',
        payment_method_title: 'Cash'
      };

      console.log('\n🧪 Test print...');

      const rawData = buildEscPosReceipt(testOrder);
      const result = await printRawWindows(rawData);

      console.log('✅ Test print complete:', result);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Test print error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // List printers
  if (req.method === 'GET' && req.url === '/printers') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic printer get name,portname', { encoding: 'utf8' });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(output);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🧾 Receipt Print Server running on http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log('  GET  /health   - Health check');
  console.log('  GET  /printers - List Windows printers');
  console.log('  GET  /test     - Print test receipt');
  console.log('  POST /print    - Print receipt (send order JSON)');

  // Show detected printer
  const printer = findWindowsPrinter();
  if (printer) {
    console.log(`\n✅ Detected printer: ${printer}`);
  } else {
    console.log('\n⚠️  No thermal printer detected. Available printers:');
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic printer get name', { encoding: 'utf8' });
      console.log(output);
    } catch (e) {}
  }
});

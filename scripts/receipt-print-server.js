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

// Convert string to ASCII buffer, stripping non-printable/non-ASCII chars
function ascii(str) {
  return Buffer.from(str.replace(/[^\x0A\x20-\x7E]/g, ''), 'binary');
}

function buildEscPosReceipt(order) {
  const parts = [];

  // Initialize printer
  parts.push(Buffer.from([ESC, 0x40]));

  // Select character code page PC437 (USA)
  parts.push(Buffer.from([ESC, 0x74, 0x00]));

  // Bold + Center for header
  parts.push(Buffer.from([ESC, 0x45, 0x01])); // Bold ON
  parts.push(Buffer.from([ESC, 0x61, 0x01])); // Center

  parts.push(ascii('COFFEE OASIS\n'));

  const orderId = (order.id || order.number || '').substring(0, 8);
  parts.push(ascii(`Receipt #${orderId}\n`));

  const d = order.date_created ? new Date(order.date_created) : new Date();
  const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  parts.push(ascii(`${dateStr}\n\n`));

  // Regular + Left for items
  parts.push(Buffer.from([ESC, 0x45, 0x00])); // Bold OFF
  parts.push(Buffer.from([ESC, 0x61, 0x00])); // Left align

  parts.push(ascii('--------------------------------\n'));

  // Line items
  const lineItems = order.line_items || order.items || [];
  for (const item of lineItems) {
    const name = (item.name || 'Unknown').replace(/[^\x20-\x7E]/g, '').substring(0, 24);
    const qty = item.quantity || 1;
    const price = parseFloat(item.total || item.price || 0).toFixed(2);

    parts.push(ascii(`${qty}x ${name}\n`));
    const priceStr = `RM ${price}`;
    const pad = Math.max(0, 32 - priceStr.length);
    parts.push(ascii(`${' '.repeat(pad)}${priceStr}\n`));
  }

  parts.push(ascii('--------------------------------\n'));

  // Total
  parts.push(Buffer.from([ESC, 0x45, 0x01])); // Bold ON
  const total = parseFloat(order.total || 0).toFixed(2);
  const totalLine = `TOTAL: RM ${total}`;
  const totalPad = Math.max(0, 32 - totalLine.length);
  parts.push(ascii(`${' '.repeat(totalPad)}${totalLine}\n`));
  parts.push(Buffer.from([ESC, 0x45, 0x00])); // Bold OFF

  // Payment method
  const paymentMethod = (order.payment_method_title || order.payment_method || 'Cash')
    .replace(/[^\x20-\x7E]/g, '');
  parts.push(ascii(`\nPaid by: ${paymentMethod}\n`));

  // Footer
  parts.push(Buffer.from([ESC, 0x61, 0x01])); // Center
  parts.push(ascii('\n\nThank you!\n'));
  parts.push(ascii('Come again soon\n\n\n'));

  // Feed and cut
  parts.push(Buffer.from([ESC, 0x64, 0x03])); // Feed 3 lines
  parts.push(Buffer.from([GS, 0x56, 0x00]));  // Full cut

  return Buffer.concat(parts);
}

// Find Windows printer name and its assigned port
function findWindowsPrinter() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('wmic printer get name,portname', { encoding: 'utf8' });
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('pos') ||
          lower.includes('thermal') ||
          lower.includes('receipt') ||
          lower.includes('xprinter') ||
          lower.includes('kprinter') ||
          lower.includes('58') ||
          lower.includes('80')) {
        const parts = line.trim().split(/\s{2,}/);
        const printerName = parts[0];
        const portName = parts[1] || null;
        if (printerName && printerName !== 'Name') {
          return { name: printerName, port: portName };
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Print raw bytes on Windows via the Win32 Print Spooler API (PowerShell)
async function printRawWindows(data, printerNameOverride) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');

  const tmpFile = path.join(process.env.TEMP || '.', `receipt-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, data);

  try {
    const detected = findWindowsPrinter();
    const printerName = printerNameOverride || (detected && detected.name);

    if (!printerName) {
      throw new Error('No thermal printer found. Please share your printer or check printer name.');
    }

    console.log(`Printing to: ${printerName}`);

    // Primary method: Use Win32 WritePrinter API via PowerShell
    // This sends raw bytes through the spooler — the only reliable way on Windows
    const psScript = path.join(__dirname, 'raw-print.ps1');
    try {
      const output = execSync(
        `powershell -ExecutionPolicy Bypass -File "${psScript}" -PrinterName "${printerName}" -FilePath "${tmpFile}"`,
        { encoding: 'utf8', timeout: 15000 }
      );
      console.log(`  PowerShell raw print: ${output.trim()}`);
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'spooler-raw', printer: printerName };
    } catch (e) {
      console.log(`  PowerShell raw print failed: ${e.message}`);
    }

    // Fallback: Try direct copy to shared printer name
    try {
      execSync(`copy /b "${tmpFile}" "\\\\%COMPUTERNAME%\\${printerName}"`, {
        encoding: 'utf8', shell: true, timeout: 5000
      });
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'share-copy', printer: printerName };
    } catch (e) {
      console.log('  Share copy failed');
    }

    // Fallback: print command
    try {
      execSync(`print /D:"${printerName}" "${tmpFile}"`, { encoding: 'utf8', shell: true, timeout: 10000 });
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'print-cmd', printer: printerName };
    } catch (e) {
      console.log('  Print command failed');
    }

    throw new Error(`Could not print to ${printerName}. Check printer is online and not paused.`);
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
    const detected = findWindowsPrinter();
    res.end(JSON.stringify({
      status: 'ok',
      port: PORT,
      printer: detected ? detected.name : null,
      printerPort: detected ? detected.port : null,
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
    console.log(`\n✅ Detected printer: ${printer.name} on port: ${printer.port || 'unknown'}`);
  } else {
    console.log('\n⚠️  No thermal printer detected. Available printers:');
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic printer get name', { encoding: 'utf8' });
      console.log(output);
    } catch (e) {}
  }
});

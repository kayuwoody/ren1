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

// Try to load escpos (optional dependency)
let escpos, USB;
try {
  escpos = require('escpos');
  USB = require('escpos-usb');
  escpos.USB = USB;
  console.log('✅ escpos USB driver loaded');
} catch (e) {
  console.log('⚠️  escpos not installed. Run: npm install escpos escpos-usb');
  console.log('   Will use fallback raw USB method');
}

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

// Print using escpos library
async function printWithEscpos(orderData) {
  if (!escpos || !USB) {
    throw new Error('escpos not installed');
  }

  const device = new USB();
  const printer = new escpos.Printer(device);

  return new Promise((resolve, reject) => {
    device.open(function(err) {
      if (err) {
        reject(err);
        return;
      }

      const order = orderData;
      const lineItems = order.line_items || order.items || [];

      printer
        .font('a')
        .align('ct')
        .style('b')
        .size(1, 1)
        .text('COFFEE OASIS')
        .text(`Receipt #${order.id || order.number}`)
        .text(new Date(order.date_created || Date.now()).toLocaleString('en-MY'))
        .text('')
        .style('normal')
        .align('lt')
        .text('--------------------------------');

      for (const item of lineItems) {
        const name = (item.name || 'Unknown').substring(0, 24);
        const qty = item.quantity || 1;
        const price = parseFloat(item.total || item.price || 0).toFixed(2);
        printer.text(`${qty}x ${name}`);
        printer.text(`                      RM ${price}`);
      }

      printer
        .text('--------------------------------')
        .style('b')
        .text(`                TOTAL: RM ${parseFloat(order.total || 0).toFixed(2)}`)
        .style('normal')
        .text('')
        .text(`Paid by: ${order.payment_method_title || 'Cash'}`)
        .text('')
        .align('ct')
        .text('Thank you!')
        .text('Come again soon')
        .text('')
        .text('')
        .cut()
        .close(() => {
          resolve({ success: true, method: 'escpos' });
        });
    });
  });
}

// Fallback: Print raw bytes (Windows)
async function printRawWindows(data) {
  const fs = require('fs');
  const { execSync } = require('child_process');

  // Write to temp file
  const tmpFile = `${process.env.TEMP || '/tmp'}/receipt-${Date.now()}.bin`;
  fs.writeFileSync(tmpFile, data);

  // Try to find printer and print
  try {
    // List printers
    const printers = execSync('wmic printer get name', { encoding: 'utf8' });
    console.log('Available printers:', printers);

    // Find thermal/receipt printer
    const printerLines = printers.split('\n').filter(l => l.trim());
    let printerName = null;

    for (const line of printerLines) {
      const name = line.trim();
      if (name.toLowerCase().includes('pos') ||
          name.toLowerCase().includes('thermal') ||
          name.toLowerCase().includes('receipt') ||
          name.toLowerCase().includes('58') ||
          name.toLowerCase().includes('80')) {
        printerName = name;
        break;
      }
    }

    if (printerName) {
      // Use Windows print command
      execSync(`print /D:"${printerName}" "${tmpFile}"`, { encoding: 'utf8' });
      fs.unlinkSync(tmpFile);
      return { success: true, method: 'windows-print', printer: printerName };
    }

    throw new Error('No thermal printer found');
  } catch (err) {
    fs.unlinkSync(tmpFile);
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

        let result;

        // Try escpos first
        if (escpos && USB) {
          try {
            result = await printWithEscpos(order);
          } catch (e) {
            console.log('escpos failed, trying raw:', e.message);
            const rawData = buildEscPosReceipt(order);
            result = await printRawWindows(rawData);
          }
        } else {
          const rawData = buildEscPosReceipt(order);
          result = await printRawWindows(rawData);
        }

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

  // Test print
  if (req.method === 'POST' && req.url === '/test') {
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

      let result;
      if (escpos && USB) {
        result = await printWithEscpos(testOrder);
      } else {
        const rawData = buildEscPosReceipt(testOrder);
        result = await printRawWindows(rawData);
      }

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

  // List USB devices (debug)
  if (req.method === 'GET' && req.url === '/devices') {
    try {
      const usb = require('usb');
      const devices = usb.getDeviceList().map(d => ({
        vendor: d.deviceDescriptor.idVendor.toString(16),
        product: d.deviceDescriptor.idProduct.toString(16)
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ devices }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'USB library not available' }));
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
  console.log('  POST /print    - Print receipt (send order JSON)');
  console.log('  POST /test     - Print test receipt');
  console.log('  GET  /devices  - List USB devices');
  console.log('\nTo install USB driver:');
  console.log('  npm install escpos escpos-usb');
});

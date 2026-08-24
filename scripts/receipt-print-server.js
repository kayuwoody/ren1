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

// Short, loud "new online order" chit for the USB thermal receipt printer.
// Used as the reliable arrival cue (the B221 label printer is Bluetooth-only
// in practice, so the receipt printer carries the alert).
function buildEscPosAlert(order) {
  const parts = [];

  parts.push(Buffer.from([ESC, 0x40]));       // Init
  parts.push(Buffer.from([ESC, 0x74, 0x00])); // Code page PC437
  parts.push(Buffer.from([ESC, 0x61, 0x01])); // Center

  // Big, bold banner
  parts.push(Buffer.from([ESC, 0x45, 0x01])); // Bold ON
  parts.push(Buffer.from([GS, 0x21, 0x11]));  // Double width + height
  parts.push(ascii('NEW ONLINE\nORDER\n'));
  parts.push(Buffer.from([GS, 0x21, 0x00]));  // Normal size

  parts.push(ascii('\n'));

  const orderId = (order.id || order.number || '').substring(0, 8);
  parts.push(ascii(`Order #${orderId}\n`));
  parts.push(Buffer.from([ESC, 0x45, 0x00])); // Bold OFF

  const customer = (order.customer_name || 'Guest')
    .replace(/[^\x20-\x7E]/g, '').substring(0, 24);
  parts.push(ascii(`${customer}\n`));

  const items = order.line_items || order.items || [];
  const itemCount = items.reduce((n, it) => n + (it.quantity || it.qty || 1), 0) || items.length;
  parts.push(ascii(`${itemCount} item(s)\n`));

  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  parts.push(ascii(`${timeStr}\n`));

  parts.push(Buffer.from([ESC, 0x64, 0x04])); // Feed 4 lines
  parts.push(Buffer.from([GS, 0x56, 0x00]));  // Full cut

  return Buffer.concat(parts);
}
// Returns { name, port } or null.
function findPrinterByKeywords(keywords) {
  const { execSync } = require('child_process');
  try {
    const output = execSync('wmic printer get name,portname', { encoding: 'utf8' });
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
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

// Thermal receipt printer (58mm/80mm ESC/POS)
function findWindowsPrinter() {
  return findPrinterByKeywords([
    'pos', 'thermal', 'receipt', 'xprinter', 'kprinter', '58', '80',
  ]);
}

// TSPL label printer (CLabel B21 / CT221 / generic label). Kept distinct from
// the thermal receipt printer so both USB printers can coexist.
function findLabelPrinter() {
  // Allow an explicit override via env for odd driver names.
  if (process.env.LABEL_PRINTER_NAME) {
    return { name: process.env.LABEL_PRINTER_NAME, port: null };
  }
  return findPrinterByKeywords([
    'label', 'clabel', 'b21', 'ct221', 'ct-221', 'tspl', 'niimbot', 'godex',
  ]);
}

// ---- TSPL label building (15mm x 30mm kitchen/alert stickers) ----

const LABEL_WIDTH_MM = 30;
const LABEL_HEIGHT_MM = 15;
const LABEL_GAP_MM = 2;

// Encode a TSPL command string to raw bytes, preserving CR/LF line endings.
function tsplBytes(str) {
  return Buffer.from(str, 'latin1');
}

// Strip to printable ASCII (label printers don't render UTF-8 glyphs).
function cleanLabelText(str) {
  return String(str || '').replace(/[^\x20-\x7E]/g, '').trim();
}

// Word-wrap a name into up to `maxLines` lines of `maxChars` each.
function wrapLabelText(text, maxChars, maxLines) {
  const words = cleanLabelText(text).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.substring(0, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// One kitchen make-label: order number header + wrapped item name.
// `copies` prints that many identical labels (used for quantity).
function buildTsplItemLabel(orderNumber, itemName, copies = 1) {
  const orderText = `#${cleanLabelText(orderNumber)}`;
  const leftMargin = 24;
  const lines = wrapLabelText(itemName, 14, 3);

  const cmd = [
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm`,
    `GAP ${LABEL_GAP_MM} mm, 0 mm`,
    'DIRECTION 1',
    'CLS',
    `TEXT ${leftMargin},8,"2",0,1,1,"${orderText}"`,
  ];
  lines.forEach((line, i) => {
    cmd.push(`TEXT ${leftMargin},${40 + i * 20},"1",0,1,1,"${line}"`);
  });
  cmd.push(`PRINT ${Math.max(1, copies)}`, '');
  return cmd.join('\r\n');
}

// Single "new online order" alert sticker — the noisy/visual cue.
function buildTsplAlert(order) {
  const shortId = cleanLabelText(order.id || order.number || '').substring(0, 10);
  const customer = cleanLabelText(order.customer_name || 'Guest').substring(0, 14);
  const items = order.line_items || order.items || order.online_order_items || [];
  const itemCount = items.reduce((n, it) => n + (it.quantity || it.qty || 1), 0) || items.length;
  const leftMargin = 20;

  const cmd = [
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm`,
    `GAP ${LABEL_GAP_MM} mm, 0 mm`,
    'DIRECTION 1',
    'CLS',
    `TEXT ${leftMargin},6,"2",0,1,1,"NEW ONLINE"`,
    `TEXT ${leftMargin},34,"1",0,1,1,"Order #${shortId}"`,
    `TEXT ${leftMargin},54,"1",0,1,1,"${customer}"`,
    `TEXT ${leftMargin},74,"1",0,1,1,"${itemCount} item(s)"`,
    'PRINT 1',
    '',
  ];
  return cmd.join('\r\n');
}

// Build the full TSPL payload for all items in an order (one label per unit).
function buildTsplOrderLabels(order) {
  const orderNumber = order.number || order.id || '???';
  const items = order.line_items || order.items || order.online_order_items || [];
  const blocks = [];
  for (const item of items) {
    const name = item.name || item.product_name || item.productName || 'Unknown';
    const qty = item.quantity || item.qty || 1;
    blocks.push(buildTsplItemLabel(orderNumber, name, qty));
  }
  return blocks.join('');
}

// Print raw bytes on Windows via the Win32 Print Spooler API (PowerShell).
// `detector` picks the target printer when no explicit name is given — defaults
// to the thermal receipt printer; pass findLabelPrinter for label stickers.
async function printRawWindows(data, printerNameOverride, detector = findWindowsPrinter) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');

  const tmpFile = path.join(process.env.TEMP || '.', `print-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, data);

  try {
    const detected = detector();
    const printerName = printerNameOverride || (detected && detected.name);

    if (!printerName) {
      throw new Error('No matching printer found. Please share your printer or check printer name.');
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
    const label = findLabelPrinter();
    res.end(JSON.stringify({
      status: 'ok',
      port: PORT,
      printer: detected ? detected.name : null,
      printerPort: detected ? detected.port : null,
      labelPrinter: label ? label.name : null,
      labelPrinterPort: label ? label.port : null,
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

  // Print per-item kitchen labels for an order (one label per unit)
  if (req.method === 'POST' && req.url === '/print-label') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body);
        console.log(`\n🏷️  Printing item labels for order #${order.id || order.number}`);
        const rawData = tsplBytes(buildTsplOrderLabels(order));
        const result = await printRawWindows(rawData, null, findLabelPrinter);
        console.log('✅ Item labels printed:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('❌ Label print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Print a "new online order" alert chit on the USB thermal receipt printer
  // (the reliable arrival cue — no Bluetooth involved)
  if (req.method === 'POST' && req.url === '/print-alert') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body);
        console.log(`\n🔔 Printing NEW ONLINE ORDER alert (receipt printer) #${order.id || order.number}`);
        const rawData = buildEscPosAlert(order);
        const result = await printRawWindows(rawData); // defaults to receipt printer
        console.log('✅ Alert chit printed:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('❌ Alert print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Print a single "new online order" alert sticker on the LABEL printer
  // (kept for when the label printer is reachable over USB)
  if (req.method === 'POST' && req.url === '/print-label-alert') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const order = JSON.parse(body);
        console.log(`\n🔔 Printing NEW ONLINE ORDER alert #${order.id || order.number}`);
        const rawData = tsplBytes(buildTsplAlert(order));
        const result = await printRawWindows(rawData, null, findLabelPrinter);
        console.log('✅ Alert sticker printed:', result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('❌ Alert print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Test label print
  if ((req.method === 'POST' || req.method === 'GET') && req.url === '/test-label') {
    try {
      console.log('\n🧪 Test label print...');
      const rawData = tsplBytes(buildTsplAlert({
        id: 'TEST', customer_name: 'Test Cust',
        line_items: [{ name: 'Test Item', quantity: 2 }],
      }));
      const result = await printRawWindows(rawData, null, findLabelPrinter);
      console.log('✅ Test label complete:', result);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Test label error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Test the new-order alert chit on the receipt printer
  if ((req.method === 'POST' || req.method === 'GET') && req.url === '/test-alert') {
    try {
      console.log('\n🧪 Test alert chit (receipt printer)...');
      const rawData = buildEscPosAlert({
        id: 'TEST1234', customer_name: 'Test Customer',
        line_items: [{ name: 'Latte', quantity: 2 }, { name: 'Croissant', quantity: 1 }],
      });
      const result = await printRawWindows(rawData);
      console.log('✅ Test alert complete:', result);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Test alert error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
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
  console.log('  GET  /test         - Print test receipt');
  console.log('  POST /print        - Print receipt (send order JSON)');
  console.log('  GET  /test-alert   - Print test new-order chit (receipt printer)');
  console.log('  POST /print-alert  - Print new-order alert chit on receipt printer');
  console.log('  GET  /test-label   - Print test label');
  console.log('  POST /print-label  - Print per-item kitchen labels (order JSON)');
  console.log('  POST /print-label-alert - Print new-order alert sticker on label printer');

  // Show detected printers
  const printer = findWindowsPrinter();
  if (printer) {
    console.log(`\n✅ Receipt printer: ${printer.name} on port: ${printer.port || 'unknown'}`);
  } else {
    console.log('\n⚠️  No thermal receipt printer detected.');
  }
  const label = findLabelPrinter();
  if (label) {
    console.log(`✅ Label printer:   ${label.name} on port: ${label.port || 'unknown'}`);
  } else {
    console.log('⚠️  No label printer detected (set LABEL_PRINTER_NAME to override).');
  }
  if (!printer || !label) {
    console.log('\nAvailable printers:');
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic printer get name', { encoding: 'utf8' });
      console.log(output);
    } catch (e) {}
  }
});

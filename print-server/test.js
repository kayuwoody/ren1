// Simple test script for USB printer
const { PrinterClient } = require('niimbotjs');
const sharp = require('sharp');

async function testPrint() {
  const printer = new PrinterClient();

  try {
    console.log('🔍 Connecting to printer...');
    await printer.open();
    console.log('✅ Connected!');

    // Create a simple test label
    const svgImage = `
      <svg width="384" height="240">
        <rect width="384" height="240" fill="white"/>
        <text x="10" y="30" font-family="monospace" font-size="24" font-weight="bold" fill="black">
          TEST PRINT
        </text>
        <text x="10" y="60" font-family="monospace" font-size="18" fill="black">
          USB Connection
        </text>
        <text x="10" y="90" font-family="monospace" font-size="18" fill="black">
          Niimbot Printer
        </text>
      </svg>
    `;

    const image = sharp(Buffer.from(svgImage));

    console.log('🖨️  Sending print job...');
    await printer.print(image, { density: 3 });
    console.log('✅ Print complete!');

    printer.close();
    console.log('👋 Disconnected');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('- Is the printer connected via USB?');
    console.error('- On Linux, try: ls /dev/tty* | grep -i usb');
    console.error('- You may need permissions: sudo chmod 666 /dev/ttyUSB0');
    printer.close();
    process.exit(1);
  }
}

testPrint();

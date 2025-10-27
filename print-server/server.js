const express = require('express');
const cors = require('cors');
const { PrinterClient } = require('niimbotjs');
const sharp = require('sharp');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Printer client
const printer = new PrinterClient();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Print server is running' });
});

// Print receipt endpoint
app.post('/print/receipt', async (req, res) => {
  try {
    const { text, width = 384, height = 240 } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('📝 Printing receipt:', text);

    // Create image from text using canvas-like approach
    // For now, we'll create a simple test image
    // You can enhance this later with proper text rendering
    const svgImage = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="white"/>
        <text x="10" y="30" font-family="monospace" font-size="18" fill="black">
          ${text.split('\n').map((line, i) => `
            <tspan x="10" dy="${i === 0 ? 0 : 24}">${line}</tspan>
          `).join('')}
        </text>
      </svg>
    `;

    const image = sharp(Buffer.from(svgImage))
      .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } });

    // Open printer connection
    await printer.open();
    console.log('✅ Printer connected');

    // Print the image
    await printer.print(image, { density: 3 });
    console.log('✅ Print job sent');

    // Close connection
    printer.close();

    res.json({
      success: true,
      message: 'Print job completed successfully'
    });

  } catch (error) {
    console.error('❌ Print error:', error);
    printer.close();
    res.status(500).json({
      error: 'Print failed',
      message: error.message
    });
  }
});

// Print with custom image
app.post('/print/image', async (req, res) => {
  try {
    const { imageUrl, imageBuffer } = req.body;

    let image;
    if (imageUrl) {
      // Load from URL
      image = sharp(imageUrl);
    } else if (imageBuffer) {
      // Load from base64 buffer
      const buffer = Buffer.from(imageBuffer, 'base64');
      image = sharp(buffer);
    } else {
      return res.status(400).json({ error: 'Image URL or buffer is required' });
    }

    // Open printer connection
    await printer.open();
    console.log('✅ Printer connected');

    // Print the image
    await printer.print(image, { density: 3 });
    console.log('✅ Print job sent');

    // Close connection
    printer.close();

    res.json({
      success: true,
      message: 'Print job completed successfully'
    });

  } catch (error) {
    console.error('❌ Print error:', error);
    printer.close();
    res.status(500).json({
      error: 'Print failed',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🖨️  Print server running on http://localhost:${PORT}`);
  console.log('📡 Ready to receive print jobs');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down print server...');
  printer.close();
  process.exit(0);
});

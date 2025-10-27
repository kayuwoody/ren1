/**
 * Bluetooth Thermal Printer Service
 *
 * Supports ESC/POS thermal printers via Web Bluetooth API
 * Used for receipts and kitchen stubs
 */

export interface PrinterConfig {
  name: string;
  deviceId?: string;
  type: 'receipt' | 'kitchen';
}

export class ThermalPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private isNiimbot: boolean = false;

  /**
   * Request bluetooth printer pairing
   * Updated to support Niimbot and other printers
   */
  async pair(): Promise<BluetoothDevice> {
    try {
      // Accept all devices to support Niimbot and other proprietary printers
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Niimbot service (common)
          '0000fee0-0000-1000-8000-00805f9b34fb', // Alternative Niimbot service
        ]
      });

      this.device = device;

      // Detect if it's a Niimbot printer (check for model names)
      const deviceName = device.name?.toLowerCase() || '';
      this.isNiimbot =
        deviceName.includes('niimbot') ||
        deviceName.includes('b1-') ||
        deviceName.includes('b21-') ||
        deviceName.includes('b3s-') ||
        deviceName.includes('d11-') ||
        deviceName.includes('d110-') ||
        deviceName.startsWith('b1') ||
        deviceName.startsWith('b21') ||
        deviceName.startsWith('b3s') ||
        deviceName.startsWith('d11') ||
        deviceName.startsWith('d110');

      // Determine model
      let detectedModel = 'Unknown';
      if (deviceName.includes('b21') || deviceName.startsWith('b21')) {
        detectedModel = 'B21';
      } else if (deviceName.includes('b1') || deviceName.startsWith('b1')) {
        detectedModel = 'B1';
      } else if (deviceName.includes('b3s') || deviceName.startsWith('b3s')) {
        detectedModel = 'B3S';
      } else if (deviceName.includes('d11') || deviceName.startsWith('d11')) {
        detectedModel = 'D11';
      } else if (deviceName.includes('d110') || deviceName.startsWith('d110')) {
        detectedModel = 'D110';
      }

      console.log('Paired device:', device.name, 'ID:', device.id);
      console.log('Niimbot detected:', this.isNiimbot, '| Model:', detectedModel);

      return device;
    } catch (err) {
      console.error('Failed to pair printer:', err);
      throw new Error('Failed to pair with printer');
    }
  }

  /**
   * Connect to paired printer
   * Auto-discovers services and characteristics
   */
  async connect(device?: BluetoothDevice): Promise<void> {
    try {
      const targetDevice = device || this.device;
      if (!targetDevice) {
        throw new Error('No device to connect to');
      }

      const server = await targetDevice.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      console.log('Connected to GATT server, discovering services...');

      // Try to get primary services
      const services = await server.getPrimaryServices();
      console.log(`Found ${services.length} services`);

      // Try each service to find writable characteristic
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          console.log(`Service ${service.uuid}: ${characteristics.length} characteristics`);

          for (const char of characteristics) {
            // Look for writable characteristic
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              console.log(`✅ Connected to printer (Service: ${service.uuid}, Char: ${char.uuid})`);
              return;
            }
          }
        } catch (err) {
          // Skip services we can't access
          continue;
        }
      }

      throw new Error('No writable characteristic found on printer');
    } catch (err) {
      console.error('Failed to connect to printer:', err);
      throw new Error('Failed to connect to printer');
    }
  }

  /**
   * Send raw commands to printer
   */
  private async sendCommand(data: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected');
    }

    try {
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(data);
      } else {
        await this.characteristic.writeValue(data);
      }
    } catch (err) {
      console.error('Failed to send command:', err);
      throw new Error('Failed to print');
    }
  }

  /**
   * Send command and read response from printer
   */
  private async sendCommandAndRead(data: Uint8Array): Promise<Uint8Array | null> {
    if (!this.characteristic) {
      throw new Error('Printer not connected');
    }

    try {
      // Send command
      await this.characteristic.writeValue(data);

      // Wait a bit for printer to respond
      await new Promise(resolve => setTimeout(resolve, 200));

      // Try to read response if characteristic supports it
      if (this.characteristic.properties.read || this.characteristic.properties.notify) {
        const response = await this.characteristic.readValue();
        return new Uint8Array(response.buffer);
      }

      return null;
    } catch (err) {
      console.warn('Failed to read response:', err);
      return null;
    }
  }

  /**
   * Niimbot Protocol Commands (for B1, D11, D110, etc.)
   * Based on AndBondStyle/niimprint and MultiMote/niimbluelib
   */
  private niimbotCommands = {
    CMD_GET_RFID: 0x1A,
    CMD_GET_INFO: 0x40,
    CMD_SET_LABEL_DENSITY: 0x21,
    CMD_SET_LABEL_TYPE: 0x23,
    CMD_START_PRINT: 0x01,
    CMD_END_PRINT: 0xF3,
    CMD_START_PAGE_PRINT: 0x03,
    CMD_END_PAGE_PRINT: 0xE3,
    CMD_SET_DIMENSION: 0x13,
    CMD_SET_QUANTITY: 0x15,
    CMD_PRINT_EMPTY_ROW: 0x84,
    CMD_PRINT_BITMAP_ROW: 0x85,
  };

  /**
   * Create Niimbot command packet with correct format:
   * 55 55 | CMD | LEN | DATA | CHECKSUM | AA AA
   */
  private createNiimbotPacket(cmd: number, data: number[] = []): Uint8Array {
    const len = data.length;

    // Calculate checksum (XOR of cmd, len, and all data bytes)
    let checksum = cmd ^ len;
    for (const byte of data) {
      checksum ^= byte;
    }

    const packet = [
      0x55, 0x55,     // Double header
      cmd,
      len,
      ...data,
      checksum,
      0xAA, 0xAA      // Double tail
    ];

    return new Uint8Array(packet);
  }


  /**
   * Convert text to bitmap image for Niimbot label printer
   * Returns monochrome bitmap data (1 bit per pixel)
   *
   * B1: 50mm width = 384px at 203 DPI
   * B21: 20-50mm width (variable) = 157-384px at 203 DPI
   * Standard 50x30mm labels = 384x240 pixels
   */
  private textToBitmap(text: string, width: number = 384, maxHeight: number = 240): { data: Uint8Array[], width: number, height: number } {
    // Create canvas to render text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // B21 supports variable width (20-50mm), B1 supports 50mm
    canvas.width = width;

    // Set font - smaller to fit on 30mm labels
    const fontSize = 18;
    const lineHeight = 24;
    ctx.font = `bold ${fontSize}px monospace`;

    const lines = text.split('\n');
    const padding = 8;

    // Calculate required height
    const requiredHeight = lines.length * lineHeight + padding * 2;

    // Limit to maxHeight (240px for 50x30mm labels)
    canvas.height = Math.min(requiredHeight, maxHeight);

    // Black background (will be inverted later - NiimPrintX inverts the image!)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // White text (will become black after inversion)
    ctx.fillStyle = 'white';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Draw each line
    lines.forEach((line, index) => {
      const y = padding + index * lineHeight;
      // Only draw lines that fit
      if (y + lineHeight <= canvas.height) {
        ctx.fillText(line, padding, y);
      }
    });

    console.log(`🖼️ Canvas rendered: ${canvas.width}x${canvas.height}px (max: ${width}x${maxHeight})`);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // DEBUG: Sample some pixel values
    const samplePixels = [
      { x: 20, y: 20 }, // Likely in text area
      { x: 100, y: 50 }, // Middle
      { x: 0, y: 0 }, // Top-left corner
    ];
    console.log('🔍 Pixel samples:');
    samplePixels.forEach(pos => {
      const idx = (pos.y * canvas.width + pos.x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const gray = (r + g + b) / 3;
      console.log(`  (${pos.x},${pos.y}): R=${r} G=${g} B=${b} Gray=${gray.toFixed(0)} IsWhite=${gray >= 128}`);
    });

    // Convert to 1-bit per pixel (8 pixels per byte, MSB first)
    // Based on NiimPrintX: inverted grayscale converted to 1-bit
    const bitmapLines: Uint8Array[] = [];
    const bytesPerLine = Math.ceil(canvas.width / 8);  // FIX: Use canvas.width not parameter width!
    let whitePixelCount = 0;
    let firstWhitePixel: any = null;

    for (let y = 0; y < canvas.height; y++) {
      const lineBytes = new Uint8Array(bytesPerLine);

      for (let x = 0; x < canvas.width; x++) {  // FIX: Use canvas.width not parameter width!
        const pixelIndex = (y * canvas.width + x) * 4;  // FIX: Use canvas.width!
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        // Grayscale
        const gray = (r + g + b) / 3;

        // FIXED: Printer uses 1=black, 0=white
        // Canvas has black bg + white text, so we want white pixels to print black
        const isWhite = gray >= 128;

        if (isWhite) {  // If white pixel on canvas, set bit to 1 (prints black)
          whitePixelCount++;
          const byteIndex = Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);  // MSB first
          lineBytes[byteIndex] |= (1 << bitIndex);

          if (!firstWhitePixel) {
            firstWhitePixel = { x, y, byteIndex, bitIndex, before: lineBytes[byteIndex] };
            lineBytes[byteIndex] |= (1 << bitIndex);
            firstWhitePixel.after = lineBytes[byteIndex];
          }
        }
      }

      bitmapLines.push(lineBytes);
    }

    if (firstWhitePixel) {
      console.log(`🔍 First white pixel: (${firstWhitePixel.x},${firstWhitePixel.y}) -> byte[${firstWhitePixel.byteIndex}] bit ${firstWhitePixel.bitIndex}: ${firstWhitePixel.before} -> ${firstWhitePixel.after}`);
    }

    console.log(`🔍 White pixel count: ${whitePixelCount} out of ${canvas.width * canvas.height} total pixels`);

    // Debug: Check row 10 before returning
    if (bitmapLines.length > 10) {
      console.log('🔍 Row 10 at return:', Array.from(bitmapLines[10].slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    }

    return {
      data: bitmapLines,
      width: canvas.width,
      height: canvas.height
    };
  }

  /**
   * TEST: Print a simple solid black rectangle to verify bitmap format
   * This helps debug blank label issues
   */
  async testPrint(): Promise<void> {
    try {
      console.log('🧪 TEST: Printing solid black rectangle (1 = black)...');

      // Create a simple 384x100 bitmap with a solid black rectangle in the middle
      const width = 384;
      const height = 100;
      const bytesPerLine = Math.ceil(width / 8); // 48 bytes

      const bitmapLines: Uint8Array[] = [];

      for (let y = 0; y < height; y++) {
        const lineBytes = new Uint8Array(bytesPerLine);

        // Create a rectangle: rows 20-80, columns 50-334
        if (y >= 20 && y < 80) {
          for (let x = 0; x < width; x++) {
            if (x >= 50 && x < 334) {
              // Set bit to 1 for black pixel
              const byteIndex = Math.floor(x / 8);
              const bitIndex = 7 - (x % 8);  // MSB first
              lineBytes[byteIndex] |= (1 << bitIndex);
            }
          }
        }

        bitmapLines.push(lineBytes);
      }

      console.log(`📐 Test bitmap: ${width}x${height} pixels`);
      console.log(`📦 Bytes per line: ${bytesPerLine}`);

      // Use the same print sequence as niimbotPrint
      await this.printBitmapData(bitmapLines, width, height);

    } catch (err) {
      console.error('❌ Test print failed:', err);
      throw err;
    }
  }

  /**
   * TEST 2: Print with INVERTED bits (0 = black, 1 = white)
   * Many thermal printers use 0 for "print" and 1 for "don't print"
   */
  async testPrintInverted(): Promise<void> {
    try {
      console.log('🧪 TEST 2: Printing with INVERTED bits (0 = black)...');

      const width = 384;
      const height = 100;
      const bytesPerLine = Math.ceil(width / 8); // 48 bytes

      const bitmapLines: Uint8Array[] = [];

      for (let y = 0; y < height; y++) {
        // Start with all bits set to 1 (white background)
        const lineBytes = new Uint8Array(bytesPerLine);
        lineBytes.fill(0xFF);

        // Create a rectangle by CLEARING bits (set to 0 for black)
        if (y >= 20 && y < 80) {
          for (let x = 0; x < width; x++) {
            if (x >= 50 && x < 334) {
              // Clear bit to 0 for black pixel
              const byteIndex = Math.floor(x / 8);
              const bitIndex = 7 - (x % 8);  // MSB first
              lineBytes[byteIndex] &= ~(1 << bitIndex);
            }
          }
        }

        bitmapLines.push(lineBytes);
      }

      console.log(`📐 Test bitmap (inverted): ${width}x${height} pixels`);
      console.log(`📦 Bytes per line: ${bytesPerLine}`);

      await this.printBitmapData(bitmapLines, width, height);

    } catch (err) {
      console.error('❌ Inverted test print failed:', err);
      throw err;
    }
  }

  /**
   * Helper: Send bitmap data using Niimbot protocol
   * Extracted for reuse in tests
   */
  private async printBitmapData(bitmapLines: Uint8Array[], width: number, height: number): Promise<void> {
    console.log('🖨️ Niimbot: Starting print...');

    // 1. Set print density
    console.log('📤 Step 1/8: Set density');
    const densityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_DENSITY, [3]);
    await this.sendCommand(densityCmd);
    await new Promise(resolve => setTimeout(resolve, 100));

    // 2. Set label type
    console.log('📤 Step 2/8: Set label type');
    const labelTypeCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_TYPE, [1]);
    await this.sendCommand(labelTypeCmd);
    await new Promise(resolve => setTimeout(resolve, 100));

    // 3. Start print job
    console.log('📤 Step 3/8: Start print job');
    const startPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PRINT, [0x01]);
    await this.sendCommand(startPrintCmd);
    await new Promise(resolve => setTimeout(resolve, 150));

    // 4. Start page
    console.log('📤 Step 4/8: Start page');
    const startPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PAGE_PRINT, [0x01]);
    await this.sendCommand(startPageCmd);
    await new Promise(resolve => setTimeout(resolve, 150));

    // 5. Set dimensions
    console.log('📤 Step 5/8: Set dimensions');
    const dimensionData = [
      (height >> 8) & 0xFF,
      height & 0xFF,
      (width >> 8) & 0xFF,
      width & 0xFF
    ];
    const dimensionCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_DIMENSION, dimensionData);
    await this.sendCommand(dimensionCmd);
    await new Promise(resolve => setTimeout(resolve, 150));

    // 6. Set quantity
    console.log('📤 Step 6/8: Set quantity');
    const quantityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_QUANTITY, [0x00, 0x01]);
    await this.sendCommand(quantityCmd);
    await new Promise(resolve => setTimeout(resolve, 100));

    // 7. Send bitmap rows
    console.log(`📤 Step 7/8: Sending ${bitmapLines.length} bitmap rows...`);
    for (let rowNum = 0; rowNum < bitmapLines.length; rowNum++) {
      const rowData = bitmapLines[rowNum];

      // Calculate left/right pixel counts (like niimbotjs does)
      const midPoint = Math.floor((rowData.length * 8) / 2);
      let leftCount = 0;
      let rightCount = 0;

      for (let byteIndex = 0; byteIndex < rowData.length; byteIndex++) {
        const byte = rowData[byteIndex];
        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
          const pixelIndex = byteIndex * 8 + bitIndex;
          const bitSet = (byte & (1 << (7 - bitIndex))) !== 0;

          if (bitSet) {
            if (pixelIndex < midPoint) {
              leftCount++;
            } else {
              rightCount++;
            }
          }
        }
      }

      const leftOffset = midPoint - leftCount;
      const rightOffset = midPoint - rightCount;

      const packetData = [
        (rowNum >> 8) & 0xFF,
        rowNum & 0xFF,
        leftOffset,   // Pixels left of center
        rightOffset,  // Pixels right of center
        0x00, 0x01,   // Repeat count
        ...Array.from(rowData)
      ];

      const rowCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_PRINT_BITMAP_ROW, packetData);
      await this.sendCommand(rowCmd);

      if (rowNum === 10) {
        console.log(`🔍 Row 10 header: rowNum=${rowNum}, midPoint=${midPoint}, left=${leftCount}, right=${rightCount}, leftOffset=${leftOffset}, rightOffset=${rightOffset}`);
        console.log(`🔍 Row 10 packet (first 12 bytes):`, Array.from(packetData.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      }

      if (rowNum % 20 === 0 || rowNum === bitmapLines.length - 1) {
        console.log(`   Row ${rowNum + 1}/${bitmapLines.length}`);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    console.log('✅ All bitmap rows sent');

    // 8. End page
    console.log('📤 Step 8/8: End page');
    const endPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PAGE_PRINT, [0x01]);
    await this.sendCommand(endPageCmd);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 9. End print job
    console.log('📤 Step 9/8: End print job');
    const endPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PRINT, [0x01]);
    await this.sendCommand(endPrintCmd);
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('✅ Print job complete!');
  }

  /**
   * Print using Niimbot protocol with correct command sequence
   * Supports B1, B21, B3S, D11, D110 models
   */
  private async niimbotPrint(text: string): Promise<void> {
    try {
      console.log('🖨️ Niimbot: Starting print...');
      console.log('📝 Text to print:', text);

      // 0. Read RFID tag to get label information
      console.log('📡 Step 0: Reading NFC/RFID tag...');
      const rfidCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_GET_RFID, [1]);
      const rfidResponse = await this.sendCommandAndRead(rfidCmd);

      if (rfidResponse) {
        console.log('📡 RFID Response:', Array.from(rfidResponse).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

        // Parse RFID response to extract label info
        // Typical format: 55 55 1A [LEN] [DATA...] [CHECKSUM] AA AA
        if (rfidResponse.length > 10) {
          const dataStart = 4; // After headers, cmd, len
          const dataEnd = rfidResponse.length - 3; // Before checksum and tails
          const rfidData = rfidResponse.slice(dataStart, dataEnd);

          console.log('📡 Label info (bytes):', Array.from(rfidData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

          // Try to parse label dimensions if available
          // Format varies but often includes width/height in the data
          if (rfidData.length >= 10) {
            console.log('📏 Label details:');
            console.log('   Type code:', rfidData[0]);
            console.log('   Density:', rfidData[1]);
            if (rfidData.length >= 6) {
              const width = (rfidData[4] << 8) | rfidData[5];
              const height = (rfidData[6] << 8) | rfidData[7];
              console.log(`   Detected size: ${width}x${height} pixels`);
            }
          }
        }
      } else {
        console.warn('⚠️ No RFID response - using default settings for 50x30mm labels');
        console.warn('⚠️ IMPORTANT: Check that:');
        console.warn('   1. Label roll is loaded correctly');
        console.warn('   2. Labels are positioned past the NFC reader');
        console.warn('   3. Using genuine Niimbot labels with NFC tags');
        console.warn('   4. Your labels are actually 50x30mm (will try anyway)');
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Convert text to bitmap (50x30mm = 384x240 pixels at 203 DPI for both B1/B21)
      console.log('🖼️ Converting text to bitmap...');
      const bitmap = this.textToBitmap(text, 384, 240);
      console.log(`📐 Bitmap: ${bitmap.width}x${bitmap.height} pixels (for 50x30mm labels)`);

      // Debug: Check first few rows of bitmap data
      if (bitmap.data.length > 0) {
        const firstRow = bitmap.data[0];
        const row10 = bitmap.data[10];  // Should have white pixel at byte[1]
        const middleRow = bitmap.data[Math.floor(bitmap.data.length / 2)];
        const lastRow = bitmap.data[bitmap.data.length - 1];
        console.log('🔍 Row 0 sample:', Array.from(firstRow.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        console.log('🔍 Row 10 sample:', Array.from(row10.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        console.log('🔍 Middle row sample:', Array.from(middleRow.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        console.log('🔍 Last row sample:', Array.from(lastRow.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      }

      // 1. Set print density (1-5, where 3 is medium)
      console.log('📤 Step 1/9: Set density');
      const densityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_DENSITY, [3]);
      console.log('   Packet:', Array.from(densityCmd).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      await this.sendCommand(densityCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Set label type (1 for standard label)
      console.log('📤 Step 2/9: Set label type');
      const labelTypeCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_TYPE, [1]);
      console.log('   Packet:', Array.from(labelTypeCmd).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      await this.sendCommand(labelTypeCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Start print job (send 0x01 as data)
      console.log('📤 Step 3/9: Start print job');
      const startPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PRINT, [0x01]);
      await this.sendCommand(startPrintCmd);
      await new Promise(resolve => setTimeout(resolve, 150));

      // 4. Start page print (send 0x01 as data)
      console.log('📤 Step 4/9: Start page');
      const startPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PAGE_PRINT, [0x01]);
      await this.sendCommand(startPageCmd);
      await new Promise(resolve => setTimeout(resolve, 150));

      // 5. Set dimensions (height and width as big-endian uint16)
      console.log('📤 Step 5/9: Set dimensions');
      const height = bitmap.height;
      const width = bitmap.width;
      const dimensionData = [
        (height >> 8) & 0xFF,  // Height high byte
        height & 0xFF,          // Height low byte
        (width >> 8) & 0xFF,   // Width high byte
        width & 0xFF            // Width low byte
      ];
      const dimensionCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_DIMENSION, dimensionData);
      await this.sendCommand(dimensionCmd);
      await new Promise(resolve => setTimeout(resolve, 150));

      // 6. Set quantity BEFORE bitmap data (per NiimPrintX sequence!)
      console.log('📤 Step 6/9: Set quantity');
      const quantity = 1;
      const quantityData = [
        (quantity >> 8) & 0xFF,  // High byte
        quantity & 0xFF          // Low byte
      ];
      const quantityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_QUANTITY, quantityData);
      await this.sendCommand(quantityCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 7. Send bitmap data row by row
      // Niimbot format: [ROW_HI] [ROW_LO] [LEFT_OFFSET] [RIGHT_OFFSET] [0] [1] [BITMAP_DATA...]
      console.log(`📤 Step 7/8: Sending ${bitmap.data.length} bitmap rows...`);
      for (let rowNum = 0; rowNum < bitmap.data.length; rowNum++) {
        const rowData = bitmap.data[rowNum];

        // Calculate left/right pixel counts (like niimbotjs does)
        const midPoint = Math.floor((rowData.length * 8) / 2);
        let leftCount = 0;
        let rightCount = 0;

        for (let byteIndex = 0; byteIndex < rowData.length; byteIndex++) {
          const byte = rowData[byteIndex];
          for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
            const pixelIndex = byteIndex * 8 + bitIndex;
            const bitSet = (byte & (1 << (7 - bitIndex))) !== 0;

            if (bitSet) {
              if (pixelIndex < midPoint) {
                leftCount++;
              } else {
                rightCount++;
              }
            }
          }
        }

        const packetData = [
          (rowNum >> 8) & 0xFF,
          rowNum & 0xFF,
          midPoint - leftCount,   // Pixels left of center
          midPoint - rightCount,  // Pixels right of center
          0x00, 0x01,             // Repeat count
          ...Array.from(rowData)
        ];

        const rowCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_PRINT_BITMAP_ROW, packetData);
        await this.sendCommand(rowCmd);

        // Log progress
        if (rowNum % 50 === 0 || rowNum === bitmap.data.length - 1) {
          console.log(`   Row ${rowNum + 1}/${bitmap.data.length}`);
        }

        // 10ms delay between rows (per NiimPrintX)
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      console.log('✅ All bitmap rows sent');

      // 8. End page print (send 0x01 as data) - CRITICAL: printer processes the image here
      console.log('📤 Step 8/8: End page and wait for print...');
      const endPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PAGE_PRINT, [0x01]);
      await this.sendCommand(endPageCmd);

      // Give printer time to process and print (NiimPrintX polls status here)
      console.log('⏳ Waiting for printer to process...');
      await new Promise(resolve => setTimeout(resolve, 3000));  // Wait 3 seconds for print

      // 9. End print job (send 0x01 as data)
      console.log('📤 Step 9/9: End print job');
      const endPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PRINT, [0x01]);
      await this.sendCommand(endPrintCmd);
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('✅ Niimbot: Print job complete!');
    } catch (err) {
      console.error('❌ Niimbot print failed:', err);
      throw err;
    }
  }

  /**
   * ESC/POS Commands
   */
  private ESC = 0x1b;
  private GS = 0x1d;

  private commands = {
    initialize: () => new Uint8Array([this.ESC, 0x40]), // ESC @
    alignCenter: () => new Uint8Array([this.ESC, 0x61, 0x01]), // ESC a 1
    alignLeft: () => new Uint8Array([this.ESC, 0x61, 0x00]), // ESC a 0
    alignRight: () => new Uint8Array([this.ESC, 0x61, 0x02]), // ESC a 2
    bold: () => new Uint8Array([this.ESC, 0x45, 0x01]), // ESC E 1
    boldOff: () => new Uint8Array([this.ESC, 0x45, 0x00]), // ESC E 0
    doubleHeight: () => new Uint8Array([this.ESC, 0x21, 0x10]), // ESC ! 16
    normalSize: () => new Uint8Array([this.ESC, 0x21, 0x00]), // ESC ! 0
    cutPaper: () => new Uint8Array([this.GS, 0x56, 0x00]), // GS V 0
    feedLines: (lines: number) => new Uint8Array([this.ESC, 0x64, lines]), // ESC d n
  };

  /**
   * Convert text to Uint8Array
   */
  private textToBytes(text: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  /**
   * Print customer receipt
   */
  async printReceipt(order: any): Promise<void> {
    // Use Niimbot protocol if detected
    if (this.isNiimbot) {
      const text = this.formatReceiptForNiimbot(order);
      return this.niimbotPrint(text);
    }

    // Otherwise use ESC/POS
    try {
      // Initialize printer
      await this.sendCommand(this.commands.initialize());

      // Header - centered
      await this.sendCommand(this.commands.alignCenter());
      await this.sendCommand(this.commands.doubleHeight());
      await this.sendCommand(this.commands.bold());
      await this.sendCommand(this.textToBytes('COFFEE OASIS\n'));
      await this.sendCommand(this.commands.normalSize());
      await this.sendCommand(this.commands.boldOff());
      await this.sendCommand(this.textToBytes('Smart Locker Coffee Shop\n'));
      await this.sendCommand(this.textToBytes('--------------------------------\n'));

      // Order info - left aligned
      await this.sendCommand(this.commands.alignLeft());
      await this.sendCommand(this.textToBytes(`Order #: ${order.id}\n`));

      const date = new Date(order.date_created || Date.now());
      await this.sendCommand(this.textToBytes(`Date: ${date.toLocaleString('en-MY')}\n`));
      await this.sendCommand(this.textToBytes('--------------------------------\n'));

      // Items
      for (const item of order.line_items) {
        const name = item.name.padEnd(20, ' ');
        const qty = `x${item.quantity}`.padStart(4, ' ');
        const price = `RM ${item.total}`.padStart(8, ' ');
        await this.sendCommand(this.textToBytes(`${name}\n`));
        await this.sendCommand(this.textToBytes(`${qty}${price}\n`));
      }

      await this.sendCommand(this.textToBytes('--------------------------------\n'));

      // Total - bold
      await this.sendCommand(this.commands.bold());
      const total = `RM ${order.total}`.padStart(8, ' ');
      await this.sendCommand(this.textToBytes(`Total:${total}\n`));
      await this.sendCommand(this.commands.boldOff());
      await this.sendCommand(this.textToBytes('--------------------------------\n'));

      // Footer - centered
      await this.sendCommand(this.commands.alignCenter());
      await this.sendCommand(this.textToBytes('Thank you for your purchase!\n'));
      await this.sendCommand(this.textToBytes('Enjoy your coffee!\n'));

      // Feed and cut
      await this.sendCommand(this.commands.feedLines(3));
      await this.sendCommand(this.commands.cutPaper());

      console.log('✅ Receipt printed');
    } catch (err) {
      console.error('Failed to print receipt:', err);
      throw err;
    }
  }

  /**
   * Format receipt text for Niimbot label printer
   */
  private formatReceiptForNiimbot(order: any): string {
    const lines: string[] = [];
    lines.push('COFFEE OASIS');
    lines.push('');
    lines.push(`Order #${order.id}`);

    const date = new Date(order.date_created || Date.now());
    lines.push(date.toLocaleTimeString('en-MY'));
    lines.push('---');

    for (const item of order.line_items) {
      lines.push(`${item.quantity}x ${item.name}`);
      lines.push(`   RM ${item.total}`);
    }

    lines.push('---');
    lines.push(`TOTAL: RM ${order.total}`);
    lines.push('');
    lines.push('Thank you!');

    return lines.join('\n');
  }

  /**
   * Format kitchen stub for Niimbot label printer
   */
  private formatKitchenStubForNiimbot(order: any): string {
    const lines: string[] = [];
    lines.push(`ORDER #${order.id}`);

    const time = new Date(order.date_created || Date.now());
    lines.push(time.toLocaleTimeString('en-MY'));
    lines.push('===');

    for (const item of order.line_items) {
      lines.push(`${item.quantity}x ${item.name}`);
    }

    const totalItems = order.line_items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    lines.push('===');
    lines.push(`ITEMS: ${totalItems}`);

    return lines.join('\n');
  }

  /**
   * Print kitchen stub
   */
  async printKitchenStub(order: any): Promise<void> {
    // Use Niimbot protocol if detected
    if (this.isNiimbot) {
      const text = this.formatKitchenStubForNiimbot(order);
      return this.niimbotPrint(text);
    }

    // Otherwise use ESC/POS
    try {
      // Initialize printer
      await this.sendCommand(this.commands.initialize());

      // Header - centered, large
      await this.sendCommand(this.commands.alignCenter());
      await this.sendCommand(this.commands.doubleHeight());
      await this.sendCommand(this.commands.bold());
      await this.sendCommand(this.textToBytes(`ORDER #${order.id}\n`));
      await this.sendCommand(this.commands.normalSize());
      await this.sendCommand(this.commands.boldOff());

      const time = new Date(order.date_created || Date.now());
      await this.sendCommand(this.textToBytes(`${time.toLocaleTimeString('en-MY')}\n`));
      await this.sendCommand(this.textToBytes('================================\n'));

      // Items - left aligned, large
      await this.sendCommand(this.commands.alignLeft());
      await this.sendCommand(this.commands.doubleHeight());

      for (const item of order.line_items) {
        await this.sendCommand(this.commands.bold());
        await this.sendCommand(this.textToBytes(`${item.quantity}x ${item.name}\n`));
        await this.sendCommand(this.commands.boldOff());
      }

      await this.sendCommand(this.commands.normalSize());
      await this.sendCommand(this.textToBytes('================================\n'));

      // Total items count
      const totalItems = order.line_items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      await this.sendCommand(this.commands.alignCenter());
      await this.sendCommand(this.commands.bold());
      await this.sendCommand(this.textToBytes(`TOTAL ITEMS: ${totalItems}\n`));
      await this.sendCommand(this.commands.boldOff());

      // Feed and cut
      await this.sendCommand(this.commands.feedLines(3));
      await this.sendCommand(this.commands.cutPaper());

      console.log('✅ Kitchen stub printed');
    } catch (err) {
      console.error('Failed to print kitchen stub:', err);
      throw err;
    }
  }

  /**
   * Disconnect from printer
   */
  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
  }
}

/**
 * Printer Manager - handles both receipt and kitchen printers
 */
export class PrinterManager {
  private receiptPrinter: ThermalPrinter | null = null;
  private kitchenPrinter: ThermalPrinter | null = null;

  /**
   * Get or create receipt printer instance
   */
  getReceiptPrinter(): ThermalPrinter {
    if (!this.receiptPrinter) {
      this.receiptPrinter = new ThermalPrinter();
    }
    return this.receiptPrinter;
  }

  /**
   * Get or create kitchen printer instance
   */
  getKitchenPrinter(): ThermalPrinter {
    if (!this.kitchenPrinter) {
      this.kitchenPrinter = new ThermalPrinter();
    }
    return this.kitchenPrinter;
  }

  /**
   * Save printer configuration to localStorage
   */
  savePrinterConfig(type: 'receipt' | 'kitchen', deviceId: string): void {
    localStorage.setItem(`printer_${type}`, deviceId);
  }

  /**
   * Get saved printer configuration
   */
  getPrinterConfig(type: 'receipt' | 'kitchen'): string | null {
    return localStorage.getItem(`printer_${type}`);
  }

  /**
   * Check if Web Bluetooth is supported
   */
  isBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }
}

// Export singleton instance
export const printerManager = new PrinterManager();

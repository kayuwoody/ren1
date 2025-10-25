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
        deviceName.includes('d11-') ||
        deviceName.includes('d110-') ||
        deviceName.startsWith('b1') ||
        deviceName.startsWith('b21') ||
        deviceName.startsWith('d11') ||
        deviceName.startsWith('d110');

      console.log('Paired device:', device.name, 'ID:', device.id, 'Niimbot:', this.isNiimbot);

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
   * Count black pixels in a bitmap row
   */
  private countBlackPixels(row: Uint8Array): number {
    let count = 0;
    for (const byte of row) {
      // Count set bits in byte
      let b = byte;
      while (b) {
        count += b & 1;
        b >>= 1;
      }
    }
    return count;
  }

  /**
   * Convert text to bitmap image for Niimbot label printer
   * Returns monochrome bitmap data (1 bit per pixel)
   */
  private textToBitmap(text: string, width: number = 384): { data: Uint8Array[], width: number, height: number } {
    // Create canvas to render text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Niimbot B1 supports 384px width for 50mm labels
    canvas.width = width;

    // Set font and measure text
    const fontSize = 24;
    const lineHeight = 32;
    ctx.font = `bold ${fontSize}px monospace`;

    const lines = text.split('\n');
    const padding = 10;
    canvas.height = lines.length * lineHeight + padding * 2;

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Black text
    ctx.fillStyle = 'black';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Draw each line
    lines.forEach((line, index) => {
      const y = padding + index * lineHeight;
      ctx.fillText(line, padding, y);
    });

    // Convert to monochrome bitmap
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Convert to 1-bit per pixel (8 pixels per byte)
    const bitmapLines: Uint8Array[] = [];
    const bytesPerLine = Math.ceil(width / 8);

    for (let y = 0; y < canvas.height; y++) {
      const lineBytes = new Uint8Array(bytesPerLine);

      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        // Convert to grayscale and threshold
        const gray = (r + g + b) / 3;
        const isBlack = gray < 128;

        if (isBlack) {
          const byteIndex = Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          lineBytes[byteIndex] |= (1 << bitIndex);
        }
      }

      bitmapLines.push(lineBytes);
    }

    return {
      data: bitmapLines,
      width: canvas.width,
      height: canvas.height
    };
  }

  /**
   * Print using Niimbot protocol with correct command sequence
   */
  private async niimbotPrint(text: string): Promise<void> {
    try {
      console.log('🖨️ Niimbot B1: Starting print...');
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
        console.warn('⚠️ No RFID response - using default settings');
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Convert text to bitmap
      console.log('🖼️ Converting text to bitmap...');
      const bitmap = this.textToBitmap(text, 384);
      console.log(`📐 Bitmap: ${bitmap.width}x${bitmap.height} pixels`);

      // 1. Set print density (1-5, where 3 is medium)
      console.log('📤 Step 1/9: Set density');
      const densityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_DENSITY, [3]);
      await this.sendCommand(densityCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Set label type (1 for standard label)
      console.log('📤 Step 2/9: Set label type');
      const labelTypeCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_LABEL_TYPE, [1]);
      await this.sendCommand(labelTypeCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Start print job
      console.log('📤 Step 3/9: Start print job');
      const startPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PRINT, []);
      await this.sendCommand(startPrintCmd);
      await new Promise(resolve => setTimeout(resolve, 150));

      // 4. Start page print
      console.log('📤 Step 4/9: Start page');
      const startPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_START_PAGE_PRINT, []);
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

      // 6. Send bitmap data row by row with proper format
      console.log(`📤 Step 6/9: Sending ${bitmap.data.length} bitmap rows...`);
      for (let rowNum = 0; rowNum < bitmap.data.length; rowNum++) {
        const rowData = bitmap.data[rowNum];
        const blackPixels = this.countBlackPixels(rowData);

        // Format: 00 [ROW_HI] [ROW_LO] [BLACK_HI] [BLACK_LO] [REPEAT] [BITMAP_DATA...]
        const packetData = [
          0x00,                      // Always 0x00
          (rowNum >> 8) & 0xFF,      // Row number high byte
          rowNum & 0xFF,             // Row number low byte
          (blackPixels >> 8) & 0xFF, // Black pixel count high byte
          blackPixels & 0xFF,        // Black pixel count low byte
          0x01,                      // Repeat count (1 = print once)
          ...Array.from(rowData)     // Bitmap data (48 bytes for 384 pixels)
        ];

        const rowCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_PRINT_BITMAP_ROW, packetData);
        await this.sendCommand(rowCmd);

        // Log progress
        if (rowNum % 50 === 0 || rowNum === bitmap.data.length - 1) {
          console.log(`   Row ${rowNum + 1}/${bitmap.data.length}`);
        }

        // Small delay between rows
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      console.log('✅ All bitmap rows sent');

      // 7. End page print
      console.log('📤 Step 7/9: End page');
      const endPageCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PAGE_PRINT, []);
      await this.sendCommand(endPageCmd);
      await new Promise(resolve => setTimeout(resolve, 200));

      // 8. Set quantity (print 1 copy)
      console.log('📤 Step 8/9: Set quantity');
      const quantityCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_SET_QUANTITY, [1]);
      await this.sendCommand(quantityCmd);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 9. End print job
      console.log('📤 Step 9/9: End print job');
      const endPrintCmd = this.createNiimbotPacket(this.niimbotCommands.CMD_END_PRINT, []);
      await this.sendCommand(endPrintCmd);
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('✅ Niimbot B1: Print job complete!');
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

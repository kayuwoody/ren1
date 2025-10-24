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
      console.log('Paired device:', device.name, 'ID:', device.id);
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
   * Send raw ESC/POS commands to printer
   */
  private async sendCommand(data: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected');
    }

    try {
      await this.characteristic.writeValue(data);
    } catch (err) {
      console.error('Failed to send command:', err);
      throw new Error('Failed to print');
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
   * Print kitchen stub
   */
  async printKitchenStub(order: any): Promise<void> {
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

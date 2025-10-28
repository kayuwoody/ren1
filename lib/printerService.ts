/**
 * Printer Service - Standard ESC/POS Thermal Printers
 *
 * Both Receipt and Kitchen printers use standard ESC/POS Bluetooth protocol
 * This works with most thermal printers including Niimbot in ESC/POS mode
 */

/**
 * Standard Thermal Printer (ESC/POS)
 */
export class ThermalPrinter {
  private device: any = null;
  private characteristic: any = null;

  /**
   * Request bluetooth printer pairing
   */
  async pair(): Promise<any> {
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      this.device = device;
      console.log('Paired device:', device.name, 'ID:', device.id);
      return device;
    } catch (err) {
      console.error('Pairing failed:', err);
      throw err;
    }
  }

  /**
   * Connect to paired printer
   */
  async connect(device?: any): Promise<void> {
    try {
      if (device) {
        this.device = device;
      }

      if (!this.device) {
        throw new Error('No device paired. Call pair() first.');
      }

      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      this.characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      console.log('✅ Connected to thermal printer');
    } catch (err) {
      console.error('Connection failed:', err);
      throw err;
    }
  }

  /**
   * Send ESC/POS command
   */
  private async sendCommand(data: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Not connected');
    }

    await this.characteristic.writeValue(data);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Print receipt (full customer receipt)
   */
  async printReceipt(order: any): Promise<void> {
    // Initialize printer
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // ESC @

    // Bold + Center
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    const encoder = new TextEncoder();
    await this.sendCommand(encoder.encode('COFFEE OASIS\n'));
    await this.sendCommand(encoder.encode(`Order #${order.id}\n`));
    await this.sendCommand(encoder.encode(`${new Date(order.date_created).toLocaleString('en-MY')}\n\n`));

    // Regular + Left
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    // Items
    for (const item of order.line_items) {
      await this.sendCommand(encoder.encode(`${item.quantity}x ${item.name}\n`));
      await this.sendCommand(encoder.encode(`  RM ${item.total}\n`));
    }

    // Total
    await this.sendCommand(encoder.encode('\n'));
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(encoder.encode(`TOTAL: RM ${order.total}\n`));
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF

    // Thank you
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center
    await this.sendCommand(encoder.encode('\nThank you!\n'));

    // Feed and cut
    await this.sendCommand(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
    await this.sendCommand(new Uint8Array([0x1D, 0x56, 0x00])); // Cut paper

    console.log('✅ Receipt printed');
  }

  /**
   * Print kitchen stub
   */
  async printKitchenStub(order: any): Promise<void> {
    // Initialize printer
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // ESC @

    // Bold + Center
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    // Header
    const encoder = new TextEncoder();
    await this.sendCommand(encoder.encode(`ORDER #${order.id}\n`));
    await this.sendCommand(encoder.encode(`${new Date(order.date_created).toLocaleTimeString()}\n\n`));

    // Regular + Left
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    // Items
    for (const item of order.line_items) {
      await this.sendCommand(encoder.encode(`${item.quantity}x ${item.name}\n`));
    }

    // Feed and cut
    await this.sendCommand(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
    await this.sendCommand(new Uint8Array([0x1D, 0x56, 0x00])); // Cut paper

    console.log('✅ Kitchen stub printed');
  }

  /**
   * Test print
   */
  async testPrint(label: string = 'PRINTER'): Promise<void> {
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // Initialize
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    const encoder = new TextEncoder();
    await this.sendCommand(encoder.encode(`${label}\n`));
    await this.sendCommand(encoder.encode('TEST PRINT\n'));
    await this.sendCommand(encoder.encode(`${new Date().toLocaleString()}\n`));

    await this.sendCommand(new Uint8Array([0x1B, 0x64, 0x03])); // Feed
    await this.sendCommand(new Uint8Array([0x1D, 0x56, 0x00])); // Cut

    console.log(`✅ ${label} test print complete`);
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      await this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
  }
}

/**
 * Printer Manager
 */
export class PrinterManager {
  private receiptPrinter: ThermalPrinter | null = null;
  private kitchenPrinter: ThermalPrinter | null = null;

  /**
   * Get receipt printer (Standard thermal - ESC/POS)
   */
  getReceiptPrinter(): ThermalPrinter {
    if (!this.receiptPrinter) {
      this.receiptPrinter = new ThermalPrinter();
    }
    return this.receiptPrinter;
  }

  /**
   * Get kitchen printer (Standard thermal - ESC/POS)
   */
  getKitchenPrinter(): ThermalPrinter {
    if (!this.kitchenPrinter) {
      this.kitchenPrinter = new ThermalPrinter();
    }
    return this.kitchenPrinter;
  }

  /**
   * Save printer configuration
   */
  savePrinterConfig(type: 'receipt' | 'kitchen', deviceId: string): void {
    localStorage.setItem(`printer_${type}`, deviceId);
  }

  /**
   * Get saved configuration
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

// Export singleton
export const printerManager = new PrinterManager();

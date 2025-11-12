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
   * Helper to get metadata from order item
   */
  private getItemMeta(item: any, key: string): any {
    return item.meta_data?.find((m: any) => m.key === key)?.value;
  }

  /**
   * Helper to get metadata from order
   */
  private getOrderMeta(order: any, key: string): any {
    return order.meta_data?.find((m: any) => m.key === key)?.value;
  }

  /**
   * Print receipt (full customer receipt)
   */
  async printReceipt(order: any): Promise<void> {
    const encoder = new TextEncoder();

    // Initialize printer
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // ESC @

    // Bold + Center
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    await this.sendCommand(encoder.encode('COFFEE OASIS\n'));
    await this.sendCommand(encoder.encode(`Order #${order.id}\n`));
    await this.sendCommand(encoder.encode(`${new Date(order.date_created).toLocaleString('en-MY')}\n\n`));

    // Regular + Left
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    // Items with bundle support
    for (const item of order.line_items) {
      const isBundle = this.getItemMeta(item, '_is_bundle') === 'true';
      const bundleDisplayName = this.getItemMeta(item, '_bundle_display_name');
      const bundleComponents = this.getItemMeta(item, '_bundle_components');
      const discountReason = this.getItemMeta(item, '_discount_reason');

      const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

      // Print main item
      await this.sendCommand(encoder.encode(`${item.quantity}x ${displayName}\n`));

      // Print bundle components if it's a combo
      if (isBundle && bundleComponents) {
        try {
          const components = typeof bundleComponents === 'string'
            ? JSON.parse(bundleComponents)
            : bundleComponents;

          if (Array.isArray(components) && components.length > 0) {
            for (const component of components) {
              await this.sendCommand(encoder.encode(`  + ${component.name}\n`));
            }
          }
        } catch (e) {
          console.error('Failed to parse bundle components:', e);
        }
      }

      // Print discount if applicable
      if (discountReason) {
        await this.sendCommand(encoder.encode(`  (${discountReason})\n`));
      }

      await this.sendCommand(encoder.encode(`  RM ${parseFloat(item.total).toFixed(2)}\n\n`));
    }

    // Total with discount info
    const retailTotal = this.getOrderMeta(order, '_retail_total');
    const totalDiscount = this.getOrderMeta(order, '_total_discount');

    if (totalDiscount && parseFloat(totalDiscount) > 0) {
      await this.sendCommand(encoder.encode(`Retail Total: RM ${parseFloat(retailTotal).toFixed(2)}\n`));
      await this.sendCommand(encoder.encode(`Discount: -RM ${parseFloat(totalDiscount).toFixed(2)}\n`));
      await this.sendCommand(encoder.encode('--------------------------------\n'));
    }

    // Bold total
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(encoder.encode(`TOTAL: RM ${parseFloat(order.total).toFixed(2)}\n`));
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF

    // Thank you (centered)
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center
    await this.sendCommand(encoder.encode('\nThank you!\n'));
    await this.sendCommand(encoder.encode('Come again soon!\n'));

    // Feed and cut
    await this.sendCommand(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
    await this.sendCommand(new Uint8Array([0x1D, 0x56, 0x00])); // Cut paper

    console.log('✅ Receipt printed');
  }

  /**
   * Print kitchen stub
   */
  async printKitchenStub(order: any): Promise<void> {
    const encoder = new TextEncoder();

    // Initialize printer
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // ESC @

    // Bold + Center
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    // Header
    await this.sendCommand(encoder.encode(`ORDER #${order.id}\n`));
    await this.sendCommand(encoder.encode(`${new Date(order.date_created).toLocaleTimeString('en-MY')}\n\n`));

    // Regular + Left
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    // Items with bundle components
    for (const item of order.line_items) {
      const isBundle = this.getItemMeta(item, '_is_bundle') === 'true';
      const bundleDisplayName = this.getItemMeta(item, '_bundle_display_name');
      const bundleComponents = this.getItemMeta(item, '_bundle_components');

      const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

      // Bold item name
      await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
      await this.sendCommand(encoder.encode(`${item.quantity}x ${displayName}\n`));
      await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF

      // Print bundle components
      if (isBundle && bundleComponents) {
        try {
          const components = typeof bundleComponents === 'string'
            ? JSON.parse(bundleComponents)
            : bundleComponents;

          if (Array.isArray(components) && components.length > 0) {
            for (const component of components) {
              await this.sendCommand(encoder.encode(`  + ${component.name}\n`));
            }
          }
        } catch (e) {
          console.error('Failed to parse bundle components:', e);
        }
      }

      await this.sendCommand(encoder.encode('\n'));
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

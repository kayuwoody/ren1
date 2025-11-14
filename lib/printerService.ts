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
  private server: any = null;

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

      // Check if already connected
      if (this.device.gatt.connected && this.characteristic) {
        console.log('✅ Already connected to thermal printer');
        return;
      }

      console.log('🔌 Connecting to thermal printer...');
      this.server = await this.device.gatt.connect();

      // Listen for disconnection events
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('⚠️ Thermal printer disconnected');
        this.characteristic = null;
        this.server = null;
      });

      const service = await this.server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      this.characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      console.log('✅ Connected to thermal printer');
    } catch (err) {
      console.error('Connection failed:', err);
      this.characteristic = null;
      this.server = null;
      throw err;
    }
  }

  /**
   * Ensure printer is connected, reconnect if needed
   */
  private async ensureConnected(): Promise<void> {
    if (!this.device) {
      throw new Error('No device paired. Call pair() first.');
    }

    // If not connected or characteristic lost, reconnect
    if (!this.device.gatt.connected || !this.characteristic) {
      console.log('🔄 Reconnecting to printer...');
      await this.connect();
    }
  }

  /**
   * Send ESC/POS command
   */
  private async sendCommand(data: Uint8Array): Promise<void> {
    await this.ensureConnected();

    if (!this.characteristic) {
      throw new Error('Not connected');
    }

    await this.characteristic.writeValue(data);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Strip emojis and special unicode characters for thermal printing
   * Thermal printers only support basic ASCII characters
   */
  private stripIcons(text: string): string {
    // Remove emojis and special unicode characters
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Miscellaneous symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport symbols
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental symbols
      .replace(/[\u{2000}-\u{206F}]/gu, '')   // General punctuation
      .trim();
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
    await this.sendCommand(encoder.encode(`Receipt #${order.id}\n`));
    await this.sendCommand(encoder.encode(`${new Date(order.date_created).toLocaleString('en-MY')}\n\n`));

    // Regular + Left
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    await this.sendCommand(encoder.encode('--------------------------------\n'));

    // Items with bundle support
    for (const item of order.line_items) {
      const isBundle = this.getItemMeta(item, '_is_bundle') === 'true';
      const bundleDisplayName = this.getItemMeta(item, '_bundle_display_name');
      const bundleComponents = this.getItemMeta(item, '_bundle_components');
      const discountReason = this.getItemMeta(item, '_discount_reason');
      const retailPrice = this.getItemMeta(item, '_retail_price');

      const displayName = this.stripIcons(isBundle && bundleDisplayName ? bundleDisplayName : item.name);
      const finalPrice = parseFloat(item.total);
      const originalPrice = retailPrice ? parseFloat(retailPrice) : finalPrice;
      const hasDiscount = originalPrice > finalPrice;

      // Print main item name
      await this.sendCommand(encoder.encode(`${item.quantity}x ${displayName}\n`));

      if (hasDiscount) {
        // Show original price on separate line, right-aligned
        const originalPriceStr = `RM ${originalPrice.toFixed(2)}`;
        await this.sendCommand(encoder.encode(`${' '.repeat(32 - originalPriceStr.length)}${originalPriceStr}\n`));

        // Show discount reason and final price, right-aligned
        const discountLabel = `  ${this.stripIcons(discountReason || 'Discount')}`;
        const finalPriceStr = `RM ${finalPrice.toFixed(2)}`;
        const padding = Math.max(1, 32 - discountLabel.length - finalPriceStr.length);
        await this.sendCommand(encoder.encode(`${discountLabel}${' '.repeat(padding)}${finalPriceStr}\n`));
      } else {
        // No discount, show price on separate line, right-aligned
        const itemPrice = `RM ${finalPrice.toFixed(2)}`;
        await this.sendCommand(encoder.encode(`${' '.repeat(32 - itemPrice.length)}${itemPrice}\n`));
      }

      // Print bundle components if it's a combo
      if (isBundle && bundleComponents) {
        try {
          const components = typeof bundleComponents === 'string'
            ? JSON.parse(bundleComponents)
            : bundleComponents;

          if (Array.isArray(components) && components.length > 0) {
            for (const component of components) {
              const componentName = this.stripIcons(component.productName || component.name || 'Unknown');
              await this.sendCommand(encoder.encode(`  + ${componentName}\n`));
            }
          }
        } catch (e) {
          console.error('Failed to parse bundle components:', e);
        }
      }

      await this.sendCommand(encoder.encode('\n'));
    }

    await this.sendCommand(encoder.encode('--------------------------------\n'));

    // Calculate totals
    const finalTotal = parseFloat(order.total);
    const totalDiscount = this.getOrderMeta(order, '_total_discount');
    const discountAmount = totalDiscount ? parseFloat(totalDiscount) : 0;
    const totalBeforeDiscount = finalTotal + discountAmount;

    // Helper function to align right
    const alignRight = (label: string, value: string, width: number = 32): string => {
      const line = `${label}${value}`;
      const padding = width - line.length;
      return `${label}${' '.repeat(Math.max(1, padding))}${value}`;
    };

    // Total (original price)
    await this.sendCommand(encoder.encode(alignRight('Total:', `RM ${totalBeforeDiscount.toFixed(2)}`) + '\n'));

    // Discount (amount saved)
    if (discountAmount > 0) {
      await this.sendCommand(encoder.encode(alignRight('Discount:', `-RM ${discountAmount.toFixed(2)}`) + '\n'));
    }

    // Subtotal (after discount)
    await this.sendCommand(encoder.encode(alignRight('Subtotal:', `RM ${finalTotal.toFixed(2)}`) + '\n'));

    // Tax (waived)
    await this.sendCommand(encoder.encode(alignRight('Tax (6% SST):', 'Waived') + '\n'));

    await this.sendCommand(encoder.encode('--------------------------------\n'));

    // Bold TOTAL (final amount to pay)
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
    await this.sendCommand(encoder.encode(alignRight('TOTAL:', `RM ${finalTotal.toFixed(2)}`) + '\n\n'));
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF

    // Digital receipt access
    await this.sendCommand(encoder.encode('--------------------------------\n'));
    await this.sendCommand(encoder.encode('DIGITAL RECEIPT\n'));
    await this.sendCommand(encoder.encode('--------------------------------\n\n'));

    await this.sendCommand(encoder.encode('Scan QR code to view your\n'));
    await this.sendCommand(encoder.encode('receipt online\n\n'));

    // Generate QR code with static receipt URL
    // Points to static HTML file uploaded to /receipts/ folder
    const receiptDomain = process.env.NEXT_PUBLIC_RECEIPT_DOMAIN || 'coffee-oasis.com.my';
    const receiptUrl = `https://${receiptDomain}/receipts/order-${order.id}.html`;
    const qrData = receiptUrl;

    // Center align for QR code
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    // QR Code command (ESC/POS QR code)
    await this.printQRCode(qrData);

    // Left align
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x00])); // Left

    await this.sendCommand(encoder.encode(`\n${receiptUrl}\n\n`));

    await this.sendCommand(encoder.encode('--------------------------------\n'));

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
   * Print QR code using ESC/POS commands
   */
  private async printQRCode(data: string): Promise<void> {
    const encoder = new TextEncoder();
    const qrData = encoder.encode(data);
    const qrLength = qrData.length;

    // QR Code: Model 2, Size 6, Error correction level M
    // Store QR code data
    await this.sendCommand(new Uint8Array([
      0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00 // QR model
    ]));

    await this.sendCommand(new Uint8Array([
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06 // QR size (6)
    ]));

    await this.sendCommand(new Uint8Array([
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31 // Error correction M
    ]));

    // Store data
    const pL = (qrLength + 3) & 0xFF;
    const pH = ((qrLength + 3) >> 8) & 0xFF;
    const storeCmd = new Uint8Array(qrLength + 8);
    storeCmd.set([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
    storeCmd.set(qrData, 8);
    await this.sendCommand(storeCmd);

    // Print QR code
    await this.sendCommand(new Uint8Array([
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30
    ]));
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

      const displayName = this.stripIcons(isBundle && bundleDisplayName ? bundleDisplayName : item.name);

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
              const componentName = this.stripIcons(component.productName || component.name || 'Unknown');
              await this.sendCommand(encoder.encode(`  + ${componentName}\n`));
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
    this.server = null;
    this.characteristic = null;
    // Don't null out device - we want to keep it for reconnection
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.device?.gatt?.connected && this.characteristic !== null;
  }
}

/**
 * Printer Manager
 */
export class PrinterManager {
  private receiptPrinter: ThermalPrinter | null = null;
  private kitchenPrinter: ThermalPrinter | null = null;
  private receiptDevice: any = null;
  private kitchenDevice: any = null;

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
  savePrinterConfig(type: 'receipt' | 'kitchen', deviceId: string, deviceName: string): void {
    localStorage.setItem(`printer_${type}_id`, deviceId);
    localStorage.setItem(`printer_${type}_name`, deviceName);
  }

  /**
   * Get saved device info
   */
  getSavedDeviceInfo(type: 'receipt' | 'kitchen'): { id: string; name: string } | null {
    const id = localStorage.getItem(`printer_${type}_id`);
    const name = localStorage.getItem(`printer_${type}_name`);
    if (id && name) {
      return { id, name };
    }
    return null;
  }

  /**
   * Get cached device (if still connected)
   */
  getCachedDevice(type: 'receipt' | 'kitchen'): any {
    return type === 'receipt' ? this.receiptDevice : this.kitchenDevice;
  }

  /**
   * Set cached device
   */
  setCachedDevice(type: 'receipt' | 'kitchen', device: any): void {
    if (type === 'receipt') {
      this.receiptDevice = device;
    } else {
      this.kitchenDevice = device;
    }
  }

  /**
   * Try to auto-reconnect to previously paired devices
   * Call this on app startup or when entering printer settings
   */
  async autoReconnect(): Promise<{ receipt: any | null; kitchen: any | null }> {
    const results = { receipt: null as any, kitchen: null as any };

    if (!this.isBluetoothSupported()) {
      console.log('❌ Bluetooth not supported in this browser');
      return results;
    }

    try {
      // Check what printer info we have saved
      const receiptInfo = this.getSavedDeviceInfo('receipt');
      const kitchenInfo = this.getSavedDeviceInfo('kitchen');

      console.log('🔍 Printer Auto-Reconnect:', {
        receiptSaved: receiptInfo ? `${receiptInfo.name} (${receiptInfo.id})` : 'none',
        kitchenSaved: kitchenInfo ? `${kitchenInfo.name} (${kitchenInfo.id})` : 'none',
        hasGetDevices: 'getDevices' in (navigator as any).bluetooth
      });

      // Modern Web Bluetooth API allows getting previously authorized devices
      if ('getDevices' in (navigator as any).bluetooth) {
        const devices = await (navigator as any).bluetooth.getDevices();
        console.log(`📱 Found ${devices.length} previously authorized Bluetooth device(s)`);

        if (devices.length > 0) {
          console.log('📱 Authorized devices:', devices.map((d: any) => `${d.name} (${d.id})`).join(', '));
        }

        for (const device of devices) {
          // Match receipt printer
          if (receiptInfo && device.id === receiptInfo.id) {
            console.log(`✅ Matched receipt printer: ${device.name} (${device.id})`);
            this.receiptDevice = device;
            results.receipt = device;
          }

          // Match kitchen printer
          if (kitchenInfo && device.id === kitchenInfo.id) {
            console.log(`✅ Matched kitchen printer: ${device.name} (${device.id})`);
            this.kitchenDevice = device;
            results.kitchen = device;
          }
        }

        if (!results.receipt && receiptInfo) {
          console.warn(`⚠️ Receipt printer "${receiptInfo.name}" not found in authorized devices - will need to re-pair`);
        }
        if (!results.kitchen && kitchenInfo) {
          console.warn(`⚠️ Kitchen printer "${kitchenInfo.name}" not found in authorized devices - will need to re-pair`);
        }

        if (results.receipt) {
          console.log('✅ Receipt printer ready for use');
        }
        if (results.kitchen) {
          console.log('✅ Kitchen printer ready for use');
        }
      } else {
        console.warn('⚠️ Bluetooth getDevices() not available in this browser - printers will need manual pairing each time');
        console.log('💡 Tip: Use Chrome, Edge, or Opera for automatic printer reconnection');
      }
    } catch (err) {
      console.error('❌ Auto-reconnect failed:', err);
    }

    return results;
  }

  /**
   * Get saved configuration (legacy support)
   */
  getPrinterConfig(type: 'receipt' | 'kitchen'): string | null {
    return localStorage.getItem(`printer_${type}_id`);
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

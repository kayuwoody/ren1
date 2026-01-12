/**
 * Label Printer Service - CT221B / TSPL Compatible
 *
 * For small kitchen labels (15mm x 30mm) - one label per item
 * Connects via Bluetooth and sends TSPL commands
 */

export class LabelPrinter {
  private device: any = null;
  private characteristic: any = null;
  private server: any = null;

  // Label dimensions in mm
  private labelWidth = 30;
  private labelHeight = 15;
  private gapHeight = 2;

  /**
   * Request bluetooth printer pairing
   */
  async pair(): Promise<any> {
    try {
      // Try multiple service UUIDs that thermal printers commonly use
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Common thermal printer service
          '0000ff00-0000-1000-8000-00805f9b34fb', // Alternative service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Nordic UART
          '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
        ]
      });

      this.device = device;
      console.log('Label printer paired:', device.name, 'ID:', device.id);
      return device;
    } catch (err) {
      console.error('Label printer pairing failed:', err);
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

      if (this.device.gatt.connected && this.characteristic) {
        console.log('Already connected to label printer');
        return;
      }

      console.log('Connecting to label printer...');
      this.server = await this.device.gatt.connect();

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Label printer disconnected');
        this.characteristic = null;
        this.server = null;
      });

      // Try different service/characteristic combinations
      const serviceUUIDs = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      ];

      const characteristicUUIDs = [
        '00002af1-0000-1000-8000-00805f9b34fb',
        '0000ff02-0000-1000-8000-00805f9b34fb',
        '49535343-8841-43f4-a8d4-ecbe34729bb3',
      ];

      for (const serviceUUID of serviceUUIDs) {
        try {
          const service = await this.server.getPrimaryService(serviceUUID);
          for (const charUUID of characteristicUUIDs) {
            try {
              this.characteristic = await service.getCharacteristic(charUUID);
              console.log(`Connected using service ${serviceUUID}, characteristic ${charUUID}`);
              return;
            } catch (e) {
              // Try next characteristic
            }
          }
          // If we got the service but no characteristic, try getting all characteristics
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              console.log(`Connected using service ${serviceUUID}, characteristic ${char.uuid}`);
              return;
            }
          }
        } catch (e) {
          // Try next service
        }
      }

      throw new Error('Could not find writable characteristic');
    } catch (err) {
      console.error('Label printer connection failed:', err);
      this.characteristic = null;
      this.server = null;
      throw err;
    }
  }

  /**
   * Ensure connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.device) {
      throw new Error('No device paired');
    }
    if (!this.device.gatt.connected || !this.characteristic) {
      await this.connect();
    }
  }

  /**
   * Send data to printer
   */
  private async sendData(data: string): Promise<void> {
    await this.ensureConnected();

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);

    // Send in chunks (BLE has MTU limits, typically 20-512 bytes)
    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await this.characteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Truncate text to fit label width
   */
  private truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars - 1) + '.';
  }

  /**
   * Print a single kitchen label
   * 15mm tall x 30mm wide
   */
  async printKitchenLabel(orderNumber: string | number, itemName: string, quantity: number = 1): Promise<void> {
    // Clean item name (remove emojis, special chars)
    const cleanName = itemName
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .trim();

    // For 30mm width at 8 dots/mm = 240 dots
    // For 15mm height at 8 dots/mm = 120 dots
    // Using small font (font "1" is typically 8x12 dots)
    // Max ~25-28 chars width for small font

    const orderText = `#${orderNumber}`;
    const displayName = this.truncateText(cleanName, 18);
    const qtyText = quantity > 1 ? `x${quantity}` : '';

    // TSPL commands for CT221B
    const tspl = [
      `SIZE ${this.labelWidth} mm, ${this.labelHeight} mm`,
      `GAP ${this.gapHeight} mm, 0 mm`,
      'DIRECTION 1',
      'CLS',
      // Order number - top, bold/larger
      `TEXT 8,4,"2",0,1,1,"${orderText}"`,
      // Item name - middle
      `TEXT 8,40,"1",0,1,1,"${displayName}${qtyText}"`,
      'PRINT 1',
      ''
    ].join('\r\n');

    console.log('Sending TSPL:', tspl);
    await this.sendData(tspl);
    console.log(`Label printed: ${orderText} - ${displayName}`);
  }

  /**
   * Print labels for all items in an order
   */
  async printOrderLabels(order: any): Promise<void> {
    const orderNumber = order.id || order.order_id || '???';

    for (const item of order.line_items || order.items || []) {
      const itemName = item.name || item.productName || 'Unknown';
      const quantity = item.quantity || 1;

      // Print one label per quantity unit
      for (let i = 0; i < quantity; i++) {
        await this.printKitchenLabel(orderNumber, itemName, 1);
        // Small delay between labels
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  /**
   * Test print
   */
  async testPrint(): Promise<void> {
    await this.printKitchenLabel('TEST', 'Test Label', 1);
    console.log('Test label printed');
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
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.device?.gatt?.connected && this.characteristic !== null;
  }

  /**
   * Get device info
   */
  getDeviceInfo(): { id: string; name: string } | null {
    if (!this.device) return null;
    return { id: this.device.id, name: this.device.name || 'Label Printer' };
  }
}

// Singleton instance
export const labelPrinter = new LabelPrinter();

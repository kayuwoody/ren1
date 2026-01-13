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
  private static STORAGE_KEY = 'labelPrinterDeviceId';

  // Label dimensions in mm
  private labelWidth = 30;
  private labelHeight = 15;
  private gapHeight = 2;

  /**
   * Try to reconnect to previously paired device
   */
  async tryReconnect(): Promise<boolean> {
    try {
      const devices = await (navigator as any).bluetooth.getDevices();
      const savedId = localStorage.getItem(LabelPrinter.STORAGE_KEY);

      for (const device of devices) {
        if (savedId && device.id === savedId) {
          this.device = device;
          await this.connect();
          console.log('Reconnected to label printer:', device.name);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.log('Could not reconnect:', err);
      return false;
    }
  }

  /**
   * Request bluetooth printer pairing
   */
  async pair(): Promise<any> {
    // Try reconnect first
    if (await this.tryReconnect()) {
      return this.device;
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '00001101-0000-1000-8000-00805f9b34fb',
        ]
      });

      this.device = device;
      localStorage.setItem(LabelPrinter.STORAGE_KEY, device.id);
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
    // Clean item name - ASCII only, no special chars
    const cleanName = itemName
      .replace(/[^\x20-\x7E]/g, '') // Only printable ASCII
      .trim();

    // For 30mm width at 8 dots/mm = 240 dots
    // Font "1" is ~8 dots wide, fits ~28 chars
    // Split into 2 lines if needed
    const maxLineChars = 26;
    let line1 = cleanName;
    let line2 = '';

    if (cleanName.length > maxLineChars) {
      // Try to break at word boundary
      const words = cleanName.split(' ');
      line1 = '';
      line2 = '';
      for (const word of words) {
        if ((line1 + ' ' + word).trim().length <= maxLineChars) {
          line1 = (line1 + ' ' + word).trim();
        } else if ((line2 + ' ' + word).trim().length <= maxLineChars) {
          line2 = (line2 + ' ' + word).trim();
        }
      }
      if (!line1) line1 = cleanName.substring(0, maxLineChars);
    }

    const orderText = `#${orderNumber}`;

    // TSPL commands for CT221B - using smallest font "1"
    const tspl = [
      `SIZE ${this.labelWidth} mm, ${this.labelHeight} mm`,
      `GAP ${this.gapHeight} mm, 0 mm`,
      'DIRECTION 1',
      'CLS',
      // Order number - top left, font 2 for visibility
      `TEXT 4,2,"2",0,1,1,"${orderText}"`,
      // Item name line 1
      `TEXT 4,36,"1",0,1,1,"${line1}"`,
      // Item name line 2 (if exists)
      ...(line2 ? [`TEXT 4,52,"1",0,1,1,"${line2}"`] : []),
      'PRINT 1',
      ''
    ].join('\r\n');

    console.log('Sending TSPL:', tspl);
    await this.sendData(tspl);
    console.log(`Label printed: ${orderText} - ${cleanName}`);
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

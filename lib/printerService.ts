/**
 * Printer Service - Niimbot + Standard Thermal Printers
 *
 * Receipt Printer: Niimbot (Bluetooth) using niimbluelib
 * Kitchen Printer: Standard thermal (Bluetooth) using ESC/POS
 */

import { NiimbotBluetoothClient } from '@mmote/niimbluelib';
import { ImageEncoder } from '@mmote/niimbluelib';
import type { PrintOptions } from '@mmote/niimbluelib';

/**
 * Niimbot Receipt/Label Printer
 * Uses niimbluelib for proper protocol implementation
 */
export class NiimbotPrinter {
  private client: NiimbotBluetoothClient;
  private connected: boolean = false;

  constructor() {
    this.client = new NiimbotBluetoothClient();
    this.client.setDebug(true); // Enable debug logs for troubleshooting
  }

  /**
   * Pair and connect to Niimbot printer via Bluetooth
   */
  async connect(): Promise<any> {
    try {
      console.log('🔵 Connecting to Niimbot printer...');
      const result = await this.client.connect();

      if (result.result !== 1) {
        throw new Error(`Connection failed with code: ${result.result}`);
      }

      this.connected = true;
      console.log('✅ Connected to Niimbot:', result.deviceName);

      // Fetch printer info
      const info = await this.client.fetchPrinterInfo();
      console.log('📋 Printer info:', info);

      return { name: result.deviceName };
    } catch (err) {
      console.error('❌ Niimbot connection failed:', err);
      this.connected = false;
      throw err;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.client.isConnected();
  }

  /**
   * Disconnect from printer
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.connected = false;
      console.log('🔌 Disconnected from Niimbot');
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  }

  /**
   * Print text on label (converts text to image and prints)
   */
  async printText(text: string, density: number = 3): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer not connected');
    }

    try {
      console.log('🖨️ Niimbot: Printing text...', text);

      // Create canvas with text
      const canvas = this.textToCanvas(text);

      // Encode image for Niimbot
      const encodedImage = ImageEncoder.encodeCanvas(canvas, 'top');
      console.log(`📐 Encoded image: ${encodedImage.cols}x${encodedImage.rows}`);

      // Get print task type
      const printTaskType = this.client.getPrintTaskType();
      if (!printTaskType) {
        throw new Error('Could not determine print task type for this printer');
      }

      console.log('📝 Using print task:', printTaskType);

      // Create print task
      const printTask = this.client.abstraction.newPrintTask(printTaskType, {
        density: density,
        labelType: 1, // Gap label
        totalPages: 1,
      });

      // Execute print
      await printTask.printInit();
      await printTask.printPage(encodedImage, 1);
      await printTask.waitForFinished();
      await this.client.abstraction.printEnd();

      console.log('✅ Print complete!');
    } catch (err) {
      console.error('❌ Print failed:', err);
      throw err;
    }
  }

  /**
   * Print receipt (formatted text for customer receipt)
   */
  async printReceipt(order: any): Promise<void> {
    const text = this.formatReceipt(order);
    await this.printText(text, 3);
  }

  /**
   * Print kitchen stub (order summary for kitchen)
   */
  async printKitchenStub(order: any): Promise<void> {
    const text = this.formatKitchenStub(order);
    await this.printText(text, 3);
  }

  /**
   * Test print (simple test pattern)
   */
  async testPrint(): Promise<void> {
    const testText = `COFFEE OASIS\nTEST PRINT\n${new Date().toLocaleString()}`;
    await this.printText(testText, 3);
  }

  /**
   * Convert text to canvas image
   */
  private textToCanvas(text: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const width = 384;  // Niimbot B1 width (50mm @ 203 DPI)
    const height = 240; // Niimbot B1 height (30mm @ 203 DPI)

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Black text
    ctx.fillStyle = 'black';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';

    const lines = text.split('\n');
    const lineHeight = 24;
    const startY = (height - (lines.length * lineHeight)) / 2 + 20;

    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, startY + (i * lineHeight));
    });

    return canvas;
  }

  /**
   * Format receipt text
   */
  private formatReceipt(order: any): string {
    const lines: string[] = [];
    lines.push('COFFEE OASIS');
    lines.push('');
    lines.push(`Order #${order.id}`);
    lines.push(new Date(order.date_created).toLocaleString('en-MY'));
    lines.push('');

    order.line_items?.forEach((item: any) => {
      lines.push(`${item.quantity}x ${item.name}`);
      lines.push(`  RM ${item.total}`);
    });

    lines.push('');
    lines.push(`TOTAL: RM ${order.total}`);
    lines.push('');
    lines.push('Thank you!');

    return lines.join('\n');
  }

  /**
   * Format kitchen stub text
   */
  private formatKitchenStub(order: any): string {
    const lines: string[] = [];
    lines.push(`ORDER #${order.id}`);
    lines.push(new Date(order.date_created).toLocaleTimeString('en-MY'));
    lines.push('');

    order.line_items?.forEach((item: any) => {
      lines.push(`${item.quantity}x ${item.name}`);
    });

    return lines.join('\n');
  }
}

/**
 * Standard Thermal Printer (ESC/POS)
 * For kitchen orders - already working
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
  async testPrint(): Promise<void> {
    await this.sendCommand(new Uint8Array([0x1B, 0x40])); // Initialize
    await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold
    await this.sendCommand(new Uint8Array([0x1B, 0x61, 0x01])); // Center

    const encoder = new TextEncoder();
    await this.sendCommand(encoder.encode('KITCHEN PRINTER\n'));
    await this.sendCommand(encoder.encode('TEST PRINT\n'));
    await this.sendCommand(encoder.encode(`${new Date().toLocaleString()}\n`));

    await this.sendCommand(new Uint8Array([0x1B, 0x64, 0x03])); // Feed
    await this.sendCommand(new Uint8Array([0x1D, 0x56, 0x00])); // Cut

    console.log('✅ Test print complete');
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
  private receiptPrinter: NiimbotPrinter | null = null;
  private kitchenPrinter: ThermalPrinter | null = null;

  /**
   * Get receipt printer (Niimbot)
   */
  getReceiptPrinter(): NiimbotPrinter {
    if (!this.receiptPrinter) {
      this.receiptPrinter = new NiimbotPrinter();
    }
    return this.receiptPrinter;
  }

  /**
   * Get kitchen printer (Standard thermal)
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

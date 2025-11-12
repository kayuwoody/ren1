# Thermal Printer Integration Guide

**Last Updated:** Session 011CV322pbHjdvxk3YcqjKk6

## Overview

Coffee Oasis POS supports ESC/POS thermal printers via Web Bluetooth API for:
- Customer receipts (full itemized receipt with QR code)
- Kitchen stubs (order summary for prep)

**Key File:** `lib/printerService.ts`

---

## Technical Specifications

### Printer Protocol
- **Standard:** ESC/POS (Epson Standard Code for Point of Sale)
- **Connection:** Web Bluetooth API
- **Character Set:** ASCII only (no unicode/emojis)
- **Print Width:** 32 characters per line
- **Paper:** 58mm or 80mm thermal paper

### Bluetooth Configuration
- **Service UUID:** `000018f0-0000-1000-8000-00805f9b34fb`
- **Characteristic UUID:** `00002af1-0000-1000-8000-00805f9b34fb`
- **Pairing:** Accepts all devices, filters by service

---

## Architecture

### Classes

```typescript
// Main thermal printer class
class ThermalPrinter {
  private device: any;              // Bluetooth device
  private characteristic: any;       // GATT characteristic

  async pair(): Promise<any>         // Request bluetooth pairing
  async connect(device?): Promise<void> // Connect to paired device
  async printReceipt(order): Promise<void> // Print customer receipt
  async printKitchenStub(order): Promise<void> // Print kitchen stub
  async testPrint(label?): Promise<void> // Test print
  async disconnect(): Promise<void>  // Disconnect device

  private async sendCommand(data: Uint8Array): Promise<void>
  private async printQRCode(data: string): Promise<void>
  private stripIcons(text: string): string
  private getItemMeta(item: any, key: string): any
  private getOrderMeta(order: any, key: string): any
}

// Printer manager (singleton)
class PrinterManager {
  getReceiptPrinter(): ThermalPrinter
  getKitchenPrinter(): ThermalPrinter
  savePrinterConfig(type, deviceId): void
  getPrinterConfig(type): string | null
  isBluetoothSupported(): boolean
}

export const printerManager = new PrinterManager();
```

---

## Receipt Format

### Customer Receipt Structure

```
      COFFEE OASIS
      Receipt #453
   2025-11-12 8:41 AM

--------------------------------
1x Wake-Up Wonder
                      RM 10.00
  Student Discount     RM 8.00

  + Dark Mane Americano
  + Burnt Cheese Danish

--------------------------------
Total:                RM 10.00
Discount:              -RM 2.00
Subtotal:              RM 8.00
Tax (6% SST):           Waived
--------------------------------
TOTAL:                 RM 8.00

--------------------------------
DIGITAL RECEIPT
--------------------------------

Scan QR code to view your
receipt online

      [QR CODE IMAGE]

https://coffee-oasis.com.my/orders/453/receipt

--------------------------------

      Thank you!
    Come again soon!


[Cut paper]
```

### Kitchen Stub Structure

```
      ORDER #453
       8:41 AM

1x Wake-Up Wonder
  + Dark Mane Americano
  + Burnt Cheese Danish

1x Iced Latte
  + Espresso Shot


[Cut paper]
```

---

## Implementation Details

### 1. Icon Stripping (CRITICAL)

**Why:** Thermal printers only support ASCII. Unicode/emojis cause garbled output.

```typescript
private stripIcons(text: string): string {
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
```

**Applied to:**
- Product names: `this.stripIcons(displayName)`
- Component names: `this.stripIcons(component.productName)`
- Discount reasons: `this.stripIcons(discountReason)`

### 2. Price Alignment

**Problem:** Long product names push prices off alignment on single line.

**Solution:** Print prices on separate lines, right-aligned.

```typescript
// Print item name
await this.sendCommand(encoder.encode(`${item.quantity}x ${displayName}\n`));

// Price on next line, right-aligned
if (hasDiscount) {
  // Original price, right-aligned
  const originalPriceStr = `RM ${originalPrice.toFixed(2)}`;
  const spaces = ' '.repeat(32 - originalPriceStr.length);
  await this.sendCommand(encoder.encode(`${spaces}${originalPriceStr}\n`));

  // Discount label + final price
  const discountLabel = `  ${this.stripIcons(discountReason || 'Discount')}`;
  const finalPriceStr = `RM ${finalPrice.toFixed(2)}`;
  const padding = Math.max(1, 32 - discountLabel.length - finalPriceStr.length);
  await this.sendCommand(encoder.encode(`${discountLabel}${' '.repeat(padding)}${finalPriceStr}\n`));
} else {
  // No discount, simple right-aligned price
  const itemPrice = `RM ${finalPrice.toFixed(2)}`;
  await this.sendCommand(encoder.encode(`${' '.repeat(32 - itemPrice.length)}${itemPrice}\n`));
}
```

### 3. Bundle Components

**Read from order metadata** (no API calls):

```typescript
const isBundle = this.getItemMeta(item, '_is_bundle') === 'true';
const bundleComponents = this.getItemMeta(item, '_bundle_components');

if (isBundle && bundleComponents) {
  const components = typeof bundleComponents === 'string'
    ? JSON.parse(bundleComponents)
    : bundleComponents;

  if (Array.isArray(components) && components.length > 0) {
    for (const component of components) {
      // IMPORTANT: Use productName property, not name
      const componentName = this.stripIcons(component.productName || component.name || 'Unknown');
      await this.sendCommand(encoder.encode(`  + ${componentName}\n`));
    }
  }
}
```

### 4. Totals Section

```typescript
const finalTotal = parseFloat(order.total);
const totalDiscount = this.getOrderMeta(order, '_total_discount');
const discountAmount = totalDiscount ? parseFloat(totalDiscount) : 0;
const totalBeforeDiscount = finalTotal + discountAmount;

// Helper for right alignment
const alignRight = (label: string, value: string, width: number = 32): string => {
  const line = `${label}${value}`;
  const padding = width - line.length;
  return `${label}${' '.repeat(Math.max(1, padding))}${value}`;
};

// Print in order
await this.sendCommand(encoder.encode(alignRight('Total:', `RM ${totalBeforeDiscount.toFixed(2)}`) + '\n'));
if (discountAmount > 0) {
  await this.sendCommand(encoder.encode(alignRight('Discount:', `-RM ${discountAmount.toFixed(2)}`) + '\n'));
}
await this.sendCommand(encoder.encode(alignRight('Subtotal:', `RM ${finalTotal.toFixed(2)}`) + '\n'));
await this.sendCommand(encoder.encode(alignRight('Tax (6% SST):', 'Waived') + '\n'));

// Bold TOTAL
await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x01])); // Bold ON
await this.sendCommand(encoder.encode(alignRight('TOTAL:', `RM ${finalTotal.toFixed(2)}`) + '\n\n'));
await this.sendCommand(new Uint8Array([0x1B, 0x45, 0x00])); // Bold OFF
```

### 5. QR Code Generation

**Format:** ESC/POS QR code commands (native printer support).

```typescript
private async printQRCode(data: string): Promise<void> {
  const encoder = new TextEncoder();
  const qrData = encoder.encode(data);
  const qrLength = qrData.length;

  // QR Model 2
  await this.sendCommand(new Uint8Array([
    0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00
  ]));

  // QR Size 6
  await this.sendCommand(new Uint8Array([
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06
  ]));

  // Error Correction M
  await this.sendCommand(new Uint8Array([
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31
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
```

**Usage:**
```typescript
const receiptUrl = `https://coffee-oasis.com.my/orders/${order.id}/receipt`;
await this.printQRCode(receiptUrl);
```

**Note:** Always use production domain, even in development. Receipt URLs must be publicly accessible.

---

## ESC/POS Command Reference

### Basic Commands

```typescript
// Initialize printer
new Uint8Array([0x1B, 0x40])  // ESC @

// Text formatting
new Uint8Array([0x1B, 0x45, 0x01])  // Bold ON
new Uint8Array([0x1B, 0x45, 0x00])  // Bold OFF

// Alignment
new Uint8Array([0x1B, 0x61, 0x00])  // Left
new Uint8Array([0x1B, 0x61, 0x01])  // Center
new Uint8Array([0x1B, 0x61, 0x02])  // Right

// Paper handling
new Uint8Array([0x1B, 0x64, 0x03])  // Feed 3 lines
new Uint8Array([0x1D, 0x56, 0x00])  // Cut paper (full cut)
new Uint8Array([0x1D, 0x56, 0x01])  // Cut paper (partial cut)
```

### Command Delays

```typescript
await this.characteristic.writeValue(data);
await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
```

**Why:** Thermal printers need time to process commands. Always add delay after write.

---

## Usage in Components

### CashPayment Component

```typescript
import { printerManager } from '@/lib/printerService';

const printer = printerManager.getReceiptPrinter();
const kitchenPrinter = printerManager.getKitchenPrinter();

// Print receipt
const handlePrintReceipt = async () => {
  setPrinting(true);
  try {
    const savedDeviceId = printerManager.getPrinterConfig('receipt');
    if (savedDeviceId) {
      await printer.connect();
    } else {
      const device = await printer.pair();
      await printer.connect(device);
      printerManager.savePrinterConfig('receipt', device.id);
    }
    await printer.printReceipt(order);
  } catch (error) {
    console.error('Print failed:', error);
  } finally {
    setPrinting(false);
  }
};

// Print kitchen stub
const handlePrintKitchen = async () => {
  // Similar to receipt...
  await kitchenPrinter.printKitchenStub(order);
};
```

### Payment Flow

1. User confirms payment
2. Order status updated to `processing`
3. **Auto-open PDF receipt** in new tab: `window.open(\`/orders/${orderID}/receipt\`, '_blank')`
4. Show success message: "PDF receipt generated"
5. **Optional:** Thermal print buttons (receipt + kitchen)
6. Continue to next order

---

## Order Metadata Requirements

### Line Item Metadata

Receipt printing requires these metadata fields on order line items:

```typescript
// Bundle detection
_is_bundle: "true" | "false"
_bundle_display_name: string      // e.g., "Wake-Up Wonder"
_bundle_components: string        // JSON array of { productName, quantity }

// Pricing
_retail_price: string             // Original price (RM 10.00)
_final_price: string              // After discount (RM 8.00)
_discount_reason: string          // e.g., "Student Discount"
```

### Order-Level Metadata

```typescript
_total_discount: string           // Total discount amount (RM 2.00)
```

---

## Common Issues & Solutions

### 1. Garbled Characters

**Symptom:** Random symbols/boxes on receipt
**Cause:** Unicode characters (emojis, special symbols)
**Solution:** Use `stripIcons()` on all printed text

### 2. Misaligned Prices

**Symptom:** Prices not lining up on right side
**Cause:** Long product names, variable spacing
**Solution:** Print prices on separate lines with fixed width padding

### 3. Bundle Components Show "undefined"

**Symptom:** "+ undefined" for combo items
**Cause:** Wrong property name (`component.name` vs `component.productName`)
**Solution:** Use `component.productName || component.name || 'Unknown'`

### 4. QR Code Not Scanning

**Symptom:** QR code prints but won't scan
**Cause:** Incorrect data length in command, or URL too long
**Solution:** Keep URLs concise, verify pL/pH length bytes

### 5. Bluetooth Connection Lost

**Symptom:** Print fails after first receipt
**Cause:** Device disconnected, characteristic not initialized
**Solution:** Check `device.gatt.connected` before printing, reconnect if needed

### 6. Receipt URL 404

**Symptom:** QR code scans but receipt page not found
**Cause:** Using localhost URL, order not synced
**Solution:** Always use production domain (`coffee-oasis.com.my`), verify order exists

---

## Testing Checklist

- [ ] Icon stripping: Print receipt with emoji products (e.g., "☕ Latte")
- [ ] Price alignment: Print receipt with long product names
- [ ] Bundle components: Print combo order (e.g., Wake-Up Wonder)
- [ ] Discount display: Print order with discount applied
- [ ] QR code: Scan QR code on printed receipt, verify URL works
- [ ] Tax line: Verify "Tax (6% SST): Waived" appears
- [ ] Kitchen stub: Print kitchen order, verify components show
- [ ] Connection: Disconnect bluetooth, verify reconnect works
- [ ] Paper cut: Verify clean cut at end of receipt

---

## Future Enhancements

1. **e-Invoice QR Code**: When LHDN account ready, replace receipt URL with e-Invoice platform link
2. **Tax Calculation**: Update tax line when SST applies (currently waived)
3. **Logo Printing**: Add ESC/POS logo command for branding
4. **Multiple Receipts**: Batch print for multiple orders
5. **Print Preview**: Show receipt preview before printing (optional)

---

## References

- **ESC/POS Commands:** [Epson ESC/POS Command Manual](https://reference.epson-biz.com/modules/ref_escpos/index.php)
- **Web Bluetooth API:** [MDN Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- **QR Code Format:** [ESC/POS QR Code Commands](https://reference.epson-biz.com/modules/ref_escpos/index.php?content_id=140)

---

**For implementation questions or issues, consult:**
- `lib/printerService.ts` - Full implementation
- `components/CashPayment.tsx` - Usage example
- User feedback from previous sessions (documented in AI_ASSISTANT_GUIDE.md)

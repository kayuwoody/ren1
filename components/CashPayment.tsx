"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Printer, Bluetooth, Receipt } from "lucide-react";
import { printerManager } from "@/lib/printerService";

interface CashPaymentProps {
  orderID: number;
  amount: string;
  currency?: string;
  paymentMethod?: "cash" | "bank_qr";
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Cash Payment Component
 *
 * Handles cash and local bank QR code payments.
 * Staff confirms payment received, then order is marked as paid.
 *
 * @example
 * ```tsx
 * <CashPayment
 *   orderID={12345}
 *   amount="25.50"
 *   paymentMethod="cash"
 *   onSuccess={() => router.push('/order-complete')}
 * />
 * ```
 */
export default function CashPayment({
  orderID,
  amount,
  currency = "MYR",
  paymentMethod = "cash",
  onSuccess,
  onCancel,
}: CashPaymentProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [printing, setPrinting] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);

  useEffect(() => {
    setBluetoothSupported(printerManager.isBluetoothSupported());

    // Auto-reconnect to previously paired printers
    if (printerManager.isBluetoothSupported()) {
      printerManager.autoReconnect().then(devices => {
        if (devices.receipt) {
          console.log('✅ Receipt printer available for printing');
        }
        if (devices.kitchen) {
          console.log('✅ Kitchen printer available for printing');
        }
      });
    }
  }, []);

  const confirmPayment = async () => {
    setConfirming(true);
    setError(null);

    try {
      // Update order status to processing (payment received)
      const response = await fetch(`/api/update-order/${orderID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "processing",
          meta_data: [
            { key: "_payment_method", value: paymentMethod },
            { key: "_payment_method_title", value: paymentMethod === "cash" ? "Cash" : "Bank QR" },
            { key: "_paid_date", value: new Date().toISOString() },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order status");
      }

      const updatedOrder = await response.json();
      setOrder(updatedOrder);
      setPaymentConfirmed(true);

      // Generate static receipt and upload to hosting
      fetch('/api/receipts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderID }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            console.log(`✅ Static receipt generated: ${data.receiptUrl}`);
            // Open the static receipt
            window.open(data.receiptUrl, '_blank');
          }
        })
        .catch(err => console.error('Failed to generate static receipt:', err));

      console.log(`✅ Order #${orderID} marked as paid (${paymentMethod})`);
    } catch (err: any) {
      console.error("Failed to confirm payment:", err);
      setError(err.message || "Failed to confirm payment");
    } finally {
      setConfirming(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!order) return;

    setPrinting(true);
    try {
      const printer = printerManager.getReceiptPrinter();

      // Try to get cached device from auto-reconnect
      let device = printerManager.getCachedDevice('receipt');

      if (!device) {
        // No cached device, prompt to pair
        device = await printer.pair();
        printerManager.savePrinterConfig('receipt', device.id, device.name || 'Receipt Printer');
        printerManager.setCachedDevice('receipt', device);
      }

      await printer.connect(device);
      await printer.printReceipt(order);

      alert('Receipt printed successfully!');
    } catch (err: any) {
      console.error('Failed to print receipt:', err);
      alert(`Failed to print receipt: ${err.message}\n\nTip: Go to Admin > Printers to pair your printer first.`);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintKitchen = async () => {
    if (!order) return;

    setPrinting(true);
    try {
      const printer = printerManager.getKitchenPrinter();

      // Try to get cached device from auto-reconnect
      let device = printerManager.getCachedDevice('kitchen');

      if (!device) {
        // No cached device, prompt to pair
        device = await printer.pair();
        printerManager.savePrinterConfig('kitchen', device.id, device.name || 'Kitchen Printer');
        printerManager.setCachedDevice('kitchen', device);
      }

      await printer.connect(device);
      await printer.printKitchenStub(order);

      alert('Kitchen stub printed successfully!');
    } catch (err: any) {
      console.error('Failed to print kitchen stub:', err);
      alert(`Failed to print kitchen stub: ${err.message}\n\nTip: Go to Admin > Printers to pair your printer first.`);
    } finally {
      setPrinting(false);
    }
  };

  const handleContinue = () => {
    onSuccess?.();
  };

  const handleCancel = () => {
    if (confirm("Cancel this payment?")) {
      onCancel?.();
    }
  };

  // Show success screen with print options after payment confirmed
  if (paymentConfirmed && order) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Success Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Confirmed!
          </h2>
          <p className="text-gray-600">Order #{orderID} sent to kitchen</p>
          <p className="text-sm text-green-600 mt-2">
            PDF receipt generated
          </p>
        </div>

        {/* Bluetooth Print Options */}
        {bluetoothSupported && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3 text-center">
              Print on Thermal Printer? (Optional)
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrintReceipt}
                disabled={printing}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors text-sm"
              >
                <Bluetooth className="w-4 h-4" />
                {printing ? 'Printing...' : 'Print Receipt'}
              </button>
              <button
                onClick={handlePrintKitchen}
                disabled={printing}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition-colors text-sm"
              >
                <Receipt className="w-4 h-4" />
                {printing ? 'Printing...' : 'Print Kitchen'}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Thermal printing is optional. Click continue to proceed.
            </p>
          </div>
        )}

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
        >
          Continue to Next Order →
        </button>

        {/* Info */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600 text-center">
            <p>Order is now being prepared</p>
            <p className="text-xs mt-1">
              Customer can track status at /orders/{orderID}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show payment confirmation screen (before payment)
  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {paymentMethod === "cash" ? "💵 Cash Payment" : "📱 Bank QR Payment"}
        </h2>
        <p className="text-gray-600">Order #{orderID}</p>
      </div>

      {/* Amount */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Amount to Collect</p>
        <p className="text-4xl font-bold text-gray-900">
          {currency} {amount}
        </p>
      </div>

      {/* Instructions */}
      {paymentMethod === "cash" ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-2">
            Cash Payment Steps:
          </p>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Collect {currency} {amount} from customer</li>
            <li>Give change if needed</li>
            <li>Click "Confirm Payment Received" below</li>
            <li>Order will be sent to kitchen</li>
          </ol>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-2">
            Bank QR Payment Steps:
          </p>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Show customer the store's bank QR code</li>
            <li>Customer scans and pays {currency} {amount}</li>
            <li>Verify payment received on bank app</li>
            <li>Click "Confirm Payment Received" below</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3">
            💡 Tip: Keep the physical QR code displayed at the counter
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={confirmPayment}
          disabled={confirming}
          className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
        >
          {confirming ? "Confirming..." : "✓ Confirm Payment Received"}
        </button>

        <button
          onClick={handleCancel}
          disabled={confirming}
          className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors"
        >
          Cancel Order
        </button>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Payment Method:</span>
          <span className="font-medium">
            {paymentMethod === "cash" ? "Cash" : "Bank Transfer (QR)"}
          </span>
        </div>
      </div>
    </div>
  );
}

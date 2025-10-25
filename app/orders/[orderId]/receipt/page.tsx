'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Printer, Bluetooth } from 'lucide-react';
import { printerManager } from '@/lib/printerService';

export default function ReceiptPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    fetch(`/api/orders/${orderId}`)
      .then(res => res.json())
      .then(data => {
        setOrder(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch order:', err);
        setLoading(false);
      });
  }, [orderId]);

  useEffect(() => {
    setBluetoothSupported(printerManager.isBluetoothSupported());
  }, []);

  const handleBluetoothPrint = async () => {
    if (!order) return;

    setPrinting(true);
    try {
      const printer = printerManager.getReceiptPrinter();

      // Try to connect to saved printer or pair a new one
      const savedDeviceId = printerManager.getPrinterConfig('receipt');
      if (!savedDeviceId) {
        // No saved printer, prompt to pair
        await printer.pair();
      }

      await printer.connect();
      await printer.printReceipt(order);

      alert('Receipt printed successfully!');
    } catch (err: any) {
      console.error('Failed to print:', err);
      alert(`Failed to print: ${err.message}`);
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading receipt...</div>;
  }

  if (!order) {
    return <div className="p-4">Order not found</div>;
  }

  const orderDate = order.date_created ? new Date(order.date_created) : new Date();
  const formattedDate = orderDate.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        {/* Print buttons */}
        <div className="mb-4 no-print space-y-2">
          {/* Browser print */}
          <button
            onClick={() => window.print()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Receipt (Browser)
          </button>

          {/* Bluetooth print */}
          {bluetoothSupported && (
            <button
              onClick={handleBluetoothPrint}
              disabled={printing}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Bluetooth className="w-5 h-5" />
              {printing ? 'Printing...' : 'Print to Bluetooth Printer'}
            </button>
          )}
        </div>

        {/* Receipt */}
        <div className="bg-white shadow-lg rounded-lg p-8 print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="text-center mb-6 border-b pb-4">
            <h1 className="text-2xl font-bold">Coffee Oasis</h1>
            <p className="text-sm text-gray-600">Smart Locker Coffee Shop</p>
            <p className="text-xs text-gray-500 mt-1">coffee-oasis.com.my</p>
          </div>

          {/* Order Info */}
          <div className="mb-6 border-b pb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Order Number:</span>
              <span className="font-semibold">#{order.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Date:</span>
              <span className="font-semibold">{formattedDate}</span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-center py-2">Qty</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.line_items?.map((item: any) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.name}</td>
                    <td className="text-center">{item.quantity}</td>
                    <td className="text-right">RM {parseFloat(item.price).toFixed(2)}</td>
                    <td className="text-right font-semibold">RM {item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span>RM {order.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax:</span>
              <span>RM 0.00</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total:</span>
              <span>RM {order.total}</span>
            </div>
          </div>

          {/* Payment Status */}
          <div className="mt-6 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Payment Method:</span>
              <span className="font-semibold">Simulated Payment</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Status:</span>
              <span className={`font-semibold ${
                order.status === 'completed' ? 'text-green-600' : 'text-blue-600'
              }`}>
                {order.status === 'completed' ? 'PAID' : order.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
            <p className="mb-1">Thank you for your purchase!</p>
            <p>Your order will be ready soon.</p>
            {order.status === 'ready-for-pickup' && order.meta_data?.find((m: any) => m.key === '_locker_number') && (
              <p className="mt-2 font-semibold text-gray-700">
                Locker: {order.meta_data.find((m: any) => m.key === '_locker_number')?.value}
              </p>
            )}
          </div>
        </div>

        {/* Back button */}
        <div className="mt-4 no-print">
          <a
            href={`/orders/${orderId}`}
            className="block w-full text-center bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition"
          >
            Back to Order
          </a>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5cm;
          }
        }
      `}</style>
    </div>
  );
}

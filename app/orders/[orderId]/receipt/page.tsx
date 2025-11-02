'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Printer, Bluetooth, Share2, Mail, MessageCircle, Star } from 'lucide-react';
import QRCode from 'react-qr-code';
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

  const handleShareWhatsApp = () => {
    const receiptUrl = window.location.href;
    const message = `Coffee Oasis Receipt\nOrder #${order.id}\nTotal: RM ${order.total}\n\nView receipt: ${receiptUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShareEmail = () => {
    if (!order) return;
    const receiptUrl = window.location.href;
    const orderDate = order.date_created ? new Date(order.date_created) : new Date();
    const formattedDate = orderDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const subject = `Coffee Oasis Receipt - Order #${order.id}`;
    const body = `Thank you for your purchase!\n\nOrder Number: #${order.id}\nDate: ${formattedDate}\nTotal: RM ${order.total}\n\nView your receipt: ${receiptUrl}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Coffee Oasis Receipt #${order.id}`,
          text: `Order #${order.id} - Total: RM ${order.total}`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
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

  // Extract discount information from order metadata
  const getItemMeta = (item: any, key: string) => {
    return item.meta_data?.find((m: any) => m.key === key)?.value;
  };

  const getOrderMeta = (key: string) => {
    return order.meta_data?.find((m: any) => m.key === key)?.value;
  };

  const retailTotal = parseFloat(getOrderMeta('_retail_total') || order.total);
  const finalTotal = parseFloat(getOrderMeta('_final_total') || order.total);
  const totalDiscount = parseFloat(getOrderMeta('_total_discount') || '0');

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-gray-50 p-4">
      <div className="max-w-md mx-auto">
        {/* Action buttons */}
        <div className="mb-4 no-print space-y-2">
          {/* Print buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 text-sm"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>

            {bluetoothSupported && (
              <button
                onClick={handleBluetoothPrint}
                disabled={printing}
                className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
              >
                <Bluetooth className="w-4 h-4" />
                {printing ? 'Printing...' : 'Bluetooth'}
              </button>
            )}
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-3 gap-2">
            {(typeof navigator !== 'undefined' && 'share' in navigator) && (
              <button
                onClick={handleNativeShare}
                className="bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-1 text-xs"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            )}
            <button
              onClick={handleShareWhatsApp}
              className="bg-emerald-600 text-white py-2 px-3 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-1 text-xs"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </button>
            <button
              onClick={handleShareEmail}
              className="bg-gray-600 text-white py-2 px-3 rounded-lg hover:bg-gray-700 transition flex items-center justify-center gap-1 text-xs"
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
          </div>
        </div>

        {/* Receipt */}
        <div className="bg-white shadow-lg rounded-lg p-8 print:shadow-none print:rounded-none">
          {/* Header with Logo */}
          <div className="text-center mb-6 border-b-2 border-amber-600 pb-4">
            <div className="mb-3">
              {/* Logo placeholder - you can replace with actual logo */}
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-600 to-amber-800 rounded-full mb-2">
                <span className="text-2xl text-white">☕</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">Coffee Oasis</h1>
            <p className="text-sm text-amber-700 font-medium">Smart Locker Coffee Shop</p>
            <p className="text-xs text-gray-500 mt-1">📍 Malaysia | 🌐 coffee-oasis.com.my</p>
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
                {order.line_items?.map((item: any) => {
                  const retailPrice = parseFloat(getItemMeta(item, '_retail_price') || item.price);
                  const finalPrice = parseFloat(getItemMeta(item, '_final_price') || item.price);
                  const discountReason = getItemMeta(item, '_discount_reason');
                  const hasDiscount = retailPrice > finalPrice;
                  const itemRetailTotal = retailPrice * item.quantity;
                  const itemFinalTotal = finalPrice * item.quantity;

                  return (
                    <tr key={item.id} className="border-b">
                      <td className="py-3">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {discountReason && (
                            <div className="text-xs text-green-600 mt-1">• {discountReason}</div>
                          )}
                        </div>
                      </td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-right">
                        {hasDiscount ? (
                          <div>
                            <div className="text-xs text-gray-400 line-through">RM {retailPrice.toFixed(2)}</div>
                            <div className="text-green-600 font-medium">RM {finalPrice.toFixed(2)}</div>
                          </div>
                        ) : (
                          <div>RM {finalPrice.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="text-right font-semibold">
                        {hasDiscount ? (
                          <div>
                            <div className="text-xs text-gray-400 line-through">RM {itemRetailTotal.toFixed(2)}</div>
                            <div className="text-green-600">RM {itemFinalTotal.toFixed(2)}</div>
                          </div>
                        ) : (
                          <div>RM {itemFinalTotal.toFixed(2)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 space-y-2">
            {totalDiscount > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Retail Total:</span>
                  <span className="line-through text-gray-500">RM {retailTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm bg-green-50 px-2 py-1 rounded">
                  <span className="text-green-700 font-semibold">Discount:</span>
                  <span className="text-green-700 font-semibold">-RM {totalDiscount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span>RM {finalTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax:</span>
              <span>RM 0.00</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total Paid:</span>
              <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-center text-amber-900 font-semibold text-sm">
                  🎉 You saved RM {totalDiscount.toFixed(2)}!
                </p>
              </div>
            )}
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

          {/* QR Code & Footer */}
          <div className="mt-8 pt-6 border-t-2 border-gray-200">
            <div className="flex flex-col items-center space-y-4">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                <QRCode
                  value={typeof window !== 'undefined' ? window.location.href : ''}
                  size={120}
                  level="M"
                />
                <p className="text-xs text-center text-gray-500 mt-2">Scan to view receipt</p>
              </div>

              {/* Locker info */}
              {order.status === 'ready-for-pickup' && order.meta_data?.find((m: any) => m.key === '_locker_number') && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 w-full">
                  <p className="text-sm text-center font-bold text-amber-900">
                    🔒 Locker Number: {order.meta_data.find((m: any) => m.key === '_locker_number')?.value}
                  </p>
                </div>
              )}

              {/* Thank you message */}
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800 mb-1">Thank you for your purchase!</p>
                <p className="text-sm text-gray-600">Your order will be ready soon.</p>
              </div>

              {/* Feedback link */}
              <a
                href={`/feedback?order=${order.id}`}
                className="no-print flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-full transition text-sm font-medium"
              >
                <Star className="w-4 h-4" />
                Rate Your Experience
              </a>

              {/* Contact info */}
              <div className="text-center text-xs text-gray-500 pt-2 border-t border-gray-200 w-full">
                <p>Questions? Contact us at support@coffee-oasis.com.my</p>
                <p className="mt-1">📞 +60 12-345-6789</p>
              </div>
            </div>
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

        /* Mobile optimizations */
        @media (max-width: 640px) {
          .receipt-container {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

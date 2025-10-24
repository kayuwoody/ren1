'use client';

import { useState, useEffect } from 'react';
import { Printer, CheckCircle, XCircle, Bluetooth } from 'lucide-react';
import { printerManager, ThermalPrinter } from '@/lib/printerService';

export default function PrintersAdminPage() {
  const [receiptPrinter, setReceiptPrinter] = useState<BluetoothDevice | null>(null);
  const [kitchenPrinter, setKitchenPrinter] = useState<BluetoothDevice | null>(null);
  const [bluetoothSupported, setBluetoothSupported] = useState(true);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    setBluetoothSupported(printerManager.isBluetoothSupported());
  }, []);

  const handlePairReceiptPrinter = async () => {
    try {
      const printer = printerManager.getReceiptPrinter();
      const device = await printer.pair();
      setReceiptPrinter(device);
      printerManager.savePrinterConfig('receipt', device.id);
      alert(`Receipt printer paired: ${device.name}`);
    } catch (err) {
      alert('Failed to pair receipt printer');
    }
  };

  const handlePairKitchenPrinter = async () => {
    try {
      const printer = printerManager.getKitchenPrinter();
      const device = await printer.pair();
      setKitchenPrinter(device);
      printerManager.savePrinterConfig('kitchen', device.id);
      alert(`Kitchen printer paired: ${device.name}`);
    } catch (err) {
      alert('Failed to pair kitchen printer');
    }
  };

  const handleTestReceiptPrint = async () => {
    setTestResult('Printing test receipt...');
    try {
      const printer = printerManager.getReceiptPrinter();
      await printer.connect(receiptPrinter || undefined);

      const testOrder = {
        id: 'TEST',
        date_created: new Date().toISOString(),
        line_items: [
          { name: 'Test Coffee', quantity: 1, total: '5.00' },
          { name: 'Test Pastry', quantity: 2, total: '8.00' },
        ],
        total: '13.00'
      };

      await printer.printReceipt(testOrder);
      setTestResult('✅ Receipt printed successfully!');
    } catch (err: any) {
      setTestResult(`❌ Failed: ${err.message}`);
    }
  };

  const handleTestKitchenPrint = async () => {
    setTestResult('Printing test kitchen stub...');
    try {
      const printer = printerManager.getKitchenPrinter();
      await printer.connect(kitchenPrinter || undefined);

      const testOrder = {
        id: 'TEST',
        date_created: new Date().toISOString(),
        line_items: [
          { name: 'Espresso', quantity: 2 },
          { name: 'Cappuccino', quantity: 1 },
          { name: 'Croissant', quantity: 3 },
        ],
      };

      await printer.printKitchenStub(testOrder);
      setTestResult('✅ Kitchen stub printed successfully!');
    } catch (err: any) {
      setTestResult(`❌ Failed: ${err.message}`);
    }
  };

  if (!bluetoothSupported) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Printer Setup</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            ⚠️ Web Bluetooth is not supported in this browser.
          </p>
          <p className="text-sm text-yellow-700 mt-2">
            Please use Chrome, Edge, or Opera to configure bluetooth printers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Printer Setup</h1>
        <p className="text-gray-600">Configure bluetooth thermal printers for receipts and kitchen orders</p>
      </div>

      {/* Receipt Printer */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Printer className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Receipt Printer</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Status:</p>
              <p className="font-semibold">
                {receiptPrinter ? (
                  <span className="text-green-600 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {receiptPrinter.name || 'Paired'}
                  </span>
                ) : (
                  <span className="text-gray-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Not paired
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePairReceiptPrinter}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Bluetooth className="w-4 h-4" />
                {receiptPrinter ? 'Re-pair' : 'Pair Printer'}
              </button>

              {receiptPrinter && (
                <button
                  onClick={handleTestReceiptPrint}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Test Print
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Used for customer receipts at POS. Prints full receipt with items, prices, and totals.
          </p>
        </div>
      </div>

      {/* Kitchen Printer */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Printer className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-semibold">Kitchen Printer</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Status:</p>
              <p className="font-semibold">
                {kitchenPrinter ? (
                  <span className="text-green-600 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {kitchenPrinter.name || 'Paired'}
                  </span>
                ) : (
                  <span className="text-gray-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Not paired
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePairKitchenPrinter}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
              >
                <Bluetooth className="w-4 h-4" />
                {kitchenPrinter ? 'Re-pair' : 'Pair Printer'}
              </button>

              {kitchenPrinter && (
                <button
                  onClick={handleTestKitchenPrint}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Test Print
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Auto-prints when orders are placed. Prints simplified stub with order items and quantities.
          </p>
        </div>
      </div>

      {/* Test Results */}
      {testResult && (
        <div className={`rounded-lg p-4 ${
          testResult.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {testResult}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Setup Instructions:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Turn on your bluetooth thermal printer</li>
          <li>Click "Pair Printer" and select your printer from the list</li>
          <li>Click "Test Print" to verify the printer works</li>
          <li>Repeat for both receipt and kitchen printers</li>
        </ol>
        <p className="text-xs text-blue-700 mt-3">
          Note: Printers must support ESC/POS commands (most thermal printers do).
        </p>
      </div>
    </div>
  );
}

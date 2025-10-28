'use client';

import { useState, useEffect } from 'react';
import { Printer, CheckCircle, XCircle, Bluetooth, Clock, AlertCircle, FileText } from 'lucide-react';
import { printerManager, NiimbotPrinter, ThermalPrinter } from '@/lib/printerService';

interface PrintLog {
  id: string;
  type: 'receipt' | 'kitchen';
  orderId: string;
  timestamp: string;
  status: 'success' | 'failed';
  error?: string;
}

export default function PrintersAdminPage() {
  const [receiptPrinter, setReceiptPrinter] = useState<any>(null);
  const [kitchenPrinter, setKitchenPrinter] = useState<any>(null);
  const [bluetoothSupported, setBluetoothSupported] = useState(true);
  const [testResult, setTestResult] = useState<string>('');
  const [printLogs, setPrintLogs] = useState<PrintLog[]>([]);
  const [lastReceiptPrint, setLastReceiptPrint] = useState<string>('');
  const [lastKitchenPrint, setLastKitchenPrint] = useState<string>('');

  useEffect(() => {
    setBluetoothSupported(printerManager.isBluetoothSupported());

    // Load print logs from localStorage
    const logs = localStorage.getItem('printer_logs');
    if (logs) {
      try {
        setPrintLogs(JSON.parse(logs));
      } catch (e) {
        // ignore
      }
    }

    // Load last print times
    setLastReceiptPrint(localStorage.getItem('last_receipt_print') || '');
    setLastKitchenPrint(localStorage.getItem('last_kitchen_print') || '');
  }, []);

  const addPrintLog = (log: Omit<PrintLog, 'id' | 'timestamp'>) => {
    const newLog: PrintLog = {
      ...log,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };

    const updatedLogs = [newLog, ...printLogs].slice(0, 50); // Keep last 50
    setPrintLogs(updatedLogs);
    localStorage.setItem('printer_logs', JSON.stringify(updatedLogs));

    // Update last print time
    const time = new Date().toISOString();
    if (log.type === 'receipt') {
      setLastReceiptPrint(time);
      localStorage.setItem('last_receipt_print', time);
    } else if (log.type === 'kitchen') {
      setLastKitchenPrint(time);
      localStorage.setItem('last_kitchen_print', time);
    }
  };

  const handlePairReceiptPrinter = async () => {
    try {
      const printer = printerManager.getReceiptPrinter();
      const device = await printer.connect();
      setReceiptPrinter(device);
      printerManager.savePrinterConfig('receipt', device.name || 'Niimbot');
      alert(`Receipt printer connected: ${device.name}`);
    } catch (err: any) {
      console.error('Receipt printer error:', err);
      alert(`Failed to connect receipt printer: ${err.message}`);
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
    setTestResult('Printing test label on Niimbot...');
    try {
      const printer = printerManager.getReceiptPrinter();

      if (!printer.isConnected()) {
        throw new Error('Printer not connected. Please connect first.');
      }

      await printer.testPrint();
      setTestResult('✅ Test label printed successfully!');

      addPrintLog({
        type: 'receipt',
        orderId: 'TEST',
        status: 'success',
      });
    } catch (err: any) {
      setTestResult(`❌ Failed: ${err.message}`);

      addPrintLog({
        type: 'receipt',
        orderId: 'TEST',
        status: 'failed',
        error: err.message,
      });
    }
  };

  const handleTestKitchenPrint = async () => {
    setTestResult('Printing test kitchen stub...');
    try {
      const printer = printerManager.getKitchenPrinter();

      if (!kitchenPrinter) {
        throw new Error('Kitchen printer not paired. Please pair first.');
      }

      await printer.connect(kitchenPrinter);

      await printer.testPrint();
      setTestResult('✅ Kitchen test printed successfully!');

      addPrintLog({
        type: 'kitchen',
        orderId: 'TEST',
        status: 'success',
      });
    } catch (err: any) {
      setTestResult(`❌ Failed: ${err.message}`);

      addPrintLog({
        type: 'kitchen',
        orderId: 'TEST',
        status: 'failed',
        error: err.message,
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString('en-MY', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
          <div className="grid grid-cols-2 gap-4">
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

            <div>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last Print:
              </p>
              <p className="text-sm font-medium text-gray-800">
                {formatTimestamp(lastReceiptPrint)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">

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
            Niimbot label printer for customer receipts and order labels. Bluetooth connection using niimbluelib.
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
          <div className="grid grid-cols-2 gap-4">
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

            <div>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last Print:
              </p>
              <p className="text-sm font-medium text-gray-800">
                {formatTimestamp(lastKitchenPrint)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">

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

      {/* Print Logs */}
      {printLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold">Print History</h2>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {printLogs.map((log) => (
              <div
                key={log.id}
                className={`border-l-4 p-3 rounded ${
                  log.status === 'success'
                    ? 'border-green-500 bg-green-50'
                    : 'border-red-500 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Printer
                      className={`w-4 h-4 ${
                        log.type === 'receipt' ? 'text-blue-600' : 'text-purple-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {log.type === 'receipt' ? 'Receipt' : 'Kitchen'} -{' '}
                        Order #{log.orderId}
                      </p>
                      {log.error && (
                        <p className="text-xs text-red-700 mt-1">
                          Error: {log.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {formatTimestamp(log.timestamp)}
                    </p>
                    {log.status === 'success' ? (
                      <p className="text-xs text-green-700 font-medium">Success</p>
                    ) : (
                      <p className="text-xs text-red-700 font-medium">Failed</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Troubleshooting */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Troubleshooting
        </h3>
        <div className="space-y-2 text-sm text-amber-800">
          <div>
            <p className="font-medium">Printer not appearing in list?</p>
            <p className="text-xs">Ensure Bluetooth is enabled and printer is in pairing mode</p>
          </div>
          <div>
            <p className="font-medium">Print job stuck or not printing?</p>
            <p className="text-xs">Try re-pairing the printer or check paper/ribbon</p>
          </div>
          <div>
            <p className="font-medium">Niimbot printer setup:</p>
            <p className="text-xs">• Load label roll correctly with NFC tag positioned</p>
            <p className="text-xs">• Check label size matches (50x30mm recommended)</p>
            <p className="text-xs">• Ensure labels are genuine Niimbot with NFC</p>
          </div>
        </div>
      </div>

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
          Note: Supports ESC/POS printers and Niimbot label printers (B1, B21, etc.)
        </p>
      </div>
    </div>
  );
}

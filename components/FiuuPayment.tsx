"use client";

import { useState, useEffect, useRef } from "react";
import { CreditCard, Smartphone, Building2, Loader2, X, ChevronDown } from "lucide-react";

// Channel codes matching the server-side service
const FIUU_CHANNELS = {
  CREDIT: "credit",
  TNG: "TNG-EWALLET",
  GRABPAY: "GrabPay",
  BOOST: "BOOST",
  SHOPEEPAY: "ShopeePay",
  DUITNOW: "RPP_DuitNowQR",
};

// E-wallet display configuration
const EWALLET_OPTIONS = [
  { channel: FIUU_CHANNELS.TNG, name: "Touch 'n Go", color: "bg-blue-600", textColor: "text-white" },
  { channel: FIUU_CHANNELS.GRABPAY, name: "GrabPay", color: "bg-green-600", textColor: "text-white" },
  { channel: FIUU_CHANNELS.BOOST, name: "Boost", color: "bg-red-600", textColor: "text-white" },
  { channel: FIUU_CHANNELS.SHOPEEPAY, name: "ShopeePay", color: "bg-orange-500", textColor: "text-white" },
  { channel: FIUU_CHANNELS.DUITNOW, name: "DuitNow QR", color: "bg-purple-600", textColor: "text-white" },
];

interface FiuuPaymentProps {
  orderID: string;
  amount: string;
  currency?: string;
  billName?: string;
  billEmail?: string;
  billMobile?: string;
  billDesc?: string;
  onSuccess?: (data: any) => void;
  onCancel?: () => void;
  onError?: (error: string) => void;
}

type PaymentMethod = "card" | "ewallet" | "fpx" | null;
type PaymentState = "selecting" | "loading" | "card-form" | "redirecting" | "error";

export default function FiuuPayment({
  orderID,
  amount,
  currency = "MYR",
  billName = "Customer",
  billEmail = "",
  billMobile = "",
  billDesc = "",
  onSuccess,
  onCancel,
  onError,
}: FiuuPaymentProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>("selecting");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(null);
  const [selectedEwallet, setSelectedEwallet] = useState<string | null>(null);
  const [showEwalletDropdown, setShowEwalletDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardFormLoaded, setCardFormLoaded] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  // Load Fiuu Inpage Checkout script
  useEffect(() => {
    if (scriptLoadedRef.current) return;

    const loadScript = async () => {
      // First, get the API host from our server
      try {
        const configRes = await fetch("/api/fiuu/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: "config-check", amount: "1.00" }),
        });
        const configData = await configRes.json();

        if (configData.success && configData.config) {
          // Set global API_HOST before loading script
          (window as any).API_HOST = configData.config.apiHost;
        }
      } catch (e) {
        console.warn("Could not fetch Fiuu config, using default");
        (window as any).API_HOST = "https://pay.fiuu.com";
      }

      // Load jQuery if not present
      if (!(window as any).jQuery) {
        const jqueryScript = document.createElement("script");
        jqueryScript.src = "https://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js";
        jqueryScript.async = true;
        await new Promise((resolve) => {
          jqueryScript.onload = resolve;
          document.head.appendChild(jqueryScript);
        });
      }

      // Load Fiuu seamless iframe script
      const fiuuScript = document.createElement("script");
      const apiHost = (window as any).API_HOST || "https://pay.fiuu.com";
      fiuuScript.src = `${apiHost}/RMS/API/seamlessiframe/js/2.0/MOLPay_seamlessiframe.deco.js`;
      fiuuScript.async = true;
      fiuuScript.onload = () => {
        scriptLoadedRef.current = true;
        console.log("[FiuuPayment] Inpage checkout script loaded");
      };
      document.head.appendChild(fiuuScript);
    };

    loadScript();
  }, []);

  // Handle card payment selection
  const handleCardPayment = async () => {
    setSelectedMethod("card");
    setPaymentState("loading");
    setError(null);

    try {
      const response = await fetch("/api/fiuu/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderID,
          amount,
          currency,
          channel: FIUU_CHANNELS.CREDIT,
          billName,
          billEmail,
          billMobile,
          billDesc,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      if (data.method === "inpage" && data.params) {
        setPaymentState("card-form");

        // Wait for container and script to be ready
        setTimeout(() => {
          initializeCardForm(data.params, data.config);
        }, 500);
      }
    } catch (err: any) {
      console.error("[FiuuPayment] Card payment error:", err);
      setError(err.message);
      setPaymentState("error");
      onError?.(err.message);
    }
  };

  // Initialize the card payment form using Fiuu's Inpage Checkout
  const initializeCardForm = (params: Record<string, string>, config: any) => {
    if (!cardContainerRef.current) {
      console.error("[FiuuPayment] Card container not found");
      return;
    }

    // Create the hidden input that triggers Fiuu's Inpage Checkout
    const container = cardContainerRef.current;
    container.innerHTML = "";

    // Create trigger input with data attributes
    const trigger = document.createElement("input");
    trigger.type = "hidden";
    trigger.name = "fiuu_payment_trigger";
    trigger.setAttribute("data-toggle", "molpayseamlessiframe");

    // Set all the data attributes
    Object.entries(params).forEach(([key, value]) => {
      trigger.setAttribute(`data-${key}`, value);
    });
    trigger.setAttribute("data-mpsccbox", "#fiuu-card-container");

    container.appendChild(trigger);

    // Create the card form container
    const cardBox = document.createElement("div");
    cardBox.id = "fiuu-card-container";
    cardBox.className = "min-h-[300px]";
    container.appendChild(cardBox);

    // Trigger the Fiuu script to initialize
    if ((window as any).jQuery && (window as any).MOLPaySeamlessIframe) {
      (window as any).jQuery(trigger).trigger("click");
      setCardFormLoaded(true);
    } else {
      // Retry after a short delay
      setTimeout(() => {
        if ((window as any).jQuery) {
          // Manual initialization
          (window as any).jQuery(trigger).trigger("click");
          setCardFormLoaded(true);
        } else {
          setError("Payment form failed to load. Please refresh and try again.");
          setPaymentState("error");
        }
      }, 1000);
    }
  };

  // Handle e-wallet payment
  const handleEwalletPayment = async (channel: string) => {
    setSelectedEwallet(channel);
    setShowEwalletDropdown(false);
    setPaymentState("loading");
    setError(null);

    try {
      const response = await fetch("/api/fiuu/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderID,
          amount,
          currency,
          channel,
          billName,
          billEmail,
          billMobile,
          billDesc,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      if (data.method === "redirect" && data.paymentURL) {
        setPaymentState("redirecting");
        // Redirect to Fiuu payment page
        window.location.href = data.paymentURL;
      }
    } catch (err: any) {
      console.error("[FiuuPayment] E-wallet payment error:", err);
      setError(err.message);
      setPaymentState("error");
      onError?.(err.message);
    }
  };

  // Handle FPX payment (opens Fiuu's bank selection)
  const handleFPXPayment = async () => {
    setSelectedMethod("fpx");
    setPaymentState("loading");
    setError(null);

    try {
      // Use 'fpx' or redirect to Fiuu's hosted page with FPX options
      const response = await fetch("/api/fiuu/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderID,
          amount,
          currency,
          channel: "fpx", // This will show bank selection on Fiuu page
          billName,
          billEmail,
          billMobile,
          billDesc,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      if (data.paymentURL) {
        setPaymentState("redirecting");
        window.location.href = data.paymentURL;
      }
    } catch (err: any) {
      console.error("[FiuuPayment] FPX payment error:", err);
      setError(err.message);
      setPaymentState("error");
      onError?.(err.message);
    }
  };

  // Reset to selection state
  const handleBack = () => {
    setPaymentState("selecting");
    setSelectedMethod(null);
    setSelectedEwallet(null);
    setError(null);
    setCardFormLoaded(false);
  };

  // Render loading state
  if (paymentState === "loading" || paymentState === "redirecting") {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-auto">
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-700 font-medium">
            {paymentState === "redirecting" ? "Redirecting to payment..." : "Preparing payment..."}
          </p>
        </div>
      </div>
    );
  }

  // Render error state
  if (paymentState === "error") {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-auto">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Try Again
            </button>
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render card form
  if (paymentState === "card-form") {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Card Payment
          </h2>
          <button
            onClick={handleBack}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <p className="text-sm text-gray-600">Amount to pay:</p>
          <p className="text-2xl font-bold text-gray-900">{currency} {amount}</p>
        </div>

        {/* Card form container - Fiuu will inject the iframe here */}
        <div ref={cardContainerRef} className="min-h-[300px] border rounded-lg p-2">
          {!cardFormLoaded && (
            <div className="flex items-center justify-center h-[280px]">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Secured by Fiuu Payment Gateway
        </p>
      </div>
    );
  }

  // Render payment method selection
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Select Payment Method</h2>
      <p className="text-gray-600 mb-6">Order #{orderID}</p>

      {/* Amount display */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-600">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">{currency} {amount}</p>
      </div>

      {/* Payment method buttons */}
      <div className="space-y-3">
        {/* Credit Card */}
        <button
          onClick={handleCardPayment}
          className="w-full p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-between shadow-md"
        >
          <span className="flex items-center gap-3">
            <CreditCard className="w-6 h-6" />
            <div className="text-left">
              <p className="font-semibold">Credit / Debit Card</p>
              <p className="text-sm text-blue-100">Visa, Mastercard</p>
            </div>
          </span>
          <span className="text-2xl">→</span>
        </button>

        {/* Touch 'n Go - Primary E-Wallet */}
        <button
          onClick={() => handleEwalletPayment(FIUU_CHANNELS.TNG)}
          className="w-full p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center justify-between shadow-md"
        >
          <span className="flex items-center gap-3">
            <Smartphone className="w-6 h-6" />
            <div className="text-left">
              <p className="font-semibold">Touch 'n Go eWallet</p>
              <p className="text-sm text-blue-100">Pay with TNG</p>
            </div>
          </span>
          <span className="text-2xl">→</span>
        </button>

        {/* GrabPay - Primary E-Wallet */}
        <button
          onClick={() => handleEwalletPayment(FIUU_CHANNELS.GRABPAY)}
          className="w-full p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center justify-between shadow-md"
        >
          <span className="flex items-center gap-3">
            <Smartphone className="w-6 h-6" />
            <div className="text-left">
              <p className="font-semibold">GrabPay</p>
              <p className="text-sm text-green-100">Pay with Grab</p>
            </div>
          </span>
          <span className="text-2xl">→</span>
        </button>

        {/* More E-Wallets Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowEwalletDropdown(!showEwalletDropdown)}
            className="w-full p-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <Smartphone className="w-6 h-6" />
              <span className="font-medium">More E-Wallets</span>
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showEwalletDropdown ? "rotate-180" : ""}`} />
          </button>

          {showEwalletDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
              {EWALLET_OPTIONS.filter(
                (e) => e.channel !== FIUU_CHANNELS.TNG && e.channel !== FIUU_CHANNELS.GRABPAY
              ).map((ewallet) => (
                <button
                  key={ewallet.channel}
                  onClick={() => handleEwalletPayment(ewallet.channel)}
                  className="w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b last:border-b-0"
                >
                  <div className={`w-8 h-8 ${ewallet.color} rounded-full flex items-center justify-center`}>
                    <Smartphone className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium">{ewallet.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* FPX / Online Banking */}
        <button
          onClick={handleFPXPayment}
          className="w-full p-4 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center justify-between shadow-md"
        >
          <span className="flex items-center gap-3">
            <Building2 className="w-6 h-6" />
            <div className="text-left">
              <p className="font-semibold">Online Banking (FPX)</p>
              <p className="text-sm text-gray-300">All Malaysian banks</p>
            </div>
          </span>
          <span className="text-2xl">→</span>
        </button>
      </div>

      {/* Cancel button */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="w-full mt-6 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          ← Cancel Payment
        </button>
      )}

      <p className="text-xs text-gray-500 mt-4 text-center">
        Secured by Fiuu Payment Gateway
      </p>
    </div>
  );
}

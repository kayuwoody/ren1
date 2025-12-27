import crypto from "crypto";

/**
 * Fiuu Payment Gateway Service
 * Supports: Credit Card (Inpage Checkout), E-Wallets, FPX
 *
 * Integration Methods:
 * - Credit Card: Inpage Checkout (iframe) - uses data-mpschannel="credit"
 * - E-Wallets: Seamless + Express Mode - bypasses channel selection
 * - FPX: Seamless - shows bank selection on Fiuu page
 */

// Channel codes for different payment methods
export const FIUU_CHANNELS = {
  // Credit Cards
  CREDIT: "credit", // Visa/Mastercard (ALB-Paymex)
  CREDIT_CIMB: "credit10", // Visa/Mastercard (CIMB eBPG)

  // E-Wallets
  TNG: "TNG-EWALLET",
  GRABPAY: "GrabPay",
  BOOST: "BOOST",
  SHOPEEPAY: "ShopeePay",
  DUITNOW: "RPP_DuitNowQR",
  WECHAT_MY: "WeChatPayMY",
  ALIPAY: "alipay",
  MAYBANK_QRPAY: "MB2U_QRPay-Push",

  // FPX (Online Banking) - Individual banks
  FPX_MAYBANK: "maybank2u",
  FPX_CIMB: "cimb",
  FPX_PUBLIC: "publicbank",
  FPX_RHB: "rhb",
  FPX_HLB: "hlb",
  FPX_AMBANK: "amb",
  FPX_BANKISLAM: "bankislam",
  FPX_AFFIN: "abb",
  FPX_ALLIANCE: "FPX_ABMB",
  FPX_BANKRAKYAT: "FPX_BKRM",
  FPX_BSN: "FPX_BSN",
  FPX_UOB: "FPX_UOB",
  FPX_HSBC: "FPX_HSBC",
  FPX_OCBC: "ocbc",
  FPX_SCB: "scb",
  FPX_AGROBANK: "FPX_AGROBANK",
  FPX_MUAMALAT: "muamalat",
} as const;

// Payment method categories for UI
export const PAYMENT_CATEGORIES = {
  CARD: {
    label: "Credit/Debit Card",
    channels: [FIUU_CHANNELS.CREDIT],
    icon: "💳",
    expressMode: false, // Cards cannot use express mode
  },
  EWALLET: {
    label: "E-Wallet",
    channels: [
      FIUU_CHANNELS.TNG,
      FIUU_CHANNELS.GRABPAY,
      FIUU_CHANNELS.BOOST,
      FIUU_CHANNELS.SHOPEEPAY,
      FIUU_CHANNELS.DUITNOW,
    ],
    icon: "📱",
    expressMode: true,
  },
  FPX: {
    label: "Online Banking (FPX)",
    channels: Object.entries(FIUU_CHANNELS)
      .filter(([key]) => key.startsWith("FPX_"))
      .map(([, value]) => value),
    icon: "🏦",
    expressMode: true,
  },
} as const;

// E-wallet display info
export const EWALLET_INFO: Record<
  string,
  { name: string; icon: string; color: string }
> = {
  [FIUU_CHANNELS.TNG]: {
    name: "Touch 'n Go",
    icon: "🔵",
    color: "bg-blue-500",
  },
  [FIUU_CHANNELS.GRABPAY]: {
    name: "GrabPay",
    icon: "🟢",
    color: "bg-green-500",
  },
  [FIUU_CHANNELS.BOOST]: { name: "Boost", icon: "🔴", color: "bg-red-500" },
  [FIUU_CHANNELS.SHOPEEPAY]: {
    name: "ShopeePay",
    icon: "🟠",
    color: "bg-orange-500",
  },
  [FIUU_CHANNELS.DUITNOW]: {
    name: "DuitNow",
    icon: "🟣",
    color: "bg-purple-500",
  },
};

export interface FiuuPaymentParams {
  orderID: string;
  amount: string; // Format: "10.00"
  currency?: string;
  billName?: string;
  billEmail?: string;
  billMobile?: string;
  billDesc?: string;
}

export interface FiuuCallbackData {
  tranID: string;
  orderid: string;
  status: string;
  domain: string;
  amount: string;
  currency: string;
  paydate: string;
  channel: string;
  skey: string;
  error_code?: string;
  error_desc?: string;
}

export class FiuuService {
  private merchantID: string;
  private verifyKey: string;
  private secretKey: string;
  private sandboxMode: boolean;

  constructor(
    merchantID: string,
    verifyKey: string,
    secretKey: string,
    sandboxMode: boolean = false
  ) {
    this.merchantID = merchantID;
    this.verifyKey = verifyKey;
    this.secretKey = secretKey;
    this.sandboxMode = sandboxMode;
  }

  /**
   * Get the base URL for API calls
   */
  getBaseURL(): string {
    return this.sandboxMode
      ? "https://sandbox.merchant.razer.com"
      : "https://pay.fiuu.com";
  }

  /**
   * Get the API host for Inpage Checkout JS
   */
  getAPIHost(): string {
    return this.sandboxMode
      ? "https://sandbox.merchant.razer.com"
      : "https://pay.fiuu.com";
  }

  /**
   * Get merchant ID (for client-side use)
   */
  getMerchantID(): string {
    return this.merchantID;
  }

  /**
   * Generate MD5 hash
   */
  private md5(value: string): string {
    return crypto.createHash("md5").update(value).digest("hex");
  }

  /**
   * Generate vcode for payment request
   * Formula: MD5(amount + merchantID + orderID + verifyKey)
   */
  generateVcode(amount: string, orderID: string): string {
    const raw = `${amount}${this.merchantID}${orderID}${this.verifyKey}`;
    return this.md5(raw);
  }

  /**
   * Generate payment parameters for Inpage Checkout (Credit Card)
   * These are used as data attributes on the payment trigger element
   */
  generateInpageCheckoutParams(
    params: FiuuPaymentParams,
    returnURL: string,
    callbackURL: string,
    notifyURL: string
  ): Record<string, string> {
    const {
      orderID,
      amount,
      currency = "MYR",
      billName = "",
      billEmail = "",
      billMobile = "",
      billDesc = "",
    } = params;

    const vcode = this.generateVcode(amount, orderID);

    return {
      mpsmerchantid: this.merchantID,
      mpschannel: FIUU_CHANNELS.CREDIT,
      mpsamount: amount,
      mpsorderid: orderID,
      mpsbill_name: billName,
      mpsbill_email: billEmail,
      mpsbill_mobile: billMobile,
      mpsbill_desc: billDesc,
      mpscurrency: currency,
      mpsvcode: vcode,
      mpsreturnurl: returnURL,
      // Note: callback and notify URLs should be registered in Fiuu portal
    };
  }

  /**
   * Generate payment URL for Seamless Integration (E-Wallets, FPX)
   * This URL is used to redirect/open payment popup
   */
  generateSeamlessPaymentURL(
    params: FiuuPaymentParams,
    channel: string,
    returnURL: string
  ): string {
    const {
      orderID,
      amount,
      currency = "MYR",
      billName = "",
      billEmail = "",
      billMobile = "",
      billDesc = "",
    } = params;

    const vcode = this.generateVcode(amount, orderID);

    const queryParams = new URLSearchParams({
      amount,
      orderid: orderID,
      bill_name: billName,
      bill_email: billEmail,
      bill_mobile: billMobile,
      bill_desc: billDesc,
      currency,
      vcode,
      returnurl: returnURL,
    });

    return `${this.getBaseURL()}/RMS/pay/${this.merchantID}/${channel}?${queryParams.toString()}`;
  }

  /**
   * Verify callback signature from Fiuu
   * Uses double-hashed MD5 (skey) to prevent tampering
   */
  verifyCallback(callback: FiuuCallbackData): boolean {
    const { tranID, orderid, status, domain, amount, currency, paydate, skey } =
      callback;

    // Generate expected skey: MD5(MD5(concat)) - double hash
    const raw = `${tranID}${orderid}${status}${domain}${amount}${currency}${paydate}${this.secretKey}`;
    const hash1 = this.md5(raw);
    const expectedSkey = this.md5(hash1);

    return expectedSkey === skey;
  }

  /**
   * Check if payment was successful
   */
  isPaymentSuccessful(status: string): boolean {
    return status === "00";
  }

  /**
   * Check if payment failed
   */
  isPaymentFailed(status: string): boolean {
    return status === "11";
  }

  /**
   * Check if payment is pending
   */
  isPaymentPending(status: string): boolean {
    return status === "22";
  }

  /**
   * Get payment status description
   */
  getStatusDescription(status: string): string {
    const statusMap: Record<string, string> = {
      "00": "Successful",
      "11": "Failed",
      "22": "Pending",
      "33": "Processing/Incomplete",
    };
    return statusMap[status] || "Unknown";
  }

  /**
   * Query transaction status directly from Fiuu
   */
  async requeryTransaction(orderID: string): Promise<any> {
    const url = `${this.getBaseURL()}/RMS/API/gate-query/index.php`;

    const body = new URLSearchParams({
      merchant_id: this.merchantID,
      verify_key: this.verifyKey,
      order_id: orderID,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Fiuu requery failed: ${response.statusText}`);
      }

      const text = await response.text();
      // Fiuu returns key=value pairs separated by &
      const result: Record<string, string> = {};
      text.split("&").forEach((pair) => {
        const [key, value] = pair.split("=");
        if (key) result[key] = decodeURIComponent(value || "");
      });

      return result;
    } catch (error) {
      console.error("Fiuu requery error:", error);
      throw error;
    }
  }
}

/**
 * Get Fiuu service instance with environment credentials
 */
export function getFiuuService(): FiuuService {
  const merchantID = process.env.FIUU_MERCHANT_ID;
  const verifyKey = process.env.FIUU_VERIFY_KEY;
  const secretKey = process.env.FIUU_SECRET_KEY;
  const sandboxMode = process.env.FIUU_SANDBOX_MODE === "true";

  if (!merchantID || !verifyKey || !secretKey) {
    throw new Error(
      "Missing Fiuu credentials. Please set FIUU_MERCHANT_ID, FIUU_VERIFY_KEY, and FIUU_SECRET_KEY in environment variables."
    );
  }

  return new FiuuService(merchantID, verifyKey, secretKey, sandboxMode);
}

/**
 * Get Fiuu configuration for client-side use
 * Only exposes safe values (no secret key)
 */
export function getFiuuClientConfig(): {
  merchantID: string;
  apiHost: string;
  sandboxMode: boolean;
} {
  const merchantID = process.env.FIUU_MERCHANT_ID || "";
  const sandboxMode = process.env.FIUU_SANDBOX_MODE === "true";
  const apiHost = sandboxMode
    ? "https://sandbox.merchant.razer.com"
    : "https://pay.fiuu.com";

  return { merchantID, apiHost, sandboxMode };
}

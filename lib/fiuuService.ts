import crypto from "crypto";

/**
 * Fiuu Payment Gateway Service
 * Handles payment URL generation, callback verification, and transaction queries
 */
export class FiuuService {
  private merchantID: string;
  private verifyKey: string;
  private secretKey: string;
  private baseURL: string;

  constructor(
    merchantID: string,
    verifyKey: string,
    secretKey: string,
    sandboxMode: boolean = false
  ) {
    this.merchantID = merchantID;
    this.verifyKey = verifyKey;
    this.secretKey = secretKey;
    // Fiuu uses the same URL for sandbox and production
    // Sandbox is controlled by merchant account type
    this.baseURL = "https://pay.fiuu.com";
  }

  /**
   * Generate MD5 hash
   */
  private md5(value: string): string {
    return crypto.createHash("md5").update(value).digest("hex");
  }

  /**
   * Generate Fiuu payment URL for redirect
   *
   * @param params Payment parameters
   * @returns Complete payment URL to redirect customer to
   */
  generatePaymentURL(params: {
    orderID: string;
    amount: string;
    currency?: string;
    paymentMethod: string;
    returnURL: string;
    notifyURL: string;
    callbackURL: string;
    bill_name?: string;
    bill_email?: string;
    bill_mobile?: string;
    bill_desc?: string;
  }): string {
    const {
      orderID,
      amount,
      currency = "MYR",
      paymentMethod,
      returnURL,
      notifyURL,
      callbackURL,
      bill_name = "",
      bill_email = "",
      bill_mobile = "",
      bill_desc = "",
    } = params;

    // Generate vcode (verify key hash) - MD5 hash for outbound request
    const vcode = this.md5(
      `${amount}${this.merchantID}${orderID}${this.verifyKey}`
    );

    // Build query parameters
    const queryParams = new URLSearchParams({
      amount,
      orderid: orderID,
      bill_name,
      bill_email,
      bill_mobile,
      bill_desc,
      currency,
      returnurl: returnURL,
      callbackurl: callbackURL,
      vcode,
    });

    // Note: notifyURL is registered in Fiuu portal, not passed in URL
    // But we include it in case Fiuu supports dynamic override
    if (notifyURL) {
      queryParams.append("notifyurl", notifyURL);
    }

    return `${this.baseURL}/RMS/pay/${this.merchantID}/${paymentMethod}?${queryParams.toString()}`;
  }

  /**
   * Verify callback signature from Fiuu
   * Uses double-hashed MD5 (skey) to prevent tampering
   *
   * @param callback Callback data from Fiuu webhook/return/callback
   * @returns true if signature is valid
   */
  verifyCallback(callback: {
    tranID: string;
    orderid: string;
    status: string;
    domain: string;
    amount: string;
    currency: string;
    paydate: string;
    skey: string;
  }): boolean {
    const { tranID, orderid, status, domain, amount, currency, paydate, skey } =
      callback;

    // Generate expected skey: MD5(MD5(concat)) - double hash
    const raw = `${tranID}${orderid}${status}${domain}${amount}${currency}${paydate}${this.secretKey}`;
    const hash1 = this.md5(raw);
    const hash2 = this.md5(hash1);

    return hash2 === skey;
  }

  /**
   * Check if payment was successful
   * Status "00" indicates success
   */
  isPaymentSuccessful(status: string): boolean {
    return status === "00";
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
   * Useful for reconciliation or when callbacks are missed
   *
   * @param orderID Order ID to query
   * @returns Transaction status data
   */
  async requeryTransaction(orderID: string): Promise<any> {
    const url = `${this.baseURL}/RMS/API/TxnQuery/${this.merchantID}/${orderID}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fiuu requery failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Fiuu requery error:", error);
      throw error;
    }
  }

  /**
   * Process refund (optional - not in v1 but kept for future use)
   *
   * @param orderID Order ID to refund
   * @param amount Amount to refund
   * @returns Refund response data
   */
  async refundTransaction(
    orderID: string,
    amount: string
  ): Promise<any> {
    const url = `${this.baseURL}/RMS/API/Refund`;

    const body = new URLSearchParams({
      merchantID: this.merchantID,
      orderid: orderID,
      amount,
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
        throw new Error(`Fiuu refund failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Fiuu refund error:", error);
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

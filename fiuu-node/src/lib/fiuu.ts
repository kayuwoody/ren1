
import crypto from "crypto";
import axios from "axios";
import qs from "qs";

export class Fiuu {
  merchantID: string;
  verifyKey: string;
  secretKey: string;
  baseURL: string;

  constructor(merchantID: string, verifyKey: string, secretKey: string) {
    this.merchantID = merchantID;
    this.verifyKey = verifyKey;
    this.secretKey = secretKey;
    this.baseURL = "https://pay.fiuu.com";
  }

  md5(v: string) {
    return crypto.createHash("md5").update(v).digest("hex");
  }

  generatePaymentURL({ orderID, amount, currency = "MYR", paymentMethod, returnURL, notifyURL, }: {
    orderID: string;
    amount: string;
    currency?: string;
    paymentMethod: string;
    returnURL: string;
    notifyURL: string;
  }) {
    const vcode = this.md5(orderID + amount + currency + this.verifyKey);
    const query = qs.stringify({ orderid: orderID, amount, currency, vcode, returnurl: returnURL, notifyurl: notifyURL });
    return `${this.baseURL}/RMS/pay/${this.merchantID}/${paymentMethod}?${query}`;
  }

  verifyCallback({ orderID, tranID, status, domain, amount, currency, paydate, skey, }: any) {
    const raw = tranID + orderID + status + domain + amount + currency + paydate + this.secretKey;
    const h1 = this.md5(raw);
    const h2 = this.md5(h1);
    return h2 === skey;
  }

  async requery(orderID: string) {
    const url = `${this.baseURL}/RMS/API/TxnQuery/${this.merchantID}/${orderID}`;
    const res = await axios.get(url);
    return res.data;
  }

  async refund(orderID: string, amount: string) {
    const url = `${this.baseURL}/RMS/API/Refund`;
    const body = qs.stringify({ merchantID: this.merchantID, orderid: orderID, amount });
    const res = await axios.post(url, body, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    return res.data;
  }
}

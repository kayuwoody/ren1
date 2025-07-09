import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const woo = new WooCommerceRestApi({
  url: process.env.NEXT_PUBLIC_WC_URL || "http://localhost:3000", // <-- Add this!
  consumerKey: process.env.NEXT_PUBLIC_WC_CONSUMER_KEY || "",
  consumerSecret: process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET || "",
  version: "wc/v3",
});

export default woo;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Coffee Oasis <noreply@coffee-oasis.com.my>";

interface StockNotification {
  id: string;
  product_id: string;
  product_name: string;
  phone: string | null;
  email: string | null;
}

async function sendEmail(to: string, productName: string): Promise<boolean> {
  console.log(`Sending email: from=${FROM_EMAIL}, to=${to}, key=${RESEND_API_KEY ? "set (" + RESEND_API_KEY.substring(0, 6) + "...)" : "MISSING"}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: `${productName} is back in stock!`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1f2937;">Good news! ☕</h2>
          <p style="color: #374151; font-size: 16px;">
            <strong>${productName}</strong> is back in stock at Coffee Oasis.
          </p>
          <a href="https://www.coffee-oasis.com"
             style="display: inline-block; background: #d97706; color: white; padding: 12px 24px;
                    border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
            Order Now
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            You received this because you signed up for restock notifications.
          </p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Resend error (${res.status}):`, errBody);
  }
  return res.ok;
}

// Stub: plug in WhatsApp provider (Twilio, Fonnte, etc.) when ready
async function sendWhatsApp(_phone: string, _productName: string): Promise<boolean> {
  console.log(`[WhatsApp stub] Would notify ${_phone} about ${_productName}`);
  return false;
}

Deno.serve(async (req) => {
  // Allow cron or manual trigger via POST/GET
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Find unnotified subscriptions where product is back in stock
  const { data: pending, error } = await supabase
    .from("stock_notifications")
    .select("id, product_id, product_name, phone, email")
    .is("notified_at", null);

  if (error) {
    console.error("Failed to fetch notifications:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return Response.json({ message: "No pending notifications", sent: 0 });
  }

  // Get distinct product IDs and check which are in stock
  const productIds = [...new Set(pending.map((n: StockNotification) => n.product_id))];
  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, in_stock, stock_quantity")
    .in("id", productIds);

  console.log("Product IDs to check:", productIds);
  console.log("Products found:", JSON.stringify(products));
  if (prodError) console.error("Product query error:", prodError);

  const inStockIds = new Set(
    (products || [])
      .filter((p: any) => p.in_stock === true || Number(p.stock_quantity) > 0)
      .map((p: { id: string }) => p.id)
  );

  console.log("In stock IDs:", [...inStockIds]);

  if (inStockIds.size === 0) {
    return Response.json({ message: "No restocked products", sent: 0 });
  }

  // Filter to notifications for restocked products
  const toNotify = pending.filter((n: StockNotification) => inStockIds.has(n.product_id));
  const results = { emailSent: 0, whatsappSent: 0, failed: 0 };
  const notifiedIds: string[] = [];

  for (const notification of toNotify) {
    let sent = false;

    if (notification.email) {
      const ok = await sendEmail(notification.email, notification.product_name);
      if (ok) {
        results.emailSent++;
        sent = true;
      } else {
        console.error(`Email failed for ${notification.email}`);
      }
    }

    if (notification.phone) {
      const ok = await sendWhatsApp(notification.phone, notification.product_name);
      if (ok) {
        results.whatsappSent++;
        sent = true;
      }
    }

    if (sent) {
      notifiedIds.push(notification.id);
    } else if (!notification.phone) {
      // Email-only notification that failed — don't mark as notified so we retry
      results.failed++;
    }
  }

  // Mark successfully notified
  if (notifiedIds.length > 0) {
    await supabase
      .from("stock_notifications")
      .update({ notified_at: new Date().toISOString() })
      .in("id", notifiedIds);
  }

  console.log(`Restock notifications: ${JSON.stringify(results)}`);
  return Response.json({
    message: "Done",
    pending: toNotify.length,
    ...results,
    markedNotified: notifiedIds.length,
  });
});

/**
 * Static Receipt HTML Generator
 *
 * Generates self-contained HTML files for receipts that can be uploaded to static hosting.
 * No JavaScript, no external dependencies - just pure HTML/CSS.
 */

export function generateReceiptHTML(order: any): string {
  const getItemMeta = (item: any, key: string) => {
    return item.meta_data?.find((m: any) => m.key === key)?.value;
  };

  const getOrderMeta = (key: string) => {
    return order.meta_data?.find((m: any) => m.key === key)?.value;
  };

  const orderDate = order.date_created ? new Date(order.date_created) : new Date();
  const formattedDate = orderDate.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalDiscount = parseFloat(getOrderMeta('_total_discount') || '0');
  const finalTotal = parseFloat(order.total);
  const retailTotal = finalTotal + totalDiscount;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coffee Oasis Receipt #${order.id}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(to bottom, #fef3c7, #f3f4f6);
      padding: 1rem;
      min-height: 100vh;
    }
    .container {
      max-width: 28rem;
      margin: 0 auto;
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      padding: 2rem;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #d97706;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .logo {
      width: 4rem;
      height: 4rem;
      background: linear-gradient(135deg, #d97706, #92400e);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    h1 {
      font-size: 1.875rem;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }
    .subtitle {
      font-size: 0.875rem;
      color: #92400e;
      font-weight: 500;
    }
    .location {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }
    .order-info {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }
    .info-label {
      color: #6b7280;
    }
    .info-value {
      font-weight: 600;
    }
    table {
      width: 100%;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    th {
      text-align: left;
      padding: 0.5rem 0;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
      color: #374151;
    }
    th.right, td.right {
      text-align: right;
    }
    th.center, td.center {
      text-align: center;
    }
    td {
      padding: 0.75rem 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .item-name {
      font-weight: 500;
    }
    .item-base {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.125rem;
    }
    .discount-label {
      font-size: 0.75rem;
      color: #059669;
      margin-top: 0.25rem;
    }
    .price-original {
      font-size: 0.75rem;
      color: #9ca3af;
      text-decoration: line-through;
    }
    .price-discounted {
      color: #059669;
      font-weight: 500;
    }
    .totals {
      border-top: 1px solid #e5e7eb;
      padding-top: 1rem;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }
    .total-row.discount {
      background: #f0fdf4;
      padding: 0.5rem;
      border-radius: 0.375rem;
    }
    .total-row.discount .total-label {
      color: #059669;
      font-weight: 600;
    }
    .total-row.discount .total-value {
      color: #059669;
      font-weight: 600;
    }
    .total-row.final {
      font-size: 1.125rem;
      font-weight: 700;
      border-top: 1px solid #e5e7eb;
      padding-top: 0.5rem;
      margin-top: 0.5rem;
    }
    .total-row.final .total-value {
      color: #059669;
    }
    .savings-banner {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 0.5rem;
      padding: 0.75rem;
      text-align: center;
      margin-top: 0.75rem;
    }
    .savings-text {
      color: #78350f;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .payment-status {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
      background: #d1fae5;
      color: #065f46;
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 2px solid #e5e7eb;
      text-align: center;
    }
    .thank-you {
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }
    .thank-you-sub {
      font-size: 0.875rem;
      color: #6b7280;
    }
    .contact-info {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.5rem;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        padding: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo">☕</div>
      <h1>Coffee Oasis</h1>
      <p class="subtitle">Your friendly local Coffee Shop</p>
      <p class="location">📍 9ine | 🌐 coffee-oasis.com.my</p>
    </div>

    <!-- Order Info -->
    <div class="order-info">
      <div class="info-row">
        <span class="info-label">Order Number:</span>
        <span class="info-value">#${order.id}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${formattedDate}</span>
      </div>
    </div>

    <!-- Items -->
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="center">Qty</th>
          <th class="right">Price</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${order.line_items?.map((item: any) => {
          const retailPrice = parseFloat(getItemMeta(item, '_retail_price') || item.price);
          const finalPrice = parseFloat(getItemMeta(item, '_final_price') || item.price);
          const discountReason = getItemMeta(item, '_discount_reason');
          const hasDiscount = retailPrice > finalPrice;
          const itemRetailTotal = retailPrice * item.quantity;
          const itemFinalTotal = finalPrice * item.quantity;

          const isBundle = getItemMeta(item, '_is_bundle') === 'true';
          const bundleDisplayName = getItemMeta(item, '_bundle_display_name');
          const bundleBaseName = getItemMeta(item, '_bundle_base_product_name');
          const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

          return `
        <tr>
          <td>
            <div class="item-name">${displayName}</div>
            ${isBundle && bundleBaseName ? `<div class="item-base">Base: ${bundleBaseName}</div>` : ''}
            ${discountReason ? `<div class="discount-label">• ${discountReason}</div>` : ''}
          </td>
          <td class="center">${item.quantity}</td>
          <td class="right">
            ${hasDiscount ? `
              <div class="price-original">RM ${retailPrice.toFixed(2)}</div>
              <div class="price-discounted">RM ${finalPrice.toFixed(2)}</div>
            ` : `
              <div>RM ${finalPrice.toFixed(2)}</div>
            `}
          </td>
          <td class="right">
            ${hasDiscount ? `
              <div class="price-original">RM ${itemRetailTotal.toFixed(2)}</div>
              <div class="price-discounted">RM ${itemFinalTotal.toFixed(2)}</div>
            ` : `
              <div>RM ${itemFinalTotal.toFixed(2)}</div>
            `}
          </td>
        </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals">
      ${totalDiscount > 0 ? `
        <div class="total-row">
          <span class="total-label">Retail Total:</span>
          <span class="total-value" style="text-decoration: line-through; color: #9ca3af;">RM ${retailTotal.toFixed(2)}</span>
        </div>
        <div class="total-row discount">
          <span class="total-label">Discount:</span>
          <span class="total-value">-RM ${totalDiscount.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="total-row">
        <span class="total-label">Subtotal:</span>
        <span class="total-value">RM ${finalTotal.toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span class="total-label">Tax:</span>
        <span class="total-value">RM 0.00</span>
      </div>
      <div class="total-row final">
        <span class="total-label">Total Paid:</span>
        <span class="total-value">RM ${finalTotal.toFixed(2)}</span>
      </div>
      ${totalDiscount > 0 ? `
        <div class="savings-banner">
          <p class="savings-text">🎉 You saved RM ${totalDiscount.toFixed(2)}!</p>
        </div>
      ` : ''}
    </div>

    <!-- Payment Status -->
    <div class="payment-status">
      <div class="info-row">
        <span class="info-label">Payment Method:</span>
        <span class="info-value">Cash</span>
      </div>
      <div class="info-row" style="margin-top: 0.5rem;">
        <span class="info-label">Status:</span>
        <span class="status-badge">PAID</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="thank-you">Thank you for your purchase!</p>
      <p class="thank-you-sub">Your order will be ready soon.</p>
      <div class="contact-info">
        <p>Questions? Contact us at support@coffee-oasis.com.my</p>
        <p>📞 +60 17-2099 411</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}


"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { useBranch } from "@/context/branchContext";
import CashPayment from "@/components/CashPayment";
import { Gift, X } from "lucide-react";

export default function PaymentPage() {
  const router = useRouter();
  const { cartItems, clearCart, customer, voucher, pass, setVoucher } = useCart();
  const { branchFetch } = useBranch();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_qr" | null>(null);
  const [passProductNames, setPassProductNames] = useState<string[]>([]);

  // Check if cart contains pass products that require a customer
  useEffect(() => {
    if (cartItems.length === 0) return;
    const productIds = cartItems.map(item => String(item.productId));
    fetch('/api/loyalty/config')
      .then(r => r.json())
      .then(data => {
        const passPrograms = (data.programs || []).filter(
          (p: any) => p.trigger_type === 'pass' && p.is_active && p.pass_product_id && productIds.includes(p.pass_product_id)
        );
        setPassProductNames(passPrograms.map((p: any) => p.name));
      })
      .catch(() => {});
  }, [cartItems]);

  const hasPassProductWithoutCustomer = passProductNames.length > 0 && !customer;

  const retailTotal = cartItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0);
  const itemFinalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const itemDiscount = retailTotal - itemFinalTotal;
  const voucherAmount = voucher?.discount_amount ?? 0;

  let passDiscount = 0;
  const passAppliedProductIds: string[] = [];
  if (pass) {
    let usesLeft = pass.uses_remaining;
    for (const item of cartItems) {
      if (usesLeft <= 0) break;
      if (pass.eligible_product_ids.includes(String(item.productId))) {
        const usesForItem = Math.min(item.quantity, usesLeft);
        passDiscount += item.finalPrice * usesForItem;
        for (let i = 0; i < usesForItem; i++) {
          passAppliedProductIds.push(String(item.productId));
        }
        usesLeft -= usesForItem;
      }
    }
  }

  const finalTotal = Math.max(0, itemFinalTotal - voucherAmount - passDiscount);
  const hasDiscount = itemDiscount > 0 || voucherAmount > 0 || passDiscount > 0;

  useEffect(() => {
    if (cartItems.length > 0) {
      fetch('/api/cart/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setPendingOrder: true,
          orderId: order?.id || 'pending',
          items: cartItems,
          voucher: voucher,
          pass: pass,
        }),
      }).catch(err => console.error('Failed to set pending order:', err));
    }
  }, [cartItems, order]);

  const handlePaymentMethodSelect = (method: "cash" | "bank_qr") => {
    setPaymentMethod(method);
  };

  const createOrder = async (): Promise<any> => {
    const totalDiscount = cartItems.reduce((sum, item) => {
      if (item.discountReason) {
        return sum + ((item.retailPrice - item.finalPrice) * item.quantity);
      }
      return sum;
    }, 0);

    const orderMetaData: Array<{ key: string; value: string }> = [];
    if (totalDiscount > 0) {
      orderMetaData.push({ key: "_total_discount", value: totalDiscount.toFixed(2) });
    }
    if (voucher) {
      orderMetaData.push(
        { key: "_voucher_code", value: voucher.code },
        { key: "_voucher_discount", value: voucherAmount.toFixed(2) },
      );
    }
    if (pass && passAppliedProductIds.length > 0) {
      orderMetaData.push(
        { key: "_pass_id", value: pass.id },
        { key: "_pass_code", value: pass.code },
        { key: "_pass_discount", value: passDiscount.toFixed(2) },
      );
    }
    if (customer) {
      orderMetaData.push(
        { key: "_loyalty_member_id", value: customer.member_id },
        { key: "_loyalty_member_phone", value: customer.phone },
      );
      if (customer.name) {
        orderMetaData.push({ key: "_loyalty_member_name", value: customer.name });
      }
    }

    const response = await branchFetch("/api/orders/create-with-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line_items: cartItems.map((item) => {
          const meta_data: Array<{ key: string; value: string }> = [];

          if (item.discountReason) {
            meta_data.push(
              { key: "_discount_reason", value: item.discountReason },
              { key: "_retail_price", value: item.retailPrice.toString() },
              { key: "_discount_amount", value: (item.retailPrice - item.finalPrice).toString() }
            );
          }

          if (item.surchargeAmount && item.surchargeAmount > 0) {
            meta_data.push(
              { key: "_surcharge_amount", value: item.surchargeAmount.toString() },
              { key: "_surcharge_reason", value: item.surchargeReason || 'Upgrade' }
            );
          }

          meta_data.push({ key: "_final_price", value: item.finalPrice.toString() });

          if (item.bundle) {
            meta_data.push(
              { key: "_is_bundle", value: "true" },
              { key: "_bundle_display_name", value: item.name },
              { key: "_bundle_base_product_name", value: item.bundle.baseProductName },
              { key: "_bundle_mandatory", value: JSON.stringify(item.bundle.selectedMandatory) },
              { key: "_bundle_optional", value: JSON.stringify(item.bundle.selectedOptional) }
            );

            if (item.components) {
              meta_data.push(
                { key: "_bundle_components", value: JSON.stringify(item.components) }
              );
            }
          }

          return {
            product_id: item.productId,
            quantity: item.quantity,
            subtotal: (item.finalPrice * item.quantity).toString(),
            total: (item.finalPrice * item.quantity).toString(),
            meta_data,
          };
        }),
        meta_data: orderMetaData.length > 0 ? orderMetaData : [],
        paymentMethod: paymentMethod,
        billing: {
          first_name: customer?.name || "Walk-in Customer",
          phone: customer?.phone || null,
          email: "pos@coffee-oasis.com.my",
        },
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to create order");
    }

    setOrder(data.order);

    await fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setPendingOrder: true,
        orderId: data.order.id,
        items: cartItems,
        voucher: voucher,
        pass: pass,
      }),
    });

    return data.order;
  };

  const handlePaymentSuccess = async () => {
    const orderId = order?.id;
    const orderTotal = finalTotal;
    const currentCustomer = customer;
    const currentVoucher = voucher;
    const currentPass = pass;
    const currentPassProductIds = [...passAppliedProductIds];

    clearCart();

    await fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart: [],
        setPendingOrder: false,
      }),
    });

    if (currentVoucher) {
      fetch("/api/vouchers/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentVoucher.code }),
      }).catch(() => {});
    }

    if (currentCustomer && orderTotal > 0) {
      fetch("/api/loyalty/purchase-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: currentCustomer.member_id,
          order_total: orderTotal,
          order_id: orderId,
        }),
      }).catch(() => {});
    }

    if (currentPass && currentPassProductIds.length > 0) {
      fetch("/api/passes/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pass_id: currentPass.id,
          order_id: orderId,
          product_ids: currentPassProductIds,
        }),
      }).catch(() => {});
    }

    router.push("/admin/pos");
  };

  const handleCancel = async () => {
    await fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setPendingOrder: false,
      }),
    });

    setOrder(null);
    setPaymentMethod(null);
    setError(null);
  };

  useEffect(() => {
    if (cartItems.length === 0 && !order) {
      router.push("/admin/pos");
    }
  }, [cartItems, order, router]);

  if (paymentMethod) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <CashPayment
          orderID={order?.id}
          amount={finalTotal.toFixed(2)}
          paymentMethod={paymentMethod}
          onConfirmPayment={createOrder}
          onSuccess={handlePaymentSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Payment Method</h1>
        <p className="text-gray-600 mb-6">How will the customer pay?</p>

        {/* Customer Attribution */}
        {customer && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-blue-800">{customer.name || customer.phone}</p>
            {customer.name && <p className="text-xs text-blue-600">{customer.phone}</p>}
            <p className="text-xs text-blue-500 mt-0.5">Purchase points will be awarded</p>
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">Order Total</p>
          {hasDiscount && (
            <p className="text-lg text-gray-400 line-through">RM {retailTotal.toFixed(2)}</p>
          )}
          <p className="text-3xl font-bold text-gray-900">RM {finalTotal.toFixed(2)}</p>
          {itemDiscount > 0 && (
            <p className="text-sm text-green-600 font-medium mt-1">
              Item discounts: -RM {itemDiscount.toFixed(2)}
            </p>
          )}
          {voucher && (
            <p className="text-sm text-purple-600 font-medium mt-1">
              Voucher ({voucher.code}): -RM {voucherAmount.toFixed(2)}
            </p>
          )}
          {passDiscount > 0 && (
            <p className="text-sm text-teal-600 font-medium mt-1">
              Pass ({pass?.program_name}): -RM {passDiscount.toFixed(2)}
            </p>
          )}
          <p className="text-sm text-gray-600 mt-2">{cartItems.length} item(s)</p>
        </div>

        {/* Voucher Section */}
        {voucher ? (
          <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3 mb-6">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-sm font-semibold text-purple-800">{voucher.code}</p>
                <p className="text-xs text-purple-600">
                  {voucher.type === 'fixed' ? `RM ${voucher.discount_value.toFixed(2)} off` : `${voucher.discount_value}% off`}
                </p>
              </div>
            </div>
            <button onClick={() => setVoucher(null)} className="p-1 hover:bg-purple-100 rounded">
              <X className="w-4 h-4 text-purple-600" />
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-xs text-gray-400 text-center">Scan a voucher QR code to apply discount</p>
          </div>
        )}

        {/* Pass product without customer warning */}
        {hasPassProductWithoutCustomer && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold text-sm">Customer scan required</p>
            <p className="text-red-700 text-sm mt-1">
              This order contains a pass product ({passProductNames.join(', ')}). The customer must scan their QR code before payment so the pass can be linked to their account.
            </p>
            <p className="text-red-600 text-xs mt-2">Scan the customer&apos;s phone QR to continue.</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Payment Method Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handlePaymentMethodSelect("cash")}
            disabled={hasPassProductWithoutCustomer}
            className={`w-full p-4 text-white rounded-lg transition-colors flex items-center justify-between ${
              hasPassProductWithoutCustomer
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">💵</span>
              <div className="text-left">
                <p className="font-semibold">Cash Payment</p>
                <p className="text-sm opacity-75">Accept cash and give change</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>

          <button
            onClick={() => handlePaymentMethodSelect("bank_qr")}
            disabled={hasPassProductWithoutCustomer}
            className={`w-full p-4 text-white rounded-lg transition-colors flex items-center justify-between ${
              hasPassProductWithoutCustomer
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">📱</span>
              <div className="text-left">
                <p className="font-semibold">Bank QR Code</p>
                <p className="text-sm opacity-75">Customer scans your QR</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push("/admin/pos")}
          className="w-full mt-6 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          ← Back to POS
        </button>
      </div>
    </div>
  );
}

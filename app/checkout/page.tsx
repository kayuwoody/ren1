"use client";
import { useCart } from "@/context/cartContext";
import { useRouter } from "next/navigation";

export default function CheckoutPage() {
  const { cartItems, clearCart } = useCart();
  const router = useRouter();

  const handleConfirm = async () => {
    let clientId = localStorage.getItem("clientId");
    if (!clientId) {
      clientId = crypto.randomUUID();
      localStorage.setItem("clientId", clientId);
    }

    // look for any in-progress order
    const processingRes = await fetch(
      `/api/orders/processing?clientId=${clientId}`
    );
    const existing = await processingRes.json();

    // build line_items etc.
    const payload = {
      line_items: cartItems.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
      })),
      meta_data: [{ key: "clientId", value: clientId }],
     // set_paid: true,
    };

    let wooOrder: any;
    if (existing?.id) {
      // update
      const res = await fetch(`/api/update-order/${existing.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });console.log("add to order payload text:",payload);
      wooOrder = await res.json();
    } else {
      // create
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),    
      });        console.log("create new order payload text:",payload);
      wooOrder = await res.json();
    }

    // persist and go straight to details
    localStorage.setItem("currentWooId", String(wooOrder.id));
    localStorage.setItem("startTime", String(Date.now()));
    const duration = 2 * 60 * 1000 * cartItems.length;
    localStorage.setItem("endTime", String(Date.now() + duration));

    clearCart();
    router.push(`/orders/${wooOrder.id}`);
  };
  
  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">Checkout</h1>
      <ul className="mb-4 space-y-2">
        {cartItems.map((item) => (
          <li key={item.id} className="flex justify-between">
            <span>{item.name} × {item.quantity}</span>
            <span>${(item.price * item.quantity).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={handleConfirm}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Confirm &amp; Pay
      </button>
    </div>
  );
}

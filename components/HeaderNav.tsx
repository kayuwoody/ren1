"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/cartContext";
import { Clock } from "lucide-react";

export default function HeaderNav() {
  const { cartItems } = useCart();
  const [hasProcessing, setHasProcessing] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("currentWooId");
    setCurrentOrderId(id);
    const clientId = localStorage.getItem("clientId") || "";
    fetch(`/api/orders/processing?clientId=${clientId}`)
      .then((r) => r.json())
      .then((o) => setHasProcessing(!!o?.id));
  }, []);

  return (
    <header className="...">
      <nav className="flex space-x-4">
        <Link href="/">Home</Link>
        <Link href="/products">Products</Link>
        <Link href="/orders">All Orders</Link>
        {cartItems.length > 0 && (
          <Link href="/cart">Cart ({cartItems.length})</Link>
        )}
        {hasProcessing && currentOrderId && (
          <Link href={`/orders/${currentOrderId}`}>
            <Clock className="w-6 h-6" />
          </Link>
        )}
      </nav>
    </header>
  );
}

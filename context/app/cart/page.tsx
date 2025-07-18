"use client";
import { useCart } from "@/context/cartContext";
import Link from "next/link";

export default function CartPage() {
  const { cartItems, removeFromCart } = useCart();

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Your Cart</h1>
      {cartItems.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <ul className="space-y-4">
          {cartItems.map((item) => (
            <li key={item.id} className="flex justify-between border-b pb-2">
              <div>
                <h2>{item.name}</h2>
                <p>Quantity: {item.quantity}</p>
              </div>
              <div>
                <p>{(item.price * item.quantity).toFixed(2)} MYR</p>
                <button onClick={() => removeFromCart(item.id)} className="text-red-500 text-sm">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 font-bold">Total: {total.toFixed(2)} MYR</p>
      <Link href="/checkout" className="mt-4 inline-block bg-green-600 text-white px-4 py-2 rounded">Proceed to Checkout</Link>
    </div>
  );
}
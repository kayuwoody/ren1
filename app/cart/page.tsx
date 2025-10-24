"use client";
import { useCart } from "@/context/cartContext";
import Link from "next/link";

export default function CartPage() {
  const { cartItems, removeFromCart } = useCart();

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Your Cart</h1>

      {cartItems.length === 0 ? (
        <div className="space-y-4">
          <p className="text-gray-600">Your cart is empty.</p>
          <Link
            href="/products"
            className="inline-block w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition text-center"
          >
            Browse Menu
          </Link>
        </div>
      ) : (
        <>
          {/* Cart summary with remove buttons */}
          <ul className="mb-4 space-y-2">
            {cartItems.map((item) => (
              <li key={item.productId} className="flex justify-between items-center border-b pb-2">
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">
                    RM {(item.price * item.quantity).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-right font-semibold">
            Total: RM {total.toFixed(2)}
          </p>

          <Link
            href="/payment"
            className="block w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition text-center"
          >
            Proceed to Payment
          </Link>
        </>
      )}
    </div>
  );
}

// app/cart/CartPage.tsx
import React from "react";
import { CartItem } from "@/components/cart/CartItem";
import { useCart } from "@/context/cartContext";
import { useRouter } from "next/router";

const CartPage: React.FC = () => {
  const { cartItems, removeFromCart, clearCart } = useCart();
  const router = useRouter();

  const handleCheckout = () => {
    router.push("/checkout");
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.retailPrice * item.quantity), 0);
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>
      {cartItems.length === 0 ? (
        <p className="text-gray-600">Your cart is empty.</p>
      ) : (
        <div>
          {cartItems.map((item) => (
            <CartItem
              key={item.productId}
              name={item.name}
              quantity={item.quantity}
              price={item.retailPrice}
              customizations={undefined}
              onRemove={() => removeFromCart(item.productId)}
            />
          ))}
          <div className="border-t pt-4 mt-4">
            <p className="text-lg font-semibold">
              Total: RM {getTotalPrice().toFixed(2)}
            </p>
            <button
              onClick={handleCheckout}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;

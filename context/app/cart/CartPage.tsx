// app/cart/CartPage.tsx
import React, { useContext } from "react";
import { CartItem } from "@/components/cart/CartItem";
import { CartContext } from "@/context/cartContext";
import { useRouter } from "next/router";

const CartPage: React.FC = () => {
  const { cartItems, removeItem, getTotalPrice } = useContext(CartContext);
  const router = useRouter();

  const handleCheckout = () => {
    router.push("/checkout");
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>
      {cartItems.length === 0 ? (
        <p className="text-gray-600">Your cart is empty.</p>
      ) : (
        <div>
          {cartItems.map((item, index) => (
            <CartItem
              key={index}
              name={item.name}
              quantity={item.quantity}
              price={item.price}
              customizations={item.customizations}
              onRemove={() => removeItem(index)}
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

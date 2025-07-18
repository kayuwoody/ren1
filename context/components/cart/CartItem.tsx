// components/cart/CartItem.tsx
import React from "react";

interface CartItemProps {
  name: string;
  quantity: number;
  price: number;
  customizations?: string[];
  onRemove: () => void;
}

export const CartItem: React.FC<CartItemProps> = ({
  name,
  quantity,
  price,
  customizations = [],
  onRemove,
}) => {
  return (
    <div className="p-4 border rounded-md shadow mb-2 bg-white">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-sm text-gray-500">Qty: {quantity}</p>
          <p className="text-sm text-gray-500">RM {price.toFixed(2)}</p>
          {customizations.length > 0 && (
            <ul className="text-sm text-gray-600 mt-1">
              {customizations.map((option, idx) => (
                <li key={idx}>• {option}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-red-600 text-sm hover:underline"
        >
          Remove
        </button>
      </div>
    </div>
  );
};

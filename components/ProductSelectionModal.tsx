"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface SelectionGroup {
  uniqueKey: string;        // Unique identifier for this group (e.g., "root:Pastry" or "Americano:Temperature")
  groupName: string;        // Display name for the group
  items: Array<{
    id: string;
    name: string;
    priceAdjustment: number;
  }>;
}

interface RecipeConfig {
  mandatoryGroups: SelectionGroup[];
  mandatoryIndividual: Array<{
    id: string;
    type: string;
    name: string;
    sku?: string;
    quantity: number;
    unit: string;
    cost: number;
  }>;
  optional: Array<{
    id: string;
    name: string;
    priceAdjustment: number;
  }>;
}

interface Product {
  id: number;
  localId: string;
  name: string;
  sku: string;
  basePrice: number;
  unitCost: number;
  comboPriceOverride?: number;
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  recipe: RecipeConfig;
  isCombo: boolean; // Whether this is a combo product (has 'combo' category)
  onAddToCart: (bundle: {
    displayName: string;
    baseProduct: Product;
    selectedMandatory: Record<string, string>; // groupName -> selectedItemId
    selectedOptional: string[]; // array of item IDs
    totalPrice: number;
    isCombo: boolean; // Pass isCombo flag to handler
  }) => void;
}

export default function ProductSelectionModal({
  isOpen,
  onClose,
  product,
  recipe,
  isCombo,
  onAddToCart,
}: ProductSelectionModalProps) {
  // State for selections
  const [mandatorySelections, setMandatorySelections] = useState<Record<string, string>>({});
  const [optionalSelections, setOptionalSelections] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");

  // Initialize mandatory selections with first item of each group
  useEffect(() => {
    if (isOpen) {
      const initialSelections: Record<string, string> = {};
      recipe.mandatoryGroups.forEach((group) => {
        if (group.items.length > 0) {
          // Use uniqueKey instead of groupName
          initialSelections[group.uniqueKey] = group.items[0].id;
        }
      });
      setMandatorySelections(initialSelections);
      setOptionalSelections(new Set());
      setError("");
    }
  }, [isOpen, recipe]);

  // Calculate total price based on selections
  const calculateTotal = () => {
    // If combo price override is set, use that exact price
    if (product.comboPriceOverride !== undefined && product.comboPriceOverride !== null) {
      return product.comboPriceOverride;
    }

    // Start with base price
    let total = product.basePrice;

    // Add price adjustments from mandatory selections (using uniqueKey)
    recipe.mandatoryGroups.forEach((group) => {
      const selectedId = mandatorySelections[group.uniqueKey];
      const selectedItem = group.items.find((item) => item.id === selectedId);
      if (selectedItem) {
        total += selectedItem.priceAdjustment;
      }
    });

    // Add price adjustments from optional selections
    recipe.optional.forEach((item) => {
      if (optionalSelections.has(item.id)) {
        total += item.priceAdjustment;
      }
    });

    return total;
  };

  // Build display name
  const buildDisplayName = () => {
    const parts: string[] = [];

    // For combo products: use clean base name only (variants show in component breakdown)
    // For regular products: include variant names in the product name
    if (isCombo) {
      // Combo product - just use base name (e.g., "✨ Wake-Up Wonder")
      parts.push(product.name);
    } else {
      // Regular product - include selected variants in name (e.g., "Hot Latte")
      recipe.mandatoryGroups.forEach((group) => {
        const selectedId = mandatorySelections[group.uniqueKey];
        const selectedItem = group.items.find((item) => item.id === selectedId);
        if (selectedItem) {
          parts.push(selectedItem.name);
        }
      });
      parts.push(product.name);
    }

    // Add selected optional items (if any)
    recipe.optional.forEach((item) => {
      if (optionalSelections.has(item.id)) {
        parts.push(`+ ${item.name}`);
      }
    });

    return parts.join(" ");
  };

  const handleAddToCart = () => {
    // Validate all mandatory groups have selections
    for (const group of recipe.mandatoryGroups) {
      if (!mandatorySelections[group.uniqueKey]) {
        setError(`Please select a ${group.groupName}`);
        return;
      }
    }

    onAddToCart({
      displayName: buildDisplayName(),
      baseProduct: product,
      selectedMandatory: mandatorySelections,
      selectedOptional: Array.from(optionalSelections),
      totalPrice: calculateTotal(),
      isCombo, // Include isCombo flag
    });

    onClose();
  };

  const toggleOptional = (itemId: string) => {
    const newSet = new Set(optionalSelections);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setOptionalSelections(newSet);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Build Your {product.name}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Mandatory Selection Groups (XOR choices) - Now includes nested groups! */}
          {recipe.mandatoryGroups.map((group) => (
            <div key={group.uniqueKey} className="space-y-2">
              <label className="block font-semibold text-gray-700">
                Choose {group.groupName}: <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition"
                  >
                    <input
                      type="radio"
                      name={group.uniqueKey}
                      value={item.id}
                      checked={mandatorySelections[group.uniqueKey] === item.id}
                      onChange={(e) =>
                        setMandatorySelections({
                          ...mandatorySelections,
                          [group.uniqueKey]: e.target.value,
                        })
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="ml-3 flex-1">{item.name}</span>
                    {item.priceAdjustment !== 0 && (
                      <span className="text-sm text-gray-600">
                        {item.priceAdjustment > 0 ? '+' : ''}RM {item.priceAdjustment.toFixed(2)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Optional Add-ons */}
          {recipe.optional.length > 0 && (
            <div className="space-y-2">
              <label className="block font-semibold text-gray-700">
                Optional Add-ons:
              </label>
              <div className="space-y-2">
                {recipe.optional.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition"
                  >
                    <input
                      type="checkbox"
                      checked={optionalSelections.has(item.id)}
                      onChange={() => toggleOptional(item.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="ml-3 flex-1">{item.name}</span>
                    {item.priceAdjustment !== 0 && (
                      <span className="text-sm text-gray-600">
                        {item.priceAdjustment > 0 ? '+' : ''}RM {item.priceAdjustment.toFixed(2)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Mandatory Individual Items (informational) */}
          {recipe.mandatoryIndividual.length > 0 && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">Includes:</p>
              <ul className="text-sm text-gray-700 list-disc list-inside">
                {recipe.mandatoryIndividual.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t p-4 space-y-3">
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total:</span>
            <span>RM {calculateTotal().toFixed(2)}</span>
          </div>
          <button
            onClick={handleAddToCart}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

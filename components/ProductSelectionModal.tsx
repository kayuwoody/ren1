"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface SelectionGroup {
  uniqueKey: string;        // Unique identifier for this group (e.g., "root:Pastry" or "Americano:Temperature")
  groupName: string;        // Display name for the group
  items: Array<{
    id: string;
    name: string;
    basePrice: number;      // Product's base/sales price
    priceAdjustment?: number; // Extra charge on top of combo override
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
    basePrice: number;      // Product's base/sales price
    pwpPrice?: number | null; // PWP/add-on price (charged instead of basePrice as an add-on)
    priceAdjustment?: number; // Extra charge on top of combo override
    parentProductId?: string; // For combos: the drink option this add-on belongs to
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
  isCoffee?: boolean; // Whether this is a coffee (shows the sugar-level selector)
  onAddToCart: (bundle: {
    displayName: string;
    baseProduct: Product;
    selectedMandatory: Record<string, string>; // groupName -> selectedItemId
    selectedOptional: string[]; // array of item IDs
    totalPrice: number;
    isCombo: boolean; // Pass isCombo flag to handler
    sugarLevel?: string; // 'zero' | 'less' | 'medium' | 'sweet' (coffee only)
  }) => void;
}

// Sugar levels: zero is the default (no note); others show on all displays.
const SUGAR_LEVELS: { value: string; label: string; short: string }[] = [
  { value: 'zero', label: 'No Sugar', short: '' },
  { value: 'less', label: 'Less', short: 'Less Sugar' },
  { value: 'medium', label: 'Medium', short: 'Medium Sugar' },
  { value: 'sweet', label: 'Sweet', short: 'Sweet' },
];

export default function ProductSelectionModal({
  isOpen,
  onClose,
  product,
  recipe,
  isCombo,
  isCoffee,
  onAddToCart,
}: ProductSelectionModalProps) {
  // State for selections
  const [mandatorySelections, setMandatorySelections] = useState<Record<string, string>>({});
  const [optionalSelections, setOptionalSelections] = useState<Set<string>>(new Set());
  const [sugarLevel, setSugarLevel] = useState<string>('zero');
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
      setSugarLevel('zero');
      setError("");
    }
  }, [isOpen, recipe]);

  // Calculate total price based on selections
  const hasComboOverride = product.comboPriceOverride !== undefined &&
    product.comboPriceOverride !== null &&
    product.comboPriceOverride > 0;

  const calculateTotal = () => {
    if (hasComboOverride) {
      // Combo override: fixed base + sum of selected items' priceAdjustment
      let adjustments = 0;
      recipe.mandatoryGroups.filter(isGroupActive).forEach((group) => {
        const selectedId = mandatorySelections[group.uniqueKey];
        const selectedItem = group.items.find((item) => item.id === selectedId);
        if (selectedItem) {
          adjustments += selectedItem.priceAdjustment || 0;
        }
      });
      activeOptionals.forEach((item) => {
        if (optionalSelections.has(item.id)) {
          adjustments += item.priceAdjustment || 0;
        }
      });
      return product.comboPriceOverride! + adjustments;
    }

    // For non-combo products, start with the base product price
    // For combos without override, sum component prices
    let total = isCombo ? 0 : product.basePrice;

    recipe.mandatoryGroups.filter(isGroupActive).forEach((group) => {
      const selectedId = mandatorySelections[group.uniqueKey];
      const selectedItem = group.items.find((item) => item.id === selectedId);
      if (selectedItem) {
        total += selectedItem.basePrice;
      }
    });

    activeOptionals.forEach((item) => {
      if (optionalSelections.has(item.id)) {
        // Add-ons charge the PWP price when set, else the base price
        total += item.pwpPrice ?? item.basePrice;
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

    // Selected add-ons are shown as structured sub-lines (not in the name).

    // Add sugar level note (only when not the default 'zero')
    const sugar = SUGAR_LEVELS.find(s => s.value === sugarLevel);
    if (sugar && sugar.short) {
      parts.push(`(${sugar.short})`);
    }

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

    // Only pass add-ons from the active (selected) branch
    const activeOptionalIds = new Set(activeOptionals.map((o) => o.id));
    onAddToCart({
      displayName: buildDisplayName(),
      baseProduct: product,
      selectedMandatory: mandatorySelections,
      selectedOptional: Array.from(optionalSelections).filter((id) => activeOptionalIds.has(id)),
      totalPrice: calculateTotal(),
      isCombo, // Include isCombo flag
      sugarLevel: isCoffee ? sugarLevel : undefined,
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

  // Separate top-level and nested groups
  const topLevelGroups = recipe.mandatoryGroups.filter(g => g.uniqueKey.startsWith('root:'));
  const nestedGroups = recipe.mandatoryGroups.filter(g => !g.uniqueKey.startsWith('root:'));

  // Get all item IDs that are part of top-level XOR groups
  const topLevelItemIds = new Set(
    topLevelGroups.flatMap(group => group.items.map(item => item.id))
  );

  // Find nested groups whose parent is NOT in any top-level group (standalone items with nested XORs)
  const standaloneNestedGroups = nestedGroups.filter(nestedGroup => {
    const parentItemId = nestedGroup.uniqueKey.split(':')[0];
    return !topLevelItemIds.has(parentItemId);
  });

  // Helper to get nested groups for a specific parent item ID
  const getNestedGroupsForItem = (itemId: string) => {
    return nestedGroups.filter(g => g.uniqueKey.startsWith(`${itemId}:`));
  };

  // Products belonging to an XOR branch that is NOT currently selected. Their
  // nested groups and add-ons must not show or count — e.g. in a combo with 4
  // drink options, only the chosen drink's "extra shot" / milk should apply.
  // Propagates down so a nested choice under an unselected drink is inactive too.
  const inactiveParents = new Set<string>();
  recipe.mandatoryGroups.forEach((group) => {
    const selectedId = mandatorySelections[group.uniqueKey];
    group.items.forEach((item) => {
      if (item.id !== selectedId) inactiveParents.add(item.id);
    });
  });
  let changed = true;
  while (changed) {
    changed = false;
    nestedGroups.forEach((group) => {
      const parentId = group.uniqueKey.split(':')[0];
      if (inactiveParents.has(parentId)) {
        group.items.forEach((item) => {
          if (!inactiveParents.has(item.id)) { inactiveParents.add(item.id); changed = true; }
        });
      }
    });
  }
  const isGroupActive = (group: { uniqueKey: string }) => {
    const parentId = group.uniqueKey.split(':')[0];
    return parentId === 'root' || !inactiveParents.has(parentId);
  };
  const isOptionalActive = (opt: { parentProductId?: string }) =>
    !opt.parentProductId || !inactiveParents.has(opt.parentProductId);

  const activeOptionals = recipe.optional.filter(isOptionalActive);

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

          {/* Mandatory Selection Groups (XOR choices) - With inline nested groups */}
          {topLevelGroups.map((group) => (
            <div key={group.uniqueKey} className="space-y-2">
              <label className="block font-semibold text-gray-700">
                Choose {group.groupName}: <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isSelected = mandatorySelections[group.uniqueKey] === item.id;
                  const itemNestedGroups = getNestedGroupsForItem(item.id);

                  return (
                    <div key={item.id}>
                      {/* Parent item */}
                      <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                        <input
                          type="radio"
                          name={group.uniqueKey}
                          value={item.id}
                          checked={isSelected}
                          onChange={(e) =>
                            setMandatorySelections({
                              ...mandatorySelections,
                              [group.uniqueKey]: e.target.value,
                            })
                          }
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="ml-3 flex-1">{item.name}</span>
                        <span className="text-sm text-gray-600">
                          {hasComboOverride
                            ? (item.priceAdjustment ? `+RM ${item.priceAdjustment.toFixed(2)}` : 'Included')
                            : `RM ${item.basePrice.toFixed(2)}`
                          }
                        </span>
                      </label>

                      {/* Nested groups - only show if this item is selected */}
                      {isSelected && itemNestedGroups.map((nestedGroup) => (
                        <div key={nestedGroup.uniqueKey} className="ml-8 mt-2 space-y-2">
                          <label className="block text-sm font-semibold text-gray-600">
                            {nestedGroup.groupName}: <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-1">
                            {nestedGroup.items.map((nestedItem) => (
                              <label
                                key={nestedItem.id}
                                className="flex items-center p-2 border rounded cursor-pointer hover:bg-gray-50 transition text-sm"
                              >
                                <input
                                  type="radio"
                                  name={nestedGroup.uniqueKey}
                                  value={nestedItem.id}
                                  checked={mandatorySelections[nestedGroup.uniqueKey] === nestedItem.id}
                                  onChange={(e) =>
                                    setMandatorySelections({
                                      ...mandatorySelections,
                                      [nestedGroup.uniqueKey]: e.target.value,
                                    })
                                  }
                                  className="w-4 h-4 text-blue-600"
                                />
                                <span className="ml-2 flex-1">{nestedItem.name}</span>
                                <span className="text-xs text-gray-600">
                                  {hasComboOverride
                                    ? (nestedItem.priceAdjustment ? `+RM ${nestedItem.priceAdjustment.toFixed(2)}` : 'Included')
                                    : `RM ${nestedItem.basePrice.toFixed(2)}`
                                  }
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Standalone nested XOR groups (for items not in top-level groups) */}
          {standaloneNestedGroups.map((nestedGroup) => (
            <div key={nestedGroup.uniqueKey} className="space-y-2">
              <label className="block font-semibold text-gray-700">
                Choose {nestedGroup.groupName}: <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {nestedGroup.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition"
                  >
                    <input
                      type="radio"
                      name={nestedGroup.uniqueKey}
                      value={item.id}
                      checked={mandatorySelections[nestedGroup.uniqueKey] === item.id}
                      onChange={(e) =>
                        setMandatorySelections({
                          ...mandatorySelections,
                          [nestedGroup.uniqueKey]: e.target.value,
                        })
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="ml-3 flex-1">{item.name}</span>
                    <span className="text-sm text-gray-600">
                      {hasComboOverride
                        ? (item.priceAdjustment ? `+RM ${item.priceAdjustment.toFixed(2)}` : 'Included')
                        : `RM ${item.basePrice.toFixed(2)}`
                      }
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Optional Add-ons */}
          {activeOptionals.length > 0 && (
            <div className="space-y-2">
              <label className="block font-semibold text-gray-700">
                Optional Add-ons:
              </label>
              <div className="space-y-2">
                {activeOptionals.map((item) => (
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
                    <span className="text-sm text-gray-600">
                      {hasComboOverride
                        ? (item.priceAdjustment ? `+RM ${item.priceAdjustment.toFixed(2)}` : 'Included')
                        : `+RM ${(item.pwpPrice ?? item.basePrice).toFixed(2)}`
                      }
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Sugar level (coffee only) */}
          {isCoffee && (
            <div className="space-y-2">
              <label className="block font-semibold text-gray-700">Sugar Level:</label>
              <div className="grid grid-cols-4 gap-2">
                {SUGAR_LEVELS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSugarLevel(s.value)}
                    className={`py-2 rounded-lg text-sm font-medium border transition ${
                      sugarLevel === s.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
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

# Supabase Product Catalog Schema

Run this SQL in the Supabase SQL Editor to create the shared product catalog tables.

## Create Tables

```sql
-- Products table (synced from POS SQLite)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,                    -- UUID from POS (e.g. "a1b2c3d4-...")
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',
  base_price NUMERIC NOT NULL DEFAULT 0,  -- retail price in RM
  image_url TEXT,
  combo_price_override NUMERIC,           -- if set, overrides calculated combo price
  available_online BOOLEAN DEFAULT true,  -- staff can toggle off to hide from customer menu
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Recipe items (combo/bundle structure — synced from POS)
-- Only stores structure for customer app display (XOR groups, optional items)
-- Material-level COGS data stays in POS SQLite
CREATE TABLE IF NOT EXISTS product_recipe_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'material',  -- 'material' or 'product'
  linked_product_id TEXT REFERENCES products(id),
  linked_product_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unit',
  is_optional BOOLEAN DEFAULT false,
  selection_group TEXT,                    -- XOR group name (e.g. "Choose Drink")
  price_adjustment NUMERIC DEFAULT 0,     -- e.g. +2.00 for iced upgrade
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_product ON product_recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_linked ON product_recipe_items(linked_product_id);

-- Enable Realtime on products table (optional — for live menu updates)
ALTER PUBLICATION supabase_realtime ADD TABLE products;
```

## How the Customer App Should Use This

### Fetch the menu

```typescript
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('available_online', true)
  .order('category', { ascending: true })
  .order('name', { ascending: true });
```

### Fetch combo/bundle structure for a product

```typescript
const { data: recipeItems } = await supabase
  .from('product_recipe_items')
  .select(`
    id, item_type, linked_product_id, linked_product_name,
    quantity, unit, is_optional, selection_group, price_adjustment, sort_order
  `)
  .eq('product_id', productId)
  .order('sort_order', { ascending: true });
```

### Determine if a product is a combo

A product is a combo if it has `product_recipe_items` with `item_type = 'product'`.

```typescript
const isCombo = recipeItems.some(item => item.item_type === 'product');
```

### XOR Selection Groups

Items with the same `selection_group` value are mutually exclusive choices. The customer must pick exactly one from each group.

Example for "Nasi Lemak Combo":
| selection_group | linked_product_name | price_adjustment |
|---|---|---|
| Choose Drink | Flat White | 0 |
| Choose Drink | Americano | 0 |
| Choose Drink | Iced Latte | 2.00 |
| null | Nasi Lemak Bungkus | 0 |

- Items with `selection_group = null` and `is_optional = false` are always included
- Items with `is_optional = true` are optional add-ons (customer can toggle on/off)

### Nested XOR (e.g. Hot/Iced for each drink)

If a linked product itself has recipe items with selection groups, the customer app should fetch those too and present nested selection. For example, each coffee option might have a "Temperature" group with Hot/Iced options.

```typescript
// For each linked product in a selection group, check if IT has selections too
for (const item of recipeItems.filter(i => i.linked_product_id)) {
  const { data: nestedItems } = await supabase
    .from('product_recipe_items')
    .select('*')
    .eq('product_id', item.linked_product_id)
    .not('selection_group', 'is', null)
    .order('sort_order');
  // If nestedItems exist, show nested selection UI
}
```

### Price Calculation for Combos

```
finalPrice = product.combo_price_override ?? product.base_price
           + SUM(selected items' price_adjustment)
```

### Order Items Should Include

When creating `online_order_items`, use the product's UUID as `product_id`:

```typescript
{
  product_id: product.id,      // UUID from products table
  product_name: product.name,
  qty: quantity,
  unit_price: finalPrice,
  mods: {
    size: "Large",
    milk: "Oat",
    // ... customer selections
  }
}
```

For combos, also include the selected components so the kitchen knows what to make:

```typescript
{
  product_id: comboProduct.id,
  product_name: "Nasi Lemak Combo",
  qty: 1,
  unit_price: 9.40,
  mods: {
    combo_selections: {
      "Choose Drink": { id: "flat-white-uuid", name: "Flat White" },
      "Temperature": { id: "hot-uuid", name: "Hot" }
    },
    notes: "Extra sambal"
  }
}
```

## Sync Behavior

- POS is the source of truth for product data
- On every product create/update/delete in POS, data auto-syncs to Supabase
- On every recipe change in POS, recipe items auto-sync to Supabase
- If internet is down, changes queue locally and sync when connectivity returns
- Manual full sync available at `POST /api/admin/catalog-sync`

## Initial Population

After creating the tables, trigger a full sync from the POS:

```bash
curl -X POST http://localhost:3000/api/admin/catalog-sync \
  -H "Content-Type: application/json" \
  -d '{}'
```

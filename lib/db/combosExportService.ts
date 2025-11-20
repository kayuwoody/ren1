import { getAllProducts } from './productService';
import { getAllMaterials } from './materialService';
import { getProductRecipe } from './recipeService';

/**
 * Combos Export Service
 *
 * Exports all products, materials, and recipes from SQLite to JSON format
 * for uploading to Vercel Blob storage (used by customer-facing app)
 */

export interface ComboProduct {
  id: string;
  wcId?: number;
  name: string;
  sku: string;
  category: string;
  basePrice: number;
  supplierCost: number;
  unitCost: number;
  comboPriceOverride?: number;
  imageUrl?: string;
}

export interface ComboMaterial {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  costPerUnit: number;
}

export interface ComboRecipeItem {
  id: string;
  productId: string;
  itemType: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  materialName?: string;
  linkedProductName?: string;
  quantity: number;
  unit: string;
  calculatedCost: number;
  isOptional: boolean;
  selectionGroup?: string;
  sortOrder: number;
}

export interface CombosExport {
  products: ComboProduct[];
  materials: ComboMaterial[];
  recipes: ComboRecipeItem[];
  exportedAt: string;
  version: string;
}

/**
 * Export all combos data to JSON format
 */
export function exportCombosToJSON(): CombosExport {
  console.log('📦 Exporting combos from SQLite...');

  // Get all products
  const allProducts = getAllProducts();
  const products: ComboProduct[] = allProducts.map(p => ({
    id: p.id,
    wcId: p.wcId,
    name: p.name,
    sku: p.sku,
    category: p.category,
    basePrice: p.basePrice,
    supplierCost: p.supplierCost,
    unitCost: p.unitCost,
    comboPriceOverride: p.comboPriceOverride,
    imageUrl: p.imageUrl,
  }));

  console.log(`  ✓ Exported ${products.length} products`);

  // Get all materials
  const allMaterials = getAllMaterials();
  const materials: ComboMaterial[] = allMaterials.map(m => ({
    id: m.id,
    name: m.name,
    category: m.category,
    purchaseUnit: m.purchaseUnit,
    costPerUnit: m.costPerUnit,
  }));

  console.log(`  ✓ Exported ${materials.length} materials`);

  // Get all recipes (for all products)
  const recipes: ComboRecipeItem[] = [];
  allProducts.forEach(product => {
    const recipe = getProductRecipe(product.id);
    recipe.forEach(item => {
      recipes.push({
        id: item.id,
        productId: item.productId,
        itemType: item.itemType,
        materialId: item.materialId,
        linkedProductId: item.linkedProductId,
        materialName: item.materialName,
        linkedProductName: item.linkedProductName,
        quantity: item.quantity,
        unit: item.unit,
        calculatedCost: item.calculatedCost,
        isOptional: item.isOptional,
        selectionGroup: item.selectionGroup,
        sortOrder: item.sortOrder,
      });
    });
  });

  console.log(`  ✓ Exported ${recipes.length} recipe items`);

  const exportData: CombosExport = {
    products,
    materials,
    recipes,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  };

  console.log('✅ Combos export complete');

  return exportData;
}

/**
 * Export combos to JSON string (for file writing or API response)
 */
export function exportCombosToJSONString(): string {
  const data = exportCombosToJSON();
  return JSON.stringify(data, null, 2);
}

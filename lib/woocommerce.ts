import woo from './wooApi';

export interface WooProduct {
  id: number;
  name: string;
  price: string;
  sku: string;
  images: Array<{ src: string }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  stock_quantity: number;
}

/**
 * Get product by ID from WooCommerce
 */
export async function getProductById(id: string): Promise<WooProduct | null> {
  try {
    const { data } = await woo.get(`products/${id}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch product ${id}:`, error);
    return null;
  }
}

/**
 * Get all products from WooCommerce
 */
export async function getAllProducts(): Promise<WooProduct[]> {
  try {
    const { data } = await woo.get('products');
    return data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
}

/**
 * Get products by category from WooCommerce
 */
export async function getProductsByCategory(categoryId: number): Promise<WooProduct[]> {
  try {
    const { data } = await woo.get('products', { category: categoryId });
    return data;
  } catch (error) {
    console.error(`Failed to fetch products for category ${categoryId}:`, error);
    return [];
  }
}

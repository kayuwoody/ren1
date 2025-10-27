/**
 * API Route: Update Product COGS
 * PUT /api/admin/products/:productId/cost
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateProductCost, getProduct } from '@/lib/db/productService';
import { saveProductCostBreakdown } from '@/lib/db/productService';

export async function PUT(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;
    const body = await request.json();

    const {
      unitCost,
      costBreakdown, // Optional detailed breakdown
    } = body;

    if (typeof unitCost !== 'number' || unitCost < 0) {
      return NextResponse.json(
        { error: 'Invalid unit cost' },
        { status: 400 }
      );
    }

    // Get existing product
    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Update product unit cost
    updateProductCost(productId, unitCost);

    // If detailed cost breakdown provided, save it
    if (costBreakdown) {
      const {
        ingredientCosts = [],
        packagingCosts = [],
        consumables = [],
      } = costBreakdown;

      const totalIngredientCost = ingredientCosts.reduce(
        (sum: number, item: any) => sum + (item.cost || 0),
        0
      );
      const totalPackagingCost = packagingCosts.reduce(
        (sum: number, item: any) => sum + (item.cost || 0),
        0
      );
      const totalConsumableCost = consumables.reduce(
        (sum: number, item: any) => sum + (item.cost || 0),
        0
      );

      const totalCost = totalIngredientCost + totalPackagingCost + totalConsumableCost;
      const grossProfit = product.currentPrice - totalCost;
      const grossMargin = product.currentPrice > 0
        ? (grossProfit / product.currentPrice) * 100
        : 0;

      saveProductCostBreakdown({
        productId,
        ingredientCosts,
        totalIngredientCost,
        packagingCosts,
        totalPackagingCost,
        consumables,
        totalConsumableCost,
        totalCost,
        sellingPrice: product.currentPrice,
        grossProfit,
        grossMargin,
      });
    }

    // Return updated product
    const updatedProduct = getProduct(productId);

    return NextResponse.json({
      success: true,
      product: updatedProduct,
    });
  } catch (error: any) {
    console.error('Error updating product cost:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product cost' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;

    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product,
    });
  } catch (error: any) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

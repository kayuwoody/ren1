/**
 * API Route: Product Recipe Management
 * GET /api/admin/recipes/[productId] - Get product recipe
 * PUT /api/admin/recipes/[productId] - Update product recipe
 * DELETE /api/admin/recipes/[productId] - Clear product recipe
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRecipeWithMaterials,
  setProductRecipe,
  clearProductRecipe,
  addRecipeItem,
  deleteRecipeItem,
  getRecipeSummary,
} from '@/lib/db/recipeService';
import { getProduct } from '@/lib/db/productService';

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

    const recipeSummary = getRecipeSummary(productId);

    // Format recipe to match frontend expectations
    const recipe = recipeSummary.items.length > 0 ? {
      productId: product.id,
      productName: product.name,
      items: recipeSummary.items,
      totalCost: recipeSummary.totalRequiredCost,
      totalOptionalCost: recipeSummary.totalOptionalCost,
    } : null;

    return NextResponse.json({ recipe });
  } catch (error: any) {
    console.error('Error fetching recipe:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recipe' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;
    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Invalid recipe items' },
        { status: 400 }
      );
    }

    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Replace entire recipe
    setProductRecipe(productId, items);

    // Get updated recipe with proper formatting
    const recipeSummary = getRecipeSummary(productId);
    const recipe = {
      productId: product.id,
      productName: product.name,
      items: recipeSummary.items,
      totalCost: recipeSummary.totalRequiredCost,
      totalOptionalCost: recipeSummary.totalOptionalCost,
    };

    return NextResponse.json({
      recipe,
      message: 'Recipe updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating recipe:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update recipe' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    clearProductRecipe(productId);

    return NextResponse.json({
      success: true,
      message: 'Recipe cleared successfully'
    });
  } catch (error: any) {
    console.error('Error clearing recipe:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear recipe' },
      { status: 500 }
    );
  }
}

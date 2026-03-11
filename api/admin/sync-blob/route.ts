import { NextResponse } from 'next/server';
import { uploadCombosToVercelBlob, isVercelBlobConfigured } from '@/lib/vercelBlobService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * POST /api/admin/sync-blob
 *
 * Manually trigger sync of combos.json to Vercel Blob
 * Useful for updating customer app after recipe changes without full WooCommerce sync
 */
export async function POST(req: Request) {
  try {
    if (!isVercelBlobConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Vercel Blob not configured. Set bin2_READ_WRITE_TOKEN environment variable.',
        },
        { status: 400 }
      );
    }

    console.log('☁️  Manual blob sync triggered...');
    const blobUrl = await uploadCombosToVercelBlob();

    return NextResponse.json({
      success: true,
      message: 'Combos successfully synced to Vercel Blob',
      blobUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/sync-blob');
  }
}

/**
 * GET /api/admin/sync-blob
 *
 * Check Vercel Blob configuration status
 */
export async function GET(req: Request) {
  const configured = isVercelBlobConfigured();

  return NextResponse.json({
    configured,
    message: configured
      ? 'Vercel Blob is configured and ready'
      : 'Vercel Blob not configured. Set bin2_READ_WRITE_TOKEN environment variable.',
  });
}

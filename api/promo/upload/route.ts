import { NextResponse } from 'next/server';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { wcApi } from '@/lib/wooClient';

/**
 * Upload promo image to WooCommerce media library
 * POST /api/promo/upload
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;
    const productId = formData.get('productId') as string; // Optional - to associate with product

    if (!file) {
      return validationError('File is required', '/api/promo/upload');
    }

    if (!filename) {
      return validationError('Filename is required', '/api/promo/upload');
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to WooCommerce media library
    // Note: The WooCommerce client handles file uploads with just endpoint and data
    const mediaResponse = await wcApi.post('media', {
      file: buffer,
      title: filename,
    });

    const media = (mediaResponse as any).data;

    console.log('✅ Promo image uploaded to WooCommerce:', {
      id: media.id,
      url: media.source_url,
      filename: media.title.rendered,
    });

    // If productId provided, associate image with product
    if (productId) {
      try {
        await wcApi.put(`products/${productId}`, {
          images: [
            {
              id: media.id,
              src: media.source_url,
            },
          ],
        });
        console.log(`✅ Associated promo image with product ${productId}`);
      } catch (err) {
        console.error('⚠️ Failed to associate image with product:', err);
        // Don't fail the whole request if association fails
      }
    }

    return NextResponse.json({
      success: true,
      media: {
        id: media.id,
        url: media.source_url,
        alt: media.alt_text,
        title: media.title.rendered,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/promo/upload');
  }
}

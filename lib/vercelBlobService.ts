import { put } from '@vercel/blob';
import { exportCombosToJSONString } from './db/combosExportService';

/**
 * Vercel Blob Service
 *
 * Uploads combos.json to Vercel Blob storage for consumption by bin2 (customer app)
 *
 * Requirements:
 * - bin2_READ_WRITE_TOKEN environment variable must be set
 * - This token should be from the Vercel project running bin2
 */

/**
 * Upload combos data to Vercel Blob storage
 *
 * @returns URL of the uploaded blob
 */
export async function uploadCombosToVercelBlob(): Promise<string> {
  const token = process.env.bin2_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error('bin2_READ_WRITE_TOKEN environment variable is not set');
  }

  console.log('☁️  Uploading combos to Vercel Blob...');

  try {
    // Export combos from SQLite to JSON
    const combosJSON = exportCombosToJSONString();
    const dataSize = Buffer.byteLength(combosJSON, 'utf8');

    console.log(`  📊 Data size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Upload to Vercel Blob with public access
    const blob = await put('combos.json', combosJSON, {
      access: 'public',
      contentType: 'application/json',
      token,
    });

    console.log(`  ✅ Uploaded to: ${blob.url}`);
    console.log(`  🔗 Download URL: ${blob.downloadUrl}`);

    return blob.url;
  } catch (error: any) {
    console.error('❌ Failed to upload to Vercel Blob:', error);
    throw new Error(`Vercel Blob upload failed: ${error.message}`);
  }
}

/**
 * Check if Vercel Blob is configured
 */
export function isVercelBlobConfigured(): boolean {
  return !!process.env.bin2_READ_WRITE_TOKEN;
}

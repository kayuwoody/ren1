/**
 * Receipt Storage Service
 *
 * Uploads receipt HTML files to Supabase Storage.
 * Bucket: "receipts" (must be created as public in Supabase dashboard).
 *
 * Setup:
 *   1. Create a "receipts" bucket in Supabase Storage (set to public)
 *   2. Upload mascot.jpg to the bucket root
 */

import { supabase } from '@/lib/supabase';

const BUCKET = 'receipts';

export function getReceiptPublicUrl(orderId: string | number): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/order-${orderId}.html`;
}

export async function uploadReceiptHTML(orderId: string | number, htmlContent: string): Promise<string> {
  const filename = `order-${orderId}.html`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, htmlContent, {
      contentType: 'text/html',
      upsert: true,
    });

  if (error) {
    console.error('❌ Supabase Storage upload failed:', error);
    throw new Error(`Failed to upload receipt: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  console.log(`✅ Receipt uploaded: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}

export async function getReceiptUrl(orderId: string | number): Promise<string> {
  const filename = `order-${orderId}.html`;
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filename);
  return data.publicUrl;
}

export async function uploadMascotImage(imageBuffer: Buffer): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload('mascot.jpg', imageBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload mascot: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl('mascot.jpg');

  return data.publicUrl;
}

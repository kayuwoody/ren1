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
  return `https://www.coffee-oasis.com/receipts/${orderId}`;
}

export async function uploadReceiptHTML(orderId: string | number, htmlContent: string): Promise<string> {
  const filename = `order-${orderId}.html`;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Use REST API directly — the JS client ignores contentType and serves as text/plain
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'text/html; charset=utf-8',
        'x-upsert': 'true',
      },
      body: htmlContent,
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error('❌ Supabase Storage upload failed:', errBody);
    throw new Error(`Failed to upload receipt: ${res.status} ${errBody}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
  console.log(`✅ Receipt uploaded: ${publicUrl}`);
  return publicUrl;
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

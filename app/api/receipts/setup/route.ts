import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

const BUCKET = 'receipts';

export async function POST() {
  const results: string[] = [];

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);

  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      return NextResponse.json({ error: `Failed to create bucket: ${error.message}` }, { status: 500 });
    }
    results.push('Created "receipts" bucket (public)');
  } else {
    results.push('Bucket "receipts" already exists');
  }

  try {
    const mascotPath = join(process.cwd(), 'public', 'mascot.jpg');
    const mascotBuffer = readFileSync(mascotPath);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload('mascot.jpg', mascotBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      results.push(`Mascot upload failed: ${error.message}`);
    } else {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl('mascot.jpg');
      results.push(`Mascot uploaded: ${data.publicUrl}`);
    }
  } catch (err: any) {
    results.push(`Mascot not found in public/mascot.jpg: ${err.message}`);
  }

  return NextResponse.json({ success: true, results });
}

import { NextResponse } from 'next/server';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file) {
      return validationError('File is required', '/api/promo/upload');
    }

    if (!filename) {
      return validationError('Filename is required', '/api/promo/upload');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'promo');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, buffer);

    const url = `/uploads/promo/${safeName}`;

    console.log('✅ Promo image saved locally:', { filename: safeName, url });

    return NextResponse.json({
      success: true,
      media: {
        id: safeName,
        url,
        alt: '',
        title: filename,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/promo/upload');
  }
}

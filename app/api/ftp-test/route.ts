import { NextResponse } from 'next/server';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

export async function POST(req: Request) {
  try {
    const client = new Client();

    const host = process.env.FTP_HOST?.trim();
    const user = process.env.FTP_USER?.trim();
    const password = process.env.FTP_PASSWORD?.trim();

    console.log('🧪 FTP Test - Connecting...');

    await client.access({
      host,
      user,
      password,
      secure: false,
    });

    // Get current working directory
    const startDir = await client.pwd();
    console.log(`📍 FTP Start directory: ${startDir}`);

    // List files in root
    const rootFiles = await client.list();
    console.log(`📂 Files in ${startDir}:`, rootFiles.map(f => f.name).join(', '));

    // Try to navigate to public_html
    try {
      await client.cd('/public_html');
      const publicHtmlDir = await client.pwd();
      console.log(`📍 public_html directory: ${publicHtmlDir}`);

      const publicHtmlFiles = await client.list();
      console.log(`📂 Files in public_html:`, publicHtmlFiles.map(f => f.name).join(', '));
    } catch (err) {
      console.log('❌ Could not access /public_html');
    }

    // Create test file in receipts folder
    const testPath = '/public_html/receipts';
    await client.ensureDir(testPath);

    const testContent = `<!DOCTYPE html>
<html>
<head><title>FTP Test</title></head>
<body>
  <h1>FTP Upload Test - Success!</h1>
  <p>This file was uploaded via FTP at: ${new Date().toISOString()}</p>
  <p>Upload path: ${testPath}</p>
</body>
</html>`;

    const stream = Readable.from([testContent]);
    await client.uploadFrom(stream, 'ftp-test.html');

    console.log('✅ Test file uploaded to:', `${testPath}/ftp-test.html`);

    // List files in receipts folder
    const receiptsFiles = await client.list();
    console.log(`📂 Files in receipts folder:`, receiptsFiles.map(f => f.name).join(', '));

    client.close();

    return NextResponse.json({
      success: true,
      message: 'Test file uploaded',
      startDir,
      uploadPath: testPath,
      testUrl: 'https://coffee-oasis.com.my/receipts/ftp-test.html',
      filesInReceipts: receiptsFiles.map(f => f.name)
    });

  } catch (error: any) {
    console.error('❌ FTP test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

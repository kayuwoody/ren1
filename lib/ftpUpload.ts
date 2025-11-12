/**
 * FTP Upload Service
 *
 * Uploads static receipt HTML files to Hostinger via FTP.
 */

import { Client } from 'basic-ftp';

interface FTPConfig {
  host: string;
  user: string;
  password: string;
  receiptsPath: string;
}

function getFTPConfig(): FTPConfig {
  const host = process.env.FTP_HOST?.trim();
  const user = process.env.FTP_USER?.trim();
  const password = process.env.FTP_PASSWORD?.trim();
  const receiptsPath = process.env.FTP_RECEIPTS_PATH?.trim() || '/public_html/receipts';

  if (!host || !user || !password) {
    throw new Error('FTP credentials not configured. Check FTP_HOST, FTP_USER, and FTP_PASSWORD in .env.local');
  }

  // Log credentials (sanitized) for debugging
  console.log('📡 FTP Config:', {
    host,
    user,
    passwordLength: password.length,
    receiptsPath
  });

  return { host, user, password, receiptsPath };
}

export async function uploadReceiptHTML(orderId: string | number, htmlContent: string): Promise<string> {
  const config = getFTPConfig();
  const client = new Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    // Connect to FTP server
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: false, // Most shared hosting FTP doesn't use FTPS
    });

    console.log('✅ Connected to FTP server');

    // Check current working directory
    const cwd = await client.pwd();
    console.log(`📁 Current directory: ${cwd}`);

    // List files in current directory for debugging
    const list = await client.list();
    console.log('📂 Files in current directory:', list.map(f => f.name).join(', '));

    // Ensure receipts directory exists and navigate into it
    try {
      await client.ensureDir(config.receiptsPath);
      console.log(`✅ Ensured directory exists: ${config.receiptsPath}`);
    } catch (err) {
      console.warn(`⚠️ Could not ensure directory: ${err}`);
    }

    // Upload file (just filename since we're already in receipts directory)
    const filename = `order-${orderId}.html`;

    // Convert HTML string to readable stream
    const { Readable } = require('stream');
    const stream = Readable.from([htmlContent]);

    await client.uploadFrom(stream, filename);
    console.log(`✅ Uploaded receipt: ${config.receiptsPath}/${filename}`);

    // Construct public URL
    const receiptDomain = process.env.NEXT_PUBLIC_RECEIPT_DOMAIN || 'coffee-oasis.com.my';
    const publicUrl = `https://${receiptDomain}/receipts/${filename}`;

    return publicUrl;
  } catch (err) {
    console.error('❌ FTP upload failed:', err);
    throw new Error(`Failed to upload receipt via FTP: ${err}`);
  } finally {
    client.close();
  }
}

/**
 * Test FTP connection (for debugging)
 */
export async function testFTPConnection(): Promise<boolean> {
  const config = getFTPConfig();
  const client = new Client();

  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: false,
    });

    console.log('✅ FTP connection test successful');
    return true;
  } catch (err) {
    console.error('❌ FTP connection test failed:', err);
    return false;
  } finally {
    client.close();
  }
}

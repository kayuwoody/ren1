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
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const receiptsPath = process.env.FTP_RECEIPTS_PATH || '/public_html/receipts';

  if (!host || !user || !password) {
    throw new Error('FTP credentials not configured. Check FTP_HOST, FTP_USER, and FTP_PASSWORD in .env.local');
  }

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

    // Ensure receipts directory exists
    try {
      await client.ensureDir(config.receiptsPath);
      console.log(`✅ Ensured directory exists: ${config.receiptsPath}`);
    } catch (err) {
      console.warn(`⚠️ Could not ensure directory: ${err}`);
    }

    // Upload file
    const filename = `order-${orderId}.html`;
    const remotePath = `${config.receiptsPath}/${filename}`;

    // Convert HTML string to buffer
    const buffer = Buffer.from(htmlContent, 'utf-8');

    await client.uploadFrom(buffer, remotePath);
    console.log(`✅ Uploaded receipt: ${remotePath}`);

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

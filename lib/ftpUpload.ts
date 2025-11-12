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

    // Navigate to parent directory of receipts and check what exists there
    const parentPath = config.receiptsPath.substring(0, config.receiptsPath.lastIndexOf('/'));
    console.log(`🔍 Checking parent directory: ${parentPath}`);

    try {
      await client.cd(parentPath);
      const parentDir = await client.pwd();
      console.log(`📍 Parent directory: ${parentDir}`);

      const parentFiles = await client.list();
      console.log(`📂 Files in parent directory:`, parentFiles.map(f => `${f.name} (${f.type})`).join(', '));

      // Check if receipts folder already exists
      const receiptsExists = parentFiles.some(f => f.name === 'receipts' && f.type === 2); // type 2 = directory
      console.log(`📋 Receipts folder exists: ${receiptsExists ? 'YES' : 'NO'}`);
    } catch (err) {
      console.warn(`⚠️ Could not navigate to parent directory:`, err);
    }

    // Ensure receipts directory exists
    try {
      await client.ensureDir(config.receiptsPath);
      console.log(`✅ Ensured directory exists: ${config.receiptsPath}`);
    } catch (err) {
      console.warn(`⚠️ Could not ensure directory: ${err}`);
    }

    // Verify we're in the receipts directory
    const cwdBeforeUpload = await client.pwd();
    console.log(`📍 Current directory before upload: ${cwdBeforeUpload}`);

    const filesBeforeUpload = await client.list();
    console.log(`📋 Files before upload:`, filesBeforeUpload.map(f => f.name).join(', ') || '(empty)');

    // Create .htaccess to bypass WordPress routing (if it doesn't exist)
    try {
      const hasHtaccess = filesBeforeUpload.some(f => f.name === '.htaccess');

      if (!hasHtaccess) {
        console.log('📝 Creating .htaccess to bypass WordPress routing...');

        const htaccessContent = `# Allow direct access to receipt files
# Bypass WordPress routing for this directory
<IfModule mod_rewrite.c>
RewriteEngine Off
</IfModule>

# Set proper MIME type for HTML files
<IfModule mod_mime.c>
AddType text/html .html
</IfModule>

# Allow access to all files
<IfModule mod_authz_core.c>
Require all granted
</IfModule>

# Disable directory browsing
Options -Indexes
`;

        const { Readable } = require('stream');
        const htaccessStream = Readable.from([htaccessContent]);
        await client.uploadFrom(htaccessStream, '.htaccess');
        console.log('✅ .htaccess created successfully');
      } else {
        console.log('✅ .htaccess already exists');
      }
    } catch (err) {
      console.warn('⚠️ Could not create .htaccess:', err);
      // Don't fail the entire upload if .htaccess creation fails
    }

    // Upload file (just filename since we're already in receipts directory)
    const filename = `order-${orderId}.html`;

    // Convert HTML string to readable stream
    const { Readable } = require('stream');
    const stream = Readable.from([htmlContent]);

    console.log(`📤 Attempting to upload: ${filename} (${htmlContent.length} bytes)`);
    await client.uploadFrom(stream, filename);
    console.log(`✅ Upload command completed for: ${filename}`);

    // Set file permissions to 644 (readable by web server)
    try {
      await client.send(`SITE CHMOD 644 ${filename}`);
      console.log(`✅ Set permissions to 644 for ${filename}`);
    } catch (err) {
      console.warn('⚠️ Could not set permissions (not critical):', err);
    }

    // Verify upload - check current directory and list files
    const cwdAfterUpload = await client.pwd();
    console.log(`📍 Current directory after upload: ${cwdAfterUpload}`);

    const filesAfterUpload = await client.list();
    console.log(`📋 Files after upload:`, filesAfterUpload.map(f => `${f.name} (${f.size} bytes)`).join(', '));

    // Check if our file exists
    const uploadedFile = filesAfterUpload.find(f => f.name === filename);
    if (uploadedFile) {
      console.log(`✅ Verified file exists: ${filename} (${uploadedFile.size} bytes)`);
    } else {
      console.error(`❌ WARNING: File not found in directory listing after upload!`);
      console.log(`📋 Full directory listing:`, filesAfterUpload);
    }

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

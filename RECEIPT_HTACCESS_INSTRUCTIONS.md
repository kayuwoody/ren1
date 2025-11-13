# WordPress Receipt Access Fix

The receipts are uploading correctly via FTP but WordPress is intercepting the URLs and returning 404.

## Solution: Add this to WordPress's main .htaccess

Open your WordPress `.htaccess` file (in `public_html/.htaccess`) and add this **BEFORE** the WordPress rules:

```apache
# Allow direct access to receipts folder (bypass WordPress routing)
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{REQUEST_URI} ^/receipts/ [NC]
RewriteRule ^ - [L]
</IfModule>
```

Your `.htaccess` should look like this:

```apache
# BEGIN WordPress
# Allow direct access to receipts folder (bypass WordPress routing)
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{REQUEST_URI} ^/receipts/ [NC]
RewriteRule ^ - [L]
</IfModule>

<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
```

## Where to add it:

1. Go to Hostinger File Manager
2. Navigate to `public_html/.htaccess`
3. Edit the file
4. Add the receipt bypass rule RIGHT AFTER `RewriteEngine On` but BEFORE `RewriteBase /`
5. Save

This tells WordPress: "If the URL starts with `/receipts/`, don't process it through WordPress - serve the file directly."

## Test after adding:

Visit: https://coffee-oasis.com.my/receipts/order-471.html

It should work immediately (no server restart needed).

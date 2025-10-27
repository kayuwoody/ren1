# Niimbot Print Server

USB-based print server for Niimbot label printers using niimbotjs.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Connect your Niimbot printer via USB**

3. **Find the printer path:**
   ```bash
   # On Linux/Mac:
   ls /dev/tty* | grep -i usb

   # On Windows:
   # Check Device Manager for COM port
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001`

## API Endpoints

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "message": "Print server is running"
}
```

### Print Receipt
```bash
POST /print/receipt
Content-Type: application/json

{
  "text": "COFFEE OASIS\n\nOrder #123\nCoffee x2\nTotal: RM 10.00",
  "width": 384,
  "height": 240
}
```

### Print Custom Image
```bash
POST /print/image
Content-Type: application/json

{
  "imageUrl": "http://example.com/label.png"
}
```

Or with base64 buffer:
```json
{
  "imageBuffer": "base64-encoded-image-data"
}
```

## Testing

Test the server with curl:

```bash
# Health check
curl http://localhost:3001/health

# Print test receipt
curl -X POST http://localhost:3001/print/receipt \
  -H "Content-Type: application/json" \
  -d '{"text": "TEST PRINT\nHello World"}'
```

## Integration with Next.js

Update your Next.js app to call the print server:

```typescript
// lib/printService.ts
export async function printReceipt(orderData: any) {
  const text = formatReceiptText(orderData);

  const response = await fetch('http://localhost:3001/print/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error('Print failed');
  }

  return response.json();
}
```

## Troubleshooting

**Printer not found:**
- Check USB connection
- On Linux, you may need permissions: `sudo chmod 666 /dev/ttyUSB0`
- Try specifying printer path in server.js

**Permission denied:**
```bash
# Linux: Add user to dialout group
sudo usermod -a -G dialout $USER
# Then logout and login again
```

## Production Deployment

For production, consider:
- Using PM2 to keep server running: `pm2 start server.js`
- Setting up systemd service on Linux
- Using environment variables for configuration
- Adding authentication to API endpoints

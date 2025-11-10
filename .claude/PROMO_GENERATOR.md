# Promo Image Generator

## Overview
Automated promo image generation system for combo products with playful, cutesy aesthetic matching the Coffee Oasis chibi unicorn mascot.

## Features
- **Client-side Canvas Generation**: No server dependencies, all image generation happens in the browser
- **Multiple Formats**: Menu board (1920×1080), Instagram (1080×1080), Locker display (1080×1920)
- **Playful Design**: Kawaii/chibi style with sparkles, coffee beans, and bubbly fonts
- **WooCommerce Integration**: Direct upload to media library with product association
- **Mascot Integration**: Uses existing mascot image (`/public/mascot.jpg`)

## File Structure

```
lib/
  promoImageGenerator.ts          ← Core generation logic using Canvas API

app/api/
  promo/
    upload/route.ts                ← Upload endpoint to WooCommerce media

app/admin/
  promo-generator/page.tsx         ← Admin UI for generating promo images
  page.tsx                         ← Updated with promo generator link
```

## How It Works

### 1. Generation Process
```typescript
import { generatePromoImage, PromoFormat } from '@/lib/promoImageGenerator';

const options = {
  productName: 'Wake-Up Wonder',
  components: ['1x Americano', '1x Danish Pastry'],
  price: 'RM 15.00',
  format: 'menu-board', // or 'instagram', 'locker-display'
  tagline: 'Perfect Morning Combo!'
};

const result = await generatePromoImage(options);
// Returns { blob, dataUrl, width, height }
```

### 2. Upload to WooCommerce
```typescript
const formData = new FormData();
formData.append('file', blob, filename);
formData.append('filename', filename);
formData.append('productId', productId); // Optional

const res = await fetch('/api/promo/upload', {
  method: 'POST',
  body: formData,
});

const data = await res.json();
// Returns { success, media: { id, url, alt, title } }
```

## Image Formats

### Menu Board (1920×1080 landscape)
- **Use Case**: In-store displays, printed menu boards
- **Layout**: Mascot on left (30% width), product info on right
- **Features**: Large product name, tagline, component list with hearts, emphasized price

### Instagram (1080×1080 square)
- **Use Case**: Social media posts (Instagram, Facebook)
- **Layout**: Mascot at top (40% height), info centered below
- **Features**: Centered text, decorative sparkles, social media-optimized sizing

### Locker Display (1080×1920 portrait)
- **Use Case**: Vertical screens at food lockers
- **Layout**: Similar to Instagram but optimized for portrait orientation
- **Features**: Includes "Available at Coffee Oasis" footer

## Design Elements

### Typography
- **Font**: Comic Sans MS (fallback: Marker Felt, cursive)
- **Product Name**: Bold, large, with white stroke outline
- **Tagline**: Italic, pink color
- **Components**: Listed with heart bullets (♥)
- **Price**: Extra large, coral red with emphasis

### Colors
- **Background**: Soft gradient from cream (#FFF5E6) to slightly darker
- **Text**: Brown (#8B4513, #5D4037) for readability
- **Accents**: Pink (#FF69B4), coral (#FF6B6B), gold (#FFD700)
- **Outlines**: White strokes for text pop effect

### Decorative Elements
- **Sparkles**: 4-pointed stars in gold, placed around mascot
- **Coffee Beans**: Elliptical shapes with center line, brown tones
- **Gradient Backgrounds**: Soft, non-distracting gradients

## Usage in Admin Panel

1. **Navigate**: Admin Dashboard → Promo Generator (pink gradient card with sparkles icon)
2. **Select Product**: Choose from dropdown of combo products
3. **View Components**: See what's included in the combo
4. **Choose Format**: Menu board, Instagram, or Locker display
5. **Add Tagline**: Optional catchy phrase (max 50 chars)
6. **Generate**: Click "✨ Generate Preview" to see the result
7. **Upload**: Click "📤 Upload to WooCommerce Media Library"

## Mascot Images

### Current Mascot
- **Location**: `/public/mascot.jpg`
- **Description**: Chibi unicorn with pink mane, coffee bean on forehead, holding coffee cup
- **Style**: Kawaii, playful, soft colors with thick outlines
- **Used In**: All generated promo images as the main character

### Additional Mascot Images (WooCommerce Media Library)
- Check May 2025 uploads in WooCommerce for more mascot variations
- Can be used for future enhancements or different promo styles

## API Endpoints

### POST /api/promo/upload
Upload generated promo image to WooCommerce media library

**Request**:
```typescript
FormData {
  file: Blob,           // Image file
  filename: string,     // e.g., "promo-wake-up-wonder-menu-board-1699999999.jpg"
  productId?: string    // Optional - associate with product
}
```

**Response**:
```typescript
{
  success: boolean,
  media: {
    id: number,         // WooCommerce media ID
    url: string,        // Public URL of uploaded image
    alt: string,        // Alt text
    title: string       // Media title
  }
}
```

## Technical Implementation

### Client-Side Canvas API
- Uses `document.createElement('canvas')` for image generation
- `CanvasRenderingContext2D` for drawing operations
- `HTMLImageElement` for loading mascot image
- `canvas.toBlob()` for export to file format

### No Native Dependencies
- Avoided server-side canvas libraries (node-canvas, sharp) due to native dependency issues
- Pure browser-based solution works in all environments
- No additional npm packages required

### Performance
- Generation takes 1-3 seconds depending on format
- All processing happens client-side (no server load)
- Images are high quality (JPEG 95% quality)
- File sizes: ~200-500KB depending on format

## Future Enhancements

1. **More Mascot Variations**: Use different mascot images from WooCommerce media library
2. **Custom Backgrounds**: Allow users to choose background colors or patterns
3. **Seasonal Themes**: Holiday-specific decorations and colors
4. **Batch Generation**: Generate all formats at once
5. **Template Library**: Save and reuse custom layouts
6. **AI Enhancement**: Use AI to enhance or stylize generated images
7. **Animated GIFs**: Create animated versions for digital displays

## Troubleshooting

### Canvas Not Supported
- Error: "Could not get canvas context"
- Solution: Ensure running in modern browser with Canvas API support

### CORS Issues with Mascot Image
- Error: Image fails to load or "tainted canvas" error
- Solution: Mascot image must be served from same domain or with proper CORS headers
- Current setup: Mascot in `/public` folder (same origin, no CORS issues)

### Upload Fails
- Check WooCommerce API credentials in `.env.local`
- Verify network connectivity to WooCommerce instance
- Check browser console for detailed error messages

### Image Quality Issues
- Adjust JPEG quality in `canvas.toBlob()` call (currently 95%)
- For transparent backgrounds, use PNG format instead
- Check canvas dimensions match expected output

## Testing

### Manual Testing
1. Start dev server: `npm run dev`
2. Navigate to http://localhost:3000/admin
3. Click "Promo Generator"
4. Select a combo product (e.g., "Wake-Up Wonder")
5. Try each format (menu-board, instagram, locker-display)
6. Verify preview looks correct
7. Test upload to WooCommerce
8. Check WooCommerce media library for uploaded image

### What to Check
- ✅ Mascot image loads correctly
- ✅ Product name displays properly
- ✅ Components list shows all items
- ✅ Price is large and visible
- ✅ Decorations (sparkles, coffee beans) render
- ✅ Text is readable on all backgrounds
- ✅ Image dimensions match format specifications
- ✅ Upload succeeds and returns valid WooCommerce media URL

## Best Practices

1. **Taglines**: Keep short, playful, and relevant to combo theme
2. **Product Names**: Works best with 2-4 word names
3. **Component Lists**: Limited to 5-6 items for readability
4. **File Naming**: Auto-generated slugs are SEO-friendly
5. **Storage**: Uploaded images stay in WooCommerce media library indefinitely
6. **Reuse**: Can generate multiple variations by changing tagline/format

---

**Last Updated**: November 10, 2025
**Status**: ✅ Production Ready
**Dependencies**: None (client-side only)
**Browser Support**: Modern browsers with Canvas API (Chrome, Firefox, Safari, Edge)

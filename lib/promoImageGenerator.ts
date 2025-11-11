/**
 * Promo Image Generator - Client-side Canvas-based
 * Creates playful, cutesy promo images for combo products
 * Uses the Coffee Oasis mascot and kawaii aesthetic
 */

export type PromoFormat = 'menu-board' | 'instagram' | 'locker-display';

export interface PromoImageOptions {
  productName: string;
  components: string[]; // e.g., ["Americano", "Danish Pastry"]
  price: string; // e.g., "RM 15.00"
  format: PromoFormat;
  tagline?: string; // Optional tagline like "Perfect Morning Combo!"
  backgroundColor?: string;
}

export interface PromoImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Get canvas dimensions based on format
 */
function getCanvasDimensions(format: PromoFormat): { width: number; height: number } {
  switch (format) {
    case 'menu-board':
      return { width: 1920, height: 1080 }; // Landscape HD for printing/displays
    case 'instagram':
      return { width: 1080, height: 1080 }; // Square for social media
    case 'locker-display':
      return { width: 1080, height: 1920 }; // Portrait for vertical displays
  }
}

/**
 * Generate promo image using Canvas API
 */
export async function generatePromoImage(
  options: PromoImageOptions
): Promise<PromoImageResult> {
  const { width, height } = getCanvasDimensions(options.format);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Background - soft gradient with playful colors
  const bgColor = options.backgroundColor || '#FFF5E6'; // Cream/beige
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, bgColor);
  gradient.addColorStop(1, adjustColor(bgColor, -10)); // Slightly darker
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Load mascot image
  const mascot = await loadImage('/mascot.jpg');

  // Layout based on format
  if (options.format === 'menu-board') {
    await drawMenuBoard(ctx, mascot, options, width, height);
  } else if (options.format === 'instagram') {
    await drawInstagram(ctx, mascot, options, width, height);
  } else {
    await drawLockerDisplay(ctx, mascot, options, width, height);
  }

  // Convert to blob and dataUrl
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to create blob'));
    }, 'image/jpeg', 0.95);
  });

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

  return { blob, dataUrl, width, height };
}

/**
 * Draw menu board layout (landscape)
 */
async function drawMenuBoard(
  ctx: CanvasRenderingContext2D,
  mascot: HTMLImageElement,
  options: PromoImageOptions,
  width: number,
  height: number
) {
  // Mascot on left side (30% width)
  const mascotWidth = width * 0.3;
  const mascotHeight = (mascot.height / mascot.width) * mascotWidth;
  const mascotX = width * 0.05;
  const mascotY = (height - mascotHeight) / 2;

  ctx.drawImage(mascot, mascotX, mascotY, mascotWidth, mascotHeight);

  // Add decorative elements (sparkles, coffee beans)
  drawSparkles(ctx, mascotX + mascotWidth - 50, mascotY + 50, 40, '#FFD700');
  drawCoffeeBeans(ctx, mascotX + mascotWidth / 2, mascotY + mascotHeight + 30, 3);

  // Product info on right side
  const rightX = width * 0.4;
  const centerY = height / 2;

  // Product name - large, bubbly font
  ctx.font = `bold ${height * 0.12}px "Comic Sans MS", "Marker Felt", cursive`;
  ctx.fillStyle = '#8B4513'; // Brown
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = height * 0.008;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Stroke for outline effect
  ctx.strokeText(options.productName, rightX, centerY - height * 0.2);
  ctx.fillText(options.productName, rightX, centerY - height * 0.2);

  // Tagline
  if (options.tagline) {
    ctx.font = `italic ${height * 0.05}px "Comic Sans MS", cursive`;
    ctx.fillStyle = '#FF69B4'; // Pink
    ctx.fillText(options.tagline, rightX, centerY - height * 0.05);
  }

  // Components with bullet points
  ctx.font = `${height * 0.045}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#5D4037'; // Dark brown
  options.components.forEach((component, i) => {
    const y = centerY + height * 0.05 + i * height * 0.08;
    // Draw cute bullet (heart or star)
    ctx.fillStyle = '#FF69B4';
    ctx.fillText('♥', rightX, y);
    ctx.fillStyle = '#5D4037';
    ctx.fillText(component, rightX + height * 0.06, y);
  });

  // Price - emphasized
  ctx.font = `bold ${height * 0.15}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#FF6B6B'; // Coral red
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = height * 0.01;
  const priceY = centerY + height * 0.3;
  ctx.strokeText(options.price, rightX, priceY);
  ctx.fillText(options.price, rightX, priceY);
}

/**
 * Draw Instagram layout (square)
 */
async function drawInstagram(
  ctx: CanvasRenderingContext2D,
  mascot: HTMLImageElement,
  options: PromoImageOptions,
  width: number,
  height: number
) {
  // Mascot at top (40% height)
  const mascotHeight = height * 0.4;
  const mascotWidth = (mascot.width / mascot.height) * mascotHeight;
  const mascotX = (width - mascotWidth) / 2;
  const mascotY = height * 0.05;

  ctx.drawImage(mascot, mascotX, mascotY, mascotWidth, mascotHeight);

  // Decorative sparkles around mascot
  drawSparkles(ctx, mascotX - 30, mascotY + mascotHeight / 2, 30, '#FFD700');
  drawSparkles(ctx, mascotX + mascotWidth + 30, mascotY + mascotHeight / 2, 30, '#FFD700');

  // Product info centered below
  const centerX = width / 2;
  const contentY = mascotY + mascotHeight + height * 0.08;

  // Product name
  ctx.font = `bold ${height * 0.08}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#8B4513';
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = 8;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeText(options.productName, centerX, contentY);
  ctx.fillText(options.productName, centerX, contentY);

  // Tagline
  if (options.tagline) {
    ctx.font = `italic ${height * 0.04}px "Comic Sans MS", cursive`;
    ctx.fillStyle = '#FF69B4';
    ctx.fillText(options.tagline, centerX, contentY + height * 0.1);
  }

  // Components
  ctx.font = `${height * 0.035}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#5D4037';
  const componentsY = contentY + height * 0.18;
  options.components.forEach((component, i) => {
    ctx.fillText(`♥ ${component}`, centerX, componentsY + i * height * 0.06);
  });

  // Price
  ctx.font = `bold ${height * 0.12}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#FF6B6B';
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = 10;
  const priceY = height * 0.85;
  ctx.strokeText(options.price, centerX, priceY);
  ctx.fillText(options.price, centerX, priceY);
}

/**
 * Draw locker display layout (portrait)
 */
async function drawLockerDisplay(
  ctx: CanvasRenderingContext2D,
  mascot: HTMLImageElement,
  options: PromoImageOptions,
  width: number,
  height: number
) {
  // Similar to Instagram but optimized for portrait
  await drawInstagram(ctx, mascot, options, width, height);

  // Add footer text
  ctx.font = `${height * 0.025}px "Comic Sans MS", cursive`;
  ctx.fillStyle = '#8B4513';
  ctx.textAlign = 'center';
  ctx.fillText('Available at Coffee Oasis', width / 2, height * 0.96);
}

/**
 * Draw sparkles decoration
 */
function drawSparkles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);

  // Draw 4-pointed star
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    const outerX = Math.cos(angle) * size;
    const outerY = Math.sin(angle) * size;
    const innerAngle = angle + Math.PI / 4;
    const innerX = Math.cos(innerAngle) * (size * 0.4);
    const innerY = Math.sin(innerAngle) * (size * 0.4);

    if (i === 0) {
      ctx.moveTo(outerX, outerY);
    } else {
      ctx.lineTo(outerX, outerY);
    }
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw coffee beans decoration
 */
function drawCoffeeBeans(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number
) {
  ctx.fillStyle = '#6F4E37'; // Coffee brown
  const beanSize = 20;
  const spacing = 30;

  for (let i = 0; i < count; i++) {
    const beanX = x + (i - Math.floor(count / 2)) * spacing;
    ctx.save();
    ctx.translate(beanX, y);
    ctx.rotate(Math.PI / 4);

    // Bean shape (ellipse)
    ctx.beginPath();
    ctx.ellipse(0, 0, beanSize, beanSize * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bean line
    ctx.strokeStyle = '#4A3728';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -beanSize * 0.5);
    ctx.lineTo(0, beanSize * 0.5);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Load image from URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Adjust color brightness
 */
function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

/**
 * Generate filename for promo image
 */
export function generatePromoFilename(
  productName: string,
  format: PromoFormat
): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const timestamp = Date.now();
  return `promo-${slug}-${format}-${timestamp}.jpg`;
}

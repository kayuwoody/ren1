'use client';

import { useEffect, useState } from 'react';
import {
  generatePromoImage,
  generatePromoFilename,
  PromoFormat,
  PromoImageOptions,
} from '@/lib/promoImageGenerator';

interface Product {
  id: number;
  name: string;
  price: string;
  categories: Array<{ slug: string }>;
}

interface BundleComponent {
  productName: string;
  quantity: number;
}

export default function PromoGeneratorPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [components, setComponents] = useState<BundleComponent[]>([]);
  const [format, setFormat] = useState<PromoFormat>('menu-board');
  const [tagline, setTagline] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string>('');

  // Load combo products
  useEffect(() => {
    loadComboProducts();
  }, []);

  async function loadComboProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();

      // Filter combo products only
      const combos = data.products.filter((p: Product) =>
        p.categories.some((cat) => cat.slug === 'combo')
      );

      setProducts(combos);
    } catch (err) {
      console.error('Failed to load products:', err);
      alert('Failed to load combo products');
    } finally {
      setLoading(false);
    }
  }

  async function handleProductSelect(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setSelectedProduct(product);
    setPreviewUrl('');
    setUploadedUrl('');

    // Fetch bundle components
    try {
      const res = await fetch(`/api/bundles/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });

      const data = await res.json();
      setComponents(data.components || []);

      // Auto-generate tagline
      if (data.components && data.components.length > 0) {
        setTagline(`Perfect combo with ${data.components.length} items!`);
      }
    } catch (err) {
      console.error('Failed to load components:', err);
      setComponents([]);
    }
  }

  async function handleGenerate() {
    if (!selectedProduct) return;

    setGenerating(true);
    try {
      const options: PromoImageOptions = {
        productName: selectedProduct.name,
        components: components.map((c) => `${c.quantity}x ${c.productName}`),
        price: `RM ${selectedProduct.price}`,
        format,
        tagline: tagline || undefined,
      };

      const result = await generatePromoImage(options);
      setPreviewUrl(result.dataUrl);

      console.log('✅ Promo image generated:', {
        format,
        size: `${result.width}×${result.height}`,
      });
    } catch (err) {
      console.error('Failed to generate promo:', err);
      alert('Failed to generate promo image. Check console for details.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpload() {
    if (!previewUrl || !selectedProduct) return;

    setUploading(true);
    try {
      // Convert dataUrl to blob
      const res = await fetch(previewUrl);
      const blob = await res.blob();

      // Create form data
      const formData = new FormData();
      const filename = generatePromoFilename(selectedProduct.name, format);
      formData.append('file', blob, filename);
      formData.append('filename', filename);
      formData.append('productId', selectedProduct.id.toString());

      // Upload to WooCommerce
      const uploadRes = await fetch('/api/promo/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await uploadRes.json();

      if (data.success) {
        setUploadedUrl(data.media.url);
        alert('✅ Promo image uploaded to WooCommerce media library!');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Failed to upload:', err);
      alert('Failed to upload promo image. Check console for details.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Promo Generator</h1>
        <p>Loading combo products...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">🎨 Promo Image Generator</h1>
      <p className="text-gray-600 mb-6">
        Create playful, cutesy promo images for your combo products
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Panel - Configuration */}
        <div className="space-y-6">
          {/* Product Selection */}
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium mb-2">
              Select Combo Product
            </label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2"
              onChange={(e) => handleProductSelect(Number(e.target.value))}
              value={selectedProduct?.id || ''}
            >
              <option value="">-- Choose a combo --</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - RM {product.price}
                </option>
              ))}
            </select>

            {/* Show components */}
            {components.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium mb-2">Components:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {components.map((c, i) => (
                    <li key={i}>
                      • {c.quantity}x {c.productName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Format Selection */}
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium mb-2">Format</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="format"
                  value="menu-board"
                  checked={format === 'menu-board'}
                  onChange={(e) => setFormat(e.target.value as PromoFormat)}
                  className="mr-2"
                />
                <span>
                  Menu Board (1920×1080 landscape) - For printing and in-store
                  displays
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="format"
                  value="instagram"
                  checked={format === 'instagram'}
                  onChange={(e) => setFormat(e.target.value as PromoFormat)}
                  className="mr-2"
                />
                <span>
                  Instagram (1080×1080 square) - For social media posts
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="format"
                  value="locker-display"
                  checked={format === 'locker-display'}
                  onChange={(e) => setFormat(e.target.value as PromoFormat)}
                  className="mr-2"
                />
                <span>
                  Locker Display (1080×1920 portrait) - For food locker screens
                </span>
              </label>
            </div>
          </div>

          {/* Tagline */}
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium mb-2">
              Tagline (optional)
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="e.g., Perfect Morning Combo!"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={50}
            />
            <p className="text-xs text-gray-500 mt-1">
              Keep it short and playful!
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleGenerate}
              disabled={!selectedProduct || generating}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating...' : '✨ Generate Preview'}
            </button>

            {previewUrl && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {uploading
                  ? 'Uploading...'
                  : '📤 Upload to WooCommerce Media Library'}
              </button>
            )}
          </div>

          {uploadedUrl && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <p className="text-green-800 font-medium mb-2">
                ✅ Uploaded Successfully!
              </p>
              <a
                href={uploadedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline text-sm break-all"
              >
                {uploadedUrl}
              </a>
            </div>
          )}
        </div>

        {/* Right Panel - Preview */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Preview</h2>
          {previewUrl ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt="Promo preview"
                className="w-full h-auto"
              />
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg h-96 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">🎨</p>
                <p>Select a product and click Generate to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="mt-8 bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-medium mb-2">💡 Tips</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>
            • <strong>Menu Board</strong>: Best for printing and in-store
            displays
          </li>
          <li>
            • <strong>Instagram</strong>: Perfect for social media posts
            (Instagram, Facebook)
          </li>
          <li>
            • <strong>Locker Display</strong>: Optimized for vertical screens at
            food lockers
          </li>
          <li>
            • Generated images feature your adorable chibi unicorn mascot with
            playful styling
          </li>
          <li>
            • Images are automatically uploaded to WooCommerce and can be
            associated with products
          </li>
        </ul>
      </div>
    </div>
  );
}

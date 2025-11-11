import { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Customer Display - Coffee Oasis',
  description: 'Customer-facing order display',
  manifest: '/manifest-customer-display.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Customer Display',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
};

export default function CustomerDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No HeaderNav for customer display - clean, distraction-free view
  return <>{children}</>;
}

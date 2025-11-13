import { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Kitchen Display - Coffee Oasis',
  description: 'Kitchen order display system',
  manifest: '/manifest-kitchen-display.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kitchen Display',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#10b981',
};

export default function KitchenDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No HeaderNav for kitchen display - clean, distraction-free view
  return <>{children}</>;
}

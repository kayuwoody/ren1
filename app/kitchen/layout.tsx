import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kitchen Display - Coffee Oasis',
  description: 'Kitchen order display system',
  manifest: '/manifest-kitchen-display.json',
  themeColor: '#10b981',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kitchen Display',
  },
};

export default function KitchenDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No HeaderNav for kitchen display - clean, distraction-free view
  return <>{children}</>;
}

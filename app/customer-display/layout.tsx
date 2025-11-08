export default function CustomerDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No HeaderNav for customer display - clean, distraction-free view
  return <>{children}</>;
}

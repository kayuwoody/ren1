import "@/globals.css";
import { CartProvider } from "@/context/cartContext";
import HeaderNav from "@/components/HeaderNav";

export const metadata = {
  title: "Coffee POS",
  description: "Built with Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <CartProvider>
          <HeaderNav />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
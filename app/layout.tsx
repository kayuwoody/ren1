import "@/globals.css";
import { Inter } from "next/font/google";
import { CartProvider } from "@/context/cartContext";
import HeaderNav from "@/components/HeaderNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Coffee POS",
  description: "Built with Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CartProvider>
          <HeaderNav />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold Intelligence Terminal V1",
  description: "Binance USDⓈ-M XAUUSDT (Gold/USDT perpetual) real-time market intelligence: live radar, order book, funding and open interest, trend scanner, market structure, Claude analyst, smart alerts and event history.",
};

export const viewport: Viewport = { themeColor: "#06080b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

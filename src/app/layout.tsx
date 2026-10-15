import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RosettaMAIC",
  description: "A Latin American Spanish immersion classroom.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}

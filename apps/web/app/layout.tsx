import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Autonomous Trading Portal",
  description: "Multi-chain crypto trading desk with wallet connectivity, safety controls, and autonomous strategy monitoring."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

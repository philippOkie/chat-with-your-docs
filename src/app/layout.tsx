import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Ask questions across a reusable document library and inspect the exact supporting sources.",
  title: "Chat With Your Docs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

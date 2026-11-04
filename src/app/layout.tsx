import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shetu - A trusted guide to studying abroad",
  description:
    "Shetu is a friendly chat assistant that helps students plan higher education abroad. Reliable, trusted answers with real facts and real costs, and clear warnings about agency tricks.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

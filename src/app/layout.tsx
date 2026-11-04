import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shetu - Your honest guide to studying abroad",
  description:
    "Shetu is a conversational AI advisor that helps students plan higher education abroad with honest, source-cited guidance - countering agencies that profit from misinformation.",
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

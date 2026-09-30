import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "¿Quién es quién? · Día del Niño",
  referrer: "no-referrer",
  description: "Juego en vivo para descubrir quién aparece en cada foto de infancia.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}

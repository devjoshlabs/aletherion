import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALETHERION — Bibliothèque de l'esprit",
  description:
    "Des œuvres pour les esprits qui cherchent plus loin.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

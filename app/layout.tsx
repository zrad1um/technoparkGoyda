import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Unbounded } from "next/font/google";
import "./globals.css";

const font = Unbounded({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Перетягивание каната",
  description: "Дуэль на выносливость и ритм: тяни канат, вовремя отдыхай, попадай в такт.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className={font.className}>{children}</body>
    </html>
  );
}

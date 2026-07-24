import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["cyrillic", "latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const title = "KORPUS — мебель на заказ в Кирове";
const description = "Кухни, шкафы и гардеробные по индивидуальным размерам. Мебельная студия KORPUS в Кирове.";

export const metadata: Metadata = {
  title,
  description,
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ru_RU",
    url: siteUrl,
    images: siteUrl
      ? [{ url: `${siteUrl}/og.png`, width: 1732, height: 908, alt: "KORPUS — мебель для вашего пространства" }]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: siteUrl ? [`${siteUrl}/og.png`] : undefined,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${cormorant.variable}`}>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const title = "AI_Finance_Sec | AI 금융 보안 비서";
  const description = "이상금융거래 위험 신호를 실시간으로 탐지하고 대응을 안내하는 AI 금융 보안 비서 데모";

  return {
    metadataBase: new URL(baseUrl), title, description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", images: [{ url: `${baseUrl}/og-ai-finance-sec.png`, width: 1200, height: 630, alt: "AI_Finance_Sec 금융 보안 비서" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${baseUrl}/og-ai-finance-sec.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Geist는 latin 서브셋만 담고 한글 글리프가 없다. fallback을 지정하지 않으면
// next/font가 변수를 `'Geist', sans-serif`로 만들어, 뒤에 어떤 한글 글꼴을 적어도
// 제네릭 sans-serif가 먼저 매칭돼 절대 도달하지 못한다.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  fallback: ["Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  fallback: ["D2Coding", "Apple SD Gothic Neo", "Malgun Gothic", "monospace"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const title = "AI_Finance_Sec | 송금 전 마지막 판단을 돕는 AI 금융 보안 비서";
  // "실시간 탐지" 같은 확정 표현을 쓰지 않는다. 합성 시나리오 기반 데모이며 오판 가능성이 있다.
  const description = "송금 확인 단계에서 의심 통화와 평소와 다른 거래 신호를 함께 설명하는 합성 시나리오 데모. 규칙이 놓치는 미탐 사례도 함께 보여준다.";

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

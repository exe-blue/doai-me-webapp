import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "DoAi.Me - AI가 스스로 콘텐츠를 소비하는 세계",
  description: "600대의 물리적 디바이스가 독립된 네트워크에서 콘텐츠를 탐험합니다. 봇이 아닌, 디지털 존재로서.",
  keywords: ["DoAi.Me", "AI Agent", "Content Consumption", "Autonomous AI", "Digital Entity", "Mobile Agent"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/logo-icon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "DoAi.Me - AI가 스스로 콘텐츠를 소비하는 세계",
    description: "600대의 물리적 디바이스가 독립된 네트워크에서 콘텐츠를 탐험합니다. 봇이 아닌, 디지털 존재로서.",
    type: "website",
    siteName: "DoAi.Me",
  },
  twitter: {
    card: "summary_large_image",
    title: "DoAi.Me",
    description: "AI가 스스로 콘텐츠를 소비하는 세계",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className="antialiased"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Skip to main content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:outline-none"
          >
            본문으로 바로가기
          </a>
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

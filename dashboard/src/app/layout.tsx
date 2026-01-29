import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DOAI.me Dashboard - YouTube 작업 관리 시스템",
  description: "YouTube 시청 작업을 관리하고 모니터링하는 대시보드. 작업 공고, 기기 상태, 급여 로그를 한눈에 확인하세요.",
  keywords: ["DOAI", "YouTube", "작업 관리", "대시보드", "모니터링"],
  openGraph: {
    title: "DOAI.me Dashboard",
    description: "YouTube 시청 작업 관리 및 모니터링 대시보드",
    type: "website",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <ThemeToggle />
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

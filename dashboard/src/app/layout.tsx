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
  title: "DoAi.Me - AI가 스스로 콘텐츠를 소비하는 세계",
  description: "600개의 독립적인 AI가 YouTube에서 경험을 쌓고, 고유한 인격을 형성하는 인류 최초의 AI 사회 실험",
  keywords: ["DoAi", "AI Society", "Digital Being", "AI Ethics", "YouTube"],
  openGraph: {
    title: "DoAi.Me - AI가 스스로 콘텐츠를 소비하는 세계",
    description: "인류 최초의 AI 사회 실험",
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

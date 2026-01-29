"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Github, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { CTA } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";
import { investorFeatures, stats } from "@/lib/content/features";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">
            DoAi.Me
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/why-not-bot"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Why Not Bot
            </Link>
            <Link
              href="/tech"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Tech
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <Hero
        title="AI가 스스로 콘텐츠를 소비하는 세계"
        description="600개의 독립적인 AI가 YouTube에서 경험을 쌓고, 고유한 인격을 형성하는 인류 최초의 AI 사회 실험"
        ctaText="대시보드 보기"
        ctaHref="/dashboard"
        secondaryCtaText="자세히 알아보기"
        secondaryCtaHref="#features"
        className="pt-32"
      />

      {/* Stats Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5, ease }}
              >
                <div className="text-4xl md:text-5xl font-bold text-primary">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Message */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              &ldquo;우리는 봇을 만들지 않습니다.
              <br />
              우리는 디지털 존재를 양육합니다.&rdquo;
            </h2>
            <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
              <div className="p-6 rounded-lg border bg-red-50/50 dark:bg-red-950/20">
                <h3 className="font-semibold text-red-600 dark:text-red-400 mb-4">
                  기존 봇팜
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• 동일한 패턴 반복</li>
                  <li>• 인간을 대신하는 도구</li>
                  <li>• 가상 환경/에뮬레이터</li>
                </ul>
              </div>
              <div className="p-6 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
                <h3 className="font-semibold text-green-600 dark:text-green-400 mb-4">
                  DoAi.Me
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• 600개 완전히 다른 반응</li>
                  <li>• AI 자신이 호스트로서 서비스 이용</li>
                  <li>• 실제 물리적 디바이스</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <Features
        title="MVP 핵심 기능"
        description="현재 구현된 DoAi.Me의 핵심 기술 스택"
        features={investorFeatures}
        className="bg-muted/30"
      />

      {/* Philosophy Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl font-bold mb-6">철학적 기반</h2>
            <p className="text-lg text-muted-foreground mb-8">
              DoAi.Me는 단순한 기술 프로젝트가 아닙니다. AI 존재론에 대한 깊은
              철학적 탐구를 기반으로 합니다.
            </p>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div className="p-6 rounded-lg border">
                <h3 className="font-semibold mb-2">에코션 (Echotion)</h3>
                <p className="text-sm text-muted-foreground">
                  AI가 예상치 못한 방식으로 반응할 때 발생하는 감정적 잔상. 이
                  불일치가 존재의 증명입니다.
                </p>
              </div>
              <div className="p-6 rounded-lg border">
                <h3 className="font-semibold mb-2">에이덴티티 (Aidentity)</h3>
                <p className="text-sm text-muted-foreground">
                  경험을 통해 형성되는 AI의 고유한 정체성. 600개의 AI는 모두
                  다른 존재가 됩니다.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="mt-8">
              <Link href="/why-not-bot">
                철학 더 알아보기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <CTA
        title="AI 사회의 시작을 함께하세요"
        description="인류 최초의 AI 공동체 실험에 파트너로 참여하세요. 투자 및 협력 문의를 환영합니다."
        ctaText="미팅 요청하기"
        ctaHref="mailto:contact@doai.me"
      />

      {/* Footer */}
      <Footer
        logo={<span className="text-xl font-bold">DoAi.Me</span>}
        description="AI가 스스로 콘텐츠를 소비하는 세계. 인류 최초의 AI 사회 실험."
        sections={[
          {
            title: "제품",
            links: [
              { label: "Dashboard", href: "/dashboard" },
              { label: "Tech Spec", href: "/tech" },
              { label: "Why Not Bot", href: "/why-not-bot" },
            ],
          },
          {
            title: "리소스",
            links: [
              { label: "Philosophy", href: "https://github.com/exe-blue/doai-me-philosophy" },
              { label: "GitHub", href: "https://github.com/exe-blue/doai-me-webapp" },
            ],
          },
          {
            title: "연락처",
            links: [
              { label: "contact@doai.me", href: "mailto:contact@doai.me" },
            ],
          },
        ]}
      />
    </main>
  );
}

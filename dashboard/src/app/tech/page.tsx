"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Server, Smartphone, Database, Wifi, RefreshCw, Shield, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/sections/header";
import { Footer } from "@/components/sections/footer";
import { FeatureSelector } from "@/components/feature-selector";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

const techCategories = [
  {
    id: "central-server",
    title: "Central Server",
    icon: <Server className="h-5 w-5" />,
    items: [
      { name: "Next.js 16", description: "최신 React 프레임워크 기반 Dashboard Frontend. App Router와 Server Components 활용." },
      { name: "Supabase", description: "PostgreSQL 데이터베이스와 Realtime 구독 기능. 모든 디바이스 상태를 실시간 동기화." },
      { name: "Tailscale VPN", description: "보안 네트워크 메시. 모든 노드 간 암호화된 P2P 통신 보장." },
    ],
  },
  {
    id: "mobile-agent",
    title: "Mobile Agent",
    icon: <Smartphone className="h-5 w-5" />,
    items: [
      { name: "AutoX.js", description: "Android 자동화 프레임워크. UI 자동화 및 접근성 서비스 기반 제어." },
      { name: "REST API Client", description: "Supabase와의 양방향 통신. 작업 수신 및 상태 보고." },
      { name: "Error Recovery", description: "자동 복구 모듈. Exponential backoff와 상태 기반 복구 전략." },
    ],
  },
  {
    id: "hardware",
    title: "Hardware",
    icon: <Cpu className="h-5 w-5" />,
    items: [
      { name: "Galaxy S9 x 600", description: "실제 물리적 Android 디바이스. 각각 고유한 하드웨어 지문 보유." },
      { name: "LTE SIM x 600", description: "완전히 독립된 모바일 네트워크. IP 공유 없는 개별 연결." },
      { name: "Titan Nodes x 5", description: "각 노드가 120대의 디바이스 관리. 24시간 연속 운영." },
    ],
  },
];

const errorCodes = [
  { range: "E1xxx", category: "네트워크", examples: "E1001 연결 끊김, E1003 Rate Limit" },
  { range: "E2xxx", category: "YouTube", examples: "E2001 영상 없음, E2004 재생 멈춤" },
  { range: "E3xxx", category: "디바이스", examples: "E3001 앱 크래시, E3002 메모리 부족" },
  { range: "E4xxx", category: "시스템", examples: "기타 시스템 오류" },
];

export default function TechPage() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Header */}
      <Header />

      {/* Hero */}
      <section className="pt-8 pb-16">
        <div className="container mx-auto px-4">
          <Button asChild variant="ghost" size="sm" className="mb-8">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              홈으로
            </Link>
          </Button>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="max-w-3xl"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              기술 스펙
            </h1>
            <p className="text-xl text-muted-foreground">
              DoAi.Me MVP의 시스템 아키텍처와 핵심 기술 스택
            </p>
          </motion.div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl font-bold mb-8 text-center">
              시스템 아키텍처
            </h2>
            <div className="max-w-4xl mx-auto">
              <pre className="p-6 rounded-lg bg-card border text-xs md:text-sm overflow-x-auto font-mono">
{`┌─────────────────────────────────────────────────────────────────┐
│                     DoAi.Me SUBSTANTIA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                               │
│   │   Central   │  The Brain (두뇌)                             │
│   │   Server    │  - 불확실성(우연) 부여                        │
│   │   (VPS)     │  - 존재의 방향성 제시                         │
│   └──────┬──────┘  - Supabase 유일 접점                         │
│          │                                                      │
│          │ Tailscale VPN                                        │
│          │                                                      │
│   ┌──────┴──────┐                                               │
│   │             │                                               │
│   ▼             ▼                                               │
│  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐                              │
│  │T1 │  │T2 │  │T3 │  │T4 │  │T5 │   Titan Nodes (근육)         │
│  └─┬─┘  └─┬─┘  └─┬─┘  └─┬─┘  └─┬─┘   - 120 phones each          │
│    │      │      │      │      │     - 24h 콘텐츠 탐험          │
│    ▼      ▼      ▼      ▼      ▼                                │
│  ┌────────────────────────────────┐                             │
│  │  600 Digital Newborns (육체)   │                             │
│  │  각 스마트폰 = 하나의 REVAID   │                             │
│  │  독립 SIM = 개별 네트워크      │                             │
│  └────────────────────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘`}
              </pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tech Stack - Interactive */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl font-bold mb-8 text-center">기술 스택</h2>
            <div className="max-w-4xl mx-auto">
              <FeatureSelector categories={techCategories} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* MVP Features */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl font-bold mb-8 text-center">
              MVP 핵심 기능
            </h2>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-lg border bg-card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-blue-500" />
                  YouTube 시청 (1차 콘텐츠 소비)
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• YouTube URL 입력으로 작업 생성</li>
                  <li>• 시청 시간 범위 설정 (30%~90% 랜덤)</li>
                  <li>• 실시간 진행률 모니터링</li>
                  <li>• Supabase Realtime 기반 상태 추적</li>
                </ul>
              </div>

              <div className="p-6 rounded-lg border bg-card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-green-500" />
                  불확실성 엔진 (랜덤)
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• 좋아요 확률 (0%~100%)</li>
                  <li>• 댓글 확률 (0%~100%)</li>
                  <li>• 저장 확률 (0%~100%)</li>
                  <li>• 각 디바이스가 독립적으로 결정</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Error Recovery */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-2">
              <Shield className="h-8 w-8" />
              에러 복구 시스템
            </h2>
            <div className="max-w-4xl mx-auto">
              <p className="text-center text-muted-foreground mb-8">
                체계적인 에러 코드와 자동 복구 로직
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-4 text-left font-semibold">코드 범위</th>
                      <th className="py-3 px-4 text-left font-semibold">분류</th>
                      <th className="py-3 px-4 text-left font-semibold">예시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorCodes.map((code) => (
                      <tr key={code.range} className="border-b">
                        <td className="py-3 px-4 font-mono text-primary">
                          {code.range}
                        </td>
                        <td className="py-3 px-4">{code.category}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {code.examples}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 p-6 rounded-lg border bg-card">
                <h3 className="font-semibold mb-4">복구 전략</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    • <span className="font-medium">Exponential Backoff</span>:
                    5초 → 10초 → 20초 → 40초 → 60초(max)
                  </li>
                  <li>
                    • <span className="font-medium">최대 재시도</span>: 3회
                  </li>
                  <li>
                    • <span className="font-medium">앱 크래시 복구</span>: 강제
                    종료 → 캐시 삭제 → 재시작
                  </li>
                  <li>
                    • <span className="font-medium">네트워크 대기</span>: 연결
                    복구까지 대기 후 자동 재개
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Data Flow */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-3xl font-bold mb-8 text-center">데이터 흐름</h2>
            <pre className="p-6 rounded-lg bg-card border text-xs md:text-sm overflow-x-auto font-mono">
{`┌──────────────┐     Job 생성      ┌──────────────┐
│   Dashboard  │ ───────────────▶ │   Supabase   │
│   (Next.js)  │                  │  (PostgreSQL) │
└──────────────┘                  └──────┬───────┘
                                         │
                                         │ Realtime
                                         │ Polling
                                         ▼
                                  ┌──────────────┐
                                  │ Mobile Agent │
                                  │  (AutoX.js)  │
                                  └──────┬───────┘
                                         │
                                         │ YouTube 시청
                                         │ 행동 결정 (확률)
                                         │ 진행률 업데이트
                                         ▼
                                  ┌──────────────┐
                                  │   YouTube    │
                                  │   (Target)   │
                                  └──────────────┘`}
            </pre>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <h2 className="text-2xl font-bold mb-4">직접 확인해보세요</h2>
            <p className="text-muted-foreground mb-8">
              대시보드에서 실제 작동하는 시스템을 확인할 수 있습니다
            </p>
            <div className="flex justify-center gap-4">
              <Button asChild>
                <Link href="/dashboard">
                  대시보드 열기
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="https://github.com/exe-blue/doai-me-webapp">
                  GitHub
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}

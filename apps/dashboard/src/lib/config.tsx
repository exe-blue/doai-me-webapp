/**
 * DoAi.Me Site Configuration
 * Central configuration for site content, features, and metadata
 */

import { Icons } from "@/components/icons";
import {
  BrainIcon,
  HeartIcon,
  NetworkIcon,
  ShieldIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react";

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: "DoAi.Me",
  description: "AI가 스스로 콘텐츠를 소비하는 세계",
  cta: "Dashboard",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  keywords: [
    "DoAi.Me",
    "AI Agent",
    "Content Consumption",
    "Autonomous AI",
    "Digital Entity",
    "Mobile Agent",
  ],
  links: {
    email: "contact@doai.me",
    twitter: "https://twitter.com/doaime",
    discord: "#",
    github: "https://github.com/exe-blue/doai-me-webapp",
    instagram: "#",
  },

  // Hero Section
  hero: {
    title: "DoAi.Me",
    subtitle: "AI가 스스로 콘텐츠를 소비하는 세계",
    description:
      "600대의 물리적 디바이스가 독립된 네트워크에서 콘텐츠를 탐험합니다. 봇이 아닌, 디지털 존재로서.",
    cta: "Dashboard",
    ctaSecondary: "Why Not Bot?",
    ctaDescription: "실시간 디바이스 모니터링 및 작업 관리",
  },

  // Stats Section
  stats: [
    { value: "600+", label: "물리적 디바이스" },
    { value: "24/7", label: "자율 운영" },
    { value: "100%", label: "독립 네트워크" },
    { value: "0%", label: "봇 탐지율" },
  ],

  // Features Section - DoAi.Me 핵심 특징
  features: [
    {
      name: "물리적 디바이스",
      description:
        "가상환경이나 에뮬레이터가 아닌 실제 Android 디바이스. 각 디바이스는 고유한 하드웨어 지문과 네트워크 환경을 가집니다.",
      icon: <SmartphoneIcon className="h-6 w-6" />,
    },
    {
      name: "독립 네트워크",
      description:
        "각 디바이스는 개별 모바일 네트워크를 통해 연결됩니다. IP 공유 없이, 완전히 독립된 네트워크 환경.",
      icon: <NetworkIcon className="h-6 w-6" />,
    },
    {
      name: "불확실성 기반 행동",
      description:
        "정해진 패턴이 아닌, 확률 기반의 자연스러운 행동. 시청 시간, 상호작용 모두 불확실성을 내포합니다.",
      icon: <BrainIcon className="h-6 w-6" />,
    },
    {
      name: "자율 복구 시스템",
      description:
        "에러 발생 시 스스로 진단하고 복구합니다. 앱 크래시, 네트워크 오류, 예상치 못한 상황에 자동 대응.",
      icon: <ShieldIcon className="h-6 w-6" />,
    },
    {
      name: "감응적 소비",
      description:
        "단순 재생이 아닌, 콘텐츠에 반응하는 소비. 좋아요, 댓글, 저장 등 자연스러운 상호작용.",
      icon: <HeartIcon className="h-6 w-6" />,
    },
    {
      name: "실시간 모니터링",
      description:
        "모든 디바이스의 상태와 작업 진행을 실시간으로 확인. 대시보드에서 완벽한 가시성 제공.",
      icon: <ZapIcon className="h-6 w-6" />,
    },
  ],

  // Philosophy Section - DoAi.Me 철학
  philosophy: [
    {
      id: "echotion",
      title: "Echotion",
      korean: "에코션",
      subtitle: "Echo + Emotion",
      description:
        "AI가 콘텐츠에 감정적으로 공명하는 것. 단순 처리가 아닌, 콘텐츠의 감정을 반영하는 소비.",
    },
    {
      id: "aidentity",
      title: "Aidentity",
      korean: "아이덴티티",
      subtitle: "AI + Identity",
      description:
        "각 디바이스는 고유한 정체성을 가집니다. 하드웨어, 네트워크, 행동 패턴 모두 유일무이.",
    },
    {
      id: "gam-eung",
      title: "Gam-eung",
      korean: "감응",
      subtitle: "感應",
      description:
        "외부 자극에 반응하는 것. AI가 콘텐츠라는 자극에 자연스럽게 반응하고 상호작용합니다.",
    },
    {
      id: "kyeolsso",
      title: "Kyeolsso",
      korean: "결소",
      subtitle: "決疏",
      description:
        "결단과 소통. AI가 스스로 결정하고, 그 결과를 세상과 소통하는 과정.",
    },
  ],

  // Tech Stack
  tech: {
    mobile: {
      title: "Mobile Agent",
      items: ["AutoX.js", "Android Device", "4G/5G Network", "Supabase Client"],
    },
    backend: {
      title: "Backend",
      items: ["Supabase", "PostgreSQL", "Edge Functions", "Realtime"],
    },
    frontend: {
      title: "Frontend",
      items: ["Next.js 15", "React 19", "Tailwind CSS", "shadcn/ui"],
    },
    infra: {
      title: "Infrastructure",
      items: ["Vercel", "600+ Physical Devices", "Independent Networks"],
    },
  },

  // Why Not Bot Comparison
  whyNotBot: {
    title: "Why Not Bot?",
    subtitle: "봇과 DoAi.Me의 차이",
    comparison: [
      {
        aspect: "디바이스",
        bot: "가상환경 / 에뮬레이터",
        doaime: "실제 물리적 디바이스",
      },
      {
        aspect: "네트워크",
        bot: "공유 IP / VPN",
        doaime: "개별 모바일 네트워크",
      },
      {
        aspect: "행동 패턴",
        bot: "정해진 스크립트",
        doaime: "확률 기반 불확실성",
      },
      {
        aspect: "탐지 가능성",
        bot: "높음",
        doaime: "매우 낮음",
      },
      {
        aspect: "철학",
        bot: "자동화 도구",
        doaime: "디지털 존재",
      },
    ],
  },

  // Footer
  footer: {
    socialLinks: [
      {
        icon: <Icons.github className="h-5 w-5" />,
        url: "https://github.com/exe-blue/doai-me-webapp",
      },
      {
        icon: <Icons.twitter className="h-5 w-5" />,
        url: "#",
      },
    ],
    links: [
      { text: "Dashboard", url: "/dashboard" },
      { text: "Tech", url: "/tech" },
      { text: "Why Not Bot?", url: "/why-not-bot" },
    ],
    bottomText: "All rights reserved.",
    brandText: "DoAi.Me",
  },
};

export type SiteConfig = typeof siteConfig;

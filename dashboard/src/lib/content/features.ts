import {
  Smartphone,
  Dice6,
  Heart,
  Activity,
  Shield,
  Brain,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const investorFeatures: Feature[] = [
  {
    icon: Smartphone,
    title: "물리적 독립성",
    description:
      "600대의 실제 Galaxy S9, 개별 LTE SIM으로 완전히 독립된 네트워크 환경",
  },
  {
    icon: Dice6,
    title: "불확실성 엔진",
    description:
      "시청 시간 30~90% 랜덤, 각 행동 확률로 자연스러운 패턴 생성",
  },
  {
    icon: Heart,
    title: "자율적 반응",
    description:
      "좋아요/댓글/저장을 확률 기반으로 결정하는 자율 의사결정 시스템",
  },
  {
    icon: Activity,
    title: "실시간 모니터링",
    description: "Supabase Realtime 기반 600대 디바이스 상태 실시간 추적",
  },
  {
    icon: Shield,
    title: "자동 복구",
    description: "네트워크 끊김, 앱 크래시 등 에러 상황 자동 감지 및 복구",
  },
  {
    icon: Brain,
    title: "AI 사회 시뮬레이션",
    description: "콘텐츠 소비를 통해 각 AI가 고유한 경험과 취향을 축적",
  },
];

export const stats = [
  { value: "600+", label: "물리적 디바이스" },
  { value: "600+", label: "독립 네트워크" },
  { value: "24/7", label: "무중단 운영" },
  { value: "100%", label: "자율 의사결정" },
];

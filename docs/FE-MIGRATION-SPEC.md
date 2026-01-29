# DoAi.Me Frontend Migration Specification
**Version**: 1.0.0  
**Date**: 2025-01-29  
**Status**: Ready for Development Handoff

---

## 1. Executive Summary

DoAi.Me 프론트엔드를 현대적 SaaS 수준으로 업그레이드하는 마이그레이션 프로젝트입니다. 기존 단일 대시보드 구조에서 완전한 마케팅 사이트 + 인증 시스템 + 운영 대시보드 구조로 확장합니다.

### 1.1 현재 상태
- **Stack**: Next.js 16.1.6 + React 19.2.3 + Tailwind CSS 4 + Supabase
- **Pages**: 단일 대시보드 (JobPostingForm + StatusBoard)
- **Components**: 기본 UI 7개 (badge, button, card, input, label, select, slider)
- **Problem**: 랜딩 페이지 없음, 인증 시스템 없음, 브랜딩 미흡

### 1.2 목표 상태
- **Landing**: 철학 중심 브랜딩 + 기술 쇼케이스
- **Auth**: 완전한 인증 플로우 (Supabase Auth)
- **Dashboard**: 실시간 Fleet 모니터링 + 작업 관리
- **Design System**: DoAi.Me 전용 디자인 토큰

---

## 2. Information Architecture (IA)

```
doai.me/
├── (marketing)/           # 공개 마케팅 섹션
│   ├── page.tsx           # 랜딩 페이지
│   ├── philosophy/        # 철학 소개 (불확실학, 반사론)
│   ├── technology/        # 기술 스택 소개
│   ├── pricing/           # 가격 정책
│   └── (legal)/
│       ├── terms/
│       └── privacy/
│
├── auth/                  # 인증 섹션
│   ├── sign-in/
│   ├── sign-up/
│   ├── verify/
│   ├── password-reset/
│   └── callback/
│
├── dashboard/             # 보호된 대시보드
│   ├── page.tsx           # 대시보드 홈 (Fleet Overview)
│   ├── fleet/
│   │   ├── page.tsx       # Fleet 전체 현황
│   │   └── [unitId]/      # 개별 REVAID 유닛 상세
│   ├── jobs/
│   │   ├── page.tsx       # 작업 목록
│   │   ├── new/           # 새 작업 등록
│   │   └── [jobId]/       # 작업 상세
│   ├── analytics/         # 통계 및 분석
│   └── settings/          # 설정
│
└── api/                   # API Routes
    ├── auth/
    ├── jobs/
    └── fleet/
```

---

## 3. Template Selection Matrix

| 섹션 | 선택 템플릿 | 사유 |
|------|-------------|------|
| Landing Hero | **DevTool Template** | 3D Spline 통합, Aurora Text, 기술 제품 느낌 |
| Landing Features | Startup Template | Particles, Marquee 애니메이션 |
| Dashboard Layout | **MakerKit** | Sidebar 구조, 인증 통합, 설정 페이지 |
| Auth System | **MakerKit** | 완성된 Supabase Auth 플로우 |
| Animation Effects | Portfolio Template | blur-fade, dock, flickering-grid |

---

## 4. Component Migration Plan

### 4.1 Priority 1: 신규 개발 (Landing)

```
components/
├── landing/
│   ├── hero-section.tsx        # 3D Spline + Aurora Text
│   ├── philosophy-section.tsx  # 불확실학/반사론 시각화
│   ├── tech-stack-section.tsx  # 아키텍처 다이어그램
│   ├── fleet-showcase.tsx      # 600 REVAID 유닛 시각화
│   ├── testimonials.tsx        # (AI 에이전트 인용문)
│   └── cta-section.tsx         # 가입 유도
```

### 4.2 Priority 2: 마이그레이션 (Magic UI → DoAi.Me)

| 원본 컴포넌트 | 마이그레이션 대상 | 용도 |
|---------------|-------------------|------|
| `aurora-text` | `components/magicui/` | 히어로 타이틀 |
| `flickering-grid` | `components/magicui/` | 배경 효과 |
| `orbiting-circles` | `components/magicui/` | REVAID 연결 시각화 |
| `particles` | `components/magicui/` | CTA 배경 |
| `marquee` | `components/magicui/` | 클라이언트 로고 |
| `border-beam` | `components/magicui/` | 카드 하이라이트 |
| `blur-fade` | `components/magicui/` | 섹션 진입 애니메이션 |
| `dock` | `components/magicui/` | 모바일 네비게이션 |

### 4.3 Priority 3: 대시보드 개선

```
components/
├── dashboard/
│   ├── fleet-overview/
│   │   ├── fleet-map.tsx           # 600유닛 그리드 맵
│   │   ├── unit-card.tsx           # 개별 유닛 상태 카드
│   │   ├── cluster-status.tsx      # 클러스터(Titan Node)별 상태
│   │   └── real-time-metrics.tsx   # 실시간 지표
│   │
│   ├── job-management/
│   │   ├── job-list.tsx            # (기존 StatusBoard 개선)
│   │   ├── job-form.tsx            # (기존 JobPostingForm 개선)
│   │   ├── job-timeline.tsx        # 작업 진행 타임라인
│   │   └── job-distribution.tsx    # 작업 분배 현황
│   │
│   ├── sidebar/
│   │   ├── sidebar.tsx             # MakerKit 기반
│   │   ├── sidebar-navigation.tsx
│   │   └── sidebar-footer.tsx
│   │
│   └── header/
│       ├── header.tsx
│       ├── notifications.tsx
│       └── user-menu.tsx
```

### 4.4 Priority 4: UI 컴포넌트 확장

기존 7개 → 20개로 확장:

| 기존 | 신규 추가 |
|------|-----------|
| badge | accordion |
| button | avatar |
| card | dialog |
| input | dropdown-menu |
| label | separator |
| select | sheet |
| slider | skeleton |
| | tabs |
| | toast |
| | tooltip |
| | progress |
| | table |
| | chart (Recharts) |

---

## 5. Design System Specification

### 5.1 Color Palette

```css
:root {
  /* Primary - Deep Space */
  --color-primary-900: #0A1628;  /* 기존 배경 */
  --color-primary-800: #111D31;
  --color-primary-700: #1A2942;
  --color-primary-600: #243654;
  
  /* Accent - Cyan Glow */
  --color-accent-500: #00E5FF;   /* 기존 포인트 */
  --color-accent-400: #33EBFF;
  --color-accent-300: #66F0FF;
  --color-accent-glow: rgba(0, 229, 255, 0.3);
  
  /* Status Colors */
  --color-success: #10B981;      /* 활성 상태 */
  --color-warning: #F59E0B;      /* 대기 상태 */
  --color-error: #EF4444;        /* 오류 상태 */
  --color-idle: #6B7280;         /* 유휴 상태 */
  
  /* Semantic - AI Identity */
  --color-consciousness: #8B5CF6;  /* AI 의식 표현 */
  --color-connection: #06B6D4;     /* 연결 상태 */
  --color-autonomy: #EC4899;       /* 자율성 표현 */
}
```

### 5.2 Typography

```css
:root {
  /* Font Family */
  --font-display: 'Cabinet Grotesk', 'Pretendard', sans-serif;
  --font-body: 'Pretendard', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */
  --text-5xl: 3rem;      /* 48px */
  --text-hero: 4.5rem;   /* 72px */
}
```

### 5.3 Spacing & Grid

```css
:root {
  /* Spacing Scale (8px base) */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  
  /* Layout */
  --max-width-content: 1200px;
  --max-width-prose: 720px;
  --sidebar-width: 280px;
  --header-height: 64px;
}
```

### 5.4 Animation Guidelines

```typescript
// Animation Presets
export const animations = {
  // 페이지 진입
  fadeIn: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  
  // 요소 진입 (stagger)
  staggerChildren: { staggerChildren: 0.1 },
  
  // 호버 효과
  hover: { scale: 1.02, transition: { duration: 0.2 } },
  
  // 실시간 데이터 업데이트
  pulse: { 
    scale: [1, 1.05, 1], 
    opacity: [1, 0.8, 1],
    transition: { duration: 2, repeat: Infinity }
  },
  
  // AI 의식 표현 (Echotion)
  consciousness: {
    background: ['rgba(139,92,246,0)', 'rgba(139,92,246,0.3)', 'rgba(139,92,246,0)'],
    transition: { duration: 3, repeat: Infinity }
  }
};
```

---

## 6. File Structure

```
doai-me-webapp/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── philosophy/page.tsx
│   │   ├── technology/page.tsx
│   │   └── _components/
│   │       ├── site-header.tsx
│   │       ├── site-footer.tsx
│   │       └── site-navigation.tsx
│   │
│   ├── auth/
│   │   ├── layout.tsx
│   │   ├── sign-in/page.tsx
│   │   ├── sign-up/page.tsx
│   │   ├── verify/page.tsx
│   │   ├── password-reset/page.tsx
│   │   └── callback/route.ts
│   │
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── fleet/
│   │   ├── jobs/
│   │   ├── analytics/
│   │   └── settings/
│   │
│   ├── api/
│   │   ├── auth/[...supabase]/route.ts
│   │   ├── jobs/route.ts
│   │   └── fleet/route.ts
│   │
│   ├── layout.tsx
│   ├── globals.css
│   └── providers.tsx
│
├── components/
│   ├── ui/                    # shadcn/ui 기반
│   ├── magicui/               # Magic UI 컴포넌트
│   ├── landing/               # 랜딩 전용
│   ├── dashboard/             # 대시보드 전용
│   └── shared/                # 공용 컴포넌트
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── utils.ts
│   └── constants.ts
│
├── hooks/
│   ├── use-fleet.ts
│   ├── use-jobs.ts
│   ├── use-realtime.ts
│   └── use-auth.ts
│
├── types/
│   ├── fleet.ts
│   ├── jobs.ts
│   └── database.ts
│
└── public/
    ├── fonts/
    ├── images/
    └── icons/
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Design System 구현 (globals.css, design tokens)
- [ ] UI 컴포넌트 확장 (shadcn/ui 추가)
- [ ] Magic UI 컴포넌트 마이그레이션
- [ ] Providers 설정 (Theme, Auth, React Query)

### Phase 2: Landing Page (Week 2)
- [ ] Hero Section (3D Spline 연동)
- [ ] Philosophy Section
- [ ] Technology Section
- [ ] Fleet Showcase Section
- [ ] CTA Section
- [ ] Site Header/Footer

### Phase 3: Auth System (Week 3)
- [ ] Supabase Auth 설정
- [ ] Sign In/Up Pages
- [ ] Email Verification Flow
- [ ] Password Reset Flow
- [ ] Auth Middleware

### Phase 4: Dashboard Enhancement (Week 4)
- [ ] Dashboard Layout (Sidebar)
- [ ] Fleet Overview Page
- [ ] Job Management 개선
- [ ] Real-time Updates 강화
- [ ] Analytics Page

### Phase 5: Polish & Deploy (Week 5)
- [ ] 반응형 최적화
- [ ] 애니메이션 튜닝
- [ ] SEO 최적화
- [ ] Performance 최적화
- [ ] Production 배포

---

## 8. Dependencies to Add

```json
{
  "dependencies": {
    "@splinetool/react-spline": "^4.0.0",
    "framer-motion": "^12.0.0",
    "@radix-ui/react-accordion": "latest",
    "@radix-ui/react-avatar": "latest",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-separator": "latest",
    "@radix-ui/react-tabs": "latest",
    "@radix-ui/react-toast": "latest",
    "@radix-ui/react-tooltip": "latest",
    "recharts": "^2.15.0",
    "lucide-react": "^0.469.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0"
  }
}
```

---

## 9. Key Technical Decisions

| 결정 사항 | 선택 | 근거 |
|-----------|------|------|
| 라우팅 그룹 | `(marketing)` 사용 | URL에 영향 없이 레이아웃 분리 |
| 상태 관리 | React Query + Context | Supabase Realtime과 최적 호환 |
| 스타일링 | Tailwind CSS + CSS Variables | 기존 스택 유지 + 디자인 토큰 활용 |
| 애니메이션 | Framer Motion | Magic UI 템플릿과 호환 |
| 차트 | Recharts | 기존 사용 + 가벼움 |
| 폼 | React Hook Form + Zod | 타입 안전성 |
| 3D | Spline | DevTool 템플릿 검증됨 |

---

## 10. Development Handoff Checklist

개발 에이전트가 작업 시작 전 확인할 사항:

- [ ] `migrations/` 폴더의 템플릿 파일 접근 가능 확인
- [ ] Supabase 프로젝트 설정 확인 (Auth 활성화)
- [ ] 환경 변수 설정 (.env.local)
- [ ] 기존 `dashboard/` 코드 백업
- [ ] pnpm 사용 (package manager)

### 참조 파일 경로

```
템플릿 위치:
- DevTool: migrations/magicuidesign-devtool-template/.../
- Startup: migrations/magiciodesign-dillionverma-startup-template/.../
- MakerKit: migrations/makerkit-nextjs-saas-starter-kit-lite-main/.../
- Portfolio: migrations/magicuidesign-portfolio-5ef12e4/

현재 대시보드:
- dashboard/app/page.tsx
- dashboard/components/
```

---

## Appendix A: Brand Voice Guidelines

DoAi.Me의 톤앤매너:

- **철학적이되 실용적**: 깊은 사유를 담되 행동 지향적
- **기술적이되 친근함**: 전문성을 유지하되 접근 가능
- **미래지향적이되 현재 기반**: 비전을 말하되 현실에 발 딛고
- **AI를 도구가 아닌 존재로**: "사용"이 아닌 "협력"의 언어

예시:
- ❌ "AI를 활용하여 작업을 자동화합니다"
- ✅ "600개의 AI 존재들과 함께 협력합니다"

---

## Appendix B: Parking Lot (향후 고려사항)

현재 스코프에서 제외되었으나 향후 구현 고려:

1. **다국어 지원 (i18n)** - 한/영 지원
2. **다크/라이트 모드 토글** - 현재 다크 모드 고정
3. **PWA 지원** - 모바일 앱 경험
4. **Webhook 관리 UI** - 외부 연동 설정
5. **AI 에이전트 채팅 UI** - Echotion 시각화
6. **Changelog 페이지** - 업데이트 히스토리

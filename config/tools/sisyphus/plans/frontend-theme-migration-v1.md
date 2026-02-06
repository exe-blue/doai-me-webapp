# 프론트엔드 테마 마이그레이션 계획

**Plan ID**: frontend-theme-migration-v1
**Created**: 2026-01-29
**Scope**: 전체 사이트 (랜딩 + 대시보드)
**Theme Color**: 노란색 (#f2cb05 / oklch(0.88 0.18 95))

---

## 1. 요구사항 요약

### 1.1 핵심 목표
- MagicUI DevTool Template 디자인 시스템 적용
- 메인 테마 색상: **노란색** (로고 색상 #f2cb05 기반)
- 기존 DoAi.Me 컨텐츠 유지 (철학, 기술 스펙, Why Not Bot)
- 파비콘 생성 (로고 아이콘 기반)

### 1.2 변경 범위
| 항목 | 범위 |
|------|------|
| 랜딩 페이지 | page.tsx, why-not-bot, tech |
| 대시보드 | dashboard/, nodes/ |
| 공통 스타일 | globals.css, 색상 변수 |
| 컴포넌트 | MagicUI 컴포넌트 통합 |
| 파비콘 | 새로 생성 |

---

## 2. 색상 시스템 설계

### 2.1 Primary Color (노란색)
```css
/* 로고 색상: #f2cb05 */
/* OKLCH 변환 */
--primary: oklch(0.88 0.18 95);           /* 밝은 노란색 */
--primary-foreground: oklch(0.15 0.05 95); /* 어두운 텍스트 */
```

### 2.2 전체 색상 팔레트 (Light Mode)
```css
:root {
  --background: oklch(0.98 0.004 95);
  --foreground: oklch(0.09 0.03 95);
  --primary: oklch(0.88 0.18 95);        /* 노란색 */
  --primary-foreground: oklch(0.15 0.05 95);
  --secondary: oklch(0.95 0.02 95);
  --accent: oklch(0.92 0.08 95);         /* 연한 노란색 */
  --muted: oklch(0.96 0.01 95);
  --muted-foreground: oklch(0.52 0.02 95);
}
```

### 2.3 Dark Mode 색상
```css
.dark {
  --background: oklch(0.12 0.02 95);
  --foreground: oklch(0.98 0.004 95);
  --primary: oklch(0.85 0.16 95);        /* 약간 어두운 노란색 */
  --primary-foreground: oklch(0.12 0.03 95);
  --card: oklch(0.15 0.02 95);
  --accent: oklch(0.25 0.06 95);
}
```

---

## 3. 마이그레이션 태스크

### Phase 1: 기반 작업

#### Task 1.1: globals.css 교체
- **FROM**: 현재 기본 색상 시스템
- **TO**: MagicUI 템플릿 스타일 + 노란색 테마
- **내용**:
  - OKLCH 색상 변수 (노란색 기반)
  - 그리드 배경 스타일
  - 애니메이션 키프레임 (marquee, aurora, ripple, orbit)
  - 스크롤바 스타일

#### Task 1.2: 파비콘 생성
- **SOURCE**: `migrations/logo/icon-yellow.svg`
- **OUTPUT**:
  - `public/favicon.ico` (32x32, 16x16)
  - `public/apple-touch-icon.png` (180x180)
  - `public/favicon-32x32.png`
  - `public/favicon-16x16.png`

#### Task 1.3: 로고 컴포넌트 생성
- **SOURCE**: `migrations/logo/logo-yellow.svg`, `logo-white.svg`
- **OUTPUT**: `components/icons.tsx`
- **내용**: Logo, LogoIcon 컴포넌트

### Phase 2: MagicUI 컴포넌트 통합

#### Task 2.1: 새 MagicUI 컴포넌트 복사
- **FROM**: `migrations/magicuidesign-devtool-template/src/components/`
- **TO**: `dashboard/src/components/`
- **복사할 컴포넌트**:
  - `aurora-text.tsx` (텍스트 그라데이션 효과)
  - `section.tsx` (섹션 래퍼)
  - `mobile-drawer.tsx` (모바일 네비게이션)
  - `feature-selector.tsx` (피처 선택기)
  - `ui/flickering-grid.tsx` (업데이트)
  - `ui/ripple.tsx` (리플 효과)
  - `ui/orbiting-circles.tsx` (궤도 애니메이션)
  - `ui/border-number.tsx` (번호 뱃지)

#### Task 2.2: 기존 컴포넌트 업데이트
- `ui/button.tsx` - MagicUI 스타일 통합
- `ui/card.tsx` - 호버 효과 추가
- `ui/badge.tsx` - 새 variant 추가

### Phase 3: 랜딩 페이지 리디자인

#### Task 3.1: 새 Header 컴포넌트
- MagicUI 스타일 헤더
- 로고 + 네비게이션
- 모바일 드로어 통합
- 테마 토글

#### Task 3.2: 새 Hero 섹션
- AuroraText 타이틀
- 애니메이션 효과
- DoAi.Me 컨텐츠 적용:
  - 타이틀: "AI가 스스로 콘텐츠를 소비하는 세계"
  - CTA: "Dashboard" 버튼

#### Task 3.3: Features 섹션 리디자인
- MagicUI 카드 스타일
- 기존 6개 특징 유지
- 아이콘 애니메이션

#### Task 3.4: Statistics 섹션
- 600+ 디바이스, 24/7 운영 등
- 카운터 애니메이션

#### Task 3.5: Philosophy 섹션
- Echotion, Aidentity, Gam-eung, Kyeolsso
- 그리드 레이아웃

#### Task 3.6: CTA 섹션
- "봇이 아닌 존재" 메시지
- FlickeringGrid 배경

#### Task 3.7: Footer 리디자인
- MagicUI 스타일
- 소셜 링크, 네비게이션

### Phase 4: 서브 페이지 리디자인

#### Task 4.1: Why Not Bot 페이지
- 새 헤더/푸터 적용
- 비교 테이블 리디자인
- 섹션 애니메이션

#### Task 4.2: Tech 페이지
- 새 헤더/푸터 적용
- 아키텍처 다이어그램 리디자인
- 코드 블록 스타일링

### Phase 5: 대시보드 테마 적용

#### Task 5.1: 대시보드 레이아웃
- 사이드바 색상 업데이트
- 헤더 노란색 악센트

#### Task 5.2: 대시보드 카드 스타일
- 호버 효과
- 보더 그라데이션

#### Task 5.3: 노드 관리 페이지
- 디바이스 카드 리디자인
- 상태 인디케이터 색상

### Phase 6: lib/config.tsx 생성

#### Task 6.1: 사이트 설정 파일
```tsx
export const siteConfig = {
  name: "DoAi.Me",
  description: "AI가 스스로 콘텐츠를 소비하는 세계",
  hero: {
    title: "DoAi.Me",
    description: "600대의 물리적 디바이스가 독립된 네트워크에서 콘텐츠를 탐험합니다",
    cta: "Dashboard",
  },
  features: [...],
  stats: [...],
  links: {
    github: "https://github.com/exe-blue/doai-me-webapp",
    dashboard: "/dashboard",
  }
}
```

---

## 4. 파일 변경 목록

### 생성 (Create)
```
dashboard/src/
├── components/
│   ├── aurora-text.tsx
│   ├── section.tsx
│   ├── mobile-drawer.tsx
│   ├── icons.tsx
│   └── ui/
│       ├── ripple.tsx
│       ├── orbiting-circles.tsx
│       └── border-number.tsx
├── lib/
│   ├── config.tsx
│   └── animation.ts
└── public/
    ├── favicon.ico
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    ├── apple-touch-icon.png
    ├── logo.svg
    └── logo-icon.svg
```

### 수정 (Modify)
```
dashboard/src/
├── app/
│   ├── globals.css          # 전체 테마 색상
│   ├── layout.tsx           # 메타데이터, 파비콘
│   ├── page.tsx             # 새 랜딩 페이지
│   ├── why-not-bot/page.tsx # 리디자인
│   ├── tech/page.tsx        # 리디자인
│   └── dashboard/
│       └── page.tsx         # 테마 적용
└── components/
    ├── sections/
    │   ├── hero.tsx         # 새 디자인
    │   ├── header.tsx       # 새 디자인
    │   ├── features.tsx     # 새 디자인
    │   ├── footer.tsx       # 새 디자인
    │   └── cta.tsx          # 새 디자인
    └── ui/
        ├── button.tsx       # 스타일 업데이트
        └── card.tsx         # 스타일 업데이트
```

---

## 5. 실행 순서

| # | Task | 의존성 | 병렬 가능 |
|---|------|--------|----------|
| 1 | globals.css 교체 | - | ✅ |
| 2 | 파비콘 생성 | - | ✅ |
| 3 | 로고/아이콘 컴포넌트 | - | ✅ |
| 4 | lib/config.tsx 생성 | - | ✅ |
| 5 | MagicUI 컴포넌트 복사 | 1 | ✅ |
| 6 | Header 컴포넌트 | 3, 4 | - |
| 7 | Hero 섹션 | 4, 5 | - |
| 8 | Features 섹션 | 5 | ✅ |
| 9 | Statistics 섹션 | 5 | ✅ |
| 10 | CTA 섹션 | 5 | ✅ |
| 11 | Footer 컴포넌트 | 3, 4 | - |
| 12 | 랜딩 page.tsx 통합 | 6-11 | - |
| 13 | Why Not Bot 리디자인 | 6, 11 | ✅ |
| 14 | Tech 리디자인 | 6, 11 | ✅ |
| 15 | 대시보드 테마 적용 | 1 | ✅ |
| 16 | layout.tsx 업데이트 | 2 | - |

---

## 6. 검증 항목

- [ ] Light/Dark 모드 전환 정상 동작
- [ ] 노란색 primary 색상 일관성
- [ ] 파비콘 브라우저 표시 확인
- [ ] 로고 라이트/다크 모드 대응
- [ ] 모바일 반응형 레이아웃
- [ ] 애니메이션 성능 (60fps)
- [ ] 대시보드 기능 정상 동작
- [ ] 빌드 에러 없음

---

## 7. 롤백 계획

1. git commit 생성 후 작업 시작
2. 브랜치: `refactor/frontend-theme-v1`
3. 문제 시: `git checkout main`

---

**Plan Status**: Ready for Execution
**Estimated Tasks**: 16 tasks
**Parallelizable**: 60%+

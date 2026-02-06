# Frontend UX/UI Improvement Plan v1

## Overview

DoAi.Me 프론트엔드의 접근성 개선, UI 디자인 상향, UX 경험 개선을 위한 계획입니다.

**작성일**: 2026-01-29
**Target User**: 일반 사용자 (기본 웹 접근성 준수)
**Scope**: 메인 랜딩 + 서브페이지 (why-not-bot, tech) 전체 통일

---

## Phase 1: Sub-page Header/Footer 통일

### 목표
why-not-bot 및 tech 페이지가 현재 구식 nav/footer를 사용 중. 새로운 MagicUI 기반 Header/Footer 컴포넌트로 통일.

### Tasks

#### 1.1 why-not-bot/page.tsx 업데이트
- [ ] 기존 인라인 nav 제거
- [ ] `<Header />` 컴포넌트 import 및 적용
- [ ] 기존 인라인 footer 제거
- [ ] `<Footer />` 컴포넌트 import 및 적용
- [ ] pt-32 → pt-[calc(var(--header-height)+2rem)] 조정

#### 1.2 tech/page.tsx 업데이트
- [ ] 기존 인라인 nav 제거
- [ ] `<Header />` 컴포넌트 import 및 적용
- [ ] 기존 인라인 footer 제거
- [ ] `<Footer />` 컴포넌트 import 및 적용
- [ ] pt-32 → pt-[calc(var(--header-height)+2rem)] 조정

---

## Phase 2: MagicUI 미사용 컴포넌트 적용

### 2.1 OrbitingCircles - 디바이스 네트워크 시각화

**위치**: Hero 섹션 또는 Statistics 섹션

**구현**:
```
Central Server (중앙)
└── 5 Titan Nodes (내부 궤도)
    └── 600 Devices 표시 (외부 궤도, 숫자로)
```

**파일**:
- [ ] `components/ui/orbiting-circles.tsx` 복사
- [ ] `globals.css`에 `animate-orbit` 키프레임 추가
- [ ] Hero 또는 새 섹션에 OrbitingCircles 통합

### 2.2 FeatureSelector - Tech 페이지 인터랙티브 스택

**위치**: tech/page.tsx - 기술 스택 섹션

**구현**:
- Central Server / Mobile Agent / Hardware 카테고리를 탭 형태로 전환
- 선택 시 해당 카테고리 상세 표시 (코드 예시 대신 설명 표시)

**파일**:
- [ ] `components/feature-selector.tsx` 복사 (DoAi.Me용 수정)
- [ ] tech/page.tsx의 기술 스택 섹션 교체

### 2.3 Testimonials 섹션 준비

**위치**: 메인 페이지 CTA 전 또는 별도 페이지

**용도**: 향후 투자자/파트너 피드백 표시용

**구현**:
- [ ] `lib/config.tsx`에 testimonials 빈 배열 추가
- [ ] `components/sections/testimonials.tsx` 생성 (조건부 렌더링)
- [ ] 데이터가 있을 때만 표시되도록 설정

---

## Phase 3: 접근성 개선

### 3.1 키보드 네비게이션
- [ ] 모든 인터랙티브 요소에 `tabIndex` 확인
- [ ] 모바일 드로어에 focus trap 적용
- [ ] Skip to content 링크 추가 (layout.tsx)

### 3.2 Focus 스타일
- [ ] `globals.css`에 커스텀 focus-visible 스타일 추가
- [ ] 버튼, 링크, 인풋에 일관된 focus ring 적용
```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### 3.3 ARIA 레이블
- [ ] Header 네비게이션에 `aria-label="Main navigation"` 추가
- [ ] Mobile drawer에 `aria-label`, `aria-expanded` 추가
- [ ] 아이콘 버튼에 `aria-label` 추가 (ThemeToggle 등)

### 3.4 색상 대비
- [ ] Primary yellow (#f2cb05)가 흰색 배경에서 AA 기준 미달 가능
- [ ] 텍스트용 primary는 더 어두운 shade 사용 고려
- [ ] `--primary-foreground` 검토 (현재 검정, 적절함)

---

## Phase 4: UX 개선

### 4.1 로딩 상태
- [ ] 페이지 전환 시 로딩 인디케이터 (NProgress 또는 커스텀)
- [ ] Dashboard 링크 클릭 시 시각적 피드백

### 4.2 스크롤 경험
- [ ] Smooth scroll behavior 확인
- [ ] 섹션 앵커 링크 (#features, #philosophy) 동작 확인

### 4.3 반응형 개선
- [ ] 모바일에서 BorderText 크기 조정 확인
- [ ] FlickeringGrid 모바일 성능 테스트

---

## Implementation Priority

1. **High**: Phase 1 (서브페이지 통일) - 기본 일관성
2. **High**: Phase 3.1-3.3 (접근성) - 기본 웹 접근성
3. **Medium**: Phase 2.1 (OrbitingCircles) - 시각적 임팩트
4. **Medium**: Phase 2.2 (FeatureSelector) - Tech 페이지 개선
5. **Low**: Phase 2.3 (Testimonials) - 향후 콘텐츠용
6. **Low**: Phase 4 (UX 개선) - 폴리싱

---

## Estimated Tasks

| Phase | Task Count | Priority |
|-------|-----------|----------|
| 1.1 | 5 | High |
| 1.2 | 5 | High |
| 2.1 | 3 | Medium |
| 2.2 | 2 | Medium |
| 2.3 | 3 | Low |
| 3.x | 8 | High |
| 4.x | 5 | Low |
| **Total** | **31** | - |

---

## Files to Create/Modify

### New Files
- `components/ui/orbiting-circles.tsx`
- `components/feature-selector.tsx` (modified for DoAi.Me)
- `components/sections/testimonials.tsx`

### Modified Files
- `app/why-not-bot/page.tsx`
- `app/tech/page.tsx`
- `app/globals.css` (orbit keyframe, focus styles)
- `app/layout.tsx` (skip link)
- `lib/config.tsx` (testimonials data)
- `components/sections/header.tsx` (ARIA)
- `components/mobile-drawer.tsx` (ARIA, focus trap)
- `components/theme-toggle.tsx` (ARIA)

---

## Success Criteria

1. 모든 페이지에서 동일한 Header/Footer 사용
2. 키보드만으로 모든 기능 접근 가능
3. OrbitingCircles로 디바이스 네트워크 시각화
4. FeatureSelector로 Tech 스택 인터랙티브 표시
5. WCAG 2.1 AA 기본 준수 (색상 대비, focus 표시)

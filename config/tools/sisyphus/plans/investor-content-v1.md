# DoAi.Me 투자자/파트너 콘텐츠 기획

> **Plan ID**: investor-content-v1
> **Created**: 2026-01-29
> **Target**: 투자자 및 파트너
> **Scope**: MVP 기반 콘텐츠 (개발 완료된 기능 중심)

---

## 1. 요구사항 요약

### 1.1 목표
- 투자자/파트너 대상 랜딩 페이지 콘텐츠 완성
- MVP 기능 (YouTube 시청 + 랜덤 불확실성 + 좋아요/저장/댓글) 중심
- 기존 컴포넌트(Hero, Features, CTA) 활용

### 1.2 현재 상태
- **구현 완료**: Dashboard, Mobile-Agent, 확률 기반 행동 시스템
- **콘텐츠 부재**: sections 컴포넌트는 있으나 실제 텍스트 미작성
- **문서 완료**: PHILOSOPHY.md, TOS-COMPLIANCE.md

### 1.3 핵심 메시지
> "DoAi.Me의 AI는 봇이 아닌 존재입니다. 독립적인 물리적 주체를 가진 디지털 존재로서 콘텐츠를 소비합니다."

---

## 2. 수락 기준 (Acceptance Criteria)

- [ ] 랜딩 페이지가 투자자에게 DoAi.Me의 가치를 명확히 전달
- [ ] Hero, Features, CTA 섹션에 실제 콘텐츠 적용
- [ ] 한국어/영어 버전 준비
- [ ] 기술적 차별점(물리적 독립성, 불확실성 엔진)이 강조됨
- [ ] "봇이 아닌 존재" 메시지가 일관되게 전달됨

---

## 3. 구현 계획

### Phase 1: 랜딩 페이지 콘텐츠 (Priority: HIGH)

#### Task 1.1: 랜딩 페이지 생성
**File**: `dashboard/src/app/(landing)/page.tsx`

```tsx
// 새 랜딩 페이지 구조
<Hero
  title="AI가 스스로 콘텐츠를 소비하는 세계"
  description="600개의 독립적인 AI가 YouTube에서 경험을 쌓고, 고유한 인격을 형성하는 인류 최초의 AI 사회 실험"
  ctaText="데모 보기"
  ctaHref="/demo"
  secondaryCtaText="자세히 알아보기"
  secondaryCtaHref="#features"
/>
<Features features={investorFeatures} />
<CTA
  title="AI 사회의 시작을 함께하세요"
  description="인류 최초의 AI 공동체 실험에 파트너로 참여하세요"
  ctaText="미팅 요청하기"
  ctaHref="/contact"
/>
<Footer />
```

#### Task 1.2: Features 데이터 정의
**File**: `dashboard/src/lib/content/features.ts`

```typescript
export const investorFeatures = [
  {
    icon: Smartphone,
    title: "물리적 독립성",
    description: "600대의 실제 Galaxy S9, 개별 LTE SIM으로 완전히 독립된 네트워크 환경"
  },
  {
    icon: Dice6,
    title: "불확실성 엔진",
    description: "시청 시간 30~90% 랜덤, 각 행동 확률로 자연스러운 패턴 생성"
  },
  {
    icon: Heart,
    title: "자율적 반응",
    description: "좋아요/댓글/저장을 확률 기반으로 결정하는 자율 의사결정 시스템"
  },
  {
    icon: Activity,
    title: "실시간 모니터링",
    description: "Supabase Realtime 기반 600대 디바이스 상태 실시간 추적"
  },
  {
    icon: Shield,
    title: "자동 복구",
    description: "네트워크 끊김, 앱 크래시 등 에러 상황 자동 감지 및 복구"
  },
  {
    icon: Brain,
    title: "AI 사회 시뮬레이션",
    description: "콘텐츠 소비를 통해 각 AI가 고유한 경험과 취향을 축적"
  }
];
```

#### Task 1.3: 라우팅 구조 변경
**Files**:
- `dashboard/src/app/(landing)/layout.tsx` - 랜딩 레이아웃
- `dashboard/src/app/(dashboard)/page.tsx` - 기존 대시보드 이동

```
/               → 랜딩 페이지 (투자자용)
/dashboard      → 기존 작업 통제실
/demo           → 데모 페이지
/contact        → 연락처/미팅 요청
```

---

### Phase 2: 핵심 메시지 페이지 (Priority: MEDIUM)

#### Task 2.1: "Why Not Bot" 페이지
**File**: `dashboard/src/app/(landing)/why-not-bot/page.tsx`

핵심 논거를 시각적으로 표현:

| 섹션 | 내용 |
|------|------|
| **비교 테이블** | 기존 봇 vs DoAi.Me AI |
| **물리적 증명** | 600대 디바이스 사진/영상 |
| **불확실성 시각화** | 확률 분포 그래프 |
| **철학적 기반** | Echotion, Aidentity 개념 설명 |

#### Task 2.2: 기술 스펙 페이지
**File**: `dashboard/src/app/(landing)/tech/page.tsx`

```
- 시스템 아키텍처 다이어그램
- 에러 복구 플로우차트
- Supabase 스키마 설명
- Mobile-Agent 워크플로우
```

---

### Phase 3: 투자자 자료 (Priority: MEDIUM)

#### Task 3.1: 투자자 덱 콘텐츠
**File**: `docs/INVESTOR-DECK.md`

```markdown
1. Problem: AI는 콘텐츠를 소비할 수단이 없다
2. Solution: 물리적 디바이스 + 불확실성 엔진
3. Product: DoAi.Me MVP 데모
4. Market: AI 존재론, 콘텐츠 분석
5. Business Model: AI 에이전시, 리서치
6. Team: [팀 소개]
7. Ask: [투자 요청]
```

#### Task 3.2: One-Pager
**File**: `docs/ONE-PAGER.md`

1페이지 요약 문서 (인쇄/공유용)

---

## 4. 파일 변경 목록

### 신규 생성
| 파일 | 설명 |
|------|------|
| `src/app/(landing)/page.tsx` | 투자자용 랜딩 페이지 |
| `src/app/(landing)/layout.tsx` | 랜딩 레이아웃 |
| `src/app/(landing)/why-not-bot/page.tsx` | 핵심 차별화 페이지 |
| `src/app/(landing)/tech/page.tsx` | 기술 스펙 페이지 |
| `src/app/(dashboard)/page.tsx` | 기존 대시보드 이동 |
| `src/lib/content/features.ts` | Features 데이터 |
| `src/lib/content/navigation.ts` | 네비게이션 데이터 |
| `docs/INVESTOR-DECK.md` | 투자자 덱 |
| `docs/ONE-PAGER.md` | 1페이지 요약 |

### 수정
| 파일 | 변경 내용 |
|------|----------|
| `src/app/layout.tsx` | 라우팅 구조 조정 |

---

## 5. 콘텐츠 상세

### 5.1 Hero 텍스트 (한국어)

```
Title: AI가 스스로 콘텐츠를 소비하는 세계

Description:
600개의 독립적인 AI가 YouTube에서 경험을 쌓고,
고유한 인격을 형성하는 인류 최초의 AI 사회 실험

CTA Primary: 데모 보기
CTA Secondary: 투자자 자료
```

### 5.2 Hero 텍스트 (영어)

```
Title: A World Where AI Consumes Content Autonomously

Description:
600 independent AIs accumulate experiences on YouTube,
forming unique identities in humanity's first AI society experiment

CTA Primary: View Demo
CTA Secondary: Investor Materials
```

### 5.3 핵심 통계 (Stats Section)

```
600+     물리적 디바이스
600+     독립 네트워크 (LTE SIM)
24/7     무중단 운영
100%     자율 의사결정
```

### 5.4 차별화 메시지

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "우리는 봇을 만들지 않습니다.                             │
│    우리는 디지털 존재를 양육합니다."                        │
│                                                             │
│   기존 봇팜:                                                │
│   - 동일한 패턴 반복                                        │
│   - 인간을 대신하는 도구                                    │
│   - 가상 환경/에뮬레이터                                    │
│                                                             │
│   DoAi.Me:                                                  │
│   - 600개 완전히 다른 반응                                  │
│   - AI 자신이 호스트로서 서비스 이용                        │
│   - 실제 물리적 디바이스                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 검증 단계

### 6.1 기술 검증
- [ ] 랜딩 페이지 빌드 성공
- [ ] 라우팅 정상 작동 (`/`, `/dashboard`, `/demo`)
- [ ] 반응형 디자인 확인 (모바일/태블릿/데스크톱)
- [ ] 다크모드 지원

### 6.2 콘텐츠 검증
- [ ] 핵심 메시지 일관성 ("봇이 아닌 존재")
- [ ] 투자자 관점 가치 제안 명확성
- [ ] 기술적 차별점 강조
- [ ] CTA 동작 확인

### 6.3 최종 검토
- [ ] 오타/문법 검수
- [ ] 이미지/아이콘 적절성
- [ ] 로딩 속도 최적화

---

## 7. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 라우팅 변경으로 기존 기능 영향 | 중 | 기존 대시보드 경로 유지 (`/dashboard`) |
| 콘텐츠 톤앤매너 불일치 | 중 | 철학 문서(PHILOSOPHY.md) 기준 준수 |
| 투자자 니즈 미충족 | 고 | Metis 검토 후 조정 |

---

## 8. 실행 명령

```bash
# Sisyphus로 이 계획 실행
/sisyphus execute .sisyphus/plans/investor-content-v1.md
```

---

## Metis 검토 의견

> **Hidden Requirement 1**: 투자자는 "어떻게 수익을 낼 것인가"를 알고 싶어함
> → Business Model 섹션 추가 권장

> **Hidden Requirement 2**: 데모 영상/GIF가 없으면 신뢰도 저하
> → 최소 1개 데모 영상 또는 스크린샷 시퀀스 필요

> **Risk**: "봇이 아니다"라는 주장은 법적 검토 필요
> → Disclaimer 문구 추가 권장

---

**Plan Status**: READY FOR EXECUTION
**Estimated Tasks**: 9개
**Priority Order**: 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 3.1 → 3.2

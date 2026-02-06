# DOAI.ME UI 컴포넌트 & Storybook 규칙

> **이 문서는 Frontend 에이전트가 참조해야 하는 UI/디자인 시스템 규칙입니다.**
> **스토리북 업데이트, 컴포넌트 생성/수정 시 이 규칙을 따르세요.**

---

## 1. 디자인 시스템 정체성

| 항목 | 값 |
|------|-----|
| **스타일** | RetroUI / NeoBrutalist |
| **참조** | https://www.retroui.dev/docs |
| **핵심 특징** | 두꺼운 테두리 (`border-2 border-black`), 하드 그림자 (`shadow-md`, `shadow-[4px_4px_0px_0px]`), 호버 시 이동 효과 (`hover:translate-y-1`) |
| **컬러 시스템** | OKLCH CSS 변수 (Yellow Theme, Primary: `#f2cb05`) |
| **아이콘** | `lucide-react` |
| **CSS 프레임워크** | Tailwind CSS 4 |

### 1.1 NeoBrutalist 핵심 스타일 토큰

```
테두리:    border-2 border-black (또는 border-foreground)
그림자:    shadow-md  또는  shadow-[4px_4px_0px_0px] shadow-foreground
호버:      hover:translate-y-1 hover:shadow-none (또는 hover:translate-x-[2px] hover:translate-y-[2px])
액티브:    active:translate-y-2 active:translate-x-1 active:shadow-none
라운딩:    rounded (기본, 과도한 라운딩 금지)
폰트:      font-bold, font-semibold (강조), font-medium (기본)
```

### 1.2 CSS 변수 (OKLCH)

테마 색상은 `packages/ui/styles/globals.css`에 정의. 컴포넌트에서 직접 hex/rgb 사용 금지.

```
사용:    bg-primary, text-primary-foreground, bg-card, border-foreground 등
금지:    bg-[#f2cb05], text-[#333] 등 하드코딩 색상
예외:    상태 색상 (bg-green-500, bg-red-500 등 Tailwind 기본 팔레트)은 허용
```

---

## 2. 컴포넌트 구조 규칙

### 2.1 파일 구조

```
packages/ui/src/components/
└── {component-name}/            # kebab-case 폴더
    ├── {component-name}.tsx     # 컴포넌트 구현
    └── {component-name}.stories.tsx  # Storybook 스토리
```

- 모든 컴포넌트는 **자체 폴더** 안에 위치
- 폴더명과 파일명은 **kebab-case** (예: `stats-card/stats-card.tsx`)
- 단독 파일 (`DeviceCard.tsx` 등) 금지 — 반드시 폴더 구조 사용

### 2.2 컴포넌트 작성 템플릿

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI 스타일 {ComponentName} variants
 * {한국어 설명}
 */
const {componentName}Variants = cva(
  "기본 클래스",
  {
    variants: {
      variant: { /* ... */ },
      size: { /* ... */ },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface {ComponentName}Props
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof {componentName}Variants> {
  // 추가 props (JSDoc 한국어 주석 필수)
}

/**
 * {ComponentName} - RetroUI/NeoBrutalist 스타일 {한국어 설명}
 */
const {ComponentName} = React.forwardRef<HTMLDivElement, {ComponentName}Props>(
  ({ className, variant, size, ...props }, ref) => (
    <div
      ref={ref}
      className={cn({componentName}Variants({ variant, size }), className)}
      {...props}
    />
  )
);
{ComponentName}.displayName = "{ComponentName}";

export { {ComponentName}, {componentName}Variants };
```

### 2.3 필수 패턴

| 항목 | 규칙 |
|------|------|
| **Variants** | `class-variance-authority` (`cva`) 사용 |
| **className 병합** | `cn()` 유틸리티 (`@packages/ui/lib/utils`) |
| **ref 전달** | `React.forwardRef` 사용 |
| **displayName** | 반드시 설정 |
| **export** | Named export (default export 금지) |
| **주석 언어** | 한국어 |
| **변수/함수명** | 영어 camelCase |
| **타입** | `interface` 사용 (Props 접미사: `ButtonProps`, `CardProps`) |
| **import 경로** | `@packages/ui/lib/utils` (상대 경로 금지) |

### 2.4 export 등록

새 컴포넌트 생성 시 `packages/ui/src/index.ts`에 반드시 export 추가:

```ts
export * from "./components/{component-name}/{component-name}";
```

---

## 3. Storybook 규칙

### 3.1 Story 작성 템플릿

> **이 템플릿을 그대로 따르면 질문 없이 바로 스토리를 생성할 수 있습니다.**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { {ComponentName} } from "./{component-name}";

const meta: Meta<typeof {ComponentName}> = {
  title: "Components/{ComponentName}",
  component: {ComponentName},
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "{한국어 컴포넌트 설명}",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: [/* variant 키 나열 */],
    },
    size: {
      control: "select",
      options: [/* size 키 나열 */],
    },
  },
};

export default meta;
type Story = StoryObj<typeof {ComponentName}>;

// 1. 기본 스토리 (args 사용)
export const Default: Story = {
  args: { /* 최소 props */ },
};

// 2. 모든 variant 나열
export const AllVariants: Story = {
  render: () => ( /* 모든 variant를 flex/grid로 나열 */ ),
};

// 3. 모든 size 나열 (size variant가 있을 경우)
export const AllSizes: Story = {
  render: () => ( /* 모든 size를 flex/grid로 나열 */ ),
};

// 4. 실제 사용 예시 (Device Farm 맥락)
export const UsageExample: Story = {
  render: () => ( /* Device Farm 대시보드에서의 실사용 예시 */ ),
};
```

### 3.2 필수 스토리 목록

새 컴포넌트의 스토리 파일에는 **아래 스토리를 자동 생성**합니다. 질문하지 않습니다.

| 스토리 이름 | 용도 | 필수 |
|------------|------|------|
| `Default` | 기본 상태, `args` 사용 | **필수** |
| `AllVariants` | 모든 variant를 한 화면에 나열 | **필수** (variant가 있을 때) |
| `AllSizes` | 모든 size를 한 화면에 나열 | variant `size`가 있을 때 |
| `UsageExample` | Device Farm 맥락의 실사용 예시 | 권장 |
| 기타 | 컴포넌트 특성에 따른 추가 스토리 | 선택 |

### 3.3 Storybook 설정

| 항목 | 값 |
|------|-----|
| **프레임워크** | `@storybook/react-vite` (8.6.0) |
| **stories 패턴** | `../src/**/*.stories.@(js\|jsx\|ts\|tsx)` |
| **autodocs** | `tags: ["autodocs"]` 설정으로 자동 문서화 |
| **layout** | `"centered"` (기본) |
| **경로 alias** | `@packages/ui` → UI 패키지 루트 |

### 3.4 스토리 작성 시 행동 규칙

```
에이전트는 스토리 업데이트/생성 시:
1. 질문하지 않는다 — 이 규칙의 템플릿을 그대로 적용
2. 컴포넌트의 variant/size를 코드에서 읽고 자동으로 스토리에 반영
3. 한국어 description을 자동 작성
4. Device Farm 맥락의 예시를 자동 생성
5. 컴포넌트 내 argTypes는 variant/size가 있을 경우 자동 생성
```

---

## 4. 컴포넌트 카테고리

### 4.1 Base 컴포넌트 (Radix UI 래퍼)

Radix UI 프리미티브를 NeoBrutalist 스타일로 래핑한 컴포넌트:

```
accordion, alert, avatar, badge, button, card, checkbox,
dialog, dropdown-menu, input, label, progress, radio-group,
select, skeleton, slider, switch, tabs, textarea, tooltip
```

- Radix UI 프리미티브의 API를 그대로 노출
- 스타일만 NeoBrutalist로 오버라이드
- `"use client"` 지시어는 클라이언트 인터랙션이 필요한 경우에만

### 4.2 Domain 컴포넌트 (Device Farm 전용)

비즈니스 로직이 포함된 컴포넌트:

```
stats-card     — 대시보드 통계 카드
status-card    — Job 진행 상태 카드
status-indicator — 디바이스 상태 점
page-header    — 페이지 헤더
```

- `@doai/shared`에서 타입 import 가능
- Device Farm 도메인 용어 사용 (디바이스, 노드, 워크플로우 등)

---

## 5. 스타일링 규칙

### 5.1 Tailwind 사용 규칙

| 규칙 | 설명 |
|------|------|
| **CSS 변수 우선** | `bg-primary`, `text-foreground` 등 시맨틱 토큰 사용 |
| **임의값 최소화** | `w-[350px]` 보다 `max-w-md` 등 유틸리티 클래스 우선 |
| **다크 모드** | CSS 변수가 자동 처리. `.dark` 접두사 직접 사용은 상태 색상에만 허용 |
| **반응형** | 모바일 퍼스트. `sm:`, `md:`, `lg:` 브레이크포인트 사용 |

### 5.2 애니메이션

```
허용:   transition-all duration-200, animate-pulse, animate-spin
금지:   복잡한 keyframe 애니메이션 (성능 고려, accordion 제외)
호버:   translate + shadow 조합 (NeoBrutalist 표준)
```

---

## 6. import 규칙

### 6.1 UI 패키지 내부

```ts
// 같은 패키지 내 컴포넌트 참조 (상대 경로)
import { Button } from "../button/button";

// 유틸리티 (alias 경로)
import { cn } from "@packages/ui/lib/utils";
```

### 6.2 Dashboard에서 UI 패키지 사용

```ts
// 배럴 import (권장)
import { Button, Card, Badge } from "@packages/ui";

// 직접 import (필요 시)
import { Button } from "@packages/ui/components/button/button";
```

### 6.3 금지 import

```ts
// ❌ 상대 경로로 utils import
import { cn } from "../../lib/utils";

// ❌ Storybook에서 실제 API 호출
import { supabase } from "@/lib/supabase";

// ❌ Dashboard 컴포넌트를 UI 패키지에서 import
import { StatusBoard } from "@/components/StatusBoard";
```

---

## 7. 금지 패턴

### 7.1 컴포넌트

```
❌  default export (Named export만 사용)
❌  forwardRef 없이 DOM 요소 래핑
❌  displayName 누락
❌  CSS-in-JS (styled-components, emotion 등)
❌  인라인 스타일 (style 속성)
❌  cva 없이 조건부 className 직접 작성 (3개 이상 variant 시)
❌  컴포넌트 파일에 비즈니스 로직 (fetch, state management 등)
❌  any 타입 사용
```

### 7.2 Storybook

```
❌  스토리 작성 전 사용자에게 질문 (이 규칙을 따름)
❌  실제 API/Supabase 호출 (Mock 데이터 사용)
❌  autodocs 태그 누락
❌  한국어 description 누락
❌  argTypes에 variant/size 미등록 (해당 props가 있을 경우)
❌  Default 스토리 누락
❌  AllVariants 스토리 누락 (variant가 있을 때)
```

---

## 8. 체크리스트

### 새 컴포넌트 생성 시

- [ ] `{name}/{name}.tsx` 폴더 구조 준수
- [ ] `cva` + `cn` + `React.forwardRef` 패턴 적용
- [ ] `displayName` 설정
- [ ] NeoBrutalist 스타일 적용 (border-2, shadow, hover translate)
- [ ] `{name}.stories.tsx` 작성 (Default + AllVariants 필수)
- [ ] `packages/ui/src/index.ts`에 export 추가
- [ ] 한국어 JSDoc 주석

### 기존 컴포넌트 스토리 업데이트 시

- [ ] 위 3.1 템플릿 형식 준수
- [ ] 컴포넌트의 모든 variant를 스토리에 반영
- [ ] 사용자에게 질문하지 않고 바로 적용

---

## 9. 참조 경로

| 항목 | 경로 |
|------|------|
| UI 컴포넌트 | `packages/ui/src/components/` |
| 스토리북 설정 | `packages/ui/.storybook/` |
| 글로벌 CSS | `packages/ui/styles/globals.css` |
| 유틸리티 | `packages/ui/lib/utils.ts` |
| 컴포넌트 export | `packages/ui/src/index.ts` |
| 공유 타입 | `packages/shared/src/` |

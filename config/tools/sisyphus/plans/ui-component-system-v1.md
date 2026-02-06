# DoAi.Me UI Component System - Implementation Plan

**Plan ID:** ui-component-system-v1
**Created:** 2026-01-29
**Status:** Ready for Execution
**Estimated Scope:** 35+ components, theme system, layout overhaul

---

## Executive Summary

MagicUI와 MakerKit 템플릿을 기반으로 DoAi.Me 대시보드의 통합 UI 컴포넌트 시스템을 구축합니다.

**핵심 목표:**
- CSS 변수 기반 테마 시스템 구축 (다크모드 지원)
- MakerKit 레이아웃 + MagicUI 인터랙션 하이브리드 구조
- 35+ 재사용 가능한 컴포넌트 라이브러리
- 디자인 일관성을 위한 토큰 시스템

---

## Requirements Summary

| 항목 | 선택 |
|------|------|
| 디자인 방향 | 하이브리드 (MakerKit 레이아웃 + MagicUI 인터랙션) |
| 테마 시스템 | CSS 변수 기반 |
| TypeScript | 기본 타입 유지 |
| 애니메이션 | Framer Motion 추가 |
| 번들 사이즈 | 제약 없음 |

**필요 컴포넌트 (전체):**
- 데이터 표시: DataTable, Chart, StatCard, Timeline
- 입력/폼: MultiSelect, DateRangePicker, SearchInput, FileUpload
- 피드백: Toast, Modal, ConfirmDialog, EmptyState
- 레이아웃: Sidebar, Tabs, Accordion, CommandPalette

---

## Acceptance Criteria

### Phase 1: Foundation
- [ ] CSS 변수 기반 테마 시스템 적용 (`globals.css`)
- [ ] 다크모드 토글 동작 확인
- [ ] Framer Motion 설치 및 설정
- [ ] 컴포넌트 디렉토리 구조 생성

### Phase 2: Layout Components
- [ ] AppSidebar 컴포넌트 작동 (collapsible)
- [ ] AppLayout 컴포넌트로 전체 레이아웃 래핑
- [ ] Tabs 컴포넌트 스타일링 완료
- [ ] Accordion 컴포넌트 애니메이션 동작

### Phase 3: Data Display
- [ ] DataTable 정렬/페이지네이션 동작
- [ ] StatCard 트렌드 표시 기능
- [ ] Chart 컴포넌트 (Area, Bar, Line) 렌더링
- [ ] Timeline 컴포넌트 렌더링

### Phase 4: Form Components
- [ ] MultiSelect 다중 선택 동작
- [ ] DateRangePicker 날짜 범위 선택
- [ ] SearchInput 자동완성 동작
- [ ] FileUpload 드래그앤드롭 동작

### Phase 5: Feedback Components
- [ ] Toast 알림 표시/자동 해제
- [ ] Modal 열기/닫기 애니메이션
- [ ] ConfirmDialog 확인/취소 콜백
- [ ] EmptyState 다양한 상태 표시

### Phase 6: Animation & Polish
- [ ] BlurFade 스크롤 애니메이션 동작
- [ ] BorderBeam 하이라이트 효과
- [ ] CommandPalette (Cmd+K) 동작
- [ ] 전체 UI 일관성 검토

---

## Implementation Steps

### Step 1: 의존성 설치 및 설정
**Files:** `dashboard/package.json`, `dashboard/tailwind.config.ts`

```bash
cd dashboard
npm install framer-motion @tanstack/react-table recharts date-fns cmdk sonner
npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-accordion
npm install @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-toast
```

**tailwind.config.ts 수정:**
- CSS 변수를 colors에 매핑
- 애니메이션 keyframes 추가
- Container 설정

---

### Step 2: 테마 시스템 구축
**File:** `dashboard/src/app/globals.css`

```css
:root {
  /* Background & Foreground */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;

  /* Primary Colors */
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;

  /* Secondary Colors */
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;

  /* Accent & Muted */
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;

  /* Destructive */
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;

  /* Border & Input */
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;

  /* Chart Colors */
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;
  --chart-5: 27 87% 67%;

  /* Sidebar */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 240 5.3% 26.1%;
  --sidebar-primary: 240 5.9% 10%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border: 220 13% 91%;

  /* Radius */
  --radius: 0.5rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  /* ... 다크모드 색상 */
}
```

---

### Step 3: 디렉토리 구조 생성
**Structure:**

```
dashboard/src/components/
├── ui/                     # 기본 UI 프리미티브 (기존)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── slider.tsx
│   ├── badge.tsx
│   ├── select.tsx
│   └── ... (새로 추가)
│
├── layout/                 # 레이아웃 컴포넌트
│   ├── app-sidebar.tsx
│   ├── app-layout.tsx
│   ├── sidebar-nav.tsx
│   └── header.tsx
│
├── data-display/           # 데이터 표시 컴포넌트
│   ├── data-table.tsx
│   ├── stat-card.tsx
│   ├── chart-area.tsx
│   ├── chart-bar.tsx
│   ├── timeline.tsx
│   └── empty-state.tsx
│
├── form/                   # 폼 컴포넌트
│   ├── multi-select.tsx
│   ├── date-range-picker.tsx
│   ├── search-input.tsx
│   └── file-upload.tsx
│
├── feedback/               # 피드백 컴포넌트
│   ├── toast.tsx
│   ├── modal.tsx
│   ├── confirm-dialog.tsx
│   └── loading-spinner.tsx
│
├── animation/              # MagicUI 애니메이션 컴포넌트
│   ├── blur-fade.tsx
│   ├── border-beam.tsx
│   ├── marquee.tsx
│   └── particles.tsx
│
└── composite/              # 복합 컴포넌트 (비즈니스 로직 포함)
    ├── JobPostingForm.tsx  # 기존 이동
    ├── StatusBoard.tsx     # 기존 이동
    └── command-palette.tsx
```

---

### Step 4: 핵심 UI 컴포넌트 구현

#### 4.1 Sidebar 컴포넌트
**File:** `dashboard/src/components/layout/app-sidebar.tsx`

**Source:** MakerKit `home-sidebar.tsx` 패턴 차용

**Features:**
- Collapsible (아이콘 모드)
- 네비게이션 아이템
- 프로필 드롭다운

```typescript
interface AppSidebarProps {
  defaultCollapsed?: boolean;
  navigation: NavigationItem[];
}

interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}
```

#### 4.2 DataTable 컴포넌트
**File:** `dashboard/src/components/data-display/data-table.tsx`

**Source:** MakerKit `data-table.tsx`

**Features:**
- TanStack Table 기반
- 서버사이드 페이지네이션
- 정렬, 필터링
- 행 선택

```typescript
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  onPaginationChange?: (pagination: PaginationState) => void;
  onSortingChange?: (sorting: SortingState) => void;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
}
```

#### 4.3 StatCard 컴포넌트
**File:** `dashboard/src/components/data-display/stat-card.tsx`

**Source:** MakerKit `DashboardDemoCharts` 패턴

**Features:**
- 값, 트렌드, 설명
- 아이콘 지원
- 트렌드 색상 (up: green, down: red, stale: gray)

```typescript
interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: 'up' | 'down' | 'stale';
  trendValue?: string;
  icon?: LucideIcon;
}
```

#### 4.4 Chart 컴포넌트들
**Files:**
- `dashboard/src/components/data-display/chart-area.tsx`
- `dashboard/src/components/data-display/chart-bar.tsx`
- `dashboard/src/components/data-display/chart-line.tsx`

**Source:** Recharts + MakerKit 패턴

**Features:**
- 반응형
- 커스텀 툴팁
- 테마 색상 연동

```typescript
interface ChartProps {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
}
```

---

### Step 5: 폼 컴포넌트 구현

#### 5.1 MultiSelect
**File:** `dashboard/src/components/form/multi-select.tsx`

**Features:**
- 다중 선택
- 검색/필터
- 태그 스타일 선택 표시
- 커스텀 옵션 렌더링

```typescript
interface MultiSelectProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
}
```

#### 5.2 DateRangePicker
**File:** `dashboard/src/components/form/date-range-picker.tsx`

**Dependencies:** `date-fns`, `@radix-ui/react-popover`

**Features:**
- 시작/종료 날짜 선택
- 프리셋 (오늘, 이번 주, 이번 달, 지난 7일 등)
- 캘린더 UI

```typescript
interface DateRangePickerProps {
  value: { from: Date; to: Date } | undefined;
  onChange: (range: { from: Date; to: Date } | undefined) => void;
  presets?: { label: string; range: { from: Date; to: Date } }[];
}
```

#### 5.3 SearchInput
**File:** `dashboard/src/components/form/search-input.tsx`

**Features:**
- 디바운스 입력
- 자동완성 드롭다운
- 로딩 상태
- 키보드 네비게이션

```typescript
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  onSelect?: (value: string) => void;
  loading?: boolean;
  placeholder?: string;
  debounceMs?: number;
}
```

#### 5.4 FileUpload
**File:** `dashboard/src/components/form/file-upload.tsx`

**Features:**
- 드래그 앤 드롭
- 파일 타입 제한
- 크기 제한
- 미리보기 (이미지)
- 진행률 표시

```typescript
interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  onUpload: (files: File[]) => void;
  onError?: (error: string) => void;
}
```

---

### Step 6: 피드백 컴포넌트 구현

#### 6.1 Toast (Sonner 사용)
**File:** `dashboard/src/components/feedback/toast.tsx`

**Dependencies:** `sonner`

**Setup:** `app/layout.tsx`에 `<Toaster />` 추가

```typescript
// 사용법
import { toast } from 'sonner';

toast.success('작업이 생성되었습니다!');
toast.error('작업 생성에 실패했습니다.');
toast.loading('처리 중...');
```

#### 6.2 Modal
**File:** `dashboard/src/components/feedback/modal.tsx`

**Source:** Radix Dialog + Framer Motion

**Features:**
- 열기/닫기 애니메이션
- 배경 클릭으로 닫기
- ESC 키로 닫기
- 포커스 트랩

```typescript
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
```

#### 6.3 ConfirmDialog
**File:** `dashboard/src/components/feedback/confirm-dialog.tsx`

**Features:**
- 확인/취소 버튼
- 위험 액션 스타일 (destructive)
- 커스텀 버튼 텍스트

```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}
```

#### 6.4 EmptyState
**File:** `dashboard/src/components/data-display/empty-state.tsx`

**Features:**
- 아이콘
- 제목, 설명
- 액션 버튼

```typescript
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

---

### Step 7: 애니메이션 컴포넌트 구현

#### 7.1 BlurFade
**File:** `dashboard/src/components/animation/blur-fade.tsx`

**Source:** MagicUI Portfolio Template

**Features:**
- 스크롤 트리거
- 블러 + 페이드 + 이동 애니메이션
- 스태거 딜레이

```typescript
interface BlurFadeProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: string;
  inView?: boolean;
}
```

#### 7.2 BorderBeam
**File:** `dashboard/src/components/animation/border-beam.tsx`

**Source:** MagicUI Startup Template

**Features:**
- 그라데이션 빔 애니메이션
- 테두리 효과

```typescript
interface BorderBeamProps {
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}
```

#### 7.3 CommandPalette
**File:** `dashboard/src/components/composite/command-palette.tsx`

**Dependencies:** `cmdk`

**Features:**
- Cmd+K 단축키
- 검색
- 카테고리별 명령
- 키보드 네비게이션

```typescript
interface CommandPaletteProps {
  commands: CommandGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandGroup {
  heading: string;
  items: {
    label: string;
    icon?: LucideIcon;
    shortcut?: string;
    onSelect: () => void;
  }[];
}
```

---

### Step 8: 레이아웃 통합

#### 8.1 AppLayout 생성
**File:** `dashboard/src/components/layout/app-layout.tsx`

```typescript
interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Header />
        <div className="container py-6">
          {children}
        </div>
      </main>
      <CommandPalette />
      <Toaster />
    </SidebarProvider>
  );
}
```

#### 8.2 기존 페이지 마이그레이션
**File:** `dashboard/src/app/page.tsx`

- `AppLayout`으로 래핑
- `JobPostingForm`, `StatusBoard`를 새 구조에 맞게 조정
- 기존 `alert()` → `toast()` 교체

---

### Step 9: 기존 컴포넌트 개선

#### 9.1 JobPostingForm 개선
- `alert()` → `toast.success()` / `toast.error()` 교체
- 로딩 상태에 LoadingSpinner 사용
- BlurFade로 섹션 애니메이션 추가

#### 9.2 StatusBoard 개선
- StatCard 컴포넌트로 디바이스 카운트 표시
- EmptyState 컴포넌트로 빈 상태 표시
- 애니메이션 개선

---

## Risk Analysis

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|----------|
| Framer Motion 번들 사이즈 증가 | Medium | Tree-shaking 확인, 필요한 것만 import |
| 다크모드 색상 불일치 | Low | CSS 변수 체계적 관리, 테스트 |
| TanStack Table 학습 곡선 | Low | 문서화된 예제 제공 |
| 기존 컴포넌트 호환성 | Medium | 점진적 마이그레이션, 기존 컴포넌트 유지 |

---

## Verification Steps

### Phase 1 검증
```bash
cd dashboard
npm run dev
# 다크모드 토글 확인
# Framer Motion 동작 확인
```

### Phase 2-6 검증
- 각 컴포넌트 스토리북 또는 개별 테스트 페이지 생성
- Props 변경 시 렌더링 확인
- 접근성 (키보드 네비게이션, 포커스) 확인

### 최종 검증
```bash
npm run build
npm run start
# 프로덕션 빌드 정상 동작 확인
```

---

## Execution Order

1. **Step 1-2**: 의존성 설치 + 테마 시스템 (Foundation)
2. **Step 3**: 디렉토리 구조 생성
3. **Step 4.1**: AppSidebar (레이아웃 기반)
4. **Step 6.1**: Toast (가장 자주 사용)
5. **Step 4.2-4.4**: DataTable, StatCard, Charts
6. **Step 5**: Form 컴포넌트들
7. **Step 6.2-6.4**: Modal, ConfirmDialog, EmptyState
8. **Step 7**: Animation 컴포넌트들
9. **Step 8**: AppLayout 통합
10. **Step 9**: 기존 컴포넌트 개선

---

## Notes

- 각 컴포넌트는 독립적으로 테스트 가능해야 함
- CSS 변수 네이밍은 shadcn/ui 컨벤션 따름
- TypeScript 기본 타입만 사용 (복잡한 제네릭 지양)
- 컴포넌트 문서화는 JSDoc 주석으로 처리

---

**Plan Status:** Ready for execution with `/sisyphus`

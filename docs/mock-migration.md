# Mock 데이터 → 프로덕션 데이터 전환 가이드

## Mock 인벤토리

| 위치 | 내용 | 상태 |
|------|------|------|
| `running/page.tsx` L351-417 | `dummyNodes` (5개 하드코딩 노드) | **제거 완료** → `useNodesQuery()` + `<EmptyState>` |

다른 15개 대시보드 페이지는 모두 `/api/` 라우트 또는 `supabase.from()` 을 통해 실데이터를 사용 중이었음.

## 데이터 레이어 아키텍처

```
Page Component
  └── useXxxQuery() hook          (hooks/queries/*.ts)
        └── api.ts 함수            (lib/api.ts)
              └── fetch() / supabase.from()
```

### 파일 구조

```
apps/dashboard/src/
├── lib/
│   ├── api.ts              # API client 함수 (fetchDevices, fetchNodes, etc.)
│   ├── query-client.ts     # QueryClient 팩토리
│   └── supabase.ts         # Supabase 클라이언트 (기존)
├── hooks/
│   └── queries/
│       ├── index.ts         # Barrel export
│       ├── use-devices.ts   # useDevicesQuery, deviceKeys
│       ├── use-running.ts   # useRunningTasksQuery, useNodesQuery, useTodayStatsQuery
│       └── use-jobs.ts      # useActiveJobsQuery, useCompletedJobsQuery
├── components/
│   └── shared/
│       ├── page-loading.tsx # 공통 로딩 컴포넌트
│       ├── empty-state.tsx  # 공통 빈 상태 컴포넌트
│       └── error-state.tsx  # 공통 에러 상태 컴포넌트
```

## Query Key 규약

```typescript
// 패턴: xxxKeys.all → xxxKeys.list(filters) → xxxKeys.detail(id)

export const deviceKeys = {
  all: ['devices'] as const,
  list: (filters?) => [...deviceKeys.all, 'list', filters] as const,
  pcs: () => [...deviceKeys.all, 'pcs'] as const,
};

export const runningKeys = {
  all: ['running'] as const,
  tasks: (nodeFilter?) => [...runningKeys.all, 'tasks', nodeFilter] as const,
  nodes: () => [...runningKeys.all, 'nodes'] as const,
  todayStats: () => [...runningKeys.all, 'todayStats'] as const,
};

export const jobKeys = {
  all: ['jobs'] as const,
  active: () => [...jobKeys.all, 'active'] as const,
  completed: () => [...jobKeys.all, 'completed'] as const,
};
```

## 환경 변수

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |

## 마이그레이션 완료 페이지 (3개)

| 페이지 | 변경 사항 |
|--------|----------|
| `devices/page.tsx` | `useDevicesQuery()` — 5초 자동갱신, refetch() 버튼 |
| `running/page.tsx` | `useRunningTasksQuery()` + `useNodesQuery()` + `useTodayStatsQuery()` — dummyNodes 제거 |
| `jobs/page.tsx` | `useActiveJobsQuery()` + `useCompletedJobsQuery()` — Socket.IO 연동 유지 |

## 후속 작업 (미마이그레이션 페이지)

아래 페이지들은 아직 `useState + useEffect + fetch/supabase` 패턴을 사용 중:

1. `dashboard/page.tsx` (홈)
2. `dashboard/videos/page.tsx`
3. `dashboard/channels/page.tsx`
4. `dashboard/keywords/page.tsx`
5. `dashboard/watch/page.tsx`
6. `dashboard/queue/page.tsx`
7. `dashboard/schedules/page.tsx`
8. `dashboard/register/page.tsx`
9. `dashboard/onboarding/page.tsx`
10. `dashboard/workers/page.tsx`
11. `dashboard/nodes/page.tsx`
12. `dashboard/analytics/page.tsx`
13. `dashboard/reports/daily/page.tsx`
14. `dashboard/reports/history/page.tsx`
15. `dashboard/settings/page.tsx`

### 추가 개선 사항

- **Mutation 전환**: `sendCommand()`, `reboot()`, `stopTask()` 등을 `useMutation`으로 전환
- **Optimistic updates**: 작업 중지/삭제 시 즉시 UI 반영
- **전역 에러 바운더리**: React Query `onError` 핸들러 통합

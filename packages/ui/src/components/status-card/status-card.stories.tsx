import type { Meta, StoryObj } from "@storybook/react";
import { StatusCard } from "./status-card";
import type { JobProgress } from "@doai/shared";

/**
 * StatusCard 스토리
 * JobProgress 데이터를 기반으로 영상 시청 상태를 표시하는 카드
 * 
 * RULE_UI.md 기준 필수 스토리:
 * - Default (Idle)
 * - Loading (Skeleton)
 * - Success (Completed)
 * - Error (Failed)
 * - Edge Cases (LongText)
 */

// 기본 Mock 데이터 (packages/shared/src/types.ts 스키마 기반)
const mockProgressBase: JobProgress = {
  jobId: "job-001",
  phase: "watching",
  currentVideoTitle: "React 18 새 기능 총정리",
  watchDuration: 120,
  targetDuration: 300,
  actionsPerformed: [],
};

const meta = {
  title: "Components/StatusCard",
  component: StatusCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    progress: {
      description: "JobProgress 데이터",
    },
    loading: {
      control: "boolean",
      description: "로딩 상태 (스켈레톤 표시)",
    },
  },
} satisfies Meta<typeof StatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================
// 1. Default - 검색 중 (Searching)
// ============================================
export const Searching: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "searching",
      currentVideoTitle: undefined,
      watchDuration: 0,
    },
  },
};

// ============================================
// 2. 시청 중 (Watching) - 기본 상태
// ============================================
export const Watching: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "watching",
      watchDuration: 180,
      targetDuration: 300,
    },
  },
};

// ============================================
// 3. 상호작용 중 (Interacting)
// ============================================
export const Interacting: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "interacting",
      watchDuration: 300,
      targetDuration: 300,
      actionsPerformed: ["like"],
    },
  },
};

// ============================================
// 4. 피드 서핑 중 (Surfing)
// ============================================
export const Surfing: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "surfing",
      watchDuration: 300,
      targetDuration: 300,
      actionsPerformed: ["like", "comment"],
    },
  },
};

// ============================================
// 5. Success - 완료 (Completed)
// ============================================
export const Completed: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "completed",
      currentVideoTitle: "10분 만에 배우는 TypeScript",
      watchDuration: 600,
      targetDuration: 600,
      actionsPerformed: ["like", "comment", "subscribe"],
    },
  },
};

// ============================================
// 6. Error - 실패 (Failed)
// ============================================
export const Failed: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "failed",
      currentVideoTitle: undefined,
      watchDuration: 0,
      targetDuration: 300,
      actionsPerformed: [],
      errorMessage: "영상을 찾을 수 없습니다",
    },
  },
};

// ============================================
// 7. Loading - 스켈레톤 UI
// ============================================
export const Loading: Story = {
  args: {
    progress: mockProgressBase,
    loading: true,
  },
};

// ============================================
// 8. Edge Case - 긴 영상 제목
// ============================================
export const LongVideoTitle: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      currentVideoTitle:
        "[4K 60fps] 2024년 최신 React 19 + Next.js 15 + TypeScript 5.0 완벽 마스터 강좌 - 실전 프로젝트로 배우는 풀스택 개발 (Part 1/10)",
    },
  },
};

// ============================================
// 9. Edge Case - 모든 액션 수행
// ============================================
export const AllActionsPerformed: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      phase: "completed",
      watchDuration: 600,
      targetDuration: 600,
      actionsPerformed: ["like", "comment", "subscribe", "playlist"],
    },
  },
};

// ============================================
// 10. Edge Case - 0% 진행
// ============================================
export const ZeroProgress: Story = {
  args: {
    progress: {
      ...mockProgressBase,
      watchDuration: 0,
      targetDuration: 300,
    },
  },
};

// ============================================
// 11. 모든 Phase 한눈에 보기
// ============================================
export const AllPhases: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-search",
          phase: "searching",
          currentVideoTitle: undefined,
          watchDuration: 0,
        }}
      />
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-watch",
          phase: "watching",
          watchDuration: 150,
        }}
      />
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-interact",
          phase: "interacting",
          watchDuration: 300,
          actionsPerformed: ["like"],
        }}
      />
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-surf",
          phase: "surfing",
          watchDuration: 300,
          actionsPerformed: ["like", "comment"],
        }}
      />
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-done",
          phase: "completed",
          watchDuration: 300,
          actionsPerformed: ["like", "comment", "subscribe"],
        }}
      />
      <StatusCard
        progress={{
          ...mockProgressBase,
          jobId: "job-fail",
          phase: "failed",
          currentVideoTitle: undefined,
          watchDuration: 0,
          errorMessage: "네트워크 오류",
        }}
      />
    </div>
  ),
};

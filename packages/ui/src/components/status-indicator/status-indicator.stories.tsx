import type { Meta, StoryObj } from "@storybook/react";
import { StatusIndicator } from "./status-indicator";

/**
 * StatusIndicator 컴포넌트 스토리
 * Device Farm 디바이스 상태 표시
 */
const meta = {
  title: "Components/StatusIndicator",
  component: StatusIndicator,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["idle", "busy", "running", "offline", "error"],
      description: "디바이스 상태",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "인디케이터 크기",
    },
    glow: {
      control: "boolean",
      description: "Glow 효과 활성화",
    },
    pulse: {
      control: "boolean",
      description: "펄스 애니메이션",
    },
  },
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

// 기본 상태
export const Default: Story = {
  args: {
    status: "idle",
  },
};

// 상태별 스토리
export const Idle: Story = {
  args: {
    status: "idle",
  },
};

export const Busy: Story = {
  args: {
    status: "busy",
  },
};

export const Running: Story = {
  args: {
    status: "running",
  },
};

export const Offline: Story = {
  args: {
    status: "offline",
  },
};

export const Error: Story = {
  args: {
    status: "error",
  },
};

// Glow 효과
export const WithGlow: Story = {
  args: {
    status: "running",
    glow: true,
  },
};

// 펄스 애니메이션
export const WithPulse: Story = {
  args: {
    status: "error",
    pulse: true,
  },
};

// 크기별
export const SizeSmall: Story = {
  args: {
    status: "idle",
    size: "sm",
  },
};

export const SizeLarge: Story = {
  args: {
    status: "idle",
    size: "lg",
  },
};

// 모든 상태 한눈에 보기
export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Basic</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <StatusIndicator status="idle" />
            <span className="text-sm">Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="busy" />
            <span className="text-sm">Busy</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="running" />
            <span className="text-sm">Running</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="offline" />
            <span className="text-sm">Offline</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="error" />
            <span className="text-sm">Error</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">With Glow Effect</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <StatusIndicator status="idle" glow />
            <span className="text-sm">Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="running" glow />
            <span className="text-sm">Running</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="error" glow />
            <span className="text-sm">Error</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Sizes</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <StatusIndicator status="idle" size="sm" />
            <span className="text-sm">Small</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="idle" size="md" />
            <span className="text-sm">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIndicator status="idle" size="lg" />
            <span className="text-sm">Large</span>
          </div>
        </div>
      </div>
    </div>
  ),
};

// 디바이스 목록 예시
export const DeviceList: Story = {
  render: () => (
    <div className="w-[300px] space-y-2 rounded-lg border p-4">
      <h3 className="font-medium">Connected Devices</h3>
      <div className="space-y-3">
        {[
          { name: "Galaxy S23", status: "idle" as const },
          { name: "Pixel 8 Pro", status: "running" as const },
          { name: "iPhone 15", status: "busy" as const },
          { name: "Galaxy A54", status: "error" as const },
          { name: "Redmi Note 12", status: "offline" as const },
        ].map((device) => (
          <div key={device.name} className="flex items-center justify-between">
            <span className="text-sm">{device.name}</span>
            <StatusIndicator status={device.status} glow />
          </div>
        ))}
      </div>
    </div>
  ),
};

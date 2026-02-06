import type { Meta, StoryObj } from "@storybook/react";
import { PageHeader } from "./page-header";
import { Button } from "../button/button";
import { Smartphone, Settings, RefreshCw } from "lucide-react";

const meta: Meta<typeof PageHeader> = {
  title: "Components/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "RetroUI NeoBrutalist 스타일 페이지 헤더. 제목, 설명, 아이콘, 액션 버튼을 일관된 레이아웃으로 표시.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    title: "Dashboard",
    description: "Overview of your project status",
  },
};

export const WithIcon: Story = {
  args: {
    title: "Device Management",
    description: "Manage and monitor 500 connected devices",
    icon: <Smartphone className="h-6 w-6" />,
  },
};

export const WithActions: Story = {
  args: {
    title: "Settings",
    description: "Configure your workspace preferences",
    icon: <Settings className="h-6 w-6" />,
    actions: (
      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </div>
    ),
  },
};

export const WithRefreshAction: Story = {
  args: {
    title: "Device Farm",
    description: "Real-time device status monitoring",
    icon: <Smartphone className="h-6 w-6" />,
    actions: (
      <Button variant="outline" size="sm">
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
    ),
  },
};

export const TitleOnly: Story = {
  args: {
    title: "Simple Page",
  },
};

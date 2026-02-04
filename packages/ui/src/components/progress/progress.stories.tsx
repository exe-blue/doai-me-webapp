import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./progress";

const meta: Meta<typeof Progress> = {
  title: "Components/Progress",
  component: Progress,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 진행률 표시 바.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  render: () => <Progress value={50} className="w-[300px]" />,
};

export const Values: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div>
        <p className="mb-1 text-sm font-bold">0%</p>
        <Progress value={0} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">25%</p>
        <Progress value={25} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">50%</p>
        <Progress value={50} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">75%</p>
        <Progress value={75} />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">100%</p>
        <Progress value={100} />
      </div>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="mb-2 flex justify-between text-sm font-bold">
        <span>Progress</span>
        <span>66%</span>
      </div>
      <Progress value={66} />
    </div>
  ),
};

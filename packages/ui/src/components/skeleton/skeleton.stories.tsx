import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton, Loader } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 스켈레톤 로더.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => <Skeleton className="h-4 w-[250px]" />,
};

export const Card: Story = {
  render: () => (
    <div className="flex flex-col space-y-3 w-[300px]">
      <Skeleton className="h-[125px] w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const Avatar: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
    </div>
  ),
};

export const Table: Story = {
  render: () => (
    <div className="w-[400px] space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  ),
};

export const LoaderDefault: Story = {
  name: "Loader",
  render: () => <Loader />,
};

export const LoaderCustom: Story = {
  name: "Loader Custom",
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-bold text-sm">3 dots (default)</p>
        <Loader count={3} />
      </div>
      <div>
        <p className="mb-2 font-bold text-sm">5 dots</p>
        <Loader count={5} />
      </div>
      <div>
        <p className="mb-2 font-bold text-sm">Fast animation</p>
        <Loader duration={0.3} delayStep={50} />
      </div>
    </div>
  ),
};

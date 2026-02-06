import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarImage, AvatarFallback } from "./avatar";

const meta: Meta<typeof Avatar> = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI NeoBrutalist 스타일 아바타. 두꺼운 테두리.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="User" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
};

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="" alt="User" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">S</AvatarFallback>
      </Avatar>
      <Avatar className="h-10 w-10">
        <AvatarFallback>M</AvatarFallback>
      </Avatar>
      <Avatar className="h-16 w-16">
        <AvatarFallback className="text-lg">L</AvatarFallback>
      </Avatar>
      <Avatar className="h-24 w-24">
        <AvatarFallback className="text-2xl">XL</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-primary text-primary-foreground">A</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-secondary text-secondary-foreground">B</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback className="bg-accent text-accent-foreground">C</AvatarFallback>
      </Avatar>
      <Avatar className="border-4 border-background">
        <AvatarFallback>+5</AvatarFallback>
      </Avatar>
    </div>
  ),
};

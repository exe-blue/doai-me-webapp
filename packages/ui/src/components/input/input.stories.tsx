import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";
import { Label } from "../label/label";
import { Button } from "../button/button";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 입력 필드. 두꺼운 테두리와 그림자.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  render: () => <Input placeholder="Enter text..." className="w-[300px]" />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="email@example.com" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => <Input placeholder="Disabled input" disabled className="w-[300px]" />,
};

export const WithButton: Story = {
  render: () => (
    <div className="flex w-[400px] gap-2">
      <Input placeholder="Search..." className="flex-1" />
      <Button>Search</Button>
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="grid w-[300px] gap-4">
      <div className="grid gap-2">
        <Label>Text</Label>
        <Input type="text" placeholder="Text input" />
      </div>
      <div className="grid gap-2">
        <Label>Password</Label>
        <Input type="password" placeholder="Password" />
      </div>
      <div className="grid gap-2">
        <Label>Number</Label>
        <Input type="number" placeholder="0" />
      </div>
      <div className="grid gap-2">
        <Label>File</Label>
        <Input type="file" />
      </div>
    </div>
  ),
};

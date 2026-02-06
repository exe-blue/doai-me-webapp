import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label";
import { Checkbox } from "../checkbox/checkbox";
import { Input } from "../input/input";

const meta: Meta<typeof Label> = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI NeoBrutalist 스타일 라벨.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => <Label>Label Text</Label>,
};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <Label htmlFor="email">Email Address</Label>
      <Input id="email" type="email" placeholder="email@example.com" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">I agree to the terms and conditions</Label>
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <Label htmlFor="required">
        Required Field <span className="text-destructive">*</span>
      </Label>
      <Input id="required" required />
    </div>
  ),
};

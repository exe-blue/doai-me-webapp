import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./textarea";
import { Label } from "../label/label";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 텍스트영역.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  render: () => <Textarea placeholder="Enter your message..." className="w-[300px]" />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" placeholder="Type your message here." />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => <Textarea placeholder="Disabled" disabled className="w-[300px]" />,
};

export const WithValue: Story = {
  render: () => (
    <Textarea
      defaultValue="This is some default text that appears in the textarea."
      className="w-[300px]"
    />
  ),
};

export const Large: Story = {
  render: () => (
    <Textarea
      placeholder="Write a detailed description..."
      className="w-[400px] min-h-[200px]"
    />
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./switch";
import { Label } from "../label/label";

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI NeoBrutalist 스타일 토글 스위치.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => <Switch />,
};

export const Checked: Story = {
  render: () => <Switch defaultChecked />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="disabled" disabled />
      <Label htmlFor="disabled" className="opacity-50">Disabled</Label>
    </div>
  ),
};

export const SettingsExample: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="notifications">Notifications</Label>
        <Switch id="notifications" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="dark-mode">Dark Mode</Label>
        <Switch id="dark-mode" />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-update">Auto Update</Label>
        <Switch id="auto-update" defaultChecked />
      </div>
    </div>
  ),
};

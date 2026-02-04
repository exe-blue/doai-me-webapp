import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 탭 네비게이션.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Account</TabsTrigger>
        <TabsTrigger value="tab2">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p>Make changes to your account here.</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p>Change your password here.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const MultipleTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <h3 className="font-bold mb-2">Overview</h3>
        <p>Your dashboard overview.</p>
      </TabsContent>
      <TabsContent value="analytics">
        <h3 className="font-bold mb-2">Analytics</h3>
        <p>View analytics data.</p>
      </TabsContent>
      <TabsContent value="reports">
        <h3 className="font-bold mb-2">Reports</h3>
        <p>Generate reports.</p>
      </TabsContent>
      <TabsContent value="settings">
        <h3 className="font-bold mb-2">Settings</h3>
        <p>Configure preferences.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithDisabled: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
        <TabsTrigger value="another">Another</TabsTrigger>
      </TabsList>
      <TabsContent value="active">Active tab content.</TabsContent>
      <TabsContent value="another">Another tab content.</TabsContent>
    </Tabs>
  ),
};

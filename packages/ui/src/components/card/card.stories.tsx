import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
import { Button } from "../button/button";
import { Badge } from "../badge/badge";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI/NeoBrutalist 스타일 카드. 두꺼운 테두리와 그림자.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>This is the card content area. You can put any content here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const SimpleCard: Story = {
  render: () => (
    <Card className="w-[350px] p-4">
      <p>A simple card with just content.</p>
    </Card>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Device Status</CardTitle>
          <Badge variant="success">Online</Badge>
        </div>
        <CardDescription>Samsung Galaxy S24</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Battery</span>
            <span className="font-bold">85%</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span className="font-bold">Idle</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Connect</Button>
        <Button size="sm" variant="outline">View Logs</Button>
      </CardFooter>
    </Card>
  ),
};

export const MultipleCards: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card className="p-4">
        <CardTitle className="mb-2">Total Devices</CardTitle>
        <p className="text-3xl font-bold">12</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Active</CardTitle>
        <p className="text-3xl font-bold text-green-600">8</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Offline</CardTitle>
        <p className="text-3xl font-bold text-muted-foreground">3</p>
      </Card>
      <Card className="p-4">
        <CardTitle className="mb-2">Errors</CardTitle>
        <p className="text-3xl font-bold text-red-600">1</p>
      </Card>
    </div>
  ),
};

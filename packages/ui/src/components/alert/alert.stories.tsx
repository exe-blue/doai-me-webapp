import type { Meta, StoryObj } from "@storybook/react";
import { Alert, AlertTitle, AlertDescription } from "./alert";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "RetroUI NeoBrutalist 스타일 알림. 두꺼운 테두리와 상태별 색상.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

export const AllStatus: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <Alert status="info">
        <Info className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is an informational message.</AlertDescription>
      </Alert>
      
      <Alert status="success">
        <CheckCircle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Operation completed successfully!</AlertDescription>
      </Alert>
      
      <Alert status="warning">
        <AlertTriangle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>Please review your settings.</AlertDescription>
      </Alert>
      
      <Alert status="error">
        <AlertCircle className="h-4 w-4 mr-2 inline" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong. Please try again.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const Solid: Story = {
  render: () => (
    <Alert variant="solid" className="w-[400px]">
      <AlertTitle>Solid Variant</AlertTitle>
      <AlertDescription>
        This is the solid variant with inverted colors.
      </AlertDescription>
    </Alert>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Alert status="error" className="w-[400px]">
      <div className="flex gap-2">
        <AlertCircle className="h-5 w-5" />
        <div>
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription>
            Unable to connect to the server. Please check your internet connection and try again.
          </AlertDescription>
        </div>
      </div>
    </Alert>
  ),
};

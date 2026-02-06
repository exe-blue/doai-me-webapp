import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./slider";
import { useState } from "react";

const meta: Meta<typeof Slider> = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "NeoBrutalist 스타일 슬라이더.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  render: () => <Slider defaultValue={[50]} max={100} step={1} className="w-[300px]" />,
};

export const WithValue: Story = {
  render: function Render() {
    const [value, setValue] = useState([33]);
    return (
      <div className="w-[300px] space-y-2">
        <div className="flex justify-between text-sm font-bold">
          <span>Value</span>
          <span>{value[0]}%</span>
        </div>
        <Slider
          value={value}
          onValueChange={setValue}
          max={100}
          step={1}
        />
      </div>
    );
  },
};

export const Range: Story = {
  render: function Render() {
    const [value, setValue] = useState([25, 75]);
    return (
      <div className="w-[300px] space-y-2">
        <div className="flex justify-between text-sm font-bold">
          <span>Range</span>
          <span>{value[0]} - {value[1]}</span>
        </div>
        <Slider
          value={value}
          onValueChange={setValue}
          max={100}
          step={1}
        />
      </div>
    );
  },
};

export const Steps: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <div>
        <p className="mb-2 text-sm font-bold">Step: 1</p>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Step: 10</p>
        <Slider defaultValue={[50]} max={100} step={10} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Step: 25</p>
        <Slider defaultValue={[50]} max={100} step={25} />
      </div>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => <Slider defaultValue={[50]} max={100} step={1} disabled className="w-[300px]" />,
};

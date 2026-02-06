import type { Meta, StoryObj } from "@storybook/react";
import { DeviceCard, type DeviceCardDevice } from "./device-card";

const meta: Meta<typeof DeviceCard> = {
  title: "Components/DeviceCard",
  component: DeviceCard,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "RetroUI NeoBrutalist 스타일 디바이스 카드. 디바이스 상태, 배터리, 마지막 접속 시간을 표시.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DeviceCard>;

const idleDevice: DeviceCardDevice = {
  id: "device-001",
  model: "Galaxy S24 Ultra",
  serial: "R5CR30ABCDE",
  status: "idle",
  batteryLevel: 87,
  lastSeen: new Date().toISOString(),
};

const busyDevice: DeviceCardDevice = {
  id: "device-002",
  model: "Pixel 8 Pro",
  serial: "1A2B3C4D5E6F",
  status: "busy",
  batteryLevel: 62,
  lastSeen: new Date().toISOString(),
};

const offlineDevice: DeviceCardDevice = {
  id: "device-003",
  model: "iPhone 15 Pro",
  serial: "DNQXYZ123456",
  status: "offline",
  batteryLevel: 15,
  lastSeen: new Date(Date.now() - 3600000).toISOString(),
};

const errorDevice: DeviceCardDevice = {
  id: "device-004",
  model: "Galaxy Z Fold 5",
  serial: "R5ZZ99FGHIJ",
  status: "error",
  batteryLevel: 3,
  lastSeen: new Date(Date.now() - 7200000).toISOString(),
};

export const Idle: Story = {
  args: {
    device: idleDevice,
  },
};

export const Busy: Story = {
  args: {
    device: busyDevice,
  },
};

export const Offline: Story = {
  args: {
    device: offlineDevice,
  },
};

export const Error: Story = {
  args: {
    device: errorDevice,
  },
};

export const LowBattery: Story = {
  args: {
    device: {
      ...idleDevice,
      batteryLevel: 8,
    },
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <DeviceCard device={idleDevice} />
      <DeviceCard device={busyDevice} />
      <DeviceCard device={offlineDevice} />
      <DeviceCard device={errorDevice} />
    </div>
  ),
};

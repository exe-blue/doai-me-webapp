"use client";

import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";
import { Battery, Smartphone, Activity } from "lucide-react";

const deviceStatusVariants = cva(
  "px-2.5 py-1 text-xs font-head font-bold uppercase tracking-wider border-2 border-border",
  {
    variants: {
      status: {
        idle: "bg-green-500 text-white",
        busy: "bg-blue-500 text-white",
        offline: "bg-muted text-muted-foreground",
        error: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      status: "idle",
    },
  }
);

export type DeviceStatus = "idle" | "busy" | "offline" | "error";

export interface DeviceCardDevice {
  id: string;
  model: string;
  serial: string;
  status: DeviceStatus;
  batteryLevel: number;
  lastSeen: string | Date;
}

export interface DeviceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  device: DeviceCardDevice;
  onConnect?: (deviceId: string) => void;
  onViewLogs?: (deviceId: string) => void;
}

const DeviceCard = React.forwardRef<HTMLDivElement, DeviceCardProps>(
  ({ className, device, onConnect, onViewLogs, ...props }, ref) => {
    const isOffline = device.status === "offline";

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col w-full max-w-sm overflow-hidden rounded bg-background",
          "border-2 border-border shadow-md",
          className
        )}
        {...props}
      >
        <div className="flex flex-col w-full h-full p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-2 border-2 border-border",
                  device.status === "idle" && "bg-green-100 text-green-600",
                  device.status === "busy" && "bg-blue-100 text-blue-600",
                  device.status === "offline" && "bg-muted text-muted-foreground",
                  device.status === "error" && "bg-red-100 text-red-600"
                )}
              >
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className="font-head font-bold text-foreground leading-tight">
                  {device.model}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {device.serial}
                </p>
              </div>
            </div>
            <span className={cn(deviceStatusVariants({ status: device.status }))}>
              {device.status}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 bg-muted border-2 border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Battery size={14} /> Battery
              </div>
              <span
                className={cn(
                  "text-lg font-bold",
                  device.batteryLevel < 20
                    ? "text-destructive"
                    : "text-foreground"
                )}
              >
                {device.batteryLevel}%
              </span>
            </div>
            <div className="p-3 bg-muted border-2 border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Activity size={14} /> Last Seen
              </div>
              <span className="text-sm font-semibold text-foreground">
                {new Date(device.lastSeen).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <button
              onClick={() => onConnect?.(device.id)}
              disabled={isOffline}
              className={cn(
                "flex items-center justify-center py-2.5 text-sm font-head font-bold",
                "bg-primary text-primary-foreground border-2 border-border shadow-md",
                "hover:shadow active:shadow-none transition-shadow",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Control
            </button>
            <button
              onClick={() => onViewLogs?.(device.id)}
              className={cn(
                "flex items-center justify-center py-2.5 text-sm font-head font-bold",
                "bg-background text-foreground border-2 border-border shadow-md",
                "hover:shadow active:shadow-none transition-shadow"
              )}
            >
              Logs
            </button>
          </div>
        </div>
      </div>
    );
  }
);

DeviceCard.displayName = "DeviceCard";

export { DeviceCard, deviceStatusVariants };

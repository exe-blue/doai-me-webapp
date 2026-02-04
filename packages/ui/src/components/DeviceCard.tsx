import React from 'react';
import { Device } from '@doai/shared';
import ShineBorder from '../magicui/shine-border';
import { cn } from '../lib/utils';
import { Battery, Smartphone, Activity } from 'lucide-react';

interface DeviceCardProps {
  device: Device;
  onConnect?: (deviceId: string) => void;
  onViewLogs?: (deviceId: string) => void;
}

export const DeviceCard = ({ device, onConnect, onViewLogs }: DeviceCardProps) => {
  const isOffline = device.status === 'offline';
  
  // 상태별 색상 (테두리 빛나는 색상)
  const statusColors: Record<string, string[]> = {
    idle: ["#4ade80", "#22c55e"],   // Green
    busy: ["#60a5fa", "#3b82f6"],   // Blue
    offline: ["#94a3b8", "#64748b"], // Gray
    error: ["#f87171", "#ef4444"],   // Red
  };

  const currentColors = statusColors[device.status] || statusColors.idle;

  return (
    <ShineBorder 
      className="relative flex flex-col w-full max-w-sm overflow-hidden bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm"
      color={currentColors}
      borderRadius={12}
      borderWidth={1.5}
    >
      <div className="z-10 flex flex-col w-full h-full p-5">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              device.status === 'idle' && "bg-green-100 text-green-600",
              device.status === 'busy' && "bg-blue-100 text-blue-600",
              device.status === 'offline' && "bg-gray-100 text-gray-500",
              device.status === 'error' && "bg-red-100 text-red-600",
            )}>
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{device.model}</h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{device.serial}</p>
            </div>
          </div>
          <div className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
            device.status === 'idle' && "bg-green-50 text-green-700 border-green-200",
            device.status === 'busy' && "bg-blue-50 text-blue-700 border-blue-200",
            device.status === 'offline' && "bg-gray-50 text-gray-600 border-gray-200",
            device.status === 'error' && "bg-red-50 text-red-700 border-red-200",
          )}>
            {device.status}
          </div>
        </div>

        {/* Body Stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Battery size={14} /> Battery
            </div>
            <span className={cn(
              "text-lg font-bold",
              device.batteryLevel < 20 ? "text-red-500" : "text-gray-900 dark:text-gray-100"
            )}>
              {device.batteryLevel}%
            </span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Activity size={14} /> Last Seen
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mt-auto">
          <button
            onClick={() => onConnect?.(device.id)}
            disabled={isOffline}
            className="flex items-center justify-center py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-all shadow-sm active:scale-95"
          >
            Control
          </button>
          <button
            onClick={() => onViewLogs?.(device.id)}
            className="flex items-center justify-center py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all active:scale-95"
          >
            Logs
          </button>
        </div>
      </div>
    </ShineBorder>
  );
};

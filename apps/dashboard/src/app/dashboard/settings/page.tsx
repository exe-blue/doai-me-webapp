'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  Wifi,
  Server,
  ThumbsUp,
  MessageSquare,
  UserPlus,
  Clock,
  Save,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';
import { cn } from '@/lib/utils';

interface GlobalSettings {
  // Connection Settings
  socketUrl: string;
  autoReconnect: boolean;
  heartbeatInterval: number;

  // Default Probabilities
  defaultLikeRate: number;
  defaultCommentRate: number;
  defaultSubscribeRate: number;

  // Default Duration
  defaultMinDuration: number;
  defaultMaxDuration: number;

  // Device Settings
  defaultResolutionWidth: number;
  defaultResolutionHeight: number;
  defaultBrightness: number;
  defaultVolume: number;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  socketUrl: 'http://localhost:3001',
  autoReconnect: true,
  heartbeatInterval: 5000,

  defaultLikeRate: 30,
  defaultCommentRate: 5,
  defaultSubscribeRate: 10,

  defaultMinDuration: 60,
  defaultMaxDuration: 180,

  defaultResolutionWidth: 1080,
  defaultResolutionHeight: 2340,
  defaultBrightness: 0,
  defaultVolume: 0,
};

const STORAGE_KEY = 'doaime-settings';

export default function SettingsPage() {
  const { isConnected, devices } = useSocketContext();
  const [settings, setSettings] = useState<GlobalSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateSetting = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaved(false);
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setHasChanges(false);
    setSaved(true);
    toast.success('설정이 저장되었습니다');
    setTimeout(() => setSaved(false), 2000);
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
    setSaved(false);
    toast.info('기본값으로 초기화됨');
  };

  const pcCount = new Set(devices.map(d => d.pc_id)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-foreground">SETTINGS</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              'h-2 w-2 rounded-full',
              isConnected
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            )} />
            <span className="font-mono text-xs text-zinc-400">
              {pcCount} PCs / {devices.length} devices
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="font-mono text-xs border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            RESET
          </Button>
          <Button
            size="sm"
            onClick={saveSettings}
            disabled={!hasChanges}
            className={cn(
              'font-mono text-xs',
              saved ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {saved ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                SAVED
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                SAVE
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Settings */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-blue-500" />
              <span className="font-mono text-sm font-bold text-white">CONNECTION</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Socket URL */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
                Socket.io URL
              </label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="url"
                  value={settings.socketUrl}
                  onChange={(e) => updateSetting('socketUrl', e.target.value)}
                  className="pl-10 font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Auto Reconnect */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-sm text-white">Auto Reconnect</span>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  Automatically reconnect on disconnect
                </p>
              </div>
              <Switch
                checked={settings.autoReconnect}
                onCheckedChange={(v) => updateSetting('autoReconnect', v)}
              />
            </div>

            {/* Heartbeat Interval */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
                Heartbeat Interval (ms)
              </label>
              <Input
                type="number"
                min={1000}
                max={30000}
                step={1000}
                value={settings.heartbeatInterval}
                onChange={(e) => updateSetting('heartbeatInterval', parseInt(e.target.value) || 5000)}
                className="font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>
        </div>

        {/* Default Probabilities */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-green-500" />
              <span className="font-mono text-sm font-bold text-white">DEFAULT_PROBABILITIES</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Default Like Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-blue-500" />
                  <span className="font-mono text-xs text-zinc-400">Default Like Rate</span>
                </div>
                <span className="font-mono text-sm text-white">{settings.defaultLikeRate}%</span>
              </div>
              <Slider
                value={[settings.defaultLikeRate]}
                onValueChange={(v) => updateSetting('defaultLikeRate', v[0])}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            {/* Default Comment Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="font-mono text-xs text-zinc-400">Default Comment Rate</span>
                </div>
                <span className="font-mono text-sm text-white">{settings.defaultCommentRate}%</span>
              </div>
              <Slider
                value={[settings.defaultCommentRate]}
                onValueChange={(v) => updateSetting('defaultCommentRate', v[0])}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            {/* Default Subscribe Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-red-500" />
                  <span className="font-mono text-xs text-zinc-400">Default Subscribe Rate</span>
                </div>
                <span className="font-mono text-sm text-white">{settings.defaultSubscribeRate}%</span>
              </div>
              <Slider
                value={[settings.defaultSubscribeRate]}
                onValueChange={(v) => updateSetting('defaultSubscribeRate', v[0])}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Default Duration Settings */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="font-mono text-sm font-bold text-white">DEFAULT_DURATION</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
                  Min Duration (seconds)
                </label>
                <Input
                  type="number"
                  min={10}
                  max={settings.defaultMaxDuration}
                  value={settings.defaultMinDuration}
                  onChange={(e) => updateSetting('defaultMinDuration', parseInt(e.target.value) || 60)}
                  className="font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
                />
              </div>
              <span className="font-mono text-zinc-500 mt-6">~</span>
              <div className="flex-1">
                <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
                  Max Duration (seconds)
                </label>
                <Input
                  type="number"
                  min={settings.defaultMinDuration}
                  max={600}
                  value={settings.defaultMaxDuration}
                  onChange={(e) => updateSetting('defaultMaxDuration', parseInt(e.target.value) || 180)}
                  className="font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
                />
              </div>
            </div>
            <p className="font-mono text-[10px] text-zinc-600">
              Default watch duration range for new jobs
            </p>
          </div>
        </div>

        {/* Device Defaults */}
        <div className="rounded-md border border-zinc-800 bg-black dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-purple-500" />
              <span className="font-mono text-sm font-bold text-white">DEVICE_DEFAULTS</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Resolution */}
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase block mb-2">
                Default Resolution
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={settings.defaultResolutionWidth}
                  onChange={(e) => updateSetting('defaultResolutionWidth', parseInt(e.target.value) || 1080)}
                  className="font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
                />
                <span className="font-mono text-zinc-500">x</span>
                <Input
                  type="number"
                  value={settings.defaultResolutionHeight}
                  onChange={(e) => updateSetting('defaultResolutionHeight', parseInt(e.target.value) || 2340)}
                  className="font-mono text-sm bg-zinc-900 border-zinc-700 focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Brightness */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-400">Default Brightness</span>
                <span className="font-mono text-sm text-white">{settings.defaultBrightness}</span>
              </div>
              <Slider
                value={[settings.defaultBrightness]}
                onValueChange={(v) => updateSetting('defaultBrightness', v[0])}
                max={255}
                step={1}
                className="w-full"
              />
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-400">Default Volume</span>
                <span className="font-mono text-sm text-white">{settings.defaultVolume}</span>
              </div>
              <Slider
                value={[settings.defaultVolume]}
                onValueChange={(v) => updateSetting('defaultVolume', v[0])}
                max={15}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      {hasChanges && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded-md">
          <span className="font-mono text-xs text-yellow-400">
            Unsaved changes - click SAVE to apply
          </span>
        </div>
      )}
    </div>
  );
}

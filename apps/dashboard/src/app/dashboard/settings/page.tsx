'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@packages/ui';
import { Switch } from '@/components/ui/switch';
import {
  Wifi,
  Server,
  Save,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSocketContext } from '@/contexts/socket-context';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface GlobalSettings {
  // Connection Settings
  socketUrl: string;
  autoReconnect: boolean;
  heartbeatInterval: number;

  // Device Settings
  defaultResolutionWidth: number;
  defaultResolutionHeight: number;
  defaultBrightness: number;
  defaultVolume: number;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  autoReconnect: true,
  heartbeatInterval: 5000,

  defaultResolutionWidth: 1080,
  defaultResolutionHeight: 2340,
  defaultBrightness: 0,
  defaultVolume: 0,
};

const STORAGE_KEY = 'doaime-settings';

export default function SettingsPage() {
  const { isConnected, devices } = useSocketContext();
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load settings: DB first, then localStorage fallback
  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'global_settings')
        .single();

      if (!error && data?.value) {
        const dbSettings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setSettings({ ...DEFAULT_SETTINGS, ...dbSettings });
        // Sync to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...dbSettings }));
        return;
      }
    } catch {
      // DB not available, fall through to localStorage
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {
      // keep defaults
    }
    // done loading
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaved(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    // Save to localStorage
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const merged = existing ? { ...JSON.parse(existing), ...settings } : settings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    // Save to Supabase settings table
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'global_settings',
          value: settings,
          description: 'Dashboard global settings',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      if (error) {
        console.warn('DB settings save failed:', error.message);
        toast.success('설정이 로컬에 저장되었습니다 (DB 동기화 실패)');
      } else {
        toast.success('설정이 저장되었습니다');
      }
    } catch {
      toast.success('설정이 로컬에 저장되었습니다');
    }

    setHasChanges(false);
    setSaved(true);
    setSaving(false);
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
          <h1 className="text-xl font-head font-bold text-foreground">SETTINGS</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              'h-2 w-2 border-2 border-foreground',
              isConnected
                ? 'bg-green-500'
                : 'bg-red-500'
            )} />
            <span className="font-sans text-xs text-muted-foreground">
              {pcCount} PCs / {devices.length} devices
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="font-sans text-xs border-border hover:border-border hover:bg-card"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            RESET
          </Button>
          <Button
            size="sm"
            onClick={saveSettings}
            disabled={!hasChanges || saving}
            className={cn(
              'font-sans text-xs',
              saved ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                SAVING...
              </>
            ) : saved ? (
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

      {/* Watch settings callout */}
      <Link
        href="/dashboard/watch-settings"
        className="flex items-center justify-between rounded-md border-2 border-primary/50 bg-primary/10 px-4 py-3 hover:bg-primary/20 transition-colors"
      >
        <span className="font-sans text-sm text-foreground">
          시청 설정은 <span className="font-bold">시청설정</span> 페이지로 이동되었습니다
        </span>
        <ArrowRight className="h-4 w-4 text-foreground" />
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Settings */}
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Wifi className="h-4 w-4 text-blue-500" />
              <span className="font-sans text-sm font-bold text-foreground">CONNECTION</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Socket URL */}
            <div>
              <label className="font-sans text-[10px] text-muted-foreground uppercase block mb-2">
                Socket.io URL
              </label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="url"
                  value={settings.socketUrl}
                  onChange={(e) => updateSetting('socketUrl', e.target.value)}
                  className="pl-10 font-sans text-sm bg-card border-border focus:border-border"
                />
              </div>
            </div>

            {/* Auto Reconnect */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-sans text-sm text-foreground">Auto Reconnect</span>
                <p className="font-sans text-[10px] text-muted-foreground mt-0.5">
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
              <label className="font-sans text-[10px] text-muted-foreground uppercase block mb-2">
                Heartbeat Interval (ms)
              </label>
              <Input
                type="number"
                min={1000}
                max={30000}
                step={1000}
                value={settings.heartbeatInterval}
                onChange={(e) => updateSetting('heartbeatInterval', parseInt(e.target.value) || 5000)}
                className="font-sans text-sm bg-card border-border focus:border-border"
              />
            </div>
          </div>
        </div>

        {/* Device Defaults */}
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-purple-500" />
              <span className="font-sans text-sm font-bold text-foreground">DEVICE_DEFAULTS</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Resolution */}
            <div>
              <label className="font-sans text-[10px] text-muted-foreground uppercase block mb-2">
                Default Resolution
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={settings.defaultResolutionWidth}
                  onChange={(e) => updateSetting('defaultResolutionWidth', parseInt(e.target.value) || 1080)}
                  className="font-sans text-sm bg-card border-border focus:border-border"
                />
                <span className="font-sans text-muted-foreground">x</span>
                <Input
                  type="number"
                  value={settings.defaultResolutionHeight}
                  onChange={(e) => updateSetting('defaultResolutionHeight', parseInt(e.target.value) || 2340)}
                  className="font-sans text-sm bg-card border-border focus:border-border"
                />
              </div>
            </div>

            {/* Brightness */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs text-muted-foreground">Default Brightness</span>
                <span className="font-sans text-sm text-foreground">{settings.defaultBrightness}</span>
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
                <span className="font-sans text-xs text-muted-foreground">Default Volume</span>
                <span className="font-sans text-sm text-foreground">{settings.defaultVolume}</span>
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
          <span className="font-sans text-xs text-yellow-400">
            Unsaved changes - click SAVE to apply
          </span>
        </div>
      )}
    </div>
  );
}

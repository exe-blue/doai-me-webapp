'use client';

import { useState, useCallback } from 'react';

export interface WatchSettings {
  defaultLikeRate: number;
  defaultCommentRate: number;
  defaultSubscribeRate: number;
  defaultMinDuration: number;
  defaultMaxDuration: number;
  defaultWatchDurationMinPct: number;
  defaultWatchDurationMaxPct: number;
  actionTemplates: ActionTemplate[];
}

export interface ActionTemplate {
  id: string;
  label: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  defaultLikeRate: 30,
  defaultCommentRate: 5,
  defaultSubscribeRate: 10,
  defaultMinDuration: 60,
  defaultMaxDuration: 180,
  defaultWatchDurationMinPct: 30,
  defaultWatchDurationMaxPct: 100,
  actionTemplates: [
    { id: 'search', label: '검색', enabled: true, params: { randomScroll: true } },
    { id: 'watch', label: '시청', enabled: true, params: { randomScroll: true } },
    { id: 'react', label: '반응', enabled: true, params: { useGlobalDefaults: true } },
    { id: 'surf', label: '서핑', enabled: true, params: { minDuration: 10, maxDuration: 30 } },
  ],
};

const STORAGE_KEY = 'doaime-settings';

function loadSettings(): WatchSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_WATCH_SETTINGS,
        ...parsed,
        actionTemplates: parsed.actionTemplates || DEFAULT_WATCH_SETTINGS.actionTemplates,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_WATCH_SETTINGS;
}

export function useWatchSettings() {
  const [settings, setSettings] = useState<WatchSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_WATCH_SETTINGS;
    return loadSettings();
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateSetting = useCallback(<K extends keyof WatchSettings>(key: K, value: WatchSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaved(false);
  }, []);

  const saveSettings = useCallback(() => {
    // Merge with existing stored data (connection/device settings)
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const merged = existing ? { ...JSON.parse(existing), ...settings } : settings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_WATCH_SETTINGS);
    setHasChanges(true);
    setSaved(false);
  }, []);

  return {
    settings,
    updateSetting,
    saveSettings,
    resetToDefaults,
    hasChanges,
    saved,
    defaults: DEFAULT_WATCH_SETTINGS,
  };
}

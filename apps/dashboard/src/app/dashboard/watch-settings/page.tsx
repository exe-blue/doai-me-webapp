'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider, Label } from '@packages/ui';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ThumbsUp,
  MessageSquare,
  UserPlus,
  Clock,
  Save,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Loader2,
  Search,
  Eye,
  Heart,
  Globe,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWatchSettings, type ActionTemplate } from '@/hooks/use-watch-settings';
import { cn } from '@/lib/utils';

// Action template stage icons + descriptions
const STAGE_META: Record<string, { icon: React.ElementType; description: string }> = {
  search: { icon: Search, description: '키워드 검색 행동 설정' },
  watch: { icon: Eye, description: '시청 시간 및 랜덤 스크롤' },
  react: { icon: Heart, description: '좋아요/댓글/구독 확률 (글로벌 기본값 참조)' },
  surf: { icon: Globe, description: '랜덤 서핑 시간 범위' },
};

export default function WatchSettingsPage() {
  const {
    settings,
    updateSetting,
    saveSettings,
    resetToDefaults,
    hasChanges,
    saved,
  } = useWatchSettings();

  // AI Comments state
  const [aiTitle, setAiTitle] = useState('');
  const [aiTone, setAiTone] = useState<'casual' | 'positive' | 'mixed'>('casual');
  const [aiCount, setAiCount] = useState(10);
  const [aiJobId, setAiJobId] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiComments, setAiComments] = useState<string[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());
  const [aiSaving, setAiSaving] = useState(false);

  async function handleAiPreview() {
    if (!aiTitle.trim()) {
      toast.error('영상 제목을 입력해주세요');
      return;
    }
    setAiLoading(true);
    setAiComments([]);
    setAiSelected(new Set());
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: aiTitle, count: aiCount, tone: aiTone, save: false }),
      });
      const data = await res.json();
      if (data.success && data.comments) {
        setAiComments(data.comments);
        setAiSelected(new Set(data.comments.map((_: string, i: number) => i)));
        toast.success(`${data.comments.length}개 댓글 생성됨`);
      } else {
        toast.error(data.error || 'AI 댓글 생성 실패');
      }
    } catch {
      toast.error('AI 서비스 연결 실패');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAiSave() {
    if (aiSelected.size === 0) {
      toast.error('저장할 댓글을 선택해주세요');
      return;
    }
    if (!aiJobId.trim()) {
      toast.error('작업 ID를 입력해주세요');
      return;
    }
    setAiSaving(true);
    try {
      const selected = aiComments.filter((_, i) => aiSelected.has(i));
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: selected, job_id: aiJobId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.saved}개 댓글 저장됨`);
        setAiComments([]);
        setAiSelected(new Set());
      } else {
        toast.error(data.error || '댓글 저장 실패');
      }
    } catch {
      toast.error('서버 연결 실패');
    } finally {
      setAiSaving(false);
    }
  }

  function toggleAiComment(index: number) {
    setAiSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleSave() {
    saveSettings();
    toast.success('시청 설정이 저장되었습니다');
  }

  function handleReset() {
    resetToDefaults();
    toast.info('기본값으로 초기화됨');
  }

  function updateTemplate(id: string, updates: Partial<ActionTemplate>) {
    const next = settings.actionTemplates.map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    updateSetting('actionTemplates', next);
  }

  function updateTemplateParam(id: string, key: string, value: number | string | boolean) {
    const next = settings.actionTemplates.map(t =>
      t.id === id ? { ...t, params: { ...t.params, [key]: value } } : t
    );
    updateSetting('actionTemplates', next);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-head font-bold text-foreground">WATCH SETTINGS</h1>
          <p className="text-sm text-muted-foreground mt-1">시청 관련 기본값과 AI 댓글 생성을 설정합니다</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="font-sans text-xs border-border hover:border-border hover:bg-card"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            RESET
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            className={cn(
              'font-sans text-xs',
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
        {/* DEFAULT_PROBABILITIES */}
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-green-500" />
              <span className="font-sans text-sm font-bold text-foreground">DEFAULT_PROBABILITIES</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-blue-500" />
                  <span className="font-sans text-xs text-muted-foreground">Default Like Rate</span>
                </div>
                <span className="font-sans text-sm text-foreground">{settings.defaultLikeRate}%</span>
              </div>
              <Slider
                value={[settings.defaultLikeRate]}
                onValueChange={(v) => updateSetting('defaultLikeRate', v[0])}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="font-sans text-xs text-muted-foreground">Default Comment Rate</span>
                </div>
                <span className="font-sans text-sm text-foreground">{settings.defaultCommentRate}%</span>
              </div>
              <Slider
                value={[settings.defaultCommentRate]}
                onValueChange={(v) => updateSetting('defaultCommentRate', v[0])}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-red-500" />
                  <span className="font-sans text-xs text-muted-foreground">Default Subscribe Rate</span>
                </div>
                <span className="font-sans text-sm text-foreground">{settings.defaultSubscribeRate}%</span>
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

        {/* WATCH_DURATION */}
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="font-sans text-sm font-bold text-foreground">WATCH_DURATION</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs text-muted-foreground">시청 비율 범위</span>
                <span className="font-sans text-sm text-foreground">
                  {settings.defaultWatchDurationMinPct}% ~ {settings.defaultWatchDurationMaxPct}%
                </span>
              </div>
              <Slider
                value={[settings.defaultWatchDurationMinPct, settings.defaultWatchDurationMaxPct]}
                onValueChange={([min, max]) => {
                  updateSetting('defaultWatchDurationMinPct', min);
                  updateSetting('defaultWatchDurationMaxPct', max);
                }}
                min={10}
                max={100}
                step={5}
                minStepsBetweenThumbs={1}
                className="w-full"
              />
              <p className="font-sans text-[10px] text-muted-foreground">
                영상 전체 길이 대비 시청 비율입니다 (10% ~ 100%)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="font-sans text-[10px] text-muted-foreground uppercase block mb-2">
                  Min Duration (seconds)
                </label>
                <Input
                  type="number"
                  min={10}
                  max={settings.defaultMaxDuration}
                  value={settings.defaultMinDuration}
                  onChange={(e) => updateSetting('defaultMinDuration', parseInt(e.target.value) || 60)}
                  className="font-sans text-sm bg-card border-border focus:border-border"
                />
              </div>
              <span className="font-sans text-muted-foreground mt-6">~</span>
              <div className="flex-1">
                <label className="font-sans text-[10px] text-muted-foreground uppercase block mb-2">
                  Max Duration (seconds)
                </label>
                <Input
                  type="number"
                  min={settings.defaultMinDuration}
                  max={600}
                  value={settings.defaultMaxDuration}
                  onChange={(e) => updateSetting('defaultMaxDuration', parseInt(e.target.value) || 180)}
                  className="font-sans text-sm bg-card border-border focus:border-border"
                />
              </div>
            </div>
            <p className="font-sans text-[10px] text-muted-foreground">
              비율 기반이 아닌 절대값 시청 시간 (레거시 호환)
            </p>
          </div>
        </div>

        {/* AI_COMMENTS */}
        <div className="rounded-md border border-border bg-background overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="font-sans text-sm font-bold text-foreground">AI 댓글 생성</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="font-sans text-xs">영상 제목</Label>
                <Input
                  placeholder="댓글을 생성할 영상의 제목"
                  value={aiTitle}
                  onChange={(e) => setAiTitle(e.target.value)}
                  className="font-sans text-sm bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-sans text-xs">톤</Label>
                <Select value={aiTone} onValueChange={(v: 'casual' | 'positive' | 'mixed') => setAiTone(v)}>
                  <SelectTrigger className="font-sans text-sm bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">캐주얼</SelectItem>
                    <SelectItem value="positive">긍정적</SelectItem>
                    <SelectItem value="mixed">혼합</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-sans text-xs">생성 수: {aiCount}개</Label>
                <Slider
                  value={[aiCount]}
                  onValueChange={([v]) => setAiCount(v)}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAiPreview}
                disabled={aiLoading || !aiTitle.trim()}
                className="font-sans text-xs"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                미리보기
              </Button>
            </div>

            {/* Preview list */}
            {aiComments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-muted-foreground">
                    생성된 댓글 ({aiSelected.size}/{aiComments.length} 선택)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (aiSelected.size === aiComments.length) {
                        setAiSelected(new Set());
                      } else {
                        setAiSelected(new Set(aiComments.map((_, i) => i)));
                      }
                    }}
                    className="font-sans text-xs"
                  >
                    {aiSelected.size === aiComments.length ? '전체 해제' : '전체 선택'}
                  </Button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1 border border-border rounded-md p-2 bg-card/50">
                  {aiComments.map((comment, i) => (
                    <label
                      key={i}
                      className={cn(
                        'flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 transition-colors',
                        !aiSelected.has(i) && 'opacity-50'
                      )}
                    >
                      <Checkbox
                        checked={aiSelected.has(i)}
                        onCheckedChange={() => toggleAiComment(i)}
                        className="mt-0.5"
                      />
                      <span className="font-sans text-sm text-foreground">{comment}</span>
                    </label>
                  ))}
                </div>

                {/* Save controls */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="작업 ID (job_id)"
                      value={aiJobId}
                      onChange={(e) => setAiJobId(e.target.value)}
                      className="font-sans text-sm bg-card border-border"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAiSave}
                    disabled={aiSaving || aiSelected.size === 0 || !aiJobId.trim()}
                    className="font-sans text-xs bg-green-600 hover:bg-green-700"
                  >
                    {aiSaving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    저장 ({aiSelected.size}개)
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ACTION_TEMPLATES */}
        <div className="rounded-md border border-border bg-background overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-orange-500" />
              <span className="font-sans text-sm font-bold text-foreground">ACTION_TEMPLATES</span>
            </div>
            <span className="font-sans text-[10px] text-muted-foreground">봇 단계별 행동을 설정합니다</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {settings.actionTemplates.map((template) => {
                const meta = STAGE_META[template.id] || { icon: Zap, description: '' };
                const Icon = meta.icon;
                return (
                  <div
                    key={template.id}
                    className={cn(
                      'rounded-md border border-border p-4 space-y-3 transition-opacity',
                      !template.enabled && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-sans text-sm font-bold text-foreground">{template.label}</span>
                      </div>
                      <Switch
                        checked={template.enabled}
                        onCheckedChange={(checked) => updateTemplate(template.id, { enabled: checked })}
                      />
                    </div>
                    <p className="font-sans text-[10px] text-muted-foreground">{meta.description}</p>

                    {template.enabled && template.id === 'surf' && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex-1 space-y-1">
                          <Label className="font-sans text-[10px] text-muted-foreground">최소 (초)</Label>
                          <Input
                            type="number"
                            min={5}
                            max={120}
                            value={Number(template.params.minDuration) || 10}
                            onChange={(e) => updateTemplateParam(template.id, 'minDuration', parseInt(e.target.value) || 10)}
                            className="h-8 font-sans text-xs bg-card border-border"
                          />
                        </div>
                        <span className="mt-5 text-muted-foreground">~</span>
                        <div className="flex-1 space-y-1">
                          <Label className="font-sans text-[10px] text-muted-foreground">최대 (초)</Label>
                          <Input
                            type="number"
                            min={5}
                            max={120}
                            value={Number(template.params.maxDuration) || 30}
                            onChange={(e) => updateTemplateParam(template.id, 'maxDuration', parseInt(e.target.value) || 30)}
                            className="h-8 font-sans text-xs bg-card border-border"
                          />
                        </div>
                      </div>
                    )}

                    {template.enabled && (template.id === 'search' || template.id === 'watch') && (
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-xs text-muted-foreground">랜덤 스크롤</span>
                        <Switch
                          checked={Boolean(template.params.randomScroll)}
                          onCheckedChange={(checked) => updateTemplateParam(template.id, 'randomScroll', checked)}
                        />
                      </div>
                    )}

                    {template.enabled && template.id === 'react' && (
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-xs text-muted-foreground">글로벌 기본값 사용</span>
                        <Switch
                          checked={Boolean(template.params.useGlobalDefaults)}
                          onCheckedChange={(checked) => updateTemplateParam(template.id, 'useGlobalDefaults', checked)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved changes bar */}
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

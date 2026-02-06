'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Youtube,
  Clock,
  Target,
  ThumbsUp,
  MessageSquare,
  ListMusic,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobCreated?: (job: CreateJobResponse) => void;
  idleDeviceCount: number;
}

export interface CreateJobResponse {
  success: boolean;
  job: {
    id: string;
    title: string;
    target_url: string;
    duration_sec: number;
    duration_min_pct: number;
    duration_max_pct: number;
    prob_like: number;
    prob_comment: number;
    prob_playlist: number;
    script_type: string;
  };
  assignments: Array<{
    id: string;
    device_id: string;
    device_serial: string;
  }>;
}

interface FormData {
  title: string;
  channel_name: string;  // NEW: 채널명 (display_name 생성용)
  source_type: 'A' | 'N';  // NEW: Auto or Normal
  job_type: 'VIDEO_URL' | 'CHANNEL_AUTO';  // NEW: 작업 유형
  target_url: string;
  channel_url: string;  // NEW: 채널 URL (CHANNEL_AUTO 모드)
  duration_sec: number;
  target_type: 'all_devices' | 'percentage' | 'device_count';
  target_value: number;
  prob_like: number;
  prob_comment: number;
  prob_playlist: number;
  comments: string;  // NEW: 댓글 목록 (줄바꿈 구분)
}

const DEFAULT_FORM_DATA: FormData = {
  title: '',
  channel_name: '',
  source_type: 'N',  // Default: Manual/Normal
  job_type: 'VIDEO_URL',  // Default: 단일 영상
  target_url: '',
  channel_url: '',
  duration_sec: 60,
  target_type: 'all_devices',
  target_value: 100,
  prob_like: 30,
  prob_comment: 5,
  prob_playlist: 0,
  comments: '',
};

export function JobCreateModal({
  open,
  onOpenChange,
  onJobCreated,
  idleDeviceCount,
}: JobCreateModalProps) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!formData.channel_name.trim()) {
      setError('채널명을 입력해주세요');
      return;
    }
    if (formData.job_type === 'VIDEO_URL' && !formData.target_url) {
      setError('YouTube URL을 입력해주세요');
      return;
    }
    if (formData.job_type === 'CHANNEL_AUTO' && !formData.channel_url) {
      setError('채널 URL을 입력해주세요');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create job');
      }

      onJobCreated?.(data);
      onOpenChange(false);
      setFormData(DEFAULT_FORM_DATA);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getExpectedDevices = () => {
    switch (formData.target_type) {
      case 'all_devices':
        return idleDeviceCount;
      case 'percentage':
        return Math.ceil((idleDeviceCount * formData.target_value) / 100);
      case 'device_count':
        return Math.min(formData.target_value, idleDeviceCount);
      default:
        return 0;
    }
  };

  const expectedDevices = getExpectedDevices();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-background border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">새 작업 등록</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-4">
          {/* Job Type Selection */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              작업 유형
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, job_type: 'VIDEO_URL' }))}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md font-mono text-sm border transition-all',
                  formData.job_type === 'VIDEO_URL'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-card border-border text-muted-foreground hover:border-border'
                )}
              >
                📺 단일 영상
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, job_type: 'CHANNEL_AUTO' }))}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md font-mono text-sm border transition-all',
                  formData.job_type === 'CHANNEL_AUTO'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                    : 'bg-card border-border text-muted-foreground hover:border-border'
                )}
              >
                📡 채널 자동
              </button>
            </div>
          </div>

          {/* YouTube URL (VIDEO_URL mode) */}
          {formData.job_type === 'VIDEO_URL' && (
            <div className="space-y-2">
              <Label className="font-mono text-xs text-muted-foreground uppercase">
                YouTube URL *
              </Label>
              <div className="relative">
                <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={formData.target_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_url: e.target.value }))}
                  className="pl-10 font-mono text-sm bg-card border-border"
                />
              </div>
            </div>
          )}

          {/* Channel URL (CHANNEL_AUTO mode) */}
          {formData.job_type === 'CHANNEL_AUTO' && (
            <div className="space-y-2">
              <Label className="font-mono text-xs text-muted-foreground uppercase">
                채널 URL *
              </Label>
              <div className="relative">
                <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/@channelname"
                  value={formData.channel_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, channel_url: e.target.value }))}
                  className="pl-10 font-mono text-sm bg-card border-border"
                />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                채널 URL 등록 시 새 영상이 올라오면 자동으로 작업이 생성됩니다
              </p>
            </div>
          )}

          {/* Channel Name (for display_name) */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              채널명 *
            </Label>
            <Input
              type="text"
              placeholder="예: 짐승남, 히밥, 승우아빠"
              value={formData.channel_name}
              onChange={(e) => setFormData(prev => ({ ...prev, channel_name: e.target.value }))}
              className="font-mono text-sm bg-card border-border"
            />
            <p className="font-mono text-[10px] text-muted-foreground">
              작업명에 표시됩니다 (예: 260130-짐승남-N)
            </p>
          </div>

          {/* Title (Optional) */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              메모 (Optional)
            </Label>
            <Input
              type="text"
              placeholder="내부 메모용"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="font-mono text-sm bg-card border-border"
            />
          </div>

          {/* Watch Duration */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              Watch Duration
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min={10}
                max={600}
                value={formData.duration_sec}
                onChange={(e) => setFormData(prev => ({ ...prev, duration_sec: parseInt(e.target.value) || 60 }))}
                className="pl-10 font-mono text-sm bg-card border-border"
              />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Seconds to watch the video (10-600)
            </p>
          </div>

          {/* Target Settings */}
          <div className="space-y-3">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              Target Settings
            </Label>
            <div className="flex items-center gap-3">
              <Select
                value={formData.target_type}
                onValueChange={(value) => setFormData(prev => ({
                  ...prev,
                  target_type: value as FormData['target_type'],
                  target_value: value === 'all_devices' ? 100 : prev.target_value,
                }))}
              >
                <SelectTrigger className="w-[180px] bg-card border-border font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all_devices" className="font-mono text-sm">
                    All Devices
                  </SelectItem>
                  <SelectItem value="percentage" className="font-mono text-sm">
                    Percentage
                  </SelectItem>
                  <SelectItem value="device_count" className="font-mono text-sm">
                    Device Count
                  </SelectItem>
                </SelectContent>
              </Select>

              {formData.target_type !== 'all_devices' && (
                <div className="relative flex-1">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                  <Input
                    type="number"
                    min={1}
                    max={formData.target_type === 'percentage' ? 100 : idleDeviceCount}
                    value={formData.target_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, target_value: parseInt(e.target.value) || 1 }))}
                    className="pl-10 font-mono text-sm bg-card border-border"
                  />
                </div>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              {idleDeviceCount} idle devices available | Expected: {expectedDevices} devices
            </p>
          </div>

          {/* Probability Settings */}
          <div className="space-y-4">
            <Label className="font-mono text-xs text-muted-foreground uppercase">
              Probability Settings
            </Label>

            {/* Like Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-blue-500" />
                  <span className="font-mono text-xs text-muted-foreground">Like Rate</span>
                </div>
                <span className="font-mono text-sm text-foreground">{formData.prob_like}%</span>
              </div>
              <Slider
                value={[formData.prob_like]}
                onValueChange={(v) => setFormData(prev => ({ ...prev, prob_like: v[0] }))}
                max={100}
                step={5}
              />
            </div>

            {/* Comment Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="font-mono text-xs text-muted-foreground">Comment Rate</span>
                </div>
                <span className="font-mono text-sm text-foreground">{formData.prob_comment}%</span>
              </div>
              <Slider
                value={[formData.prob_comment]}
                onValueChange={(v) => setFormData(prev => ({ ...prev, prob_comment: v[0] }))}
                max={100}
                step={5}
              />
              {/* Comments Pool */}
              {formData.prob_comment > 0 && (
                <div className="mt-3 space-y-2">
                  <Label className="font-mono text-[10px] text-muted-foreground">
                    댓글 목록 (줄바꿈으로 구분)
                  </Label>
                  <textarea
                    placeholder={"좋은 영상이네요!\n잘 봤습니다 ㅎㅎ\n구독하고 갑니다~"}
                    value={formData.comments}
                    onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                    className="w-full h-20 px-3 py-2 font-mono text-xs bg-card border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formData.comments.split('\n').filter(l => l.trim()).length}개 댓글 등록됨 | 중복 없이 순차 사용
                  </p>
                </div>
              )}
            </div>

            {/* Playlist Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListMusic className="h-4 w-4 text-purple-500" />
                  <span className="font-mono text-xs text-muted-foreground">Add to Playlist Rate</span>
                </div>
                <span className="font-mono text-sm text-foreground">{formData.prob_playlist}%</span>
              </div>
              <Slider
                value={[formData.prob_playlist]}
                onValueChange={(v) => setFormData(prev => ({ ...prev, prob_playlist: v[0] }))}
                max={100}
                step={5}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="font-mono text-xs">{error}</span>
            </div>
          )}

          {/* No Devices Warning */}
          {idleDeviceCount === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 text-yellow-400">
              <AlertCircle className="h-4 w-4" />
              <span className="font-mono text-xs">No idle devices available</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="font-mono text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !formData.channel_name.trim() ||
                (formData.job_type === 'VIDEO_URL' && (!formData.target_url || idleDeviceCount === 0)) ||
                (formData.job_type === 'CHANNEL_AUTO' && !formData.channel_url)
              }
              className={cn(
                'font-mono text-sm',
                'bg-green-600 hover:bg-green-700'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Job'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

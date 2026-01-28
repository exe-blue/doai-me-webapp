'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface JobPostingFormProps {
  onJobCreated?: () => void;
}

export function JobPostingForm({ onJobCreated }: JobPostingFormProps) {
  const [targetGroup, setTargetGroup] = useState('P1-G1');
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [durationRange, setDurationRange] = useState([30, 90]);
  const [likeProbability, setLikeProbability] = useState([0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoUrl.trim()) {
      alert('동영상 URL을 입력하세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 해당 그룹의 기기 조회
      const { data: devices, error: deviceError } = await supabase
        .from('devices')
        .select('id, serial_number')
        .eq('group_id', targetGroup);

      if (deviceError) throw deviceError;

      const deviceCount = devices?.length || 0;

      // Job 생성
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          title: title.trim() || `작업 - ${new Date().toLocaleString('ko-KR')}`,
          target_url: videoUrl.trim(),
          script_type: 'youtube_watch',
          duration_min_pct: durationRange[0],
          duration_max_pct: durationRange[1],
          prob_like: likeProbability[0],
          is_active: true
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // 각 기기에 대해 Assignment 생성
      if (devices && devices.length > 0) {
        const assignments = devices.map(device => ({
          job_id: job.id,
          device_id: device.id,
          status: 'pending',
          progress_pct: 0
        }));

        const { error: assignError } = await supabase
          .from('job_assignments')
          .insert(assignments);

        if (assignError) throw assignError;
      }

      // 폼 초기화
      setVideoUrl('');
      setTitle('');
      setDurationRange([30, 90]);
      setLikeProbability([0]);
      
      alert(`작업이 생성되었습니다! (${deviceCount}대 기기에 할당)`);
      onJobCreated?.();

    } catch (error) {
      console.error('작업 생성 실패:', error);
      alert('작업 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>📋 작업 공고 등록</CardTitle>
        <CardDescription>새로운 시청 작업을 생성합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 작업 제목 */}
          <div className="space-y-2">
            <Label htmlFor="title">작업 제목 (선택)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 유튜브 시청 작업"
            />
          </div>

          {/* 타겟 그룹 */}
          <div className="space-y-2">
            <Label htmlFor="targetGroup">타겟 그룹</Label>
            <Input
              id="targetGroup"
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
              placeholder="예: P1-G1"
            />
          </div>

          {/* 동영상 URL */}
          <div className="space-y-2">
            <Label htmlFor="videoUrl">동영상 URL *</Label>
            <Input
              id="videoUrl"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              required
            />
          </div>

          {/* 시청 시간 범위 */}
          <div className="space-y-4">
            <Label>
              시청 시간 범위: {durationRange[0]}% ~ {durationRange[1]}%
            </Label>
            <Slider
              value={durationRange}
              onValueChange={setDurationRange}
              min={10}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              각 기기는 이 범위 내에서 랜덤하게 시청 시간을 결정합니다
            </p>
          </div>

          {/* 좋아요 확률 */}
          <div className="space-y-4">
            <Label>
              좋아요 확률: {likeProbability[0]}%
            </Label>
            <Slider
              value={likeProbability}
              onValueChange={setLikeProbability}
              min={0}
              max={50}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              0%면 좋아요 비활성화, 50%면 절반 확률로 좋아요
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '생성 중...' : '🚀 작업 시작'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

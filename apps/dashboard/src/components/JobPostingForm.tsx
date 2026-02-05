'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import Image from 'next/image';

interface VideoMeta {
  videoId: string;
  title: string;
  thumbnail: string;
  thumbnailMedium: string;
  channelTitle: string;
  duration: number | null;
  durationFormatted: string | null;
}

interface JobPostingFormProps {
  onJobCreated?: () => void;
}

export function JobPostingForm({ onJobCreated }: JobPostingFormProps) {
  const [targetGroup, setTargetGroup] = useState('P1-G1');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  
  // 슬라이더 상태
  const [durationRange, setDurationRange] = useState([30, 90]);
  const [probLike, setProbLike] = useState([50]);
  const [probComment, setProbComment] = useState([30]);
  const [probPlaylist, setProbPlaylist] = useState([10]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // YouTube URL 디바운스 처리
  const fetchVideoMeta = useCallback(async (url: string) => {
    if (!url.trim()) {
      setVideoMeta(null);
      return;
    }

    // YouTube URL 패턴 체크
    const youtubeRegex = /(?:youtube\.com|youtu\.be)/;
    if (!youtubeRegex.test(url)) {
      setVideoMeta(null);
      return;
    }

    setIsLoadingMeta(true);
    try {
      const response = await fetch(`/api/youtube-meta?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const data = await response.json();
        setVideoMeta(data);
      } else {
        setVideoMeta(null);
      }
    } catch (error) {
      console.error('Failed to fetch video meta:', error);
      setVideoMeta(null);
    } finally {
      setIsLoadingMeta(false);
    }
  }, []);

  // URL 변경 시 메타데이터 가져오기 (디바운스)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVideoMeta(videoUrl);
    }, 500);

    return () => clearTimeout(timer);
  }, [videoUrl, fetchVideoMeta]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!videoUrl.trim()) {
      toast.warning('동영상 URL을 입력하세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 해당 그룹의 기기 조회
      const { data: devices, error: deviceError } = await supabase
        .from('devices')
        .select('id, serial_number')
        .eq('pc_id', targetGroup);

      if (deviceError) throw deviceError;

      const deviceCount = devices?.length || 0;

      // Job 생성
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          title: videoMeta?.title || `작업 - ${new Date().toLocaleString('ko-KR')}`,
          target_url: videoUrl.trim(),
          script_type: 'youtube_watch',
          duration_min_pct: durationRange[0],
          duration_max_pct: durationRange[1],
          prob_like: probLike[0],
          prob_comment: probComment[0],
          prob_playlist: probPlaylist[0],
          is_active: true,
          base_reward: 10
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
      setVideoMeta(null);
      setDurationRange([30, 90]);
      setProbLike([50]);
      setProbComment([30]);
      setProbPlaylist([10]);
      
      toast.success(`작업이 생성되었습니다! (${deviceCount}대 기기에 할당)`);
      onJobCreated?.();

    } catch (error) {
      console.error('작업 생성 실패:', error);
      toast.error('작업 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>📋 작업 공고 등록</CardTitle>
        <CardDescription>새로운 시청 작업을 생성합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* 동영상 URL + 미리보기 */}
          <div className="space-y-2">
            <Label htmlFor="videoUrl">동영상 URL *</Label>
            <Input
              id="videoUrl"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              required
            />
            
            {/* 미리보기 카드 */}
            {isLoadingMeta && (
              <div className="mt-3 p-4 border rounded-lg bg-muted/50 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-32 h-18 bg-muted rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            )}
            
            {videoMeta && !isLoadingMeta && (
              <div className="mt-3 p-4 border rounded-lg bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/20 dark:to-pink-950/20">
                <div className="flex gap-4">
                  <div className="relative w-40 h-24 rounded-lg overflow-hidden flex-shrink-0 shadow-md">
                    <Image
                      src={videoMeta.thumbnailMedium}
                      alt={videoMeta.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {videoMeta.durationFormatted && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {videoMeta.durationFormatted}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2">{videoMeta.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{videoMeta.channelTitle}</p>
                    {videoMeta.duration && (
                      <p className="text-xs text-muted-foreground mt-1">
                        영상 길이: {videoMeta.durationFormatted} ({videoMeta.duration}초)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 시청 시간 범위 */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex justify-between items-center">
              <Label>⏱️ 시청 시간 범위</Label>
              <span className="text-sm font-medium text-blue-600">
                {durationRange[0]}% ~ {durationRange[1]}%
              </span>
            </div>
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
              {videoMeta?.duration && (
                <span className="block mt-1">
                  예상 시청: {Math.floor(videoMeta.duration * durationRange[0] / 100)}초 ~ {Math.floor(videoMeta.duration * durationRange[1] / 100)}초
                </span>
              )}
            </p>
          </div>

          {/* 확률 설정 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 좋아요 확률 */}
            <div className="space-y-3 p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-1">
                  ❤️ 좋아요
                </Label>
                <span className="text-sm font-medium text-red-600">{probLike[0]}%</span>
              </div>
              <Slider
                value={probLike}
                onValueChange={setProbLike}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            {/* 댓글 확률 */}
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-1">
                  💬 댓글
                </Label>
                <span className="text-sm font-medium text-blue-600">{probComment[0]}%</span>
              </div>
              <Slider
                value={probComment}
                onValueChange={setProbComment}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            {/* 재생목록 저장 확률 */}
            <div className="space-y-3 p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-1">
                  📁 저장
                </Label>
                <span className="text-sm font-medium text-green-600">{probPlaylist[0]}%</span>
              </div>
              <Slider
                value={probPlaylist}
                onValueChange={setProbPlaylist}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting}>
            {isSubmitting ? '생성 중...' : '🚀 작업 시작'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

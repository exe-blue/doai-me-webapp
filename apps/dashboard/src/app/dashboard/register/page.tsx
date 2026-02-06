'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  PlusCircle,
  Video,
  Tv,
  Youtube,
  ThumbsUp,
  MessageSquare,
  UserPlus,
  Clock,
  Target,
  FileText,
  AlertCircle,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'video' | 'channel'>('video');

  // Video mode states
  const [videoUrl, setVideoUrl] = useState('');
  const [targetViews, setTargetViews] = useState('100');
  const [displayName, setDisplayName] = useState('');
  const [likeProb, setLikeProb] = useState([30]);
  const [commentProb, setCommentProb] = useState([5]);
  const [subscribeProb, setSubscribeProb] = useState([10]);
  // Dual-thumb slider로 변경: [min, max]
  const [watchDuration, setWatchDuration] = useState([60, 180]);
  const [comments, setComments] = useState('');

  // Channel mode states
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation helpers
  const validateYouTubeVideoUrl = (url: string) => {
    const videoRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/).+$/;
    return videoRegex.test(url);
  };

  const validateYouTubeChannelUrl = (url: string) => {
    const channelRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/(@[\w-]+|channel\/[\w-]+|c\/[\w-]+).*/;
    return channelRegex.test(url);
  };

  // Submit handler for Video mode
  const handleVideoSubmit = async () => {
    if (!videoUrl.trim()) {
      toast.error('영상 URL을 입력해주세요');
      return;
    }

    if (!validateYouTubeVideoUrl(videoUrl)) {
      toast.error('올바른 YouTube 영상 URL을 입력해주세요');
      return;
    }

    const target = Number.parseInt(targetViews, 10);
    if (Number.isNaN(target) || target < 1) {
      toast.error('목표 조회수는 1 이상이어야 합니다');
      return;
    }

    const [minDuration, maxDuration] = watchDuration;
    if (minDuration < 0 || maxDuration < minDuration) {
      toast.error('시청 시간 범위를 올바르게 설정해주세요');
      return;
    }

    // Parse comments (newline separated)
    // 비어있으면 AI가 자동 생성
    const commentList = comments
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: 'VIDEO_URL',
          video_url: videoUrl.trim(),
          display_name: displayName.trim() || undefined,
          target_views: target,
          prob_like: likeProb[0],
          prob_comment: commentProb[0],
          prob_subscribe: subscribeProb[0],
          watch_duration_min: minDuration,
          watch_duration_max: maxDuration,
          comments: commentList.length > 0 ? commentList : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '작업 등록에 실패했습니다');
      }

      // Toast 메시지: AI 자동 생성 댓글 수 표시
      const aiGenerated = result.generatedCommentCount || 0;
      const manualCount = result.commentCount || 0;
      
      if (aiGenerated > 0) {
        toast.success('작업 등록 완료!', {
          description: `AI 댓글 ${aiGenerated}개 자동 생성됨`,
        });
      } else {
        toast.success('작업 등록 완료!', {
          description: manualCount > 0 
            ? `댓글 ${manualCount}개 등록됨`
            : '댓글 없이 등록됨',
        });
      }

      // Reset form
      setVideoUrl('');
      setDisplayName('');
      setTargetViews('100');
      setComments('');
      setWatchDuration([60, 180]);
      setLikeProb([30]);
      setCommentProb([5]);
      setSubscribeProb([10]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 등록 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit handler for Channel mode
  const handleChannelSubmit = async () => {
    if (!channelName.trim()) {
      toast.error('채널명을 입력해주세요');
      return;
    }

    if (!channelUrl.trim()) {
      toast.error('채널 URL을 입력해주세요');
      return;
    }

    if (!validateYouTubeChannelUrl(channelUrl)) {
      toast.error('올바른 YouTube 채널 URL을 입력해주세요');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: 'CHANNEL_AUTO',
          channel_url: channelUrl.trim(),
          display_name: channelName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '채널 등록에 실패했습니다');
      }

      toast.success('채널이 등록되었습니다', {
        description: `채널명: ${channelName} | 새 영상이 감지되면 자동으로 작업이 생성됩니다`,
      });

      // Reset form
      setChannelName('');
      setChannelUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '채널 등록 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 시청 시간을 포맷팅하는 헬퍼 함수
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}초`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-head text-foreground flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          작업등록
        </h1>
        <p className="font-mono text-sm text-muted-foreground mt-2">
          YouTube 영상 또는 채널을 등록하여 자동 작업을 시작합니다
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'video' | 'channel')}>
        <TabsList className="w-full bg-background border border-border">
          <TabsTrigger
            value="video"
            className="flex-1 gap-2 font-mono data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            <Video className="h-4 w-4" />
            단일 영상
          </TabsTrigger>
          <TabsTrigger
            value="channel"
            className="flex-1 gap-2 font-mono data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            <Tv className="h-4 w-4" />
            채널 연동
          </TabsTrigger>
        </TabsList>

        {/* Tab A: 단일 영상 (Target Attack) */}
        <TabsContent value="video" className="space-y-4 mt-4">
          {/* 기본 정보 Card */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                기본 정보
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                타겟 영상 URL과 목표 조회수를 설정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Video URL */}
              <div className="space-y-2">
                <Label className="font-mono text-xs text-muted-foreground uppercase">
                  영상 URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="url"
                  placeholder="https://youtu.be/..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="font-mono text-sm bg-card border-border focus:border-primary"
                />
              </div>

              {/* Target Views & Display Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-2">
                    <Target className="h-3 w-3 text-orange-500" />
                    목표 조회수
                  </Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={targetViews}
                    onChange={(e) => setTargetViews(e.target.value)}
                    min={1}
                    className="font-mono text-sm bg-card border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-2">
                    <FileText className="h-3 w-3 text-purple-500" />
                    작업명 (비워두면 자동 생성)
                  </Label>
                  <Input
                    type="text"
                    placeholder="자동 생성됨"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="font-mono text-sm bg-card border-border"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 행동 패턴 설정 Accordion */}
          <Card className="bg-background border-border">
            <Accordion type="single" collapsible defaultValue="behavior">
              <AccordionItem value="behavior" className="border-b-0">
                <CardHeader className="pb-0">
                  <AccordionTrigger className="hover:no-underline py-0">
                    <CardTitle className="font-mono text-sm flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-cyan-500" />
                      행동 패턴 설정
                    </CardTitle>
                  </AccordionTrigger>
                </CardHeader>
                <AccordionContent>
                  <CardContent className="space-y-6 pt-4">
                    {/* Watch Duration - Dual Thumb Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-2">
                          <Clock className="h-3 w-3 text-cyan-500" />
                          시청 시간 범위
                        </Label>
                        <span className="font-mono text-xs text-cyan-400">
                          {formatDuration(watchDuration[0])} ~ {formatDuration(watchDuration[1])}
                        </span>
                      </div>
                      <Slider
                        value={watchDuration}
                        onValueChange={setWatchDuration}
                        min={10}
                        max={600}
                        step={10}
                        className="w-full"
                      />
                      <p className="font-mono text-[10px] text-muted-foreground">
                        각 기기가 무작위로 이 범위 내에서 시청합니다 (10초 ~ 10분)
                      </p>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Interactions Header */}
                    <p className="font-mono text-xs text-muted-foreground uppercase">상호작용 확률</p>

                    {/* Like Probability */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ThumbsUp className="h-4 w-4 text-blue-500" />
                          <span className="font-mono text-sm text-foreground">👍 좋아요</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-blue-400">{likeProb[0]}%</span>
                      </div>
                      <Slider
                        value={likeProb}
                        onValueChange={setLikeProb}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    </div>

                    {/* Comment Probability */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-green-500" />
                          <span className="font-mono text-sm text-foreground">💬 댓글</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-green-400">{commentProb[0]}%</span>
                      </div>
                      <Slider
                        value={commentProb}
                        onValueChange={setCommentProb}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    </div>

                    {/* Subscribe Probability */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-red-500" />
                          <span className="font-mono text-sm text-foreground">🔔 구독</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-red-400">{subscribeProb[0]}%</span>
                      </div>
                      <Slider
                        value={subscribeProb}
                        onValueChange={setSubscribeProb}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    </div>
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          {/* 댓글 관리 Card */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                댓글 관리
                <span className="text-[10px] text-muted-foreground font-normal">(선택사항)</span>
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                직접 입력하거나 비워두면 AI가 자동 생성합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="댓글 내용을 비워두면, 설정된 확률(%)에 맞춰 자동으로 AI가 댓글을 생성합니다."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                className="font-mono text-sm bg-card border-border resize-none"
              />
              {comments.trim() && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                  <p className="font-mono text-[10px] text-muted-foreground">
                    수동 입력:{' '}
                    <span className="text-amber-400 font-bold">
                      {comments.split('\n').filter((c) => c.trim()).length}개
                    </span>{' '}
                    (한 줄에 하나씩)
                  </p>
                </div>
              )}
              {!comments.trim() && commentProb[0] > 0 && (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  <p className="font-mono text-[10px] text-purple-400">
                    댓글 확률 {commentProb[0]}% 설정됨 → AI가 자동 생성합니다
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            onClick={handleVideoSubmit}
            disabled={isSubmitting || !videoUrl.trim()}
            className="w-full font-mono bg-blue-600 hover:bg-blue-700 disabled:opacity-50 h-12 text-base"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                등록중...
              </>
            ) : (
              <>
                <PlusCircle className="h-5 w-5 mr-2" />
                작업 등록하기
              </>
            )}
          </Button>
        </TabsContent>

        {/* Tab B: 채널 연동 (Channel Farming) */}
        <TabsContent value="channel" className="space-y-4 mt-4">
          {/* Info Banner */}
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Tv className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono text-sm text-green-400 font-bold">채널 자동 모니터링</p>
                  <p className="font-mono text-xs text-muted-foreground mt-1">
                    등록된 채널에서 새 영상이 업로드되면 자동으로 작업이 생성됩니다.
                    채널 확인 주기는 약 30분입니다.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Channel Info Card */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                채널 정보
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                모니터링할 YouTube 채널을 등록합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channel Name */}
              <div className="space-y-2">
                <Label className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-2">
                  <FileText className="h-3 w-3 text-purple-500" />
                  채널명 <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="예: 맛있는 요리 채널"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="font-mono text-sm bg-card border-border"
                />
              </div>

              {/* Channel URL */}
              <div className="space-y-2">
                <Label className="font-mono text-xs text-muted-foreground uppercase flex items-center gap-2">
                  <Youtube className="h-3 w-3 text-red-500" />
                  채널 URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="url"
                  placeholder="https://youtube.com/@channel"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  className="font-mono text-sm bg-card border-border"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  @핸들, /channel/ID, /c/이름 형식 모두 지원됩니다
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            onClick={handleChannelSubmit}
            disabled={isSubmitting || !channelName.trim() || !channelUrl.trim()}
            className="w-full font-mono bg-green-600 hover:bg-green-700 disabled:opacity-50 h-12 text-base"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                등록중...
              </>
            ) : (
              <>
                <PlusCircle className="h-5 w-5 mr-2" />
                채널 연동하기
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

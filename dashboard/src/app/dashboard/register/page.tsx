'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [commentProb, setCommentProb] = useState([10]);
  const [subscribeProb, setSubscribeProb] = useState([5]);
  const [watchDurationMin, setWatchDurationMin] = useState('30');
  const [watchDurationMax, setWatchDurationMax] = useState('120');
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

    const target = parseInt(targetViews, 10);
    if (isNaN(target) || target < 1) {
      toast.error('목표 조회수는 1 이상이어야 합니다');
      return;
    }

    const minDuration = parseInt(watchDurationMin, 10);
    const maxDuration = parseInt(watchDurationMax, 10);
    if (isNaN(minDuration) || isNaN(maxDuration) || minDuration < 0 || maxDuration < minDuration) {
      toast.error('시청 시간 범위를 올바르게 입력해주세요');
      return;
    }

    // Parse comments (newline separated)
    const commentList = comments
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // If commentProb > 0 but no comments provided, warn
    if (commentProb[0] > 0 && commentList.length === 0) {
      toast.error('댓글 확률이 설정되어 있지만 댓글 목록이 비어있습니다');
      return;
    }

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

      toast.success('작업이 등록되었습니다', {
        description: `작업명: ${result.job?.display_name || result.job?.id} | 댓글: ${result.commentCount || 0}개`,
      });

      // Reset form
      setVideoUrl('');
      setDisplayName('');
      setTargetViews('100');
      setComments('');
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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground">작업등록</h1>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          YouTube 영상 또는 채널을 등록하여 자동 작업을 시작합니다
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'video' | 'channel')}>
        <TabsList className="w-full bg-zinc-900 border border-zinc-800">
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

        {/* Tab A: 단일 영상 */}
        <TabsContent value="video" className="space-y-5 mt-5">
          {/* Video URL */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-500" />
              영상 URL
            </Label>
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="font-mono text-sm bg-zinc-900 border-zinc-800"
            />
          </div>

          {/* Target Views & Display Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-500" />
                목표 조회수
              </Label>
              <Input
                type="number"
                placeholder="100"
                value={targetViews}
                onChange={(e) => setTargetViews(e.target.value)}
                min={1}
                className="font-mono text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-500" />
                작업명 (선택)
              </Label>
              <Input
                type="text"
                placeholder="자동 생성됨"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="font-mono text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
          </div>

          {/* Interaction Settings */}
          <div className="space-y-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <p className="font-mono text-xs text-zinc-400 uppercase">상호작용 설정</p>

            {/* Like Probability */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-blue-500" />
                  <span className="font-mono text-sm text-zinc-300">좋아요 확률</span>
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
                  <span className="font-mono text-sm text-zinc-300">댓글 확률</span>
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
                  <span className="font-mono text-sm text-zinc-300">구독 확률</span>
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
          </div>

          {/* Watch Duration Range */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              시청 시간 범위 (초)
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                placeholder="최소"
                value={watchDurationMin}
                onChange={(e) => setWatchDurationMin(e.target.value)}
                min={0}
                className="font-mono text-sm bg-zinc-900 border-zinc-800"
              />
              <span className="font-mono text-zinc-500">~</span>
              <Input
                type="number"
                placeholder="최대"
                value={watchDurationMax}
                onChange={(e) => setWatchDurationMax(e.target.value)}
                min={0}
                className="font-mono text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              각 기기가 무작위로 이 범위 내에서 시청합니다
            </p>
          </div>

          {/* Comments Textarea */}
          {commentProb[0] > 0 && (
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                댓글 목록 (줄바꿈으로 구분)
              </Label>
              <Textarea
                placeholder={`좋은 영상이네요!\n유익한 정보 감사합니다~\n구독하고 갑니다 :)`}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={5}
                className="font-mono text-sm bg-zinc-900 border-zinc-800"
              />
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-amber-500" />
                <p className="font-mono text-[10px] text-zinc-500">
                  {comments.split('\n').filter((c) => c.trim()).length}개 댓글 등록됨 - 기기별로 랜덤하게 사용됩니다
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleVideoSubmit}
            disabled={isSubmitting || !videoUrl.trim()}
            className="w-full font-mono bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                등록중...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4 mr-2" />
                영상 작업 등록
              </>
            )}
          </Button>
        </TabsContent>

        {/* Tab B: 채널 연동 */}
        <TabsContent value="channel" className="space-y-5 mt-5">
          {/* Info Banner */}
          <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/10">
            <div className="flex items-start gap-3">
              <Tv className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-mono text-sm text-green-400 font-bold">채널 자동 모니터링</p>
                <p className="font-mono text-xs text-zinc-400 mt-1">
                  등록된 채널에서 새 영상이 업로드되면 자동으로 작업이 생성됩니다.
                  채널 확인 주기는 약 30분입니다.
                </p>
              </div>
            </div>
          </div>

          {/* Channel Name */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-500" />
              채널명
            </Label>
            <Input
              type="text"
              placeholder="예: 맛있는 요리 채널"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              className="font-mono text-sm bg-zinc-900 border-zinc-800"
            />
          </div>

          {/* Channel URL */}
          <div className="space-y-2">
            <Label className="font-mono text-xs text-zinc-400 uppercase flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-500" />
              채널 URL
            </Label>
            <Input
              type="url"
              placeholder="https://youtube.com/@channel"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              className="font-mono text-sm bg-zinc-900 border-zinc-800"
            />
            <p className="font-mono text-[10px] text-zinc-500">
              @핸들, /channel/ID, /c/이름 형식 모두 지원됩니다
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleChannelSubmit}
            disabled={isSubmitting || !channelName.trim() || !channelUrl.trim()}
            className="w-full font-mono bg-green-600 hover:bg-green-700 disabled:opacity-50"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                등록중...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4 mr-2" />
                채널 등록
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

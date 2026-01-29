/**
 * Channel Checker Service
 *
 * Periodically checks registered YouTube channels for new videos.
 * When a new video is found:
 * 1. Creates a new job in the jobs table
 * 2. Generates AI comments via OpenAI
 * 3. Inserts comments into the comments table
 * 4. Logs the check in channel_check_logs
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { supabase, getChannelsToCheck, updateChannelLastCheck } = require('./supabaseService');
const { generateCommentsForJob } = require('./aiService');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30분

/**
 * YouTube Data API로 채널의 최신 영상 조회
 * @param {string} channelUrl - YouTube channel URL
 * @returns {Promise<{videoId: string, title: string, publishedAt: string}|null>}
 */
async function getLatestVideo(channelUrl) {
  if (!YOUTUBE_API_KEY) {
    console.error('[ChannelChecker] YOUTUBE_API_KEY not set');
    return null;
  }

  try {
    // 채널 URL에서 채널 ID 추출
    const channelId = await resolveChannelId(channelUrl);
    if (!channelId) {
      console.error('[ChannelChecker] Could not resolve channel ID from:', channelUrl);
      return null;
    }

    // YouTube Data API - Search for latest video
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet&order=date&maxResults=1&type=video`;

    const response = await fetch(searchUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ChannelChecker] YouTube API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return null;
    }

    const item = data.items[0];
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle,
    };
  } catch (error) {
    console.error('[ChannelChecker] getLatestVideo error:', error.message);
    return null;
  }
}

/**
 * 채널 URL에서 채널 ID 추출/변환
 * @param {string} channelUrl - YouTube channel URL
 * @returns {Promise<string|null>} - Channel ID (UC...)
 */
async function resolveChannelId(channelUrl) {
  try {
    const url = new URL(channelUrl);

    // 1. /channel/UC... 형식
    const channelMatch = url.pathname.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return channelMatch[1];

    // 2. /@handle 또는 /c/name 형식 -> API로 변환
    const handleMatch = url.pathname.match(/\/@([\w-]+)/) || url.pathname.match(/\/c\/([\w-]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];

      // YouTube Data API - Channels by handle/forUsername
      const lookupUrl = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${handle}&part=id`;
      const response = await fetch(lookupUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          return data.items[0].id;
        }
      }

      // Fallback: forUsername
      const lookupUrl2 = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forUsername=${handle}&part=id`;
      const response2 = await fetch(lookupUrl2);

      if (response2.ok) {
        const data2 = await response2.json();
        if (data2.items && data2.items.length > 0) {
          return data2.items[0].id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[ChannelChecker] resolveChannelId error:', error.message);
    return null;
  }
}

/**
 * 단일 채널 체크 및 새 영상 감지 시 작업 생성
 * @param {Object} channel - channels 테이블 레코드
 * @returns {Promise<{newVideo: boolean, jobId?: string}>}
 */
async function checkChannel(channel) {
  console.log(`[ChannelChecker] Checking channel: ${channel.channel_name} (${channel.channel_id})`);

  const latestVideo = await getLatestVideo(channel.channel_url);

  if (!latestVideo) {
    // 영상을 찾을 수 없음 - 체크 시간만 갱신
    await updateChannelLastCheck(channel.id);
    return { newVideo: false };
  }

  // 이전에 확인한 영상과 동일한지 체크
  if (latestVideo.videoId === channel.last_video_id) {
    console.log(`[ChannelChecker] No new video for ${channel.channel_name}`);
    await updateChannelLastCheck(channel.id);
    return { newVideo: false };
  }

  // 새 영상 발견!
  console.log(`[ChannelChecker] New video found: "${latestVideo.title}" (${latestVideo.videoId})`);

  // 1. Job 생성
  const videoUrl = `https://youtube.com/watch?v=${latestVideo.videoId}`;
  const displayName = `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${channel.channel_name}-A`;

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      title: latestVideo.title,
      display_name: displayName,
      type: 'CHANNEL_AUTO',
      target_url: videoUrl,
      status: 'active',
      duration_sec: channel.default_duration_sec || 120,
      prob_like: channel.default_prob_like || 30,
      prob_comment: channel.default_prob_comment || 10,
      prob_playlist: channel.default_prob_playlist || 0,
      channel_id: channel.id,
      priority: false,
      target_type: 'all_devices',
      target_value: 100,
      assigned_count: 0,
      completed_count: 0,
      failed_count: 0,
    })
    .select()
    .single();

  if (jobError) {
    console.error('[ChannelChecker] Job creation error:', jobError.message);
    await updateChannelLastCheck(channel.id, latestVideo.videoId);
    return { newVideo: true, error: jobError.message };
  }

  console.log(`[ChannelChecker] Job created: ${job.id} (${displayName})`);

  // 2. AI 댓글 생성 및 저장
  const commentResult = await generateCommentsForJob(
    supabase,
    job.id,
    latestVideo.title,
    15 // 채널 자동 모드는 15개 생성
  );

  console.log(`[ChannelChecker] AI comments: generated=${commentResult.generated}, saved=${commentResult.saved}`);

  // 3. 채널 체크 로그 기록
  const { error: logError } = await supabase
    .from('channel_check_logs')
    .insert({
      channel_id: channel.id,
      video_id: latestVideo.videoId,
      video_title: latestVideo.title,
      job_id: job.id,
      comments_generated: commentResult.saved,
    });

  if (logError) {
    console.error('[ChannelChecker] Log insert error:', logError.message);
  }
  // 4. 채널 최종 체크 갱신
  await updateChannelLastCheck(channel.id, latestVideo.videoId);

  return {
    newVideo: true,
    jobId: job.id,
    videoTitle: latestVideo.title,
    commentsGenerated: commentResult.saved,
  };
}

/**
 * 모든 활성 채널 체크 (메인 루프)
 */
async function checkAllChannels() {
  console.log('[ChannelChecker] Starting channel check cycle...');

  const channels = await getChannelsToCheck();

  if (channels.length === 0) {
    console.log('[ChannelChecker] No channels to check');
    return;
  }

  console.log(`[ChannelChecker] Checking ${channels.length} channels...`);

  const results = [];
  for (const channel of channels) {
    try {
      const result = await checkChannel(channel);
      results.push({ channel: channel.channel_name, ...result });
    } catch (error) {
      console.error(`[ChannelChecker] Error checking ${channel.channel_name}:`, error.message);
      results.push({ channel: channel.channel_name, error: error.message });
    }

    // Rate limiting: 2초 간격으로 체크 (YouTube API quota 보호)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const newVideos = results.filter(r => r.newVideo);
  console.log(`[ChannelChecker] Cycle complete: ${results.length} checked, ${newVideos.length} new videos found`);

  return results;
}

// 타이머 ID 저장 (graceful shutdown용)
let channelCheckerIntervalId = null;
let channelCheckerStartupTimeoutId = null;

/**
 * 채널 체커 시작 (주기적 실행)
 * @param {number} intervalMs - Check interval in ms (default: 30 minutes)
 */
function startChannelChecker(intervalMs = CHECK_INTERVAL_MS) {
  // 기존 타이머 정리
  stopChannelChecker();

  console.log(`[ChannelChecker] Started (interval: ${intervalMs / 1000}s)`);

  // 시작 후 10초 뒤에 첫 번째 체크 (서버 부팅 대기)
  channelCheckerStartupTimeoutId = setTimeout(() => {
    checkAllChannels();
    channelCheckerStartupTimeoutId = null;
  }, 10000);

  // 이후 주기적 실행
  channelCheckerIntervalId = setInterval(checkAllChannels, intervalMs);
}

/**
 * 채널 체커 중지 (graceful shutdown)
 */
function stopChannelChecker() {
  if (channelCheckerIntervalId !== null) {
    clearInterval(channelCheckerIntervalId);
    channelCheckerIntervalId = null;
    console.log('[ChannelChecker] Interval stopped');
  }
  
  if (channelCheckerStartupTimeoutId !== null) {
    clearTimeout(channelCheckerStartupTimeoutId);
    channelCheckerStartupTimeoutId = null;
    console.log('[ChannelChecker] Startup timeout cleared');
  }
}

// Graceful shutdown 핸들러
process.on('SIGINT', () => {
  console.log('[ChannelChecker] Received SIGINT, stopping...');
  stopChannelChecker();
});

process.on('SIGTERM', () => {
  console.log('[ChannelChecker] Received SIGTERM, stopping...');
  stopChannelChecker();
});

module.exports = {
  checkAllChannels,
  checkChannel,
  getLatestVideo,
  resolveChannelId,
  startChannelChecker,
  stopChannelChecker,
};

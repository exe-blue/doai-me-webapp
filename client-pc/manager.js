/**
 * [Agent-Node] Manager Brain (v1.0)
 * 역할: 유튜브 채널 감시 -> 자동 공고 등록 -> 댓글 자원 배분
 */
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const cron = require('node-cron');

// 1. 설정 및 초기화
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });

console.log('[Manager] Brain Server Started...');

// 2. 유튜브 영상 메타데이터 가져오기 (Validation)
async function fetchVideoMeta(videoId) {
    try {
        const response = await youtube.videos.list({
            part: 'snippet,contentDetails',
            id: videoId
        });
        if (response.data.items.length === 0) return null;
        return response.data.items[0].snippet;
    } catch (error) {
        console.error('[YouTube API Error]', error.message);
        return null;
    }
}

// 3. 채널 감시 및 자동 공고 등록 (Automation)
async function checkMonitoredChannels() {
    console.log('[Manager] Checking Channels...');
    
    // 활성화된 채널 목록 가져오기
    const { data: channels, error } = await supabase
        .from('monitored_channels')
        .select('*')
        .eq('is_active', true);

    if (error || !channels) {
        if (error) console.error('[DB Error]', error.message);
        return;
    }

    if (channels.length === 0) {
        console.log('[Manager] 모니터링 중인 채널 없음');
        return;
    }

    console.log(`[Manager] ${channels.length}개 채널 감시 중...`);

    for (const ch of channels) {
        console.log(`[Manager] 채널 확인: ${ch.channel_name} (${ch.channel_id})`);
        try {
            // 해당 채널의 최신 영상 5개 조회
            console.log(`[YouTube API] search.list 호출 중...`);
            const res = await youtube.search.list({
                part: 'snippet',
                channelId: ch.channel_id,
                order: 'date',
                type: 'video',
                maxResults: 5
            });

            console.log(`[YouTube API] 응답 받음: ${res.data.items?.length || 0}개 영상`);

            const latestVideo = res.data.items[0];
            if (!latestVideo) {
                console.log(`[Manager] ${ch.channel_name}: 영상 없음`);
                continue;
            }

            const videoId = latestVideo.id.videoId;
            
            // 이미 등록된 영상인지 체크 (채널 테이블의 last_video_id 와 비교)
            if (ch.last_video_id === videoId) {
                console.log(`[Manager] ${ch.channel_name}: 새 영상 없음`);
                continue;
            }

            console.log(`[New Video Detected] ${ch.channel_name}: ${latestVideo.snippet.title}`);

            // Job 자동 생성 (Preset 적용)
            const preset = ch.preset_settings || {};
            const { error: jobError } = await supabase.from('jobs').insert({
                title: `[Auto] ${latestVideo.snippet.title}`,
                target_url: `https://youtu.be/${videoId}`,
                // Preset 적용
                duration_min_pct: preset.duration_min_pct || 30,
                duration_max_pct: preset.duration_max_pct || 90,
                prob_like: preset.prob_like || 50,
                prob_comment: preset.prob_comment || 30,
                prob_playlist: preset.prob_playlist || 10
            });

            if (!jobError) {
                // 채널의 마지막 비디오 ID 업데이트
                await supabase.from('monitored_channels')
                    .update({ last_video_id: videoId, last_checked_at: new Date() })
                    .eq('id', ch.id);
                console.log(` -> Job Created Successfully!`);
            } else {
                console.error('[Job Create Error]', jobError.message);
            }

        } catch (err) {
            console.error(`[Channel Error] ${ch.channel_name}:`, err.message);
        }
    }
}

// 4. 스케줄러 등록 (10분마다 채널 감시)
cron.schedule('*/10 * * * *', () => {
    console.log('[Cron] 10분 주기 채널 체크 시작');
    checkMonitoredChannels();
});

// 시작 시 1회 실행
checkMonitoredChannels();

console.log('[Manager] 스케줄러 등록 완료 (10분마다 채널 감시)');

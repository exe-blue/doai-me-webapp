#!/usr/bin/env node
/**
 * DoAi.Me 테스트 데이터 시드 스크립트
 * 
 * 프로덕션 배포 전 API 검증을 위한 최소 테스트 데이터 생성
 * 
 * 사용법:
 *   node scripts/seed_test_data.js
 * 
 * 환경변수:
 *   SUPABASE_URL - Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service Role Key (RLS 우회)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 테스트 데이터
const TEST_VIDEOS = [
  {
    id: 'dQw4w9WgXcQ',
    title: '테스트 영상 1 - Never Gonna Give You Up',
    channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channel_name: 'Rick Astley',
    thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    video_duration_sec: 212,
    watch_duration_sec: 60,
    target_views: 100,
    completed_views: 0,
    failed_views: 0,
    status: 'active',
    priority: 'high',
  },
  {
    id: '9bZkp7q19f0',
    title: '테스트 영상 2 - Gangnam Style',
    channel_id: 'UCrDkAvwZum-UTjHmzDI2iIw',
    channel_name: 'officialpsy',
    thumbnail_url: 'https://img.youtube.com/vi/9bZkp7q19f0/maxresdefault.jpg',
    video_duration_sec: 252,
    watch_duration_sec: 90,
    target_views: 50,
    completed_views: 0,
    failed_views: 0,
    status: 'active',
    priority: 'normal',
  },
  {
    id: 'kJQP7kiw5Fk',
    title: '테스트 영상 3 - Despacito',
    channel_id: 'UCxoq-PAQeAdk_zyg8YS0JqA',
    channel_name: 'Luis Fonsi',
    thumbnail_url: 'https://img.youtube.com/vi/kJQP7kiw5Fk/maxresdefault.jpg',
    video_duration_sec: 282,
    watch_duration_sec: 120,
    target_views: 75,
    completed_views: 0,
    failed_views: 0,
    status: 'active',
    priority: 'normal',
  },
];

const TEST_CHANNELS = [
  {
    id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    name: 'Rick Astley',
    handle: '@RickAstleyYT',
    profile_url: 'https://yt3.googleusercontent.com/...',
    subscriber_count: '7.5M',
    video_count: 100,
    auto_collect: false,
    status: 'active',
  },
  {
    id: 'UCrDkAvwZum-UTjHmzDI2iIw',
    name: 'officialpsy',
    handle: '@paborama',
    profile_url: 'https://yt3.googleusercontent.com/...',
    subscriber_count: '18M',
    video_count: 200,
    auto_collect: true,
    status: 'active',
  },
];

const TEST_KEYWORDS = [
  { keyword: '음악', category: '엔터테인먼트', is_active: true, max_results: 10 },
  { keyword: '게임', category: '게임', is_active: true, max_results: 10 },
  { keyword: '뉴스', category: '뉴스', is_active: false, max_results: 5 },
];

const TEST_DEVICES = [
  {
    id: 'test-device-001',
    serial_number: 'RF8N90XXXXX',
    pc_id: 'test-node-1',
    node_id: 'test-node-1',
    name: 'Test Galaxy S9 #1',
    state: 'IDLE',
    battery_level: 85,
    temperature: 32,
  },
  {
    id: 'test-device-002',
    serial_number: 'RF8N90YYYYY',
    pc_id: 'test-node-1',
    node_id: 'test-node-1',
    name: 'Test Galaxy S9 #2',
    state: 'IDLE',
    battery_level: 72,
    temperature: 35,
  },
];

async function seedData() {
  console.log('🌱 DoAi.Me 테스트 데이터 시드 시작...\n');

  // 1. Videos
  console.log('📹 Videos 테이블 시드...');
  for (const video of TEST_VIDEOS) {
    const { error } = await supabase.from('videos').upsert(video, { onConflict: 'id' });
    if (error) {
      console.log(`  ⚠️ Video ${video.id}: ${error.message}`);
    } else {
      console.log(`  ✅ Video: ${video.title}`);
    }
  }

  // 2. Channels
  console.log('\n📺 Channels 테이블 시드...');
  for (const channel of TEST_CHANNELS) {
    const { error } = await supabase.from('channels').upsert(channel, { onConflict: 'id' });
    if (error) {
      console.log(`  ⚠️ Channel ${channel.id}: ${error.message}`);
    } else {
      console.log(`  ✅ Channel: ${channel.name}`);
    }
  }

  // 3. Keywords
  console.log('\n🔑 Keywords 테이블 시드...');
  for (const keyword of TEST_KEYWORDS) {
    const { error } = await supabase.from('keywords').upsert(keyword, { onConflict: 'keyword' });
    if (error) {
      console.log(`  ⚠️ Keyword ${keyword.keyword}: ${error.message}`);
    } else {
      console.log(`  ✅ Keyword: ${keyword.keyword}`);
    }
  }

  // 4. Devices
  console.log('\n📱 Devices 테이블 시드...');
  for (const device of TEST_DEVICES) {
    const { error } = await supabase.from('devices').upsert(device, { onConflict: 'id' });
    if (error) {
      console.log(`  ⚠️ Device ${device.id}: ${error.message}`);
    } else {
      console.log(`  ✅ Device: ${device.name}`);
    }
  }

  // 5. Video Executions (테스트용)
  console.log('\n⚡ Video Executions 테이블 시드...');
  const executions = [
    {
      video_id: TEST_VIDEOS[0].id,
      device_id: TEST_DEVICES[0].id,
      node_id: 'test-node-1',
      status: 'completed',
      actual_watch_duration_sec: 65,
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3500000).toISOString(),
    },
    {
      video_id: TEST_VIDEOS[1].id,
      device_id: TEST_DEVICES[1].id,
      node_id: 'test-node-1',
      status: 'completed',
      actual_watch_duration_sec: 95,
      started_at: new Date(Date.now() - 7200000).toISOString(),
      completed_at: new Date(Date.now() - 7000000).toISOString(),
    },
    {
      video_id: TEST_VIDEOS[0].id,
      device_id: TEST_DEVICES[1].id,
      node_id: 'test-node-1',
      status: 'failed',
      error_code: 'ERR_TIMEOUT',
      error_message: '타임아웃',
      started_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  for (const exec of executions) {
    const { error } = await supabase.from('video_executions').insert(exec);
    if (error) {
      console.log(`  ⚠️ Execution: ${error.message}`);
    } else {
      console.log(`  ✅ Execution: ${exec.video_id} - ${exec.status}`);
    }
  }

  // 6. System Logs (테스트용)
  console.log('\n📋 System Logs 테이블 시드...');
  const logs = [
    { level: 'info', source: 'api', component: 'Seeder', message: '테스트 데이터 시드 완료' },
    { level: 'info', source: 'worker', component: 'TaskProcessor', message: 'Task completed successfully' },
    { level: 'warn', source: 'device', component: 'ADBBridge', message: 'Device battery low: 15%', node_id: 'test-node-1' },
    { level: 'error', source: 'network', component: 'SocketManager', message: 'Connection timeout' },
  ];

  for (const log of logs) {
    const { error } = await supabase.from('system_logs').insert(log);
    if (error) {
      console.log(`  ⚠️ Log: ${error.message}`);
    } else {
      console.log(`  ✅ Log: [${log.level}] ${log.message}`);
    }
  }

  // 7. Daily Stats (테스트용)
  console.log('\n📊 Daily Stats 테이블 시드...');
  const today = new Date().toISOString().split('T')[0];
  const dailyStats = {
    date: today,
    total_executions: 3,
    total_completed: 2,
    total_failed: 1,
    success_rate: 66.67,
    total_watch_time_sec: 160,
    avg_watch_time_sec: 80,
    unique_videos: 2,
    active_devices: 2,
    by_hour: { '14': 2, '15': 1 },
  };

  const { error: statsError } = await supabase.from('daily_stats').upsert(dailyStats, { onConflict: 'date' });
  if (statsError) {
    console.log(`  ⚠️ Daily Stats: ${statsError.message}`);
  } else {
    console.log(`  ✅ Daily Stats: ${today}`);
  }

  console.log('\n✨ 테스트 데이터 시드 완료!\n');
  console.log('다음 API 엔드포인트를 테스트해 보세요:');
  console.log('  GET /api/videos');
  console.log('  GET /api/channels');
  console.log('  GET /api/keywords');
  console.log('  GET /api/devices');
  console.log('  GET /api/executions');
  console.log('  GET /api/logs');
  console.log('  GET /api/reports/daily?date=' + today);
}

async function cleanupData() {
  console.log('🧹 테스트 데이터 정리...\n');

  // 역순으로 삭제 (FK 의존성)
  const tables = [
    { name: 'system_logs', filter: {} },
    { name: 'video_executions', filter: { node_id: 'test-node-1' } },
    { name: 'devices', filter: { id: TEST_DEVICES.map(d => d.id) } },
    { name: 'keywords', filter: { keyword: TEST_KEYWORDS.map(k => k.keyword) } },
    { name: 'channels', filter: { id: TEST_CHANNELS.map(c => c.id) } },
    { name: 'videos', filter: { id: TEST_VIDEOS.map(v => v.id) } },
  ];

  for (const table of tables) {
    try {
      let query = supabase.from(table.name).delete();
      
      if (table.filter.id) {
        query = query.in('id', table.filter.id);
      } else if (table.filter.keyword) {
        query = query.in('keyword', table.filter.keyword);
      } else if (table.filter.node_id) {
        query = query.eq('node_id', table.filter.node_id);
      } else {
        // 전체 삭제는 위험하므로 최근 1시간 데이터만
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        query = query.gte('created_at', oneHourAgo);
      }

      const { error } = await query;
      if (error) {
        console.log(`  ⚠️ ${table.name}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table.name} 정리 완료`);
      }
    } catch (err) {
      console.log(`  ⚠️ ${table.name}: ${err.message}`);
    }
  }

  console.log('\n✨ 테스트 데이터 정리 완료!');
}

// CLI 실행
const args = process.argv.slice(2);

if (args.includes('--cleanup') || args.includes('-c')) {
  cleanupData().catch(console.error);
} else {
  seedData().catch(console.error);
}

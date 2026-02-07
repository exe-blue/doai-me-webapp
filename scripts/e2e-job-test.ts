#!/usr/bin/env npx tsx
/**
 * E2E Job Distribution Test
 *
 * 작업 생성 → Backend 분배 → Desktop Agent 실행 전체 플로우 테스트
 *
 * 사용법:
 *   npx tsx scripts/e2e-job-test.ts
 *   npx tsx scripts/e2e-job-test.ts --cleanup   # 테스트 후 DB 정리
 *
 * 환경변수 (.env.local 또는 환경에서):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { io, Socket } from 'socket.io-client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 설정
// ============================================

const CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://158.247.210.152:4000',
  // Backend가 사용하는 Supabase 프로젝트 (vyfxrplzhskncigyfkaz)
  // 로컬 .env.local과 다를 수 있으므로 여기서 명시
  SUPABASE_URL: process.env.E2E_SUPABASE_URL || 'https://vyfxrplzhskncigyfkaz.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5ZnhycGx6aHNrbmNpZ3lma2F6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzAxMTMyOSwiZXhwIjoyMDgyNTg3MzI5fQ.CSRg_9dPTxuMMwCSIhyB9Z6Zh4601BRiOy4WAd-yZo0',
  TEST_VIDEO_URL: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  TEST_DURATION_SEC: 30,
  MAX_DEVICES: 5,
  POLL_INTERVAL_MS: 3000,
  TIMEOUT_MS: 120_000, // 2분
};

// .env.local에서 환경변수 로드
function loadEnv(): void {
  const envPaths = [
    path.resolve(__dirname, '../apps/dashboard/.env.local'),
    path.resolve(__dirname, '../.env.local'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      console.log(`[E2E] Loaded env from: ${envPath}`);
      break;
    }
  }
}

// ============================================
// 타입
// ============================================

interface BackendDevice {
  id: string;           // compound: "P00-192.168.50.111:5555"
  serial_number: string; // "192.168.50.111:5555"
  pc_id: string;        // "P00"
  status: string;       // "idle", "IDLE", "RUNNING", etc.
  health_status: string;
}

interface Device {
  deviceId: string;  // compound id from backend (e.g. "P00-192.168.50.111:5555")
  serial: string;    // raw serial (e.g. "192.168.50.111:5555")
  status: string;
  pcId: string;
  dbUuid?: string;   // UUID from devices table (populated in Phase 2)
}

interface JobAssignment {
  id: string;
  job_id: string;
  device_id: string;
  device_serial: string;
  status: string;
  progress_pct: number;
}

interface JobRecord {
  id: string;
  title: string;
  target_url: string;
  duration_sec: number;
}

interface AssignmentResult {
  id: string;
  device_id: string;
  device_serial: string;
  status: string;
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
}

// ============================================
// 유틸리티
// ============================================

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[E2E ${ts}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================
// Dashboard 소켓 연결 (Supabase service_role JWT 사용)
// ============================================

function connectDashboard(): Socket {
  const token = CONFIG.SUPABASE_SERVICE_ROLE_KEY;
  return io(`${CONFIG.BACKEND_URL}/dashboard`, {
    transports: ['websocket'],
    auth: { token },
  });
}

// ============================================
// Phase 1: Backend에서 연결된 디바이스 목록 가져오기
// ============================================

async function checkDevices(): Promise<Device[]> {
  log('Phase 1: Checking connected devices via backend...');

  return new Promise<Device[]>((resolve, reject) => {
    const dashSocket = connectDashboard();
    const deviceMap = new Map<string, BackendDevice>();

    const timeout = setTimeout(() => {
      dashSocket.disconnect();
      reject(new Error('Timeout waiting for device list from backend'));
    }, 15_000);

    // Backend는 dashboard 연결 시 'devices:initial'로 목록을 보내고,
    // 직후 'device:status:update'로 실시간 상태를 갱신함
    dashSocket.on('devices:initial', (data: BackendDevice[]) => {
      for (const d of data) {
        deviceMap.set(d.id, d);
      }
      log(`  Received ${data.length} devices, waiting for status updates...`);
    });

    dashSocket.on(
      'device:status:update',
      (data: { device_id: string; status: string; health_status: string; serial_number?: string; pc_id?: string }) => {
        const existing = deviceMap.get(data.device_id);
        if (existing) {
          existing.status = data.status;
          existing.health_status = data.health_status;
        }
      }
    );

    // heartbeat 주기(10초)를 고려해 status:update를 기다림
    // 모든 디바이스가 갱신되거나 12초 경과 시 진행
    function tryResolve() {
      const allDevices = Array.from(deviceMap.values());
      const onlineDevices = allDevices.filter(
        (d) =>
          d.status !== 'offline' &&
          d.status !== 'DISCONNECTED' &&
          d.status !== 'ERROR'
      );

      if (onlineDevices.length === 0) {
        return false; // 아직 갱신 안 됨
      }

      clearTimeout(timeout);
      dashSocket.disconnect();

      const limited = onlineDevices.slice(0, CONFIG.MAX_DEVICES);
      const devices: Device[] = limited.map((d) => ({
        deviceId: d.id,
        serial: d.serial_number,
        status: d.status,
        pcId: d.pc_id,
      }));

      log(`  Found ${allDevices.length} total, ${onlineDevices.length} online:`);
      for (const d of devices) {
        log(`    - ${d.deviceId} [${d.pcId}] ${d.status}`);
      }

      resolve(devices);
      return true;
    }

    dashSocket.on('device:status:update', () => {
      // 매 업데이트마다 온라인 디바이스 확인
      tryResolve();
    });

    // fallback: 12초 후 강제 평가
    dashSocket.on('connect', () => {
      setTimeout(() => {
        if (tryResolve()) return;
        clearTimeout(timeout);
        dashSocket.disconnect();
        const allDevices = Array.from(deviceMap.values());
        reject(
          new Error(
            `No online devices found (${allDevices.length} total, statuses: ${allDevices.map((d) => d.status).join('/')}). Is the Desktop Agent running?`
          )
        );
      }, 12_000);
    });

    dashSocket.on('connect_error', (err) => {
      clearTimeout(timeout);
      dashSocket.disconnect();
      reject(new Error(`Backend connection failed: ${err.message}`));
    });
  });
}

// ============================================
// Phase 2: 작업 생성 (Supabase 직접)
// ============================================

async function ensureDevicesInDb(
  supabase: SupabaseClient,
  devices: Device[]
): Promise<void> {
  log('  Ensuring devices exist in DB...');

  for (const d of devices) {
    // serial_number으로 기존 디바이스 조회
    const { data: existing } = await supabase
      .from('devices')
      .select('id')
      .eq('serial_number', d.serial)
      .maybeSingle();

    if (existing) {
      d.dbUuid = existing.id;
      log(`    ${d.serial} → existing UUID ${d.dbUuid}`);
    } else {
      // 새 디바이스 삽입 (pc_id는 nullable이므로 생략)
      const { data: inserted, error } = await supabase
        .from('devices')
        .insert({
          serial_number: d.serial,
          name: d.deviceId,
          state: 'IDLE',
          ip_address: d.serial.replace(':5555', ''),
          connection_type: 'wifi',
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to insert device ${d.serial}: ${error.message}`);
      }
      d.dbUuid = inserted.id;
      log(`    ${d.serial} → new UUID ${d.dbUuid}`);
    }
  }
}

async function createJob(
  supabase: SupabaseClient,
  devices: Device[]
): Promise<{ job: JobRecord; assignments: JobAssignment[] }> {
  log('Phase 2: Creating job...');

  // Step 1: devices 테이블에 디바이스 upsert (UUID FK 필요)
  await ensureDevicesInDb(supabase, devices);

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Step 2: jobs 테이블에 삽입
  const jobData = {
    id: jobId,
    title: `[E2E Test] ${now}`,
    target_url: CONFIG.TEST_VIDEO_URL,
    duration_sec: CONFIG.TEST_DURATION_SEC,
    duration_min_pct: 80,
    duration_max_pct: 120,
    prob_like: 0,
    prob_comment: 0,
    prob_playlist: 0,
    script_type: 'youtube-watch-v1',
    is_active: true,
    total_assignments: devices.length,
  };

  const { error: jobError } = await supabase.from('jobs').insert(jobData);
  if (jobError) {
    throw new Error(`Failed to create job: ${jobError.message}`);
  }

  // Step 3: job_assignments 삽입
  // device_id = devices 테이블 UUID (FK), device_serial = raw serial
  const assignmentsData = devices.map((d) => ({
    id: crypto.randomUUID(),
    job_id: jobId,
    device_id: d.dbUuid!,        // UUID from devices table
    device_serial: d.serial,      // raw serial for backend lookup
    status: 'pending',
    progress_pct: 0,
    created_at: now,
  }));

  const { error: assignError } = await supabase
    .from('job_assignments')
    .insert(assignmentsData);

  if (assignError) {
    throw new Error(`Failed to create assignments: ${assignError.message}`);
  }

  const job: JobRecord = {
    id: jobId,
    title: jobData.title,
    target_url: jobData.target_url,
    duration_sec: CONFIG.TEST_DURATION_SEC,
  };

  const assignments: JobAssignment[] = assignmentsData.map((a) => ({
    ...a,
    progress_pct: 0,
  }));

  log(`  Job created: ${jobId} (${assignments.length} assignments)`);
  return { job, assignments };
}

// ============================================
// Phase 3: Socket.IO로 작업 분배
// ============================================

async function distributeJob(
  job: JobRecord,
  assignments: JobAssignment[],
  devices: Device[]
): Promise<void> {
  log('Phase 3: Distributing job via Socket.IO...');

  // UUID → compound device ID 매핑 (backend deviceStates 키 형식)
  const uuidToCompound = new Map<string, string>();
  for (const d of devices) {
    if (d.dbUuid) uuidToCompound.set(d.dbUuid, d.deviceId);
  }

  return new Promise<void>((resolve, reject) => {
    const dashSocket = connectDashboard();

    const timeout = setTimeout(() => {
      dashSocket.disconnect();
      reject(new Error('Socket.IO distribute timeout (15s)'));
    }, 15_000);

    dashSocket.on('connect', () => {
      log(`  Connected to dashboard namespace`);

      // job:distribute 전송
      // device_id는 backend deviceStates 키 형식 (compound ID) 사용
      dashSocket.emit('job:distribute', {
        assignments: assignments.map((a) => ({
          id: a.id,
          device_id: uuidToCompound.get(a.device_id) || a.device_id,
          device_serial: a.device_serial,
        })),
        job: {
          id: job.id,
          title: job.title,
          target_url: job.target_url,
          duration_sec: job.duration_sec,
          duration_min_pct: 80,
          duration_max_pct: 120,
          prob_like: 0,
          prob_comment: 0,
          prob_playlist: 0,
          script_type: 'youtube-watch-v1',
        },
      });

      log(`  Sent job:distribute for ${assignments.length} assignments`);
    });

    // ACK 대기
    dashSocket.on(
      'job:distribute:ack',
      (data: { jobId: string; sentCount: number; totalAssignments: number }) => {
        clearTimeout(timeout);
        log(`  Backend ACK: ${data.sentCount}/${data.totalAssignments} sent`);
        dashSocket.disconnect();

        if (data.sentCount === 0) {
          reject(
            new Error(
              'Backend sent 0 assignments. Workers may not be connected.'
            )
          );
        } else {
          resolve();
        }
      }
    );

    dashSocket.on('connect_error', (err) => {
      clearTimeout(timeout);
      dashSocket.disconnect();
      reject(new Error(`Dashboard socket connection failed: ${err.message}`));
    });
  });
}

// ============================================
// Phase 4: Supabase 폴링으로 상태 모니터링
// ============================================

async function monitorAssignments(
  supabase: SupabaseClient,
  jobId: string,
  assignmentIds: string[]
): Promise<AssignmentResult[]> {
  log('Phase 4: Monitoring assignments...');

  const startTime = Date.now();
  let lastLog = 0;

  while (Date.now() - startTime < CONFIG.TIMEOUT_MS) {
    const { data, error } = await supabase
      .from('job_assignments')
      .select(
        'id, device_id, device_serial, status, progress_pct, started_at, completed_at'
      )
      .in('id', assignmentIds);

    if (error) {
      log(`  Warning: Poll error: ${error.message}`);
      await sleep(CONFIG.POLL_INTERVAL_MS);
      continue;
    }

    const results = (data || []) as AssignmentResult[];
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // 주기적 로그 (5초마다)
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      for (const r of results) {
        const serial = r.device_serial || r.device_id;
        log(
          `  [${elapsed}s] ${serial}: ${r.status} (${r.progress_pct || 0}%)`
        );
      }
    }

    // 모든 할당이 완료 또는 실패인지 확인
    const allDone = results.every((r) =>
      ['completed', 'failed', 'cancelled'].includes(r.status)
    );

    if (allDone && results.length === assignmentIds.length) {
      log(`  [${elapsed}s] All assignments finished`);
      return results;
    }

    await sleep(CONFIG.POLL_INTERVAL_MS);
  }

  // 타임아웃 - 현재 상태 반환
  log(`  Timeout reached (${CONFIG.TIMEOUT_MS / 1000}s)`);
  const { data } = await supabase
    .from('job_assignments')
    .select(
      'id, device_id, device_serial, status, progress_pct, started_at, completed_at'
    )
    .in('id', assignmentIds);

  return (data || []) as AssignmentResult[];
}

// ============================================
// Phase 5: 결과 검증
// ============================================

function verifyResults(results: AssignmentResult[]): boolean {
  log('Phase 5: Results');

  const completed = results.filter((r) => r.status === 'completed');
  const failed = results.filter((r) => r.status === 'failed');
  const pending = results.filter((r) => r.status === 'pending');
  const running = results.filter((r) => r.status === 'running');

  log(`  Completed: ${completed.length}/${results.length}`);
  if (failed.length > 0) {
    log(`  Failed: ${failed.length}/${results.length}`);
    for (const f of failed) {
      log(`    - ${f.device_serial}: failed`);
    }
  }
  if (pending.length > 0) {
    log(`  Still pending: ${pending.length}/${results.length}`);
  }
  if (running.length > 0) {
    log(`  Still running: ${running.length}/${results.length}`);
  }

  // 50% 이상 성공이면 PASS (네트워크/디바이스 이슈 허용)
  const successRate = completed.length / results.length;
  const passed = successRate >= 0.5;

  log('');
  if (passed) {
    log(
      `=== TEST PASSED (${Math.round(successRate * 100)}% success rate) ===`
    );
  } else {
    log(
      `=== TEST FAILED (${Math.round(successRate * 100)}% success rate, need >= 50%) ===`
    );
  }

  return passed;
}

// ============================================
// Cleanup: 테스트 데이터 정리
// ============================================

async function cleanup(
  supabase: SupabaseClient,
  jobId: string
): Promise<void> {
  log('Cleanup: Removing test data...');

  await supabase.from('job_assignments').delete().eq('job_id', jobId);
  await supabase.from('jobs').delete().eq('id', jobId);

  log('  Test data cleaned up');
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log('');
  log('=== E2E Job Distribution Test ===');
  console.log('');

  // 환경변수 로드
  loadEnv();

  const supabaseUrl = CONFIG.SUPABASE_URL;
  const supabaseKey = CONFIG.SUPABASE_SERVICE_ROLE_KEY;

  log(`Using Supabase: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | null = null;
  const shouldCleanup = process.argv.includes('--cleanup');

  try {
    // Phase 1: Backend에서 디바이스 목록 가져오기
    const devices = await checkDevices();

    // Phase 2: 작업 생성
    const { job, assignments } = await createJob(supabase, devices);
    jobId = job.id;

    // Phase 3: 작업 분배 (compound ID 매핑을 위해 devices 전달)
    await distributeJob(job, assignments, devices);

    // Phase 4: 상태 모니터링
    const results = await monitorAssignments(
      supabase,
      job.id,
      assignments.map((a) => a.id)
    );

    // Phase 5: 결과 검증
    const passed = verifyResults(results);

    // Cleanup (옵션)
    if (shouldCleanup && jobId) {
      await cleanup(supabase, jobId);
    }

    process.exit(passed ? 0 : 1);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`FATAL ERROR: ${msg}`);

    if (shouldCleanup && jobId) {
      await cleanup(supabase, jobId).catch(() => {});
    }

    process.exit(1);
  }
}

main();

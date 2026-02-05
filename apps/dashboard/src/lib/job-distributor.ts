import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types
export interface JobConfig {
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
  target_type: 'all_devices' | 'percentage' | 'device_count';
  target_value: number;
}

export interface Device {
  id: string;
  serial_number: string;
  pc_id: string;
}

export interface Assignment {
  id: string;
  job_id: string;
  device_id: string;
  device_serial: string;
  status: string;
  progress_pct: number;
  assigned_at: string;
}

export interface DistributionResult {
  success: boolean;
  job_id: string;
  total_devices: number;
  assigned_devices: number;
  assignments: Assignment[];
  error?: string;
}

// Server-side Supabase client
function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

/**
 * 연결된 idle 기기 조회
 */
export async function getIdleDevices(supabase?: SupabaseClient): Promise<Device[]> {
  const client = supabase || getSupabase();

  const { data: devices, error } = await client
    .from('devices')
    .select('id, serial_number, pc_id')
    .eq('status', 'online')
    .not('last_heartbeat', 'is', null);

  if (error) {
    console.error('[JobDistributor] Failed to fetch idle devices:', error);
    throw new Error('Failed to fetch idle devices');
  }

  return devices || [];
}

/**
 * 목표에 따라 할당 대상 기기 선택
 */
export function selectTargetDevices(
  idleDevices: Device[],
  targetType: 'all_devices' | 'percentage' | 'device_count',
  targetValue: number
): Device[] {
  if (idleDevices.length === 0) {
    return [];
  }

  switch (targetType) {
    case 'percentage':
      const count = Math.ceil((idleDevices.length * targetValue) / 100);
      return idleDevices.slice(0, count);

    case 'device_count':
      return idleDevices.slice(0, Math.min(targetValue, idleDevices.length));

    case 'all_devices':
    default:
      return [...idleDevices];
  }
}

/**
 * Job assignments 생성 (bulk insert)
 */
export async function createAssignments(
  jobId: string,
  devices: Device[],
  supabase?: SupabaseClient
): Promise<Assignment[]> {
  if (devices.length === 0) {
    return [];
  }

  const client = supabase || getSupabase();

  const assignments = devices.map((device) => ({
    job_id: jobId,
    device_id: device.id,
    device_serial: device.serial_number,
    status: 'pending',
    progress_pct: 0,
    assigned_at: new Date().toISOString(),
  }));

  const { data: createdAssignments, error } = await client
    .from('job_assignments')
    .insert(assignments)
    .select();

  if (error) {
    console.error('[JobDistributor] Failed to create assignments:', error);
    throw new Error('Failed to create assignments');
  }

  return createdAssignments || [];
}

/**
 * 작업 분배 메인 함수
 * 1. 연결된 idle 기기 조회
 * 2. 목표에 따라 할당 대상 결정
 * 3. job_assignments 생성 (bulk insert)
 * 4. 결과 반환 (Socket.io 전송은 호출자가 처리)
 */
export async function distributeJob(
  jobConfig: JobConfig,
  supabase?: SupabaseClient
): Promise<DistributionResult> {
  const client = supabase || getSupabase();

  try {
    // 1. 연결된 idle 기기 조회
    const idleDevices = await getIdleDevices(client);

    if (idleDevices.length === 0) {
      return {
        success: false,
        job_id: jobConfig.id,
        total_devices: 0,
        assigned_devices: 0,
        assignments: [],
        error: 'No idle devices available',
      };
    }

    // 2. 목표에 따라 할당 대상 결정
    const targetDevices = selectTargetDevices(
      idleDevices,
      jobConfig.target_type,
      jobConfig.target_value
    );

    // 3. job_assignments 생성
    const assignments = await createAssignments(jobConfig.id, targetDevices, client);

    // 4. jobs 테이블 assigned_count 업데이트
    await client
      .from('jobs')
      .update({
        assigned_count: assignments.length,
        total_assignments: assignments.length,
      })
      .eq('id', jobConfig.id);

    return {
      success: true,
      job_id: jobConfig.id,
      total_devices: idleDevices.length,
      assigned_devices: assignments.length,
      assignments,
    };
  } catch (error) {
    console.error('[JobDistributor] Distribution failed:', error);
    return {
      success: false,
      job_id: jobConfig.id,
      total_devices: 0,
      assigned_devices: 0,
      assignments: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 일시정지된 작업 재개 시 assignment 재분배
 */
export async function resumeJobAssignments(
  jobId: string,
  supabase?: SupabaseClient
): Promise<Assignment[]> {
  const client = supabase || getSupabase();

  // paused 상태의 assignments를 pending으로 복구
  const { data: resumedAssignments, error } = await client
    .from('job_assignments')
    .update({ status: 'pending' })
    .eq('job_id', jobId)
    .eq('status', 'paused')
    .select();

  if (error) {
    console.error('[JobDistributor] Failed to resume assignments:', error);
    throw new Error('Failed to resume assignments');
  }

  return resumedAssignments || [];
}

/**
 * Worker 연결 시 해당 PC의 pending assignments 조회
 */
export async function getPendingAssignmentsForPc(
  pcId: string,
  supabase?: SupabaseClient
): Promise<Array<Assignment & { jobs: JobConfig }>> {
  const client = supabase || getSupabase();

  // 해당 PC에 연결된 기기들의 ID 조회
  const { data: devices, error: devicesError } = await client
    .from('devices')
    .select('id')
    .eq('pc_id', pcId);

  if (devicesError || !devices || devices.length === 0) {
    return [];
  }

  const deviceIds = devices.map((d) => d.id);

  // 해당 기기들의 pending assignments 조회 (job 정보 포함)
  const { data: assignments, error: assignmentsError } = await client
    .from('job_assignments')
    .select(`
      id,
      job_id,
      device_id,
      device_serial,
      status,
      progress_pct,
      assigned_at,
      jobs (
        id,
        title,
        target_url,
        duration_sec,
        duration_min_pct,
        duration_max_pct,
        prob_like,
        prob_comment,
        prob_playlist,
        script_type,
        target_type,
        target_value,
        status
      )
    `)
    .in('device_id', deviceIds)
    .eq('status', 'pending');

  if (assignmentsError) {
    console.error('[JobDistributor] Failed to fetch pending assignments:', assignmentsError);
    return [];
  }

  // 활성 작업의 assignments만 반환
  const result: Array<Assignment & { jobs: JobConfig }> = [];
  for (const a of assignments || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobData = a.jobs as any;
    if (jobData && jobData.status === 'active') {
      result.push({
        id: a.id,
        job_id: a.job_id,
        device_id: a.device_id,
        device_serial: a.device_serial,
        status: a.status,
        progress_pct: a.progress_pct,
        assigned_at: a.assigned_at,
        jobs: jobData as JobConfig,
      });
    }
  }
  return result;
}

/**
 * 특정 기기의 pending assignment 조회 (폴링용)
 */
export async function getNextPendingAssignment(
  deviceId: string,
  supabase?: SupabaseClient
): Promise<(Assignment & { jobs: JobConfig }) | null> {
  const client = supabase || getSupabase();

  const { data: assignment, error } = await client
    .from('job_assignments')
    .select(`
      id,
      job_id,
      device_id,
      device_serial,
      status,
      progress_pct,
      assigned_at,
      jobs (
        id,
        title,
        target_url,
        duration_sec,
        duration_min_pct,
        duration_max_pct,
        prob_like,
        prob_comment,
        prob_playlist,
        script_type,
        target_type,
        target_value,
        status
      )
    `)
    .eq('device_id', deviceId)
    .eq('status', 'pending')
    .order('assigned_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !assignment) {
    return null;
  }

  // 활성 작업인지 확인
  const job = assignment.jobs as unknown as JobConfig & { status: string };
  if (!job || job.status !== 'active') {
    return null;
  }

  return assignment as unknown as Assignment & { jobs: JobConfig };
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

export interface DeviceAnalytics {
  id: string;
  serial_number: string;
  pc_id: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  last_heartbeat: string | null;
  today_completed_count: number;
  today_failed_count: number;
  recent_error_log: string | null;
  current_job?: {
    job_id: string;
    title: string;
    progress_pct: number;
    started_at: string;
  } | null;
  next_pending_job?: {
    job_id: string;
    title: string;
    assigned_at: string;
  } | null;
}

/**
 * GET /api/analytics/devices
 * Get device-centric analytics data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pcId = searchParams.get('pcId');
    const statusFilter = searchParams.get('status');

    const supabase = getSupabaseClient();

    // Get today's start time
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get all devices
    let devicesQuery = supabase
      .from('devices')
      .select('*')
      .order('pc_id', { ascending: true })
      .order('serial_number', { ascending: true });

    if (pcId) {
      devicesQuery = devicesQuery.eq('pc_id', pcId);
    }

    if (statusFilter) {
      devicesQuery = devicesQuery.eq('status', statusFilter);
    }

    const { data: devices, error: devicesError } = await devicesQuery;

    if (devicesError) {
      console.error('Failed to fetch devices:', devicesError);
      return NextResponse.json(
        { error: 'Failed to fetch devices' },
        { status: 500 }
      );
    }

    if (!devices || devices.length === 0) {
      return NextResponse.json({ devices: [] });
    }

    const deviceIds = devices.map(d => d.id);

    // Get today's assignments for these devices
    const { data: assignments, error: assignmentsError } = await supabase
      .from('job_assignments')
      .select(`
        id,
        job_id,
        device_id,
        status,
        progress_pct,
        error_log,
        assigned_at,
        started_at,
        completed_at,
        jobs (
          id,
          title
        )
      `)
      .in('device_id', deviceIds)
      .gte('assigned_at', todayStart.toISOString())
      .order('assigned_at', { ascending: false });

    if (assignmentsError) {
      console.error('Failed to fetch assignments:', assignmentsError);
    }

    // Build device analytics
    const deviceAnalytics: DeviceAnalytics[] = devices.map(device => {
      const deviceAssignments = assignments?.filter(a => a.device_id === device.id) || [];

      // Count today's stats
      const todayCompleted = deviceAssignments.filter(a => a.status === 'completed').length;
      const todayFailed = deviceAssignments.filter(a => a.status === 'failed').length;

      // Get recent error log
      const failedAssignments = deviceAssignments.filter(a => a.status === 'failed' && a.error_log);
      const recentError = failedAssignments.length > 0 ? failedAssignments[0].error_log : null;

      // Get current running job
      const runningAssignment = deviceAssignments.find(a => a.status === 'running');
      // Supabase join may return jobs as object or array depending on relationship type
      // Use unknown cast to handle both cases safely
      const runningJobData = runningAssignment?.jobs as unknown;
      const runningJobTitle = Array.isArray(runningJobData)
        ? (runningJobData[0] as { title?: string })?.title
        : (runningJobData as { title?: string } | null)?.title;
      const currentJob = runningAssignment ? {
        job_id: runningAssignment.job_id,
        title: runningJobTitle || 'Unknown',
        progress_pct: runningAssignment.progress_pct || 0,
        started_at: runningAssignment.started_at || runningAssignment.assigned_at
      } : null;

      // Get next pending job
      const pendingAssignments = deviceAssignments.filter(a => a.status === 'pending');
      const pendingJobData = pendingAssignments[0]?.jobs as unknown;
      const pendingJobTitle = Array.isArray(pendingJobData)
        ? (pendingJobData[0] as { title?: string })?.title
        : (pendingJobData as { title?: string } | null)?.title;
      const nextPending = pendingAssignments.length > 0 ? {
        job_id: pendingAssignments[0].job_id,
        title: pendingJobTitle || 'Unknown',
        assigned_at: pendingAssignments[0].assigned_at
      } : null;

      return {
        id: device.id,
        serial_number: device.serial_number,
        pc_id: device.pc_id,
        status: device.status,
        last_heartbeat: device.last_heartbeat,
        today_completed_count: todayCompleted,
        today_failed_count: todayFailed,
        recent_error_log: recentError,
        current_job: currentJob,
        next_pending_job: nextPending
      };
    });

    return NextResponse.json({ devices: deviceAnalytics });

  } catch (error) {
    console.error('Device analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

export interface JobAnalytics {
  id: string;
  title: string;
  target_url: string;
  created_at: string;
  is_active: boolean;
  total_assignments: number;
  completed_count: number;
  running_count: number;
  pending_count: number;
  failed_count: number;
  avg_duration_sec: number;
  running_devices: Array<{
    device_id: string;
    serial_number: string;
    progress_pct: number;
  }>;
}

/**
 * GET /api/analytics/jobs
 * Get job-centric analytics data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const supabase = getSupabaseClient();

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get jobs with aggregated assignment stats
    let query = supabase
      .from('jobs')
      .select(`
        id,
        title,
        target_url,
        created_at,
        is_active,
        total_assignments
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      console.error('Failed to fetch jobs:', jobsError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    // Get assignment stats for each job
    const jobIds = jobs.map(j => j.id);

    const { data: assignments, error: assignmentsError } = await supabase
      .from('job_assignments')
      .select(`
        id,
        job_id,
        device_id,
        status,
        progress_pct,
        final_duration_sec,
        devices (
          serial_number
        )
      `)
      .in('job_id', jobIds);

    if (assignmentsError) {
      console.error('Failed to fetch assignments:', assignmentsError);
    }

    // Aggregate stats per job
    const jobAnalytics: JobAnalytics[] = jobs.map(job => {
      const jobAssignments = assignments?.filter(a => a.job_id === job.id) || [];

      const completed = jobAssignments.filter(a => a.status === 'completed');
      const running = jobAssignments.filter(a => a.status === 'running');
      const pending = jobAssignments.filter(a => a.status === 'pending');
      const failed = jobAssignments.filter(a => a.status === 'failed');

      const avgDuration = completed.length > 0
        ? completed.reduce((sum, a) => sum + (a.final_duration_sec || 0), 0) / completed.length
        : 0;

      const runningDevices = running.map(a => ({
        device_id: a.device_id,
        serial_number: (a.devices as any)?.serial_number || 'Unknown',
        progress_pct: a.progress_pct || 0
      }));

      return {
        id: job.id,
        title: job.title,
        target_url: job.target_url,
        created_at: job.created_at,
        is_active: job.is_active,
        total_assignments: job.total_assignments || jobAssignments.length,
        completed_count: completed.length,
        running_count: running.length,
        pending_count: pending.length,
        failed_count: failed.length,
        avg_duration_sec: Math.round(avgDuration),
        running_devices: runningDevices
      };
    });

    return NextResponse.json({ jobs: jobAnalytics });

  } catch (error) {
    console.error('Job analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

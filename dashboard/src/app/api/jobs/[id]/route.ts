import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key);
}

// GET /api/jobs/:id - 단일 작업 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id } = await params;

    // 작업 조회
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Assignment 통계 조회
    const { data: assignments, error: assignError } = await supabase
      .from('job_assignments')
      .select('id, device_id, device_serial, status, progress_pct, started_at, completed_at, error_log')
      .eq('job_id', id)
      .order('created_at', { ascending: true });

    if (assignError) {
      console.error('[API] Assignments query error:', assignError);
    }

    // 상태별 통계 계산
    const statusCounts = {
      pending: 0,
      paused: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    (assignments || []).forEach((a) => {
      if (a.status in statusCounts) {
        statusCounts[a.status as keyof typeof statusCounts]++;
      }
    });

    return NextResponse.json({
      job: {
        ...job,
        stats: statusCounts,
        total_assigned: (assignments || []).length,
      },
      assignments: assignments || [],
    });
  } catch (error) {
    console.error('[API] Job GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/jobs/:id - 작업 수정 (일시정지/재개 포함)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id } = await params;
    const body = await request.json();

    const { status, title, priority } = body;

    // 작업 존재 여부 확인
    const { data: existingJob, error: checkError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (checkError || !existingJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title) {
      updateData.title = title;
    }

    // Priority 변경 처리
    if (typeof priority === 'boolean') {
      updateData.priority = priority;
    }

    // 상태 변경 처리
    if (status && status !== existingJob.status) {
      const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      updateData.status = status;

      // 일시정지: pending assignments를 paused로 변경
      if (status === 'paused') {
        await supabase
          .from('job_assignments')
          .update({ status: 'paused' })
          .eq('job_id', id)
          .eq('status', 'pending');
      }

      // 재개: paused assignments를 pending으로 복구
      if (status === 'active' && existingJob.status === 'paused') {
        await supabase
          .from('job_assignments')
          .update({ status: 'pending' })
          .eq('job_id', id)
          .eq('status', 'paused');
      }

      // 취소: pending/paused assignments를 cancelled로 변경
      if (status === 'cancelled') {
        await supabase
          .from('job_assignments')
          .update({ status: 'cancelled' })
          .eq('job_id', id)
          .in('status', ['pending', 'paused']);
      }
    }

    // 작업 업데이트
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[API] Job update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update job' },
        { status: 500 }
      );
    }

    // 업데이트된 통계 조회
    const { data: assignments } = await supabase
      .from('job_assignments')
      .select('status')
      .eq('job_id', id);

    const statusCounts = {
      pending: 0,
      paused: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    (assignments || []).forEach((a) => {
      if (a.status in statusCounts) {
        statusCounts[a.status as keyof typeof statusCounts]++;
      }
    });

    return NextResponse.json({
      success: true,
      job: {
        ...updatedJob,
        stats: statusCounts,
        total_assigned: (assignments || []).length,
      },
    });
  } catch (error) {
    console.error('[API] Job PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/jobs/:id - 작업 삭제 (pending assignments도 함께)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    const { id } = await params;

    // 작업 존재 여부 확인
    const { data: existingJob, error: checkError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (checkError || !existingJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // 실행 중인 assignment가 있는지 확인
    const { data: runningAssignments } = await supabase
      .from('job_assignments')
      .select('id')
      .eq('job_id', id)
      .eq('status', 'running');

    if (runningAssignments && runningAssignments.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete job with running assignments',
          running_count: runningAssignments.length,
        },
        { status: 400 }
      );
    }

    // pending/paused assignments 삭제
    const { error: deleteAssignError } = await supabase
      .from('job_assignments')
      .delete()
      .eq('job_id', id)
      .in('status', ['pending', 'paused', 'cancelled']);

    if (deleteAssignError) {
      console.error('[API] Assignment delete error:', deleteAssignError);
    }

    // 완료/실패 assignments는 보존하고, 작업은 cancelled로 마킹
    const { data: remainingAssignments } = await supabase
      .from('job_assignments')
      .select('id')
      .eq('job_id', id);

    if (remainingAssignments && remainingAssignments.length > 0) {
      // 히스토리가 있으면 cancelled로 마킹
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        console.error('[API] Job cancel error:', updateError);
      }

      return NextResponse.json({
        success: true,
        message: 'Job cancelled (history preserved)',
        deleted_assignments: 0,
        preserved_assignments: remainingAssignments.length,
      });
    }

    // 히스토리가 없으면 작업 자체 삭제
    const { error: deleteJobError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);

    if (deleteJobError) {
      console.error('[API] Job delete error:', deleteJobError);
      return NextResponse.json(
        { error: 'Failed to delete job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job deleted',
    });
  } catch (error) {
    console.error('[API] Job DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

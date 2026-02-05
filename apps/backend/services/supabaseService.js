/**
 * Supabase Service - Centralized DB Operations
 *
 * Handles all database interactions for:
 * - Device management (UPSERT, status updates)
 * - Job management (creation, distribution, status)
 * - Comment pool (fetch, mark as used)
 * - Channel management
 */

// Load env from root .env (ensure it's loaded before createClient)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail fast: 환경 변수가 없으면 즉시 종료
if (!supabaseUrl || !supabaseKey) {
  const envPath = path.join(__dirname, '../../.env');
  console.error('[SupabaseService] FATAL: Missing required environment variables');
  console.error('[SupabaseService] NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'set' : 'MISSING');
  console.error('[SupabaseService] SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'set' : 'MISSING');
  console.error('[SupabaseService] Looked for .env at:', envPath);
  console.error('[SupabaseService] Current working directory:', process.cwd());
  throw new Error(
    `Supabase configuration missing. ` +
    `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'set' : 'MISSING'}, ` +
    `SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? 'set' : 'MISSING'}. ` +
    `Ensure .env file exists at: ${envPath}`
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// =============================================
// Device Operations
// =============================================

/**
 * UPSERT device on heartbeat
 * @param {Object} device - Device info from heartbeat
 * @param {string} device.serial - Serial number (unique key)
 * @param {string} device.name - Device name (P01-001)
 * @param {string} device.pcId - PC code (P01)
 * @param {string} device.ip - IP address
 * @param {string} device.status - Device status (idle, busy, offline)
 * @returns {Object} - Upserted device record
 */
async function upsertDevice(device) {
  const { serial, name, pcId, ip, status = 'idle', slotNum } = device;

  if (!serial || serial === 'Empty' || serial === '-') {
    return null;
  }

  const deviceData = {
    serial_number: serial,
    pc_id: name || `${pcId}-${String(slotNum).padStart(3, '0')}`,
    status: status,
    ip_address: ip || null,
    last_seen_at: new Date().toISOString(),
    connection_info: {
      pcCode: pcId,
      slotNum: slotNum,
      adbConnected: status !== 'offline'
    }
  };

  const { data, error } = await supabase
    .from('devices')
    .upsert(deviceData, {
      onConflict: 'serial_number',
      ignoreDuplicates: false
    })
    .select('id, serial_number, pc_id, status')
    .single();

  if (error) {
    console.error(`[SupabaseService] Device upsert error (${serial}):`, error.message);
    return null;
  }

  return data;
}

/**
 * Batch UPSERT devices from heartbeat
 * @param {Array} devices - Array of device info
 * @param {string} pcId - PC code (P01)
 * @returns {Object} - Summary of upserted devices
 */
async function upsertDevicesBatch(devices, pcId) {
  const results = {
    upserted: 0,
    failed: 0,
    skipped: 0
  };

  for (const device of devices) {
    if (!device.serial || device.serial === 'Empty' || device.serial === '-') {
      results.skipped++;
      continue;
    }

    const result = await upsertDevice({
      serial: device.serial,
      name: device.name || device.deviceName || device.slotId,
      pcId: device.pcId || pcId,
      ip: device.ip,
      status: device.status,
      slotNum: device.slotNum
    });

    if (result) {
      results.upserted++;
    } else {
      results.failed++;
    }
  }

  return results;
}

/**
 * Mark devices as offline for a PC
 * @param {string} pcId - PC code
 * @param {Array} onlineSerials - List of currently online serials
 */
async function markOfflineDevices(pcId, onlineSerials) {
  // Get all devices for this PC that are not in the online list
  const { data: allDevices } = await supabase
    .from('devices')
    .select('id, serial_number')
    .like('pc_id', `${pcId}%`);

  if (!allDevices) return;

  const onlineSet = new Set(onlineSerials);

  for (const device of allDevices) {
    if (!onlineSet.has(device.serial_number)) {
      await supabase
        .from('devices')
        .update({
          status: 'offline'
          // Note: last_heartbeat_at removed - column doesn't exist in schema
        })
        .eq('id', device.id);
    }
  }
}

/**
 * Get device by serial number
 * @param {string} serial - Serial number
 * @returns {Object|null} - Device record
 */
async function getDeviceBySerial(serial) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('serial_number', serial)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get idle devices
 * @param {number} limit - Max devices to return
 * @returns {Array} - List of idle devices
 */
async function getIdleDevices(limit = 100) {
  const { data, error } = await supabase
    .from('devices')
    .select('id, serial_number, pc_id, ip_address')
    .eq('status', 'idle')
    .not('last_seen_at', 'is', null)
    .limit(limit);

  if (error) {
    console.error('[SupabaseService] Get idle devices error:', error.message);
    return [];
  }

  return data || [];
}

// =============================================
// Job Operations
// =============================================

/**
 * Get next pending job with priority ordering
 * @returns {Object|null} - Next job to process
 */
async function getNextPendingJob() {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'active')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows
    console.error('[SupabaseService] Get pending job error:', error.message);
    return null;
  }

  return data;
}

/**
 * Get pending assignments for a job
 * @param {string} jobId - Job ID
 * @returns {Array} - List of pending assignments
 */
async function getPendingAssignments(jobId) {
  const { data, error } = await supabase
    .from('job_assignments')
    .select(`
      id,
      job_id,
      device_id,
      device_serial,
      status
    `)
    .eq('job_id', jobId)
    .eq('status', 'pending');

  if (error) {
    console.error('[SupabaseService] Get pending assignments error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update job status
 * @param {string} jobId - Job ID
 * @param {string} status - New status (active, paused, completed, cancelled)
 */
async function updateJobStatus(jobId, status) {
  const { error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', jobId);

  if (error) {
    console.error('[SupabaseService] Update job status error:', error.message);
    return false;
  }

  return true;
}

/**
 * Update assignment status
 * @param {string} assignmentId - Assignment ID
 * @param {string} status - New status
 * @param {Object} extra - Extra fields to update
 */
async function updateAssignmentStatus(assignmentId, status, extra = {}) {
  const updateData = {
    status,
    ...extra
  };

  if (status === 'running') {
    updateData.started_at = new Date().toISOString();
  } else if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('job_assignments')
    .update(updateData)
    .eq('id', assignmentId);

  if (error) {
    console.error('[SupabaseService] Update assignment status error:', error.message);
    return false;
  }

  return true;
}

/**
 * Create job with optional comments
 * @param {Object} jobData - Job data
 * @param {Array} comments - Optional array of comment strings
 * @returns {Object} - Created job with assignment count
 */
async function createJobWithComments(jobData, comments = []) {
  // 1. Create the job
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert(jobData)
    .select()
    .single();

  if (jobError) {
    console.error('[SupabaseService] Create job error:', jobError.message);
    throw new Error(`Failed to create job: ${jobError.message}`);
  }

  // 2. Insert comments if provided
  let commentCount = 0;
  if (comments && comments.length > 0) {
    const commentRecords = comments
      .filter(c => c && c.trim())
      .map(content => ({
        job_id: job.id,
        content: content.trim(),
        is_used: false
      }));

    if (commentRecords.length > 0) {
      const { data: insertedComments, error: commentError } = await supabase
        .from('comments')
        .insert(commentRecords)
        .select();

      if (commentError) {
        console.warn('[SupabaseService] Comments insert warning:', commentError.message);
      } else {
        commentCount = insertedComments?.length || 0;
      }
    }
  }

  return { job, commentCount };
}

// =============================================
// Comment Operations
// =============================================

/**
 * Get and mark a comment as used (atomic operation)
 * @param {string} jobId - Job ID
 * @param {string} deviceId - Device ID using the comment
 * @returns {Object|null} - Comment content or null
 */
async function getAndUseComment(jobId, deviceId) {
  // Try to use the DB function first
  try {
    const { data, error } = await supabase.rpc('get_and_use_comment', {
      p_job_id: jobId,
      p_device_id: deviceId
    });

    if (error) {
      // Function might not exist, use fallback
      if (error.code === 'PGRST202') {
        return await getAndUseCommentFallback(jobId, deviceId);
      }
      console.error('[SupabaseService] Get comment RPC error:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return {
      id: data[0].comment_id,
      content: data[0].comment_content
    };
  } catch (err) {
    return await getAndUseCommentFallback(jobId, deviceId);
  }
}

/**
 * Fallback for getting comment without DB function
 * Atomic update: is_used=false 조건과 함께 업데이트하여 TOCTOU 레이스 방지
 */
async function getAndUseCommentFallback(jobId, deviceId) {
  // Atomic operation: UPDATE with WHERE is_used=false and RETURNING
  // 가장 오래된 미사용 코멘트를 찾아 사용 처리 (단일 쿼리로 원자적 처리)
  const { data: updatedComment, error } = await supabase
    .from('comments')
    .update({
      is_used: true,
      used_by_device_id: deviceId,
      used_at: new Date().toISOString()
    })
    .eq('job_id', jobId)
    .eq('is_used', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .select('id, content')
    .single();

  if (error) {
    // PGRST116: No rows found (모든 코멘트가 사용됨)
    if (error.code === 'PGRST116') return null;
    console.error('[SupabaseService] Get comment fallback error:', error.message);
    return null;
  }

  return updatedComment;
}

/**
 * Get unused comment count for a job
 * @param {string} jobId - Job ID
 * @returns {number} - Count of unused comments
 */
async function getUnusedCommentCount(jobId) {
  const { count, error } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('is_used', false);

  if (error) return 0;
  return count || 0;
}

// =============================================
// Channel Operations
// =============================================

/**
 * Get or create channel
 * @param {Object} channelData - Channel data
 * @returns {Object} - Channel record
 */
async function getOrCreateChannel(channelData) {
  const { channel_id, channel_name, channel_url, ...defaults } = channelData;

  // Check if exists
  const { data: existing } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', channel_id)
    .single();

  if (existing) {
    // Update and reactivate if needed, return the updated row
    const { data: updatedChannel, error: updateError } = await supabase
      .from('channels')
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
        ...defaults
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      console.error('[SupabaseService] Update channel error:', updateError.message);
      // 업데이트 실패 시 기존 데이터라도 반환
      return existing;
    }

    return updatedChannel;
  }

  // Create new
  const { data: newChannel, error } = await supabase
    .from('channels')
    .insert({
      channel_id,
      channel_name,
      channel_url,
      is_active: true,
      ...defaults
    })
    .select()
    .single();

  if (error) {
    console.error('[SupabaseService] Create channel error:', error.message);
    throw new Error(`Failed to create channel: ${error.message}`);
  }

  return newChannel;
}

/**
 * Get active channels that need checking
 * @returns {Array} - Channels to check
 */
async function getChannelsToCheck() {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('is_active', true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`);

  if (error) {
    console.error('[SupabaseService] Get channels to check error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update channel after check
 * @param {string} channelId - Channel ID
 * @param {string} lastVideoId - Last video ID found
 */
async function updateChannelLastCheck(channelId, lastVideoId = null) {
  const updateData = {
    last_checked_at: new Date().toISOString()
  };

  if (lastVideoId) {
    updateData.last_video_id = lastVideoId;
  }

  await supabase
    .from('channels')
    .update(updateData)
    .eq('id', channelId);
}

// =============================================
// Workflow Operations (C2 아키텍처)
// =============================================

/**
 * 워크플로우 목록 조회
 * @param {boolean} activeOnly - 활성 워크플로우만 조회
 */
async function getWorkflows(activeOnly = true) {
  let query = supabase
    .from('workflows')
    .select('*')
    .order('name');
  
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[Supabase] getWorkflows error:', error.message);
    throw error;
  }
  
  return data || [];
}

/**
 * 워크플로우 조회
 * @param {string} workflowId - 워크플로우 ID
 */
async function getWorkflow(workflowId) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();
  
  if (error) {
    console.error('[Supabase] getWorkflow error:', error.message);
    return null;
  }
  
  return data;
}

/**
 * 워크플로우 실행 생성
 * @param {Object} execution - 실행 정보
 */
async function createWorkflowExecution(execution) {
  const { data, error } = await supabase
    .from('workflow_executions')
    .insert({
      execution_id: execution.executionId,
      workflow_id: execution.workflowId,
      workflow_version: execution.version,
      device_ids: execution.deviceIds,
      node_ids: execution.nodeIds || [],
      params: execution.params || {},
      status: 'pending',
      total_devices: execution.deviceIds?.length || 0,
      triggered_by: execution.triggeredBy,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Supabase] createWorkflowExecution error:', error.message);
    throw error;
  }
  
  return data;
}

/**
 * 워크플로우 실행 상태 업데이트
 * @param {string} executionId - 실행 ID
 * @param {Object} updates - 업데이트 내용
 */
async function updateWorkflowExecution(executionId, updates) {
  const { data, error } = await supabase
    .from('workflow_executions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('execution_id', executionId)
    .select()
    .single();
  
  if (error) {
    console.error('[Supabase] updateWorkflowExecution error:', error.message);
    throw error;
  }
  
  return data;
}

/**
 * 워크플로우 실행 시작
 * @param {string} executionId - 실행 ID
 */
async function startWorkflowExecution(executionId) {
  return updateWorkflowExecution(executionId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });
}

/**
 * 워크플로우 실행 완료
 * @param {string} executionId - 실행 ID
 * @param {boolean} hasFailures - 실패 디바이스 있음
 */
async function completeWorkflowExecution(executionId, hasFailures = false) {
  return updateWorkflowExecution(executionId, {
    status: hasFailures ? 'partial' : 'completed',
    completed_at: new Date().toISOString(),
  });
}

/**
 * 워크플로우 디바이스 완료 카운트 증가
 * @param {string} executionId - 실행 ID
 */
async function incrementExecutionCompleted(executionId) {
  const { data, error } = await supabase.rpc('increment_workflow_completed', {
    p_execution_id: executionId,
  });
  
  if (error) {
    // RPC가 없으면 직접 업데이트
    const { data: current } = await supabase
      .from('workflow_executions')
      .select('completed_devices')
      .eq('execution_id', executionId)
      .single();
    
    if (current) {
      await updateWorkflowExecution(executionId, {
        completed_devices: (current.completed_devices || 0) + 1,
      });
    }
  }
  
  return data;
}

/**
 * 워크플로우 디바이스 실패 카운트 증가
 * @param {string} executionId - 실행 ID
 */
async function incrementExecutionFailed(executionId) {
  const { data: current } = await supabase
    .from('workflow_executions')
    .select('failed_devices')
    .eq('execution_id', executionId)
    .single();
  
  if (current) {
    await updateWorkflowExecution(executionId, {
      failed_devices: (current.failed_devices || 0) + 1,
    });
  }
}

// =============================================
// Execution Log Operations
// =============================================

/**
 * 실행 로그 삽입
 * @param {Object} log - 로그 정보
 */
async function insertExecutionLog(log) {
  const { data, error } = await supabase
    .from('execution_logs')
    .insert({
      device_id: log.deviceId,
      workflow_id: log.workflowId,
      execution_id: log.executionId,
      step_id: log.stepId,
      level: log.level || 'info',
      status: log.status,
      message: log.message,
      details: log.details || {},
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Supabase] insertExecutionLog error:', error.message);
    // 로그 실패는 치명적이지 않음
    return null;
  }
  
  return data;
}

/**
 * 실행 로그 조회
 * @param {Object} options - 조회 옵션
 */
async function getExecutionLogs(options = {}) {
  const { deviceId, workflowId, executionId, level, limit = 100, offset = 0 } = options;
  
  let query = supabase
    .from('execution_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (deviceId) query = query.eq('device_id', deviceId);
  if (workflowId) query = query.eq('workflow_id', workflowId);
  if (executionId) query = query.eq('execution_id', executionId);
  if (level) query = query.eq('level', level);
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[Supabase] getExecutionLogs error:', error.message);
    throw error;
  }
  
  return data || [];
}

// =============================================
// Device State Operations (Supabase RPC)
// =============================================

/**
 * 디바이스 상태 업데이트 (RPC 함수 호출)
 * @param {string} deviceId - 디바이스 ID
 * @param {string} newState - 새 상태
 * @param {string} trigger - 트리거
 * @param {Object} options - 추가 옵션
 */
async function updateDeviceStateRpc(deviceId, newState, trigger, options = {}) {
  const { data, error } = await supabase.rpc('update_device_state', {
    p_device_id: deviceId,
    p_new_state: newState,
    p_trigger: trigger,
    p_workflow_id: options.workflowId || null,
    p_job_id: options.jobId || null,
    p_error_message: options.errorMessage || null,
    p_metadata: options.metadata || {},
  });
  
  if (error) {
    console.error('[Supabase] updateDeviceStateRpc error:', error.message);
    throw error;
  }
  
  return data;
}

/**
 * 디바이스 상태 카운트 조회
 */
async function getDeviceStateCounts() {
  const { data, error } = await supabase.rpc('get_device_state_counts');
  
  if (error) {
    console.error('[Supabase] getDeviceStateCounts error:', error.message);
    throw error;
  }
  
  return data || [];
}

// =============================================
// Export
// =============================================

module.exports = {
  supabase,

  // Device operations
  upsertDevice,
  upsertDevicesBatch,
  markOfflineDevices,
  getDeviceBySerial,
  getIdleDevices,

  // Job operations
  getNextPendingJob,
  getPendingAssignments,
  updateJobStatus,
  updateAssignmentStatus,
  createJobWithComments,

  // Comment operations
  getAndUseComment,
  getUnusedCommentCount,

  // Channel operations
  getOrCreateChannel,
  getChannelsToCheck,
  updateChannelLastCheck,

  // Workflow operations (C2)
  getWorkflows,
  getWorkflow,
  createWorkflowExecution,
  updateWorkflowExecution,
  startWorkflowExecution,
  completeWorkflowExecution,
  incrementExecutionCompleted,
  incrementExecutionFailed,

  // Execution log operations
  insertExecutionLog,
  getExecutionLogs,

  // Device state operations
  updateDeviceStateRpc,
  getDeviceStateCounts,
};
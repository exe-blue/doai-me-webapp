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
  updateChannelLastCheck
};

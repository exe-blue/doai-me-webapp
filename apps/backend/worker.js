/**
 * PC Worker v5.2 - DoAi.me Device Farm (Secure)
 *
 * Main worker process that:
 * - Listens for jobs from Supabase
 * - Deploys jobs to Android devices via ADB
 * - Collects evidence and uploads to Supabase Storage
 *
 * Implements all 4 patches from WORKER_V51_PATCH.md
 */

const { createClient } = require('@supabase/supabase-js');
const ADBController = require('./adb-controller');
const EvidenceUploader = require('./evidence-uploader');

// Configuration
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  // SERVICE_ROLE_KEY: 서버 전용 (RLS 우회) - 디바이스에 전송 금지!
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
  // ANON_KEY: 모바일 봇용 (RLS 적용) - 디바이스에 안전하게 전송 가능
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  workerId: process.env.WORKER_ID || 'worker-1',
  deviceSerial: process.env.DEVICE_SERIAL || 'AUTO', // AUTO = auto-detect single device
  botScriptPath: process.env.BOT_SCRIPT_PATH || '../mobile-agent/bot.js',
  pollInterval: Number.parseInt(process.env.POLL_INTERVAL) || 5000, // 5 seconds
  maxConcurrentJobs: Number.parseInt(process.env.MAX_CONCURRENT_JOBS) || 1
};

class PCWorker {
  constructor(config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.uploader = new EvidenceUploader(config.supabaseUrl, config.supabaseKey);
    this.activeJobs = new Map(); // jobId -> { device, startTime }
    this.isRunning = false;
    this.syncInterval = null; // Store interval ID for cleanup
  }

  /**
   * Start worker
   */
  async start() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  PC Worker v5.2 - DoAi.me Device Farm (Secure)            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Worker ID: ${this.config.workerId}`);
    console.log(`Supabase URL: ${this.config.supabaseUrl}`);
    console.log(`Bot Script: ${this.config.botScriptPath}`);
    console.log(`Poll Interval: ${this.config.pollInterval}ms`);
    console.log('');

    // 보안 검증: 필수 키 확인
    console.log('[Security] Environment Validation:');
    console.log(`  SERVICE_ROLE_KEY: ${this.config.supabaseKey ? '✓ Loaded (server-only)' : '✗ MISSING'}`);
    console.log(`  ANON_KEY: ${this.config.supabaseAnonKey ? '✓ Loaded (device-safe)' : '⚠️ MISSING - devices cannot call Supabase'}`);
    console.log('');

    // Detect and initialize devices
    await this.detectDevices();

    // Initial device telemetry sync (BE-02)
    await this.scanAndSync();

    // Schedule periodic telemetry sync (every 5 minutes)
    // Store interval ID for cleanup in stop()
    this.syncInterval = setInterval(() => {
      this.scanAndSync().catch(error => {
        console.error('[Telemetry] Sync failed:', error.message);
      });
    }, 300000); // 5 minutes

    // Start job polling
    this.isRunning = true;
    this.startJobPolling();

    console.log('✅ Worker started - Polling for jobs...');
    console.log('');
  }

  /**
   * Stop worker
   */
  async stop() {
    console.log('🛑 Stopping worker...');
    this.isRunning = false;
    
    // Clear the telemetry sync interval to prevent continued executions and leaks
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[Telemetry] Sync interval cleared');
    }
  }

  /**
   * Detect connected Android devices
   */
  async detectDevices() {
    console.log('[Devices] Detecting connected devices...');

    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    try {
      const { stdout } = await execPromise('adb devices');
      const lines = stdout.split('\n').filter(line => line.includes('\tdevice'));

      if (lines.length === 0) {
        throw new Error('No Android devices connected. Please connect devices and enable USB debugging.');
      }

      this.devices = lines.map(line => {
        const [serial] = line.split('\t');
        return {
          serial: serial.trim(),
          status: 'idle',
          adb: new ADBController(serial.trim())
        };
      });

      console.log(`[Devices] Found ${this.devices.length} device(s):`);
      this.devices.forEach(device => {
        console.log(`  - ${device.serial}`);
      });

      // If AUTO mode and only 1 device, select it
      if (this.config.deviceSerial === 'AUTO') {
        if (this.devices.length === 1) {
          this.config.deviceSerial = this.devices[0].serial;
          console.log(`[Devices] Auto-selected: ${this.config.deviceSerial}`);
        } else {
          console.log(`[Devices] Multiple devices found. Set DEVICE_SERIAL env var to specify.`);
        }
      }

    } catch (error) {
      throw new Error(`Device detection failed: ${error.message}`);
    }
  }

  /**
   * Get idle device
   */
  getIdleDevice() {
    return this.devices.find(d => d.status === 'idle');
  }

  /**
   * Start polling for jobs
   */
  startJobPolling() {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        // Check if we can accept more jobs
        if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
          // console.log('[Poll] Max concurrent jobs reached, waiting...');
          setTimeout(poll, this.config.pollInterval);
          return;
        }

        // Check for idle device
        const device = this.getIdleDevice();
        if (!device) {
          // console.log('[Poll] No idle devices available');
          setTimeout(poll, this.config.pollInterval);
          return;
        }

        // Fetch pending job
        const job = await this.fetchPendingJob();

        if (job) {
          console.log(`[Job] New job received: ${job.id}`);
          // Process job asynchronously
          this.processJob(job, device).catch(error => {
            console.error(`[Job] Processing failed: ${error.message}`);
          });
        }

      } catch (error) {
        console.error(`[Poll] Error: ${error.message}`);
      }

      // Schedule next poll
      setTimeout(poll, this.config.pollInterval);
    };

    // Start polling
    poll();
  }

  /**
   * Fetch pending job from Supabase
   */
  async fetchPendingJob() {
    try {
      // Query for pending jobs
      const { data, error } = await this.supabase
        .from('job_assignments')
        .select(`
          id,
          job_id,
          device_id,
          status,
          jobs (
            id,
            title,
            keyword,
            duration_sec,
            target_url,
            script_type,
            duration_min_pct,
            duration_max_pct,
            prob_like,
            prob_comment,
            prob_playlist
          )
        `)
        .eq('status', 'pending')
        .is('device_id', null) // Not assigned to any device yet
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      return data;

    } catch (error) {
      if (error.code === 'PGRST116') {
        return null; // No pending jobs
      }
      throw error;
    }
  }

  /**
   * Process job
   */
  async processJob(assignment, device) {
    const jobId = assignment.job_id;
    const assignmentId = assignment.id;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📋 Processing Job: ${assignment.jobs.title}`);
    console.log(`   Assignment ID: ${assignmentId}`);
    console.log(`   Device: ${device.serial}`);
    console.log('═══════════════════════════════════════════════════════════');

    // Mark device as busy
    device.status = 'busy';
    this.activeJobs.set(jobId, { device, startTime: Date.now() });

    try {
      // Step 1: Claim job (with atomic conditional update to prevent race conditions)
      console.log('[1/7] Claiming job...');
      const claimResult = await this.claimJob(assignmentId, device.serial);
      
      // Check if we actually claimed the job (another worker might have claimed it first)
      if (!claimResult.claimed) {
        console.log('[1/7] Job was claimed by another worker, skipping...');
        return;  // Exit early without marking as failed
      }

      // Step 2: Deploy script (hash-based)
      console.log('[2/7] Deploying script...');
      await device.adb.deployScriptIfNeeded(
        this.config.botScriptPath,
        '/sdcard/bot.js'
      );

      // Step 3: Deploy job config
      console.log('[3/7] Deploying job config...');
      const jobParams = {
        job_id: jobId,
        assignment_id: assignmentId,
        keyword: assignment.jobs.keyword || assignment.jobs.title,  // fallback to title
        target_title: assignment.jobs.title,
        duration_sec: assignment.jobs.duration_sec || 60,  // default 60s
        duration_min_pct: assignment.jobs.duration_min_pct,
        duration_max_pct: assignment.jobs.duration_max_pct,
        base_duration_sec: assignment.jobs.duration_sec || 60,
        prob_like: assignment.jobs.prob_like,
        prob_comment: assignment.jobs.prob_comment,
        prob_subscribe: assignment.jobs.prob_playlist,
        // 보안: ANON_KEY만 전송 (RLS 적용됨), SERVICE_ROLE_KEY 절대 전송 금지!
        supabase_url: this.config.supabaseUrl,
        supabase_anon_key: this.config.supabaseAnonKey
        // ⚠️ supabase_key (SERVICE_ROLE_KEY) 제거됨 - 보안 취약점 수정
      };

      await device.adb.deployJobConfig(jobParams);

      // Step 4: Execute bot
      console.log('[4/7] Executing bot.js...');
      await device.adb.executeScript('/sdcard/bot.js');

      // Step 5: Wait for completion
      console.log('[5/7] Waiting for completion...');
      const completionData = await device.adb.waitForCompletion(jobId, 300); // 5min max

      if (completionData.status !== 'success') {
        throw new Error(`Job failed: ${completionData.error}`);
      }

      // Step 6: Retrieve evidence
      console.log('[6/7] Retrieving evidence...');
      const evidencePath = await device.adb.retrieveEvidence(jobId);

      // Step 7: Upload evidence
      console.log('[7/7] Uploading evidence...');
      const screenshotUrl = await this.uploader.processEvidence(
        evidencePath,
        device.serial,
        jobId,
        assignmentId
      );

      console.log('');
      console.log('✅ Job completed successfully');
      console.log(`   Screenshot: ${screenshotUrl}`);
      console.log('');

    } catch (error) {
      console.error('');
      console.error('❌ Job failed:', error.message);
      console.error('');

      // Update assignment as failed
      await this.failJob(assignmentId, error.message);

    } finally {
      // Mark device as idle
      device.status = 'idle';

      // 삭제 전에 startTime 추출
      const jobInfo = this.activeJobs.get(jobId);
      const elapsed = jobInfo?.startTime
        ? ((Date.now() - jobInfo.startTime) / 1000).toFixed(0)
        : 'N/A';

      this.activeJobs.delete(jobId);

      console.log(`📊 Total time: ${elapsed}s`);
      console.log('');
    }
  }

  /**
   * Claim job (update assignment) with atomic conditional update
   * Uses .eq('status', 'pending') to prevent race conditions where multiple workers claim the same job
   * @returns {Object} { success: boolean, claimed: boolean } - success indicates no DB error, claimed indicates job was actually claimed
   */
  async claimJob(assignmentId, deviceSerial) {
    // Atomic conditional update: only update if status is still 'pending'
    // This prevents race conditions where multiple workers try to claim the same job
    const { data, error } = await this.supabase
      .from('job_assignments')
      .update({
        device_id: deviceSerial,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .eq('status', 'pending')  // Only claim if still pending (atomic check)
      .select();  // Return the updated row to verify claim succeeded

    if (error) {
      throw error;
    }

    // Check if the update actually affected a row
    // If data is empty, another worker already claimed this job
    if (!data || data.length === 0) {
      console.log(`[Claim] ⚠️ Job ${assignmentId} already claimed by another worker`);
      return { success: true, claimed: false };
    }

    console.log(`[Claim] ✅ Job claimed by ${deviceSerial}`);
    return { success: true, claimed: true };
  }

  /**
   * Fail job
   */
  async failJob(assignmentId, errorMessage) {
    const { error } = await this.supabase
      .from('job_assignments')
      .update({
        status: 'failed',
        error_log: errorMessage,
        completed_at: new Date().toISOString()
      })
      .eq('id', assignmentId);

    if (error) {
      console.error('[Fail] Database update failed:', error.message);
    } else {
      console.log('[Fail] ✅ Job marked as failed');
    }
  }

  /**
   * Scan and sync device telemetry (BE-02)
   */
  async scanAndSync() {
    console.log('');
    console.log('[Telemetry] Scanning devices for telemetry...');

    for (const device of this.devices) {
      try {
        // Collect telemetry from device
        const telemetry = await device.adb.getTelemetry();

        // Upsert to Supabase
        const { error } = await this.supabase
          .from('devices')
          .upsert({
            serial_number: telemetry.serial_number,
            model_name: telemetry.model_name,
            battery_level: telemetry.battery_level,
            pc_id: this.config.workerId,
            status: device.status,
            last_seen_at: telemetry.last_seen_at
          }, {
            onConflict: 'serial_number'
          });

        if (error) {
          console.error(`[Telemetry] Failed to sync ${device.serial}:`, error.message);
        } else {
          console.log(`[Telemetry] ✅ Synced ${device.serial}: ${telemetry.model_name}, ${telemetry.battery_level}%`);
        }

      } catch (error) {
        console.error(`[Telemetry] Error collecting from ${device.serial}:`, error.message);
      }
    }

    console.log('[Telemetry] Scan complete');
    console.log('');
  }

  /**
   * Extract keyword from target URL
   */
  extractKeyword(targetUrl) {
    // Simple extraction from YouTube URL
    // Example: https://m.youtube.com/watch?v=dQw4w9WgXcQ
    // For now, just return a placeholder
    // In production, this would fetch video title via YouTube API
    return 'Video Title'; // TODO: Implement proper extraction
  }
}

// =============================================
// Main Execution
// =============================================

async function main() {
  // Validate environment - both SERVICE_ROLE_KEY and ANON_KEY are required
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !CONFIG.supabaseAnonKey) {
    console.error('❌ Required environment variables are missing');
    console.error('');
    console.error('Required variables:');
    console.error('  SUPABASE_URL - Your Supabase project URL');
    console.error('  SUPABASE_SERVICE_ROLE_KEY - Server-side key with RLS bypass (DO NOT expose to clients)');
    console.error('  SUPABASE_ANON_KEY - Client-side key with RLS enforcement (safe for devices)');
    console.error('');
    console.error('Example:');
    console.error('  export SUPABASE_URL="https://xxx.supabase.co"');
    console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
    console.error('  export SUPABASE_ANON_KEY="your-anon-key"');
    console.error('  node worker.js');
    process.exit(1);
  }

  const worker = new PCWorker(CONFIG);

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('');
    await worker.stop();
    process.exit(0);
  });

  try {
    await worker.start();
  } catch (error) {
    console.error('❌ Worker failed to start:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = PCWorker;

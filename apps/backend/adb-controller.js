/**
 * ADB Controller - Worker v5.1
 *
 * Manages ADB commands for Android device control
 * Implements:
 * - Patch 1: job.json file-based parameter passing
 * - Patch 2: Unique evidence path retrieval
 * - Patch 4: Hash-based script deployment
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const crypto = require('crypto');

const execPromise = util.promisify(exec);

class ADBController {
  constructor(deviceSerial) {
    this.deviceSerial = deviceSerial;
  }

  /**
   * Execute ADB command
   */
  async command(cmd, timeout = 30000) {
    const fullCommand = `adb -s ${this.deviceSerial} ${cmd}`;

    try {
      const { stdout, stderr } = await execPromise(fullCommand, { timeout });

      // ADB often outputs to stderr even on success
      if (stderr && !this.isExpectedStderr(stderr)) {
        console.warn(`[ADB] Warning: ${stderr}`);
      }

      return stdout.trim();

    } catch (error) {
      throw new Error(`ADB command failed: ${error.message}`);
    }
  }

  /**
   * Check if stderr is expected (not an error)
   */
  isExpectedStderr(stderr) {
    const expectedPatterns = [
      'file pushed',
      'file pulled',
      'bytes in',
      'KB/s'
    ];

    return expectedPatterns.some(pattern => stderr.includes(pattern));
  }

  /**
   * Push file to device
   */
  async pushFile(localPath, remotePath) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    console.log(`[ADB] Pushing ${localPath} → ${remotePath}`);

    await this.command(`push "${localPath}" "${remotePath}"`, 60000);

    console.log(`[ADB] ✅ Push complete`);
    return true;
  }

  /**
   * Pull file from device
   */
  async pullFile(remotePath, localPath) {
    // Ensure local directory exists
    const localDir = require('path').dirname(localPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    console.log(`[ADB] Pulling ${remotePath} → ${localPath}`);

    await this.command(`pull "${remotePath}" "${localPath}"`, 60000);

    if (!fs.existsSync(localPath)) {
      throw new Error(`File not pulled successfully: ${localPath}`);
    }

    console.log(`[ADB] ✅ Pull complete`);
    return localPath;
  }

  /**
   * Execute AutoX.js script via broadcast
   */
  async executeScript(scriptPath) {
    const broadcastCommand = `shell am broadcast -a com.stardust.autojs.execute -d "file://${scriptPath}"`;

    console.log(`[ADB] Executing script: ${scriptPath}`);

    const output = await this.command(broadcastCommand);

    if (output.includes('result=-1')) {
      throw new Error('AutoX.js broadcast failed. Check if AutoX.js is running and "ADB broadcast execution" is enabled.');
    }

    console.log(`[ADB] ✅ Script execution triggered`);
    return true;
  }

  /**
   * Check if device is online
   */
  async isOnline() {
    try {
      const devicesOutput = await execPromise('adb devices');

      return devicesOutput.stdout.includes(this.deviceSerial) &&
             devicesOutput.stdout.includes('device');

    } catch (error) {
      return false;
    }
  }

  /**
   * Deploy job.json to device (Patch 1)
   */
  async deployJobConfig(jobParams, localJsonPath = null) {
    // Create job.json content
    const jobConfig = {
      job_id: jobParams.job_id,
      assignment_id: jobParams.assignment_id,
      device_id: this.deviceSerial,
      keyword: jobParams.keyword,
      target_title: jobParams.target_title || null,
      duration_min_pct: jobParams.duration_min_pct || 30,
      duration_max_pct: jobParams.duration_max_pct || 90,
      base_duration_sec: jobParams.base_duration_sec || 300,
      prob_like: jobParams.prob_like || 0,
      prob_comment: jobParams.prob_comment || 0,
      prob_subscribe: jobParams.prob_subscribe || 0,
      supabase_url: jobParams.supabase_url,
      supabase_key: jobParams.supabase_key
    };

    // Save to local temp file
    const tempPath = localJsonPath || `./temp/${this.deviceSerial}_job_${jobParams.job_id}.json`;
    fs.writeFileSync(tempPath, JSON.stringify(jobConfig, null, 2));

    console.log(`[ADB] Job config created: ${tempPath}`);

    // Push to device
    await this.pushFile(tempPath, '/sdcard/job.json');

    // Cleanup local temp file (optional)
    if (!localJsonPath) {
      fs.unlinkSync(tempPath);
    }

    console.log(`[ADB] ✅ Job config deployed to device`);
    return jobConfig;
  }

  /**
   * Retrieve evidence file with unique path (Patch 2)
   */
  async retrieveEvidence(jobId, outputDir = './evidence') {
    // Pattern: /sdcard/evidence/DEVICE_JOB_TIMESTAMP.png
    const pattern = `/sdcard/evidence/${this.deviceSerial}_${jobId}_*.png`;

    console.log(`[ADB] Searching for evidence: ${pattern}`);

    try {
      // List files matching pattern
      const lsOutput = await this.command(`shell ls ${pattern}`);

      if (!lsOutput || lsOutput.includes('No such file')) {
        throw new Error(`No evidence file found for job: ${jobId}`);
      }

      // Get file paths (may be multiple if multiple screenshots)
      const files = lsOutput.split('\n').filter(f => f.trim().length > 0);

      if (files.length === 0) {
        throw new Error('Evidence file list is empty');
      }

      // Use the latest file (last in list)
      const remoteFile = files[files.length - 1].trim();

      // Create local path: ./evidence/DEVICE/JOB_ID.png
      const deviceDir = `${outputDir}/${this.deviceSerial}`;
      if (!fs.existsSync(deviceDir)) {
        fs.mkdirSync(deviceDir, { recursive: true });
      }

      const localFile = `${deviceDir}/${jobId}.png`;

      // Pull file
      await this.pullFile(remoteFile, localFile);

      // Delete evidence from device to save space
      await this.command(`shell rm "${remoteFile}"`);

      console.log(`[ADB] ✅ Evidence retrieved: ${localFile}`);

      return localFile;

    } catch (error) {
      console.error(`[ADB] Evidence retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deploy script with hash-based caching (Patch 4)
   */
  async deployScriptIfNeeded(localScriptPath, remoteScriptPath) {
    // Calculate local script hash
    const scriptContent = fs.readFileSync(localScriptPath);
    const localHash = crypto.createHash('md5').update(scriptContent).digest('hex');

    console.log(`[ADB] Local script hash: ${localHash}`);

    // Check remote hash
    const remoteHashPath = `${remoteScriptPath}.hash`;

    let remoteHash = null;
    try {
      remoteHash = await this.command(`shell cat ${remoteHashPath}`);
    } catch (error) {
      // Hash file doesn't exist, first deployment
      console.log(`[ADB] No remote hash found, deploying script`);
    }

    if (remoteHash && remoteHash.trim() === localHash) {
      console.log(`[ADB] ✅ Script unchanged, skipping deployment`);
      return false; // Not deployed
    }

    // Deploy script
    console.log(`[ADB] Script changed, deploying...`);
    await this.pushFile(localScriptPath, remoteScriptPath);

    // Update hash file
    await this.command(`shell "echo '${localHash}' > ${remoteHashPath}"`);

    console.log(`[ADB] ✅ Script deployed, hash updated`);
    return true; // Deployed
  }

  /**
   * Get device model name (BE-02 Telemetry)
   */
  async getModelName() {
    try {
      // Get model from device properties
      const model = await this.command('shell getprop ro.product.model');

      if (model && model.trim().length > 0) {
        return model.trim();
      }

      // Fallback: Try parsing from adb devices -l
      const devicesOutput = await execPromise('adb devices -l');
      const lines = devicesOutput.stdout.split('\n');

      for (const line of lines) {
        if (line.includes(this.deviceSerial)) {
          // Parse: R28M50BDXYZ device product:xxx model:SM-G973F device:xxx
          const modelMatch = line.match(/model:(\S+)/);
          if (modelMatch) {
            return modelMatch[1];
          }
        }
      }

      return 'Unknown';

    } catch (error) {
      console.warn(`[ADB] Failed to get model name: ${error.message}`);
      return 'Unknown';
    }
  }

  /**
   * Get battery level (BE-02 Telemetry)
   */
  async getBatteryLevel() {
    try {
      const batteryInfo = await this.command('shell dumpsys battery');

      // Parse: "  level: 85"
      const levelMatch = batteryInfo.match(/level:\s*(\d+)/);

      if (levelMatch) {
        const level = parseInt(levelMatch[1], 10);

        // Validate range
        if (level >= 0 && level <= 100) {
          return level;
        }
      }

      return null; // Unknown battery level

    } catch (error) {
      console.warn(`[ADB] Failed to get battery level: ${error.message}`);
      return null;
    }
  }

  /**
   * Get device telemetry (BE-02 Telemetry)
   */
  async getTelemetry() {
    console.log(`[ADB] Collecting telemetry for ${this.deviceSerial}...`);

    const [modelName, batteryLevel] = await Promise.all([
      this.getModelName(),
      this.getBatteryLevel()
    ]);

    const telemetry = {
      serial_number: this.deviceSerial,
      model_name: modelName,
      battery_level: batteryLevel,
      last_seen_at: new Date().toISOString()
    };

    console.log(`[ADB] Telemetry: Model=${modelName}, Battery=${batteryLevel}%`);

    return telemetry;
  }

  /**
   * Wait for completion flag (Patch 3)
   */
  async waitForCompletion(jobId, maxWaitSec = 300) {
    const flagPath = `/sdcard/completion_${jobId}.flag`;
    const pollInterval = 5000; // 5 seconds
    const maxPolls = Math.floor(maxWaitSec * 1000 / pollInterval);

    console.log(`[ADB] Waiting for completion flag: ${flagPath}`);
    console.log(`[ADB] Max wait: ${maxWaitSec}s, polling every ${pollInterval / 1000}s`);

    for (let i = 0; i < maxPolls; i++) {
      try {
        // Check if flag file exists
        const checkOutput = await this.command(`shell "[ -f ${flagPath} ] && echo 'exists' || echo 'missing'"`);

        if (checkOutput.includes('exists')) {
          console.log(`[ADB] ✅ Completion flag detected`);

          // Pull flag file
          const localFlagPath = `./temp/${this.deviceSerial}_${jobId}_completion.flag`;
          await this.pullFile(flagPath, localFlagPath);

          // Parse flag data
          const flagContent = fs.readFileSync(localFlagPath, 'utf8');
          const flagData = JSON.parse(flagContent);

          // Delete flag from device
          await this.command(`shell rm ${flagPath}`);

          // Delete local flag file
          fs.unlinkSync(localFlagPath);

          console.log(`[ADB] Completion status: ${flagData.status}`);
          return flagData;
        }

      } catch (error) {
        // File doesn't exist yet, continue polling
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // Log progress
      const elapsed = (i + 1) * (pollInterval / 1000);
      if (i % 6 === 5) { // Every 30 seconds
        console.log(`[ADB] Still waiting... (${elapsed}s elapsed)`);
      }
    }

    throw new Error(`Job ${jobId} timeout after ${maxWaitSec}s - no completion flag received`);
  }
}

module.exports = ADBController;

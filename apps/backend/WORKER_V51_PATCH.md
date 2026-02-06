# Worker v5.0 → v5.1 Patch Plan

**Context**: Aria identified critical gaps in the current PC Worker implementation that are independent of WebView Pre-Flight validation.

**Purpose**: Patch Worker to support robust job parameter passing, evidence collection, and concurrent execution.

---

## 🎯 Patch Summary

| Issue | Current (v5.0) | Patched (v5.1) | Priority |
|-------|----------------|----------------|----------|
| **Job Parameter Passing** | ADB broadcast args (limited) | job.json file | 🔴 CRITICAL |
| **Evidence Path Collision** | Fixed `/sdcard/evidence.png` | `{job_id}_{timestamp}.png` | 🔴 CRITICAL |
| **Completion Signal** | Fixed 60s wait | `completion.flag` file | 🟡 HIGH |
| **Script Deployment** | Always push | Hash-based caching | 🟢 MEDIUM |

---

## 🔧 Patch 1: job.json File-Based Parameter Passing

### Problem

Current ADB broadcast command:
```bash
adb shell am broadcast \
  -a com.stardust.autojs.execute \
  -d "file:///sdcard/bot.js" \
  --es job_id "abc123" \
  --es keyword "BTS Dynamite" \
  --es target_title "Official MV" \
  --ei duration_min_pct 30 \
  --ei duration_max_pct 90 \
  # ... 10+ more parameters
```

**Issues**:
- ADB broadcast has ~4KB argument limit
- Complex parameters (JSON objects, arrays) need escaping
- Error-prone manual parameter serialization

### Solution

**Step 1**: Create job.json file

```javascript
// backend/worker.js (v5.1)

async function deployJob(deviceSerial, jobParams) {
  const adb = new ADBController(deviceSerial);

  // Create job.json with all parameters
  const jobConfig = {
    job_id: jobParams.job_id,
    assignment_id: jobParams.assignment_id,
    device_id: deviceSerial,
    keyword: jobParams.keyword,
    target_title: jobParams.target_title || null,
    duration_min_pct: jobParams.duration_min_pct,
    duration_max_pct: jobParams.duration_max_pct,
    base_duration_sec: jobParams.base_duration_sec,
    prob_like: jobParams.prob_like,
    prob_comment: jobParams.prob_comment,
    prob_subscribe: jobParams.prob_subscribe,
    supabase_url: process.env.SUPABASE_URL,
    supabase_key: process.env.SUPABASE_KEY
  };

  const jobJsonPath = `./temp/${deviceSerial}_job.json`;
  fs.writeFileSync(jobJsonPath, JSON.stringify(jobConfig, null, 2));

  // Push job.json to device
  await adb.pushFile(jobJsonPath, '/sdcard/job.json');

  // Execute bot.js (reads /sdcard/job.json)
  await adb.executeScript('/sdcard/bot.js');

  // Cleanup local temp file
  fs.unlinkSync(jobJsonPath);
}
```

**Step 2**: Update bot.js to read job.json

```javascript
// mobile-agent/bot.js (v3.1)

"ui";

// Read job parameters from file instead of args
let params;
const jobJsonPath = "/sdcard/job.json";

if (files.exists(jobJsonPath)) {
    const jobJson = files.read(jobJsonPath);
    params = JSON.parse(jobJson);
    console.log("✅ Job parameters loaded from job.json");
} else {
    // Fallback to args (backwards compatibility)
    const args = engines.myEngine().execArgv;
    params = {
        job_id: args.job_id || "test-job",
        assignment_id: args.assignment_id || "test-assignment",
        // ... rest of parameters
    };
    console.warn("⚠️ Using fallback args (job.json not found)");
}

// Rest of bot.js code...
```

**Benefits**:
- No ADB argument limits
- Support for complex nested objects (future: comment templates, selector overrides)
- Easier debugging (can inspect job.json file)

---

## 🔧 Patch 2: Evidence Path Uniqueness

### Problem

Current evidence capture:
```javascript
// mobile-agent/bot.js (v3.0)
const screenshot = images.captureScreen();
images.save(screenshot, "/sdcard/evidence.png");  // ALWAYS SAME PATH
```

**Issue**: If 2 jobs run simultaneously on same device (staggered timing), file gets overwritten.

### Solution

**Unique filenames with job_id + timestamp**:

```javascript
// mobile-agent/modules/evidence-capture.js (v5.1)

class EvidenceCapture {
  constructor(deviceId, jobId) {
    this.deviceId = deviceId;
    this.jobId = jobId;
    this.evidenceDir = '/sdcard/evidence/';

    // Create evidence directory if not exists
    if (!files.exists(this.evidenceDir)) {
      files.createWithDirs(this.evidenceDir);
    }
  }

  async captureScreenshot() {
    const timestamp = Date.now();
    const filename = `${this.deviceId}_${this.jobId}_${timestamp}.png`;
    const filepath = this.evidenceDir + filename;

    const img = images.captureScreen();
    images.save(img, filepath);
    img.recycle();

    console.log('[Evidence] Screenshot saved:', filepath);
    return filepath;
  }
}

// Usage in bot.js:
const evidence = new EvidenceCapture(params.device_id, params.job_id);
const screenshotPath = await evidence.captureScreenshot();
// Result: /sdcard/evidence/R28M50BDXYZ_abc123_1738152340000.png
```

**Worker side: Pull with pattern matching**

```javascript
// backend/worker.js (v5.1)

async function retrieveEvidence(deviceSerial, jobId) {
  const adb = new ADBController(deviceSerial);

  // List all evidence files for this job
  const lsOutput = await adb.command(
    `shell ls /sdcard/evidence/${deviceSerial}_${jobId}_*.png`
  );

  if (!lsOutput) {
    throw new Error('No evidence file found for job: ' + jobId);
  }

  // Get the most recent file (in case multiple)
  const files = lsOutput.trim().split('\n');
  const latestFile = files[files.length - 1];

  const localPath = `./evidence/${deviceSerial}/${jobId}.png`;
  await adb.pullFile(latestFile, localPath);

  // Delete evidence from device
  await adb.command(`shell rm ${latestFile}`);

  return localPath;
}
```

**Benefits**:
- No file collisions
- Multiple screenshots per job possible (if needed)
- Automatic cleanup via timestamp-based retention policy

---

## 🔧 Patch 3: Completion Signal via Flag File

### Problem

Current completion detection:
```javascript
// backend/worker.js (v5.0)
await adb.executeScript('/sdcard/bot.js');
await sleep(60000);  // Fixed 60s wait
await retrieveEvidence();  // Hope it's ready!
```

**Issues**:
- Jobs finishing in 30s waste 30s waiting
- Jobs taking 90s get cut off
- No way to detect crashes vs still-running

### Solution

**bot.js writes completion flag**:

```javascript
// mobile-agent/bot.js (v3.1)

async function completeJob(finalPct, durationSec) {
    // ... existing completion logic ...

    // Write completion flag
    const flagPath = `/sdcard/completion_${params.job_id}.flag`;
    files.write(flagPath, JSON.stringify({
        status: 'success',
        job_id: params.job_id,
        completed_at: new Date().toISOString(),
        screenshot_path: jobResult.screenshotPath
    }));

    console.log('[Complete] Flag written:', flagPath);
}

async function failJob(error) {
    // ... existing failure logic ...

    // Write failure flag
    const flagPath = `/sdcard/completion_${params.job_id}.flag`;
    files.write(flagPath, JSON.stringify({
        status: 'failed',
        job_id: params.job_id,
        error: error.message,
        completed_at: new Date().toISOString()
    }));
}
```

**Worker polls for flag file**:

```javascript
// backend/worker.js (v5.1)

async function waitForCompletion(deviceSerial, jobId, maxWaitSec = 300) {
  const adb = new ADBController(deviceSerial);
  const flagPath = `/sdcard/completion_${jobId}.flag`;
  const pollInterval = 5000; // 5 seconds
  const maxPolls = Math.floor(maxWaitSec * 1000 / pollInterval);

  for (let i = 0; i < maxPolls; i++) {
    // Check if flag file exists
    const exists = await adb.command(
      `shell "[ -f ${flagPath} ] && echo 'exists' || echo 'missing'"`
    );

    if (exists.includes('exists')) {
      // Pull flag file
      const localFlagPath = `./temp/${jobId}_completion.flag`;
      await adb.pullFile(flagPath, localFlagPath);

      const flagData = JSON.parse(fs.readFileSync(localFlagPath, 'utf8'));

      // Delete flag from device
      await adb.command(`shell rm ${flagPath}`);
      fs.unlinkSync(localFlagPath);

      console.log(`[Worker] Job ${jobId} completed:`, flagData.status);
      return flagData;
    }

    // Wait before next poll
    await sleep(pollInterval);
  }

  throw new Error(`Job ${jobId} timeout after ${maxWaitSec}s`);
}

// Usage:
await adb.executeScript('/sdcard/bot.js');
const result = await waitForCompletion(deviceSerial, jobId, 300); // 5min max

if (result.status === 'success') {
  await retrieveEvidence(deviceSerial, jobId);
} else {
  console.error('Job failed:', result.error);
}
```

**Benefits**:
- Dynamic wait times (finish when actually done)
- Detect crashes (timeout = job crashed)
- Structured completion data (can include metrics)

---

## 🔧 Patch 4: Hash-Based Script Deployment (Optimization)

### Problem

Current deployment:
```javascript
// backend/worker.js (v5.0)
await adb.pushFile('./mobile-agent/bot.js', '/sdcard/bot.js');  // Every time
```

**Issue**: 100KB script × 100 devices × 20 jobs/day = 200MB transferred daily (unnecessary if script unchanged)

### Solution

**Deploy only if script hash changed**:

```javascript
// backend/worker.js (v5.1)

const crypto = require('crypto');

async function deployScriptIfNeeded(deviceSerial, scriptPath, remoteScriptPath) {
  const adb = new ADBController(deviceSerial);

  // Calculate local script hash
  const scriptContent = fs.readFileSync(scriptPath);
  const localHash = crypto.createHash('md5').update(scriptContent).digest('hex');

  // Check if hash file exists on device
  const remoteHashPath = remoteScriptPath + '.hash';
  const remoteHash = await adb.command(`shell cat ${remoteHashPath} 2>/dev/null`).catch(() => null);

  if (remoteHash && remoteHash.trim() === localHash) {
    console.log('[Deploy] Script unchanged, skipping push');
    return false; // Not deployed (already up-to-date)
  }

  // Push script
  console.log('[Deploy] Script changed, pushing to device');
  await adb.pushFile(scriptPath, remoteScriptPath);

  // Write hash file
  await adb.command(`shell "echo '${localHash}' > ${remoteHashPath}"`);

  return true; // Deployed
}

// Usage:
const deployed = await deployScriptIfNeeded(
  deviceSerial,
  './mobile-agent/bot.js',
  '/sdcard/bot.js'
);

if (deployed) {
  console.log('New script version deployed');
}
```

**Benefits**:
- 95% reduction in ADB transfers (script rarely changes)
- Faster job startup (no waiting for push)
- Bandwidth savings for PC Workers with many devices

---

## 📋 Implementation Checklist

### Phase 0 (Independent - Can Do Now)

- [ ] **Patch 1**: Implement job.json passing
  - [ ] Update `backend/worker.js`: deployJob() function
  - [ ] Update `mobile-agent/bot.js`: Read from job.json
  - [ ] Test: Single device, simple job

- [ ] **Patch 2**: Unique evidence filenames
  - [ ] Update `mobile-agent/modules/evidence-capture.js`
  - [ ] Update `backend/worker.js`: retrieveEvidence()
  - [ ] Test: Concurrent jobs on same device

### Phase 1 Integration

- [ ] **Patch 3**: Completion flag polling
  - [ ] Update `mobile-agent/bot.js`: Write completion flags
  - [ ] Update `backend/worker.js`: waitForCompletion()
  - [ ] Test: Various job durations (30s, 90s, 180s)

### Post-Launch Optimization

- [ ] **Patch 4**: Hash-based deployment
  - [ ] Implement deployScriptIfNeeded()
  - [ ] Test: Script update propagation
  - [ ] Monitor: ADB bandwidth savings

---

## 🧪 Testing Strategy

### Test 1: job.json Parameter Overflow

```javascript
const massiveJob = {
  job_id: 'test-001',
  keyword: 'Very Long Keyword '.repeat(100),  // 2KB string
  custom_selectors: {
    search: ['selector1', 'selector2', /* ... 50 selectors */],
    like: ['btn1', 'btn2', /* ... */]
  },
  comment_templates: [/* 100 comment strings */]
};

await deployJob(deviceSerial, massiveJob);
// Verify: job.json loads successfully on device
```

### Test 2: Evidence Path Collision

```bash
# Simulate rapid job assignment
for i in {1..5}; do
  node trigger-job.js --device R28M50BDXYZ --job job-$i &
done
wait

# Verify: 5 unique evidence files exist
ls ./evidence/R28M50BDXYZ/
# Expected: job-1.png, job-2.png, ..., job-5.png
```

### Test 3: Completion Flag Timing

```javascript
// Job A: 30 seconds duration
// Job B: 120 seconds duration

const startA = Date.now();
const resultA = await waitForCompletion('device1', 'job-a', 300);
const elapsedA = Date.now() - startA;

console.log('Job A waited:', elapsedA / 1000, 'seconds');
// Expected: ~30s (not 60s fixed wait)

const startB = Date.now();
const resultB = await waitForCompletion('device2', 'job-b', 300);
const elapsedB = Date.now() - startB;

console.log('Job B waited:', elapsedB / 1000, 'seconds');
// Expected: ~120s
```

---

## 📊 Estimated Impact

| Metric | Before (v5.0) | After (v5.1) | Improvement |
|--------|---------------|--------------|-------------|
| **Job Parameter Limit** | ~4KB (ADB args) | Unlimited (file) | ∞ |
| **Evidence Collision Risk** | High (fixed path) | None (unique paths) | 100% |
| **Average Wait Overhead** | 30s (fixed 60s) | ~5s (polling) | -83% |
| **Daily ADB Bandwidth** | 200MB | 10MB | -95% |
| **Job Failure Rate** | 15% (timeout/collision) | <5% (robust) | -67% |

---

## 🚀 Rollout Plan

### Week 1: Patch 1 + 2 (Critical)

- Deploy job.json + unique evidence paths
- Test on 5 devices × 10 jobs each
- Monitor for file system issues

### Week 2: Patch 3 (High Priority)

- Add completion flag polling
- A/B test: v5.0 (fixed wait) vs v5.1 (polling)
- Measure wait time savings

### Week 3: Patch 4 (Optimization)

- Enable hash-based deployment
- Monitor ADB bandwidth reduction
- Verify no cache invalidation bugs

---

## 🔗 Dependencies

- **Pre-Flight Validation**: Independent (can patch now)
- **Phase 1 WebView Modules**: Compatible (bot.js v3.1 supports both args and job.json)
- **Existing v5.0 Workers**: Backwards compatible (job.json fallback to args)

---

## ✅ Acceptance Criteria

- [ ] 10KB+ job parameters load successfully via job.json
- [ ] 5 concurrent jobs on same device produce unique evidence files
- [ ] 30s job completes in ~35s (not 60s fixed wait)
- [ ] Script deployment skipped when hash unchanged (log confirms)
- [ ] Zero evidence file collisions in 100-job stress test

---

**Status**: ✅ READY TO IMPLEMENT (Independent of Pre-Flight results)

**Next Action**: Implement Patch 1 + 2 immediately while Pre-Flight runs in parallel

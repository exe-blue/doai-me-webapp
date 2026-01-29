#!/usr/bin/env node
require('dotenv').config({ path: '.env' });
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load configuration
const CONFIG = require('./preflight-config.json');

// ADB path configuration (Windows compatible)
const ADB_PATH = process.env.ADB_PATH || path.join(require('os').homedir(), 'adb.exe');

// Global state
let deviceSerial = null;
let logcatProcess = null;
let logFilePath = null;
let testResults = {
    checkpoint1: null,
    checkpoint2: null,
    checkpoint3: null,
    checkpoint4: null
};

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function main() {
    console.log('🚀 Pre-Flight Test - Worker v5.1 + WebView Bot\n');

    try {
        // Setup
        await setup();

        // Checkpoint 1: File Sync
        await checkpoint1_FileSync();

        // Checkpoint 2: Intent Broadcast
        await checkpoint2_IntentBroadcast();

        // Checkpoint 3: WebView Injection
        await checkpoint3_WebViewInjection();

        // Checkpoint 4: Evidence Path
        await checkpoint4_EvidencePath();

        // Report
        reportResults();

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Pre-Flight Test FAILED:', error.message);
        reportResults();
        process.exit(1);
    } finally {
        await cleanup();
    }
}

// ============================================================================
// SETUP & CLEANUP
// ============================================================================

async function setup() {
    console.log('📋 Setup Phase...');

    // 1. Detect device
    deviceSerial = await detectDevice();
    console.log(`✓ Device detected: ${deviceSerial}`);

    // 2. Create output directories
    const preflightDir = path.join(__dirname, '.preflight');
    const logsDir = path.join(preflightDir, 'logs');
    const evidenceDir = path.join(preflightDir, 'evidence');

    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
    }

    // 3. Start logcat capture
    logcatProcess = startLogcatCapture(deviceSerial);
    console.log('✓ Logcat capture started');

    // 4. Clean old test files
    await cleanOldTestFiles(deviceSerial);
    console.log('✓ Old test files cleaned\n');
}

async function detectDevice() {
    return new Promise((resolve, reject) => {
        execFile(ADB_PATH, ['devices'], (error, stdout) => {
            if (error) {
                reject(new Error(`ADB not found at ${ADB_PATH}. Install ADB or set ADB_PATH environment variable.`));
                return;
            }

            const lines = stdout.split('\n');
            const devices = lines.filter(line => line.includes('\tdevice'));

            if (devices.length === 0) {
                reject(new Error('No Android devices connected. Connect device via USB and enable USB debugging.'));
                return;
            }

            const serial = devices[0].split('\t')[0];
            resolve(serial);
        });
    });
}

function startLogcatCapture(serial) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    logFilePath = path.join(__dirname, '.preflight', 'logs', `logcat_${timestamp}.txt`);

    const logStream = fs.createWriteStream(logFilePath);
    const logcat = spawn(ADB_PATH, ['-s', serial, 'logcat', '-v', 'time']);

    logcat.stdout.pipe(logStream);
    logcat.stderr.pipe(logStream);

    console.log(`   Logcat output: ${logFilePath}`);
    return logcat;
}

async function cleanOldTestFiles(serial) {
    const files = [
        '/sdcard/job.json',
        CONFIG.test_job.evidence_path,
        CONFIG.test_job.done_flag_path
    ];

    for (const file of files) {
        try {
            await runAdb(serial, ['shell', 'rm', file]);
        } catch (e) {
            // File doesn't exist - OK
        }
    }
}

async function cleanup() {
    console.log('\n🧹 Cleanup...');

    if (logcatProcess) {
        logcatProcess.kill();
        console.log('✓ Logcat capture stopped');
    }

    if (deviceSerial) {
        try {
            await runAdb(deviceSerial, ['shell', 'rm', CONFIG.test_job.evidence_path]);
            await runAdb(deviceSerial, ['shell', 'rm', CONFIG.test_job.done_flag_path]);
            await runAdb(deviceSerial, ['shell', 'rm', '/sdcard/job.json']);
            console.log('✓ Test files cleaned from device');
        } catch (e) {
            // Cleanup errors are non-fatal
        }
    }
}

// ============================================================================
// CHECKPOINT 1: FILE SYNC VALIDATION
// ============================================================================

async function checkpoint1_FileSync() {
    console.log('📁 Checkpoint 1: File Sync Validation...');
    const start = Date.now();

    try {
        // 1. Deploy bot files
        console.log('   Deploying bot files...');
        await deployBotFiles(deviceSerial);

        // 2. Create test job.json
        const jobParams = {
            supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabase_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            assignment_id: CONFIG.test_job.assignment_id,
            keyword: CONFIG.test_job.keyword,
            video_title: CONFIG.test_job.video_title,
            duration_sec: CONFIG.test_job.duration_sec,
            evidence_path: CONFIG.test_job.evidence_path,
            done_flag_path: CONFIG.test_job.done_flag_path
        };

        const jobFile = path.join(__dirname, 'test_job.json');
        fs.writeFileSync(jobFile, JSON.stringify(jobParams, null, 2));
        console.log('   ✓ test_job.json created');

        // 3. Push job.json to device
        await runAdb(deviceSerial, ['push', jobFile, '/sdcard/job.json']);
        console.log('   ✓ job.json pushed to device');

        // 4. Verify all files exist on device
        const requiredFiles = [
            '/sdcard/Scripts/webview_bot.js',
            '/sdcard/Scripts/config.json',
            '/sdcard/Scripts/selectors.json',
            '/sdcard/Scripts/modules/webview-setup.js',
            '/sdcard/Scripts/modules/dom-control.js',
            '/sdcard/Scripts/modules/search-flow.js',
            '/sdcard/job.json'
        ];

        for (const file of requiredFiles) {
            await verifyFileExists(deviceSerial, file);
        }

        const duration = Date.now() - start;
        testResults.checkpoint1 = { status: 'PASS', duration };
        console.log(`✅ Checkpoint 1 PASSED (${duration}ms)\n`);

    } catch (error) {
        const duration = Date.now() - start;
        testResults.checkpoint1 = { status: 'FAIL', duration, error: error.message };
        throw new Error(`Checkpoint 1 FAILED: ${error.message}`);
    }
}

async function deployBotFiles(serial) {
    // Create directories
    await runAdb(serial, ['shell', 'mkdir', '-p', '/sdcard/Scripts/modules']);

    // Push files
    const files = [
        { local: 'client-mobile/bot-webview-autojs.js', remote: '/sdcard/Scripts/webview_bot.js' },
        { local: 'client-mobile/config.json', remote: '/sdcard/Scripts/config.json' },
        { local: 'client-mobile/selectors.json', remote: '/sdcard/Scripts/selectors.json' },
        { local: 'client-mobile/modules/webview-setup.js', remote: '/sdcard/Scripts/modules/webview-setup.js' },
        { local: 'client-mobile/modules/dom-control.js', remote: '/sdcard/Scripts/modules/dom-control.js' },
        { local: 'client-mobile/modules/search-flow.js', remote: '/sdcard/Scripts/modules/search-flow.js' }
    ];

    for (const file of files) {
        const localPath = path.join(__dirname, file.local);

        // Check if local file exists
        if (!fs.existsSync(localPath)) {
            throw new Error(`Local file not found: ${localPath}`);
        }

        await runAdb(serial, ['push', localPath, file.remote]);
        console.log(`   ✓ ${file.local} → ${file.remote}`);
    }
}

async function verifyFileExists(serial, remotePath) {
    const result = await runAdb(serial, ['shell', 'ls', remotePath]);
    if (result.includes('No such file')) {
        throw new Error(`File not found: ${remotePath}`);
    }
    console.log(`   ✓ Verified: ${remotePath}`);
}

// ============================================================================
// CHECKPOINT 2: INTENT BROADCAST VALIDATION
// ============================================================================

async function checkpoint2_IntentBroadcast() {
    console.log('📡 Checkpoint 2: Intent Broadcast Validation...');
    const start = Date.now();

    try {
        // 1. Execute ADB broadcast
        console.log('   Executing ADB broadcast...');
        await runAdb(deviceSerial, [
            'shell', 'am', 'broadcast',
            '-a', 'org.autojs.autoxjs.v6.action.startup',
            '-e', 'path', '/sdcard/Scripts/webview_bot.js'
        ]);
        console.log('   ✓ Broadcast sent');

        // 2. Wait for bot startup log (timeout: 60s)
        console.log('   Waiting for bot startup log...');
        const startupDetected = await waitForLogPattern(
            CONFIG.log_patterns.bot_startup,
            CONFIG.timeout.bot_startup
        );

        if (!startupDetected) {
            throw new Error('Bot startup log not detected within 60 seconds. Check if AutoX.js is installed.');
        }
        console.log('   ✓ Bot startup confirmed');

        // 3. Verify bot process running
        const processRunning = await isBotProcessRunning(deviceSerial);
        if (!processRunning) {
            throw new Error('Bot process not running');
        }
        console.log('   ✓ Bot process verified');

        const duration = Date.now() - start;
        testResults.checkpoint2 = { status: 'PASS', duration };
        console.log(`✅ Checkpoint 2 PASSED (${duration}ms)\n`);

    } catch (error) {
        const duration = Date.now() - start;
        testResults.checkpoint2 = { status: 'FAIL', duration, error: error.message };
        throw new Error(`Checkpoint 2 FAILED: ${error.message}`);
    }
}

async function isBotProcessRunning(serial) {
    try {
        const result = await runAdb(serial, ['shell', 'ps | grep autojs']);
        return result.length > 0;
    } catch (e) {
        return false;
    }
}

// ============================================================================
// CHECKPOINT 3: WEBVIEW INJECTION VALIDATION
// ============================================================================

async function checkpoint3_WebViewInjection() {
    console.log('🌐 Checkpoint 3: WebView Injection Validation...');
    const start = Date.now();

    try {
        // 1. Wait for WebView initialization log
        console.log('   Waiting for WebView init...');
        const webviewInit = await waitForLogPattern(
            CONFIG.log_patterns.webview_init,
            CONFIG.timeout.webview_init
        );

        if (!webviewInit) {
            throw new Error('WebView initialization not detected within 45 seconds');
        }
        console.log('   ✓ WebView initialized');

        // 2. Wait for search start log
        console.log('   Waiting for search execution...');
        const searchStart = await waitForLogPattern(
            CONFIG.log_patterns.search_start,
            30000
        );

        if (!searchStart) {
            throw new Error('Search start not detected');
        }
        console.log('   ✓ Search executed');

        // 3. Check for DOM selector errors in logs
        const domErrors = await checkForDOMErrors();
        if (domErrors.length > 0) {
            throw new Error(`DOM selector errors: ${domErrors.join(', ')}`);
        }
        console.log('   ✓ No DOM selector errors');

        const duration = Date.now() - start;
        testResults.checkpoint3 = { status: 'PASS', duration };
        console.log(`✅ Checkpoint 3 PASSED (${duration}ms)\n`);

    } catch (error) {
        const duration = Date.now() - start;
        testResults.checkpoint3 = { status: 'FAIL', duration, error: error.message };
        throw new Error(`Checkpoint 3 FAILED: ${error.message}`);
    }
}

async function checkForDOMErrors() {
    try {
        const logs = fs.readFileSync(logFilePath, 'utf8');
        const errorPatterns = [
            /\[DOM\] Element not found/,
            /Selector not found/,
            /React event failed/,
            /Input injection failed/
        ];

        const errors = [];
        for (const pattern of errorPatterns) {
            if (pattern.test(logs)) {
                errors.push(pattern.source);
            }
        }
        return errors;
    } catch (e) {
        return [];
    }
}

// ============================================================================
// CHECKPOINT 4: EVIDENCE PATH VALIDATION
// ============================================================================

async function checkpoint4_EvidencePath() {
    console.log('📸 Checkpoint 4: Evidence Path Validation...');
    const start = Date.now();

    try {
        // 1. Wait for screenshot save log
        console.log('   Waiting for screenshot save...');
        const screenshotSaved = await waitForLogPattern(
            CONFIG.log_patterns.screenshot_save,
            CONFIG.timeout.evidence_collect
        );

        if (!screenshotSaved) {
            throw new Error('Screenshot save not detected within 30 seconds');
        }
        console.log('   ✓ Screenshot saved');

        // 2. Wait for flag file creation log
        console.log('   Waiting for flag file creation...');
        const flagCreated = await waitForLogPattern(
            CONFIG.log_patterns.flag_created,
            10000
        );

        if (!flagCreated) {
            throw new Error('Flag file creation not detected');
        }
        console.log('   ✓ Flag file created');

        // 3. Verify evidence file exists on device
        await verifyFileExists(deviceSerial, CONFIG.test_job.evidence_path);
        console.log('   ✓ Evidence file exists on device');

        // 4. Pull evidence file to PC
        const localEvidencePath = path.join(__dirname, '.preflight', 'evidence', 'test_evidence.png');
        await runAdb(deviceSerial, ['pull', CONFIG.test_job.evidence_path, localEvidencePath]);
        console.log(`   ✓ Evidence pulled to ${localEvidencePath}`);

        // 5. Verify file integrity
        const stats = fs.statSync(localEvidencePath);
        if (stats.size < 1000) {
            throw new Error(`Evidence file too small: ${stats.size} bytes`);
        }
        console.log(`   ✓ File size: ${(stats.size / 1024).toFixed(2)} KB`);

        const duration = Date.now() - start;
        testResults.checkpoint4 = { status: 'PASS', duration };
        console.log(`✅ Checkpoint 4 PASSED (${duration}ms)\n`);

    } catch (error) {
        const duration = Date.now() - start;
        testResults.checkpoint4 = { status: 'FAIL', duration, error: error.message };
        throw new Error(`Checkpoint 4 FAILED: ${error.message}`);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function runAdb(serial, args) {
    return new Promise((resolve, reject) => {
        const fullArgs = ['-s', serial, ...args];
        execFile(ADB_PATH, fullArgs, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

async function waitForLogPattern(pattern, timeoutMs) {
    return new Promise((resolve) => {
        const regex = new RegExp(pattern);
        const startTime = Date.now();

        const checkInterval = setInterval(() => {
            try {
                const logs = fs.readFileSync(logFilePath, 'utf8');
                if (regex.test(logs)) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            } catch (e) {
                // File not ready yet
            }

            if (Date.now() - startTime >= timeoutMs) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 1000);
    });
}

function reportResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 PRE-FLIGHT TEST RESULTS');
    console.log('='.repeat(50) + '\n');

    const checkpoints = [
        { name: 'File Sync', result: testResults.checkpoint1 },
        { name: 'Intent Broadcast', result: testResults.checkpoint2 },
        { name: 'WebView Injection', result: testResults.checkpoint3 },
        { name: 'Evidence Path', result: testResults.checkpoint4 }
    ];

    let allPassed = true;

    for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const num = i + 1;

        if (!cp.result) {
            console.log(`${num}. ${cp.name}: ⏸️  NOT STARTED`);
            allPassed = false;
        } else if (cp.result.status === 'PASS') {
            console.log(`${num}. ${cp.name}: ✅ PASS (${cp.result.duration}ms)`);
        } else {
            console.log(`${num}. ${cp.name}: ❌ FAIL (${cp.result.duration}ms)`);
            console.log(`   Error: ${cp.result.error}`);
            allPassed = false;
        }
    }

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('🎉 ALL CHECKPOINTS PASSED - Ready for deployment!');
    } else {
        console.log('⚠️  SOME CHECKPOINTS FAILED - Review logs before deployment');
        console.log(`📄 Logcat: ${logFilePath}`);
    }
    console.log('='.repeat(50) + '\n');
}

// ============================================================================
// RUN TEST
// ============================================================================

main();

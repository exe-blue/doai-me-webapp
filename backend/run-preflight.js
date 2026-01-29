/**
 * Phase 0 Pre-Flight Runner for PC Worker
 *
 * This script automates the deployment and execution of pre-flight.js
 * on a target Android device via ADB.
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

// Configuration
const CONFIG = {
  deviceSerial: process.env.DEVICE_SERIAL || 'AUTO', // Use 'AUTO' to auto-detect single device
  scriptPath: path.join(__dirname, '../mobile-agent/tests/pre-flight.js'),
  remoteScriptPath: '/sdcard/pre-flight.js',
  reportRemotePath: '/sdcard/scripts/com.stardust.scriptdroid/PREFLIGHT_REPORT.md',
  reportLocalPath: path.join(__dirname, '../PREFLIGHT_REPORT.md'),
  timeout: 90000 // 90 seconds for test execution
};

// =============================================
// Helper: Execute ADB command
// =============================================
async function adbCommand(command, deviceSerial = CONFIG.deviceSerial) {
  const deviceFlag = deviceSerial !== 'AUTO' ? `-s ${deviceSerial}` : '';
  const fullCommand = `adb ${deviceFlag} ${command}`;

  console.log(`[ADB] Executing: ${fullCommand}`);

  try {
    const { stdout, stderr } = await execPromise(fullCommand, {
      timeout: 30000
    });

    if (stderr && !stderr.includes('file pushed') && !stderr.includes('file pulled')) {
      console.warn(`[ADB] Warning: ${stderr}`);
    }

    return stdout.trim();

  } catch (error) {
    console.error(`[ADB] Error: ${error.message}`);
    throw error;
  }
}

// =============================================
// Step 1: Detect connected devices
// =============================================
async function detectDevices() {
  console.log('\n[Step 1] Detecting connected devices...');

  const output = await adbCommand('devices', 'none');
  const lines = output.split('\n').filter(line => line.includes('\tdevice'));

  if (lines.length === 0) {
    throw new Error('No Android devices connected. Please connect a device and enable USB debugging.');
  }

  const devices = lines.map(line => {
    const [serial] = line.split('\t');
    return serial;
  });

  console.log(`[Step 1] Found ${devices.length} device(s):`);
  devices.forEach(serial => console.log(`  - ${serial}`));

  // If AUTO mode and only 1 device, use it
  if (CONFIG.deviceSerial === 'AUTO') {
    if (devices.length === 1) {
      CONFIG.deviceSerial = devices[0];
      console.log(`[Step 1] Auto-selected device: ${CONFIG.deviceSerial}`);
    } else {
      console.log('[Step 1] Multiple devices found. Specify DEVICE_SERIAL environment variable.');
      console.log('Example: DEVICE_SERIAL=R28M50BDXYZ node run-preflight.js');
      throw new Error('Multiple devices detected, please specify DEVICE_SERIAL');
    }
  }

  return CONFIG.deviceSerial;
}

// =============================================
// Step 2: Verify AutoX.js is installed
// =============================================
async function verifyAutoXJS() {
  console.log('\n[Step 2] Verifying AutoX.js installation...');

  try {
    const packages = await adbCommand('shell pm list packages');

    const autoXJSPackages = [
      'org.autojs.autoxjs.v6',
      'org.autojs.autojs',
      'com.stardust.scriptdroid'
    ];

    let foundPackage = null;
    for (const pkg of autoXJSPackages) {
      if (packages.includes(pkg)) {
        foundPackage = pkg;
        break;
      }
    }

    if (!foundPackage) {
      throw new Error('AutoX.js not installed on device. Install from: https://github.com/kkevsekk1/AutoX');
    }

    console.log(`[Step 2] ✅ AutoX.js found: ${foundPackage}`);
    return foundPackage;

  } catch (error) {
    console.error('[Step 2] ❌ AutoX.js verification failed');
    throw error;
  }
}

// =============================================
// Step 3: Push pre-flight script to device
// =============================================
async function pushScript() {
  console.log('\n[Step 3] Pushing pre-flight.js to device...');

  // Verify local script exists
  if (!fs.existsSync(CONFIG.scriptPath)) {
    throw new Error(`Script not found: ${CONFIG.scriptPath}`);
  }

  const scriptSize = fs.statSync(CONFIG.scriptPath).size;
  console.log(`[Step 3] Local script: ${CONFIG.scriptPath} (${(scriptSize / 1024).toFixed(1)} KB)`);

  // Push to device
  await adbCommand(`push "${CONFIG.scriptPath}" ${CONFIG.remoteScriptPath}`);

  console.log(`[Step 3] ✅ Script pushed to: ${CONFIG.remoteScriptPath}`);
}

// =============================================
// Step 4: Execute pre-flight script
// =============================================
async function executeScript() {
  console.log('\n[Step 4] Executing pre-flight.js on device...');

  const broadcastCommand = `shell am broadcast -a com.stardust.autojs.execute -d "file://${CONFIG.remoteScriptPath}"`;

  try {
    await adbCommand(broadcastCommand);
    console.log('[Step 4] ✅ Script execution triggered');
    console.log('[Step 4] Check device screen for test progress...');

  } catch (error) {
    console.error('[Step 4] ❌ Script execution failed');
    console.error('[Step 4] Possible causes:');
    console.error('  - AutoX.js not running');
    console.error('  - "ADB broadcast execution" disabled in AutoX.js settings');
    console.error('  - AutoX.js accessibility service not enabled');
    throw error;
  }
}

// =============================================
// Step 5: Wait for test completion
// =============================================
async function waitForCompletion() {
  console.log('\n[Step 5] Waiting for test completion...');
  console.log(`[Step 5] Timeout: ${CONFIG.timeout / 1000} seconds`);

  // Progress indicator
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r[Step 5] Elapsed: ${elapsed}s / ${CONFIG.timeout / 1000}s`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, CONFIG.timeout));

  clearInterval(interval);
  console.log('\n[Step 5] ✅ Wait complete');
}

// =============================================
// Step 6: Pull test report
// =============================================
async function pullReport() {
  console.log('\n[Step 6] Retrieving test report...');

  try {
    // Check if report exists on device
    const fileExists = await adbCommand(`shell "[ -f ${CONFIG.reportRemotePath} ] && echo 'exists' || echo 'missing'"`);

    if (!fileExists.includes('exists')) {
      throw new Error(`Report not found on device: ${CONFIG.reportRemotePath}`);
    }

    // Pull report
    await adbCommand(`pull ${CONFIG.reportRemotePath} "${CONFIG.reportLocalPath}"`);

    console.log(`[Step 6] ✅ Report downloaded: ${CONFIG.reportLocalPath}`);

    // Display report
    const report = fs.readFileSync(CONFIG.reportLocalPath, 'utf8');
    console.log('\n' + '='.repeat(60));
    console.log(report);
    console.log('='.repeat(60) + '\n');

    // Parse results
    const passedMatch = report.match(/Passed: (\d+)\/5/);
    const failedMatch = report.match(/Failed: (\d+)\/5/);

    if (passedMatch && failedMatch) {
      const passed = parseInt(passedMatch[1]);
      const failed = parseInt(failedMatch[1]);

      if (failed === 0) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Phase 0 complete - Ready to proceed to Phase 1');
        return true;
      } else {
        console.log(`⚠️ ${failed} TEST(S) FAILED`);
        console.log('❌ Phase 0 incomplete - Fix errors before proceeding');
        return false;
      }
    }

    return false;

  } catch (error) {
    console.error('[Step 6] ❌ Failed to retrieve report');
    console.error('[Step 6] Possible causes:');
    console.error('  - Tests crashed or did not complete');
    console.error('  - File path changed (check AutoX.js version)');
    console.error('  - Permission issues');
    throw error;
  }
}

// =============================================
// Step 7: Cleanup
// =============================================
async function cleanup() {
  console.log('\n[Step 7] Cleanup...');

  try {
    // Remove script from device
    await adbCommand(`shell rm ${CONFIG.remoteScriptPath}`);
    console.log('[Step 7] ✅ Remote script removed');

  } catch (error) {
    console.warn('[Step 7] ⚠️ Cleanup warning: ' + error.message);
  }
}

// =============================================
// Main execution
// =============================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 0: Pre-Flight Validation Runner                    ║');
  console.log('║  DoAi.me Device Farm - WebView DOM Automation             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Detect devices
    await detectDevices();

    // Step 2: Verify AutoX.js
    await verifyAutoXJS();

    // Step 3: Push script
    await pushScript();

    // Step 4: Execute script
    await executeScript();

    // Step 5: Wait for completion
    await waitForCompletion();

    // Step 6: Pull and analyze report
    const success = await pullReport();

    // Step 7: Cleanup
    await cleanup();

    // Exit with appropriate code
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Pre-Flight Runner Failed');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };

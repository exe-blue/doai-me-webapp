#!/usr/bin/env node

/**
 * minicap Binary Downloader
 * 
 * Downloads minicap binaries using @devicefarmer/minicap-prebuilt npm package.
 * Directory structure matches MinicapManager expectations.
 * 
 * Usage:
 *   node scripts/download-minicap.js
 * 
 * Output:
 *   apps/desktop-agent/resources/minicap/
 *     ├── libs/
 *     │   ├── arm64-v8a/
 *     │   │   └── minicap
 *     │   ├── armeabi-v7a/
 *     │   │   └── minicap
 *     │   ├── x86/
 *     │   │   └── minicap
 *     │   └── x86_64/
 *     │       └── minicap
 *     └── shared/
 *         └── android-{sdk}/
 *             ├── arm64-v8a/
 *             │   └── minicap.so
 *             └── ...
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const NPM_PACKAGE = '@devicefarmer/minicap-prebuilt';
const OUTPUT_DIR = path.join(__dirname, '..', 'apps', 'desktop-agent', 'resources', 'minicap');
const TEMP_DIR = path.join(__dirname, '..', '.tmp', 'minicap-npm');

// Supported ABIs
const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

// Supported Android SDK versions (API levels)
const SDK_VERSIONS = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Make file executable (Unix only)
 */
function makeExecutable(filePath) {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o755);
    } catch (e) {
      console.warn(`  Warning: Could not make ${filePath} executable`);
    }
  }
}

/**
 * Copy file with directory creation
 */
function copyFile(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * Remove directory recursively
 */
function rmdir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// npm Package Installation
// ============================================================================

/**
 * Install npm package to temp directory and return package path
 */
function installNpmPackage() {
  console.log(`\n📦 Installing ${NPM_PACKAGE}...\n`);
  
  // Clean up temp directory
  rmdir(TEMP_DIR);
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  
  // Create minimal package.json
  const packageJson = {
    name: 'minicap-downloader-temp',
    version: '1.0.0',
    private: true,
    dependencies: {
      [NPM_PACKAGE]: 'latest'
    }
  };
  
  fs.writeFileSync(
    path.join(TEMP_DIR, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Install package
  try {
    execSync('npm install --no-audit --no-fund', {
      cwd: TEMP_DIR,
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(`Failed to install ${NPM_PACKAGE}: ${error.message}`);
  }
  
  // Find package directory
  const packageDir = path.join(TEMP_DIR, 'node_modules', '@devicefarmer', 'minicap-prebuilt');
  
  if (!fs.existsSync(packageDir)) {
    throw new Error(`Package directory not found: ${packageDir}`);
  }
  
  console.log(`\n✅ Package installed successfully\n`);
  return packageDir;
}

// ============================================================================
// Binary Copying
// ============================================================================

/**
 * Copy minicap binaries from npm package to output directory
 */
function copyBinaries(packageDir) {
  console.log('📋 Copying minicap binaries...\n');
  
  let binCount = 0;
  let libCount = 0;
  
  // The @devicefarmer/minicap-prebuilt package structure:
  // - prebuilt/{abi}/bin/minicap
  // - prebuilt/{abi}/lib/android-{sdk}/minicap.so
  
  const prebuiltDir = path.join(packageDir, 'prebuilt');
  
  if (!fs.existsSync(prebuiltDir)) {
    throw new Error(`Prebuilt directory not found: ${prebuiltDir}`);
  }
  
  // Copy binaries
  console.log('Copying minicap executables:');
  for (const abi of ABIS) {
    const srcBin = path.join(prebuiltDir, abi, 'bin', 'minicap');
    const destBin = path.join(OUTPUT_DIR, 'libs', abi, 'minicap');
    
    if (fs.existsSync(srcBin)) {
      copyFile(srcBin, destBin);
      makeExecutable(destBin);
      console.log(`  ✓ libs/${abi}/minicap`);
      binCount++;
    } else {
      console.log(`  - libs/${abi}/minicap (not found in package)`);
    }
  }
  
  // Copy shared libraries
  console.log('\nCopying minicap shared libraries:');
  for (const sdk of SDK_VERSIONS) {
    let sdkHasLibs = false;
    
    for (const abi of ABIS) {
      const srcLib = path.join(prebuiltDir, abi, 'lib', `android-${sdk}`, 'minicap.so');
      const destLib = path.join(OUTPUT_DIR, 'shared', `android-${sdk}`, abi, 'minicap.so');
      
      if (fs.existsSync(srcLib)) {
        copyFile(srcLib, destLib);
        if (!sdkHasLibs) {
          console.log(`  Android SDK ${sdk}:`);
          sdkHasLibs = true;
        }
        console.log(`    ✓ ${abi}/minicap.so`);
        libCount++;
      }
    }
    
    if (!sdkHasLibs) {
      // SDK not available in package - this is normal for newer/older SDKs
    }
  }
  
  return { binCount, libCount };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     minicap Binary Downloader          ║');
  console.log('║  (using @devicefarmer/minicap-prebuilt)║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  let packageDir;
  let binCount = 0;
  let libCount = 0;
  
  try {
    // Install npm package
    packageDir = installNpmPackage();
    
    // Copy binaries
    const counts = copyBinaries(packageDir);
    binCount = counts.binCount;
    libCount = counts.libCount;
    
  } finally {
    // Cleanup temp directory
    console.log('\n🧹 Cleaning up temporary files...');
    rmdir(TEMP_DIR);
  }
  
  // Print summary
  console.log('\n════════════════════════════════════════');
  console.log('Download Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Binaries:  ${binCount}/${ABIS.length}`);
  console.log(`  Libraries: ${libCount} (varies by SDK availability)`);
  console.log(`  Location:  ${OUTPUT_DIR}`);
  console.log('');
  console.log('  Directory structure (for MinicapManager):');
  console.log('    libs/{abi}/minicap        - Minicap executables');
  console.log('    shared/android-{sdk}/{abi}/minicap.so - Shared libraries');
  console.log('');
  
  if (binCount === 0) {
    console.log('⚠️  No binaries were copied. minicap streaming will not work.');
    console.log('   Try manually installing: npm install @devicefarmer/minicap-prebuilt');
    console.log('');
    process.exit(1);
  }
  
  console.log('✅ minicap binaries ready!');
  console.log('');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  // Cleanup on error
  rmdir(TEMP_DIR);
  process.exit(1);
});

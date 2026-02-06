// ============================================
// DoAi.Me Worker Core - Minicap Manager
// Minicap binary deployment and management
// ============================================

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { AdbController } from '../AdbController';
import { Logger, defaultLogger } from '../Logger';

/**
 * Minicap deployment information
 */
export interface MinicapDeployInfo {
  /** Path to deployed binary on device */
  binaryPath: string;
  /** Path to deployed shared library on device */
  libPath: string;
  /** Hash of deployed binary */
  binaryHash: string;
  /** Hash of deployed library */
  libHash: string;
}

/**
 * Minicap Manager configuration
 */
export interface MinicapManagerOptions {
  /** Path to minicap binaries directory */
  minicapPath?: string;
  /** Logger instance */
  logger?: Logger;
  /** Deploy target directory on device */
  deployPath?: string;
}

/**
 * Architecture mapping for minicap binaries
 */
const ARCH_MAP: Record<string, string> = {
  'arm64-v8a': 'arm64-v8a',
  'armeabi-v7a': 'armeabi-v7a',
  'armeabi': 'armeabi',
  'x86': 'x86',
  'x86_64': 'x86_64',
};

/**
 * Minicap Manager
 * Handles minicap binary deployment to Android devices
 * 
 * @example
 * ```typescript
 * const manager = new MinicapManager({ minicapPath: './vendor/minicap' });
 * await manager.deployToDevice('device-serial', adbController);
 * ```
 */
export class MinicapManager {
  private logger: Logger;
  private minicapPath: string;
  private deployPath: string;
  private deployedDevices: Map<string, MinicapDeployInfo> = new Map();

  constructor(options: MinicapManagerOptions = {}) {
    this.logger = options.logger ?? defaultLogger.child('MinicapManager');
    this.minicapPath = options.minicapPath ?? path.join(process.cwd(), 'vendor', 'minicap');
    this.deployPath = options.deployPath ?? '/data/local/tmp';
  }

  /**
   * Get the path to the minicap binary for a specific architecture
   * @param arch Device architecture (e.g., 'arm64-v8a', 'armeabi-v7a')
   * @returns Path to the minicap binary
   */
  getMinicapBinaryPath(arch: string): string {
    const normalizedArch = ARCH_MAP[arch] ?? arch;
    return path.join(this.minicapPath, 'libs', normalizedArch, 'minicap');
  }

  /**
   * Get the path to the minicap shared library for a specific SDK version and architecture
   * @param sdk Android SDK version (e.g., 29, 30)
   * @param arch Device architecture
   * @returns Path to the minicap shared library
   */
  getMinicapSharedLibPath(sdk: number, arch: string): string {
    const normalizedArch = ARCH_MAP[arch] ?? arch;
    return path.join(
      this.minicapPath,
      'shared',
      `android-${sdk}`,
      normalizedArch,
      'minicap.so'
    );
  }

  /**
   * Calculate MD5 hash of a file
   * @param filePath Path to the file
   * @returns MD5 hash string
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Get the hash of a file on the device
   * @param serial Device serial number
   * @param adb ADB controller instance
   * @param remotePath Path to file on device
   * @returns MD5 hash or null if file doesn't exist
   */
  private async getDeviceFileHash(
    serial: string,
    adb: AdbController,
    remotePath: string
  ): Promise<string | null> {
    try {
      const output = await adb.executeShell(serial, `md5sum ${remotePath} 2>/dev/null`);
      if (output && !output.includes('No such file')) {
        // md5sum output format: "hash  filename"
        const match = output.match(/^([a-f0-9]{32})/);
        return match ? match[1] : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get device architecture
   * @param serial Device serial number
   * @param adb ADB controller instance
   * @returns Device architecture string
   */
  private async getDeviceArch(serial: string, adb: AdbController): Promise<string> {
    const output = await adb.executeShell(serial, 'getprop ro.product.cpu.abi');
    return output.trim();
  }

  /**
   * Get device SDK version
   * @param serial Device serial number
   * @param adb ADB controller instance
   * @returns SDK version number
   */
  private async getDeviceSdk(serial: string, adb: AdbController): Promise<number> {
    const output = await adb.executeShell(serial, 'getprop ro.build.version.sdk');
    return parseInt(output.trim(), 10);
  }

  /**
   * Check if minicap is already deployed with matching hashes
   * @param serial Device serial number
   * @param adb ADB controller instance
   * @param localBinaryHash Local binary hash
   * @param localLibHash Local library hash
   * @returns True if already deployed with matching files
   */
  private async isAlreadyDeployed(
    serial: string,
    adb: AdbController,
    localBinaryHash: string,
    localLibHash: string
  ): Promise<boolean> {
    const binaryPath = `${this.deployPath}/minicap`;
    const libPath = `${this.deployPath}/minicap.so`;

    const [remoteBinaryHash, remoteLibHash] = await Promise.all([
      this.getDeviceFileHash(serial, adb, binaryPath),
      this.getDeviceFileHash(serial, adb, libPath),
    ]);

    return remoteBinaryHash === localBinaryHash && remoteLibHash === localLibHash;
  }

  /**
   * Deploy minicap binary and shared library to device
   * @param serial Device serial number
   * @param adb ADB controller instance
   * @returns Deployment information
   */
  async deployToDevice(serial: string, adb: AdbController): Promise<MinicapDeployInfo> {
    this.logger.info('Deploying minicap to device', { serial });

    // Get device info
    const [arch, sdk] = await Promise.all([
      this.getDeviceArch(serial, adb),
      this.getDeviceSdk(serial, adb),
    ]);

    this.logger.debug('Device info', { serial, arch, sdk });

    // Get local file paths
    const binaryPath = this.getMinicapBinaryPath(arch);
    const libPath = this.getMinicapSharedLibPath(sdk, arch);

    // Verify local files exist
    if (!fs.existsSync(binaryPath)) {
      const error = new Error(`Minicap binary not found for architecture: ${arch}`);
      this.logger.error('Minicap binary not found', { path: binaryPath, arch });
      throw error;
    }

    if (!fs.existsSync(libPath)) {
      // Try fallback to nearby SDK versions
      const fallbackLib = await this.findFallbackLib(sdk, arch);
      if (!fallbackLib) {
        const error = new Error(`Minicap shared library not found for SDK ${sdk}, arch ${arch}`);
        this.logger.error('Minicap shared library not found', { path: libPath, sdk, arch });
        throw error;
      }
      this.logger.warn('Using fallback shared library', { original: libPath, fallback: fallbackLib });
    }

    const actualLibPath = fs.existsSync(libPath) ? libPath : await this.findFallbackLib(sdk, arch);
    if (!actualLibPath) {
      throw new Error(`Minicap shared library not found for SDK ${sdk}, arch ${arch}`);
    }

    // Calculate local file hashes
    const [localBinaryHash, localLibHash] = await Promise.all([
      this.calculateFileHash(binaryPath),
      this.calculateFileHash(actualLibPath),
    ]);

    // Check if already deployed with same files
    if (await this.isAlreadyDeployed(serial, adb, localBinaryHash, localLibHash)) {
      this.logger.info('Minicap already deployed with matching files', { serial });
      
      const deployInfo: MinicapDeployInfo = {
        binaryPath: `${this.deployPath}/minicap`,
        libPath: `${this.deployPath}/minicap.so`,
        binaryHash: localBinaryHash,
        libHash: localLibHash,
      };
      
      this.deployedDevices.set(serial, deployInfo);
      return deployInfo;
    }

    // Deploy files
    const remoteBinaryPath = `${this.deployPath}/minicap`;
    const remoteLibPath = `${this.deployPath}/minicap.so`;

    this.logger.debug('Pushing minicap files', { 
      binaryPath, 
      remoteBinaryPath,
      libPath: actualLibPath,
      remoteLibPath,
    });

    // Push files in parallel
    await Promise.all([
      adb.push(serial, binaryPath, remoteBinaryPath),
      adb.push(serial, actualLibPath, remoteLibPath),
    ]);

    // Set executable permission on binary
    await adb.executeShell(serial, `chmod 755 ${remoteBinaryPath}`);

    this.logger.info('Minicap deployed successfully', { serial });

    const deployInfo: MinicapDeployInfo = {
      binaryPath: remoteBinaryPath,
      libPath: remoteLibPath,
      binaryHash: localBinaryHash,
      libHash: localLibHash,
    };

    this.deployedDevices.set(serial, deployInfo);
    return deployInfo;
  }

  /**
   * Find a fallback shared library for nearby SDK versions
   * @param sdk Target SDK version
   * @param arch Device architecture
   * @returns Path to fallback library or null
   */
  private async findFallbackLib(sdk: number, arch: string): Promise<string | null> {
    const normalizedArch = ARCH_MAP[arch] ?? arch;
    const sharedDir = path.join(this.minicapPath, 'shared');

    if (!fs.existsSync(sharedDir)) {
      return null;
    }

    // Try SDK versions near the target
    const searchRange = [0, -1, 1, -2, 2, -3, 3];
    
    for (const offset of searchRange) {
      const testSdk = sdk + offset;
      const testPath = path.join(sharedDir, `android-${testSdk}`, normalizedArch, 'minicap.so');
      
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    return null;
  }

  /**
   * Check if minicap is deployed on a device
   * @param serial Device serial number
   * @returns True if deployed
   */
  isDeployed(serial: string): boolean {
    return this.deployedDevices.has(serial);
  }

  /**
   * Get deployment info for a device
   * @param serial Device serial number
   * @returns Deployment info or undefined
   */
  getDeployInfo(serial: string): MinicapDeployInfo | undefined {
    return this.deployedDevices.get(serial);
  }

  /**
   * Clear deployment info for a device
   * @param serial Device serial number
   */
  clearDeployInfo(serial: string): void {
    this.deployedDevices.delete(serial);
  }
}

export default MinicapManager;

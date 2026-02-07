import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EmulatorHealthStatus } from '../types';
import type { EmulatorProvider } from '../providers/EmulatorProvider';

const execFileAsync = promisify(execFile);

// Only allow host:port or device serial patterns to prevent injection
const ADB_SERIAL_PATTERN = /^[a-zA-Z0-9._:\-]+$/;

export class EmulatorHealthChecker {
  private provider: EmulatorProvider;

  constructor(provider: EmulatorProvider) {
    this.provider = provider;
  }

  async check(emulatorId: string): Promise<EmulatorHealthStatus> {
    const info = await this.provider.getInfo(emulatorId);
    if (!info) {
      return {
        id: emulatorId,
        healthy: false,
        adbResponsive: false,
        containerRunning: false,
        lastChecked: Date.now(),
        errorMessage: 'Emulator not found',
      };
    }

    const containerRunning = info.state === 'running' || info.state === 'ready';
    let adbResponsive = false;

    if (containerRunning) {
      try {
        if (!ADB_SERIAL_PATTERN.test(info.adbSerial)) {
          throw new Error(`Invalid adb serial: ${info.adbSerial}`);
        }
        const { stdout } = await execFileAsync(
          'adb', ['-s', info.adbSerial, 'shell', 'getprop', 'sys.boot_completed'],
          { timeout: 5000 },
        );
        adbResponsive = stdout.trim() === '1';
      } catch {
        adbResponsive = false;
      }
    }

    return {
      id: emulatorId,
      healthy: containerRunning && adbResponsive,
      adbResponsive,
      containerRunning,
      lastChecked: Date.now(),
    };
  }

  async checkAll(): Promise<EmulatorHealthStatus[]> {
    const emulators = await this.provider.listAll();
    return Promise.all(emulators.map((emu) => this.check(emu.id)));
  }
}

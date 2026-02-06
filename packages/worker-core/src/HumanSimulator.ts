// ============================================
// DoAi.Me Worker Core - Human Behavior Simulator
// Shared human-like interaction utilities for all workers
// ============================================

import { AdbController } from './AdbController';

export interface HumanSimulatorConfig {
  baseDelayMs: number;
  delayVariance: number;
  likeProbability: number;
  commentProbability: number;
  minScrollIntervalSec: number;
  maxScrollIntervalSec: number;
  screenWidth: number;
  screenHeight: number;
  /** Coordinate variance in pixels (default: 15) */
  coordVariancePx: number;
  /** Maximum additional delay per node in ms (default: 3000) */
  maxNodeVarianceMs: number;
  /** Character delay for typing simulation in ms (default: 80) */
  charDelayMs: number;
}

export const DEFAULT_HUMAN_SIMULATOR_CONFIG: HumanSimulatorConfig = {
  baseDelayMs: 1000,
  delayVariance: 0.3,
  likeProbability: 0.1,
  commentProbability: 0.02,
  minScrollIntervalSec: 15,
  maxScrollIntervalSec: 45,
  screenWidth: 1080,
  screenHeight: 1920,
  coordVariancePx: 15,
  maxNodeVarianceMs: 3000,
  charDelayMs: 80,
};

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export class HumanSimulator {
  private config: HumanSimulatorConfig;
  private adbController: AdbController;

  constructor(adbController: AdbController, config: Partial<HumanSimulatorConfig> = {}) {
    this.adbController = adbController;
    this.config = { ...DEFAULT_HUMAN_SIMULATOR_CONFIG, ...config };
  }

  getConfig(): HumanSimulatorConfig { return { ...this.config }; }
  updateConfig(config: Partial<HumanSimulatorConfig>): void { this.config = { ...this.config, ...config }; }

  // --- Core Utilities (NEW - from plan PR #2) ---

  /**
   * Add coordinate variance (±pixels) for more human-like tapping
   */
  addCoordVariance(x: number, y: number, variance?: number): [number, number] {
    const v = variance ?? this.config.coordVariancePx;
    const dx = Math.floor((Math.random() * 2 - 1) * v);
    const dy = Math.floor((Math.random() * 2 - 1) * v);
    return [
      Math.max(0, Math.min(this.config.screenWidth, x + dx)),
      Math.max(0, Math.min(this.config.screenHeight, y + dy)),
    ];
  }

  /**
   * Random delay between min and max milliseconds
   */
  async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Add node-specific variance to base delay (for distributed bot farms)
   */
  addNodeVariance(baseDelay: number, nodeId: string): number {
    // Use nodeId hash to create consistent but different variance per node
    let hash = 0;
    for (let i = 0; i < nodeId.length; i++) {
      hash = ((hash << 5) - hash + nodeId.charCodeAt(i)) | 0;
    }
    const normalizedHash = Math.abs(hash) / 2147483647; // normalize to 0-1
    const extraDelay = Math.floor(normalizedHash * this.config.maxNodeVarianceMs);
    return baseDelay + extraDelay;
  }

  /**
   * Type text with natural per-character delays
   */
  async typeWithDelay(serial: string, text: string): Promise<void> {
    for (const char of text) {
      // Escape special characters for shell
      const escaped = char.replace(/(['"\\])/g, '\\$1').replace(/ /g, '%s');
      await this.adbController.executeShell(serial, `input text "${escaped}"`);
      // Variable delay per character (60-120% of base)
      const delay = Math.floor(this.config.charDelayMs * (0.6 + Math.random() * 0.6));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Probability-based action decision
   */
  shouldPerform(probability: number): boolean {
    return Math.random() < probability;
  }

  // --- Existing methods (kept from youtube-bot version) ---

  addVariance(value: number, varianceFactor?: number): number {
    const variance = varianceFactor ?? this.config.delayVariance;
    const min = value * (1 - variance);
    const max = value * (1 + variance);
    return Math.floor(min + Math.random() * (max - min));
  }

  async wait(ms?: number): Promise<void> {
    const delay = ms !== undefined ? this.addVariance(ms) : this.addVariance(this.config.baseDelayMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async tap(serial: string, x: number, y: number, durationMs?: number): Promise<void> {
    const [actualX, actualY] = this.addCoordVariance(x, y);
    if (durationMs && durationMs > 100) {
      await this.adbController.executeShell(serial, `input swipe ${actualX} ${actualY} ${actualX} ${actualY} ${durationMs}`);
    } else {
      await this.adbController.executeShell(serial, `input tap ${actualX} ${actualY}`);
    }
    await this.wait(200);
  }

  async scroll(serial: string, direction: ScrollDirection, distance: number = 0.3): Promise<void> {
    const { screenWidth, screenHeight } = this.config;
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    const scrollDistance = this.addVariance(distance, 0.2);
    let startX: number, startY: number, endX: number, endY: number;
    switch (direction) {
      case 'up':
        startX = centerX; startY = centerY + (screenHeight * scrollDistance) / 2;
        endX = centerX; endY = centerY - (screenHeight * scrollDistance) / 2;
        break;
      case 'down':
        startX = centerX; startY = centerY - (screenHeight * scrollDistance) / 2;
        endX = centerX; endY = centerY + (screenHeight * scrollDistance) / 2;
        break;
      case 'left':
        startX = centerX + (screenWidth * scrollDistance) / 2; startY = centerY;
        endX = centerX - (screenWidth * scrollDistance) / 2; endY = centerY;
        break;
      case 'right':
        startX = centerX - (screenWidth * scrollDistance) / 2; startY = centerY;
        endX = centerX + (screenWidth * scrollDistance) / 2; endY = centerY;
        break;
    }
    startX = this.addVariance(startX, 0.05);
    startY = this.addVariance(startY, 0.05);
    endX = this.addVariance(endX, 0.05);
    endY = this.addVariance(endY, 0.05);
    const dur = this.addVariance(500, 0.4);
    await this.adbController.executeShell(serial, `input swipe ${Math.floor(startX)} ${Math.floor(startY)} ${Math.floor(endX)} ${Math.floor(endY)} ${dur}`);
    await this.wait(300);
  }

  async randomScrollDuringWatch(serial: string): Promise<void> {
    const direction: ScrollDirection = Math.random() > 0.5 ? 'up' : 'down';
    await this.scroll(serial, direction, 0.05 + Math.random() * 0.1);
  }

  shouldLike(): boolean { return this.shouldPerform(this.config.likeProbability); }
  shouldComment(): boolean { return this.shouldPerform(this.config.commentProbability); }

  getRandomScrollInterval(): number {
    const { minScrollIntervalSec, maxScrollIntervalSec } = this.config;
    return Math.floor((minScrollIntervalSec + Math.random() * (maxScrollIntervalSec - minScrollIntervalSec)) * 1000);
  }

  async simulateWatching(serial: string, durationSeconds: number, onProgress?: (elapsed: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;
    let nextScrollTime = startTime + this.getRandomScrollInterval();
    while (Date.now() < endTime) {
      if (signal?.aborted) throw new Error('Watching simulation cancelled');
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      onProgress?.(elapsed, durationSeconds);
      if (Date.now() >= nextScrollTime) {
        await this.randomScrollDuringWatch(serial);
        nextScrollTime = Date.now() + this.getRandomScrollInterval();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    onProgress?.(durationSeconds, durationSeconds);
  }

  async doubleTap(serial: string, x: number, y: number): Promise<void> {
    await this.tap(serial, x, y);
    await this.wait(100);
    await this.tap(serial, x, y);
  }

  async inputText(serial: string, text: string): Promise<void> {
    const escaped = text.replace(/(['"\\])/g, '\\$1').replace(/ /g, '%s');
    await this.adbController.executeShell(serial, `input text "${escaped}"`);
    await this.wait(300);
  }

  async pressKey(serial: string, keycode: number | string): Promise<void> {
    await this.adbController.executeShell(serial, `input keyevent ${keycode}`);
    await this.wait(200);
  }

  async pressBack(serial: string): Promise<void> { await this.pressKey(serial, 4); }
  async pressHome(serial: string): Promise<void> { await this.pressKey(serial, 3); }
  async pressEnter(serial: string): Promise<void> { await this.pressKey(serial, 66); }
}

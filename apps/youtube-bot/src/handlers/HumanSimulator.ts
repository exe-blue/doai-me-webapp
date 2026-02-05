// ============================================
// DoAi.Me YouTube Bot - Human Behavior Simulator
// Simulates human-like interactions on devices
// ============================================

import { AdbController } from '@doai/worker-core';

/**
 * Configuration for human simulation behavior
 */
export interface HumanSimulatorConfig {
  /** Base delay between actions in milliseconds (default: 1000) */
  baseDelayMs: number;
  /** Variance factor for delays (0-1, default: 0.3) */
  delayVariance: number;
  /** Probability of liking a video (0-1, default: 0.1) */
  likeProbability: number;
  /** Probability of commenting on a video (0-1, default: 0.02) */
  commentProbability: number;
  /** Minimum scroll interval during watching in seconds (default: 15) */
  minScrollIntervalSec: number;
  /** Maximum scroll interval during watching in seconds (default: 45) */
  maxScrollIntervalSec: number;
  /** Screen width for coordinate calculations */
  screenWidth: number;
  /** Screen height for coordinate calculations */
  screenHeight: number;
}

/**
 * Default configuration for human simulator
 */
export const DEFAULT_HUMAN_SIMULATOR_CONFIG: HumanSimulatorConfig = {
  baseDelayMs: 1000,
  delayVariance: 0.3,
  likeProbability: 0.1,
  commentProbability: 0.02,
  minScrollIntervalSec: 15,
  maxScrollIntervalSec: 45,
  screenWidth: 1080,
  screenHeight: 1920,
};

/**
 * Scroll direction for swipe gestures
 */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Human behavior simulator for Android devices
 * Provides realistic delays and interactions to avoid bot detection
 */
export class HumanSimulator {
  private config: HumanSimulatorConfig;
  private adbController: AdbController;

  constructor(adbController: AdbController, config: Partial<HumanSimulatorConfig> = {}) {
    this.adbController = adbController;
    this.config = { ...DEFAULT_HUMAN_SIMULATOR_CONFIG, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HumanSimulatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HumanSimulatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate a random delay within the configured variance
   * @param baseMs - Base delay in milliseconds (defaults to config.baseDelayMs)
   * @returns Random delay in milliseconds
   */
  randomDelay(baseMs?: number): number {
    const base = baseMs ?? this.config.baseDelayMs;
    return this.addVariance(base);
  }

  /**
   * Add variance to a value
   * @param value - Base value
   * @param varianceFactor - Optional variance factor (0-1)
   * @returns Value with added variance
   */
  addVariance(value: number, varianceFactor?: number): number {
    const variance = varianceFactor ?? this.config.delayVariance;
    const min = value * (1 - variance);
    const max = value * (1 + variance);
    return Math.floor(min + Math.random() * (max - min));
  }

  /**
   * Wait for a specified time with optional variance
   * @param ms - Time to wait in milliseconds (default: config.baseDelayMs)
   */
  async wait(ms?: number): Promise<void> {
    const delay = ms !== undefined ? this.addVariance(ms) : this.randomDelay();
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Perform a tap on the device
   * @param serial - Device serial number
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param durationMs - Optional tap duration for long press
   */
  async tap(serial: string, x: number, y: number, durationMs?: number): Promise<void> {
    // Add small variance to coordinates for more human-like behavior
    const actualX = this.addVariance(x, 0.02);
    const actualY = this.addVariance(y, 0.02);

    if (durationMs && durationMs > 100) {
      // Long press using swipe with same start/end coordinates
      const command = `input swipe ${Math.floor(actualX)} ${Math.floor(actualY)} ${Math.floor(actualX)} ${Math.floor(actualY)} ${durationMs}`;
      await this.adbController.executeShell(serial, command);
    } else {
      const command = `input tap ${Math.floor(actualX)} ${Math.floor(actualY)}`;
      await this.adbController.executeShell(serial, command);
    }

    // Brief pause after tap
    await this.wait(200);
  }

  /**
   * Perform a scroll gesture on the device
   * @param serial - Device serial number
   * @param direction - Scroll direction
   * @param distance - Scroll distance as a fraction of screen (0-1, default: 0.3)
   */
  async scroll(serial: string, direction: ScrollDirection, distance: number = 0.3): Promise<void> {
    const { screenWidth, screenHeight } = this.config;
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    let startX: number, startY: number, endX: number, endY: number;

    // Add variance to scroll distance
    const scrollDistance = this.addVariance(distance, 0.2);

    switch (direction) {
      case 'up':
        // Scroll up means swipe from bottom to top
        startX = centerX;
        startY = centerY + (screenHeight * scrollDistance) / 2;
        endX = centerX;
        endY = centerY - (screenHeight * scrollDistance) / 2;
        break;
      case 'down':
        // Scroll down means swipe from top to bottom
        startX = centerX;
        startY = centerY - (screenHeight * scrollDistance) / 2;
        endX = centerX;
        endY = centerY + (screenHeight * scrollDistance) / 2;
        break;
      case 'left':
        // Scroll left means swipe from right to left
        startX = centerX + (screenWidth * scrollDistance) / 2;
        startY = centerY;
        endX = centerX - (screenWidth * scrollDistance) / 2;
        endY = centerY;
        break;
      case 'right':
        // Scroll right means swipe from left to right
        startX = centerX - (screenWidth * scrollDistance) / 2;
        startY = centerY;
        endX = centerX + (screenWidth * scrollDistance) / 2;
        endY = centerY;
        break;
    }

    // Add small random offset for natural movement
    startX = this.addVariance(startX, 0.05);
    startY = this.addVariance(startY, 0.05);
    endX = this.addVariance(endX, 0.05);
    endY = this.addVariance(endY, 0.05);

    // Random duration for natural scroll speed (300-700ms)
    const durationMs = this.addVariance(500, 0.4);

    const command = `input swipe ${Math.floor(startX)} ${Math.floor(startY)} ${Math.floor(endX)} ${Math.floor(endY)} ${durationMs}`;
    await this.adbController.executeShell(serial, command);

    // Brief pause after scroll
    await this.wait(300);
  }

  /**
   * Perform random scrolling during video watching
   * Simulates occasional scrolling behavior humans do while watching
   * @param serial - Device serial number
   */
  async randomScrollDuringWatch(serial: string): Promise<void> {
    // Small random scroll in either direction
    const direction: ScrollDirection = Math.random() > 0.5 ? 'up' : 'down';
    const smallDistance = 0.05 + Math.random() * 0.1; // 5-15% of screen

    await this.scroll(serial, direction, smallDistance);
  }

  /**
   * Determine if the bot should like the current video
   * @returns Whether to perform like action
   */
  shouldLike(): boolean {
    return Math.random() < this.config.likeProbability;
  }

  /**
   * Determine if the bot should comment on the current video
   * @returns Whether to perform comment action
   */
  shouldComment(): boolean {
    return Math.random() < this.config.commentProbability;
  }

  /**
   * Get random interval between scroll actions during watching
   * @returns Interval in milliseconds
   */
  getRandomScrollInterval(): number {
    const { minScrollIntervalSec, maxScrollIntervalSec } = this.config;
    const intervalSec = minScrollIntervalSec + Math.random() * (maxScrollIntervalSec - minScrollIntervalSec);
    return Math.floor(intervalSec * 1000);
  }

  /**
   * Simulate watching a video for a specified duration
   * Includes realistic human behaviors like occasional scrolling
   * @param serial - Device serial number
   * @param durationSeconds - Watch duration in seconds
   * @param onProgress - Optional callback for progress updates
   * @param signal - Optional abort signal for cancellation
   */
  async simulateWatching(
    serial: string,
    durationSeconds: number,
    onProgress?: (elapsed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;
    let nextScrollTime = startTime + this.getRandomScrollInterval();

    while (Date.now() < endTime) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Watching simulation cancelled');
      }

      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);

      // Report progress
      if (onProgress) {
        onProgress(elapsed, durationSeconds);
      }

      // Perform random scroll if it's time
      if (now >= nextScrollTime) {
        await this.randomScrollDuringWatch(serial);
        nextScrollTime = now + this.getRandomScrollInterval();
      }

      // Wait a short interval before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Final progress report
    if (onProgress) {
      onProgress(durationSeconds, durationSeconds);
    }
  }

  /**
   * Simulate double-tap (like gesture in YouTube Shorts)
   * @param serial - Device serial number
   * @param x - X coordinate (center of video)
   * @param y - Y coordinate (center of video)
   */
  async doubleTap(serial: string, x: number, y: number): Promise<void> {
    await this.tap(serial, x, y);
    await this.wait(100);
    await this.tap(serial, x, y);
  }

  /**
   * Input text on the device
   * @param serial - Device serial number
   * @param text - Text to input
   */
  async inputText(serial: string, text: string): Promise<void> {
    // Escape special characters for shell
    const escapedText = text.replace(/(['"\\])/g, '\\$1').replace(/ /g, '%s');
    const command = `input text "${escapedText}"`;
    await this.adbController.executeShell(serial, command);
    await this.wait(300);
  }

  /**
   * Press a key on the device
   * @param serial - Device serial number
   * @param keycode - Android keycode (e.g., 4 for back, 3 for home)
   */
  async pressKey(serial: string, keycode: number | string): Promise<void> {
    const command = `input keyevent ${keycode}`;
    await this.adbController.executeShell(serial, command);
    await this.wait(200);
  }

  /**
   * Press the back button
   * @param serial - Device serial number
   */
  async pressBack(serial: string): Promise<void> {
    await this.pressKey(serial, 4); // KEYCODE_BACK
  }

  /**
   * Press the home button
   * @param serial - Device serial number
   */
  async pressHome(serial: string): Promise<void> {
    await this.pressKey(serial, 3); // KEYCODE_HOME
  }

  /**
   * Press enter/confirm key
   * @param serial - Device serial number
   */
  async pressEnter(serial: string): Promise<void> {
    await this.pressKey(serial, 66); // KEYCODE_ENTER
  }
}

export default HumanSimulator;

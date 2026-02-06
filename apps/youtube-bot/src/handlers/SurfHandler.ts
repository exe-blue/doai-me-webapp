// ============================================
// DoAi.Me YouTube Bot - Surf Handler
// Handles random YouTube browsing/surfing jobs
// ============================================

import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';
import { HumanSimulator, HumanSimulatorConfig } from './HumanSimulator';

/**
 * Parameters for YouTube surf job
 */
export interface SurfJobParams {
  /** Number of videos to surf through (default: 3) */
  videoCount?: number;
  /** Min watch time per video in seconds (default: 15) */
  minWatchSeconds?: number;
  /** Max watch time per video in seconds (default: 120) */
  maxWatchSeconds?: number;
  /** Whether to interact randomly (like, comment) during surfing */
  enableInteractions?: boolean;
  /** Human simulation config overrides */
  humanSimConfig?: Partial<HumanSimulatorConfig>;
}

/**
 * Result data for YouTube surf job
 */
export interface SurfJobResultData {
  /** Number of videos surfed */
  videosSurfed: number;
  /** Total time spent surfing in seconds */
  totalDurationSeconds: number;
  /** Whether any videos were liked */
  videosLiked: number;
  /** Timestamp when surfing started */
  startedAt: number;
  /** Timestamp when surfing ended */
  endedAt: number;
}

/**
 * YouTube Surf Job Handler
 * Handles random browsing on YouTube home feed
 */
export class SurfHandler implements JobHandler {
  readonly name = 'youtube_surf';
  readonly supportedWorkflows = ['youtube_surf', 'youtube_browse', 'random_surf'];

  private adb: AdbController;
  private logger: Logger;

  private readonly YOUTUBE_PACKAGE = 'com.google.android.youtube';
  private readonly YOUTUBE_ACTIVITY = 'com.google.android.youtube.HomeActivity';

  // UI coordinates (1080x1920)
  private readonly UI = {
    homeTab: { x: 100, y: 1850 },
    videoFeed: { x: 540, y: 800 },
    likeButton: { x: 170, y: 1400 },
    miniPlayerClose: { x: 980, y: 1750 },
  };

  constructor(adb: AdbController, logger?: Logger) {
    this.adb = adb;
    this.logger = logger ?? defaultLogger.child('SurfHandler');
  }

  validate(params: Record<string, unknown>): boolean | string {
    const p = params as unknown as SurfJobParams;
    if (p.videoCount !== undefined && p.videoCount < 1) return 'videoCount must be at least 1';
    if (p.minWatchSeconds !== undefined && p.maxWatchSeconds !== undefined && p.minWatchSeconds > p.maxWatchSeconds) {
      return 'minWatchSeconds cannot be greater than maxWatchSeconds';
    }
    return true;
  }

  async execute(context: JobContext): Promise<JobResult> {
    const { deviceId, params, signal, reportProgress, logger } = context;
    const surfParams = params as unknown as SurfJobParams;

    const videoCount = surfParams.videoCount ?? 3;
    const minWatch = surfParams.minWatchSeconds ?? 15;
    const maxWatch = surfParams.maxWatchSeconds ?? 120;
    const enableInteractions = surfParams.enableInteractions ?? true;

    const startedAt = Date.now();
    let videosSurfed = 0;
    let videosLiked = 0;

    try {
      const simulator = new HumanSimulator(this.adb, surfParams.humanSimConfig);

      // Step 1: Launch YouTube
      reportProgress(5, 'Launching YouTube');
      await this.adb.executeShell(deviceId, `am start -n ${this.YOUTUBE_PACKAGE}/${this.YOUTUBE_ACTIVITY}`);
      await simulator.wait(3000);

      // Step 2: Go to Home tab
      reportProgress(10, 'Navigating to Home tab');
      await simulator.tap(deviceId, this.UI.homeTab.x, this.UI.homeTab.y);
      await simulator.wait(2000);

      // Step 3: Surf through videos
      for (let i = 0; i < videoCount; i++) {
        if (signal?.aborted) break;

        const progress = 10 + Math.floor(((i + 1) / videoCount) * 80);
        reportProgress(progress, `Surfing video ${i + 1}/${videoCount}`);

        // Scroll feed to find new video
        const scrollCount = 1 + Math.floor(Math.random() * 3);
        for (let s = 0; s < scrollCount; s++) {
          await simulator.scroll(deviceId, 'up', 0.3 + Math.random() * 0.2);
          await simulator.wait(1000);
        }

        // Tap a video in the feed
        const videoY = 400 + Math.floor(Math.random() * 600);
        await simulator.tap(deviceId, this.UI.videoFeed.x, videoY);
        await simulator.wait(2000);

        // Watch for random duration
        const watchDuration = Math.floor(Math.random() * (maxWatch - minWatch + 1)) + minWatch;
        logger.info(`Watching video ${i + 1} for ${watchDuration}s`);

        await simulator.simulateWatching(deviceId, watchDuration, undefined, signal);

        // Random like
        if (enableInteractions && simulator.shouldLike()) {
          await simulator.tap(deviceId, this.UI.likeButton.x, this.UI.likeButton.y);
          await simulator.wait(500);
          videosLiked++;
        }

        videosSurfed++;

        // Go back to feed
        await simulator.pressBack(deviceId);
        await simulator.wait(1500);
      }

      // Final cleanup
      reportProgress(95, 'Finishing surf session');
      await simulator.pressHome(deviceId);

      const endedAt = Date.now();
      const totalDuration = Math.floor((endedAt - startedAt) / 1000);
      reportProgress(100, 'Surf complete');

      const resultData: SurfJobResultData = {
        videosSurfed,
        totalDurationSeconds: totalDuration,
        videosLiked,
        startedAt,
        endedAt,
      };

      return { success: true, data: resultData as unknown as Record<string, unknown> };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Surf job failed', { error: msg });

      return {
        success: false,
        data: { videosSurfed, videosLiked, startedAt, endedAt: Date.now(), totalDurationSeconds: Math.floor((Date.now() - startedAt) / 1000) } as unknown as Record<string, unknown>,
        error: { code: 'SURF_FAILED', message: msg, recoverable: true },
      };
    }
  }

  async cleanup(context: JobContext): Promise<void> {
    try {
      await this.adb.executeShell(context.deviceId, 'input keyevent 3');
    } catch { /* ignore */ }
  }
}

export default SurfHandler;

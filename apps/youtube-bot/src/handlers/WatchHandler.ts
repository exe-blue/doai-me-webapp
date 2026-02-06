// ============================================
// DoAi.Me YouTube Bot - Watch Handler
// Handles YouTube video watching jobs
// ============================================

import { JobHandler, JobContext, JobResult } from '@doai/worker-types';
import { AdbController, Logger, defaultLogger } from '@doai/worker-core';
import { HumanSimulator, HumanSimulatorConfig } from './HumanSimulator';

/**
 * Parameters for YouTube watch job
 */
export interface WatchJobParams {
  /** YouTube video URL or video ID */
  videoUrl: string;
  /** Watch duration in seconds (default: full video or 60s) */
  watchDurationSeconds?: number;
  /** Minimum watch duration in seconds (for random duration) */
  watchDurationMinSeconds?: number;
  /** Maximum watch duration in seconds (for random duration) */
  watchDurationMaxSeconds?: number;
  /** Whether to like the video (default: probabilistic) */
  like?: boolean;
  /** Whether to comment on the video (default: probabilistic) */
  comment?: boolean;
  /** Comment text (required if comment is true) */
  commentText?: string;
  /** Whether to subscribe to the channel (default: false) */
  subscribe?: boolean;
  /** Search keyword to find the video (alternative to direct URL) */
  searchKeyword?: string;
  /** Human simulation configuration overrides */
  humanSimConfig?: Partial<HumanSimulatorConfig>;
}

/**
 * Result data for YouTube watch job
 */
export interface WatchJobResultData {
  /** Video ID that was watched */
  videoId: string;
  /** Actual watch duration in seconds */
  watchedDuration: number;
  /** Whether the video was liked */
  liked: boolean;
  /** Whether a comment was posted */
  commented: boolean;
  /** Whether subscribed to the channel */
  subscribed: boolean;
  /** Timestamp when watching started */
  startedAt: number;
  /** Timestamp when watching ended */
  endedAt: number;
}

/**
 * YouTube Watch Job Handler
 * Handles watching YouTube videos with human-like behavior
 */
export class WatchHandler implements JobHandler {
  readonly name = 'youtube_watch';
  readonly supportedWorkflows = ['youtube_watch', 'youtube_view', 'video_watch'];

  private adbController: AdbController;
  private logger: Logger;
  private cancelled = false;
  private abortController: AbortController | null = null;

  // YouTube package and activity info
  private readonly YOUTUBE_PACKAGE = 'com.google.android.youtube';
  private readonly YOUTUBE_ACTIVITY = 'com.google.android.youtube.HomeActivity';

  // YouTube UI coordinates (for 1080x1920 resolution, adjust as needed)
  private readonly UI_COORDS = {
    likeButton: { x: 170, y: 1400 },
    commentButton: { x: 540, y: 1400 },
    subscribeButton: { x: 900, y: 650 },
    searchIcon: { x: 950, y: 100 },
    searchInput: { x: 540, y: 150 },
    videoCenter: { x: 540, y: 600 },
  };

  constructor(adbController: AdbController, logger?: Logger) {
    this.adbController = adbController;
    this.logger = logger ?? defaultLogger.child('WatchHandler');
  }

  /**
   * Calculate random watch duration within min/max range
   */
  private calculateRandomDuration(params: WatchJobParams): number {
    // If explicit duration is set, use it
    if (params.watchDurationSeconds !== undefined) {
      return params.watchDurationSeconds;
    }

    // If min/max range is set, randomize
    const minSec = params.watchDurationMinSeconds ?? 30;
    const maxSec = params.watchDurationMaxSeconds ?? 180;
    return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  }

  /**
   * Validate job parameters
   */
  validate(params: Record<string, unknown>): boolean | string {
    const watchParams = params as unknown as WatchJobParams;

    if (!watchParams.videoUrl && !watchParams.searchKeyword) {
      return 'Either videoUrl or searchKeyword is required';
    }

    if (watchParams.comment && !watchParams.commentText) {
      return 'commentText is required when comment is true';
    }

    if (watchParams.watchDurationSeconds !== undefined && watchParams.watchDurationSeconds < 1) {
      return 'watchDurationSeconds must be at least 1';
    }

    return true;
  }

  /**
   * Execute the YouTube watch job
   */
  async execute(context: JobContext): Promise<JobResult> {
    const { jobId, deviceId, params, signal, reportProgress, logger } = context;
    const watchParams = params as unknown as WatchJobParams;

    this.cancelled = false;
    this.abortController = new AbortController();

    // Link external signal to our abort controller
    if (signal) {
      signal.addEventListener('abort', () => {
        this.abortController?.abort();
      });
    }

    const startedAt = Date.now();
    let watchedDuration = 0;
    let liked = false;
    let commented = false;
    let subscribed = false;

    try {
      logger.info('Starting YouTube watch job', { jobId, deviceId, videoUrl: watchParams.videoUrl });
      reportProgress(5, 'Initializing YouTube watch');

      // Create human simulator with custom config if provided
      const simulator = new HumanSimulator(this.adbController, watchParams.humanSimConfig);

      // Extract video ID
      const videoId = this.extractVideoId(watchParams.videoUrl);
      if (!videoId && !watchParams.searchKeyword) {
        throw new Error('Could not extract video ID from URL');
      }

      // Step 1: Launch YouTube app
      reportProgress(10, 'Launching YouTube app');
      await this.launchYouTube(deviceId);
      await simulator.wait(3000);

      // Check for cancellation
      if (this.cancelled || this.abortController.signal.aborted) {
        return this.createCancelledResult(videoId ?? '', watchedDuration, liked, commented, subscribed, startedAt);
      }

      // Step 2: Open video
      reportProgress(20, 'Opening video');
      if (watchParams.searchKeyword) {
        await this.searchAndOpenVideo(deviceId, watchParams.searchKeyword, simulator);
      } else if (videoId) {
        await this.openVideoDirectly(deviceId, videoId);
      }
      await simulator.wait(2000);

      // Check for cancellation
      if (this.cancelled || this.abortController.signal.aborted) {
        return this.createCancelledResult(videoId ?? '', watchedDuration, liked, commented, subscribed, startedAt);
      }

      // Step 3: Watch video
      const watchDuration = this.calculateRandomDuration(watchParams);
      reportProgress(30, `Watching video for ${watchDuration} seconds`);

      await simulator.simulateWatching(
        deviceId,
        watchDuration,
        (elapsed, total) => {
          const progress = 30 + Math.floor((elapsed / total) * 50);
          reportProgress(progress, `Watching: ${elapsed}/${total} seconds`);
        },
        this.abortController.signal
      );
      watchedDuration = watchDuration;

      // Check for cancellation
      if (this.cancelled || this.abortController.signal.aborted) {
        return this.createCancelledResult(videoId ?? '', watchedDuration, liked, commented, subscribed, startedAt);
      }

      // Step 4: Optional actions
      reportProgress(85, 'Performing optional actions');

      // Like video
      const shouldLike = watchParams.like ?? simulator.shouldLike();
      if (shouldLike) {
        logger.info('Liking video', { videoId });
        await this.likeVideo(deviceId, simulator);
        liked = true;
      }

      // Comment on video
      const shouldComment = watchParams.comment ?? (watchParams.commentText ? true : simulator.shouldComment());
      if (shouldComment && watchParams.commentText) {
        logger.info('Commenting on video', { videoId });
        await this.commentOnVideo(deviceId, watchParams.commentText, simulator);
        commented = true;
      }

      // Subscribe to channel
      if (watchParams.subscribe) {
        logger.info('Subscribing to channel', { videoId });
        await this.subscribeToChannel(deviceId, simulator);
        subscribed = true;
      }

      // Step 5: Clean up
      reportProgress(95, 'Cleaning up');
      await simulator.pressBack(deviceId);
      await simulator.wait(500);

      const endedAt = Date.now();
      reportProgress(100, 'YouTube watch completed');

      logger.info('YouTube watch job completed successfully', {
        jobId,
        videoId,
        watchedDuration,
        liked,
        commented,
        subscribed,
      });

      const resultData: WatchJobResultData = {
        videoId: videoId ?? watchParams.searchKeyword ?? '',
        watchedDuration,
        liked,
        commented,
        subscribed,
        startedAt,
        endedAt,
      };

      return {
        success: true,
        data: resultData as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('YouTube watch job failed', { jobId, error: errorMessage });

      return {
        success: false,
        error: {
          code: 'WATCH_FAILED',
          message: errorMessage,
          recoverable: !this.cancelled,
        },
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel the current job
   */
  cancel(): void {
    this.cancelled = true;
    this.abortController?.abort();
    this.logger.info('Watch handler cancel requested');
  }

  /**
   * Cleanup after job completion
   */
  async cleanup(context: JobContext): Promise<void> {
    const { deviceId, logger } = context;
    
    try {
      // Press home to exit YouTube
      await this.adbController.executeShell(deviceId, 'input keyevent 3');
      logger.debug('Cleanup completed');
    } catch (error) {
      logger.warn('Cleanup failed', { error: String(error) });
    }
  }

  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(url: string): string | null {
    if (!url) return null;

    // Already a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    // Standard YouTube URL
    const standardMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (standardMatch) {
      return standardMatch[1];
    }

    // YouTube Shorts URL
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      return shortsMatch[1];
    }

    // Embedded URL
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    return null;
  }

  /**
   * Launch YouTube app
   */
  private async launchYouTube(serial: string): Promise<void> {
    const command = `am start -n ${this.YOUTUBE_PACKAGE}/${this.YOUTUBE_ACTIVITY}`;
    await this.adbController.executeShell(serial, command);
  }

  /**
   * Open video directly using deep link
   */
  private async openVideoDirectly(serial: string, videoId: string): Promise<void> {
    const command = `am start -a android.intent.action.VIEW -d "https://www.youtube.com/watch?v=${videoId}"`;
    await this.adbController.executeShell(serial, command);
  }

  /**
   * Search and open video using keyword
   */
  private async searchAndOpenVideo(serial: string, keyword: string, simulator: HumanSimulator): Promise<void> {
    // Tap search icon
    await simulator.tap(serial, this.UI_COORDS.searchIcon.x, this.UI_COORDS.searchIcon.y);
    await simulator.wait(1500);

    // Input search keyword
    await simulator.inputText(serial, keyword);
    await simulator.wait(500);

    // Press enter to search
    await simulator.pressEnter(serial);
    await simulator.wait(3000);

    // Tap first result (approximate position)
    const firstResultY = 400;
    await simulator.tap(serial, this.UI_COORDS.videoCenter.x, firstResultY);
  }

  /**
   * Like the current video
   */
  private async likeVideo(serial: string, simulator: HumanSimulator): Promise<void> {
    await simulator.tap(serial, this.UI_COORDS.likeButton.x, this.UI_COORDS.likeButton.y);
    await simulator.wait(1000);
  }

  /**
   * Comment on the current video
   */
  private async commentOnVideo(serial: string, commentText: string, simulator: HumanSimulator): Promise<void> {
    // Tap comment button
    await simulator.tap(serial, this.UI_COORDS.commentButton.x, this.UI_COORDS.commentButton.y);
    await simulator.wait(2000);

    // Tap comment input area (approximate)
    await simulator.tap(serial, this.UI_COORDS.videoCenter.x, 1700);
    await simulator.wait(1000);

    // Input comment
    await simulator.inputText(serial, commentText);
    await simulator.wait(500);

    // Submit comment (tap send button, approximate position)
    await simulator.tap(serial, 1000, 1700);
    await simulator.wait(2000);

    // Close comment section
    await simulator.pressBack(serial);
  }

  /**
   * Subscribe to the channel
   */
  private async subscribeToChannel(serial: string, simulator: HumanSimulator): Promise<void> {
    // Scroll down slightly to show subscribe button
    await simulator.scroll(serial, 'up', 0.1);
    await simulator.wait(500);

    // Tap subscribe button
    await simulator.tap(serial, this.UI_COORDS.subscribeButton.x, this.UI_COORDS.subscribeButton.y);
    await simulator.wait(1500);
  }

  /**
   * Create a result for cancelled job
   */
  private createCancelledResult(
    videoId: string,
    watchedDuration: number,
    liked: boolean,
    commented: boolean,
    subscribed: boolean,
    startedAt: number
  ): JobResult {
    const resultData: WatchJobResultData = {
      videoId,
      watchedDuration,
      liked,
      commented,
      subscribed,
      startedAt,
      endedAt: Date.now(),
    };

    return {
      success: false,
      data: resultData as unknown as Record<string, unknown>,
      error: {
        code: 'CANCELLED',
        message: 'Job was cancelled',
        recoverable: true,
      },
    };
  }
}

export default WatchHandler;

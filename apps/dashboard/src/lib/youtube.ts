/**
 * YouTube URL normalization and utility functions
 */

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const CHANNEL_HANDLE_REGEX = /[^a-zA-Z0-9_.-]/g;

/**
 * Normalized YouTube URL result
 */
export interface NormalizedYouTubeUrl {
  videoId: string;
  canonicalUrl: string;
}

/**
 * Extracts video ID from various YouTube URL formats or validates bare ID
 *
 * Supported formats:
 * - https://www.youtube.com/watch?v=ID&other_params
 * - https://youtu.be/ID?si=xxx
 * - https://www.youtube.com/shorts/ID
 * - https://www.youtube.com/embed/ID
 * - https://youtube.com/watch?v=ID (no www)
 * - bare ID (11 chars, alphanumeric + _ -)
 */
export function extractVideoId(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  // Check if it's already a valid bare video ID
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();

    // youtube.com or www.youtube.com
    if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
      // Standard watch URL: /watch?v=ID
      if (url.pathname === '/watch') {
        const videoId = url.searchParams.get('v');
        if (videoId && VIDEO_ID_REGEX.test(videoId)) {
          return videoId;
        }
      }

      // Shorts URL: /shorts/ID
      if (url.pathname.startsWith('/shorts/')) {
        const videoId = url.pathname.slice(8); // Remove '/shorts/'
        if (VIDEO_ID_REGEX.test(videoId)) {
          return videoId;
        }
      }

      // Embed URL: /embed/ID
      if (url.pathname.startsWith('/embed/')) {
        const videoId = url.pathname.slice(7); // Remove '/embed/'
        if (VIDEO_ID_REGEX.test(videoId)) {
          return videoId;
        }
      }
    }

    // youtu.be short URLs
    if (hostname === 'youtu.be') {
      const videoId = url.pathname.slice(1); // Remove leading '/'
      if (VIDEO_ID_REGEX.test(videoId)) {
        return videoId;
      }
    }
  } catch {
    // Not a valid URL, fall through
  }

  return null;
}

/**
 * Normalizes a YouTube URL to canonical form
 *
 * @param input - YouTube URL or video ID
 * @returns Normalized URL with videoId and canonicalUrl, or null if invalid
 */
export function normalizeYouTubeUrl(input: string): NormalizedYouTubeUrl | null {
  const videoId = extractVideoId(input);

  if (!videoId) {
    return null;
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * Normalizes a YouTube channel handle
 *
 * @param handle - Channel handle (with or without leading @)
 * @returns Normalized handle (alphanumeric + _ - . only)
 */
export function normalizeChannelHandle(handle: string): string {
  if (!handle) return '';

  // Remove leading @ if present
  let normalized = handle.trim();
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }

  // Replace invalid characters with underscore
  normalized = normalized.replace(CHANNEL_HANDLE_REGEX, '_');

  return normalized;
}

/**
 * Generates a watch ID format (client-side placeholder)
 *
 * Format: YYYYMMDD_normalizedHandle_###
 *
 * Note: The sequence number (###) is a placeholder "001".
 * Actual sequence generation MUST be done server-side with atomic increment.
 *
 * @param handle - Channel handle
 * @param date - Optional date (defaults to current Korea time)
 * @returns Watch ID format string
 */
export function generateWatchId(handle: string, date?: Date): string {
  const now = date || new Date();

  // Convert to Korea timezone (UTC+9)
  const koreaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

  const year = koreaDate.getFullYear();
  const month = String(koreaDate.getMonth() + 1).padStart(2, '0');
  const day = String(koreaDate.getDate()).padStart(2, '0');

  const datePrefix = `${year}${month}${day}`;
  const normalizedHandle = normalizeChannelHandle(handle);
  const sequencePlaceholder = '001';

  return `${datePrefix}_${normalizedHandle}_${sequencePlaceholder}`;
}

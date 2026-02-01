/**
 * Human Simulation Module
 *
 * Anti-detection behaviors that mimic human interaction patterns.
 * Used to make automated actions appear natural and avoid bot detection.
 *
 * Key Features:
 * - Random delays with human-like variance
 * - Natural scrolling patterns (scroll down to comments, back up)
 * - Probabilistic actions (like, comment, playlist)
 * - Random touch position variance
 */

// =============================================
// Constants - YouTube App Coordinates (1080x1920)
// =============================================

const COORDS = {
    // Video player area
    VIDEO_CENTER: { x: 540, y: 400 },
    VIDEO_TAP: { x: 540, y: 350 },

    // Like button (below video, left side)
    LIKE_BUTTON: { x: 130, y: 820 },

    // Comment section
    COMMENT_BUTTON: { x: 540, y: 820 },
    COMMENT_INPUT: { x: 540, y: 1700 },
    COMMENT_POST: { x: 980, y: 1700 },

    // Scroll areas
    SCROLL_START: { x: 540, y: 1400 },
    SCROLL_END: { x: 540, y: 600 },

    // Subscribe button
    SUBSCRIBE_BUTTON: { x: 900, y: 720 }
};

// Pre-defined human-like comments (Korean)
const COMMENT_TEMPLATES = [
    "좋은 영상 감사합니다!",
    "오늘도 잘 보고 갑니다~",
    "유익한 내용이네요 ㅎㅎ",
    "영상 잘 봤습니다!",
    "좋은 정보 감사합니다",
    "항상 응원합니다!",
    "영상 퀄리티가 좋네요",
    "유익해요!",
    "잘 보고 갑니다",
    "좋아요 누르고 갑니다!"
];

// =============================================
// Utility Functions
// =============================================

/**
 * Generate random delay with human-like variance
 * Uses normal distribution around the target time
 */
function randomDelay(baseMs, variancePercent = 30) {
    const variance = baseMs * (variancePercent / 100);
    const offset = (Math.random() - 0.5) * 2 * variance;
    return Math.max(100, Math.round(baseMs + offset));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add random variance to coordinates (human touch isn't pixel-perfect)
 */
function addCoordVariance(x, y, variance = 15) {
    return {
        x: x + Math.round((Math.random() - 0.5) * 2 * variance),
        y: y + Math.round((Math.random() - 0.5) * 2 * variance)
    };
}

/**
 * Get random item from array
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Check probability (0-100)
 */
function checkProbability(percent) {
    return Math.random() * 100 < percent;
}

// =============================================
// Human Simulation Actions
// =============================================

/**
 * Simulate human-like scrolling pattern
 * Pattern: Wait → Scroll down to comments → Pause → Scroll back up
 */
async function simulateHumanScroll(executeAdb, serial) {
    console.log(`[Human] Starting scroll simulation for ${serial}`);

    // Wait a bit after video starts (humans don't immediately scroll)
    await sleep(randomDelay(3000, 40));

    // Scroll down slowly (to comments section)
    const scrollDown1 = addCoordVariance(COORDS.SCROLL_START.x, COORDS.SCROLL_START.y);
    const scrollDown2 = addCoordVariance(COORDS.SCROLL_END.x, COORDS.SCROLL_END.y);

    console.log(`[Human] Scrolling down...`);
    await executeAdb(serial, `shell input swipe ${scrollDown1.x} ${scrollDown1.y} ${scrollDown2.x} ${scrollDown2.y} ${randomDelay(800, 20)}`);

    // Pause at comments (humans read)
    await sleep(randomDelay(2000, 50));

    // Sometimes scroll a bit more
    if (checkProbability(40)) {
        console.log(`[Human] Scrolling more...`);
        const extraScroll1 = addCoordVariance(540, 1200);
        const extraScroll2 = addCoordVariance(540, 800);
        await executeAdb(serial, `shell input swipe ${extraScroll1.x} ${extraScroll1.y} ${extraScroll2.x} ${extraScroll2.y} ${randomDelay(600, 20)}`);
        await sleep(randomDelay(1500, 40));
    }

    // Scroll back up to video
    console.log(`[Human] Scrolling back up...`);
    const scrollUp1 = addCoordVariance(COORDS.SCROLL_END.x, COORDS.SCROLL_END.y);
    const scrollUp2 = addCoordVariance(COORDS.SCROLL_START.x, COORDS.SCROLL_START.y);
    await executeAdb(serial, `shell input swipe ${scrollUp1.x} ${scrollUp1.y} ${scrollUp2.x} ${scrollUp2.y} ${randomDelay(700, 20)}`);

    // Small pause after scrolling
    await sleep(randomDelay(1000, 30));

    console.log(`[Human] Scroll simulation complete`);
}

/**
 * Simulate human-like video tap (to pause/unpause or interact)
 */
async function simulateVideoTap(executeAdb, serial) {
    const tapCoord = addCoordVariance(COORDS.VIDEO_TAP.x, COORDS.VIDEO_TAP.y, 30);
    console.log(`[Human] Tapping video at (${tapCoord.x}, ${tapCoord.y})`);
    await executeAdb(serial, `shell input tap ${tapCoord.x} ${tapCoord.y}`);
    await sleep(randomDelay(500, 30));
}

/**
 * Simulate like action with human timing
 */
async function simulateLike(executeAdb, serial, probability = 30) {
    if (!checkProbability(probability)) {
        console.log(`[Human] Skipping like (probability: ${probability}%)`);
        return false;
    }

    console.log(`[Human] Attempting like...`);

    // Small delay before action (thinking time)
    await sleep(randomDelay(800, 40));

    // Tap like button with variance
    const likeCoord = addCoordVariance(COORDS.LIKE_BUTTON.x, COORDS.LIKE_BUTTON.y, 10);
    await executeAdb(serial, `shell input tap ${likeCoord.x} ${likeCoord.y}`);

    // Wait for animation
    await sleep(randomDelay(600, 30));

    console.log(`[Human] Like action completed`);
    return true;
}

/**
 * Simulate comment action with human timing
 */
async function simulateComment(executeAdb, serial, probability = 5, customComment = null) {
    if (!checkProbability(probability)) {
        console.log(`[Human] Skipping comment (probability: ${probability}%)`);
        return false;
    }

    console.log(`[Human] Attempting comment...`);

    // Scroll down to comments first
    await sleep(randomDelay(500, 30));
    const scrollCoord1 = addCoordVariance(540, 1200);
    const scrollCoord2 = addCoordVariance(540, 600);
    await executeAdb(serial, `shell input swipe ${scrollCoord1.x} ${scrollCoord1.y} ${scrollCoord2.x} ${scrollCoord2.y} ${randomDelay(500, 20)}`);

    await sleep(randomDelay(1000, 40));

    // Tap comment input area
    const commentInputCoord = addCoordVariance(COORDS.COMMENT_INPUT.x, COORDS.COMMENT_INPUT.y, 20);
    await executeAdb(serial, `shell input tap ${commentInputCoord.x} ${commentInputCoord.y}`);

    await sleep(randomDelay(800, 30));

    // Type comment (with human-like typing speed simulation)
    const comment = customComment || randomChoice(COMMENT_TEMPLATES);
    const escapedComment = comment.replace(/['"\\]/g, '\\$&').replace(/ /g, '%s');

    console.log(`[Human] Typing comment: "${comment}"`);
    await executeAdb(serial, `shell input text "${escapedComment}"`);

    // Pause before posting (reviewing)
    await sleep(randomDelay(1500, 40));

    // Tap post button
    const postCoord = addCoordVariance(COORDS.COMMENT_POST.x, COORDS.COMMENT_POST.y, 10);
    await executeAdb(serial, `shell input tap ${postCoord.x} ${postCoord.y}`);

    await sleep(randomDelay(1000, 30));

    console.log(`[Human] Comment posted`);
    return true;
}

/**
 * Simulate random micro-interactions during watch time
 * These small actions make the session appear more natural
 */
async function simulateMicroInteractions(executeAdb, serial, durationSec) {
    const actions = [];
    const numInteractions = Math.floor(durationSec / 30) + Math.floor(Math.random() * 2);

    console.log(`[Human] Planning ${numInteractions} micro-interactions over ${durationSec}s`);

    for (let i = 0; i < numInteractions; i++) {
        const action = Math.random();

        if (action < 0.3) {
            // Small scroll
            actions.push(async () => {
                const y1 = 1000 + Math.floor(Math.random() * 200);
                const y2 = y1 - 100 - Math.floor(Math.random() * 100);
                await executeAdb(serial, `shell input swipe 540 ${y1} 540 ${y2} ${randomDelay(300, 20)}`);
            });
        } else if (action < 0.5) {
            // Tap video (pause/unpause briefly)
            actions.push(async () => {
                await simulateVideoTap(executeAdb, serial);
                await sleep(randomDelay(2000, 50));
                await simulateVideoTap(executeAdb, serial); // Unpause
            });
        } else {
            // Just wait (do nothing - natural pause)
            actions.push(async () => {
                await sleep(randomDelay(1000, 50));
            });
        }
    }

    return actions;
}

/**
 * Complete human simulation workflow for a video watch session
 */
async function executeHumanWatchSession(executeAdb, serial, config = {}) {
    const {
        durationSec = 60,
        probLike = 30,
        probComment = 5,
        doInitialScroll = true,
        doMicroInteractions = true
    } = config;

    console.log(`[Human] Starting watch session: ${durationSec}s, like=${probLike}%, comment=${probComment}%`);

    const results = {
        didScroll: false,
        didLike: false,
        didComment: false,
        microInteractions: 0,
        actualDuration: 0
    };

    const startTime = Date.now();

    try {
        // Phase 1: Initial scroll pattern (after video loads)
        if (doInitialScroll) {
            await sleep(randomDelay(5000, 30)); // Wait for video to load
            await simulateHumanScroll(executeAdb, serial);
            results.didScroll = true;
        }

        // Phase 2: Watch with micro-interactions
        const watchTime = durationSec - 15; // Reserve time for end actions
        const microActions = doMicroInteractions
            ? await simulateMicroInteractions(executeAdb, serial, watchTime)
            : [];

        const intervalBetweenActions = (watchTime * 1000) / (microActions.length + 1);

        for (const action of microActions) {
            await sleep(intervalBetweenActions);
            await action();
            results.microInteractions++;
        }

        // Wait remaining time
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, (durationSec - 10) - elapsed);
        if (remaining > 0) {
            await sleep(remaining * 1000);
        }

        // Phase 3: End actions (like/comment)
        results.didLike = await simulateLike(executeAdb, serial, probLike);
        results.didComment = await simulateComment(executeAdb, serial, probComment);

        results.actualDuration = Math.round((Date.now() - startTime) / 1000);

    } catch (error) {
        console.error(`[Human] Session error: ${error.message}`);
        results.error = error.message;
    }

    console.log(`[Human] Session complete:`, results);
    return results;
}

// =============================================
// Exports
// =============================================

module.exports = {
    // Constants
    COORDS,
    COMMENT_TEMPLATES,

    // Utilities
    randomDelay,
    sleep,
    addCoordVariance,
    randomChoice,
    checkProbability,

    // Actions
    simulateHumanScroll,
    simulateVideoTap,
    simulateLike,
    simulateComment,
    simulateMicroInteractions,

    // Main workflow
    executeHumanWatchSession
};

/**
 * Configuration module for mobile YouTube automation
 * Contains CSS selectors, timeouts, and user agent settings
 */

const selectors = {
    // Search
    search_icon: 'button[aria-label="Search YouTube"], .topbar-menu-button-avatar-button, button[aria-label="검색"], a[aria-label="검색"]',
    search_input: 'input#search, input[name="search_query"], input[aria-label="검색"], .searchbox-input input',
    search_submit: 'button[aria-label="검색"], .searchbox-button, button[type="submit"]',

    // Video cards
    video_card: 'ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-rich-item-renderer',
    video_title: '.media-item-headline, .compact-media-item-headline, h3, h4',
    video_link: 'a.media-item-thumbnail-container, a.compact-media-item-image, a[href*="watch"]',

    // Player controls
    player: 'video.html5-main-video, #movie_player video, video',
    like_button: 'button[aria-label*="좋아요"], ytm-like-button-renderer button, #like-button button',
    comment_input: 'textarea[aria-label="댓글 추가..."], #comment-input textarea, ytm-comment-simplebox-renderer textarea',
    comment_submit: 'button[aria-label="댓글 게시"], .comment-submit-button',
    save_button: 'button[aria-label*="저장"], ytm-save-button-renderer button',
    ad_skip: '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button'
};

const timeouts = {
    page_load: 5000,
    search_result: 3000,
    video_load: 4000,
    action_delay: 1000,
    element_wait: 5000,
    scroll_delay: 2000
};

const userAgent = "Mozilla/5.0 (Linux; Android 14; Samsung Galaxy S24) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const urls = {
    youtube_mobile: "https://m.youtube.com",
    youtube_search: "https://m.youtube.com/results?search_query="
};

module.exports = { selectors, timeouts, userAgent, urls };

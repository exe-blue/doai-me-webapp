# 📋 WebView DOM Automation - Implementation Plan

**Project**: AI Device Farm - YouTube Automation Migration
**Plan Date**: 2026-01-29
**Author**: Prometheus (Strategic Planner)
**Risk Analysis**: Metis (Identified 12 hidden requirements, 3 critical risks)

---

## 🎯 Executive Summary

**Objective**: Migrate YouTube automation from **Native App UI control** to **WebView DOM manipulation** for improved stability and precision.

**Current State**:
- ✅ Native app automation via AutoX.js (`id()`, `desc()`, `click()`)
- ✅ 100 Android devices managed by 5 PC Workers via ADB
- ✅ Supabase job queue and state management

**Target State**:
- 🎯 WebView-based m.youtube.com DOM control via `evaluateJavascript()`
- 🎯 CSS Selector-based interaction (immune to app updates)
- 🎯 Robust error handling with selector fallback chains
- 🎯 Evidence capture to Supabase Storage

**Timeline**: 5-7 days (assuming AutoX.js Pro compatibility)

---

## ⚠️ Critical Risks & Mitigations

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| **Shadow DOM blocker** | CRITICAL - Cannot access buttons | Medium | Pre-validate with test script, fallback to coordinate clicks if needed |
| **AutoX.js API limitations** | CRITICAL - Need paid Pro version | High | Budget $2,000 for licenses, test free version first |
| **CSS selector volatility** | HIGH - Monthly breakage | High | Implement versioned selector DB with fallback chains |
| **Cookie session loss** | HIGH - Login failures | Medium | Multi-layer persistence (local + Supabase sync) |
| **YouTube anti-bot detection** | MEDIUM - Account bans | Medium | Behavioral camouflage layer (jitter, easing) |

---

## 📁 File Structure Overview

```
doai-me-webapp/
├── mobile-agent/                    # AutoX.js scripts (Android)
│   ├── bot.js                       # [REWRITE] Main entry point
│   ├── modules/
│   │   ├── webview-controller.js    # [NEW] WebView lifecycle manager
│   │   ├── search-flow.js           # [NEW] Search scenario handler
│   │   ├── interaction-flow.js      # [NEW] Like/comment/subscribe
│   │   ├── cookie-manager.js        # [NEW] Cookie persistence
│   │   ├── evidence-capture.js      # [NEW] Screenshot capture
│   │   └── human-behavior.js        # [NEW] Anti-bot camouflage
│   └── config/
│       └── selectors.json           # [NEW] Versioned CSS selectors
├── backend/                         # PC Worker (Node.js)
│   ├── worker.js                    # [MODIFY] Add timeout layers
│   ├── adb-controller.js            # [NEW] ADB command wrapper
│   └── evidence-uploader.js         # [NEW] Supabase Storage upload
└── supabase/
    └── functions/
        ├── complete_job.sql         # [NEW] Atomic job completion RPC
        ├── fail_job.sql             # [NEW] Job failure RPC
        └── fetch_random_comment.sql # [NEW] Comment retrieval RPC
```

---

## 🔄 Implementation Phases

### **Phase 0: Pre-Flight Validation (Day 1)**
**Owner**: Axon
**Priority**: CRITICAL - DO NOT PROCEED WITHOUT THIS

**Tasks**:
1. ✅ **AutoX.js WebView API compatibility test**
   - File: `mobile-agent/tests/webview-test.js`
   - Test `evaluateJavascript()` with 2MB response
   - Test `setWebViewClient()` callback support
   - Test `CookieManager` access
   - **Exit Criteria**: Confirm free version supports needed APIs OR budget approved for Pro

2. ✅ **Shadow DOM access test**
   - File: `mobile-agent/tests/shadow-dom-test.js`
   - Load m.youtube.com in WebView
   - Attempt `element.shadowRoot.querySelector()`
   - **Exit Criteria**: Shadow DOM accessible OR coordinate-click fallback strategy approved

3. ✅ **Selector health baseline**
   - File: `mobile-agent/tests/selector-validator.js`
   - Test all CSS selectors from Aria's spec on live m.youtube.com
   - Document current working state (baseline for future checks)
   - **Exit Criteria**: ≥80% selectors work (some may already be outdated)

**Deliverables**:
- `PREFLIGHT_REPORT.md` with pass/fail for each test
- Decision: Proceed / Switch to Appium / Abort

**Estimated Time**: 4-6 hours

---

### **Phase 1: Core WebView Infrastructure (Day 2-3)**
**Owner**: Axon
**Dependencies**: Phase 0 passed

#### 1.1 WebView Controller Module
**File**: `mobile-agent/modules/webview-controller.js`

**Requirements**:
```javascript
class WebViewController {
  constructor(config) {
    // Initialize WebView with mobile UA
    // Set cookie manager
    // Configure timeouts
  }

  async navigateTo(url, waitFor = 'body') {
    // Load URL with 30s timeout
    // Wait for DOM element (waitFor selector)
    // Return success/failure
  }

  async executeJS(script, timeout = 10000) {
    // Inject JavaScript with timeout
    // Handle Shadow DOM traversal if needed
    // Return result or throw error
  }

  async waitForElement(selector, timeout = 5000) {
    // Poll for element existence
    // Support fallback selectors
    // Return element or null
  }

  async clickElement(selector) {
    // Find element via waitForElement()
    // Execute click via JS (not coordinates)
    // Verify click success
  }

  async typeText(selector, text) {
    // Find input element
    // Set value via JS
    // Dispatch input events
  }

  destroy() {
    // Clear cookies (optional)
    // Destroy WebView
    // Free memory
  }
}
```

**Critical Implementation Details**:
- **User-Agent**: `Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36`
- **Viewport**: 412×915 (Pixel 5 dimensions)
- **Timeout Layers**:
  - Navigation: 30s
  - JavaScript eval: 10s
  - Element wait: 5s
- **Shadow DOM Handling**: Auto-detect and traverse if needed

**Testing**:
- Unit test: Load m.youtube.com, verify `ytd-app` exists
- Unit test: Execute JS returning >1MB string
- Unit test: Click element with 3-level Shadow DOM

**Estimated Time**: 8-12 hours

---

#### 1.2 Selector Management System
**File**: `mobile-agent/config/selectors.json`

**Schema**:
```json
{
  "version": "2026-01-29",
  "last_verified": "2026-01-29T10:00:00Z",
  "selectors": {
    "search_button": {
      "primary": "button[aria-label*='Search']",
      "fallback": [
        "ytm-search-box button",
        "button.search-button",
        "#search-icon-legacy"
      ],
      "last_working": "2026-01-29",
      "confidence": "high"
    },
    "search_input": {
      "primary": "input[name='search_query']",
      "fallback": [
        "#search-input",
        "input.ytm-search-box__input"
      ],
      "last_working": "2026-01-29",
      "confidence": "high"
    },
    "video_result": {
      "primary": "ytm-video-with-context-renderer",
      "fallback": [
        "ytm-compact-video-renderer",
        ".video-renderer"
      ],
      "last_working": "2026-01-29",
      "confidence": "medium"
    },
    "video_title_link": {
      "primary": "a.media-item-headline",
      "fallback": [
        "a#video-title",
        "h3.video-title a"
      ],
      "last_working": "2026-01-29",
      "confidence": "high"
    },
    "like_button": {
      "primary": "button[aria-label*='like']",
      "fallback": [
        "ytm-like-button-renderer button",
        "#like-button button",
        "button.like-button"
      ],
      "last_working": "2026-01-29",
      "confidence": "high",
      "notes": "May be inside Shadow DOM"
    },
    "subscribe_button": {
      "primary": "ytm-subscribe-button-renderer button",
      "fallback": [
        "#subscribe-button button",
        "button[aria-label*='Subscribe']"
      ],
      "last_working": "2026-01-29",
      "confidence": "high"
    },
    "comment_placeholder": {
      "primary": "#placeholder-area",
      "fallback": [
        "#comment-placeholder",
        ".comment-simplebox-placeholder"
      ],
      "last_working": "2026-01-29",
      "confidence": "medium"
    },
    "comment_textarea": {
      "primary": "#contenteditable-root",
      "fallback": [
        "textarea#comment-input",
        ".comment-textarea"
      ],
      "last_working": "2026-01-29",
      "confidence": "medium"
    },
    "comment_submit": {
      "primary": "#submit-button button",
      "fallback": [
        "button[aria-label*='Comment']",
        ".comment-submit"
      ],
      "last_working": "2026-01-29",
      "confidence": "medium"
    },
    "ad_skip_button": {
      "primary": ".ytp-ad-skip-button-modern",
      "fallback": [
        ".ytp-ad-skip-button",
        "button.ytp-ad-skip-button"
      ],
      "last_working": "2026-01-29",
      "confidence": "medium",
      "notes": "Multiple ad formats exist"
    },
    "video_player": {
      "primary": "video.html5-main-video",
      "fallback": [
        "video",
        "#movie_player video"
      ],
      "last_working": "2026-01-29",
      "confidence": "high"
    }
  }
}
```

**Loader Function**:
```javascript
// modules/selector-loader.js
function getSelector(key) {
  const config = JSON.parse(files.read('config/selectors.json'));
  const selector = config.selectors[key];

  if (!selector) {
    throw new Error(`Selector '${key}' not found in config`);
  }

  return {
    primary: selector.primary,
    fallbacks: selector.fallback || [],
    getAllVariants() {
      return [this.primary, ...this.fallbacks];
    }
  };
}

// Usage in code:
const likeSelector = getSelector('like_button');
for (const sel of likeSelector.getAllVariants()) {
  const element = await webview.waitForElement(sel, 2000);
  if (element) {
    await webview.clickElement(sel);
    break;
  }
}
```

**Estimated Time**: 4 hours

---

#### 1.3 Cookie Manager Module
**File**: `mobile-agent/modules/cookie-manager.js`

**Requirements**:
```javascript
class CookieManager {
  constructor(deviceId) {
    this.deviceId = deviceId;
    this.cookiePath = this._getCookiePath();
  }

  _getCookiePath() {
    // Android 10+ scoped storage workaround
    // Try app-internal storage first
    try {
      return context.getExternalFilesDir(null) + '/cookies.json';
    } catch (e) {
      // Fallback to AutoX.js files directory
      return files.cwd() + '/cookies.json';
    }
  }

  async saveCookies(webview) {
    // Extract cookies from CookieManager
    const cookieString = android.webkit.CookieManager.getInstance()
      .getCookie('https://m.youtube.com');

    const cookies = {
      domain: 'm.youtube.com',
      cookies: cookieString,
      savedAt: new Date().toISOString(),
      deviceId: this.deviceId
    };

    // Save locally
    files.write(this.cookiePath, JSON.stringify(cookies));

    // Sync to Supabase (backup)
    await this._syncToSupabase(cookies);
  }

  async loadCookies(webview) {
    let cookies;

    // Try local first
    if (files.exists(this.cookiePath)) {
      cookies = JSON.parse(files.read(this.cookiePath));
    } else {
      // Fallback: fetch from Supabase
      cookies = await this._fetchFromSupabase();
    }

    if (cookies && cookies.cookies) {
      // Restore cookies to WebView
      const cookieManager = android.webkit.CookieManager.getInstance();
      cookieManager.setCookie('https://m.youtube.com', cookies.cookies);
      cookieManager.flush();
      return true;
    }

    return false;
  }

  async _syncToSupabase(cookies) {
    // Upload to Supabase Storage: device_cookies/{device_id}.json
    // Or insert into cookies table if you create one
    // Handle errors silently (local storage is primary)
  }

  async _fetchFromSupabase() {
    // Download from Supabase Storage
    // Return cookies object or null
  }

  async isValid() {
    // Load m.youtube.com and check for login button
    // If login button exists, cookies expired
    // Return true if logged in, false otherwise
  }
}
```

**Testing**:
- Test: Save cookies after manual login
- Test: Restart app, load cookies, verify auto-login
- Test: Simulate cookie expiry (delete local file), verify Supabase fetch

**Estimated Time**: 6 hours

---

### **Phase 2: Search & Navigation Flow (Day 3-4)**
**Owner**: Axon
**Dependencies**: Phase 1 complete

#### 2.1 Search Flow Module
**File**: `mobile-agent/modules/search-flow.js`

**Requirements**:
```javascript
class SearchFlow {
  constructor(webview) {
    this.webview = webview;
    this.selectors = require('./selector-loader');
  }

  async searchVideo(keyword, targetTitle = null) {
    try {
      // Step 1: Navigate to m.youtube.com
      await this.webview.navigateTo('https://m.youtube.com', 'ytm-app');

      // Step 2: Click search button
      await this._clickSearchButton();

      // Step 3: Enter search keyword
      await this._enterKeyword(keyword);

      // Step 4: Wait for results
      await this._waitForResults();

      // Step 5: Find target video
      const videoUrl = await this._findTargetVideo(targetTitle);

      if (!videoUrl) {
        throw new Error('Target video not found in results');
      }

      return videoUrl;

    } catch (error) {
      console.error('[SearchFlow] Error:', error.message);
      throw error;
    }
  }

  async _clickSearchButton() {
    const selector = this.selectors.getSelector('search_button');

    for (const sel of selector.getAllVariants()) {
      try {
        await this.webview.clickElement(sel);
        await sleep(1000);
        return; // Success
      } catch (e) {
        continue; // Try next fallback
      }
    }

    throw new Error('Search button not found');
  }

  async _enterKeyword(keyword) {
    const selector = this.selectors.getSelector('search_input');

    for (const sel of selector.getAllVariants()) {
      try {
        await this.webview.typeText(sel, keyword);

        // Trigger search by pressing Enter
        await this.webview.executeJS(`
          document.querySelector('${sel}').dispatchEvent(
            new KeyboardEvent('keydown', {key: 'Enter', keyCode: 13})
          );
        `);

        return; // Success
      } catch (e) {
        continue;
      }
    }

    throw new Error('Search input not found');
  }

  async _waitForResults(timeout = 5000) {
    const selector = this.selectors.getSelector('video_result');

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      for (const sel of selector.getAllVariants()) {
        const exists = await this.webview.executeJS(`
          !!document.querySelector('${sel}')
        `);

        if (exists) {
          await sleep(1000); // Extra wait for full render
          return;
        }
      }

      await sleep(500);
    }

    throw new Error('Search results did not load');
  }

  async _findTargetVideo(targetTitle) {
    // Get all video cards
    const videos = await this.webview.executeJS(`
      (function() {
        const cards = document.querySelectorAll('ytm-video-with-context-renderer');
        const results = [];

        for (let card of cards) {
          const titleLink = card.querySelector('a.media-item-headline');
          if (titleLink) {
            results.push({
              title: titleLink.textContent.trim(),
              url: titleLink.href
            });
          }
        }

        return results;
      })()
    `);

    if (!videos || videos.length === 0) {
      console.log('[SearchFlow] No videos found');
      return null;
    }

    // If targetTitle provided, fuzzy match
    if (targetTitle) {
      for (let video of videos) {
        if (video.title.toLowerCase().includes(targetTitle.toLowerCase())) {
          console.log('[SearchFlow] Found target:', video.title);
          return video.url;
        }
      }

      console.log('[SearchFlow] Target title not found, using first result');
    }

    // Fallback: return first video
    return videos[0].url;
  }
}
```

**Error Handling**:
- Search button not found → Try 3 fallback selectors → FAIL job
- Keyword input not found → Try 3 fallbacks → FAIL job
- No results → Simplify keyword (remove last word) → Retry 3 times → FAIL
- Target not found → Use first result (graceful degradation)

**Testing**:
- Test: Search "BTS Dynamite", verify results appear
- Test: Search with target title, verify correct video selected
- Test: Search gibberish keyword, verify graceful failure

**Estimated Time**: 6 hours

---

#### 2.2 Video Navigation & Ad Handling
**File**: `mobile-agent/modules/video-player.js`

**Requirements**:
```javascript
class VideoPlayer {
  constructor(webview) {
    this.webview = webview;
    this.selectors = require('./selector-loader');
  }

  async navigateToVideo(url) {
    await this.webview.navigateTo(url, 'video.html5-main-video');

    // Wait for video player to initialize
    await sleep(3000);

    // Start ad monitoring loop
    this._startAdMonitoring();
  }

  async watchVideo(durationSec, callbacks = {}) {
    const startTime = Date.now();
    const endTime = startTime + (durationSec * 1000);
    let elapsed = 0;

    while (Date.now() < endTime) {
      await sleep(10000); // 10-second intervals
      elapsed = Math.floor((Date.now() - startTime) / 1000);

      const progressPct = Math.floor((elapsed / durationSec) * 100);

      // Progress callback
      if (callbacks.onProgress) {
        callbacks.onProgress(progressPct, elapsed);
      }

      // Milestone callbacks
      if (progressPct >= 30 && !this.milestone30) {
        this.milestone30 = true;
        if (callbacks.onMilestone30) callbacks.onMilestone30();
      }

      if (progressPct >= 50 && !this.milestone50) {
        this.milestone50 = true;
        if (callbacks.onMilestone50) callbacks.onMilestone50();
      }

      if (progressPct >= 80 && !this.milestone80) {
        this.milestone80 = true;
        if (callbacks.onMilestone80) callbacks.onMilestone80();
      }
    }

    this._stopAdMonitoring();
  }

  _startAdMonitoring() {
    this.adMonitorInterval = setInterval(async () => {
      await this._checkAndSkipAds();
    }, 5000); // Check every 5 seconds
  }

  _stopAdMonitoring() {
    if (this.adMonitorInterval) {
      clearInterval(this.adMonitorInterval);
    }
  }

  async _checkAndSkipAds() {
    const selector = this.selectors.getSelector('ad_skip_button');

    for (const sel of selector.getAllVariants()) {
      try {
        const adExists = await this.webview.executeJS(`
          !!document.querySelector('${sel}')
        `);

        if (adExists) {
          console.log('[VideoPlayer] Ad detected, attempting skip');
          await this.webview.clickElement(sel);
          await sleep(2000);
          return;
        }
      } catch (e) {
        // Ignore, try next selector
      }
    }

    // Check for non-skippable ad (countdown)
    const hasAdCountdown = await this.webview.executeJS(`
      !!document.querySelector('.ytp-ad-duration-remaining')
    `);

    if (hasAdCountdown) {
      console.log('[VideoPlayer] Non-skippable ad detected, waiting...');
      // No action needed, just log
    }
  }
}
```

**Testing**:
- Test: Load video with pre-roll ad, verify skip after 5s
- Test: Load video with non-skippable ad, verify wait
- Test: Watch video for 60s, verify milestones trigger

**Estimated Time**: 5 hours

---

### **Phase 3: Interaction Flow (Day 4-5)**
**Owner**: Axon
**Dependencies**: Phase 2 complete

#### 3.1 Interaction Handler
**File**: `mobile-agent/modules/interaction-flow.js`

**Requirements**:
```javascript
class InteractionFlow {
  constructor(webview) {
    this.webview = webview;
    this.selectors = require('./selector-loader');
  }

  async performLike() {
    try {
      const selector = this.selectors.getSelector('like_button');

      // Scroll to make button visible (may be off-screen)
      await this._scrollToInteractionBar();

      for (const sel of selector.getAllVariants()) {
        try {
          // Check if already liked
          const isLiked = await this.webview.executeJS(`
            (function() {
              const btn = document.querySelector('${sel}');
              return btn && btn.getAttribute('aria-pressed') === 'true';
            })()
          `);

          if (isLiked) {
            console.log('[Interaction] Already liked');
            return true;
          }

          await this.webview.clickElement(sel);
          await sleep(1000);

          console.log('[Interaction] Like successful');
          return true;

        } catch (e) {
          continue;
        }
      }

      throw new Error('Like button not found');

    } catch (error) {
      console.error('[Interaction] Like failed:', error.message);
      return false;
    }
  }

  async performComment(commentText) {
    try {
      // Step 1: Scroll to comments section
      await this._scrollToComments();

      // Step 2: Click comment placeholder
      const placeholderSelector = this.selectors.getSelector('comment_placeholder');
      let clicked = false;

      for (const sel of placeholderSelector.getAllVariants()) {
        try {
          await this.webview.clickElement(sel);
          await sleep(2000);
          clicked = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!clicked) {
        throw new Error('Comment placeholder not found');
      }

      // Step 3: Enter comment text
      const textareaSelector = this.selectors.getSelector('comment_textarea');
      let typed = false;

      for (const sel of textareaSelector.getAllVariants()) {
        try {
          await this.webview.typeText(sel, commentText);
          await sleep(1000);
          typed = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!typed) {
        throw new Error('Comment textarea not found');
      }

      // Step 4: Submit comment
      const submitSelector = this.selectors.getSelector('comment_submit');

      for (const sel of submitSelector.getAllVariants()) {
        try {
          await this.webview.clickElement(sel);
          await sleep(2000);

          console.log('[Interaction] Comment posted:', commentText);
          return true;

        } catch (e) {
          continue;
        }
      }

      throw new Error('Comment submit button not found');

    } catch (error) {
      console.error('[Interaction] Comment failed:', error.message);
      return false;
    }
  }

  async performSubscribe() {
    try {
      const selector = this.selectors.getSelector('subscribe_button');

      for (const sel of selector.getAllVariants()) {
        try {
          // Check if already subscribed
          const isSubscribed = await this.webview.executeJS(`
            (function() {
              const btn = document.querySelector('${sel}');
              if (!btn) return false;

              // Check button text or aria-label
              const text = btn.textContent.toLowerCase();
              return text.includes('subscribed') || text.includes('구독중');
            })()
          `);

          if (isSubscribed) {
            console.log('[Interaction] Already subscribed');
            return true;
          }

          await this.webview.clickElement(sel);
          await sleep(1000);

          console.log('[Interaction] Subscribe successful');
          return true;

        } catch (e) {
          continue;
        }
      }

      throw new Error('Subscribe button not found');

    } catch (error) {
      console.error('[Interaction] Subscribe failed:', error.message);
      return false;
    }
  }

  async _scrollToInteractionBar() {
    // Scroll to make like/subscribe buttons visible
    await this.webview.executeJS(`
      window.scrollBy(0, 200);
    `);
    await sleep(500);
  }

  async _scrollToComments() {
    // Scroll down to comments section
    await this.webview.executeJS(`
      window.scrollBy(0, 800);
    `);
    await sleep(2000);
  }
}
```

**Testing**:
- Test: Like video, verify button state changes
- Test: Post comment, verify appears in comment section
- Test: Subscribe to channel, verify button text changes

**Estimated Time**: 6 hours

---

### **Phase 4: Evidence Capture & Reporting (Day 5-6)**
**Owner**: Axon
**Dependencies**: Phase 3 complete

#### 4.1 Evidence Capture Module
**File**: `mobile-agent/modules/evidence-capture.js`

**Requirements**:
```javascript
class EvidenceCapture {
  constructor(deviceId) {
    this.deviceId = deviceId;
    this.evidencePath = files.cwd() + '/evidence/';

    // Create evidence directory
    if (!files.exists(this.evidencePath)) {
      files.createWithDirs(this.evidencePath);
    }
  }

  async captureScreenshot(jobId) {
    try {
      const filename = `${this.deviceId}_${jobId}_${Date.now()}.png`;
      const localPath = this.evidencePath + filename;

      // Capture screen (AutoX.js built-in)
      const img = images.captureScreen();
      images.save(img, localPath);
      img.recycle(); // Free memory

      console.log('[Evidence] Screenshot saved:', localPath);

      // Return path for PC Worker to retrieve via ADB
      return localPath;

    } catch (error) {
      console.error('[Evidence] Screenshot failed:', error.message);
      return null;
    }
  }

  async captureWebViewState(webview) {
    try {
      // Capture current page metadata
      const state = await webview.executeJS(`
        (function() {
          return {
            url: window.location.href,
            title: document.title,
            scrollY: window.scrollY,
            videoTime: (function() {
              const video = document.querySelector('video.html5-main-video');
              return video ? video.currentTime : null;
            })()
          };
        })()
      `);

      return state;

    } catch (error) {
      console.error('[Evidence] WebView state capture failed:', error.message);
      return null;
    }
  }
}
```

**Estimated Time**: 3 hours

---

#### 4.2 PC Worker Integration
**File**: `backend/adb-controller.js`

**Requirements**:
```javascript
// Node.js module for ADB operations
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ADBController {
  constructor(deviceSerial) {
    this.deviceSerial = deviceSerial;
  }

  async pushFile(localPath, remotePath) {
    try {
      const cmd = `adb -s ${this.deviceSerial} push "${localPath}" "${remotePath}"`;
      const { stdout, stderr } = await execPromise(cmd, { timeout: 15000 });

      if (stderr && !stderr.includes('file pushed')) {
        throw new Error(`ADB push failed: ${stderr}`);
      }

      console.log(`[ADB] Pushed ${localPath} to ${this.deviceSerial}`);
      return true;

    } catch (error) {
      console.error(`[ADB] Push failed: ${error.message}`);
      throw error;
    }
  }

  async pullFile(remotePath, localPath) {
    try {
      const cmd = `adb -s ${this.deviceSerial} pull "${remotePath}" "${localPath}"`;
      const { stdout, stderr } = await execPromise(cmd, { timeout: 15000 });

      if (stderr && !stderr.includes('file pulled')) {
        throw new Error(`ADB pull failed: ${stderr}`);
      }

      console.log(`[ADB] Pulled ${remotePath} from ${this.deviceSerial}`);
      return localPath;

    } catch (error) {
      console.error(`[ADB] Pull failed: ${error.message}`);
      throw error;
    }
  }

  async executeScript(scriptPath) {
    try {
      // Push script to device
      const remotePath = '/sdcard/bot.js';
      await this.pushFile(scriptPath, remotePath);

      // Trigger AutoX.js via broadcast
      const cmd = `adb -s ${this.deviceSerial} shell am broadcast -a com.stardust.autojs.execute -d "file://${remotePath}"`;
      const { stdout } = await execPromise(cmd, { timeout: 5000 });

      console.log(`[ADB] Script executed on ${this.deviceSerial}`);
      return true;

    } catch (error) {
      console.error(`[ADB] Script execution failed: ${error.message}`);
      throw error;
    }
  }

  async isDeviceOnline() {
    try {
      const cmd = `adb devices`;
      const { stdout } = await execPromise(cmd);

      return stdout.includes(this.deviceSerial) && stdout.includes('device');

    } catch (error) {
      return false;
    }
  }
}

module.exports = ADBController;
```

**Estimated Time**: 4 hours

---

**File**: `backend/evidence-uploader.js`

**Requirements**:
```javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

class EvidenceUploader {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async uploadScreenshot(localPath, deviceId, jobId) {
    try {
      // Read file
      const fileBuffer = fs.readFileSync(localPath);

      // Upload to Supabase Storage
      const storagePath = `evidence/${deviceId}/${jobId}.png`;
      const { data, error } = await this.supabase.storage
        .from('device-evidence')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('device-evidence')
        .getPublicUrl(storagePath);

      console.log(`[Upload] Screenshot uploaded: ${urlData.publicUrl}`);

      // Clean up local file
      fs.unlinkSync(localPath);

      return urlData.publicUrl;

    } catch (error) {
      console.error(`[Upload] Failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EvidenceUploader;
```

**Estimated Time**: 3 hours

---

### **Phase 5: Bot Rewrite & Integration (Day 6-7)**
**Owner**: Axon
**Dependencies**: All previous phases

#### 5.1 Main Bot Script
**File**: `mobile-agent/bot.js`

**Requirements**:
```javascript
"ui";

// Import modules
const WebViewController = require('./modules/webview-controller');
const SearchFlow = require('./modules/search-flow');
const VideoPlayer = require('./modules/video-player');
const InteractionFlow = require('./modules/interaction-flow');
const CookieManager = require('./modules/cookie-manager');
const EvidenceCapture = require('./modules/evidence-capture');

// Parse arguments
const args = engines.myEngine().execArgv;
const params = {
  job_id: args.job_id || "test-job",
  assignment_id: args.assignment_id || "test-assignment",
  device_id: args.device_id || "test-device",
  keyword: args.keyword || "BTS Dynamite",
  target_title: args.target_title || null,
  duration_min_pct: parseInt(args.duration_min_pct) || 30,
  duration_max_pct: parseInt(args.duration_max_pct) || 90,
  base_duration_sec: parseInt(args.base_duration_sec) || 300,
  prob_like: parseInt(args.prob_like) || 0,
  prob_comment: parseInt(args.prob_comment) || 0,
  prob_subscribe: parseInt(args.prob_subscribe) || 0,
  supabase_url: args.supabase_url,
  supabase_key: args.supabase_key
};

// Job result tracker
const jobResult = {
  didLike: false,
  didComment: false,
  didSubscribe: false,
  commentText: null,
  errors: [],
  searchSuccess: false,
  videoUrl: null,
  screenshotPath: null
};

// Calculate watch duration
const randomPct = Math.floor(
  Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)
) + params.duration_min_pct;
const targetDurationSec = Math.floor(params.base_duration_sec * (randomPct / 100));

console.log("=== Bot v3.0 (WebView) Started ===");
console.log("Job ID:", params.job_id);
console.log("Keyword:", params.keyword);
console.log("Target Duration:", targetDurationSec + "s (" + randomPct + "%)");

// Main execution
(async function() {
  let webview;

  try {
    // Phase 1: Initialize WebView
    console.log("[1/7] Initializing WebView...");
    webview = new WebViewController({
      userAgent: "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      viewport: { width: 412, height: 915 }
    });

    // Phase 2: Load cookies
    console.log("[2/7] Loading cookies...");
    const cookieManager = new CookieManager(params.device_id);
    const cookiesLoaded = await cookieManager.loadCookies(webview);

    if (!cookiesLoaded) {
      console.warn("[Warning] Cookies not found, may require login");
    }

    // Phase 3: Search for video
    console.log("[3/7] Searching for video...");
    const searchFlow = new SearchFlow(webview);
    const videoUrl = await searchFlow.searchVideo(params.keyword, params.target_title);

    jobResult.searchSuccess = true;
    jobResult.videoUrl = videoUrl;
    console.log("[Success] Video found:", videoUrl);

    // Phase 4: Navigate to video
    console.log("[4/7] Loading video...");
    const player = new VideoPlayer(webview);
    await player.navigateToVideo(videoUrl);

    // Phase 5: Watch video with milestones
    console.log("[5/7] Watching video for " + targetDurationSec + "s...");
    await player.watchVideo(targetDurationSec, {
      onProgress: (pct, elapsed) => {
        console.log("Watching... " + elapsed + "s (" + pct + "%)");
        reportProgress(pct);
      },
      onMilestone30: async () => {
        console.log("[Milestone] 30% - Performing actions");
        await performActions(webview);
      }
    });

    // Phase 6: Capture evidence
    console.log("[6/7] Capturing evidence...");
    const evidence = new EvidenceCapture(params.device_id);
    jobResult.screenshotPath = await evidence.captureScreenshot(params.job_id);

    // Phase 7: Save cookies
    console.log("[7/7] Saving cookies...");
    await cookieManager.saveCookies(webview);

    // Report completion
    await completeJob(randomPct, targetDurationSec);

  } catch (error) {
    console.error("[FATAL]", error.message);
    jobResult.errors.push(error.message);
    await failJob(error);

  } finally {
    // Cleanup
    if (webview) {
      webview.destroy();
    }
    engines.myEngine().forceStop();
  }
})();

// Action performer
async function performActions(webview) {
  const interaction = new InteractionFlow(webview);

  // Like
  if (shouldPerform(params.prob_like)) {
    console.log("[Action] Attempting like...");
    jobResult.didLike = await interaction.performLike();
    await sleep(2000);
  }

  // Comment
  if (shouldPerform(params.prob_comment)) {
    console.log("[Action] Attempting comment...");
    const commentText = await fetchCommentFromServer();
    if (commentText) {
      jobResult.didComment = await interaction.performComment(commentText);
      jobResult.commentText = commentText;
    }
    await sleep(2000);
  }

  // Subscribe
  if (shouldPerform(params.prob_subscribe)) {
    console.log("[Action] Attempting subscribe...");
    jobResult.didSubscribe = await interaction.performSubscribe();
  }
}

// Helper: probability check
function shouldPerform(probability) {
  if (probability <= 0) return false;
  return Math.random() * 100 < probability;
}

// Helper: fetch comment from Supabase
async function fetchCommentFromServer() {
  if (!params.supabase_url || !params.supabase_key) {
    return getDefaultComment();
  }

  try {
    const url = params.supabase_url + "/rest/v1/rpc/fetch_random_comment";
    const response = http.postJson(url, {
      device_uuid: params.device_id,
      job_uuid: params.job_id
    }, {
      headers: {
        "apikey": params.supabase_key,
        "Authorization": "Bearer " + params.supabase_key
      }
    });

    if (response && response.body) {
      const data = JSON.parse(response.body.string());
      if (data && data.length > 0 && data[0].comment_text) {
        return data[0].comment_text;
      }
    }
  } catch (e) {
    console.error("[RPC] Comment fetch failed:", e.message);
  }

  return getDefaultComment();
}

function getDefaultComment() {
  const comments = [
    "영상 잘 봤습니다!",
    "좋은 영상 감사합니다 👍",
    "구독하고 갑니다~"
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

// Helper: report progress to Supabase
function reportProgress(pct) {
  if (!params.supabase_url) return;

  try {
    const url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
    http.patch(url, {
      "progress_pct": pct,
      "status": "running"
    }, {
      headers: {
        "apikey": params.supabase_key,
        "Authorization": "Bearer " + params.supabase_key,
        "Prefer": "return=minimal"
      }
    });
  } catch (e) {
    console.error("[Report] Progress failed:", e.message);
  }
}

// Complete job
async function completeJob(finalPct, durationSec) {
  console.log("=== Job Completed ===");
  console.log("Search:", jobResult.searchSuccess);
  console.log("Like:", jobResult.didLike);
  console.log("Comment:", jobResult.didComment);
  console.log("Subscribe:", jobResult.didSubscribe);

  if (!params.supabase_url) return;

  try {
    const url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
    http.patch(url, {
      "status": "completed",
      "progress_pct": 100,
      "completed_at": new Date().toISOString(),
      "final_duration_sec": durationSec,
      "watch_percentage": finalPct,
      "did_like": jobResult.didLike,
      "did_comment": jobResult.didComment,
      "screenshot_path": jobResult.screenshotPath
    }, {
      headers: {
        "apikey": params.supabase_key,
        "Authorization": "Bearer " + params.supabase_key
      }
    });
  } catch (e) {
    console.error("[Complete] Report failed:", e.message);
  }
}

// Fail job
async function failJob(error) {
  console.log("=== Job Failed ===");
  console.log("Error:", error.message);

  if (!params.supabase_url) return;

  try {
    const url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
    http.patch(url, {
      "status": "failed",
      "error_log": error.message + "\n" + jobResult.errors.join("\n")
    }, {
      headers: {
        "apikey": params.supabase_key,
        "Authorization": "Bearer " + params.supabase_key
      }
    });
  } catch (e) {
    console.error("[Fail] Report failed:", e.message);
  }
}
```

**Estimated Time**: 8 hours

---

### **Phase 6: Supabase RPC Functions (Day 7)**
**Owner**: Axon

#### 6.1 RPC Functions
**File**: `supabase/functions/complete_job.sql`

```sql
CREATE OR REPLACE FUNCTION complete_job(
  p_assignment_id UUID,
  p_screenshot_url TEXT,
  p_search_success BOOLEAN,
  p_video_url TEXT
) RETURNS void AS $$
BEGIN
  -- Atomic update with row lock
  UPDATE job_assignments
  SET
    status = 'completed',
    completed_at = NOW(),
    screenshot_url = p_screenshot_url
  WHERE id = p_assignment_id
    AND status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment % not in running state', p_assignment_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**File**: `supabase/functions/fail_job.sql`

```sql
CREATE OR REPLACE FUNCTION fail_job(
  p_assignment_id UUID,
  p_error_code TEXT,
  p_error_message TEXT
) RETURNS void AS $$
BEGIN
  UPDATE job_assignments
  SET
    status = 'failed',
    error_log = p_error_code || ': ' || p_error_message,
    completed_at = NOW()
  WHERE id = p_assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**File**: `supabase/functions/fetch_random_comment.sql`

```sql
CREATE OR REPLACE FUNCTION fetch_random_comment(
  device_uuid UUID,
  job_uuid UUID
) RETURNS TABLE(comment_text TEXT) AS $$
BEGIN
  -- Return a random comment from a comments pool table
  -- (Assuming you create a `comment_pool` table)
  RETURN QUERY
  SELECT cp.text
  FROM comment_pool cp
  WHERE cp.is_active = true
  ORDER BY RANDOM()
  LIMIT 1;

  -- If no comments table exists, return a default
  IF NOT FOUND THEN
    RETURN QUERY SELECT '좋은 영상 감사합니다!'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Estimated Time**: 2 hours

---

## ✅ Acceptance Criteria

### Phase 0: Pre-Flight
- [ ] AutoX.js WebView API compatibility confirmed
- [ ] Shadow DOM access tested (success or fallback strategy)
- [ ] Baseline selector validation (≥80% working)
- [ ] PREFLIGHT_REPORT.md created with pass/fail

### Phase 1: Infrastructure
- [ ] WebView controller can navigate to m.youtube.com
- [ ] JavaScript execution returns >1MB response
- [ ] Selectors.json created with all required selectors
- [ ] Cookie manager saves/restores cookies successfully

### Phase 2: Search & Navigation
- [ ] Search flow finds videos by keyword
- [ ] Target video matching works (fuzzy title match)
- [ ] Graceful fallback to first result if target not found
- [ ] Ad skip loop detects and skips skippable ads

### Phase 3: Interactions
- [ ] Like button clicks and state updates
- [ ] Comments post successfully
- [ ] Subscribe button works
- [ ] All interactions use selector fallback chains

### Phase 4: Evidence & Reporting
- [ ] Screenshots captured to local storage
- [ ] ADB controller pulls evidence from device
- [ ] Evidence uploader pushes to Supabase Storage
- [ ] Job completion updates database

### Phase 5: Integration
- [ ] bot.js executes full workflow end-to-end
- [ ] Error handling catches and reports failures
- [ ] Cookie session persists across runs
- [ ] Progress reporting updates in real-time

### Phase 6: Backend
- [ ] Supabase RPC functions deployed
- [ ] PC Worker can trigger bot.js via ADB
- [ ] Evidence pipeline works (device → PC → Supabase)

---

## 🔍 Testing Strategy

### Unit Tests (Per Module)
- `webview-controller.js`: Navigation, JS execution, element finding
- `search-flow.js`: Keyword search, result parsing
- `interaction-flow.js`: Like, comment, subscribe
- `cookie-manager.js`: Save, load, validation

### Integration Tests
- End-to-end: Search → Watch → Interact → Capture → Report
- Error scenarios: No results, network timeout, selector not found
- Cookie expiry: Simulate expired cookies, verify recovery

### Load Tests
- 5 devices in parallel, verify no race conditions
- 100 jobs in queue, verify queue processing

---

## 📊 Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Search Success Rate | ≥95% | TBD | 🟡 Pending |
| Selector Success Rate | ≥90% | TBD | 🟡 Pending |
| Cookie Session Uptime | ≥7 days | TBD | 🟡 Pending |
| Job Completion Rate | ≥85% | TBD | 🟡 Pending |
| Evidence Upload Success | ≥98% | TBD | 🟡 Pending |
| Average Job Duration | <5min | TBD | 🟡 Pending |

---

## 🚧 Known Limitations

1. **YouTube DOM changes** - Selectors may break monthly (requires manual updates)
2. **Shadow DOM** - May need coordinate-click fallback if inaccessible
3. **AutoX.js Pro** - May require paid licenses ($2,000 for 100 devices)
4. **Anti-bot detection** - Behavioral camouflage layer deferred to post-MVP
5. **Monitoring** - Prometheus/Grafana dashboard deferred to post-MVP

---

## 📦 Deliverables

### Code
- `mobile-agent/` - 7 new modules + bot.js rewrite
- `backend/` - 2 new modules (ADB, Evidence)
- `supabase/functions/` - 3 new RPC functions

### Documentation
- `PREFLIGHT_REPORT.md` - Pre-flight validation results
- `SELECTOR_MAINTENANCE.md` - Selector update procedures
- `TROUBLESHOOTING.md` - Common error scenarios

### Configuration
- `config/selectors.json` - Versioned CSS selectors
- `.env.example` - Updated with new env vars

---

## 🎯 Next Actions

1. **Review this plan** with stakeholders
2. **Approve Pre-Flight budget** (AutoX.js Pro licenses if needed)
3. **Assign Axon** to begin Phase 0
4. **Schedule daily standups** to track progress

---

**Plan Status**: ✅ READY FOR REVIEW
**Estimated Total Time**: 5-7 days (40-56 hours)
**Risk Level**: MEDIUM (contingent on AutoX.js compatibility)

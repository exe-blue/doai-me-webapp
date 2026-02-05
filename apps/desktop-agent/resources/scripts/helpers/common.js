/**
 * DoAi.Me AutoX.js 공통 헬퍼 함수
 * 
 * 모든 스크립트에서 require 하여 사용
 * 
 * 사용법:
 * var helper = require('./helpers/common.js');
 * helper.safeClick(id("button"), 5000);
 */

"use strict";

// ============================================
// 요소 찾기
// ============================================

/**
 * 안전한 요소 클릭
 * @param {UiSelector} selector - UI 선택자
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject} 클릭한 요소
 */
function safeClick(selector, timeout) {
  timeout = timeout || 5000;
  var element = selector.findOne(timeout);
  if (!element) {
    throw new Error("Element not found for click");
  }
  element.click();
  sleep(300); // 클릭 후 잠시 대기
  return element;
}

/**
 * 텍스트로 요소 찾기
 * @param {string} text - 찾을 텍스트
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject|null} 찾은 요소
 */
function findByText(text, timeout) {
  timeout = timeout || 5000;
  return textContains(text).findOne(timeout);
}

/**
 * 텍스트로 요소 찾아서 클릭
 * @param {string} text - 찾을 텍스트
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {boolean} 클릭 성공 여부
 */
function clickByText(text, timeout) {
  var element = findByText(text, timeout);
  if (element) {
    element.click();
    sleep(300);
    return true;
  }
  return false;
}

/**
 * 요소 대기 (폴링 방식)
 * @param {UiSelector} selector - UI 선택자
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject} 찾은 요소
 */
function waitFor(selector, timeout) {
  timeout = timeout || 10000;
  var start = Date.now();
  while (Date.now() - start < timeout) {
    var element = selector.findOnce();
    if (element) return element;
    sleep(500);
  }
  throw new Error("Timeout waiting for element");
}

/**
 * 요소가 존재하는지 확인
 * @param {UiSelector} selector - UI 선택자
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {boolean} 존재 여부
 */
function exists(selector, timeout) {
  timeout = timeout || 1000;
  return !!selector.findOne(timeout);
}

/**
 * 여러 선택자 중 하나 찾기
 * @param {Array<UiSelector>} selectors - 선택자 배열
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject|null} 첫 번째로 찾은 요소
 */
function findAny(selectors, timeout) {
  timeout = timeout || 5000;
  var start = Date.now();
  
  while (Date.now() - start < timeout) {
    for (var i = 0; i < selectors.length; i++) {
      var element = selectors[i].findOnce();
      if (element) return element;
    }
    sleep(200);
  }
  
  return null;
}

// ============================================
// 화면 제어
// ============================================

/**
 * 화면 켜기
 */
function wakeUp() {
  if (!device.isScreenOn()) {
    device.wakeUp();
    sleep(500);
  }
}

/**
 * 화면 끄기
 */
function screenOff() {
  if (device.isScreenOn()) {
    // Use press() for key simulation - KeyEvent() is not a valid AutoX.js API
    // Note: On some devices, KEYCODE_SLEEP may work better than "power"
    press("power");
    sleep(300);
  }
}

/**
 * 화면 잠금 해제 (기본 스와이프)
 */
function unlock() {
  if (!device.isScreenOn()) {
    wakeUp();
  }
  var h = device.height;
  var w = device.width;
  swipe(w/2, h*0.8, w/2, h*0.2, 300);
  sleep(500);
}

// ============================================
// 스와이프
// ============================================

/**
 * 위로 스와이프
 * @param {number} duration - 스와이프 시간 (ms)
 */
function swipeUp(duration) {
  duration = duration || 300;
  var h = device.height;
  var w = device.width;
  swipe(w/2, h*0.7, w/2, h*0.3, duration);
}

/**
 * 아래로 스와이프
 * @param {number} duration - 스와이프 시간 (ms)
 */
function swipeDown(duration) {
  duration = duration || 300;
  var h = device.height;
  var w = device.width;
  swipe(w/2, h*0.3, w/2, h*0.7, duration);
}

/**
 * 왼쪽으로 스와이프
 * @param {number} duration - 스와이프 시간 (ms)
 */
function swipeLeft(duration) {
  duration = duration || 300;
  var h = device.height;
  var w = device.width;
  swipe(w*0.8, h/2, w*0.2, h/2, duration);
}

/**
 * 오른쪽으로 스와이프
 * @param {number} duration - 스와이프 시간 (ms)
 */
function swipeRight(duration) {
  duration = duration || 300;
  var h = device.height;
  var w = device.width;
  swipe(w*0.2, h/2, w*0.8, h/2, duration);
}

/**
 * 요소가 보일 때까지 스크롤
 * @param {UiSelector} selector - UI 선택자
 * @param {number} maxScrolls - 최대 스크롤 횟수
 * @returns {UiObject|null} 찾은 요소
 */
function scrollToFind(selector, maxScrolls) {
  maxScrolls = maxScrolls || 10;
  
  for (var i = 0; i < maxScrolls; i++) {
    var element = selector.findOnce();
    if (element) return element;
    swipeUp(500);
    sleep(800);
  }
  
  return null;
}

// ============================================
// 앱 제어
// ============================================

/**
 * 현재 포그라운드 앱 확인
 * @param {string} packageName - 패키지명
 * @returns {boolean} 포그라운드 여부
 */
function isAppForeground(packageName) {
  return currentPackage() === packageName;
}

/**
 * 앱 실행
 * @param {string} packageName - 패키지명
 * @returns {boolean} 실행 성공 여부
 */
function launchApp(packageName) {
  return app.launchPackage(packageName);
}

/**
 * 앱 강제 종료
 * @param {string} packageName - 패키지명
 */
function forceStopApp(packageName) {
  // Validate package name to prevent command injection
  // Android package names: letters, digits, underscores, dots; must start with letter
  var packageNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;
  if (!packageName || !packageNameRegex.test(packageName)) {
    logError("forceStopApp", "Invalid package name: " + packageName);
    return;
  }
  shell("am force-stop " + packageName, true);
  sleep(500);
}

/**
 * 앱이 실행될 때까지 대기
 * @param {string} packageName - 패키지명
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {boolean} 실행 여부
 */
function waitForApp(packageName, timeout) {
  timeout = timeout || 10000;
  var start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (currentPackage() === packageName) {
      return true;
    }
    sleep(500);
  }
  
  return false;
}

// ============================================
// 봇 탐지 방지
// ============================================

/**
 * 랜덤 딜레이
 * @param {number} min - 최소 시간 (ms)
 * @param {number} max - 최대 시간 (ms)
 */
function randomSleep(min, max) {
  var duration = min + Math.random() * (max - min);
  sleep(duration);
}

/**
 * 랜덤 위치에 클릭 (요소 내부)
 * @param {UiObject} element - 클릭할 요소
 */
function randomClick(element) {
  var bounds = element.bounds();
  var x = bounds.left + Math.random() * bounds.width();
  var y = bounds.top + Math.random() * bounds.height();
  click(x, y);
}

/**
 * 인간처럼 텍스트 입력 (글자 간 딜레이)
 * @param {UiObject} input - 입력 필드
 * @param {string} text - 입력할 텍스트
 */
function humanTypeText(input, text) {
  input.click();
  sleep(200);
  
  // Use input() to append characters one at a time (more efficient than setText)
  for (var i = 0; i < text.length; i++) {
    input(text[i]);
    randomSleep(50, 150);
  }
}

// ============================================
// 유틸리티
// ============================================

/**
 * 스크린샷 저장
 * @param {string} filename - 파일명 (must not contain path separators)
 * @returns {boolean} 저장 성공 여부
 */
function takeScreenshot(filename) {
  // Sanitize filename to prevent path traversal
  // Remove any path separators, parent directory references, and null bytes
  var sanitized = String(filename)
    .replace(/[\\/]/g, '_')        // Replace path separators
    .replace(/\.\./g, '_')         // Remove parent directory traversal
    .replace(/\x00/g, '')          // Remove null bytes
    .replace(/[<>:"|?*]/g, '_');   // Remove invalid filename characters
  
  // Ensure filename is not empty after sanitization
  if (!sanitized || sanitized.trim() === '') {
    logError("takeScreenshot", "Invalid filename after sanitization");
    return false;
  }
  
  var path = "/sdcard/" + sanitized;
  return captureScreen(path);
}

/**
 * 현재 시간 문자열
 * @returns {string} YYYYMMDD_HHmmss 형식
 */
function getTimestamp() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var h = String(now.getHours()).padStart(2, '0');
  var mi = String(now.getMinutes()).padStart(2, '0');
  var s = String(now.getSeconds()).padStart(2, '0');
  return y + m + d + "_" + h + mi + s;
}

/**
 * 로그 출력
 * @param {string} tag - 태그
 * @param {string} message - 메시지
 */
function log(tag, message) {
  console.log("[" + tag + "] " + message);
}

/**
 * 에러 로그 출력
 * @param {string} tag - 태그
 * @param {string} message - 메시지
 */
function logError(tag, message) {
  console.error("[" + tag + "] " + message);
}

// ============================================
// YouTube 전용 헬퍼
// ============================================

/**
 * YouTube 검색 버튼 찾기
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject|null} 검색 버튼
 */
function findYouTubeSearchButton(timeout) {
  timeout = timeout || 5000;
  return findAny([
    id("com.google.android.youtube:id/menu_item_1"),
    desc("Search"),
    className("ImageView").desc("Search")
  ], timeout);
}

/**
 * YouTube 검색 입력창 찾기
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject|null} 입력창
 */
function findYouTubeSearchInput(timeout) {
  timeout = timeout || 3000;
  return findAny([
    id("com.google.android.youtube:id/search_edit_text"),
    className("EditText")
  ], timeout);
}

/**
 * YouTube 검색 결과에서 첫 번째 비디오 찾기
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {UiObject|null} 비디오 요소
 */
function findYouTubeFirstVideo(timeout) {
  timeout = timeout || 10000;
  return findAny([
    id("com.google.android.youtube:id/video_info_view"),
    id("com.google.android.youtube:id/thumbnail"),
    className("android.view.ViewGroup").clickable(true)
  ], timeout);
}

// ============================================
// 모듈 내보내기
// ============================================

module.exports = {
  // 요소 찾기
  safeClick: safeClick,
  findByText: findByText,
  clickByText: clickByText,
  waitFor: waitFor,
  exists: exists,
  findAny: findAny,
  
  // 화면 제어
  wakeUp: wakeUp,
  screenOff: screenOff,
  unlock: unlock,
  
  // 스와이프
  swipeUp: swipeUp,
  swipeDown: swipeDown,
  swipeLeft: swipeLeft,
  swipeRight: swipeRight,
  scrollToFind: scrollToFind,
  
  // 앱 제어
  isAppForeground: isAppForeground,
  launchApp: launchApp,
  forceStopApp: forceStopApp,
  waitForApp: waitForApp,
  
  // 봇 탐지 방지
  randomSleep: randomSleep,
  randomClick: randomClick,
  humanTypeText: humanTypeText,
  
  // 유틸리티
  takeScreenshot: takeScreenshot,
  getTimestamp: getTimestamp,
  log: log,
  logError: logError,
  
  // YouTube 전용
  findYouTubeSearchButton: findYouTubeSearchButton,
  findYouTubeSearchInput: findYouTubeSearchInput,
  findYouTubeFirstVideo: findYouTubeFirstVideo
};

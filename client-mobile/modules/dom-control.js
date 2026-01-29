/**
 * MOB-02: DOM Control Logic Module
 * WebView 내 YouTube DOM 제어 헬퍼 함수
 */

/**
 * selectors.json 로드 (AutoX.js 호환)
 * @returns {object} - Selector 설정 객체
 */
function loadSelectors() {
    try {
        // AutoX.js files 모듈 사용 (Node.js fs가 아님)
        const selectorsPath = files.path('./selectors.json');
        const selectorsData = files.read(selectorsPath);
        return JSON.parse(selectorsData);
    } catch (error) {
        console.error("[DOM Control] Failed to load selectors.json:", error);
        return null;
    }
}

// Selectors 설정 로드
const SELECTORS = loadSelectors();

/**
 * CSS Selector를 사용하여 요소 찾기 (우선순위 기반)
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {string} category - Selector 카테고리 (예: 'search', 'video')
 * @param {string} element - 요소 이름 (예: 'searchBox', 'likeButton')
 * @returns {Promise<boolean>} - 요소 발견 여부
 */
function findElement(evaluateJS, category, element) {
    return new Promise((resolve, reject) => {
        if (!SELECTORS || !SELECTORS[category] || !SELECTORS[category][element]) {
            reject(new Error(`Selector not found: ${category}.${element}`));
            return;
        }

        const selectorConfig = SELECTORS[category][element];
        const selectors = selectorConfig.selectors;

        const jsCode = `
        (function() {
            const selectors = ${JSON.stringify(selectors)};
            for (let selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    window.__lastFoundElement = el;
                    return true;
                }
            }
            return false;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            const found = result === 'true';
            if (found) {
                console.log(`[DOM Control] Element found: ${category}.${element}`);
                resolve(true);
            } else {
                console.warn(`[DOM Control] Element not found: ${category}.${element}`);
                resolve(false);
            }
        });
    });
}

/**
 * 요소에 텍스트 입력 (React 호환 방식)
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {string} category - Selector 카테고리
 * @param {string} element - 요소 이름
 * @param {string} text - 입력할 텍스트
 * @returns {Promise<boolean>} - 입력 성공 여부
 */
function inputText(evaluateJS, category, element, text) {
    return new Promise(async (resolve, reject) => {
        const found = await findElement(evaluateJS, category, element);
        if (!found) {
            reject(new Error(`Element not found: ${category}.${element}`));
            return;
        }

        // 텍스트 이스케이프 (XSS 방지)
        const escapedText = text
            .replace(/\\/g, '\\\\')  // Backslash
            .replace(/'/g, "\\'")    // Single quote
            .replace(/"/g, '\\"')    // Double quote
            .replace(/`/g, '\\`')    // Backtick
            .replace(/\n/g, '\\n')   // Newline
            .replace(/\r/g, '\\r');  // Carriage return

        // React 호환 입력 방식 (nativeInputValueSetter 사용)
        const jsCode = `
        (function() {
            const el = window.__lastFoundElement;
            if (!el) return false;

            // React의 value setter 우회
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            ).set;

            nativeInputValueSetter.call(el, '${escapedText}');

            // input 이벤트 발생 (React가 감지하도록)
            const inputEvent = new Event('input', { bubbles: true });
            el.dispatchEvent(inputEvent);

            // change 이벤트 발생 (추가 보험)
            const changeEvent = new Event('change', { bubbles: true });
            el.dispatchEvent(changeEvent);

            if (window.AndroidBridge) {
                window.AndroidBridge.log('Text input successful: ${category}.${element}');
            }

            return true;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            const success = result === 'true';
            if (success) {
                console.log(`[DOM Control] Text input successful: ${text}`);
                resolve(true);
            } else {
                reject(new Error('Text input failed'));
            }
        });
    });
}

/**
 * 요소 클릭 (이벤트 시뮬레이션)
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {string} category - Selector 카테고리
 * @param {string} element - 요소 이름
 * @returns {Promise<boolean>} - 클릭 성공 여부
 */
function clickElement(evaluateJS, category, element) {
    return new Promise(async (resolve, reject) => {
        const found = await findElement(evaluateJS, category, element);
        if (!found) {
            reject(new Error(`Element not found: ${category}.${element}`));
            return;
        }

        const jsCode = `
        (function() {
            const el = window.__lastFoundElement;
            if (!el) return false;

            // 클릭 이벤트 시뮬레이션
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            el.dispatchEvent(clickEvent);

            // 포커스 (입력 요소의 경우)
            if (el.focus) {
                el.focus();
            }

            if (window.AndroidBridge) {
                window.AndroidBridge.log('Element clicked: ${category}.${element}');
            }

            return true;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            const success = result === 'true';
            if (success) {
                console.log(`[DOM Control] Element clicked: ${category}.${element}`);
                resolve(true);
            } else {
                reject(new Error('Click failed'));
            }
        });
    });
}

/**
 * 요소 대기 (Polling 방식)
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {string} category - Selector 카테고리
 * @param {string} element - 요소 이름
 * @param {number} timeoutMs - 타임아웃 (밀리초)
 * @returns {Promise<boolean>} - 요소 발견 여부
 */
function waitForElement(evaluateJS, category, element, timeoutMs = 10000) {
    return new Promise(async (resolve, reject) => {
        const startTime = Date.now();
        const interval = 500; // 500ms마다 재시도

        const checkElement = async () => {
            try {
                const found = await findElement(evaluateJS, category, element);
                if (found) {
                    console.log(`[DOM Control] Element appeared: ${category}.${element}`);
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime >= timeoutMs) {
                    console.warn(`[DOM Control] Element wait timeout: ${category}.${element}`);
                    resolve(false);
                    return;
                }

                // 재시도
                setTimeout(checkElement, interval);
            } catch (error) {
                reject(error);
            }
        };

        checkElement();
    });
}

/**
 * 스크롤 실행
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {number} deltaY - 스크롤 양 (음수: 위로, 양수: 아래로)
 * @returns {Promise<boolean>} - 스크롤 성공 여부
 */
function scroll(evaluateJS, deltaY) {
    return new Promise((resolve) => {
        const jsCode = `
        (function() {
            window.scrollBy(0, ${deltaY});
            if (window.AndroidBridge) {
                window.AndroidBridge.log('Scrolled by ${deltaY}px');
            }
            return true;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            const success = result === 'true';
            resolve(success);
        });
    });
}

/**
 * 동영상 재생 시간 가져오기
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @returns {Promise<object>} - { currentTime, duration, percentage }
 */
function getVideoTime(evaluateJS) {
    return new Promise((resolve, reject) => {
        const jsCode = `
        (function() {
            const video = document.querySelector('video.html5-main-video');
            if (!video) {
                return JSON.stringify({ error: 'Video element not found' });
            }

            const currentTime = video.currentTime;
            const duration = video.duration;
            const percentage = (currentTime / duration) * 100;

            return JSON.stringify({
                currentTime: Math.floor(currentTime),
                duration: Math.floor(duration),
                percentage: Math.floor(percentage)
            });
        })();
        `;

        evaluateJS(jsCode, (result) => {
            try {
                const data = JSON.parse(result);
                if (data.error) {
                    reject(new Error(data.error));
                } else {
                    resolve(data);
                }
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * 동영상 일시정지
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @returns {Promise<boolean>} - 일시정지 성공 여부
 */
function pauseVideo(evaluateJS) {
    return new Promise((resolve) => {
        const jsCode = `
        (function() {
            const video = document.querySelector('video.html5-main-video');
            if (video) {
                video.pause();
                if (window.AndroidBridge) {
                    window.AndroidBridge.log('Video paused');
                }
                return true;
            }
            return false;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            resolve(result === 'true');
        });
    });
}

/**
 * 동영상 재생
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @returns {Promise<boolean>} - 재생 성공 여부
 */
function playVideo(evaluateJS) {
    return new Promise((resolve) => {
        const jsCode = `
        (function() {
            const video = document.querySelector('video.html5-main-video');
            if (video) {
                video.play();
                if (window.AndroidBridge) {
                    window.AndroidBridge.log('Video playing');
                }
                return true;
            }
            return false;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            resolve(result === 'true');
        });
    });
}

/**
 * 동영상 시간 이동
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {number} seconds - 이동할 시간 (초)
 * @returns {Promise<boolean>} - 이동 성공 여부
 */
function seekVideo(evaluateJS, seconds) {
    return new Promise((resolve) => {
        const jsCode = `
        (function() {
            const video = document.querySelector('video.html5-main-video');
            if (video) {
                video.currentTime = ${seconds};
                if (window.AndroidBridge) {
                    window.AndroidBridge.log('Video seeked to ${seconds}s');
                }
                return true;
            }
            return false;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            resolve(result === 'true');
        });
    });
}

/**
 * DOM 스냅샷 수집 (디버깅용)
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @returns {Promise<string>} - HTML 스냅샷
 */
function getDOMSnapshot(evaluateJS) {
    return new Promise((resolve) => {
        const jsCode = `
        (function() {
            return document.body.innerHTML;
        })();
        `;

        evaluateJS(jsCode, (result) => {
            resolve(result);
        });
    });
}

// 모듈 Export
module.exports = {
    loadSelectors: loadSelectors,
    findElement: findElement,
    inputText: inputText,
    clickElement: clickElement,
    waitForElement: waitForElement,
    scroll: scroll,
    getVideoTime: getVideoTime,
    pauseVideo: pauseVideo,
    playVideo: playVideo,
    seekVideo: seekVideo,
    getDOMSnapshot: getDOMSnapshot
};

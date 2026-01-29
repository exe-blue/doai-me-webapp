/**
 * DOM Injection Helper Module for WebView Automation
 * Mobile YouTube (m.youtube.com) DOM 조작을 위한 JavaScript 인젝션 코드 생성
 *
 * AutoX.js WebView에서 evaluateJavascript()로 주입하여 사용
 */

/**
 * WebView에 주입할 JavaScript 코드 문자열 반환
 * React 기반 YouTube의 DOM 조작을 위한 헬퍼 함수들을 포함
 *
 * @returns {string} - 주입할 JavaScript 코드 문자열
 *
 * @example
 * const { getInjectionCode } = require('./dom_utils');
 * webView.evaluateJavascript(getInjectionCode(), null);
 * // 이후 window.DOMUtils.click('selector'), window.DOMUtils.type('selector', 'text') 등 사용 가능
 */
function getInjectionCode() {
    return `
(function() {
    'use strict';

    // 이미 주입되어 있으면 스킵
    if (window.DOMUtils) {
        if (window.AndroidBridge) {
            window.AndroidBridge.log('[DOMUtils] Already injected, skipping...');
        }
        return;
    }

    /**
     * React Input Value Setter
     * YouTube는 React 기반이므로 일반적인 input.value = 'text' 방식이 동작하지 않음
     * React의 synthetic event 시스템을 우회하기 위해 native setter 사용
     */
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    ).set;

    /**
     * TextArea용 native setter (댓글 입력 등에 사용)
     */
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
    ).set;

    /**
     * document.querySelector 단축 함수
     * @param {string} selector - CSS 선택자
     * @returns {Element|null} - 찾은 요소 또는 null
     */
    function qs(selector) {
        return document.querySelector(selector);
    }

    /**
     * document.querySelectorAll 단축 함수
     * @param {string} selector - CSS 선택자
     * @returns {NodeList} - 찾은 요소들의 NodeList
     */
    function qsa(selector) {
        return document.querySelectorAll(selector);
    }

    /**
     * 요소 클릭 함수
     * @param {string} selector - CSS 선택자
     * @returns {boolean} - 클릭 성공 여부
     */
    function click(selector) {
        const el = qs(selector);
        if (!el) {
            if (window.AndroidBridge) {
                window.AndroidBridge.log('[DOMUtils] click failed - element not found: ' + selector);
            }
            return false;
        }

        // MouseEvent를 사용한 클릭 시뮬레이션
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(clickEvent);

        // 포커스 시도 (입력 요소의 경우)
        if (typeof el.focus === 'function') {
            el.focus();
        }

        if (window.AndroidBridge) {
            window.AndroidBridge.log('[DOMUtils] click success: ' + selector);
        }
        return true;
    }

    /**
     * 텍스트 입력 함수 (React 호환)
     * React의 controlled input을 우회하여 텍스트 입력
     * input, change, keydown(Enter) 이벤트를 순차적으로 발생시킴
     *
     * @param {string} selector - CSS 선택자
     * @param {string} text - 입력할 텍스트
     * @returns {boolean} - 입력 성공 여부
     */
    function type(selector, text) {
        const el = qs(selector);
        if (!el) {
            if (window.AndroidBridge) {
                window.AndroidBridge.log('[DOMUtils] type failed - element not found: ' + selector);
            }
            return false;
        }

        // 요소에 포커스
        if (typeof el.focus === 'function') {
            el.focus();
        }

        // 요소 타입에 따라 적절한 native setter 사용
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'input') {
            nativeInputValueSetter.call(el, text);
        } else if (tagName === 'textarea') {
            nativeTextAreaValueSetter.call(el, text);
        } else {
            // contenteditable 등의 경우
            el.textContent = text;
        }

        // input 이벤트 발생 (React가 감지하도록)
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        el.dispatchEvent(inputEvent);

        // change 이벤트 발생 (추가 보험)
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        el.dispatchEvent(changeEvent);

        // Enter 키 이벤트 발생 (검색 제출 등에 필요)
        const keydownEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(keydownEvent);

        if (window.AndroidBridge) {
            window.AndroidBridge.log('[DOMUtils] type success: ' + selector + ' -> "' + text + '"');
        }
        return true;
    }

    /**
     * 제목/키워드로 비디오 카드 찾기
     * m.youtube.com의 비디오 카드 요소들을 순회하며 키워드 매칭
     *
     * @param {string} keyword - 검색할 키워드 (부분 일치)
     * @returns {Element|null} - 매칭된 비디오 카드 요소 또는 null
     */
    function findVideoByTitle(keyword) {
        if (!keyword || typeof keyword !== 'string') {
            if (window.AndroidBridge) {
                window.AndroidBridge.log('[DOMUtils] findVideoByTitle - invalid keyword');
            }
            return null;
        }

        const keywordLower = keyword.toLowerCase();

        // 모바일 YouTube 비디오 카드 선택자들 (우선순위 순)
        const videoCardSelectors = [
            'ytm-video-with-context-renderer',  // 메인 비디오 카드
            'ytm-compact-video-renderer',        // 컴팩트 비디오 카드
            'ytm-rich-item-renderer',            // 리치 아이템 렌더러
            'ytm-media-item',                    // 미디어 아이템
            'a.compact-media-item-headline',     // 헤드라인 링크
            'ytm-video-preview-renderer'         // 비디오 프리뷰
        ];

        for (const selector of videoCardSelectors) {
            const cards = qsa(selector);

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];

                // aria-label 속성 확인
                const ariaLabel = card.getAttribute('aria-label');
                if (ariaLabel && ariaLabel.toLowerCase().includes(keywordLower)) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.log('[DOMUtils] findVideoByTitle - found by aria-label: ' + ariaLabel);
                    }
                    return card;
                }

                // innerText 확인
                const innerText = card.innerText || card.textContent;
                if (innerText && innerText.toLowerCase().includes(keywordLower)) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.log('[DOMUtils] findVideoByTitle - found by text: ' + keyword);
                    }
                    return card;
                }

                // 내부 제목 요소 확인
                const titleElements = card.querySelectorAll(
                    'h3, h4, .media-item-headline, .title, [class*="title"], .video-title'
                );
                for (let j = 0; j < titleElements.length; j++) {
                    const titleEl = titleElements[j];
                    const titleText = titleEl.innerText || titleEl.textContent;
                    if (titleText && titleText.toLowerCase().includes(keywordLower)) {
                        if (window.AndroidBridge) {
                            window.AndroidBridge.log('[DOMUtils] findVideoByTitle - found by title element: ' + titleText);
                        }
                        return card;
                    }
                }
            }
        }

        if (window.AndroidBridge) {
            window.AndroidBridge.log('[DOMUtils] findVideoByTitle - not found: ' + keyword);
        }
        return null;
    }

    /**
     * 비디오 카드 클릭 (제목으로 찾아서 클릭)
     * @param {string} keyword - 검색할 키워드
     * @returns {boolean} - 클릭 성공 여부
     */
    function clickVideoByTitle(keyword) {
        const card = findVideoByTitle(keyword);
        if (!card) {
            return false;
        }

        // 클릭 가능한 요소 찾기 (링크 또는 카드 자체)
        const clickableElement = card.querySelector('a') || card;

        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        clickableElement.dispatchEvent(clickEvent);

        if (window.AndroidBridge) {
            window.AndroidBridge.log('[DOMUtils] clickVideoByTitle success: ' + keyword);
        }
        return true;
    }

    /**
     * 요소가 존재할 때까지 대기 후 클릭
     * @param {string} selector - CSS 선택자
     * @param {number} timeoutMs - 타임아웃 (밀리초, 기본 5000)
     * @param {number} intervalMs - 재시도 간격 (밀리초, 기본 200)
     * @returns {Promise<boolean>} - 클릭 성공 여부
     */
    function waitAndClick(selector, timeoutMs, intervalMs) {
        timeoutMs = timeoutMs || 5000;
        intervalMs = intervalMs || 200;

        return new Promise(function(resolve) {
            const startTime = Date.now();

            function check() {
                const el = qs(selector);
                if (el) {
                    const result = click(selector);
                    resolve(result);
                    return;
                }

                if (Date.now() - startTime >= timeoutMs) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.log('[DOMUtils] waitAndClick timeout: ' + selector);
                    }
                    resolve(false);
                    return;
                }

                setTimeout(check, intervalMs);
            }

            check();
        });
    }

    /**
     * 요소가 존재할 때까지 대기 후 텍스트 입력
     * @param {string} selector - CSS 선택자
     * @param {string} text - 입력할 텍스트
     * @param {number} timeoutMs - 타임아웃 (밀리초, 기본 5000)
     * @param {number} intervalMs - 재시도 간격 (밀리초, 기본 200)
     * @returns {Promise<boolean>} - 입력 성공 여부
     */
    function waitAndType(selector, text, timeoutMs, intervalMs) {
        timeoutMs = timeoutMs || 5000;
        intervalMs = intervalMs || 200;

        return new Promise(function(resolve) {
            const startTime = Date.now();

            function check() {
                const el = qs(selector);
                if (el) {
                    const result = type(selector, text);
                    resolve(result);
                    return;
                }

                if (Date.now() - startTime >= timeoutMs) {
                    if (window.AndroidBridge) {
                        window.AndroidBridge.log('[DOMUtils] waitAndType timeout: ' + selector);
                    }
                    resolve(false);
                    return;
                }

                setTimeout(check, intervalMs);
            }

            check();
        });
    }

    // 전역 DOMUtils 객체로 노출
    window.DOMUtils = {
        qs: qs,
        qsa: qsa,
        click: click,
        type: type,
        findVideoByTitle: findVideoByTitle,
        clickVideoByTitle: clickVideoByTitle,
        waitAndClick: waitAndClick,
        waitAndType: waitAndType
    };

    if (window.AndroidBridge) {
        window.AndroidBridge.log('[DOMUtils] Injection complete - all helpers available on window.DOMUtils');
    }

    return true;
})();
`;
}

// 모듈 Export
module.exports = {
    getInjectionCode: getInjectionCode
};

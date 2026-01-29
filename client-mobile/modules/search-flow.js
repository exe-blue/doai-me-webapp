/**
 * MOB-03: Search Scenario Flow Module
 * YouTube 검색 및 동영상 시청 시나리오
 */

// Module loader for absolute path resolution
const moduleLoader = require('./module-loader.js');
const domControl = moduleLoader.loadModule('dom-control');

/**
 * 랜덤 대기 함수
 * @param {number} minMs - 최소 대기 시간 (밀리초)
 * @param {number} maxMs - 최대 대기 시간 (밀리초)
 * @returns {Promise<void>}
 */
function randomSleep(minMs, maxMs) {
    const duration = minMs + Math.random() * (maxMs - minMs);
    return new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * 검색어 입력 및 검색 실행
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {string} query - 검색어
 * @returns {Promise<boolean>} - 검색 성공 여부
 */
async function performSearch(evaluateJS, query) {
    try {
        console.log(`[Search Flow] Starting search for: "${query}"`);

        // 1. 검색창 대기 및 클릭
        const searchBoxFound = await domControl.waitForElement(evaluateJS, 'search', 'searchBox', 10000);
        if (!searchBoxFound) {
            throw new Error('Search box not found');
        }

        await randomSleep(500, 1000);
        await domControl.clickElement(evaluateJS, 'search', 'searchBox');

        // 2. 검색어 입력
        await randomSleep(500, 1000);
        await domControl.inputText(evaluateJS, 'search', 'searchBox', query);

        // 3. 검색 버튼 클릭
        await randomSleep(1000, 2000);
        await domControl.clickElement(evaluateJS, 'search', 'searchButton');

        console.log('[Search Flow] Search executed successfully');
        return true;

    } catch (error) {
        console.error('[Search Flow] Search failed:', error.message);
        return false;
    }
}

/**
 * 검색 결과에서 N번째 동영상 클릭
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {number} index - 클릭할 동영상 인덱스 (0부터 시작)
 * @returns {Promise<boolean>} - 클릭 성공 여부
 */
async function clickSearchResult(evaluateJS, index) {
    try {
        console.log(`[Search Flow] Waiting for search results...`);

        // 검색 결과 로딩 대기 (3초)
        await randomSleep(3000, 4000);

        // N번째 결과 클릭 (JavaScript로 직접 처리)
        const jsCode = `
        (function() {
            const selectors = ${JSON.stringify(domControl.loadSelectors().search.resultVideo.selectors)};
            let videos = null;

            for (let selector of selectors) {
                videos = document.querySelectorAll(selector);
                if (videos && videos.length > 0) break;
            }

            if (!videos || videos.length === 0) {
                if (window.AndroidBridge) {
                    window.AndroidBridge.error('No search results found');
                }
                return false;
            }

            const targetIndex = ${index};
            if (targetIndex >= videos.length) {
                if (window.AndroidBridge) {
                    window.AndroidBridge.error('Video index out of range: ' + targetIndex);
                }
                return false;
            }

            const targetVideo = videos[targetIndex];
            targetVideo.click();

            if (window.AndroidBridge) {
                window.AndroidBridge.log('Clicked video #' + targetIndex);
            }

            return true;
        })();
        `;

        return new Promise((resolve, reject) => {
            evaluateJS(jsCode, (result) => {
                const success = result === 'true';
                if (success) {
                    console.log(`[Search Flow] Video #${index} clicked successfully`);
                    resolve(true);
                } else {
                    reject(new Error('Failed to click search result'));
                }
            });
        });

    } catch (error) {
        console.error('[Search Flow] Click search result failed:', error.message);
        return false;
    }
}

/**
 * 동영상 시청 시나리오
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {object} options - 시청 옵션
 * @param {number} options.durationMinPct - 최소 시청 비율 (%)
 * @param {number} options.durationMaxPct - 최대 시청 비율 (%)
 * @param {number} options.probLike - 좋아요 확률 (%)
 * @param {number} options.probComment - 댓글 확률 (%)
 * @param {string} options.commentText - 댓글 내용 (선택사항)
 * @param {number} options.probPlaylist - 재생목록 저장 확률 (%)
 * @returns {Promise<object>} - { success, watchPercentage, actualDurationSec, liked, commented, savedToPlaylist }
 */
async function watchVideo(evaluateJS, options) {
    const {
        durationMinPct = 30,
        durationMaxPct = 90,
        probLike = 50,
        probComment = 30,
        commentText = null,
        probPlaylist = 10
    } = options;

    const result = {
        success: false,
        watchPercentage: 0,
        actualDurationSec: 0,
        liked: false,
        commented: false,
        savedToPlaylist: false
    };

    try {
        console.log('[Search Flow] Starting video watch scenario...');

        // 1. 동영상 플레이어 로딩 대기
        await randomSleep(3000, 5000);

        // 2. 동영상 재생 시작 확인
        const videoStarted = await domControl.playVideo(evaluateJS);
        if (!videoStarted) {
            console.warn('[Search Flow] Video autoplay may have failed, attempting manual play...');
            await domControl.playVideo(evaluateJS);
        }

        // 3. 시청 시간 계산
        const videoInfo = await domControl.getVideoTime(evaluateJS);
        const targetWatchPct = durationMinPct + Math.random() * (durationMaxPct - durationMinPct);
        const targetWatchSec = (videoInfo.duration * targetWatchPct) / 100;

        console.log(`[Search Flow] Video duration: ${videoInfo.duration}s, Target watch: ${targetWatchPct.toFixed(1)}% (${targetWatchSec.toFixed(0)}s)`);

        // 4. 시청 진행
        const startTime = Date.now();
        let watchedSeconds = 0;

        while (watchedSeconds < targetWatchSec) {
            await randomSleep(5000, 10000); // 5~10초마다 체크

            const currentInfo = await domControl.getVideoTime(evaluateJS);
            watchedSeconds = currentInfo.currentTime;

            console.log(`[Search Flow] Watch progress: ${currentInfo.percentage}% (${currentInfo.currentTime}s / ${currentInfo.duration}s)`);

            // 타임아웃 체크 (최대 시청 시간의 2배, 밀리초 단위)
            if (Date.now() - startTime > targetWatchSec * 2 * 1000) {
                console.warn('[Search Flow] Watch timeout exceeded');
                break;
            }
        }

        result.watchPercentage = Math.floor((watchedSeconds / videoInfo.duration) * 100);
        result.actualDurationSec = Math.floor(watchedSeconds);

        console.log(`[Search Flow] Watch completed: ${result.watchPercentage}% (${result.actualDurationSec}s)`);

        // 5. 좋아요 액션 (확률 기반)
        if (Math.random() * 100 < probLike) {
            console.log('[Search Flow] Attempting to like video...');
            try {
                await randomSleep(1000, 2000);
                const likeSuccess = await domControl.clickElement(evaluateJS, 'video', 'likeButton');
                result.liked = likeSuccess;
                if (likeSuccess) {
                    console.log('[Search Flow] Video liked successfully');
                }
            } catch (error) {
                console.warn('[Search Flow] Like action failed:', error.message);
            }
        }

        // 6. 댓글 액션 (확률 기반)
        if (commentText && Math.random() * 100 < probComment) {
            console.log('[Search Flow] Attempting to comment...');
            try {
                await randomSleep(2000, 3000);

                // 댓글 버튼 클릭
                await domControl.clickElement(evaluateJS, 'video', 'commentButton');
                await randomSleep(1000, 2000);

                // 댓글 입력창 대기
                const commentInputFound = await domControl.waitForElement(evaluateJS, 'video', 'commentInput', 5000);
                if (commentInputFound) {
                    // 댓글 입력
                    await domControl.inputText(evaluateJS, 'video', 'commentInput', commentText);
                    await randomSleep(1000, 2000);

                    // 댓글 게시 버튼 클릭
                    const submitSuccess = await domControl.clickElement(evaluateJS, 'video', 'commentSubmit');
                    result.commented = submitSuccess;

                    if (submitSuccess) {
                        console.log('[Search Flow] Comment posted successfully');
                    }
                }
            } catch (error) {
                console.warn('[Search Flow] Comment action failed:', error.message);
            }
        }

        // 7. 재생목록 저장 액션 (확률 기반)
        if (Math.random() * 100 < probPlaylist) {
            console.log('[Search Flow] Attempting to save to playlist...');
            try {
                await randomSleep(1000, 2000);
                const saveSuccess = await domControl.clickElement(evaluateJS, 'video', 'saveToPlaylist');
                result.savedToPlaylist = saveSuccess;
                if (saveSuccess) {
                    console.log('[Search Flow] Video saved to playlist');
                }
            } catch (error) {
                console.warn('[Search Flow] Save to playlist action failed:', error.message);
            }
        }

        result.success = true;
        console.log('[Search Flow] Video watch scenario completed successfully');

    } catch (error) {
        console.error('[Search Flow] Watch video failed:', error.message);
        result.success = false;
    }

    return result;
}

/**
 * 전체 검색 + 시청 플로우 실행
 * @param {function} loadUrl - URL 로드 함수
 * @param {function} evaluateJS - WebView JavaScript 실행 함수
 * @param {object} jobConfig - Job 설정
 * @param {string} jobConfig.searchQuery - 검색어
 * @param {number} jobConfig.resultIndex - 클릭할 검색 결과 인덱스 (0부터 시작)
 * @param {number} jobConfig.durationMinPct - 최소 시청 비율
 * @param {number} jobConfig.durationMaxPct - 최대 시청 비율
 * @param {number} jobConfig.probLike - 좋아요 확률
 * @param {number} jobConfig.probComment - 댓글 확률
 * @param {string} jobConfig.commentText - 댓글 내용
 * @param {number} jobConfig.probPlaylist - 재생목록 저장 확률
 * @returns {Promise<object>} - 실행 결과
 */
async function executeSearchAndWatch(loadUrl, evaluateJS, jobConfig) {
    try {
        console.log('[Search Flow] ========== Starting Search & Watch Flow ==========');
        console.log(`[Search Flow] Query: "${jobConfig.searchQuery}", Result Index: ${jobConfig.resultIndex}`);

        // 1. YouTube 모바일 홈 페이지 로드
        loadUrl('https://m.youtube.com');
        await randomSleep(3000, 5000);

        // 2. 검색 실행
        const searchSuccess = await performSearch(evaluateJS, jobConfig.searchQuery);
        if (!searchSuccess) {
            throw new Error('Search failed');
        }

        // 3. 검색 결과 클릭
        await randomSleep(2000, 3000);
        const clickSuccess = await clickSearchResult(evaluateJS, jobConfig.resultIndex);
        if (!clickSuccess) {
            throw new Error('Failed to click search result');
        }

        // 4. 동영상 시청
        await randomSleep(2000, 3000);
        const watchResult = await watchVideo(evaluateJS, {
            durationMinPct: jobConfig.durationMinPct,
            durationMaxPct: jobConfig.durationMaxPct,
            probLike: jobConfig.probLike,
            probComment: jobConfig.probComment,
            commentText: jobConfig.commentText,
            probPlaylist: jobConfig.probPlaylist
        });

        if (!watchResult.success) {
            throw new Error('Watch video scenario failed');
        }

        console.log('[Search Flow] ========== Flow Completed Successfully ==========');

        return {
            success: true,
            searchQuery: jobConfig.searchQuery,
            resultIndex: jobConfig.resultIndex,
            ...watchResult
        };

    } catch (error) {
        console.error('[Search Flow] Flow execution failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// 모듈 Export
module.exports = {
    randomSleep: randomSleep,
    performSearch: performSearch,
    clickSearchResult: clickSearchResult,
    watchVideo: watchVideo,
    executeSearchAndWatch: executeSearchAndWatch
};

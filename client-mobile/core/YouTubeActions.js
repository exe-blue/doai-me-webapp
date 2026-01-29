/**
 * core/YouTubeActions.js
 * YouTube 앱 액션 (좋아요/댓글/재생목록 저장)
 * AutoX.js UI Selector 기반
 *
 * @module YouTubeActions
 */

var YouTubeActions = (function() {

    // ==========================================
    // 확률 유틸리티
    // ==========================================

    /**
     * 확률 체크 (액션 수행 여부 결정)
     * @param {number} probability - 확률 (0-100)
     * @returns {boolean}
     */
    function shouldPerform(probability) {
        if (probability <= 0) return false;
        return Math.random() * 100 < probability;
    }

    // ==========================================
    // 좋아요 액션
    // ==========================================

    /**
     * 좋아요 클릭
     * @returns {boolean} 성공 여부
     */
    function performLike() {
        // 화면을 한번 탭해서 컨트롤 표시
        if (typeof click !== 'undefined' && typeof device !== 'undefined') {
            click(device.width / 2, device.height / 2);
            sleep(500);
        }

        // 방법 1: id로 찾기
        if (typeof id !== 'undefined') {
            var likeBtn = id("like_button").findOne(3000);
            if (likeBtn) {
                likeBtn.click();
                console.log('[YouTubeActions] 좋아요 클릭 성공 (id)');
                return true;
            }
        }

        // 방법 2: description으로 찾기 (한국어)
        if (typeof desc !== 'undefined') {
            var likeBtn = desc("좋아요").findOne(2000);
            if (likeBtn) {
                likeBtn.click();
                console.log('[YouTubeActions] 좋아요 클릭 성공 (desc-ko)');
                return true;
            }
        }

        // 방법 3: description으로 찾기 (영어)
        if (typeof desc !== 'undefined') {
            var likeBtn = desc("like this video").findOne(2000);
            if (likeBtn) {
                likeBtn.click();
                console.log('[YouTubeActions] 좋아요 클릭 성공 (desc-en)');
                return true;
            }
        }

        // 방법 4: 텍스트로 찾기
        if (typeof text !== 'undefined') {
            var likeBtn = text("좋아요").findOne(2000);
            if (likeBtn) {
                var parent = likeBtn.parent();
                if (parent) {
                    parent.click();
                    console.log('[YouTubeActions] 좋아요 클릭 성공 (text)');
                    return true;
                }
            }
        }

        console.log('[YouTubeActions] 좋아요 버튼을 찾을 수 없음');
        return false;
    }

    // ==========================================
    // 댓글 액션
    // ==========================================

    /**
     * 댓글 입력
     * @param {string} commentText - 댓글 내용
     * @returns {boolean} 성공 여부
     */
    function performComment(commentText) {
        if (!commentText) {
            console.log('[YouTubeActions] 댓글 텍스트 없음');
            return false;
        }

        // 화면 스크롤 (댓글 섹션으로)
        if (typeof swipe !== 'undefined' && typeof device !== 'undefined') {
            swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
            sleep(2000);
        }

        // 댓글 입력창 찾기
        var commentInput = null;

        // 방법 1: 텍스트로 찾기
        if (typeof text !== 'undefined') {
            commentInput = text("댓글 추가...").findOne(3000);
            if (!commentInput) {
                commentInput = text("Add a comment...").findOne(2000);
            }
            if (!commentInput) {
                commentInput = text("공개 댓글 추가...").findOne(2000);
            }
        }

        // 방법 2: description으로 찾기
        if (!commentInput && typeof desc !== 'undefined') {
            commentInput = desc("댓글 추가").findOne(2000);
        }

        if (!commentInput) {
            console.log('[YouTubeActions] 댓글 입력창을 찾을 수 없음');
            return false;
        }

        // 댓글 입력창 클릭
        commentInput.click();
        sleep(2000);

        // 텍스트 입력
        if (typeof className !== 'undefined') {
            var editText = className("EditText").findOne(3000);
            if (editText) {
                editText.setText(commentText);
                sleep(1000);

                // 전송 버튼 찾기 및 클릭
                var sendBtn = null;
                if (typeof desc !== 'undefined') {
                    sendBtn = desc("전송").findOne(2000);
                    if (!sendBtn) {
                        sendBtn = desc("Send").findOne(2000);
                    }
                }
                if (!sendBtn && typeof id !== 'undefined') {
                    sendBtn = id("send_button").findOne(2000);
                }

                if (sendBtn) {
                    sendBtn.click();
                    sleep(2000);
                    console.log('[YouTubeActions] 댓글 전송 성공:', commentText);
                    return true;
                } else {
                    console.log('[YouTubeActions] 전송 버튼을 찾을 수 없음');
                    // 뒤로가기로 취소
                    if (typeof back !== 'undefined') back();
                    return false;
                }
            }
        }

        console.log('[YouTubeActions] 텍스트 입력 실패');
        if (typeof back !== 'undefined') back();
        return false;
    }

    // ==========================================
    // 재생목록 저장 액션
    // ==========================================

    /**
     * 재생목록에 저장 (나중에 볼 동영상)
     * @returns {boolean} 성공 여부
     */
    function performPlaylistSave() {
        // 화면 탭해서 컨트롤 표시
        if (typeof click !== 'undefined' && typeof device !== 'undefined') {
            click(device.width / 2, device.height / 2);
            sleep(500);
        }

        // 저장 버튼 찾기
        var saveBtn = null;

        // 방법 1: description으로 찾기
        if (typeof desc !== 'undefined') {
            saveBtn = desc("저장").findOne(3000);
            if (!saveBtn) {
                saveBtn = desc("Save").findOne(2000);
            }
            if (!saveBtn) {
                saveBtn = desc("Save to playlist").findOne(2000);
            }
        }

        // 방법 2: 텍스트로 찾기
        if (!saveBtn && typeof text !== 'undefined') {
            saveBtn = text("저장").findOne(2000);
        }

        if (!saveBtn) {
            console.log('[YouTubeActions] 저장 버튼을 찾을 수 없음');
            return false;
        }

        saveBtn.click();
        sleep(2000);

        // "나중에 볼 동영상" 선택
        var watchLater = null;
        if (typeof text !== 'undefined') {
            watchLater = text("나중에 볼 동영상").findOne(3000);
            if (!watchLater) {
                watchLater = text("Watch later").findOne(2000);
            }
        }

        if (watchLater) {
            watchLater.click();
            sleep(1000);
            console.log('[YouTubeActions] 재생목록 저장 성공');
            return true;
        }

        // 체크박스 형태인 경우 첫 번째 항목 선택
        if (typeof className !== 'undefined') {
            var checkbox = className("CheckBox").findOne(2000);
            if (checkbox) {
                checkbox.click();
                sleep(500);

                // 완료/확인 버튼
                var doneBtn = null;
                if (typeof text !== 'undefined') {
                    doneBtn = text("완료").findOne(2000);
                    if (!doneBtn) doneBtn = text("Done").findOne(2000);
                }
                if (doneBtn) doneBtn.click();

                console.log('[YouTubeActions] 재생목록 저장 성공 (checkbox)');
                return true;
            }
        }

        // 닫기
        if (typeof back !== 'undefined') back();
        console.log('[YouTubeActions] 재생목록 저장 실패');
        return false;
    }

    // ==========================================
    // 유틸리티
    // ==========================================

    /**
     * YouTube 앱 실행
     * @param {string} videoUrl - 동영상 URL
     */
    function launchYouTube(videoUrl) {
        if (typeof app !== 'undefined') {
            if (videoUrl) {
                app.startActivity({
                    action: "android.intent.action.VIEW",
                    data: videoUrl,
                    packageName: "com.google.android.youtube"
                });
            } else {
                app.launch('com.google.android.youtube');
            }
            sleep(5000);
            console.log('[YouTubeActions] YouTube 앱 실행');
            return true;
        }
        return false;
    }

    /**
     * 화면 탭 (컨트롤 표시용)
     */
    function tapCenter() {
        if (typeof click !== 'undefined' && typeof device !== 'undefined') {
            click(device.width / 2, device.height / 2);
            sleep(500);
        }
    }

    // Public API
    return {
        // 확률 체크
        shouldPerform: shouldPerform,

        // 액션
        performLike: performLike,
        performComment: performComment,
        performPlaylistSave: performPlaylistSave,

        // 유틸리티
        launchYouTube: launchYouTube,
        tapCenter: tapCenter
    };
})();

// 모듈 내보내기
if (typeof module !== 'undefined') {
    module.exports = YouTubeActions;
}

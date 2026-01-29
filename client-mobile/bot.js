/**
 * [Agent-Mob] AutoX.js Worker Bot v2.1 (Worker v5.1 Compatible)
 * 역할: 유튜브 시청, 좋아요/댓글/담기 자동화, 서버로 진행상황 보고
 *
 * 주요 기능:
 * - 불확실성(랜덤) 시청 시간 결정
 * - 확률 기반 좋아요/댓글/담기 수행
 * - Supabase RPC로 댓글 인출 (Race Condition 방지)
 * - AutoX.js UI Selector로 유튜브 앱 조작
 *
 * Worker v5.1 Patches:
 * - Patch 1: job.json 파일 기반 파라미터 로딩
 * - Patch 2: 고유 증거 파일 경로
 * - Patch 3: 완료 플래그 작성
 */

"ui"; // UI 모드로 백그라운드 종료 방지

// =============================================
// 1. 파라미터 설정 (Patch 1: job.json 우선)
// =============================================
var params;
var jobJsonPath = "/sdcard/job.json";

if (files.exists(jobJsonPath)) {
    // Patch 1: Load from job.json
    try {
        var jobJson = files.read(jobJsonPath);
        params = JSON.parse(jobJson);
        console.log("✅ [v5.1] Parameters loaded from job.json");
    } catch (e) {
        console.error("❌ [v5.1] Failed to parse job.json: " + e.message);
        console.log("⚠️ [v5.1] Falling back to args");
        params = null;
    }
}

// Fallback to args (backwards compatibility)
if (!params) {
    var args = engines.myEngine().execArgv;
    params = {
        // 기본 정보
        job_id: args.job_id || "test-job",
        assignment_id: args.assignment_id || "test-assignment",
        device_id: args.device_id || "test-device",
        video_url: args.video_url || "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        keyword: args.keyword || "test video",

        // 시청 시간 설정
        duration_min_pct: parseInt(args.duration_min_pct) || 30,
        duration_max_pct: parseInt(args.duration_max_pct) || 90,
        base_duration_sec: parseInt(args.base_duration_sec) || 300,

        // 확률 설정 (0-100)
        prob_like: parseInt(args.prob_like) || 0,
        prob_comment: parseInt(args.prob_comment) || 0,
        prob_playlist: parseInt(args.prob_playlist) || 0,
        prob_subscribe: parseInt(args.prob_subscribe) || 0,

        // Supabase 설정
        supabase_url: args.supabase_url,
        supabase_key: args.supabase_key
    };
    console.log("⚠️ [v5.1] Using fallback args (job.json not found)");
}

// 작업 결과 추적
var jobResult = {
    didLike: false,
    didComment: false,
    didPlaylist: false,
    commentText: null,
    errors: []
};

// =============================================
// 2. 시청 시간 계산 (불확실성 부여)
// =============================================
var randomPct = Math.floor(Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)) + params.duration_min_pct;
var targetDurationSec = Math.floor(params.base_duration_sec * (randomPct / 100));

console.log("=== Bot v2.0 Started ===");
console.log("Job ID: " + params.job_id);
console.log("Video: " + params.video_url);
console.log("Target Duration: " + targetDurationSec + "s (" + randomPct + "%)");
console.log("Prob - Like: " + params.prob_like + "%, Comment: " + params.prob_comment + "%, Playlist: " + params.prob_playlist + "%");

// =============================================
// 3. 유튜브 실행
// =============================================
app.startActivity({
    action: "android.intent.action.VIEW",
    data: params.video_url,
    packageName: "com.google.android.youtube"
});

// 유튜브 앱 로딩 대기
sleep(5000);

// =============================================
// 4. 메인 작업 스레드
// =============================================
threads.start(function() {
    var elapsed = 0;
    var actionsPerformed = false;
    
    // 시청 루프
    while (elapsed < targetDurationSec) {
        sleep(10000); // 10초 대기
        elapsed += 10;
        
        // 진행률 계산 및 보고
        var progressPct = Math.round(Math.min(100, (elapsed / targetDurationSec) * 100));
        console.log("Watching... " + elapsed + "s / " + targetDurationSec + "s (" + progressPct + "%)");
        reportProgress(progressPct);
        
        // 30% 시청 후 액션 수행 (한 번만)
        if (!actionsPerformed && elapsed >= targetDurationSec * 0.3) {
            console.log("=== Performing Actions ===");
            performActions();
            actionsPerformed = true;
        }
    }
    
    // 작업 완료
    completeJob(randomPct, targetDurationSec);
});

// =============================================
// 5. 액션 수행 함수
// =============================================
function performActions() {
    // 5-1. 좋아요 처리
    if (shouldPerform(params.prob_like)) {
        console.log("[Action] 좋아요 시도...");
        try {
            if (performLike()) {
                jobResult.didLike = true;
                console.log("[Action] 좋아요 성공!");
            }
        } catch (e) {
            console.error("[Action] 좋아요 실패: " + e.message);
            jobResult.errors.push("like: " + e.message);
        }
        sleep(2000);
    }
    
    // 5-2. 댓글 처리
    if (shouldPerform(params.prob_comment)) {
        console.log("[Action] 댓글 시도...");
        try {
            var comment = fetchCommentFromServer();
            if (comment && performComment(comment)) {
                jobResult.didComment = true;
                jobResult.commentText = comment;
                console.log("[Action] 댓글 성공: " + comment);
            }
        } catch (e) {
            console.error("[Action] 댓글 실패: " + e.message);
            jobResult.errors.push("comment: " + e.message);
        }
        sleep(2000);
    }
    
    // 5-3. 재생목록 저장/담기 처리
    if (shouldPerform(params.prob_playlist)) {
        console.log("[Action] 재생목록 저장 시도...");
        try {
            if (performPlaylistSave()) {
                jobResult.didPlaylist = true;
                console.log("[Action] 재생목록 저장 성공!");
            }
        } catch (e) {
            console.error("[Action] 재생목록 저장 실패: " + e.message);
            jobResult.errors.push("playlist: " + e.message);
        }
    }
}

// =============================================
// 6. 확률 체크 함수
// =============================================
function shouldPerform(probability) {
    if (probability <= 0) return false;
    return Math.random() * 100 < probability;
}

// =============================================
// 7. 좋아요 클릭 로직
// =============================================
function performLike() {
    // 화면을 한번 탭해서 컨트롤 표시
    click(device.width / 2, device.height / 2);
    sleep(500);
    
    // 방법 1: id로 찾기
    var likeBtn = id("like_button").findOne(3000);
    if (likeBtn) {
        likeBtn.click();
        return true;
    }
    
    // 방법 2: description으로 찾기 (한국어)
    likeBtn = desc("좋아요").findOne(2000);
    if (likeBtn) {
        likeBtn.click();
        return true;
    }
    
    // 방법 3: description으로 찾기 (영어)
    likeBtn = desc("like this video").findOne(2000);
    if (likeBtn) {
        likeBtn.click();
        return true;
    }
    
    // 방법 4: 좋아요 텍스트로 찾기
    likeBtn = text("좋아요").findOne(2000);
    if (likeBtn) {
        var parent = likeBtn.parent();
        if (parent) {
            parent.click();
            return true;
        }
    }
    
    console.log("[Like] UI 요소를 찾을 수 없음");
    return false;
}

// =============================================
// 8. 댓글 입력 로직
// =============================================
function performComment(commentText) {
    if (!commentText) {
        console.log("[Comment] 댓글 텍스트 없음");
        return false;
    }
    
    // 화면 스크롤 (댓글 섹션으로)
    swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
    sleep(2000);
    
    // 댓글 입력창 찾기
    var commentInput = null;
    
    // 방법 1: 텍스트로 찾기
    commentInput = text("댓글 추가...").findOne(3000);
    if (!commentInput) {
        commentInput = text("Add a comment...").findOne(2000);
    }
    if (!commentInput) {
        commentInput = text("공개 댓글 추가...").findOne(2000);
    }
    
    // 방법 2: description으로 찾기
    if (!commentInput) {
        commentInput = desc("댓글 추가").findOne(2000);
    }
    
    if (!commentInput) {
        console.log("[Comment] 댓글 입력창을 찾을 수 없음");
        return false;
    }
    
    // 댓글 입력창 클릭
    commentInput.click();
    sleep(2000);
    
    // 텍스트 입력
    var editText = className("EditText").findOne(3000);
    if (editText) {
        editText.setText(commentText);
        sleep(1000);
        
        // 전송 버튼 찾기 및 클릭
        var sendBtn = desc("전송").findOne(2000);
        if (!sendBtn) {
            sendBtn = desc("Send").findOne(2000);
        }
        if (!sendBtn) {
            sendBtn = id("send_button").findOne(2000);
        }
        
        if (sendBtn) {
            sendBtn.click();
            sleep(2000);
            return true;
        } else {
            console.log("[Comment] 전송 버튼을 찾을 수 없음");
            // 뒤로가기로 취소
            back();
            return false;
        }
    }
    
    console.log("[Comment] 텍스트 입력 실패");
    back();
    return false;
}

// =============================================
// 9. 재생목록 저장 로직
// =============================================
function performPlaylistSave() {
    // 화면 탭해서 컨트롤 표시
    click(device.width / 2, device.height / 2);
    sleep(500);
    
    // 저장 버튼 찾기
    var saveBtn = null;
    
    // 방법 1: description으로 찾기
    saveBtn = desc("저장").findOne(3000);
    if (!saveBtn) {
        saveBtn = desc("Save").findOne(2000);
    }
    if (!saveBtn) {
        saveBtn = desc("Save to playlist").findOne(2000);
    }
    
    // 방법 2: 텍스트로 찾기
    if (!saveBtn) {
        saveBtn = text("저장").findOne(2000);
    }
    
    if (!saveBtn) {
        console.log("[Playlist] 저장 버튼을 찾을 수 없음");
        return false;
    }
    
    saveBtn.click();
    sleep(2000);
    
    // "나중에 볼 동영상" 선택
    var watchLater = text("나중에 볼 동영상").findOne(3000);
    if (!watchLater) {
        watchLater = text("Watch later").findOne(2000);
    }
    
    if (watchLater) {
        watchLater.click();
        sleep(1000);
        return true;
    }
    
    // 체크박스 형태인 경우 첫 번째 항목 선택
    var checkbox = className("CheckBox").findOne(2000);
    if (checkbox) {
        checkbox.click();
        sleep(500);
        
        // 완료/확인 버튼
        var doneBtn = text("완료").findOne(2000);
        if (!doneBtn) doneBtn = text("Done").findOne(2000);
        if (doneBtn) doneBtn.click();
        
        return true;
    }
    
    // 닫기
    back();
    return false;
}

// =============================================
// 10. Supabase RPC 댓글 가져오기
// =============================================
function fetchCommentFromServer() {
    if (!params.supabase_url || !params.supabase_key) {
        console.log("[Comment] Supabase 설정 없음, 기본 댓글 사용");
        return getDefaultComment();
    }
    
    try {
        var url = params.supabase_url + "/rest/v1/rpc/fetch_random_comment";
        var response = http.postJson(url, {
            device_uuid: params.device_id,
            job_uuid: params.job_id
        }, {
            headers: {
                "apikey": params.supabase_key,
                "Authorization": "Bearer " + params.supabase_key,
                "Content-Type": "application/json"
            }
        });
        
        if (response && response.body) {
            var data = JSON.parse(response.body.string());
            if (data && data.length > 0 && data[0].comment_text) {
                return data[0].comment_text;
            }
        }
    } catch (e) {
        console.error("[Comment] RPC 호출 실패: " + e.message);
    }
    
    // RPC 실패 시 기본 댓글
    return getDefaultComment();
}

// 기본 댓글 풀
function getDefaultComment() {
    var comments = [
        "영상 잘 봤습니다!",
        "좋은 영상 감사합니다 👍",
        "구독하고 갑니다~",
        "오늘도 좋은 영상이네요",
        "항상 응원합니다!"
    ];
    return comments[Math.floor(Math.random() * comments.length)];
}

// =============================================
// 11. 진행률 보고
// =============================================
function reportProgress(pct) {
    if (!params.supabase_url) return;
    
    try {
        var url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
        var response = http.patch(url, {
            "progress_pct": pct,
            "status": "running"
        }, {
            headers: {
                "apikey": params.supabase_key,
                "Authorization": "Bearer " + params.supabase_key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
        });
        
        // HTTP 응답 상태 확인 (2xx 범위만 성공으로 처리)
        if (response && response.statusCode) {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                var responseBody = response.body ? response.body.string() : 'No response body';
                console.error("[Report] 진행률 보고 실패 - HTTP " + response.statusCode + ": " + responseBody);
            }
        }
    } catch (e) {
        console.error("[Report] 진행률 보고 실패: " + e.message);
    }
}

// =============================================
// 12. 증거 캡처 (Patch 2: 고유 경로)
// =============================================
function captureEvidence() {
    try {
        // Patch 2: Unique evidence path
        var evidenceDir = "/sdcard/evidence/";

        // Create evidence directory if not exists
        if (!files.exists(evidenceDir)) {
            files.createWithDirs(evidenceDir);
        }

        var timestamp = Date.now();
        var filename = params.device_id + "_" + params.job_id + "_" + timestamp + ".png";
        var filepath = evidenceDir + filename;

        console.log("[Evidence] Capturing screenshot...");
        var img = images.captureScreen();

        if (img) {
            images.save(img, filepath);
            img.recycle();
            console.log("[Evidence] ✅ Screenshot saved: " + filepath);
            return filepath;
        } else {
            console.error("[Evidence] ❌ Screenshot failed");
            return null;
        }
    } catch (e) {
        console.error("[Evidence] ❌ Error: " + e.message);
        return null;
    }
}

// =============================================
// 13. 완료 플래그 작성 (Patch 3)
// =============================================
function writeCompletionFlag(status, screenshotPath, errorMessage) {
    try {
        var flagPath = "/sdcard/completion_" + params.job_id + ".flag";
        var flagData = {
            status: status,
            job_id: params.job_id,
            completed_at: new Date().toISOString(),
            screenshot_path: screenshotPath || null,
            error: errorMessage || null
        };

        files.write(flagPath, JSON.stringify(flagData));
        console.log("[v5.1] ✅ Completion flag written: " + flagPath);
    } catch (e) {
        console.error("[v5.1] ❌ Completion flag failed: " + e.message);
    }
}

// =============================================
// 14. 작업 완료
// =============================================
function completeJob(finalPct, durationSec) {
    console.log("=== Job Completed ===");
    console.log("Duration: " + durationSec + "s");
    console.log("Like: " + jobResult.didLike);
    console.log("Comment: " + jobResult.didComment + (jobResult.commentText ? " (" + jobResult.commentText + ")" : ""));
    console.log("Playlist: " + jobResult.didPlaylist);
    if (jobResult.errors.length > 0) {
        console.log("Errors: " + jobResult.errors.join(", "));
    }

    // Patch 2: Capture evidence with unique path
    var screenshotPath = captureEvidence();

    if (!params.supabase_url) {
        // Patch 3: Write completion flag even without Supabase
        writeCompletionFlag("success", screenshotPath, null);
        engines.myEngine().forceStop();
        return;
    }

    try {
        var assignUrl = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
        var response = http.patch(assignUrl, {
            "status": "completed",
            "progress_pct": 100,
            "completed_at": new Date().toISOString(),
            "final_duration_sec": durationSec,
            "watch_percentage": finalPct,
            // 액션 결과 (스키마에 컬럼이 있다면)
            "did_like": jobResult.didLike,
            "did_comment": jobResult.didComment,
            "did_playlist": jobResult.didPlaylist
            // screenshot_path는 Worker가 업로드 후 업데이트
        }, {
            headers: {
                "apikey": params.supabase_key,
                "Authorization": "Bearer " + params.supabase_key,
                "Content-Type": "application/json"
            }
        });

        // HTTP 응답 상태 확인 (2xx 범위만 성공으로 처리)
        if (response && response.statusCode) {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                var responseBody = response.body ? response.body.string() : 'No response body';
                console.error("[Complete] 완료 보고 실패 - HTTP " + response.statusCode + ": " + responseBody);
            }
        }
    } catch (e) {
        console.error("[Complete] 완료 보고 실패: " + e.message);
    }

    // Patch 3: Write completion flag
    writeCompletionFlag("success", screenshotPath, null);

    // 스크립트 종료
    engines.myEngine().forceStop();
}

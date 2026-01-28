/**
 * [Agent-Mob] AutoX.js Worker Bot
 * 역할: 유튜브 시청, 불확실성(랜덤) 시간 계산, 서버로 진행상황 보고
 */

"ui"; // UI 모드가 아니면 백그라운드에서 죽을 수 있음 (필요시 사용)

var args = engines.myEngine().execArgv; // PC에서 전달받은 파라미터
// 파라미터가 없을 경우를 대비한 기본값 (테스트용)
var params = {
    job_id: args.job_id || "test-job",
    assignment_id: args.assignment_id || "test-assignment",
    video_url: args.video_url || "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    duration_min_pct: parseInt(args.duration_min_pct) || 30,
    duration_max_pct: parseInt(args.duration_max_pct) || 90,
    base_duration_sec: 300, // 영상 길이를 모를 때 가정하는 기본 길이 (5분)
    supabase_url: args.supabase_url,
    supabase_key: args.supabase_key
};

// 1. 불확실성(Uncertainty) 부여: 시청 시간 결정
var randomPct = Math.floor(Math.random() * (params.duration_max_pct - params.duration_min_pct + 1)) + params.duration_min_pct;
var targetDurationSec = Math.floor(params.base_duration_sec * (randomPct / 100));
var startTime = new Date().getTime();

console.log("Job Start: " + params.video_url);
console.log("Target Duration: " + targetDurationSec + "s (" + randomPct + "%)");

// 2. 유튜브 실행 (Intent 활용)
app.startActivity({
    action: "android.intent.action.VIEW",
    data: params.video_url,
    packageName: "com.google.android.youtube"
});

// 3. 작업 루프 (Watch & Report)
// 실제로는 여기서 '좋아요' 등을 탐색하는 이미지 서치 로직이 들어갑니다.
// 현재는 시간 점유(Retention)를 중심으로 시뮬레이션합니다.
threads.start(function() {
    var elapsed = 0;
    
    while (elapsed < targetDurationSec) {
        sleep(10000); // 10초 대기
        elapsed += 10;
        
        var currentPct = Math.round((elapsed / targetDurationSec) * randomPct); // 전체 영상 대비가 아닌, 목표 대비 진행률이 아님. (단순 표기용)
        
        console.log("Watching... " + elapsed + "s / " + targetDurationSec + "s");
        
        // Supabase로 생존신호 전송 (Heartbeat)
        reportProgress(currentPct);
    }
    
    // 4. 작업 완료 및 급여 청구
    completeJob(randomPct, targetDurationSec);
});

// --- Helper Functions ---

function reportProgress(pct) {
    if (!params.supabase_url) return;
    
    var url = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
    http.patch(url, {
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
}

function completeJob(finalPct, durationSec) {
    console.log("Job Completed!");
    
    if (!params.supabase_url) return;

    // 1. Assignment 상태 완료 업데이트
    var assignUrl = params.supabase_url + "/rest/v1/job_assignments?id=eq." + params.assignment_id;
    http.patch(assignUrl, {
        "status": "completed",
        "progress_pct": 100,
        "completed_at": new Date().toISOString(),
        "final_duration_sec": durationSec
    }, {
        headers: {
            "apikey": params.supabase_key,
            "Authorization": "Bearer " + params.supabase_key,
            "Content-Type": "application/json"
        }
    });

    // 2. Salary Log 생성 (급여 청구)
    // 트리거 등을 쓰지 않고 클라이언트가 직접 로그를 남기는 방식 (보안상 추후 서버 사이드로 이동 권장)
    var logUrl = params.supabase_url + "/rest/v1/salary_logs";
    http.post(logUrl, {
        "assignment_id": params.assignment_id,
        "job_id": params.job_id,
        "watch_percentage": finalPct,
        "actual_duration_sec": durationSec,
        "rank_in_group": Math.floor(Math.random() * 5) + 1 // 임시 랜덤 등수
    }, {
        headers: {
            "apikey": params.supabase_key,
            "Authorization": "Bearer " + params.supabase_key,
            "Content-Type": "application/json"
        }
    });
    
    // 스크립트 종료
    engines.myEngine().forceStop();
}

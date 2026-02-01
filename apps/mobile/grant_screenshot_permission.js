/**
 * 스크린샷 권한 자동 부여 스크립트
 * MediaProjection 권한 다이얼로그에서 "지금 시작" 버튼 클릭
 */

console.log("=== 스크린샷 권한 부여 스크립트 시작 ===");

// 스크린샷 권한 요청 (시스템 다이얼로그 트리거)
console.log("1. 스크린샷 권한 요청 중...");

// images.requestScreenCapture()는 다이얼로그를 띄움
// 이 다이얼로그에서 "지금 시작" 버튼을 클릭해야 함

threads.start(function() {
    // 다이얼로그가 나타날 때까지 대기
    sleep(2000);
    
    console.log("2. 권한 다이얼로그 버튼 찾는 중...");
    
    // "지금 시작" 또는 "시작하기" 버튼 찾기
    var startBtn = null;
    
    // 텍스트로 버튼 찾기 시도
    for (var i = 0; i < 10; i++) {
        startBtn = text("지금 시작").findOne(1000);
        if (!startBtn) startBtn = text("시작하기").findOne(500);
        if (!startBtn) startBtn = text("시작").findOne(500);
        if (!startBtn) startBtn = text("허용").findOne(500);
        if (!startBtn) startBtn = text("Allow").findOne(500);
        if (!startBtn) startBtn = text("Start now").findOne(500);
        
        if (startBtn) {
            console.log("3. 버튼 발견! 클릭 중...");
            startBtn.click();
            console.log("✅ 권한 부여 버튼 클릭 완료!");
            break;
        }
        
        console.log("   버튼 찾는 중... (" + (i+1) + "/10)");
        sleep(500);
    }
    
    if (!startBtn) {
        // 버튼을 못 찾으면 좌표로 클릭 시도 (Samsung 1080x1920 기준)
        console.log("3. 버튼 못 찾음. 좌표 클릭 시도...");
        // 일반적인 "지금 시작" 버튼 위치 (화면 하단 중앙)
        click(540, 1600);
        sleep(500);
        click(540, 1500);
        sleep(500);
        click(540, 1400);
        console.log("✅ 좌표 클릭 완료!");
    }
});

// 권한 요청 실행
var result = images.requestScreenCapture(false);

if (result) {
    console.log("✅ 스크린샷 권한 획득 성공!");
    
    // 테스트: 스크린샷 찍기
    sleep(1000);
    console.log("4. 테스트 스크린샷 촬영 중...");
    var img = images.captureScreen();
    
    if (img) {
        var testPath = "/sdcard/test_screenshot_permission.png";
        images.save(img, testPath);
        img.recycle();
        console.log("✅ 테스트 스크린샷 저장 완료: " + testPath);
    } else {
        console.log("❌ 스크린샷 촬영 실패");
    }
} else {
    console.log("❌ 스크린샷 권한 획득 실패");
}

console.log("=== 스크립트 종료 ===");

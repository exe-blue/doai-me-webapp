# JS 핵심 파일 리팩토링 계획

**Plan ID**: js-refactoring-v1
**Created**: 2026-01-29
**Priority**: client-mobile 우선
**Goals**: 코드 정리, 구조 개선, 통합, 성능 최적화

---

## 1. 현재 상태 분석

### 1.1 `client-mobile/` 구조 (레거시)

| 파일 | Lines | 역할 | 상태 |
|------|-------|------|------|
| `bot.js` | 579 | Native YouTube 앱 자동화 | ✅ 작동 중, UI Selector 기반 |
| `bot-webview-autojs.js` | 524 | WebView 기반 자동화 | ⚠️ 미완성 (액션 미구현) |
| `modules/evidence-manager.js` | 318 | 스크린샷/로그 관리 | ✅ 작동 중 |
| `modules/dom-control.js` | - | DOM 제어 헬퍼 | 중복 코드 |
| `modules/webview-setup.js` | - | WebView 초기화 | 중복 코드 |

**문제점**:
- `bot.js`에 모든 로직이 인라인 (500+ lines)
- Supabase 통신 로직이 여러 곳에 분산
- 모듈화 부족, 테스트 불가

### 1.2 `mobile-agent/` 구조 (신규)

| 파일 | Lines | 역할 | 상태 |
|------|-------|------|------|
| `android/main.js` | 310 | 메인 진입점 | ✅ 깔끔한 구조, 액션 미구현 |
| `shared/SupabaseClient.js` | 473 | Supabase REST 클라이언트 | ✅ 완성도 높음 |
| `android/EvidenceManager.js` | 361 | 증거 관리 | ✅ 구조화됨 |
| `shared/ErrorRecovery.js` | 609 | 에러 복구 로직 | ✅ 완성도 높음 |
| `shared/Utils.js` | - | 유틸리티 | ✅ 공용 헬퍼 |

**장점**:
- IIFE 모듈 패턴으로 깔끔한 캡슐화
- Supabase 클라이언트 완성도 높음
- 에러 복구 로직 체계적
- 관심사 분리 잘 됨

---

## 2. 중복 코드 분석

### 2.1 Evidence Manager (중복)
```
client-mobile/modules/evidence-manager.js (318 lines)
mobile-agent/android/EvidenceManager.js (361 lines)
```
**결정**: `mobile-agent` 버전 채택 (Utils 의존성, 더 구조화됨)

### 2.2 Supabase 통신 (중복)
```
client-mobile/bot.js:376-450 (인라인 HTTP 호출)
mobile-agent/shared/SupabaseClient.js (전용 모듈)
```
**결정**: `mobile-agent/SupabaseClient.js` 채택

### 2.3 YouTube 액션 (분산)
```
client-mobile/bot.js:198-371 (performLike, performComment, performPlaylistSave)
mobile-agent/android/main.js:162-178 (placeholder comments)
```
**결정**: `bot.js`의 구현을 별도 모듈로 추출

---

## 3. 목표 아키텍처

```
doai-bot/
├── main.js                    # 메인 진입점 (mobile-agent 기반)
├── config.json                # 설정 파일
│
├── core/
│   ├── SupabaseClient.js      # Supabase REST 클라이언트
│   ├── ErrorRecovery.js       # 에러 복구 로직
│   ├── EvidenceManager.js     # 증거 파일 관리
│   └── Utils.js               # 공용 유틸리티
│
├── actions/
│   ├── YouTubeActions.js      # YouTube 액션 (like/comment/playlist)
│   ├── NativeAppController.js # Native 앱 제어 (UI Selector)
│   └── WebViewController.js   # WebView 제어 (DOM injection) [선택적]
│
└── tests/
    └── pre-flight.js          # 사전 테스트
```

---

## 4. 리팩토링 태스크

### Phase 1: client-mobile 정리 및 모듈 추출

#### Task 1.1: YouTubeActions 모듈 생성
- **FROM**: `client-mobile/bot.js` lines 198-371
- **TO**: `client-mobile/core/YouTubeActions.js`
- **내용**:
  - `performLike()` 추출
  - `performComment()` 추출
  - `performPlaylistSave()` 추출
  - `fetchCommentFromServer()` 추출 → SupabaseClient로 이동

#### Task 1.2: SupabaseClient 통합
- **FROM**: `mobile-agent/shared/SupabaseClient.js`
- **TO**: `client-mobile/core/SupabaseClient.js`
- **추가 작업**:
  - `fetchRandomComment` RPC 메서드 추가
  - `reportProgress` 메서드 추가

#### Task 1.3: EvidenceManager 통합
- **FROM**: `mobile-agent/android/EvidenceManager.js`
- **TO**: `client-mobile/core/EvidenceManager.js`
- **삭제**: `client-mobile/modules/evidence-manager.js`

#### Task 1.4: ErrorRecovery 통합
- **FROM**: `mobile-agent/shared/ErrorRecovery.js`
- **TO**: `client-mobile/core/ErrorRecovery.js`

#### Task 1.5: Utils 통합
- **FROM**: `mobile-agent/shared/Utils.js`
- **TO**: `client-mobile/core/Utils.js`

### Phase 2: bot.js 리팩토링

#### Task 2.1: bot.js 슬림화
- 모든 모듈 require() 로 로드
- 인라인 함수 제거 → 모듈 사용
- 메인 로직만 남기기 (< 150 lines 목표)

#### Task 2.2: 메인 루프 개선
- `mobile-agent/main.js`의 폴링 구조 적용
- 하트비트 통합
- 에러 복구 통합

### Phase 3: 중복 코드 삭제

#### Task 3.1: client-mobile/modules 정리
- `evidence-manager.js` 삭제 (core로 이동됨)
- `dom-control.js` 삭제 (WebView용, 선택적)
- `webview-setup.js` 삭제 (WebView용, 선택적)
- `job-loader.js` → Utils로 통합

#### Task 3.2: bot-webview-autojs.js 결정
- **옵션 A**: 삭제 (Native 앱 방식만 사용)
- **옵션 B**: WebView 전용으로 유지하되 모듈화
- **권장**: 옵션 A (MVP에서는 Native 앱 방식이 안정적)

### Phase 4: mobile-agent 폴더 정리

#### Task 4.1: mobile-agent 통합 완료 후 처리
- `mobile-agent/` 폴더 → `_archive/mobile-agent/`로 이동
- 또는 완전 삭제 (git history에 보존됨)

---

## 5. 상세 구현 명세

### 5.1 YouTubeActions.js

```javascript
/**
 * core/YouTubeActions.js
 * YouTube 앱 액션 (좋아요/댓글/재생목록 저장)
 */
var YouTubeActions = (function() {

    /**
     * 확률 체크
     */
    function shouldPerform(probability) {
        if (probability <= 0) return false;
        return Math.random() * 100 < probability;
    }

    /**
     * 좋아요 클릭
     */
    function performLike() {
        // bot.js:198-236 구현 이동
    }

    /**
     * 댓글 입력
     */
    function performComment(commentText) {
        // bot.js:241-307 구현 이동
    }

    /**
     * 재생목록 저장
     */
    function performPlaylistSave() {
        // bot.js:312-371 구현 이동
    }

    return {
        shouldPerform: shouldPerform,
        performLike: performLike,
        performComment: performComment,
        performPlaylistSave: performPlaylistSave
    };
})();

if (typeof module !== 'undefined') {
    module.exports = YouTubeActions;
}
```

### 5.2 리팩토링된 bot.js 구조

```javascript
/**
 * bot.js v3.0 - 모듈화 버전
 */

// 모듈 로드
var Utils = require('./core/Utils.js');
var SupabaseClient = require('./core/SupabaseClient.js');
var EvidenceManager = require('./core/EvidenceManager.js');
var ErrorRecovery = require('./core/ErrorRecovery.js');
var YouTubeActions = require('./core/YouTubeActions.js');

// 1. 설정 로드
var params = Utils.loadJobParams('/sdcard/job.json');

// 2. 클라이언트 초기화
SupabaseClient.init({
    url: params.supabase_url,
    anonKey: params.supabase_key,
    deviceId: params.device_id
});

// 3. YouTube 실행
function executeJob() {
    EvidenceManager.startJob(params.assignment_id);

    // 앱 실행
    app.openUrl(params.video_url);
    sleep(5000);

    // 시청 루프
    var targetDuration = Utils.calculateWatchDuration(params);
    watchAndReport(targetDuration);

    // 액션 수행
    performActions();

    // 완료
    completeJob();
}

// 4. 시청 및 진행률 보고
function watchAndReport(targetDuration) {
    var elapsed = 0;
    while (elapsed < targetDuration) {
        sleep(10000);
        elapsed += 10;
        var progress = Math.round((elapsed / targetDuration) * 100);
        SupabaseClient.updateProgress(params.assignment_id, progress);
    }
}

// 5. 액션 수행
function performActions() {
    if (YouTubeActions.shouldPerform(params.prob_like)) {
        YouTubeActions.performLike();
    }
    if (YouTubeActions.shouldPerform(params.prob_comment)) {
        var comment = SupabaseClient.fetchRandomComment(params.device_id, params.job_id);
        YouTubeActions.performComment(comment);
    }
    if (YouTubeActions.shouldPerform(params.prob_playlist)) {
        YouTubeActions.performPlaylistSave();
    }
}

// 6. 완료 처리
function completeJob() {
    var screenshot = EvidenceManager.captureScreenshot('complete');
    SupabaseClient.completeAssignment(params.assignment_id, {
        durationSec: targetDuration,
        didLike: jobResult.didLike,
        didComment: jobResult.didComment,
        didPlaylist: jobResult.didPlaylist
    });
    EvidenceManager.finishJob({ success: true });
}

// 실행
executeJob();
```

---

## 6. 실행 순서

| # | Task | 예상 변경 | 의존성 |
|---|------|----------|--------|
| 1 | Utils.js 복사 | 1 file create | - |
| 2 | SupabaseClient.js 복사 + 확장 | 1 file create | Utils |
| 3 | ErrorRecovery.js 복사 | 1 file create | Utils |
| 4 | EvidenceManager.js 복사 | 1 file create | Utils |
| 5 | YouTubeActions.js 생성 | 1 file create | - |
| 6 | bot.js 리팩토링 | 1 file edit | 1-5 완료 |
| 7 | 레거시 모듈 삭제 | 5+ files delete | 6 완료 |
| 8 | mobile-agent 아카이브 | folder move | 7 완료 |

---

## 7. 검증 항목

- [ ] `client-mobile/core/` 모든 모듈 로드 가능
- [ ] `bot.js` 실행 시 job.json 파라미터 로드
- [ ] Supabase 연결 테스트 통과
- [ ] 좋아요/댓글/저장 액션 정상 동작
- [ ] 에러 발생 시 복구 로직 동작
- [ ] 증거 스크린샷 저장 확인

---

## 8. 예상 결과

### Before (현재)
```
client-mobile/          ~1,400 lines (bot.js 579 + modules)
mobile-agent/           ~1,750 lines (all JS files)
Total:                  ~3,150 lines
Duplicates:             ~30% (EvidenceManager, Utils, etc.)
```

### After (리팩토링 후)
```
client-mobile/
├── bot.js              ~150 lines (메인 로직만)
├── core/
│   ├── Utils.js        ~100 lines
│   ├── SupabaseClient.js ~480 lines
│   ├── ErrorRecovery.js  ~610 lines
│   ├── EvidenceManager.js ~360 lines
│   └── YouTubeActions.js  ~180 lines
Total:                  ~1,880 lines
Reduction:              ~40% 코드 감소
```

---

## 9. 롤백 계획

1. 모든 변경 전 git commit 생성
2. 태스크별 브랜치 생성 권장: `refactor/js-phase-1`
3. 문제 발생 시: `git checkout main -- client-mobile/`

---

**Plan Status**: Ready for Execution
**Next Step**: User approval → `/sisyphus execute .sisyphus/plans/js-refactoring-v1.md`

# WebView-based YouTube Search Automation (MOB-01~03)

## 개요

이 구현체는 AutoX.js WebView를 사용하여 YouTube 모바일 웹(m.youtube.com)에서 검색 및 시청 자동화를 수행합니다.

**기존 bot.js와의 차이점:**
- **기존 (bot.js)**: YouTube 앱의 네이티브 UI를 AutoX.js 셀렉터(`id()`, `desc()`, `text()`)로 제어
- **신규 (bot-webview.js)**: WebView 내에서 JavaScript를 주입하여 DOM을 직접 제어

## 아키텍처

```
client-mobile/
├── bot-webview.js              # 메인 진입점
├── config.example.json         # 설정 템플릿
├── config.json                 # 실제 설정 (gitignore)
├── selectors.json              # CSS 셀렉터 설정
└── modules/
    ├── webview-setup.js        # MOB-01: WebView 초기화
    ├── dom-control.js          # MOB-02: DOM 조작 헬퍼
    └── search-flow.js          # MOB-03: 검색/시청 시나리오
```

## 설치 및 설정

### 1. 설정 파일 생성

```bash
cp config.example.json config.json
```

`config.json` 편집:
```json
{
  "supabase": {
    "url": "https://your-project.supabase.co",
    "anon_key": "your-actual-anon-key"
  },
  "device": {
    "group_id": "P1-G1"
  }
}
```

### 2. AutoX.js 설정

1. AutoX.js 앱을 Android 기기에 설치
2. `client-mobile/` 폴더를 기기의 `/sdcard/Scripts/` 경로로 복사
3. AutoX.js 앱에서 `bot-webview.js` 실행

## 모듈 설명

### MOB-01: WebView Setup (`webview-setup.js`)

**역할**: WebView 초기화 및 JavaScript Interface 설정

**주요 기능:**
- WebView UI 레이아웃 생성
- JavaScript 활성화 및 DOM Storage 설정
- User Agent 설정 (Chrome 120+)
- AndroidBridge 인터페이스 등록 (WebView ↔ AutoX.js 양방향 통신)

**사용 예시:**
```javascript
const { initializeWebView } = require('./modules/webview-setup');
const { webView, loadUrl, evaluateJS } = initializeWebView();

loadUrl('https://m.youtube.com');
```

### MOB-02: DOM Control Logic (`dom-control.js`)

**역할**: WebView 내 YouTube DOM 제어

**주요 기능:**
- CSS Selector 우선순위 기반 요소 탐색 (aria-label > id > structural)
- React 호환 텍스트 입력 (`nativeInputValueSetter` 패턴)
- 요소 클릭 이벤트 시뮬레이션
- 동영상 재생 제어 (play, pause, seek, getTime)

**사용 예시:**
```javascript
const domControl = require('./modules/dom-control');

// 검색창에 텍스트 입력
await domControl.inputText(evaluateJS, 'search', 'searchBox', '오픈AI GPT-4');

// 검색 버튼 클릭
await domControl.clickElement(evaluateJS, 'search', 'searchButton');

// 동영상 재생 시간 확인
const { currentTime, duration, percentage } = await domControl.getVideoTime(evaluateJS);
```

### MOB-03: Search Scenario Flow (`search-flow.js`)

**역할**: 검색 및 시청 시나리오 오케스트레이션

**주요 기능:**
- 검색어 입력 및 실행
- 검색 결과에서 N번째 동영상 클릭
- 동영상 시청 (지정된 비율만큼 시청)
- 확률 기반 액션 (좋아요, 댓글, 재생목록 저장)

**사용 예시:**
```javascript
const searchFlow = require('./modules/search-flow');

const result = await searchFlow.executeSearchAndWatch(loadUrl, evaluateJS, {
    searchQuery: '오픈AI GPT-4',
    resultIndex: 0,
    durationMinPct: 30,
    durationMaxPct: 90,
    probLike: 50,
    probComment: 30,
    commentText: '유익한 영상 감사합니다!',
    probPlaylist: 10
});

console.log(result);
// {
//   success: true,
//   watchPercentage: 65,
//   actualDurationSec: 123,
//   liked: true,
//   commented: false,
//   savedToPlaylist: false
// }
```

## CSS Selector 설정 (`selectors.json`)

### 우선순위 전략

1. **aria-label**: 접근성 속성 (가장 안정적)
2. **id**: 고유 ID (중간 안정성)
3. **structural**: 구조 기반 셀렉터 (마지막 수단)

### Selector 업데이트

YouTube DOM 구조 변경 시 `selectors.json`만 수정:

```json
{
  "search": {
    "searchBox": {
      "priority": ["aria-label", "id", "structural"],
      "selectors": [
        "input[aria-label='검색']",       // 우선순위 1
        "input#search",                    // 우선순위 2
        "ytm-search input[type='text']"    // 우선순위 3
      ]
    }
  }
}
```

## 오류 처리

### 자동 재시도 메커니즘

- **Element Wait**: 10초 타임아웃, 500ms 간격으로 재시도
- **Selector Fallback**: 3개 셀렉터 순차 시도
- **Graceful Degradation**: 좋아요/댓글 실패 시 계속 진행

### 주요 오류 유형

| 오류 | 원인 | 해결 방법 |
|------|------|----------|
| `Selector not found` | DOM 구조 변경 | `selectors.json` 업데이트 |
| `Text input failed` | React 이벤트 미발생 | 코드 재검토 (nativeInputValueSetter 패턴 확인) |
| `Video element not found` | 페이지 로딩 미완료 | `waitForElement` 타임아웃 증가 |

## 보안 고려사항

### XSS 방지

입력 텍스트는 자동으로 이스케이프 처리:

```javascript
// dom-control.js에서 자동 처리
const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`');
```

### 인증 정보 보호

- `config.json`은 `.gitignore`에 포함
- Supabase Anon Key만 사용 (Service Role Key는 서버 전용)

## 디버깅

### WebView Console 로그 확인

WebView 내 JavaScript 로그는 AutoX.js 콘솔로 출력:

```javascript
// WebView JavaScript
console.log('Hello from WebView');

// AutoX.js 콘솔 출력
[WebView Console] [LOG] Hello from WebView (m.youtube.com:1)
```

### DOM 스냅샷 수집

```javascript
const domControl = require('./modules/dom-control');
const htmlSnapshot = await domControl.getDOMSnapshot(evaluateJS);
files.write('./debug/dom-snapshot.html', htmlSnapshot);
```

## 성능 최적화

### 랜덤 딜레이

봇 탐지 회피를 위한 인간 같은 행동:

```javascript
await searchFlow.randomSleep(1000, 2000);  // 1~2초 랜덤 대기
```

### 메모리 관리

- Selector 설정은 모듈 로드 시 1회만 읽기
- WebView는 재사용 (매 Job마다 재생성하지 않음)

## 알려진 제한사항

### 미구현 모듈

1. **cookie-manager.js**: 세션 쿠키 관리 (예정)
2. **evidence-capture.js**: 스크린샷 증거 수집 (예정)

### AutoX.js 제약

- Node.js 모듈 (`fs`, `path`) 사용 불가 → AutoX.js `files` 모듈 사용
- `async/await` 지원 제한적 → Promise 기반 구현

## 테스트

### 단위 테스트 (수동)

```javascript
// 1. WebView 초기화 테스트
const { initializeWebView } = require('./modules/webview-setup');
const instance = initializeWebView();
console.log(instance.webView ? 'PASS' : 'FAIL');

// 2. Selector 로드 테스트
const { loadSelectors } = require('./modules/dom-control');
const selectors = loadSelectors();
console.log(selectors ? 'PASS' : 'FAIL');
```

### 통합 테스트

```bash
# AutoX.js 앱에서 bot-webview.js 실행
# 테스트 Job이 자동 실행됨 (hardcoded in code)
```

## 트러블슈팅

### 문제: "config.json not found"

**해결**:
```bash
cp config.example.json config.json
# config.json 편집하여 Supabase 인증 정보 입력
```

### 문제: "Element not found" 반복 발생

**해결**:
1. YouTube 모바일 웹사이트 직접 접속하여 DOM 구조 확인
2. Chrome DevTools로 실제 CSS Selector 검증
3. `selectors.json` 업데이트

### 문제: 동영상이 재생되지 않음

**해결**:
1. WebView 설정에서 `setMediaPlaybackRequiresUserGesture(false)` 확인
2. `playVideo()` 호출 후 실제 재생 여부 확인
3. YouTube Premium 계정 필요 시 로그인 처리

## 기여 가이드

### Selector 업데이트 제출

1. `selectors.json` 수정
2. 실제 기기에서 테스트
3. Pull Request 제출 (변경 사유 명시)

### 버그 리포트

이슈 제출 시 포함 사항:
- AutoX.js 버전
- Android 버전
- 오류 메시지 (콘솔 로그)
- 재현 단계

## 라이선스

MIT License

## 변경 이력

### v1.0.0 (2026-01-29)
- 초기 구현 (MOB-01~03)
- WebView 기반 검색/시청 자동화
- CSS Selector 우선순위 시스템
- React 호환 입력 처리

---

**문의**: doai-me-webapp 프로젝트 이슈 트래커

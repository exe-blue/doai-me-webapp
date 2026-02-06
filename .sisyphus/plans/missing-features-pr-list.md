# Missing Features - PR 목록

**Version**: 1.0.0
**Date**: 2026-02-05

---

## 요약

현재 봇 시스템에서 구현되지 않았거나 부분적으로만 구현된 기능들의 PR 목록입니다.

---

## 🔴 High Priority PRs

### PR #1: feat(youtube-bot): add random watch duration

**파일**: `apps/youtube-bot/src/handlers/WatchHandler.ts`

**현재 상태**: 고정 시청 시간만 지원

**구현 내용**:
```typescript
// 랜덤 시청 시간 계산
function calculateRandomDuration(
  videoDuration: number,
  minPercent: number = 30,
  maxPercent: number = 90
): number {
  const minDuration = Math.floor(videoDuration * minPercent / 100);
  const maxDuration = Math.floor(videoDuration * maxPercent / 100);
  return Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
}
```

**참고**: `apps/mobile/bot.js`에 이미 구현됨 (duration_min_sec, duration_max_sec)

**예상 작업량**: 2시간

---

### PR #2: feat(worker-core): add human simulation utilities

**파일**: `packages/worker-core/src/HumanSimulator.ts` (신규)

**현재 상태**: `apps/desktop-bot.archived/human-simulation.js`에 레거시 구현 존재

**구현 내용**:
```typescript
export class HumanSimulator {
  // 좌표 분산 (±15px)
  addCoordVariance(x: number, y: number, variance: number = 15): [number, number];
  
  // 랜덤 딜레이 (min~max ms)
  randomDelay(min: number, max: number): Promise<void>;
  
  // 노드별 분산 추가 (최대 3000ms)
  addNodeVariance(baseDelay: number, nodeId: string): number;
  
  // 자연스러운 타이핑 시뮬레이션
  typeWithDelay(text: string, charDelayMs: number = 100): Promise<void>;
  
  // 확률 기반 액션 결정
  shouldPerform(probability: number): boolean;
}
```

**예상 작업량**: 4시간

---

### PR #3: feat(youtube-bot): add ad skip without AutoX.js

**파일**: `apps/youtube-bot/src/utils/AdSkipper.ts` (신규)

**현재 상태**: AutoX.js 기반으로만 구현 (`apps/mobile/core/AdSkipper.js`)

**구현 내용**:
- ADB UI dump로 "광고 건너뛰기" 버튼 탐지
- 5초 대기 후 자동 클릭
- 주기적 폴링 (1초마다)

**도전 과제**:
- UI dump가 느림 (~500ms)
- 한국어/영어 버튼 텍스트 처리

**예상 작업량**: 8시간

---

## 🟡 Medium Priority PRs

### PR #4: feat(youtube-bot): add random surf feature

**파일**: `apps/youtube-bot/src/handlers/SurfHandler.ts` (신규)

**현재 상태**: `apps/mobile/core/RandomSurf.js`에 구현됨

**구현 내용**:
1. 홈 탭 이동
2. 피드 스크롤
3. 랜덤 영상 선택
4. 랜덤 시간 시청
5. 미니플레이어로 최소화

**예상 작업량**: 6시간

---

### PR #5: feat(youtube-bot): add playlist save action

**파일**: `apps/youtube-bot/src/handlers/WatchHandler.ts`

**현재 상태**: `apps/mobile/core/YouTubeActions.js`에 구현됨

**구현 내용**:
```typescript
async saveToPlaylist(): Promise<boolean> {
  // 1. 저장 버튼 클릭
  // 2. "나중에 볼 동영상" 선택
  // 3. 확인
}
```

**예상 작업량**: 2시간

---

### PR #6: feat: add @doai/ui-automator package

**파일**: `packages/ui-automator/` (신규 패키지)

**현재 상태**: 직접 ADB shell 사용

**구현 내용**:
```typescript
// ADB UI dump 파싱
async function dumpUI(adb: AdbController): Promise<UIElement[]> {
  const xml = await adb.shell('uiautomator dump /dev/tty');
  return parseXml(xml);
}

// 요소 찾기
async function findElement(selector: Selector): Promise<UIElement | null>;

// 액션 수행
async function clickElement(element: UIElement): Promise<void>;
```

**예상 작업량**: 12시간

---

## 🟢 Low Priority PRs

### PR #7: feat(youtube-bot): add random actions during watch

**파일**: `apps/youtube-bot/src/utils/RandomActions.ts` (신규)

**현재 상태**: `apps/mobile/bot.js`에 부분 구현 (앞으로가기 액션)

**구현 내용**:
- 일시정지/재생 토글
- 작은 스크롤 (설명란 확인)
- 탐색바 클릭 (앞으로/뒤로)
- 품질 변경 시도

**예상 작업량**: 4시간

---

### PR #8: feat(install-bot): add auto permission grant

**파일**: `apps/install-bot/src/handlers/InstallHandler.ts`

**현재 상태**: 미구현

**구현 내용**:
```bash
# 설치 후 자동 권한 부여
adb shell pm grant <package> android.permission.POST_NOTIFICATIONS
adb shell pm grant <package> android.permission.SYSTEM_ALERT_WINDOW
```

**예상 작업량**: 3시간

---

### PR #9: feat(worker-core): add screenshot evidence collection

**파일**: `packages/worker-core/src/EvidenceManager.ts` (신규)

**현재 상태**: `apps/mobile/core/EvidenceManager.js`에 구현됨

**구현 내용**:
```typescript
export class EvidenceManager {
  captureScreenshot(deviceId: string, label: string): Promise<string>;
  uploadEvidence(jobId: string, screenshots: string[]): Promise<void>;
  cleanupOldEvidence(maxAge: number): Promise<void>;
}
```

**예상 작업량**: 4시간

---

## PR 우선순위 요약

| 순위 | PR # | 제목 | 예상 시간 |
|------|------|------|----------|
| 1 | #1 | 랜덤 시청 시간 | 2h |
| 2 | #2 | 휴먼 시뮬레이션 | 4h |
| 3 | #3 | 광고 스킵 (PC) | 8h |
| 4 | #4 | 랜덤 서핑 | 6h |
| 5 | #5 | 재생목록 저장 | 2h |
| 6 | #6 | UIAutomator 래퍼 | 12h |
| 7 | #7 | 시청 중 랜덤 액션 | 4h |
| 8 | #8 | 자동 권한 부여 | 3h |
| 9 | #9 | 스크린샷 증거 수집 | 4h |

**총 예상 시간**: 45시간

---

## 구현 순서 권장

1. **Phase 1** (기반): PR #2 (휴먼 시뮬레이션) - 다른 PR들이 의존
2. **Phase 2** (핵심): PR #1, #5 (쉬운 기능부터)
3. **Phase 3** (고급): PR #4, #6 (복잡한 기능)
4. **Phase 4** (완성): PR #3, #7, #8, #9

---

## 코드 참조 위치

| 기능 | 기존 구현 위치 |
|------|---------------|
| 랜덤 시청 시간 | `apps/mobile/bot.js:95-110` |
| 휴먼 시뮬레이션 | `apps/desktop-bot.archived/human-simulation.js` |
| 광고 스킵 | `apps/mobile/core/AdSkipper.js` |
| 랜덤 서핑 | `apps/mobile/core/RandomSurf.js` |
| 재생목록 저장 | `apps/mobile/core/YouTubeActions.js:saveToPlaylist()` |
| 증거 수집 | `apps/mobile/core/EvidenceManager.js` |

---

**End of PR List**

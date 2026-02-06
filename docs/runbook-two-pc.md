# 프로덕션 배포 런북 (복수 노드)

> Desktop Agent v1.2.0 — 모든 노드가 동일한 풀스택(Manager + Bot) 기능 실행

---

## 개요

모든 PC에 동일한 Desktop Agent를 설치합니다. 각 노드는 역할 구분 없이 다음 기능을 모두 실행합니다:

- **Manager**: Worker 서버, Job 디스패치, Bot Fleet 관리
- **Bot**: ADB 디바이스 제어, Appium 자동화, scrcpy 미러링
- **모니터링**: 실시간 로깅, 히트맵, 인프라 헬스체크

복수 노드를 운영하면 각 기기에서 독립적으로 결과를 수집하고 비교할 수 있습니다.

---

## 1. 노드 설치 (모든 PC 동일)

### 1-1. 필수 소프트웨어

| 소프트웨어 | 설치 방법 | 확인 명령 |
|-----------|----------|----------|
| Node.js 20+ | [nodejs.org](https://nodejs.org) | `node -v` |
| ADB | Android SDK Platform Tools | `adb version` |
| Appium | `npm install -g appium` | `appium --version` |
| UIAutomator2 | `appium driver install uiautomator2` | `appium driver list` |
| scrcpy | [GitHub Releases](https://github.com/Genymobile/scrcpy/releases) | `scrcpy --version` |

### 1-2. Desktop Agent 설치

1. `DoAi.Me Agent-Setup-1.2.0.exe` 실행
2. 설치 경로 선택 (기본값 권장)
3. 설치 완료 후 앱 자동 실행

### 1-3. config.json 설정

`%APPDATA%/DoAi.Me Agent/config.json` 파일을 생성합니다.

**PC1 (node_001):**
```json
{
  "backendBaseUrl": "https://api.doai.me",
  "nodeId": "node_001",
  "workerServerPort": 3001,
  "logLevel": "info"
}
```

**PC2 (node_002):**
```json
{
  "backendBaseUrl": "https://api.doai.me",
  "nodeId": "node_002",
  "workerServerPort": 3001,
  "logLevel": "info"
}
```

> `nodeId`만 PC별로 다르게 설정합니다. 나머지는 동일합니다.
> 설치 디렉토리의 `config.json.example`을 복사해서 수정할 수 있습니다.

### 1-4. 디바이스 연결

1. Android 기기의 USB 디버깅을 활성화합니다.
2. USB로 기기를 연결하고 ADB 인증 팝업을 승인합니다.
3. 연결 확인:
   ```
   adb devices
   ```
4. WiFi ADB로 전환 (선택사항):
   ```
   adb tcpip 5555
   adb connect <기기IP>:5555
   ```

### 1-5. 방화벽 설정

Worker 서버 포트가 다른 노드로부터 접근 가능해야 합니다.

```powershell
netsh advfirewall firewall add rule name="DoAi Worker Server" dir=in action=allow protocol=TCP localport=3001
```

---

## 2. 설치 후 검증

앱을 실행하고 다음을 확인합니다:

### 2-1. 상단 배너 확인

헤더 아래에 노드 상태 배너가 표시됩니다:
- **서버**: Backend 연결 상태 (녹색 점 = 연결됨)
- **Worker 서버**: Worker 서버 실행 상태 (녹색 점 = 실행 중)
- **기기 N대**: 연결된 ADB 디바이스 수

### 2-2. 탭별 검증

| 탭 | 확인 항목 |
|----|----------|
| 실시간 로깅 | `Desktop Agent 시작 완료` 로그 표시 |
| 히트맵 | 연결된 기기 수 카운트 |
| 기기관리 | 연결된 기기 목록, 상태 ONLINE |
| 클라이언트 | Manager 상태 `연결됨`, Worker 서버 포트 표시 |
| 인프라 | `점검 실행` → ADB/Appium/scrcpy/Backend 상태 확인 |

---

## 3. 복수 노드 테스트 시나리오

### 시나리오 1: 독립 실행 확인

1. PC1, PC2 모두 앱 실행
2. 각 PC에서 **인프라** 탭 > `점검 실행`
3. 양쪽 모두 ADB/Appium/scrcpy가 `정상`인지 확인

### 시나리오 2: 디바이스 독립 관리

1. PC1에 기기 A 연결, PC2에 기기 B 연결
2. 각 PC의 **기기관리** 탭에서 자기 기기만 표시되는지 확인
3. 각 기기 행 클릭 → 상세 패널에서 상태 정상 확인

### 시나리오 3: 동시 워크플로우 실행

1. Backend 대시보드에서 PC1, PC2에 각각 워크플로우 발행
2. 각 PC의 **실시간 로깅** 탭에서 워크플로우 진행 로그 확인
3. **히트맵** 탭에서 양쪽 기기의 활동 기록 누적 확인

### 시나리오 4: 서버 재연결

1. Backend 서버를 잠시 중단
2. 양쪽 PC에서 헤더 상태가 `연결 끊김`으로 변경되는지 확인
3. Backend 서버 재시작
4. 양쪽 PC에서 자동 재연결 후 `연결됨` 상태 복귀 확인

### 시나리오 5: 결과 비교

1. 동일한 작업을 PC1, PC2에서 각각 실행
2. 각 PC의 로그, 히트맵 데이터를 비교하여 결과 차이 분석

---

## 4. 트러블슈팅

### ADB 인증 실패

```
error: device unauthorized
```

- 기기 화면에서 USB 디버깅 허용 팝업을 승인하세요.
- `adb kill-server && adb start-server` 후 재시도하세요.

### Appium 드라이버 누락

```
Could not find a driver for automationName 'UiAutomator2'
```

```bash
appium driver install uiautomator2
```

### scrcpy 연결 실패

```
ERROR: Could not find any ADB device
```

- `adb devices`로 기기 연결 상태를 확인하세요.
- scrcpy가 시스템 PATH에 있는지 확인하세요.

### 방화벽 차단

노드 간 통신이 안 되는 경우:

```powershell
Test-NetConnection -ComputerName <상대IP> -Port 3001
```

- Windows 방화벽 인바운드 규칙 확인
- 공유기 AP 격리 설정 확인

### 포트 충돌

Worker 서버 포트(3001)가 이미 사용 중인 경우:

```
netstat -ano | findstr :3001
```

1. `config.json`의 `workerServerPort`를 다른 값(예: 3002)으로 변경
2. 앱 재시작

### nodeId 중복

복수 노드에서 동일한 `nodeId`를 사용하면 Backend에서 충돌이 발생합니다.
각 PC의 `config.json`에서 고유한 `nodeId`를 설정하세요.

# Windows 릴리즈 가이드

> Desktop Agent v1.2.0 — electron-builder NSIS 인스톨러

---

## 1. 빌드

### 사전 조건

- Node.js 20+
- Windows 환경 (NSIS 빌드는 Windows에서만 가능)

### 빌드 명령

```bash
cd apps/desktop-agent
npm run dist:win
```

내부적으로 `tsc && electron-builder --win` 이 실행됩니다.

### 빌드 산출물

```
apps/desktop-agent/release/
  DoAi.Me Agent-Setup-1.2.0.exe   # NSIS 인스톨러 (x64 + ia32)
  latest.yml                       # 자동 업데이트 메타데이터
```

---

## 2. 설치 테스트

### 2-1. 신규 설치

1. `DoAi.Me Agent-Setup-1.2.0.exe` 실행
2. 설치 경로 선택 (기본: `C:\Users\<사용자>\AppData\Local\Programs\DoAi.Me Agent`)
3. 설치 완료 확인:
   - 바탕화면 바로가기 생성
   - 시작 메뉴 > "DoAi.Me Agent" 항목 존재
   - 설정 > 앱 및 기능 > "DoAi.Me Agent 1.2.0" 표시

### 2-2. 실행 확인

1. 바탕화면 바로가기 또는 시작 메뉴에서 실행
2. 하단 푸터에 `DoAi.Me v1.2.0` 표시 확인
3. 상단 노드 상태 배너에 서버/Worker 서버/기기 수 표시 확인
4. 시스템 트레이 아이콘 확인

### 2-3. 기능 확인

모든 노드는 동일한 풀스택(Manager + Bot) 기능을 실행합니다:

| 검증 항목 | 확인 방법 |
|----------|----------|
| Backend 연결 | 헤더 상태 배지 `연결됨` |
| Worker 서버 | 배너의 Worker 서버 녹색 점 |
| 기기 감지 | 기기관리 탭에 ADB 기기 목록 |
| 인프라 | 인프라 탭 > 점검 실행 > 모두 정상 |
| 로그 | 실시간 로깅 탭에 시작 완료 로그 |

---

## 3. 제거 테스트

1. 설정 > 앱 및 기능 > "DoAi.Me Agent" > 제거
2. 또는 시작 메뉴 > DoAi.Me Agent > Uninstall
3. 제거 후 확인:
   - 바탕화면 바로가기 삭제됨
   - 시작 메뉴 항목 삭제됨
   - 설치 디렉토리 삭제됨
   - 앱 및 기능 목록에서 제거됨
   - `%APPDATA%/DoAi.Me Agent/`는 유지 (config.json, 로그 등 사용자 데이터)

---

## 4. 업그레이드 테스트 (이전 버전에서)

1. v1.1.0이 설치된 상태에서 v1.2.0 인스톨러 실행
2. 기존 설치 경로에 덮어쓰기 설치
3. 실행 후 `v1.2.0` 표시 확인
4. 노드 상태 배너 정상 표시 확인
5. 기존 `%APPDATA%/DoAi.Me Agent/` 데이터 보존 확인

---

## 5. 복수 노드 테스트

동일 인스톨러를 2대 이상의 PC에 설치하고:

1. 각 PC의 `config.json`에 서로 다른 `nodeId` 설정
2. 각 PC에 Android 기기 연결
3. 양쪽 동시 실행 → 독립적 기기 관리 + 워크플로우 실행 확인
4. 각 노드의 로그/히트맵 데이터 비교

자세한 시나리오: [runbook-two-pc.md](./runbook-two-pc.md)

---

## 6. 릴리즈 배포

### GitHub Releases

```bash
cd apps/desktop-agent
npm run release:win
```

`electron-builder --win --publish always`가 실행되어 GitHub Releases에 자동 업로드됩니다.

### 수동 배포

1. `release/DoAi.Me Agent-Setup-1.2.0.exe`를 릴리즈 서버에 업로드
2. `release/latest.yml`을 같은 위치에 업로드
3. 기존 설치 클라이언트는 자동 업데이트를 통해 갱신됨

---

## 7. 체크리스트

- [ ] `npm run dist:win` 빌드 성공
- [ ] 인스톨러 파일 크기 적정 (일반적으로 80~150MB)
- [ ] 신규 설치 정상
- [ ] 바로가기 및 시작 메뉴 생성
- [ ] 앱 및 기능 등록
- [ ] 노드 상태 배너 표시 (서버/Worker/기기)
- [ ] Manager + Bot 기능 모두 동작
- [ ] 제거 시 바로가기 및 프로그램 삭제
- [ ] 이전 버전에서 업그레이드 정상
- [ ] 복수 노드 독립 실행 정상
- [ ] 자동 업데이트 메타데이터 (latest.yml) 생성

# DoAi.Me Worker v5.1

## 개요

DoAi.Me Worker는 PC에서 연결된 Android 기기를 제어하고 작업을 실행하는 클라이언트 프로그램입니다.

## 설치 방법

### 방법 1: 설치 프로그램 (권장)

1. `DoaiWorker_Setup_5.1.0.exe` 실행
2. 설치 완료 후 설치 폴더로 이동
3. `.env.example`을 `.env`로 복사
4. `.env` 파일 편집하여 설정 입력
5. `DoaiWorker.exe` 실행

### 방법 2: 수동 설치

1. `DoaiWorker.exe`를 원하는 폴더에 복사
2. 같은 폴더에 `.env` 파일 생성 (env.example 참고)
3. `DoaiWorker.exe` 실행

## 환경 설정 (.env)

```env
# Worker 식별자 (PC별 고유값)
PC_CODE=P01

# 서버 URL
API_BASE_URL=https://doai.me

# Worker API 키
WORKER_API_KEY=your-worker-api-key

# ADB 경로 (옵션)
ADB_PATH=C:\platform-tools\adb.exe
```

## 필수 요구사항

1. **ADB 설치**
   - [Android Platform Tools](https://developer.android.com/studio/releases/platform-tools) 다운로드
   - 환경 변수 PATH에 추가하거나 .env에 경로 지정

2. **USB 디버깅 활성화**
   - 각 Android 기기에서 개발자 옵션 → USB 디버깅 활성화
   - PC와 연결 시 "USB 디버깅 허용" 승인

3. **AutoX.js 설치** (기기별)
   - AutoX.js 앱 설치
   - 접근성 권한 허용
   - `/sdcard/Scripts/doai-bot/` 폴더에 스크립트 배포

## 기능

- **기기 자동 감지**: USB 연결된 기기 자동 등록
- **20대 슬롯 관리**: PC당 최대 20대 기기 관리
- **실시간 상태 전송**: 5초마다 서버에 상태 전송
- **원격 제어**: 대시보드에서 기기 원격 조작
- **화면 스트리밍**: 실시간 화면 미러링
- **작업 실행**: 서버에서 할당된 작업 자동 실행

## 문제 해결

### 기기가 인식되지 않음
```bash
# ADB 서버 재시작
adb kill-server
adb start-server
adb devices
```

### 연결이 끊어짐
- 네트워크 상태 확인
- 서버 URL 확인 (.env)
- Worker API 키 확인

### 권한 오류
- 관리자 권한으로 실행
- ADB 경로 확인

## 로그

실행 중 콘솔에서 실시간 로그 확인 가능:
- `💓 Heartbeat` - 상태 전송
- `✅ Connected` - 서버 연결 성공
- `📋 Job assigned` - 작업 할당
- `🎥 Stream start` - 화면 스트리밍 시작

## 지원

문제 발생 시 [GitHub Issues](https://github.com/exe-blue/doai-me-webapp/issues)에 문의

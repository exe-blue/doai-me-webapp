# DoAi.Me Worker 빌드 가이드

## 빠른 시작

### Windows

```batch
cd client-pc
build.bat
```

### Mac/Linux

```bash
cd client-pc
chmod +x build.sh
./build.sh
```

---

## 수동 빌드

### 1. 사전 요구사항

```bash
# pkg 전역 설치
npm install -g pkg

# 의존성 설치
cd client-pc
npm install
```

### 2. 실행 파일 빌드

```bash
# Windows만 빌드
npm run build

# 모든 플랫폼 빌드
npm run build:all
```

### 3. 출력 파일

```
dist/
├── DoaiWorker.exe      # Windows
├── DoaiWorker-macos    # macOS
├── DoaiWorker-linux    # Linux
├── env.example         # 환경 설정 템플릿
└── README.txt          # 사용 가이드
```

---

## Windows 설치 프로그램 (Inno Setup)

### 1. Inno Setup 설치

[Inno Setup 다운로드](https://jrsoftware.org/isinfo.php)

### 2. 설치 프로그램 빌드

1. Inno Setup Compiler 실행
2. `client-pc/installer/setup.iss` 열기
3. Build → Compile (Ctrl+F9)

### 3. 출력

```
dist/DoaiWorker_Setup_5.1.0.exe
```

---

## pkg 설정 상세

### package.json

```json
{
  "bin": "worker.js",
  "pkg": {
    "assets": ["node_modules/**/*"],
    "targets": ["node20-win-x64"],
    "outputPath": "dist"
  }
}
```

### 지원 플랫폼

| Target | 설명 |
|--------|------|
| `node20-win-x64` | Windows 64-bit |
| `node20-macos-x64` | macOS Intel |
| `node20-macos-arm64` | macOS Apple Silicon |
| `node20-linux-x64` | Linux 64-bit |

---

## 외부 파일 접근

`worker.js`는 `process.cwd()`를 사용하여 외부 파일에 접근합니다:

```javascript
const APP_ROOT = process.cwd();
const MAP_FILE = path.join(APP_ROOT, 'device-map.json');
const envPath = path.join(APP_ROOT, '.env');
```

**배포 시 구조:**

```
DoaiWorker/
├── DoaiWorker.exe    # 실행 파일
├── .env              # 환경 설정 (사용자 생성)
├── device-map.json   # 기기 매핑 (자동 생성)
└── README.txt        # 사용 가이드
```

---

## 트러블슈팅

### 빌드 실패: "Cannot find module"

```bash
# node_modules 재설치
rm -rf node_modules
npm install
```

### 실행 시 .env를 찾지 못함

- `.exe` 파일과 같은 폴더에 `.env` 파일 확인
- 관리자 권한으로 실행

### sharp 모듈 오류

```bash
# sharp 재빌드
npm rebuild sharp
```

### 바이러스 오탐지

- pkg로 빌드된 실행 파일은 일부 백신에서 오탐지될 수 있음
- 백신 예외 처리 또는 코드 서명 추가 권장

#!/bin/bash
echo "============================================="
echo "DoAi.Me Worker Build Script"
echo "============================================="
echo

# 1. pkg 설치 확인
if ! command -v pkg &> /dev/null; then
    echo "[INFO] Installing pkg globally..."
    npm install -g pkg
fi

# 2. 의존성 설치
echo "[STEP 1/3] Installing dependencies..."
npm install

# 3. dist 폴더 생성
mkdir -p dist

# 4. exe 빌드
echo
echo "[STEP 2/3] Building executable..."
npm run build:all

# 5. 추가 파일 복사
echo
echo "[STEP 3/3] Copying additional files..."
cp env.example dist/
cp README-WORKER.md dist/README.txt

echo
echo "============================================="
echo "Build completed!"
echo "Output: dist/"
echo "============================================="
echo
echo "Next steps:"
echo "1. Create .env file in dist folder"
echo "2. Run the executable for your platform"

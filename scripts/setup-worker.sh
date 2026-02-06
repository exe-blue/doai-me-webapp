#!/bin/bash
#
# 미니PC Celery Worker 설치 스크립트
# 사용법: ./setup-worker.sh [PC번호]
# 예: ./setup-worker.sh PC01
#

set -e

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 설정
INSTALL_DIR="/opt/doai"
APK_DIR="${INSTALL_DIR}/apk"
WORKER_DIR="${INSTALL_DIR}/worker"
VENV_DIR="${INSTALL_DIR}/venv"

# PC 번호 확인
if [ -z "$1" ]; then
    log_error "PC 번호를 입력하세요. 예: ./setup-worker.sh PC01"
    exit 1
fi

PC_NUMBER=$1
WORKER_QUEUE=$(echo $PC_NUMBER | tr '[:upper:]' '[:lower:]')

log_info "=== DOAI Worker 설치 시작 ==="
log_info "PC: ${PC_NUMBER}, Queue: ${WORKER_QUEUE}"

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then
    log_error "root 권한이 필요합니다. sudo로 실행하세요."
    exit 1
fi

# 1. 시스템 패키지 설치
log_info "1/7. 시스템 패키지 설치..."
apt-get update
apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    adb \
    usbutils \
    curl \
    git

# 2. 디렉토리 생성
log_info "2/7. 디렉토리 생성..."
mkdir -p ${INSTALL_DIR}
mkdir -p ${APK_DIR}
mkdir -p ${WORKER_DIR}

# 3. Worker 코드 복사 (또는 git clone)
log_info "3/7. Worker 코드 배포..."
if [ -d "${WORKER_DIR}/celery_app.py" ]; then
    log_warn "기존 Worker 코드 발견. 업데이트 중..."
fi

# 현재 스크립트 위치에서 apps/worker 복사
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_SRC="${SCRIPT_DIR}/../apps/worker"

if [ -d "$WORKER_SRC" ]; then
    cp -r ${WORKER_SRC}/* ${WORKER_DIR}/
else
    log_warn "로컬 Worker 소스 없음. Git에서 다운로드 필요."
fi

# 4. Python 가상환경 생성
log_info "4/7. Python 가상환경 생성..."
python3.11 -m venv ${VENV_DIR}
source ${VENV_DIR}/bin/activate

# 5. Python 의존성 설치
log_info "5/7. Python 패키지 설치..."
pip install --upgrade pip
pip install -r ${WORKER_DIR}/requirements.txt

# 6. 환경변수 설정
log_info "6/7. 환경변수 설정..."
ENV_FILE="${WORKER_DIR}/.env"

if [ ! -f "$ENV_FILE" ]; then
    cat > ${ENV_FILE} << EOF
# PC 식별
PC_NUMBER=${PC_NUMBER}
WORKER_QUEUE=${WORKER_QUEUE}

# Celery (Redis) - 실제 서버 주소로 변경 필요
CELERY_BROKER_URL=redis://158.247.210.152:6379/0
CELERY_RESULT_BACKEND=redis://158.247.210.152:6379/1

# Supabase - 실제 값으로 변경 필요
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# ADB
ADB_PATH=adb
ADB_TIMEOUT=30
MAX_CONCURRENT_ADB=5

# APK 저장 경로
APK_DIRECTORY=${APK_DIR}

# 작업 설정
TASK_TIME_LIMIT=300
MAX_RETRIES=3
RETRY_DELAY=60

# 로깅
LOG_LEVEL=INFO
EOF
    log_warn ".env 파일 생성됨. SUPABASE 설정을 업데이트하세요: ${ENV_FILE}"
else
    log_info ".env 파일이 이미 존재합니다."
fi

# 7. systemd 서비스 등록
log_info "7/7. systemd 서비스 등록..."
SERVICE_FILE="/etc/systemd/system/doai-worker.service"

cat > ${SERVICE_FILE} << EOF
[Unit]
Description=DOAI Celery Worker (${PC_NUMBER})
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${WORKER_DIR}
Environment=PATH=${VENV_DIR}/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${WORKER_DIR}/.env
ExecStart=${VENV_DIR}/bin/celery -A celery_app worker -Q ${WORKER_QUEUE} -c 5 --loglevel=info
Restart=always
RestartSec=10

# 로그 설정
StandardOutput=journal
StandardError=journal
SyslogIdentifier=doai-worker

# 리소스 제한
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# systemd 리로드
systemctl daemon-reload
systemctl enable doai-worker

log_info "=== 설치 완료 ==="
echo ""
echo "다음 단계:"
echo "1. .env 파일 수정: nano ${ENV_FILE}"
echo "   - SUPABASE_URL, SUPABASE_KEY 설정"
echo ""
echo "2. ADB 연결 확인: adb devices"
echo ""
echo "3. Worker 시작: systemctl start doai-worker"
echo ""
echo "4. 로그 확인: journalctl -u doai-worker -f"
echo ""
echo "수동 실행 테스트:"
echo "  cd ${WORKER_DIR}"
echo "  source ${VENV_DIR}/bin/activate"
echo "  celery -A celery_app worker -Q ${WORKER_QUEUE} -c 5 --loglevel=debug"

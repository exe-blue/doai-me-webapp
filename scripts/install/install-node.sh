#!/usr/bin/env bash
# =============================================
# DoAi.Me Node 설치 스크립트 (Linux/macOS)
# =============================================
#
# 사용법:
#   chmod +x install-node.sh
#   ./install-node.sh
#   ./install-node.sh --node-id "node_001" --server-url "https://api.doai.me"
#
# Note: This script should be saved with LF line endings (Unix style).
# If you encounter "bad interpreter" errors, run: sed -i 's/\r$//' install-node.sh
# =============================================

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 기본값
NODE_ID=""
SERVER_URL="https://api.doai.me"
INSTALL_DIR="$HOME/.local/share/doaime-agent"

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --node-id)
            NODE_ID="$2"
            shift 2
            ;;
        --server-url)
            SERVER_URL="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  --node-id     Node ID (default: auto-generated)"
            echo "  --server-url  Server URL (default: https://api.doai.me)"
            echo "  --install-dir Install directory (default: ~/.local/share/doaime-agent)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================
# 헬퍼 함수
# =============================================

print_title() {
    echo -e "${CYAN}$1${NC}"
}

print_success() {
    echo -e "${GREEN}  ✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}  ⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}  ✗ $1${NC}"
}

print_info() {
    echo -e "  $1"
}

# OS 감지
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        print_error "지원하지 않는 운영체제입니다: $OSTYPE"
        exit 1
    fi
}

# =============================================
# 메인 스크립트
# =============================================

clear
echo ""
print_title "╔═══════════════════════════════════════════════════════════╗"
print_title "║        DoAi.Me Agent 설치 스크립트 (Linux/macOS)          ║"
print_title "╚═══════════════════════════════════════════════════════════╝"
echo ""

detect_os
print_info "운영체제: $OS"

# =============================================
# 1. 필수 프로그램 확인
# =============================================

echo ""
print_title "[1/5] 필수 프로그램 확인..."
echo ""

# ADB 확인
if command -v adb &> /dev/null; then
    ADB_VERSION=$(adb version | head -1)
    print_success "ADB: $ADB_VERSION"
else
    print_error "ADB가 설치되어 있지 않습니다."
    echo ""
    
    if [[ "$OS" == "macos" ]]; then
        print_info "macOS에서 ADB 설치:"
        print_info "  brew install android-platform-tools"
    else
        print_info "Linux에서 ADB 설치:"
        print_info "  sudo apt install android-tools-adb  (Debian/Ubuntu)"
        print_info "  sudo dnf install android-tools     (Fedora)"
    fi
    
    echo ""
    read -p "ADB를 설치한 후 다시 실행해주세요. 계속하시겠습니까? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# =============================================
# 2. 설치 디렉토리 생성
# =============================================

echo ""
print_title "[2/5] 설치 디렉토리 생성..."
echo ""

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"
print_success "디렉토리: $INSTALL_DIR"

# =============================================
# 3. Agent 다운로드
# =============================================

echo ""
print_title "[3/5] Agent 다운로드..."
echo ""

if [[ "$OS" == "macos" ]]; then
    DOWNLOAD_URL="https://releases.doai.me/agent/latest/DoAiMe-Agent.dmg"
    INSTALLER_PATH="$INSTALL_DIR/DoAiMe-Agent.dmg"
else
    DOWNLOAD_URL="https://releases.doai.me/agent/latest/DoAiMe-Agent.AppImage"
    INSTALLER_PATH="$INSTALL_DIR/DoAiMe-Agent.AppImage"
fi

print_info "다운로드: $DOWNLOAD_URL"

# Download with proper error handling
download_result=0
if command -v curl &> /dev/null; then
    # curl: Use -f to fail on HTTP errors, -S to show errors, -L for redirects
    if curl -fSL -o "$INSTALLER_PATH" "$DOWNLOAD_URL" 2>&1; then
        download_result=0
    else
        download_result=$?
        print_error "curl download failed with exit code $download_result"
    fi
elif command -v wget &> /dev/null; then
    # Fallback to wget if curl is not available
    if wget -q -O "$INSTALLER_PATH" "$DOWNLOAD_URL" 2>&1; then
        download_result=0
    else
        download_result=$?
        print_error "wget download failed with exit code $download_result"
    fi
else
    print_error "Neither curl nor wget is available. Please install one of them."
    exit 1
fi

if [[ $download_result -eq 0 ]] && [[ -f "$INSTALLER_PATH" ]]; then
    FILE_SIZE=$(du -h "$INSTALLER_PATH" | cut -f1)
    print_success "다운로드 완료 ($FILE_SIZE)"
    
    if [[ "$OS" == "linux" ]]; then
        chmod +x "$INSTALLER_PATH"
    fi
else
    print_warning "다운로드 실패 (exit code: $download_result). 수동으로 설치해주세요."
fi

# =============================================
# 4. 환경 변수 설정
# =============================================

echo ""
print_title "[4/5] 환경 변수 설정..."
echo ""

# Node ID 생성
if [[ -z "$NODE_ID" ]]; then
    HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
    RANDOM_NUM=$((RANDOM % 99999))
    NODE_ID="node_${HOSTNAME}_${RANDOM_NUM}"
fi

# 쉘 설정 파일에 추가
SHELL_RC=""
if [[ -f "$HOME/.zshrc" ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [[ -n "$SHELL_RC" ]]; then
    # 기존 설정 제거 (portable temp file approach for macOS/Linux compatibility)
    grep -v 'DOAIME_NODE_ID' "$SHELL_RC" > "$SHELL_RC.tmp" && mv "$SHELL_RC.tmp" "$SHELL_RC"
    grep -v 'DOAIME_SERVER_URL' "$SHELL_RC" > "$SHELL_RC.tmp" && mv "$SHELL_RC.tmp" "$SHELL_RC"
    
    # 새 설정 추가
    echo "export DOAIME_NODE_ID=\"$NODE_ID\"" >> "$SHELL_RC"
    echo "export DOAIME_SERVER_URL=\"$SERVER_URL\"" >> "$SHELL_RC"
    
    print_success "환경 변수 추가: $SHELL_RC"
fi

# 현재 세션에도 적용
export DOAIME_NODE_ID="$NODE_ID"
export DOAIME_SERVER_URL="$SERVER_URL"

print_success "NODE_ID: $NODE_ID"
print_success "SERVER_URL: $SERVER_URL"

# 설정 파일 생성
cat > "$INSTALL_DIR/config.json" << EOF
{
  "nodeId": "$NODE_ID",
  "serverUrl": "$SERVER_URL",
  "installedAt": "$(date '+%Y-%m-%d %H:%M:%S')",
  "version": "1.0.0"
}
EOF

print_success "설정 파일: $INSTALL_DIR/config.json"

# =============================================
# 5. 설치
# =============================================

echo ""
print_title "[5/5] 설치..."
echo ""

if [[ "$OS" == "macos" ]]; then
    if [[ -f "$INSTALLER_PATH" ]]; then
        print_info "DMG 마운트 중..."
        # Parse actual mount point from hdiutil output
        MOUNT_OUTPUT=$(hdiutil attach "$INSTALLER_PATH" -nobrowse 2>&1)
        MOUNT_POINT=$(echo "$MOUNT_OUTPUT" | grep -o '/Volumes/[^"]*' | tail -1)
        
        if [[ -n "$MOUNT_POINT" ]]; then
            # Applications 폴더로 복사
            cp -R "$MOUNT_POINT/DoAiMe-Agent.app" "/Applications/" 2>/dev/null || true
            
            hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
            print_success "설치 완료: /Applications/DoAiMe-Agent.app"
        else
            print_warning "DMG 마운트 실패. 수동으로 설치해주세요."
        fi
    fi
else
    if [[ -f "$INSTALLER_PATH" ]]; then
        # Download icon if not exists, use fallback otherwise
        ICON_PATH="$INSTALL_DIR/icon.png"
        ICON_URL="https://releases.doai.me/agent/assets/icon.png"
        if [[ ! -f "$ICON_PATH" ]]; then
            curl -fsSL -o "$ICON_PATH" "$ICON_URL" 2>/dev/null || true
        fi
        # Use generic icon if download failed
        if [[ ! -f "$ICON_PATH" ]]; then
            ICON_PATH="application-x-executable"
        fi
        
        # 데스크탑 파일 생성
        mkdir -p "$HOME/.local/share/applications"
        cat > "$HOME/.local/share/applications/doaime-agent.desktop" << EOF
[Desktop Entry]
Name=DoAi.Me Agent
Comment=DoAi.Me Device Control Agent
Exec=$INSTALLER_PATH
Icon=$ICON_PATH
Terminal=false
Type=Application
Categories=Utility;
EOF
        print_success "데스크탑 엔트리 생성"
        print_success "AppImage: $INSTALLER_PATH"
    fi
fi

# =============================================
# 완료
# =============================================

echo ""
print_title "╔═══════════════════════════════════════════════════════════╗"
print_title "║                    설치가 완료되었습니다!                  ║"
print_title "╚═══════════════════════════════════════════════════════════╝"
echo ""

print_info "설치 정보:"
echo -e "  - Node ID:    ${GREEN}$NODE_ID${NC}"
echo -e "  - Server:     ${GREEN}$SERVER_URL${NC}"
echo -e "  - 설치 경로:  ${GREEN}$INSTALL_DIR${NC}"
echo ""

print_title "다음 단계:"
echo "  1. 스마트폰을 USB로 PC에 연결하세요"
echo "  2. 스마트폰에서 'USB 디버깅'을 허용하세요"
echo "  3. DoAi.Me Agent를 실행하세요"
echo ""

if [[ "$OS" == "macos" ]]; then
    echo "    open /Applications/DoAiMe-Agent.app"
else
    echo "    $INSTALLER_PATH"
fi

echo ""
print_title "설치 스크립트 완료!"
echo ""

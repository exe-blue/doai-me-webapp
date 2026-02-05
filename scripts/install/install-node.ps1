# =============================================
# DoAi.Me Node 설치 스크립트 (Windows)
# =============================================
#
# 사용법:
#   .\install-node.ps1
#   .\install-node.ps1 -NodeId "node_001" -ServerUrl "https://api.doai.me"
#
# =============================================

param(
    [string]$NodeId = "",
    [string]$ServerUrl = "https://api.doai.me",
    [switch]$SkipDownload = $false,
    [switch]$Silent = $false
)

# 색상 설정
$ColorTitle = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"
$ColorInfo = "White"

function Write-Title($message) {
    Write-Host $message -ForegroundColor $ColorTitle
}

function Write-Success($message) {
    Write-Host "  ✓ $message" -ForegroundColor $ColorSuccess
}

function Write-Warning($message) {
    Write-Host "  ⚠ $message" -ForegroundColor $ColorWarning
}

function Write-Error($message) {
    Write-Host "  ✗ $message" -ForegroundColor $ColorError
}

function Write-Info($message) {
    Write-Host "  $message" -ForegroundColor $ColorInfo
}

# =============================================
# 메인 스크립트
# =============================================

Clear-Host
Write-Host ""
Write-Title "╔═══════════════════════════════════════════════════════════╗"
Write-Title "║          DoAi.Me Agent 설치 스크립트 (Windows)            ║"
Write-Title "╚═══════════════════════════════════════════════════════════╝"
Write-Host ""

# =============================================
# 1. 시스템 요구사항 확인
# =============================================

Write-Title "[1/6] 시스템 요구사항 확인..."
Write-Host ""

# Windows 버전 확인
$osInfo = Get-CimInstance Win32_OperatingSystem
$osVersion = [System.Version]$osInfo.Version
Write-Info "운영체제: $($osInfo.Caption) ($($osInfo.Version))"

if ($osVersion.Major -lt 10) {
    Write-Error "Windows 10 이상이 필요합니다."
    exit 1
}
Write-Success "Windows 버전 OK"

# 관리자 권한 확인
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    Write-Success "관리자 권한 확인됨"
} else {
    Write-Warning "관리자 권한 없음 (일부 기능 제한될 수 있음)"
}

# =============================================
# 2. 필수 프로그램 확인
# =============================================

Write-Host ""
Write-Title "[2/6] 필수 프로그램 확인..."
Write-Host ""

# ADB 확인
$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
    $adbVersion = (adb version 2>&1 | Select-String "version").ToString()
    Write-Success "ADB: $adbVersion"
} else {
    Write-Error "ADB가 설치되어 있지 않습니다."
    Write-Info ""
    Write-Info "Android SDK Platform Tools를 설치해주세요:"
    Write-Info "https://developer.android.com/studio/releases/platform-tools"
    Write-Info ""
    
    # In silent mode, auto-download ADB; otherwise prompt
    $installAdb = if ($Silent) { "Y" } else { Read-Host "자동으로 ADB를 다운로드하시겠습니까? (Y/N)" }
    if ($installAdb -eq "Y" -or $installAdb -eq "y") {
        Write-Info "ADB 다운로드 중..."
        $adbUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
        $adbZip = "$env:TEMP\platform-tools.zip"
        $adbDir = "$env:LOCALAPPDATA\Android\platform-tools"
        
        try {
            Invoke-WebRequest -Uri $adbUrl -OutFile $adbZip
            Expand-Archive -Path $adbZip -DestinationPath "$env:LOCALAPPDATA\Android" -Force
            
            # PATH에 추가
            $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
            if ($currentPath -notlike "*$adbDir*") {
                [Environment]::SetEnvironmentVariable("Path", "$currentPath;$adbDir", "User")
                $env:Path = "$env:Path;$adbDir"
            }
            
            Write-Success "ADB 설치 완료: $adbDir"
        } catch {
            Write-Error "ADB 다운로드 실패: $_"
            exit 1
        }
    } else {
        exit 1
    }
}

# Node.js 확인 (선택)
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = (node --version 2>&1)
    Write-Success "Node.js: $nodeVersion (선택사항)"
} else {
    Write-Warning "Node.js 미설치 (Agent 실행에는 필요 없음)"
}

# =============================================
# 3. 설치 디렉토리 생성
# =============================================

Write-Host ""
Write-Title "[3/6] 설치 디렉토리 생성..."
Write-Host ""

$installDir = "$env:LOCALAPPDATA\DoAiMe-Agent"
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
    Write-Success "디렉토리 생성: $installDir"
} else {
    Write-Info "기존 디렉토리 사용: $installDir"
}

# 로그 디렉토리
$logDir = "$installDir\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

# =============================================
# 4. Agent 다운로드
# =============================================

Write-Host ""
Write-Title "[4/6] Agent 다운로드..."
Write-Host ""

if (-not $SkipDownload) {
    $downloadUrl = "https://releases.doai.me/agent/latest/DoAiMe-Agent-Setup.exe"
    $installerPath = "$installDir\DoAiMe-Agent-Setup.exe"

    Write-Info "다운로드 URL: $downloadUrl"
    
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
        $ProgressPreference = 'Continue'
        
        if (Test-Path $installerPath) {
            $fileSize = (Get-Item $installerPath).Length / 1MB
            Write-Success "다운로드 완료 ({0:N2} MB)" -f $fileSize
        } else {
            Write-Error "다운로드 실패: 파일이 생성되지 않았습니다."
            exit 1
        }
    } catch {
        Write-Error "다운로드 실패: $_"
        Write-Warning "수동으로 다운로드하여 설치해주세요."
        exit 1
    }
} else {
    Write-Info "다운로드 건너뜀 (-SkipDownload)"
}

# =============================================
# 5. 환경 변수 설정
# =============================================

Write-Host ""
Write-Title "[5/6] 환경 변수 설정..."
Write-Host ""

# Node ID 생성
if (-not $NodeId) {
    $hostname = $env:COMPUTERNAME
    $random = Get-Random -Maximum 99999
    $NodeId = "node_${hostname}_${random}"
}

# 환경 변수 설정
[Environment]::SetEnvironmentVariable("DOAIME_NODE_ID", $NodeId, "User")
[Environment]::SetEnvironmentVariable("DOAIME_SERVER_URL", $ServerUrl, "User")

# 현재 세션에도 적용
$env:DOAIME_NODE_ID = $NodeId
$env:DOAIME_SERVER_URL = $ServerUrl

Write-Success "NODE_ID: $NodeId"
Write-Success "SERVER_URL: $ServerUrl"

# 설정 파일 생성
$configPath = "$installDir\config.json"
$config = @{
    nodeId = $NodeId
    serverUrl = $ServerUrl
    installedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    version = "1.0.0"
} | ConvertTo-Json

$config | Out-File -FilePath $configPath -Encoding UTF8
Write-Success "설정 파일: $configPath"

# =============================================
# 6. 설치 실행
# =============================================

Write-Host ""
Write-Title "[6/6] 설치 프로그램 실행..."
Write-Host ""

$installerPath = "$installDir\DoAiMe-Agent-Setup.exe"

if (Test-Path $installerPath) {
    Write-Info "설치 프로그램 실행 중..."
    
    if ($Silent) {
        Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait
    } else {
        Start-Process -FilePath $installerPath -Wait
    }
    
    Write-Success "설치 완료"
} else {
    Write-Warning "설치 파일을 찾을 수 없습니다."
    Write-Info "수동으로 설치해주세요: $installerPath"
}

# =============================================
# 완료 메시지
# =============================================

Write-Host ""
Write-Title "╔═══════════════════════════════════════════════════════════╗"
Write-Title "║                    설치가 완료되었습니다!                  ║"
Write-Title "╚═══════════════════════════════════════════════════════════╝"
Write-Host ""

Write-Info "설치 정보:"
Write-Host "  - Node ID:    $NodeId" -ForegroundColor $ColorSuccess
Write-Host "  - Server:     $ServerUrl" -ForegroundColor $ColorSuccess
Write-Host "  - 설치 경로:  $installDir" -ForegroundColor $ColorSuccess
Write-Host "  - 로그 경로:  $logDir" -ForegroundColor $ColorSuccess
Write-Host ""

Write-Title "다음 단계:"
Write-Host "  1. 스마트폰을 USB로 PC에 연결하세요"
Write-Host "  2. 스마트폰에서 'USB 디버깅'을 허용하세요"
Write-Host "  3. 시작 메뉴에서 'DoAi.Me Agent'를 실행하세요"
Write-Host ""

Write-Warning "주의사항:"
Write-Host "  - 스마트폰의 '개발자 옵션'이 활성화되어 있어야 합니다"
Write-Host "  - USB 디버깅 허용 팝업이 나타나면 '이 컴퓨터 항상 허용' 체크 후 허용"
Write-Host ""

# 선택: Agent 바로 실행 (skip in silent mode)
if (-not $Silent) {
    $startNow = Read-Host "지금 Agent를 실행하시겠습니까? (Y/N)"
    if ($startNow -eq "Y" -or $startNow -eq "y") {
        $agentPath = "$env:LOCALAPPDATA\Programs\DoAiMe-Agent\DoAiMe-Agent.exe"
        $altPath = "$env:PROGRAMFILES\DoAiMe-Agent\DoAiMe-Agent.exe"
        
        if (Test-Path $agentPath) {
            Start-Process -FilePath $agentPath
            Write-Success "Agent 실행됨"
        } elseif (Test-Path $altPath) {
            Start-Process -FilePath $altPath
            Write-Success "Agent 실행됨"
        } else {
            Write-Warning "Agent 실행 파일을 찾을 수 없습니다. 시작 메뉴에서 실행해주세요."
        }
    }
} else {
    Write-Info "Silent 모드: Agent 자동 실행 건너뜀"
}

Write-Host ""
Write-Title "설치 스크립트 완료!"
Write-Host ""

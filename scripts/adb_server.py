import asyncio
import subprocess
import re
import time
from mcp.server.fastmcp import FastMCP # 최신 FastMCP 방식 사용 권장

# 서버 이름 정의
mcp = FastMCP("Android-ADB-Controller")

# 연결 설정 상수
MAX_RETRIES = 3
RETRY_DELAY_MS = 500
COMMAND_TIMEOUT_SEC = 10

def run_adb_command(args, retries=MAX_RETRIES, timeout=COMMAND_TIMEOUT_SEC):
    """
    ADB 명령어를 실행하고 결과를 반환하는 헬퍼 함수
    
    개선사항:
    - 재시도 로직 추가 (지수 백오프)
    - 타임아웃 설정
    - 상세한 오류 메시지
    """
    last_error = None
    
    for attempt in range(retries):
        try:
            # Windows 환경 고려: shell=True, encoding='utf-8'
            result = subprocess.run(
                ["adb"] + args, 
                capture_output=True, 
                text=True, 
                encoding='utf-8',
                errors='ignore',  # 깨진 문자 무시
                timeout=timeout   # 타임아웃 추가
            )
            
            # 오류 출력 확인
            if result.returncode != 0 and result.stderr:
                # ADB 오류가 있지만 재시도 가능한 경우
                if "device offline" in result.stderr.lower() or "no devices" in result.stderr.lower():
                    last_error = f"ADB Error: {result.stderr.strip()}"
                    if attempt < retries - 1:
                        delay = (RETRY_DELAY_MS / 1000) * (2 ** attempt)  # 지수 백오프
                        time.sleep(delay)
                        continue
                        
            return result.stdout.strip()
            
        except subprocess.TimeoutExpired:
            last_error = f"ADB 명령 타임아웃 ({timeout}초)"
            if attempt < retries - 1:
                time.sleep(RETRY_DELAY_MS / 1000)
                continue
        except Exception as e:
            last_error = f"Error executing ADB: {str(e)}"
            if attempt < retries - 1:
                time.sleep(RETRY_DELAY_MS / 1000)
                continue
    
    return last_error or "Unknown error"

@mcp.tool()
def get_connected_devices():
    """현재 연결된 안드로이드 기기 목록과 상태를 조회합니다."""
    output = run_adb_command(["devices", "-l"])
    devices = []
    
    # 출력 파싱 (model, device id 등 추출)
    lines = output.split('\n')[1:] # 첫 줄(List of devices...) 제외
    for line in lines:
        if line.strip():
            parts = line.split()
            status = parts[1] if len(parts) > 1 else "unknown"
            # model 정보 추출 시도
            model_match = re.search(r'model:(\S+)', line)
            model = model_match.group(1) if model_match else "unknown"
            
            devices.append({
                "id": parts[0],
                "status": status,
                "model": model,
                "raw": line
            })
            
    return {"device_count": len(devices), "devices": devices}

@mcp.tool()
def get_device_battery(device_id: str = None):
    """특정 기기의 배터리 잔량과 상태를 조회합니다. device_id 생략 시 첫 번째 기기 조회."""
    cmd = ["shell", "dumpsys", "battery"]
    if device_id:
        cmd = ["-s", device_id] + cmd
        
    output = run_adb_command(cmd)
    
    # 주요 정보 파싱
    level = re.search(r'level: (\d+)', output)
    status = re.search(r'status: (\d+)', output) # 2: Charging, 3: Discharging...
    
    return {
        "level": int(level.group(1)) if level else -1,
        "status_code": int(status.group(1)) if status else -1,
        "raw_dump": output[:200] # 너무 길면 자름
    }

@mcp.tool()
def capture_logcat_snippet(lines: int = 50, filter_tag: str = ""):
    """최근 Logcat 로그를 조회합니다. 에러 디버깅에 필수적입니다."""
    cmd = ["logcat", "-d", "-t", str(lines)]
    if filter_tag:
        cmd.append(f"{filter_tag}:V") # 특정 태그 필터링
    
    return run_adb_command(cmd)

if __name__ == "__main__":
    mcp.run()
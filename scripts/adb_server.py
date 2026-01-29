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
    - 실패 시 명시적 에러 반환 (returncode != 0이면 stdout 반환하지 않음)
    """
    last_error = None
    retryable_patterns = ["device offline", "no devices"]
    
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
            
            # 성공: returncode가 0이면 stdout 반환
            if result.returncode == 0:
                return result.stdout.strip()
            
            # 실패: returncode != 0
            error_msg = result.stderr.strip() if result.stderr else f"ADB command failed with exit code {result.returncode}"
            
            # 재시도 가능한 오류인지 확인
            is_retryable = any(pattern in error_msg.lower() for pattern in retryable_patterns)
            
            if is_retryable:
                last_error = f"ADB Error: {error_msg}"
                if attempt < retries - 1:
                    delay = (RETRY_DELAY_MS / 1000) * (2 ** attempt)  # 지수 백오프
                    time.sleep(delay)
                    continue
                # 마지막 시도였으면 아래로 진행하여 에러 반환
            else:
                # 재시도 불가능한 오류는 즉시 에러 반환
                return f"ADB Error: {error_msg}"
            
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
    
    # 모든 재시도 소진 후 마지막 에러 반환
    return last_error or "ADB Error: Unknown error after exhausting retries"

@mcp.tool()
def get_connected_devices():
    """현재 연결된 안드로이드 기기 목록과 상태를 조회합니다."""
    output = run_adb_command(["devices", "-l"])
    
    # 오류 응답 확인
    if output.startswith("ADB Error:") or output.startswith("Error"):
        return {"device_count": 0, "devices": [], "error": output}
    
    devices = []
    
    # 출력 파싱 (model, device id 등 추출)
    lines = output.split('\n')[1:]  # 첫 줄(List of devices...) 제외
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

@mcp.tool()
def diagnose_connection(device_id: str = None):
    """
    연결 문제 진단 - SocketException, 연결 끊김 등의 원인 분석
    
    진단 항목:
    1. 디바이스 연결 상태
    2. 최근 로그캣에서 오류 패턴 검색
    3. 연결 안정성 테스트
    """
    diagnostics = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "device_id": device_id or "default",
        "checks": []
    }
    
    # 1. 디바이스 상태 확인
    devices_result = get_connected_devices()
    target_device = None
    
    for device in devices_result.get("devices", []):
        if device_id is None or device["id"] == device_id:
            target_device = device
            break
    
    if target_device:
        diagnostics["checks"].append({
            "name": "device_status",
            "status": "pass" if target_device["status"] == "device" else "fail",
            "detail": f"Device status: {target_device['status']}"
        })
    else:
        diagnostics["checks"].append({
            "name": "device_status",
            "status": "fail",
            "detail": "Device not found"
        })
        return diagnostics
    
    # 2. 로그캣 분석
    logcat = capture_logcat_snippet(lines=100)
    
    socket_errors = 0
    connection_resets = 0
    crashes = 0
    
    for line in logcat.split('\n'):
        lower_line = line.lower()
        if 'socketexception' in lower_line:
            socket_errors += 1
        if 'connection reset' in lower_line or 'broken pipe' in lower_line:
            connection_resets += 1
        if 'fatal exception' in lower_line or 'anr' in lower_line:
            crashes += 1
    
    diagnostics["checks"].append({
        "name": "logcat_analysis",
        "status": "pass" if (socket_errors == 0 and crashes == 0) else "warning",
        "detail": f"SocketException: {socket_errors}, ConnectionReset: {connection_resets}, Crashes: {crashes}"
    })
    
    # 3. 연결 안정성 테스트 (echo 명령 3회)
    echo_success = 0
    cmd = ["-s", target_device["id"], "shell", "echo", "test"] if device_id else ["shell", "echo", "test"]
    
    for _ in range(3):
        result = run_adb_command(cmd, retries=1, timeout=3)
        if "test" in result:
            echo_success += 1
        time.sleep(0.5)
    
    diagnostics["checks"].append({
        "name": "connection_stability",
        "status": "pass" if echo_success == 3 else ("warning" if echo_success > 0 else "fail"),
        "detail": f"Echo test: {echo_success}/3 successful"
    })
    
    # 종합 결과
    failed_checks = [c for c in diagnostics["checks"] if c["status"] == "fail"]
    warning_checks = [c for c in diagnostics["checks"] if c["status"] == "warning"]
    
    if failed_checks:
        diagnostics["overall"] = "fail"
        diagnostics["recommendation"] = "디바이스 연결을 확인하고 USB 케이블/ADB 서버를 재시작하세요."
    elif warning_checks:
        diagnostics["overall"] = "warning"
        diagnostics["recommendation"] = "간헐적 연결 문제가 감지됨. 타임아웃 설정을 늘리고 재연결 로직을 확인하세요."
    else:
        diagnostics["overall"] = "pass"
        diagnostics["recommendation"] = "연결 상태 양호"
    
    return diagnostics

@mcp.tool()
def restart_adb_server():
    """ADB 서버를 재시작합니다. 연결 문제 해결에 유용합니다."""
    # ADB 서버 종료
    kill_result = run_adb_command(["kill-server"], retries=1, timeout=5)
    time.sleep(1)
    
    # ADB 서버 시작
    start_result = run_adb_command(["start-server"], retries=1, timeout=10)
    time.sleep(2)
    
    # 디바이스 재확인
    devices = get_connected_devices()
    
    return {
        "kill_result": kill_result,
        "start_result": start_result,
        "devices_after_restart": devices
    }

if __name__ == "__main__":
    mcp.run()
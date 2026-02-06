"""
YouTube 봇 태스크
AutoX.js 스크립트 실행 및 제어
"""
from typing import Dict, Any, Optional
import logging
import time

from celery import shared_task

from core import adb_controller, supabase
from config import settings

logger = logging.getLogger(__name__)

# AutoX.js 패키지 및 경로
AUTOX_PACKAGE = "org.autojs.autoxjs.v6"
AUTOX_MAIN_ACTIVITY = "org.autojs.autoxjs.ui.main.MainActivity"
SCRIPT_REMOTE_PATH = "/sdcard/Scripts"


@shared_task(
    bind=True,
    name="tasks.youtube_tasks.run_youtube_bot",
    max_retries=2,
    default_retry_delay=30,
)
def run_youtube_bot(
    self,
    serial: str,
    script_name: str = "youtube_bot.js",
    params: Optional[Dict[str, Any]] = None,
    device_id: Optional[str] = None,
    task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    YouTube 봇 스크립트 실행
    
    Args:
        serial: ADB 시리얼
        script_name: 스크립트 파일명
        params: 스크립트 파라미터
        device_id: DB 디바이스 ID
        task_id: DB 작업 ID
    
    Returns:
        실행 결과
    """
    logger.info(f"Running YouTube bot on {serial}: {script_name}")
    
    result = {
        "serial": serial,
        "script": script_name,
        "success": False,
        "error": None,
    }
    
    if task_id:
        supabase.update_task_status(
            task_id, status="running", progress=10,
            progress_message="Preparing AutoX.js",
        )
    
    try:
        # 1. AutoX.js 실행 상태 확인
        if not _is_autox_running(serial):
            _start_autox(serial)
            time.sleep(3)  # 앱 시작 대기
        
        if task_id:
            supabase.update_task_status(
                task_id, status="running", progress=30,
                progress_message="Starting script",
            )
        
        # 2. 스크립트 실행 (Intent 방식)
        script_path = f"{SCRIPT_REMOTE_PATH}/{script_name}"
        
        # AutoX.js의 스크립트 실행 Intent
        # am broadcast로 스크립트 실행 명령 전송
        run_cmd = (
            f"am broadcast -a com.stardust.autojs.action.EXEC_SCRIPT "
            f"-e path {script_path}"
        )
        
        if params:
            # 파라미터를 extras로 전달
            for key, value in params.items():
                run_cmd += f' -e {key} "{value}"'
        
        output = adb_controller.shell(serial, run_cmd, timeout=10)
        
        if "Broadcast completed" in output or "result=0" in output:
            result["success"] = True
            
            if task_id:
                supabase.update_task_status(
                    task_id, status="success", progress=100,
                    progress_message="Script started successfully",
                    result=result,
                )
            
            # 디바이스 상태 업데이트
            if device_id:
                supabase.update_device_status(device_id, "busy")
        else:
            result["error"] = f"Broadcast failed: {output}"
            
            if task_id:
                supabase.update_task_status(
                    task_id, status="failed", error=result["error"],
                )
        
        return result
        
    except Exception as exc:
        result["error"] = str(exc)
        logger.error(f"YouTube bot failed on {serial}: {exc}")
        
        if self.request.retries < self.max_retries:
            if task_id:
                supabase.update_task_status(
                    task_id, status="retrying",
                    progress_message=f"Retrying ({self.request.retries + 1}/{self.max_retries})",
                )
            self.retry(exc=exc)
        else:
            if task_id:
                supabase.update_task_status(
                    task_id, status="failed", error=str(exc),
                )
        
        return result


def _is_autox_running(serial: str) -> bool:
    """AutoX.js 실행 여부 확인"""
    try:
        output = adb_controller.shell(serial, f"pidof {AUTOX_PACKAGE}")
        return bool(output.strip())
    except Exception:
        return False


def _start_autox(serial: str) -> None:
    """AutoX.js 앱 시작"""
    cmd = f"am start -n {AUTOX_PACKAGE}/{AUTOX_MAIN_ACTIVITY}"
    adb_controller.shell(serial, cmd, timeout=10)


@shared_task(
    name="tasks.youtube_tasks.stop_bot",
)
def stop_bot(
    serial: str,
    device_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    봇 중지 (AutoX.js 앱 종료)
    
    Args:
        serial: ADB 시리얼
        device_id: DB 디바이스 ID
    
    Returns:
        중지 결과
    """
    logger.info(f"Stopping bot on {serial}")
    
    try:
        # AutoX.js 강제 종료
        adb_controller.shell(serial, f"am force-stop {AUTOX_PACKAGE}")
        
        # 디바이스 상태 업데이트
        if device_id:
            supabase.update_device_status(device_id, "online")
        
        return {"serial": serial, "success": True}
        
    except Exception as e:
        logger.error(f"Stop bot failed on {serial}: {e}")
        return {"serial": serial, "success": False, "error": str(e)}


@shared_task(
    name="tasks.youtube_tasks.push_script",
)
def push_script(
    serial: str,
    local_script_path: str,
    script_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    스크립트 파일 디바이스에 전송
    
    Args:
        serial: ADB 시리얼
        local_script_path: 로컬 스크립트 경로
        script_name: 원격 파일명 (없으면 원본 파일명 사용)
    
    Returns:
        전송 결과
    """
    logger.info(f"Pushing script to {serial}: {local_script_path}")
    
    from pathlib import Path
    
    try:
        local_path = Path(local_script_path)
        if not local_path.exists():
            return {"serial": serial, "success": False, "error": "Script file not found"}
        
        remote_name = script_name or local_path.name
        remote_path = f"{SCRIPT_REMOTE_PATH}/{remote_name}"
        
        # Scripts 디렉토리 생성
        adb_controller.shell(serial, f"mkdir -p {SCRIPT_REMOTE_PATH}")
        
        # 파일 전송
        success = adb_controller.push_file(serial, str(local_path), remote_path)
        
        return {
            "serial": serial,
            "success": success,
            "remote_path": remote_path,
        }
        
    except Exception as e:
        logger.error(f"Push script failed on {serial}: {e}")
        return {"serial": serial, "success": False, "error": str(e)}


@shared_task(
    name="tasks.youtube_tasks.get_bot_logs",
)
def get_bot_logs(
    serial: str,
    lines: int = 100,
) -> Dict[str, Any]:
    """
    봇 로그 수집 (AutoX.js 로그)
    
    Args:
        serial: ADB 시리얼
        lines: 수집할 라인 수
    
    Returns:
        로그 내용
    """
    logger.info(f"Getting bot logs from {serial}")
    
    try:
        # AutoX.js 로그 경로
        log_path = f"/sdcard/Android/data/{AUTOX_PACKAGE}/files/logs"
        
        # 최신 로그 파일 찾기
        find_cmd = f"ls -t {log_path}/*.log 2>/dev/null | head -1"
        latest_log = adb_controller.shell(serial, find_cmd, timeout=10).strip()
        
        if not latest_log:
            return {"serial": serial, "success": True, "logs": "", "message": "No log files found"}
        
        # 로그 내용 읽기
        tail_cmd = f"tail -n {lines} {latest_log}"
        log_content = adb_controller.shell(serial, tail_cmd, timeout=30)
        
        return {
            "serial": serial,
            "success": True,
            "log_file": latest_log,
            "logs": log_content,
        }
        
    except Exception as e:
        logger.error(f"Get bot logs failed on {serial}: {e}")
        return {"serial": serial, "success": False, "error": str(e)}


@shared_task(
    name="tasks.youtube_tasks.batch_run_bot",
)
def batch_run_bot(
    script_name: str = "youtube_bot.js",
    serials: Optional[list] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    여러 디바이스에서 봇 배치 실행
    
    Args:
        script_name: 스크립트 파일명
        serials: 대상 시리얼 목록 (없으면 PC 전체)
        params: 스크립트 파라미터
    
    Returns:
        배치 결과
    """
    from celery import group
    
    logger.info(f"Batch run bot: {script_name}")
    
    result = {
        "script": script_name,
        "total": 0,
        "success": 0,
        "failed": 0,
        "results": [],
    }
    
    try:
        # 대상 디바이스 결정
        if serials:
            target_serials = serials
        else:
            pc = supabase.get_pc_by_number(settings.pc_number)
            if pc:
                devices = supabase.get_devices_by_pc(pc["id"])
                target_serials = [
                    d["serial_number"] for d in devices 
                    if d.get("serial_number") and d.get("status") == "online"
                ]
            else:
                target_serials = []
        
        result["total"] = len(target_serials)
        
        if not target_serials:
            return result
        
        # 병렬 실행 (5개씩)
        batch_size = 5
        for i in range(0, len(target_serials), batch_size):
            batch = target_serials[i:i + batch_size]
            
            job = group(
                run_youtube_bot.s(serial, script_name, params)
                for serial in batch
            )
            
            batch_results = job.apply_async().get(timeout=120)
            
            for r in batch_results:
                result["results"].append(r)
                if r.get("success"):
                    result["success"] += 1
                else:
                    result["failed"] += 1
            
            # 배치 간 대기
            if i + batch_size < len(target_serials):
                time.sleep(2)
        
        logger.info(f"Batch run complete: {result['success']}/{result['total']} success")
        return result
        
    except Exception as e:
        logger.error(f"Batch run bot failed: {e}")
        result["error"] = str(e)
        return result

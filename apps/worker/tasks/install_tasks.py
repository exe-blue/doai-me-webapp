"""
APK 설치 태스크
AutoX.js, YouTube 등 앱 설치/업데이트
"""
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging
import time

from celery import shared_task, group, chain

from core import adb_controller, supabase
from config import settings

logger = logging.getLogger(__name__)

# 필수 APK 목록
REQUIRED_APPS = {
    "autox.js": {
        "package": "org.autojs.autoxjs.v6",
        "apk": "autox.js.apk",
        "required": True,
    },
    "youtube": {
        "package": "com.google.android.youtube",
        "apk": "youtube.apk",
        "required": True,
    },
}


@shared_task(
    bind=True,
    name="tasks.install_tasks.install_apk",
    max_retries=3,
    default_retry_delay=60,
)
def install_apk(
    self,
    serial: str,
    apk_name: str,
    device_id: Optional[str] = None,
    task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    단일 디바이스에 APK 설치
    
    Args:
        serial: ADB 시리얼
        apk_name: APK 파일명 (예: autox.js.apk)
        device_id: DB 디바이스 ID
        task_id: DB 작업 ID
    
    Returns:
        설치 결과 {success, version, error}
    """
    logger.info(f"Installing {apk_name} on {serial}")
    
    result = {
        "serial": serial,
        "apk": apk_name,
        "success": False,
        "version": None,
        "error": None,
    }
    
    # 작업 상태 업데이트
    if task_id:
        supabase.update_task_status(
            task_id,
            status="running",
            progress=10,
            progress_message=f"Installing {apk_name}",
        )
    
    try:
        # APK 경로 확인
        apk_path = Path(settings.apk_directory) / apk_name
        if not apk_path.exists():
            raise FileNotFoundError(f"APK not found: {apk_path}")
        
        # 진행 상태 업데이트
        if task_id:
            supabase.update_task_status(
                task_id, status="running", progress=30,
                progress_message="Pushing APK to device",
            )
        
        # APK 설치
        success = adb_controller.install_apk(
            serial=serial,
            apk_path=str(apk_path),
            reinstall=True,
            grant_permissions=True,
        )
        
        if not success:
            raise RuntimeError("APK installation returned False")
        
        # 버전 확인
        package_name = _get_package_name(apk_name)
        version = None
        if package_name:
            version = adb_controller.get_package_version(serial, package_name)
        
        result["success"] = True
        result["version"] = version
        
        # 성공 상태 업데이트
        if task_id:
            supabase.update_task_status(
                task_id,
                status="success",
                progress=100,
                progress_message="Installation complete",
                result=result,
            )
        
        logger.info(f"APK installed successfully: {apk_name} v{version} on {serial}")
        return result
        
    except FileNotFoundError as e:
        result["error"] = str(e)
        logger.error(f"APK not found: {e}")
        
        if task_id:
            supabase.update_task_status(
                task_id, status="failed", error=str(e),
            )
        return result
        
    except Exception as exc:
        result["error"] = str(exc)
        logger.error(f"APK install failed: {exc}")
        
        # 재시도
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


def _get_package_name(apk_name: str) -> Optional[str]:
    """APK 파일명으로 패키지명 조회"""
    for app_info in REQUIRED_APPS.values():
        if app_info["apk"] == apk_name:
            return app_info["package"]
    return None


@shared_task(
    name="tasks.install_tasks.batch_install",
)
def batch_install(
    apk_name: str,
    serials: Optional[List[str]] = None,
    pc_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    여러 디바이스에 APK 배치 설치
    
    Args:
        apk_name: APK 파일명
        serials: 대상 시리얼 목록 (없으면 PC 전체)
        pc_id: PC ID (serials 없을 때 사용)
    
    Returns:
        배치 결과 {total, success, failed, results}
    """
    logger.info(f"Batch install {apk_name}")
    
    result = {
        "apk": apk_name,
        "total": 0,
        "success": 0,
        "failed": 0,
        "results": [],
    }
    
    try:
        # 대상 디바이스 결정
        if serials:
            target_serials = serials
        elif pc_id:
            devices = supabase.get_devices_by_pc(pc_id)
            target_serials = [d["serial_number"] for d in devices if d.get("serial_number")]
        else:
            pc = supabase.get_pc_by_number(settings.pc_number)
            if pc:
                devices = supabase.get_devices_by_pc(pc["id"])
                target_serials = [d["serial_number"] for d in devices if d.get("serial_number")]
            else:
                target_serials = []
        
        result["total"] = len(target_serials)
        
        # 동시 실행 제한 (5개씩)
        batch_size = 5
        for i in range(0, len(target_serials), batch_size):
            batch = target_serials[i:i + batch_size]
            
            # 병렬 설치
            job = group(
                install_apk.s(serial, apk_name)
                for serial in batch
            )
            
            batch_results = job.apply_async().get(timeout=300)
            
            for r in batch_results:
                result["results"].append(r)
                if r.get("success"):
                    result["success"] += 1
                else:
                    result["failed"] += 1
            
            # 배치 간 대기
            if i + batch_size < len(target_serials):
                time.sleep(2)
        
        logger.info(f"Batch install complete: {result['success']}/{result['total']} success")
        return result
        
    except Exception as e:
        logger.error(f"Batch install failed: {e}")
        result["error"] = str(e)
        return result


@shared_task(
    bind=True,
    name="tasks.install_tasks.uninstall_apk",
)
def uninstall_apk(
    self,
    serial: str,
    package_name: str,
) -> Dict[str, Any]:
    """
    APK 제거
    
    Args:
        serial: ADB 시리얼
        package_name: 패키지명
    
    Returns:
        제거 결과
    """
    logger.info(f"Uninstalling {package_name} from {serial}")
    
    try:
        success = adb_controller.uninstall_apk(serial, package_name)
        return {"serial": serial, "package": package_name, "success": success}
    except Exception as e:
        logger.error(f"Uninstall failed: {e}")
        return {"serial": serial, "package": package_name, "success": False, "error": str(e)}


@shared_task(
    name="tasks.install_tasks.check_installed_apps",
)
def check_installed_apps(serial: str) -> Dict[str, Any]:
    """
    필수 앱 설치 상태 확인
    
    Args:
        serial: ADB 시리얼
    
    Returns:
        앱별 설치 상태 및 버전
    """
    logger.info(f"Checking installed apps on {serial}")
    
    result = {
        "serial": serial,
        "apps": {},
        "missing": [],
        "all_installed": True,
    }
    
    try:
        installed_packages = adb_controller.get_installed_packages(serial)
        
        for app_key, app_info in REQUIRED_APPS.items():
            package = app_info["package"]
            is_installed = package in installed_packages
            
            app_status = {
                "package": package,
                "installed": is_installed,
                "required": app_info["required"],
                "version": None,
            }
            
            if is_installed:
                app_status["version"] = adb_controller.get_package_version(serial, package)
            elif app_info["required"]:
                result["missing"].append(app_key)
                result["all_installed"] = False
            
            result["apps"][app_key] = app_status
        
        return result
        
    except Exception as e:
        logger.error(f"Check installed apps failed: {e}")
        result["error"] = str(e)
        result["all_installed"] = False
        return result


@shared_task(
    name="tasks.install_tasks.install_all_required",
)
def install_all_required(serial: str, device_id: Optional[str] = None) -> Dict[str, Any]:
    """
    모든 필수 앱 설치 (체인)
    
    Args:
        serial: ADB 시리얼
        device_id: DB 디바이스 ID
    
    Returns:
        전체 설치 결과
    """
    logger.info(f"Installing all required apps on {serial}")
    
    result = {
        "serial": serial,
        "installed": [],
        "skipped": [],
        "failed": [],
    }
    
    try:
        # 현재 설치 상태 확인
        check_result = check_installed_apps.apply(args=(serial,)).get(timeout=60)
        
        for app_key, app_info in REQUIRED_APPS.items():
            app_status = check_result["apps"].get(app_key, {})
            
            if app_status.get("installed"):
                result["skipped"].append({
                    "app": app_key,
                    "version": app_status.get("version"),
                })
                continue
            
            # 설치 실행
            install_result = install_apk.apply(
                args=(serial, app_info["apk"], device_id),
            ).get(timeout=180)
            
            if install_result.get("success"):
                result["installed"].append({
                    "app": app_key,
                    "version": install_result.get("version"),
                })
            else:
                result["failed"].append({
                    "app": app_key,
                    "error": install_result.get("error"),
                })
        
        result["success"] = len(result["failed"]) == 0
        logger.info(f"Install all required complete: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Install all required failed: {e}")
        result["error"] = str(e)
        result["success"] = False
        return result

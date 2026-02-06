"""
디바이스 관리 태스크
스캔, 헬스체크, 상태 동기화
"""
from typing import Dict, Any, List, Optional
import logging

from celery import shared_task

from core import adb_controller, supabase, DeviceInfo
from config import settings

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name="tasks.device_tasks.scan_devices",
    max_retries=3,
    default_retry_delay=30,
)
def scan_devices(self) -> Dict[str, Any]:
    """
    연결된 디바이스 스캔 및 DB 동기화
    
    Returns:
        스캔 결과 {found: int, registered: int, errors: list}
    """
    logger.info(f"Starting device scan on {settings.pc_number}")
    
    result = {
        "pc_number": settings.pc_number,
        "found": 0,
        "registered": 0,
        "updated": 0,
        "errors": [],
    }
    
    try:
        # ADB 디바이스 목록 조회
        devices = adb_controller.list_devices()
        result["found"] = len(devices)
        
        # PC 정보 조회
        pc = supabase.get_pc_by_number(settings.pc_number)
        if not pc:
            result["errors"].append(f"PC {settings.pc_number} not found in database")
            return result
        
        pc_id = pc["id"]
        
        # 각 디바이스 등록/업데이트
        for device in devices:
            try:
                _register_or_update_device(device, pc_id, result)
            except Exception as e:
                result["errors"].append(f"{device.serial}: {str(e)}")
        
        # PC 하트비트 업데이트
        supabase.update_pc_heartbeat(settings.pc_number)
        
        logger.info(f"Scan complete: {result}")
        return result
        
    except Exception as exc:
        logger.error(f"Scan failed: {exc}")
        self.retry(exc=exc)


def _register_or_update_device(
    device: DeviceInfo, 
    pc_id: str, 
    result: Dict[str, Any],
) -> None:
    """디바이스 등록 또는 업데이트 헬퍼"""
    existing = supabase.get_device_by_serial(device.serial)
    
    device_data = {
        "serial_number": device.serial,
        "pc_id": pc_id,
        "model": device.model,
        "android_version": device.android_version,
        "status": "online" if device.state == "device" else "error",
        "battery_level": device.battery_level,
        "connection_type": "wifi" if device.wifi_ip else "usb",
        "ip_address": device.wifi_ip,
    }
    
    if existing:
        # 업데이트
        device_data["id"] = existing["id"]
        device_data["device_number"] = existing["device_number"]
        result["updated"] += 1
    else:
        # 신규 등록 - device_number는 서버에서 자동 할당
        result["registered"] += 1
    
    supabase.upsert_device(device_data)


@shared_task(
    bind=True,
    name="tasks.device_tasks.health_check",
    max_retries=2,
)
def health_check(self, device_id: str, serial: str) -> Dict[str, Any]:
    """
    단일 디바이스 헬스체크
    
    Args:
        device_id: DB 디바이스 ID
        serial: ADB 시리얼
    
    Returns:
        체크 결과 {status, battery, error}
    """
    logger.info(f"Health check for {serial}")
    
    result = {
        "device_id": device_id,
        "serial": serial,
        "status": "unknown",
        "battery_level": None,
        "error": None,
    }
    
    try:
        # 디바이스 정보 조회
        device = adb_controller.get_device(serial)
        
        if not device:
            result["status"] = "offline"
            supabase.update_device_status(device_id, "offline")
            return result
        
        # 배터리 정보
        battery_output = device.shell("dumpsys battery")
        battery_level = _parse_battery_level(battery_output)
        
        result["status"] = "online"
        result["battery_level"] = battery_level
        
        # DB 업데이트
        supabase.update_device_status(
            device_id,
            status="online",
            battery_level=battery_level,
        )
        
        return result
        
    except Exception as exc:
        logger.error(f"Health check failed for {serial}: {exc}")
        result["status"] = "error"
        result["error"] = str(exc)
        
        supabase.update_device_status(
            device_id,
            status="error",
            error=str(exc),
        )
        
        return result


def _parse_battery_level(output: str) -> int:
    """배터리 레벨 파싱"""
    for line in output.split("\n"):
        if "level:" in line:
            try:
                return int(line.split(":")[1].strip())
            except ValueError:
                pass
    return 0


@shared_task(
    name="tasks.device_tasks.batch_health_check",
)
def batch_health_check() -> Dict[str, Any]:
    """
    PC의 모든 디바이스 헬스체크 (Beat 스케줄용)
    
    Returns:
        배치 결과 {total, online, offline, errors}
    """
    logger.info(f"Batch health check on {settings.pc_number}")
    
    result = {
        "pc_number": settings.pc_number,
        "total": 0,
        "online": 0,
        "offline": 0,
        "errors": [],
    }
    
    try:
        pc = supabase.get_pc_by_number(settings.pc_number)
        if not pc:
            result["errors"].append(f"PC {settings.pc_number} not found")
            return result
        
        devices = supabase.get_devices_by_pc(pc["id"])
        result["total"] = len(devices)
        
        for device in devices:
            try:
                check_result = health_check.apply(
                    args=(device["id"], device["serial_number"]),
                ).get(timeout=60)
                
                if check_result["status"] == "online":
                    result["online"] += 1
                else:
                    result["offline"] += 1
                    
            except Exception as e:
                result["offline"] += 1
                result["errors"].append(f"{device.get('serial_number')}: {str(e)}")
        
        # PC 하트비트 업데이트
        supabase.update_pc_heartbeat(settings.pc_number)
        
        logger.info(f"Batch health check complete: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Batch health check failed: {e}")
        result["errors"].append(str(e))
        return result


@shared_task(
    name="tasks.device_tasks.collect_logs",
)
def collect_logs() -> Dict[str, Any]:
    """
    디바이스 로그 수집 (1시간마다)
    
    Returns:
        수집 결과
    """
    logger.info(f"Collecting logs on {settings.pc_number}")
    
    result = {
        "pc_number": settings.pc_number,
        "collected": 0,
        "errors": [],
    }
    
    try:
        pc = supabase.get_pc_by_number(settings.pc_number)
        if not pc:
            return result
        
        devices = supabase.get_devices_by_pc(pc["id"])
        
        for device in devices:
            serial = device.get("serial_number")
            if not serial:
                continue
            
            try:
                # logcat 일부 수집 (최근 100줄)
                output = adb_controller.shell(serial, "logcat -d -t 100", timeout=30)
                
                # TODO: 로그 저장소에 전송 (S3, 로컬 파일 등)
                result["collected"] += 1
                
            except Exception as e:
                result["errors"].append(f"{serial}: {str(e)}")
        
        logger.info(f"Log collection complete: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Log collection failed: {e}")
        result["errors"].append(str(e))
        return result


@shared_task(
    bind=True,
    name="tasks.device_tasks.reboot_device",
    max_retries=1,
)
def reboot_device(self, serial: str, device_id: Optional[str] = None) -> Dict[str, Any]:
    """
    디바이스 재부팅
    
    Args:
        serial: ADB 시리얼
        device_id: DB ID (옵션)
    
    Returns:
        재부팅 결과
    """
    logger.info(f"Rebooting device {serial}")
    
    try:
        success = adb_controller.reboot(serial)
        
        if device_id:
            supabase.update_device_status(device_id, "offline")
        
        return {"serial": serial, "success": success}
        
    except Exception as exc:
        logger.error(f"Reboot failed for {serial}: {exc}")
        return {"serial": serial, "success": False, "error": str(exc)}

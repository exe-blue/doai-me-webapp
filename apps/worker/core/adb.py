"""
ADB 제어 모듈
adbutils 기반 Android 디바이스 제어
"""
import asyncio
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from pathlib import Path
import logging

from adbutils import AdbClient, AdbDevice, AdbError
from tenacity import retry, stop_after_attempt, wait_exponential

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class DeviceInfo:
    """디바이스 정보"""
    serial: str
    state: str
    model: str = ""
    android_version: str = ""
    battery_level: int = 0
    is_charging: bool = False
    wifi_ip: Optional[str] = None


class ADBController:
    """ADB 명령 제어 클래스"""
    
    def __init__(self, host: str = "127.0.0.1", port: int = 5037):
        self.host = host
        self.port = port
        self._client: Optional[AdbClient] = None
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_adb)
    
    @property
    def client(self) -> AdbClient:
        """ADB 클라이언트 (지연 초기화)"""
        if self._client is None:
            self._client = AdbClient(host=self.host, port=self.port)
        return self._client
    
    def list_devices(self) -> List[DeviceInfo]:
        """연결된 디바이스 목록 조회"""
        try:
            devices = self.client.device_list()
            result = []
            
            for device in devices:
                info = self._get_device_info(device)
                if info:
                    result.append(info)
            
            return result
        except AdbError as e:
            logger.error(f"Failed to list devices: {e}")
            return []
    
    def _get_device_info(self, device: AdbDevice) -> Optional[DeviceInfo]:
        """단일 디바이스 상세 정보 조회"""
        try:
            props = device.prop.list() if hasattr(device, 'prop') else {}
            
            # 배터리 정보
            battery = self._get_battery_info(device)
            
            # WiFi IP
            wifi_ip = self._get_wifi_ip(device)
            
            return DeviceInfo(
                serial=device.serial,
                state="device",  # 연결 상태
                model=props.get("ro.product.model", "Unknown"),
                android_version=props.get("ro.build.version.release", "Unknown"),
                battery_level=battery.get("level", 0),
                is_charging=battery.get("charging", False),
                wifi_ip=wifi_ip,
            )
        except Exception as e:
            logger.warning(f"Failed to get device info for {device.serial}: {e}")
            return DeviceInfo(serial=device.serial, state="error")
    
    def _get_battery_info(self, device: AdbDevice) -> Dict[str, Any]:
        """배터리 정보 조회"""
        try:
            output = device.shell("dumpsys battery")
            lines = output.strip().split("\n")
            
            result = {"level": 0, "charging": False}
            
            for line in lines:
                line = line.strip()
                if line.startswith("level:"):
                    result["level"] = int(line.split(":")[1].strip())
                elif line.startswith("status:"):
                    # 2=charging, 5=full
                    status = int(line.split(":")[1].strip())
                    result["charging"] = status in (2, 5)
            
            return result
        except Exception as e:
            logger.warning(f"Failed to get battery info: {e}")
            return {"level": 0, "charging": False}
    
    def _get_wifi_ip(self, device: AdbDevice) -> Optional[str]:
        """WiFi IP 주소 조회"""
        try:
            output = device.shell("ip addr show wlan0")
            for line in output.split("\n"):
                if "inet " in line:
                    # inet 192.168.1.100/24 ...
                    ip = line.strip().split()[1].split("/")[0]
                    return ip
            return None
        except Exception:
            return None
    
    def get_device(self, serial: str) -> Optional[AdbDevice]:
        """특정 디바이스 객체 반환"""
        try:
            return self.client.device(serial=serial)
        except AdbError:
            return None
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def shell(self, serial: str, command: str, timeout: int = None) -> str:
        """
        ADB shell 명령 실행
        
        Args:
            serial: 디바이스 시리얼
            command: 실행할 shell 명령
            timeout: 타임아웃 (초)
        
        Returns:
            명령 출력
        """
        timeout = timeout or settings.adb_timeout
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        try:
            return device.shell(command, timeout=timeout)
        except AdbError as e:
            logger.error(f"Shell command failed on {serial}: {command} - {e}")
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def install_apk(
        self, 
        serial: str, 
        apk_path: str, 
        reinstall: bool = True,
        grant_permissions: bool = True,
    ) -> bool:
        """
        APK 설치
        
        Args:
            serial: 디바이스 시리얼
            apk_path: APK 파일 경로
            reinstall: 재설치 여부
            grant_permissions: 권한 자동 부여
        
        Returns:
            설치 성공 여부
        """
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        if not Path(apk_path).exists():
            raise FileNotFoundError(f"APK not found: {apk_path}")
        
        try:
            flags = []
            if reinstall:
                flags.append("-r")
            if grant_permissions:
                flags.append("-g")
            
            device.install(apk_path, *flags)
            logger.info(f"APK installed on {serial}: {apk_path}")
            return True
            
        except AdbError as e:
            logger.error(f"APK install failed on {serial}: {e}")
            raise
    
    def uninstall_apk(self, serial: str, package_name: str) -> bool:
        """APK 제거"""
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        try:
            device.uninstall(package_name)
            logger.info(f"Package uninstalled from {serial}: {package_name}")
            return True
        except AdbError as e:
            logger.error(f"Uninstall failed on {serial}: {e}")
            return False
    
    def push_file(self, serial: str, local_path: str, remote_path: str) -> bool:
        """파일 전송 (PC → 디바이스)"""
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        try:
            device.push(local_path, remote_path)
            logger.info(f"File pushed to {serial}: {local_path} → {remote_path}")
            return True
        except AdbError as e:
            logger.error(f"Push failed on {serial}: {e}")
            return False
    
    def pull_file(self, serial: str, remote_path: str, local_path: str) -> bool:
        """파일 가져오기 (디바이스 → PC)"""
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        try:
            device.pull(remote_path, local_path)
            logger.info(f"File pulled from {serial}: {remote_path} → {local_path}")
            return True
        except AdbError as e:
            logger.error(f"Pull failed on {serial}: {e}")
            return False
    
    def reboot(self, serial: str) -> bool:
        """디바이스 재부팅"""
        device = self.get_device(serial)
        
        if not device:
            raise ValueError(f"Device {serial} not found")
        
        try:
            device.shell("reboot")
            logger.info(f"Device rebooting: {serial}")
            return True
        except AdbError as e:
            logger.error(f"Reboot failed on {serial}: {e}")
            return False
    
    def get_installed_packages(self, serial: str) -> List[str]:
        """설치된 패키지 목록"""
        try:
            output = self.shell(serial, "pm list packages -3")
            packages = []
            for line in output.strip().split("\n"):
                if line.startswith("package:"):
                    packages.append(line.replace("package:", "").strip())
            return packages
        except Exception as e:
            logger.error(f"Failed to get packages on {serial}: {e}")
            return []
    
    def get_package_version(self, serial: str, package_name: str) -> Optional[str]:
        """패키지 버전 조회"""
        try:
            output = self.shell(serial, f"dumpsys package {package_name} | grep versionName")
            if "versionName=" in output:
                return output.split("versionName=")[1].strip().split()[0]
            return None
        except Exception:
            return None


# 싱글톤 인스턴스
adb_controller = ADBController()

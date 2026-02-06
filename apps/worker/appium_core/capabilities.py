"""
Appium Desired Capabilities 빌더

디바이스별 UIAutomator2 capabilities를 생성.
"""

import logging

logger = logging.getLogger(__name__)


def build_capabilities(
    device_udid: str,
    system_port: int,
    app_package: str = "com.google.android.youtube",
    app_activity: str = "com.google.android.youtube.HomeActivity",
    no_reset: bool = True,
    new_command_timeout: int = 300,
) -> dict:
    """
    UIAutomator2 Desired Capabilities 생성.

    Args:
        device_udid: 디바이스 식별자 (serial 또는 ip:port)
        system_port: UIAutomator2 서버 포트 (디바이스별 고유, 8200-8300)
        app_package: 대상 앱 패키지명
        app_activity: 대상 앱 액티비티
        no_reset: True면 앱 데이터/로그인 유지
        new_command_timeout: 유휴 세션 타임아웃 (초)

    Returns:
        Appium desired capabilities dict
    """
    caps = {
        "platformName": "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": device_udid,
        "appium:systemPort": system_port,
        "appium:appPackage": app_package,
        "appium:appActivity": app_activity,
        "appium:noReset": no_reset,
        "appium:newCommandTimeout": new_command_timeout,
        # 성능 최적화
        "appium:skipServerInstallation": False,
        "appium:skipDeviceInitialization": False,
        "appium:ignoreUnimportantViews": True,
        # 안정성
        "appium:autoGrantPermissions": True,
        "appium:disableWindowAnimation": True,
        # UIAutomator2 설정
        "appium:uiautomator2ServerLaunchTimeout": 60000,
        "appium:uiautomator2ServerInstallTimeout": 60000,
    }

    logger.info(
        "Built capabilities for device %s (systemPort=%d)",
        device_udid,
        system_port,
    )
    return caps


def build_generic_capabilities(
    device_udid: str,
    system_port: int,
    new_command_timeout: int = 300,
) -> dict:
    """
    앱을 지정하지 않는 범용 capabilities (이미 실행 중인 앱 제어용).
    """
    return {
        "platformName": "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": device_udid,
        "appium:systemPort": system_port,
        "appium:noReset": True,
        "appium:newCommandTimeout": new_command_timeout,
        "appium:ignoreUnimportantViews": True,
        "appium:autoGrantPermissions": True,
        "appium:disableWindowAnimation": True,
    }

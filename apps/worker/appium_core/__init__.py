"""
Appium Core Abstraction Layer

AutoX.js를 대체하는 Appium UIAutomator2 기반 디바이스 자동화 코어.
세션 관리, 셀렉터 탐색, UI 액션, 스크린샷 캡처를 제공.
"""

from appium_core.session_manager import SessionManager, get_session_manager
from appium_core.capabilities import build_capabilities
from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from appium_core.evidence import EvidenceCapture

__all__ = [
    "SessionManager",
    "get_session_manager",
    "build_capabilities",
    "AppiumSelectors",
    "AppiumActions",
    "EvidenceCapture",
]

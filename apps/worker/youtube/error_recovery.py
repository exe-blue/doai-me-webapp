"""
에러 복구 모듈

AutoX.js ErrorRecovery.js 포팅.
에러 분류 (E1xxx-E4xxx), 복구 액션, 재시도 로직.
"""

import logging
import time
from dataclasses import dataclass
from typing import Optional

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.remote.webdriver import WebDriver

from appium_core.actions import AppiumActions
from youtube.constants import (
    ErrorCode,
    RETRYABLE_ERROR_CODES,
    NON_RETRYABLE_ERROR_CODES,
    MAX_RETRY_COUNT,
    RETRY_BASE_DELAY_SEC,
    RETRY_MAX_DELAY_SEC,
    STALL_DETECTION_TIMEOUT_SEC,
    NETWORK_WAIT_TIMEOUT_SEC,
    NETWORK_CHECK_INTERVAL_SEC,
    YOUTUBE_PACKAGE,
)

logger = logging.getLogger(__name__)


@dataclass
class RecoveryAction:
    """복구 액션 결과."""
    action: str  # 'retry', 'fail', 'wait_network', 'restart_app', 'unlock_screen'
    delay: float  # 대기 시간 (초)
    new_retry_count: int
    error_code: str
    message: str


class StallMonitor:
    """
    영상 재생 정지 감지.
    AutoX.js createStallMonitor() 포팅.
    """

    def __init__(self, timeout_sec: float = STALL_DETECTION_TIMEOUT_SEC):
        self.timeout_sec = timeout_sec
        self._last_progress: float = 0
        self._last_update_time: float = time.time()

    def update(self, progress: float) -> None:
        """진행률 업데이트."""
        if progress != self._last_progress:
            self._last_progress = progress
            self._last_update_time = time.time()

    def is_stalled(self) -> bool:
        """정지 여부 확인."""
        return self.elapsed_since_update > self.timeout_sec

    @property
    def elapsed_since_update(self) -> float:
        """마지막 업데이트 이후 경과 시간 (초)."""
        return time.time() - self._last_update_time

    def reset(self) -> None:
        """모니터 초기화."""
        self._last_progress = 0
        self._last_update_time = time.time()


class ErrorRecovery:
    """
    에러 분류 및 복구 실행.

    AutoX.js ErrorRecovery.js 완전 포팅:
    - 에러 코드 분류 (E1xxx ~ E4xxx)
    - 재시도 가능/불가능 판단
    - 복구 액션 결정 및 실행
    - 지수 백오프 재시도
    """

    def __init__(self, driver: WebDriver, actions: AppiumActions):
        self.driver = driver
        self.actions = actions

    def classify_error(self, error: Exception) -> str:
        """
        예외를 에러 코드로 분류.
        """
        error_msg = str(error).lower()

        # Appium/Selenium 세션 에러
        if isinstance(error, WebDriverException):
            if "session" in error_msg and ("not found" in error_msg or "expired" in error_msg):
                return ErrorCode.SESSION_EXPIRED
            if "no such element" in error_msg:
                return ErrorCode.VIDEO_UNAVAILABLE
            return ErrorCode.APPIUM_ERROR

        # 네트워크 에러
        if "network" in error_msg or "connection" in error_msg or "timeout" in error_msg:
            if "timeout" in error_msg:
                return ErrorCode.REQUEST_TIMEOUT
            return ErrorCode.NETWORK_DISCONNECTED

        # YouTube 에러
        if "unavailable" in error_msg or "not found" in error_msg:
            return ErrorCode.VIDEO_UNAVAILABLE
        if "region" in error_msg or "blocked" in error_msg:
            return ErrorCode.VIDEO_REGION_BLOCKED
        if "age" in error_msg or "restricted" in error_msg:
            return ErrorCode.VIDEO_AGE_RESTRICTED
        if "stall" in error_msg or "frozen" in error_msg:
            return ErrorCode.PLAYBACK_STALLED

        # 디바이스 에러
        if "crash" in error_msg:
            return ErrorCode.APP_CRASH
        if "memory" in error_msg:
            return ErrorCode.MEMORY_LOW
        if "lock" in error_msg or "screen" in error_msg:
            return ErrorCode.SCREEN_LOCKED
        if "battery" in error_msg:
            return ErrorCode.BATTERY_LOW

        return ErrorCode.UNKNOWN

    def is_retryable(self, error_code: str) -> bool:
        """에러 코드가 재시도 가능한지 확인."""
        return error_code in RETRYABLE_ERROR_CODES

    def handle_error(
        self, error_code: str, retry_count: int = 0, context: str = ""
    ) -> RecoveryAction:
        """
        에러 코드에 따른 복구 액션 결정.

        Returns:
            RecoveryAction 객체
        """
        logger.warning(
            "Handling error: code=%s, retry=%d, context=%s",
            error_code,
            retry_count,
            context,
        )

        # 재시도 불가능
        if error_code in NON_RETRYABLE_ERROR_CODES:
            return RecoveryAction(
                action="fail",
                delay=0,
                new_retry_count=retry_count,
                error_code=error_code,
                message=f"Non-retryable error: {error_code}",
            )

        # 재시도 횟수 초과
        if retry_count >= MAX_RETRY_COUNT:
            return RecoveryAction(
                action="fail",
                delay=0,
                new_retry_count=retry_count,
                error_code=error_code,
                message=f"Max retries ({MAX_RETRY_COUNT}) exceeded for {error_code}",
            )

        # 에러별 복구 전략
        if error_code == ErrorCode.NETWORK_DISCONNECTED:
            return RecoveryAction(
                action="wait_network",
                delay=NETWORK_CHECK_INTERVAL_SEC,
                new_retry_count=retry_count + 1,
                error_code=error_code,
                message="Waiting for network recovery",
            )

        if error_code == ErrorCode.APP_CRASH:
            return RecoveryAction(
                action="restart_app",
                delay=5,
                new_retry_count=retry_count + 1,
                error_code=error_code,
                message="Restarting YouTube after crash",
            )

        if error_code == ErrorCode.SCREEN_LOCKED:
            return RecoveryAction(
                action="unlock_screen",
                delay=2,
                new_retry_count=retry_count + 1,
                error_code=error_code,
                message="Unlocking screen",
            )

        if error_code in (ErrorCode.SESSION_EXPIRED, ErrorCode.APPIUM_ERROR):
            return RecoveryAction(
                action="fail",
                delay=0,
                new_retry_count=retry_count,
                error_code=error_code,
                message=f"Session/Appium error requires session recreation: {error_code}",
            )

        # 기본: 지수 백오프 재시도
        delay = min(
            RETRY_BASE_DELAY_SEC * (2 ** retry_count),
            RETRY_MAX_DELAY_SEC,
        )
        return RecoveryAction(
            action="retry",
            delay=delay,
            new_retry_count=retry_count + 1,
            error_code=error_code,
            message=f"Retrying after {delay}s (attempt {retry_count + 1})",
        )

    def execute_recovery(self, recovery: RecoveryAction) -> bool:
        """
        복구 액션 실행.

        Returns:
            True면 작업 재시도 가능, False면 실패 처리
        """
        logger.info(
            "Executing recovery: action=%s, delay=%.1fs, msg=%s",
            recovery.action,
            recovery.delay,
            recovery.message,
        )

        if recovery.action == "fail":
            return False

        if recovery.action == "retry":
            time.sleep(recovery.delay)
            return True

        if recovery.action == "wait_network":
            return self._wait_for_network()

        if recovery.action == "restart_app":
            return self._restart_youtube()

        if recovery.action == "unlock_screen":
            return self._unlock_screen()

        logger.warning("Unknown recovery action: %s", recovery.action)
        return False

    def is_youtube_running(self) -> bool:
        """YouTube 앱이 포그라운드에서 실행 중인지 확인."""
        try:
            return self.actions.is_app_running(YOUTUBE_PACKAGE)
        except Exception:
            return False

    def force_stop_youtube(self) -> None:
        """YouTube 앱 강제 종료."""
        try:
            self.actions.terminate_app(YOUTUBE_PACKAGE)
            time.sleep(3)
            logger.info("YouTube force-stopped")
        except Exception as e:
            logger.warning("Failed to force-stop YouTube: %s", e)

    def _restart_youtube(self) -> bool:
        """YouTube 강제 종료 후 재시작."""
        try:
            self.force_stop_youtube()
            time.sleep(2)
            self.actions.activate_app(YOUTUBE_PACKAGE)
            time.sleep(5)

            if self.is_youtube_running():
                logger.info("YouTube restarted successfully")
                return True
            else:
                logger.warning("YouTube did not restart")
                return False
        except Exception as e:
            logger.error("Failed to restart YouTube: %s", e)
            return False

    def _wait_for_network(self) -> bool:
        """
        네트워크 복구 대기.
        최대 NETWORK_WAIT_TIMEOUT_SEC 초 대기.
        """
        start = time.time()
        while time.time() - start < NETWORK_WAIT_TIMEOUT_SEC:
            if self._check_network():
                logger.info("Network recovered")
                return True
            time.sleep(NETWORK_CHECK_INTERVAL_SEC)

        logger.warning("Network recovery timeout (%ds)", NETWORK_WAIT_TIMEOUT_SEC)
        return False

    def _check_network(self) -> bool:
        """네트워크 연결 확인."""
        try:
            output = self.actions.execute_adb_shell("ping", ["-c", "1", "-W", "3", "8.8.8.8"])
            return "1 received" in output
        except Exception:
            return False

    def _unlock_screen(self) -> bool:
        """화면 잠금 해제."""
        try:
            # Wake up
            self.actions.press_keycode(224)  # KEYCODE_WAKEUP
            time.sleep(1)
            # Swipe up to unlock
            w = self.actions.screen_size["width"]
            h = self.actions.screen_size["height"]
            self.actions.swipe(w // 2, int(h * 0.8), w // 2, int(h * 0.3), 300)
            time.sleep(1)
            logger.info("Screen unlocked")
            return True
        except Exception as e:
            logger.warning("Failed to unlock screen: %s", e)
            return False

    def create_stall_monitor(
        self, timeout_sec: float = STALL_DETECTION_TIMEOUT_SEC
    ) -> StallMonitor:
        """진행 정지 모니터 생성."""
        return StallMonitor(timeout_sec=timeout_sec)

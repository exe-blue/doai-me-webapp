"""
Appium 세션 매니저

세션 생성/종료/풀 관리. 워크플로우 단위로 세션 생성.
systemPort 풀(8200-8300)에서 디바이스별 고유 할당 → 포트 충돌 방지.
"""

import logging
import threading
from typing import Optional

from appium import webdriver
from appium.options.common import AppiumOptions

from appium_core.capabilities import build_capabilities

logger = logging.getLogger(__name__)


class SessionManager:
    """Appium 세션 풀 관리자."""

    def __init__(
        self,
        appium_url: str = "http://localhost:4723",
        system_port_start: int = 8200,
        system_port_end: int = 8300,
        max_sessions: int = 10,
    ):
        self.appium_url = appium_url
        self.max_sessions = max_sessions

        # systemPort 풀
        self._port_pool: set[int] = set(range(system_port_start, system_port_end + 1))
        self._used_ports: dict[str, int] = {}  # device_udid → port
        self._lock = threading.Lock()

        # 활성 세션
        self._sessions: dict[str, webdriver.Remote] = {}  # device_udid → driver

        logger.info(
            "SessionManager initialized: url=%s, ports=%d-%d, max=%d",
            appium_url,
            system_port_start,
            system_port_end,
            max_sessions,
        )

    def _allocate_port(self, device_udid: str) -> int:
        """디바이스에 systemPort 할당."""
        with self._lock:
            # 이미 할당된 포트가 있으면 재사용
            if device_udid in self._used_ports:
                return self._used_ports[device_udid]

            if not self._port_pool:
                raise RuntimeError("No available systemPort in pool")

            port = min(self._port_pool)
            self._port_pool.discard(port)
            self._used_ports[device_udid] = port
            return port

    def _release_port(self, device_udid: str) -> None:
        """디바이스 systemPort 반환."""
        with self._lock:
            port = self._used_ports.pop(device_udid, None)
            if port is not None:
                self._port_pool.add(port)

    @property
    def active_session_count(self) -> int:
        return len(self._sessions)

    def create_session(
        self,
        device_udid: str,
        app_package: str = "com.google.android.youtube",
        app_activity: str = "com.google.android.youtube.HomeActivity",
        no_reset: bool = True,
        new_command_timeout: int = 300,
    ) -> webdriver.Remote:
        """
        Appium 세션 생성 (워크플로우 시작 시 호출).

        Args:
            device_udid: 디바이스 식별자
            app_package: 앱 패키지명
            app_activity: 앱 액티비티
            no_reset: 앱 데이터 유지 여부
            new_command_timeout: 유휴 세션 타임아웃 (초)

        Returns:
            Appium WebDriver 인스턴스

        Raises:
            RuntimeError: 최대 세션 수 초과 또는 포트 풀 소진
        """
        # 이미 세션이 있으면 재사용
        if device_udid in self._sessions:
            driver = self._sessions[device_udid]
            try:
                # 세션이 살아있는지 확인
                driver.session_id  # noqa: B018
                logger.info("Reusing existing session for %s", device_udid)
                return driver
            except Exception:
                # 죽은 세션 정리
                logger.warn("Stale session found for %s, cleaning up", device_udid)
                self._cleanup_session(device_udid)

        if self.active_session_count >= self.max_sessions:
            raise RuntimeError(
                f"Max sessions ({self.max_sessions}) reached. "
                f"Active: {self.active_session_count}"
            )

        system_port = self._allocate_port(device_udid)

        caps = build_capabilities(
            device_udid=device_udid,
            system_port=system_port,
            app_package=app_package,
            app_activity=app_activity,
            no_reset=no_reset,
            new_command_timeout=new_command_timeout,
        )

        logger.info(
            "Creating Appium session: device=%s, systemPort=%d",
            device_udid,
            system_port,
        )

        try:
            options = AppiumOptions()
            options.load_capabilities(caps)
            driver = webdriver.Remote(
                command_executor=self.appium_url,
                options=options,
            )
            self._sessions[device_udid] = driver
            logger.info(
                "Session created: device=%s, session_id=%s",
                device_udid,
                driver.session_id,
            )
            return driver
        except Exception as e:
            self._release_port(device_udid)
            logger.error("Failed to create session for %s: %s", device_udid, e)
            raise

    def get_session(self, device_udid: str) -> Optional[webdriver.Remote]:
        """기존 세션 반환 (없으면 None)."""
        return self._sessions.get(device_udid)

    def close_session(self, device_udid: str) -> None:
        """세션 종료 (워크플로우 완료/실패 시 호출)."""
        self._cleanup_session(device_udid)

    def _cleanup_session(self, device_udid: str) -> None:
        """세션 정리 (드라이버 종료 + 포트 반환)."""
        driver = self._sessions.pop(device_udid, None)
        if driver:
            try:
                driver.quit()
                logger.info("Session closed for %s", device_udid)
            except Exception as e:
                logger.warning("Error closing session for %s: %s", device_udid, e)

        self._release_port(device_udid)

    def close_all_sessions(self) -> None:
        """모든 세션 종료."""
        device_ids = list(self._sessions.keys())
        for device_udid in device_ids:
            self._cleanup_session(device_udid)
        logger.info("All sessions closed")

    def cleanup_stale_sessions(self) -> int:
        """
        응답 없는 세션 정리.
        Celery after_return/on_failure에서 호출 가능.

        Returns:
            정리된 세션 수
        """
        stale = []
        for device_udid, driver in list(self._sessions.items()):
            try:
                # 세션이 살아있는지 확인 (간단한 명령)
                driver.session_id  # noqa: B018
                driver.get_window_size()  # 실제 통신 확인
            except Exception:
                stale.append(device_udid)

        for device_udid in stale:
            logger.info("Cleaning stale session: %s", device_udid)
            self._cleanup_session(device_udid)

        if stale:
            logger.info("Cleaned %d stale sessions", len(stale))
        return len(stale)

    def get_metrics(self) -> dict:
        """세션 풀 메트릭."""
        return {
            "active_sessions": self.active_session_count,
            "max_sessions": self.max_sessions,
            "available_ports": len(self._port_pool),
            "used_ports": dict(self._used_ports),
            "active_devices": list(self._sessions.keys()),
        }

    def health_check(self) -> dict:
        """Appium 서버 상태 확인."""
        import httpx

        try:
            resp = httpx.get(f"{self.appium_url}/status", timeout=10)
            data = resp.json()
            return {
                "appium_ready": data.get("value", {}).get("ready", False),
                "active_sessions": self.active_session_count,
                "available_ports": len(self._port_pool),
            }
        except Exception as e:
            return {
                "appium_ready": False,
                "error": str(e),
                "active_sessions": self.active_session_count,
                "available_ports": len(self._port_pool),
            }


# 싱글톤
_instance: Optional[SessionManager] = None
_instance_lock = threading.Lock()


def get_session_manager(
    appium_url: str = "http://localhost:4723",
    system_port_start: int = 8200,
    system_port_end: int = 8300,
    max_sessions: int = 10,
) -> SessionManager:
    """SessionManager 싱글톤 반환."""
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = SessionManager(
                appium_url=appium_url,
                system_port_start=system_port_start,
                system_port_end=system_port_end,
                max_sessions=max_sessions,
            )
        return _instance

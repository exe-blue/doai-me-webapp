"""
Appium UI 액션 모듈

tap, swipe, type, scroll, keypress 등 기본 액션.
AutoX.js의 click(), scrollDown(), press() 등을 대체.
"""

import logging
import time
from typing import Optional

from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

logger = logging.getLogger(__name__)


class AppiumActions:
    """
    Appium 기본 UI 액션 래퍼.

    AutoX.js 매핑:
        click(el)          → tap(element)
        scrollDown()       → scroll_down()
        press(66)          → press_keycode(66)
        el.setText("text") → type_text(element, text)
        swipe(...)         → swipe(...)
    """

    def __init__(self, driver: WebDriver):
        self.driver = driver
        self._screen_size: Optional[dict] = None

    @property
    def screen_size(self) -> dict:
        """화면 크기 캐시."""
        if self._screen_size is None:
            self._screen_size = self.driver.get_window_size()
        return self._screen_size

    def tap(self, element: WebElement) -> None:
        """
        요소 탭 (클릭).
        AutoX.js: click(element)
        """
        element.click()

    def tap_coordinates(self, x: int, y: int) -> None:
        """좌표 기반 탭."""
        from appium.webdriver.common.touch_action import TouchAction

        action = TouchAction(self.driver)
        action.tap(x=x, y=y).perform()

    def type_text(self, element: WebElement, text: str, clear_first: bool = True) -> None:
        """
        텍스트 입력.
        AutoX.js: element.setText("text")
        """
        if clear_first:
            element.clear()
        element.send_keys(text)

    def press_keycode(self, keycode: int) -> None:
        """
        키 입력.
        AutoX.js: press(keycode)

        Common keycodes:
            66 = KEYCODE_ENTER
            4  = KEYCODE_BACK
            3  = KEYCODE_HOME
            24 = KEYCODE_VOLUME_UP
            25 = KEYCODE_VOLUME_DOWN
        """
        self.driver.press_keycode(keycode)

    def press_enter(self) -> None:
        """Enter 키."""
        self.press_keycode(66)

    def press_back(self) -> None:
        """Back 키."""
        self.press_keycode(4)

    def press_home(self) -> None:
        """Home 키."""
        self.press_keycode(3)

    def swipe(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        duration_ms: int = 500,
    ) -> None:
        """
        스와이프 제스처.
        AutoX.js: swipe(startX, startY, endX, endY, duration)
        """
        self.driver.swipe(start_x, start_y, end_x, end_y, duration_ms)

    def scroll_down(self, duration_ms: int = 500) -> None:
        """
        아래로 스크롤.
        AutoX.js: scrollDown()
        """
        w = self.screen_size["width"]
        h = self.screen_size["height"]
        self.swipe(w // 2, int(h * 0.7), w // 2, int(h * 0.3), duration_ms)

    def scroll_up(self, duration_ms: int = 500) -> None:
        """위로 스크롤."""
        w = self.screen_size["width"]
        h = self.screen_size["height"]
        self.swipe(w // 2, int(h * 0.3), w // 2, int(h * 0.7), duration_ms)

    def scroll_down_small(self, duration_ms: int = 300) -> None:
        """작은 폭 아래 스크롤 (목록 탐색용)."""
        w = self.screen_size["width"]
        h = self.screen_size["height"]
        self.swipe(w // 2, int(h * 0.6), w // 2, int(h * 0.4), duration_ms)

    def swipe_left(self, duration_ms: int = 500) -> None:
        """왼쪽으로 스와이프."""
        w = self.screen_size["width"]
        h = self.screen_size["height"]
        self.swipe(int(w * 0.8), h // 2, int(w * 0.2), h // 2, duration_ms)

    def swipe_right(self, duration_ms: int = 500) -> None:
        """오른쪽으로 스와이프."""
        w = self.screen_size["width"]
        h = self.screen_size["height"]
        self.swipe(int(w * 0.2), h // 2, int(w * 0.8), h // 2, duration_ms)

    def activate_app(self, package: str) -> None:
        """
        앱 활성화 (이미 설치된 앱 실행/전환).
        AutoX.js: app.launch("com.google.android.youtube")
        """
        self.driver.activate_app(package)
        logger.info("Activated app: %s", package)

    def terminate_app(self, package: str) -> bool:
        """
        앱 강제 종료.
        AutoX.js: am force-stop 대체
        """
        result = self.driver.terminate_app(package)
        logger.info("Terminated app: %s (result=%s)", package, result)
        return result

    def is_app_running(self, package: str) -> bool:
        """앱 실행 상태 확인."""
        state = self.driver.query_app_state(package)
        # 4 = RUNNING_IN_FOREGROUND, 3 = RUNNING_IN_BACKGROUND
        return state >= 3

    def get_current_package(self) -> str:
        """현재 포그라운드 앱 패키지명."""
        return self.driver.current_package

    def get_current_activity(self) -> str:
        """현재 포그라운드 액티비티."""
        return self.driver.current_activity

    def wait(self, seconds: float) -> None:
        """
        대기.
        AutoX.js: sleep(ms)
        """
        time.sleep(seconds)

    def set_implicit_wait(self, seconds: float) -> None:
        """암시적 대기 설정."""
        self.driver.implicitly_wait(seconds)

    def open_url(self, url: str) -> None:
        """
        URL로 앱 열기 (딥링크).
        AutoX.js: app.openUrl(url)
        """
        self.driver.get(url)
        logger.info("Opened URL: %s", url)

    def hide_keyboard(self) -> None:
        """키보드 숨기기."""
        try:
            self.driver.hide_keyboard()
        except Exception:
            pass  # 키보드가 이미 숨겨진 경우

    def get_page_source(self) -> str:
        """현재 화면 XML 소스 (디버깅용)."""
        return self.driver.page_source

    def execute_adb_shell(self, command: str, args: Optional[list] = None) -> str:
        """
        ADB shell 명령 실행 (Appium 서버 경유).

        Args:
            command: 셸 명령
            args: 명령 인수 리스트

        Returns:
            명령 출력 문자열
        """
        result = self.driver.execute_script(
            "mobile: shell",
            {"command": command, "args": args or []},
        )
        return str(result) if result else ""

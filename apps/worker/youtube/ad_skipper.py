"""
광고 스킵 모듈

AutoX.js AdSkipper.js 포팅.
백그라운드 스레드 제거 → 시청 루프에서 인라인 폴링으로 변경.
"""

import logging
from typing import Optional

from selenium.webdriver.remote.webdriver import WebDriver

from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from youtube.constants import (
    AD_SKIP_BUTTON_SELECTORS,
    AD_INDICATOR_SELECTORS,
    TIMEOUT_AD_CHECK,
)

logger = logging.getLogger(__name__)


class AdSkipper:
    """
    YouTube 광고 스킵.

    아키텍처 변경 (AutoX.js → Python):
    - 기존: 백그라운드 스레드에서 1초 간격 폴링
    - 신규: 시청 루프에서 5초 간격 인라인 호출 (스레드 불필요)

    사용법:
        ad_skipper = AdSkipper(driver, selectors, actions)
        while elapsed < target_duration:
            time.sleep(5)
            elapsed += 5
            ad_skipper.try_skip()  # 5초마다 광고 체크
    """

    def __init__(
        self,
        driver: WebDriver,
        selectors: AppiumSelectors,
        actions: AppiumActions,
    ):
        self.driver = driver
        self.selectors = selectors
        self.actions = actions
        self._skip_count: int = 0
        self._ad_detected_count: int = 0

    @property
    def skip_count(self) -> int:
        """성공적으로 스킵한 광고 수."""
        return self._skip_count

    @property
    def ad_detected_count(self) -> int:
        """감지된 광고 수."""
        return self._ad_detected_count

    def try_skip(self) -> bool:
        """
        광고 스킵 시도. 시청 루프에서 주기적으로 호출.

        Returns:
            True면 광고가 스킵됨, False면 광고 없거나 스킵 불가
        """
        try:
            if not self._is_ad_playing():
                return False

            self._ad_detected_count += 1
            logger.info("Ad detected (#%d), attempting skip", self._ad_detected_count)

            return self._click_skip_button()
        except Exception as e:
            logger.debug("Ad skip check failed (non-critical): %s", e)
            return False

    def _is_ad_playing(self) -> bool:
        """광고가 재생 중인지 확인."""
        return self.selectors.element_exists(
            AD_INDICATOR_SELECTORS,
            timeout=TIMEOUT_AD_CHECK,
        )

    def _click_skip_button(self) -> bool:
        """스킵 버튼 클릭."""
        skip_btn = self.selectors.find_with_fallback(
            AD_SKIP_BUTTON_SELECTORS,
            timeout=TIMEOUT_AD_CHECK,
        )

        if skip_btn:
            try:
                self.actions.tap(skip_btn)
                self._skip_count += 1
                logger.info("Ad skipped (#%d)", self._skip_count)
                return True
            except Exception as e:
                logger.warning("Failed to click skip button: %s", e)
                return False

        logger.debug("Skip button not available yet")
        return False

    def wait_for_ad_to_finish(self, max_wait_sec: float = 30) -> None:
        """
        스킵 불가능한 광고가 끝날 때까지 대기.

        Args:
            max_wait_sec: 최대 대기 시간
        """
        import time

        start = time.time()
        while time.time() - start < max_wait_sec:
            if not self._is_ad_playing():
                logger.info("Ad finished (waited %.1fs)", time.time() - start)
                return

            # 스킵 버튼이 나타나면 클릭
            if self._click_skip_button():
                return

            time.sleep(1)

        logger.warning("Ad wait timeout after %ds", max_wait_sec)

    def get_stats(self) -> dict:
        """광고 스킵 통계."""
        return {
            "ads_detected": self._ad_detected_count,
            "ads_skipped": self._skip_count,
        }

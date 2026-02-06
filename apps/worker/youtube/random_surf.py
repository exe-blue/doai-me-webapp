"""
랜덤 서핑 모듈

AutoX.js RandomSurf.js 포팅.
홈 피드에서 랜덤 영상 선택 → 시청.
"""

import logging
import random
import time
from typing import Optional

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from youtube.constants import (
    HOME_TAB_SELECTORS,
    FEED_VIDEO_SELECTORS,
    TIMEOUT_ELEMENT_DEFAULT,
    TIMEOUT_ELEMENT_SHORT,
    YOUTUBE_PACKAGE,
)

logger = logging.getLogger(__name__)


class RandomSurf:
    """
    YouTube 홈 피드 랜덤 서핑.

    AutoX.js RandomSurf.js 포팅:
    - 홈 탭 이동 → 피드 스크롤 → 영상 탭
    - 한국어/영어 셀렉터 지원
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

    def navigate_to_home(self) -> bool:
        """홈 탭으로 이동."""
        home_tab = self.selectors.find_with_fallback(
            HOME_TAB_SELECTORS,
            timeout=TIMEOUT_ELEMENT_DEFAULT,
        )
        if home_tab:
            self.actions.tap(home_tab)
            time.sleep(2)
            logger.info("Navigated to Home tab")
            return True

        # 이미 홈이면 OK
        if self.actions.get_current_package() == YOUTUBE_PACKAGE:
            logger.info("Already on YouTube home")
            return True

        return False

    def select_random_video(self, max_scroll: int = 5) -> bool:
        """
        피드에서 랜덤 영상 선택.

        Args:
            max_scroll: 최대 스크롤 횟수

        Returns:
            영상 선택 성공 여부
        """
        # 랜덤 횟수만큼 스크롤 (다양성 확보)
        scroll_count = random.randint(0, max_scroll)
        logger.info("Random surf: scrolling %d times", scroll_count)

        for i in range(scroll_count):
            self.actions.scroll_down()
            time.sleep(random.uniform(0.8, 1.5))

        # 영상 탭
        video = self._find_feed_video()
        if video:
            self.actions.tap(video)
            logger.info("Random video selected after %d scrolls", scroll_count)
            return True

        # 한번 더 스크롤 후 재시도
        self.actions.scroll_down()
        time.sleep(1)
        video = self._find_feed_video()
        if video:
            self.actions.tap(video)
            return True

        logger.warning("No video found in feed")
        return False

    def _find_feed_video(self) -> Optional[WebElement]:
        """피드에서 영상 요소 찾기."""
        return self.selectors.find_with_fallback(
            FEED_VIDEO_SELECTORS,
            timeout=TIMEOUT_ELEMENT_SHORT,
        )

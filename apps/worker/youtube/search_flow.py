"""
YouTube 검색 플로우

AutoX.js SearchFlow.js 포팅.
키워드 검색 → 결과 스크롤 → 영상 선택.
"""

import logging
import time
from typing import Optional

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from appium_core.evidence import EvidenceCapture
from youtube.constants import (
    SEARCH_BUTTON_SELECTORS,
    SEARCH_INPUT_SELECTORS,
    SEARCH_RESULT_VIDEO_SELECTORS,
    TIMEOUT_SEARCH,
    TIMEOUT_ELEMENT_DEFAULT,
    TIMEOUT_ELEMENT_SHORT,
    YOUTUBE_PACKAGE,
)

logger = logging.getLogger(__name__)


class SearchFlow:
    """
    YouTube 키워드 검색 + 영상 선택.

    AutoX.js SearchFlow.js 포팅:
    - 검색 버튼 탭 → 키워드 입력 → Enter → 결과 스크롤 → 영상 클릭
    - 다중 셀렉터 폴백으로 한국어/영어 UI 모두 지원
    """

    MAX_SCROLL_ATTEMPTS = 10

    def __init__(
        self,
        driver: WebDriver,
        selectors: AppiumSelectors,
        actions: AppiumActions,
        evidence: Optional[EvidenceCapture] = None,
    ):
        self.driver = driver
        self.selectors = selectors
        self.actions = actions
        self.evidence = evidence

    def search_and_select(
        self,
        keyword: str,
        target_title: Optional[str] = None,
        max_scroll: int = MAX_SCROLL_ATTEMPTS,
    ) -> bool:
        """
        키워드 검색 후 영상 선택.

        Args:
            keyword: 검색 키워드
            target_title: 특정 영상 제목 (None이면 첫 번째 영상)
            max_scroll: 최대 스크롤 횟수

        Returns:
            True면 영상 선택 성공
        """
        logger.info("Starting search: keyword=%s, target=%s", keyword, target_title)

        # 1. 검색 버튼 탭
        if not self._tap_search_button():
            logger.error("Failed to find search button")
            return False

        time.sleep(1)

        # 2. 키워드 입력
        if not self._enter_keyword(keyword):
            logger.error("Failed to enter keyword")
            return False

        if self.evidence:
            self.evidence.capture_on_search()

        # 3. 검색 결과에서 영상 선택
        time.sleep(2)
        if not self._select_video(target_title, max_scroll):
            logger.error("Failed to select video")
            return False

        if self.evidence:
            self.evidence.capture_on_video_found()

        logger.info("Search and select completed")
        return True

    def _tap_search_button(self) -> bool:
        """검색 버튼 탭."""
        btn = self.selectors.find_with_fallback(
            SEARCH_BUTTON_SELECTORS,
            timeout=TIMEOUT_SEARCH,
        )
        if btn:
            self.actions.tap(btn)
            logger.debug("Search button tapped")
            return True
        return False

    def _enter_keyword(self, keyword: str) -> bool:
        """검색창에 키워드 입력 후 Enter."""
        search_input = self.selectors.find_with_fallback(
            SEARCH_INPUT_SELECTORS,
            timeout=TIMEOUT_ELEMENT_DEFAULT,
        )
        if not search_input:
            return False

        self.actions.type_text(search_input, keyword)
        time.sleep(0.5)
        self.actions.press_enter()
        logger.debug("Keyword entered: %s", keyword)
        return True

    def _select_video(
        self, target_title: Optional[str], max_scroll: int
    ) -> bool:
        """
        검색 결과에서 영상 선택.
        target_title이 있으면 해당 제목 매칭, 없으면 첫 번째 영상.
        """
        for scroll_count in range(max_scroll):
            video = self._find_video_in_results(target_title)
            if video:
                self.actions.tap(video)
                logger.info(
                    "Video selected (scroll_count=%d)", scroll_count
                )
                return True

            # 스크롤 후 재탐색
            logger.debug("Scrolling for video (attempt %d/%d)", scroll_count + 1, max_scroll)
            self.actions.scroll_down()
            time.sleep(1.5)

        logger.warning("Video not found after %d scrolls", max_scroll)
        return False

    def _find_video_in_results(
        self, target_title: Optional[str]
    ) -> Optional[WebElement]:
        """
        현재 화면에서 영상 요소 찾기.
        """
        if target_title:
            # 특정 제목 검색
            el = self.selectors.by_text_contains(target_title, timeout=TIMEOUT_ELEMENT_SHORT)
            if el:
                return el

        # 첫 번째 검색 결과 영상
        return self.selectors.find_with_fallback(
            SEARCH_RESULT_VIDEO_SELECTORS,
            timeout=TIMEOUT_ELEMENT_SHORT,
        )

    def navigate_by_url(self, video_url: str) -> bool:
        """
        URL로 직접 영상 이동 (검색 없이).
        AutoX.js: app.openUrl(url)
        """
        try:
            logger.info("Navigating to URL: %s", video_url)
            self.actions.open_url(video_url)
            time.sleep(3)

            # YouTube 앱에서 열렸는지 확인
            current_pkg = self.actions.get_current_package()
            if current_pkg == YOUTUBE_PACKAGE:
                logger.info("URL navigation successful")
                return True

            # YouTube가 포그라운드가 아닌 경우
            logger.warning("URL opened in wrong app: %s", current_pkg)
            return False
        except Exception as e:
            logger.error("URL navigation failed: %s", e)
            return False

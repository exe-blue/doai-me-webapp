"""
YouTube 상호작용 액션 모듈

AutoX.js YouTubeActions.js 포팅.
좋아요, 댓글, 구독, 재생목록 등 확률적 액션.
"""

import logging
import random
import time
from typing import Optional

from selenium.webdriver.remote.webdriver import WebDriver

from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from youtube.constants import (
    LIKE_BUTTON_SELECTORS,
    COMMENT_BUTTON_SELECTORS,
    COMMENT_INPUT_SELECTORS,
    COMMENT_POST_BUTTON_SELECTORS,
    SUBSCRIBE_BUTTON_SELECTORS,
    COMMENT_TEMPLATES,
    TIMEOUT_ELEMENT_DEFAULT,
    TIMEOUT_ELEMENT_SHORT,
)

logger = logging.getLogger(__name__)


class YouTubeInteractions:
    """
    YouTube 확률적 상호작용 (좋아요, 댓글, 구독).

    AutoX.js YouTubeActions.js 포팅:
    - 각 액션은 확률에 따라 실행 (prob_like, prob_comment 등)
    - 실패해도 전체 워크플로우에 영향 없음
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
        self._did_like = False
        self._did_comment = False
        self._did_subscribe = False

    @property
    def did_like(self) -> bool:
        return self._did_like

    @property
    def did_comment(self) -> bool:
        return self._did_comment

    @property
    def did_subscribe(self) -> bool:
        return self._did_subscribe

    def perform_interactions(
        self,
        prob_like: int = 0,
        prob_comment: int = 0,
        prob_subscribe: int = 0,
        comment_text: Optional[str] = None,
    ) -> dict:
        """
        확률적 상호작용 수행.

        Args:
            prob_like: 좋아요 확률 (0-100)
            prob_comment: 댓글 확률 (0-100)
            prob_subscribe: 구독 확률 (0-100)
            comment_text: 댓글 텍스트 (None이면 랜덤 템플릿)

        Returns:
            {did_like, did_comment, did_subscribe} 결과
        """
        logger.info(
            "Performing interactions: like=%d%%, comment=%d%%, subscribe=%d%%",
            prob_like,
            prob_comment,
            prob_subscribe,
        )

        # 좋아요
        if prob_like > 0 and random.randint(1, 100) <= prob_like:
            self._try_like()

        # 댓글
        if prob_comment > 0 and random.randint(1, 100) <= prob_comment:
            text = comment_text or random.choice(COMMENT_TEMPLATES)
            self._try_comment(text)

        # 구독
        if prob_subscribe > 0 and random.randint(1, 100) <= prob_subscribe:
            self._try_subscribe()

        result = {
            "did_like": self._did_like,
            "did_comment": self._did_comment,
            "did_subscribe": self._did_subscribe,
        }
        logger.info("Interactions result: %s", result)
        return result

    def _try_like(self) -> None:
        """좋아요 시도."""
        try:
            like_btn = self.selectors.find_with_fallback(
                LIKE_BUTTON_SELECTORS,
                timeout=TIMEOUT_ELEMENT_DEFAULT,
            )
            if like_btn:
                # 이미 좋아요 상태인지 확인 (content-desc에 "liked" 포함)
                desc = like_btn.get_attribute("content-desc") or ""
                if "liked" in desc.lower() or "좋아요를 취소" in desc:
                    logger.info("Already liked, skipping")
                    self._did_like = True
                    return

                self.actions.tap(like_btn)
                self._did_like = True
                logger.info("Like button tapped")
                time.sleep(1)
            else:
                logger.warning("Like button not found")
        except Exception as e:
            logger.warning("Like failed: %s", e)

    def _try_comment(self, text: str) -> None:
        """댓글 작성 시도."""
        try:
            # 댓글 섹션으로 스크롤
            self.actions.scroll_down()
            time.sleep(1)

            # 댓글 영역 탭
            comment_btn = self.selectors.find_with_fallback(
                COMMENT_BUTTON_SELECTORS,
                timeout=TIMEOUT_ELEMENT_DEFAULT,
            )
            if not comment_btn:
                logger.warning("Comment button not found")
                return

            self.actions.tap(comment_btn)
            time.sleep(2)

            # 댓글 입력 필드
            comment_input = self.selectors.find_with_fallback(
                COMMENT_INPUT_SELECTORS,
                timeout=TIMEOUT_ELEMENT_DEFAULT,
            )
            if not comment_input:
                logger.warning("Comment input not found")
                self.actions.press_back()
                return

            self.actions.type_text(comment_input, text, clear_first=True)
            time.sleep(0.5)

            # 전송 버튼
            send_btn = self.selectors.find_with_fallback(
                COMMENT_POST_BUTTON_SELECTORS,
                timeout=TIMEOUT_ELEMENT_SHORT,
            )
            if send_btn:
                self.actions.tap(send_btn)
                self._did_comment = True
                logger.info("Comment posted: %s", text[:30])
                time.sleep(2)
            else:
                logger.warning("Comment send button not found")
                self.actions.press_back()
        except Exception as e:
            logger.warning("Comment failed: %s", e)
            try:
                self.actions.press_back()
            except Exception:
                pass

    def _try_subscribe(self) -> None:
        """구독 시도."""
        try:
            sub_btn = self.selectors.find_with_fallback(
                SUBSCRIBE_BUTTON_SELECTORS,
                timeout=TIMEOUT_ELEMENT_DEFAULT,
            )
            if sub_btn:
                # "Subscribed" / "구독중" 인 경우 이미 구독
                text_val = sub_btn.get_attribute("text") or ""
                if "subscribed" in text_val.lower() or "구독중" in text_val:
                    logger.info("Already subscribed, skipping")
                    self._did_subscribe = True
                    return

                self.actions.tap(sub_btn)
                self._did_subscribe = True
                logger.info("Subscribe button tapped")
                time.sleep(1)
            else:
                logger.warning("Subscribe button not found")
        except Exception as e:
            logger.warning("Subscribe failed: %s", e)

    def get_results(self) -> dict:
        """상호작용 결과 반환."""
        return {
            "did_like": self._did_like,
            "did_comment": self._did_comment,
            "did_subscribe": self._did_subscribe,
        }

"""
Appium UI 요소 탐색 (다중 전략 폴백)

AutoX.js 셀렉터를 Appium 셀렉터로 변환.
각 탐색 메서드는 여러 전략을 순서대로 시도하여 UI 변경에 대한 내성 확보.
"""

import logging
from typing import Optional

from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    StaleElementReferenceException,
)

logger = logging.getLogger(__name__)

# WebDriverWait 무시할 예외
IGNORED_EXCEPTIONS = (
    NoSuchElementException,
    StaleElementReferenceException,
)


class AppiumSelectors:
    """
    다중 전략 폴백을 지원하는 UI 요소 탐색기.

    AutoX.js 매핑:
        id("res_id")           → by_id()
        desc("text")           → by_accessibility_id()
        text("text")           → by_text()
        textContains("partial") → by_text_contains()
        descContains("partial") → by_desc_contains()
        className("class")     → by_class_name()
    """

    def __init__(self, driver: WebDriver):
        self.driver = driver

    def by_id(
        self,
        resource_id: str,
        timeout: float = 10,
        package: str = "com.google.android.youtube",
    ) -> Optional[WebElement]:
        """
        Resource ID로 요소 탐색.
        AutoX.js: id("resource_id").findOne(timeout)
        """
        full_id = f"{package}:id/{resource_id}" if ":" not in resource_id else resource_id
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(EC.presence_of_element_located((AppiumBy.ID, full_id)))
        except TimeoutException:
            logger.debug("Element not found by ID: %s (timeout=%ss)", full_id, timeout)
            return None

    def by_accessibility_id(
        self, accessibility_id: str, timeout: float = 10
    ) -> Optional[WebElement]:
        """
        Accessibility ID (content-desc)로 요소 탐색.
        AutoX.js: desc("text").findOne(timeout)
        """
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(
                EC.presence_of_element_located(
                    (AppiumBy.ACCESSIBILITY_ID, accessibility_id)
                )
            )
        except TimeoutException:
            logger.debug(
                "Element not found by accessibility_id: %s", accessibility_id
            )
            return None

    def by_text(self, text: str, timeout: float = 10) -> Optional[WebElement]:
        """
        정확한 text로 요소 탐색.
        AutoX.js: text("exact_text").findOne(timeout)
        """
        xpath = f'//*[@text="{text}"]'
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(EC.presence_of_element_located((AppiumBy.XPATH, xpath)))
        except TimeoutException:
            logger.debug("Element not found by text: %s", text)
            return None

    def by_text_contains(
        self, partial_text: str, timeout: float = 10
    ) -> Optional[WebElement]:
        """
        텍스트 부분 매칭으로 요소 탐색.
        AutoX.js: textContains("partial").findOne(timeout)
        """
        xpath = f'//*[contains(@text, "{partial_text}")]'
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(EC.presence_of_element_located((AppiumBy.XPATH, xpath)))
        except TimeoutException:
            logger.debug("Element not found by text contains: %s", partial_text)
            return None

    def by_desc_contains(
        self, partial_desc: str, timeout: float = 10
    ) -> Optional[WebElement]:
        """
        content-desc 부분 매칭으로 요소 탐색.
        AutoX.js: descContains("partial").findOne(timeout)
        """
        xpath = f'//*[contains(@content-desc, "{partial_desc}")]'
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(EC.presence_of_element_located((AppiumBy.XPATH, xpath)))
        except TimeoutException:
            logger.debug("Element not found by desc contains: %s", partial_desc)
            return None

    def by_class_name(
        self, class_name: str, timeout: float = 10
    ) -> Optional[WebElement]:
        """
        클래스명으로 요소 탐색.
        AutoX.js: className("android.widget.EditText").findOne(timeout)
        """
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(
                EC.presence_of_element_located((AppiumBy.CLASS_NAME, class_name))
            )
        except TimeoutException:
            logger.debug("Element not found by class: %s", class_name)
            return None

    def by_xpath(self, xpath: str, timeout: float = 10) -> Optional[WebElement]:
        """XPath로 요소 탐색."""
        try:
            return WebDriverWait(
                self.driver, timeout, ignored_exceptions=IGNORED_EXCEPTIONS
            ).until(EC.presence_of_element_located((AppiumBy.XPATH, xpath)))
        except TimeoutException:
            logger.debug("Element not found by xpath: %s", xpath)
            return None

    def find_with_fallback(
        self,
        strategies: list[tuple[str, str]],
        timeout: float = 10,
    ) -> Optional[WebElement]:
        """
        다중 전략을 순서대로 시도하여 요소 탐색.
        YouTube UI 변경에 대한 내성 확보.

        Args:
            strategies: [(method, value), ...] 리스트.
                method: 'id', 'accessibility_id', 'text', 'text_contains',
                        'desc_contains', 'class_name', 'xpath'
                value: 탐색 값

            timeout: 각 전략별 타임아웃 (초)

        Returns:
            찾은 WebElement 또는 None
        """
        # 첫 전략에만 전체 타임아웃, 나머지는 빠르게 실패
        for i, (method, value) in enumerate(strategies):
            t = timeout if i == 0 else min(timeout, 3)
            element = self._find_by_method(method, value, t)
            if element:
                logger.debug(
                    "Found element via strategy #%d: %s=%s", i, method, value
                )
                return element

        logger.warning(
            "All %d strategies failed for element search", len(strategies)
        )
        return None

    def _find_by_method(
        self, method: str, value: str, timeout: float
    ) -> Optional[WebElement]:
        """메서드 이름으로 적절한 탐색 함수 호출."""
        dispatch = {
            "id": self.by_id,
            "accessibility_id": self.by_accessibility_id,
            "text": self.by_text,
            "text_contains": self.by_text_contains,
            "desc_contains": self.by_desc_contains,
            "class_name": self.by_class_name,
            "xpath": self.by_xpath,
        }
        fn = dispatch.get(method)
        if fn is None:
            logger.warning("Unknown selector method: %s", method)
            return None
        return fn(value, timeout=timeout)

    def element_exists(
        self, strategies: list[tuple[str, str]], timeout: float = 3
    ) -> bool:
        """요소 존재 여부만 빠르게 확인."""
        return self.find_with_fallback(strategies, timeout=timeout) is not None

    def wait_until_gone(
        self,
        by: str,
        value: str,
        timeout: float = 10,
    ) -> bool:
        """요소가 사라질 때까지 대기."""
        locator_map = {
            "id": AppiumBy.ID,
            "accessibility_id": AppiumBy.ACCESSIBILITY_ID,
            "text": AppiumBy.XPATH,
            "xpath": AppiumBy.XPATH,
        }
        appium_by = locator_map.get(by, AppiumBy.XPATH)
        if by == "text":
            value = f'//*[@text="{value}"]'

        try:
            WebDriverWait(self.driver, timeout).until(
                EC.invisibility_of_element_located((appium_by, value))
            )
            return True
        except TimeoutException:
            return False

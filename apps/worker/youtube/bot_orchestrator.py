"""
YouTube Bot 오케스트레이터

AutoX.js bot.js (main.js) 포팅.
전체 YouTube 자동화 워크플로우를 조율:
  앱 실행 → 검색/URL 이동 → 시청 → 상호작용 → 결과 보고
"""

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.common.exceptions import WebDriverException

from appium_core.selectors import AppiumSelectors
from appium_core.actions import AppiumActions
from appium_core.evidence import EvidenceCapture
from youtube.search_flow import SearchFlow
from youtube.youtube_actions import YouTubeInteractions
from youtube.ad_skipper import AdSkipper
from youtube.random_surf import RandomSurf
from youtube.error_recovery import ErrorRecovery
from youtube.constants import (
    YOUTUBE_PACKAGE,
    PLAYER_VIEW_SELECTORS,
    DEFAULT_VIDEO_DURATION_SEC,
    AD_CHECK_INTERVAL_SEC,
    PROGRESS_REPORT_INTERVAL_SEC,
    TIMEOUT_VIDEO_LOAD,
    ErrorCode,
)

logger = logging.getLogger(__name__)


@dataclass
class JobParams:
    """YouTube 작업 파라미터 (job_assignments 테이블 기반)."""

    assignment_id: str
    target_url: Optional[str] = None
    keyword: Optional[str] = None
    video_title: Optional[str] = None
    duration_sec: int = DEFAULT_VIDEO_DURATION_SEC
    duration_min_pct: int = 30
    duration_max_pct: int = 90
    prob_like: int = 0
    prob_comment: int = 0
    prob_subscribe: int = 0
    prob_playlist: int = 0
    comment_text: Optional[str] = None
    retry_count: int = 0


@dataclass
class JobResult:
    """작업 결과."""

    success: bool = False
    duration_sec: float = 0
    did_like: bool = False
    did_comment: bool = False
    did_subscribe: bool = False
    did_playlist: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    search_success: bool = False
    ad_stats: dict = field(default_factory=dict)
    evidence: Optional[dict] = None


class YouTubeBotOrchestrator:
    """
    YouTube 자동화 메인 오케스트레이터.

    AutoX.js bot.js 포팅 + 개선:
    - Intent params → Celery task kwargs
    - app.launch → driver.activate_app()
    - 백그라운드 AdSkipper 스레드 → 인라인 폴링
    - 파일 I/O 증거 → Appium 서버사이드 스크린샷
    """

    def __init__(self, driver: WebDriver, evidence_dir: str = "/tmp/doai-evidence"):
        self.driver = driver

        # 코어 모듈 초기화
        self.selectors = AppiumSelectors(driver)
        self.actions = AppiumActions(driver)
        self.evidence = EvidenceCapture(driver, base_dir=evidence_dir)
        self.search_flow = SearchFlow(driver, self.selectors, self.actions, self.evidence)
        self.interactions = YouTubeInteractions(driver, self.selectors, self.actions)
        self.ad_skipper = AdSkipper(driver, self.selectors, self.actions)
        self.random_surf = RandomSurf(driver, self.selectors, self.actions)
        self.error_recovery = ErrorRecovery(driver, self.actions)

    def execute_job(
        self,
        params: JobParams,
        on_progress: Optional[Callable[[float, str], None]] = None,
    ) -> JobResult:
        """
        YouTube 작업 실행.

        Args:
            params: 작업 파라미터
            on_progress: 진행률 콜백 (progress_pct, message)

        Returns:
            JobResult 객체
        """
        result = JobResult()
        start_time = time.time()

        logger.info(
            "Starting YouTube job: assignment=%s, url=%s, keyword=%s",
            params.assignment_id,
            params.target_url,
            params.keyword,
        )

        # 증거 수집 시작
        self.evidence.start_job(params.assignment_id)

        try:
            # Step 1: YouTube 앱 실행
            self._report_progress(on_progress, 5, "Launching YouTube")
            self._launch_youtube()

            # Step 2: 영상 이동 (URL 또는 검색)
            self._report_progress(on_progress, 10, "Navigating to video")
            nav_success = self._navigate_to_video(params)
            result.search_success = nav_success

            if not nav_success:
                raise RuntimeError("Failed to navigate to video")

            # Step 3: 영상 시청 (광고 스킵 포함)
            self._report_progress(on_progress, 20, "Watching video")
            watch_duration = self._calculate_watch_duration(params)
            actual_duration = self._watch_video(
                target_duration=watch_duration,
                on_progress=on_progress,
            )
            result.duration_sec = actual_duration

            # Step 4: 상호작용 (좋아요/댓글/구독)
            self._report_progress(on_progress, 85, "Performing interactions")
            interaction_result = self.interactions.perform_interactions(
                prob_like=params.prob_like,
                prob_comment=params.prob_comment,
                prob_subscribe=params.prob_subscribe,
                comment_text=params.comment_text,
            )
            result.did_like = interaction_result["did_like"]
            result.did_comment = interaction_result["did_comment"]
            result.did_subscribe = interaction_result["did_subscribe"]

            # Step 5: 완료
            self._report_progress(on_progress, 100, "Completed")
            result.success = True
            result.ad_stats = self.ad_skipper.get_stats()

            if self.evidence:
                self.evidence.capture_on_watch_end()

        except Exception as e:
            error_code = self.error_recovery.classify_error(e)
            result.error_code = error_code
            result.error_message = str(e)
            result.success = False

            logger.error(
                "Job failed: assignment=%s, error_code=%s, error=%s",
                params.assignment_id,
                error_code,
                e,
            )

            if self.evidence:
                self.evidence.capture_on_error(str(e))

        finally:
            elapsed = time.time() - start_time
            result.duration_sec = result.duration_sec or elapsed

            # 증거 종료
            evidence_result = self.evidence.finish_job(
                {
                    "success": result.success,
                    "search_success": result.search_success,
                    "watch_duration": result.duration_sec,
                    "error": result.error_message,
                }
            )
            result.evidence = evidence_result

            logger.info(
                "Job finished: assignment=%s, success=%s, duration=%.1fs",
                params.assignment_id,
                result.success,
                elapsed,
            )

        return result

    def _launch_youtube(self) -> None:
        """YouTube 앱 실행."""
        self.actions.activate_app(YOUTUBE_PACKAGE)
        time.sleep(3)

        if not self.error_recovery.is_youtube_running():
            raise RuntimeError("YouTube failed to launch")

        logger.info("YouTube launched")

    def _navigate_to_video(self, params: JobParams) -> bool:
        """영상으로 이동 (URL 직접 이동 또는 검색)."""
        if params.target_url:
            return self.search_flow.navigate_by_url(params.target_url)
        elif params.keyword:
            return self.search_flow.search_and_select(
                keyword=params.keyword,
                target_title=params.video_title,
            )
        else:
            # 키워드도 URL도 없으면 랜덤 서핑
            logger.info("No URL or keyword, using random surf")
            self.random_surf.navigate_to_home()
            return self.random_surf.select_random_video()

    def _calculate_watch_duration(self, params: JobParams) -> float:
        """시청 시간 계산 (min_pct ~ max_pct 사이 랜덤)."""
        base = params.duration_sec
        min_sec = base * params.duration_min_pct / 100
        max_sec = base * params.duration_max_pct / 100
        duration = random.uniform(min_sec, max_sec)
        logger.info(
            "Watch duration: %.1fs (%.0f%%-%.0f%% of %ds)",
            duration,
            params.duration_min_pct,
            params.duration_max_pct,
            base,
        )
        return duration

    def _watch_video(
        self,
        target_duration: float,
        on_progress: Optional[Callable[[float, str], None]] = None,
    ) -> float:
        """
        영상 시청 (광고 스킵 포함 인라인 폴링).

        AutoX.js 아키텍처 변경:
        - 기존: 백그라운드 스레드 + sleep(duration)
        - 신규: AD_CHECK_INTERVAL_SEC 간격 인라인 루프

        Returns:
            실제 시청 시간 (초)
        """
        # 영상 로드 대기
        player = self.selectors.find_with_fallback(
            PLAYER_VIEW_SELECTORS,
            timeout=TIMEOUT_VIDEO_LOAD,
        )
        if not player:
            logger.warning("Player view not found, continuing anyway")

        if self.evidence:
            self.evidence.capture_on_watch_start()

        stall_monitor = self.error_recovery.create_stall_monitor()
        elapsed = 0.0
        last_progress_report = 0.0

        logger.info("Watching video for %.0fs", target_duration)

        while elapsed < target_duration:
            # 광고 체크 + 스킵
            self.ad_skipper.try_skip()

            # 대기
            time.sleep(AD_CHECK_INTERVAL_SEC)
            elapsed += AD_CHECK_INTERVAL_SEC

            # 진행률 업데이트
            progress_pct = min(elapsed / target_duration, 1.0)
            stall_monitor.update(progress_pct)

            # 주기적 진행률 보고
            if elapsed - last_progress_report >= PROGRESS_REPORT_INTERVAL_SEC:
                last_progress_report = elapsed
                overall = 20 + (progress_pct * 65)  # 20% ~ 85% 구간
                self._report_progress(
                    on_progress,
                    overall,
                    f"Watching: {elapsed:.0f}/{target_duration:.0f}s ({progress_pct*100:.0f}%)",
                )

            # YouTube 크래시 감지
            if not self.error_recovery.is_youtube_running():
                logger.warning("YouTube crashed during watch at %.1fs", elapsed)
                raise RuntimeError(f"YouTube crashed after {elapsed:.0f}s")

            # 재생 정지 감지
            if stall_monitor.is_stalled():
                logger.warning("Playback stalled at %.1fs", elapsed)
                raise RuntimeError(f"Playback stalled after {elapsed:.0f}s")

        logger.info("Watch completed: %.1fs", elapsed)
        return elapsed

    @staticmethod
    def _report_progress(
        callback: Optional[Callable[[float, str], None]],
        progress: float,
        message: str,
    ) -> None:
        """진행률 콜백 호출."""
        if callback:
            try:
                callback(progress, message)
            except Exception as e:
                logger.debug("Progress callback error: %s", e)

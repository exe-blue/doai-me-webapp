"""
Appium 네이티브 스크린샷 + 증거 수집

AutoX.js EvidenceManager 대체. 디바이스 파일 I/O 없이
driver.get_screenshot_as_png()로 서버사이드 캡처.
"""

import logging
import os
import time
from datetime import datetime
from typing import Optional

from selenium.webdriver.remote.webdriver import WebDriver

logger = logging.getLogger(__name__)


class EvidenceCapture:
    """
    Appium 스크린샷 및 증거 관리.

    AutoX.js EvidenceManager와 동일한 인터페이스 제공:
    - startJob() → 작업 시작
    - captureScreenshot() → 스크린샷 캡처
    - finishJob() → 결과 생성
    """

    MAX_SCREENSHOTS_PER_JOB = 20

    def __init__(
        self,
        driver: WebDriver,
        base_dir: str = "/tmp/doai-evidence",
    ):
        self.driver = driver
        self.base_dir = base_dir
        self._current_job: Optional[dict] = None
        self._sequence: int = 0
        self._last_timestamp: str = ""

    def start_job(self, assignment_id: str) -> str:
        """
        작업 시작. 증거 디렉토리 생성.

        Returns:
            증거 디렉토리 경로
        """
        safe_id = self._sanitize(assignment_id)
        job_dir = os.path.join(self.base_dir, safe_id)
        os.makedirs(job_dir, exist_ok=True)

        self._current_job = {
            "assignment_id": assignment_id,
            "dir": job_dir,
            "files": [],
            "start_time": time.time(),
        }
        self._sequence = 0

        logger.info("Evidence job started: %s → %s", assignment_id, job_dir)
        return job_dir

    def capture_screenshot(
        self, action_type: str = "screenshot"
    ) -> Optional[dict]:
        """
        스크린샷 캡처 (Appium 서버사이드).

        Args:
            action_type: 캡처 유형 (search, video_found, click, watch_start, etc.)

        Returns:
            파일 정보 dict 또는 None (실패/한도 초과)
        """
        if not self._current_job:
            logger.warning("No active job, cannot capture screenshot")
            return None

        if len(self._current_job["files"]) >= self.MAX_SCREENSHOTS_PER_JOB:
            logger.warning("Max screenshots reached (%d)", self.MAX_SCREENSHOTS_PER_JOB)
            return None

        filename = self._generate_filename(
            self._current_job["assignment_id"], action_type
        )
        filepath = os.path.join(self._current_job["dir"], filename)

        try:
            png_data = self.driver.get_screenshot_as_png()
            with open(filepath, "wb") as f:
                f.write(png_data)

            file_info = {
                "path": filepath,
                "filename": filename,
                "action_type": action_type,
                "timestamp": time.time(),
                "timestamp_formatted": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            }
            self._current_job["files"].append(file_info)

            logger.info("Screenshot captured: %s (%s)", action_type, filename)
            return file_info
        except Exception as e:
            logger.error("Failed to capture screenshot: %s", e)
            return None

    # Shortcut 메서드 (AutoX.js EvidenceManager 호환)
    def capture_on_search(self) -> Optional[dict]:
        return self.capture_screenshot("search")

    def capture_on_video_found(self) -> Optional[dict]:
        return self.capture_screenshot("video_found")

    def capture_on_click(self) -> Optional[dict]:
        return self.capture_screenshot("click")

    def capture_on_watch_start(self) -> Optional[dict]:
        return self.capture_screenshot("watch_start")

    def capture_on_watch_end(self) -> Optional[dict]:
        return self.capture_screenshot("watch_end")

    def capture_on_error(self, error_message: str) -> Optional[dict]:
        result = self.capture_screenshot("error")
        if self._current_job:
            # 에러 로그도 저장
            log_path = os.path.join(
                self._current_job["dir"],
                f"error_{int(time.time())}.txt",
            )
            try:
                with open(log_path, "w") as f:
                    f.write(f"[{datetime.now().isoformat()}] {error_message}\n")
            except Exception:
                pass
        return result

    def finish_job(self, job_result: dict) -> dict:
        """
        작업 종료. 결과 JSON 생성.

        Args:
            job_result: {success, search_success, watch_duration, error}

        Returns:
            완성된 결과 dict
        """
        if not self._current_job:
            return {"success": False, "error": "No active job"}

        now = time.time()
        result = {
            "assignment_id": self._current_job["assignment_id"],
            "success": job_result.get("success", False),
            "search_success": job_result.get("search_success", False),
            "watch_duration_sec": job_result.get("watch_duration", 0),
            "error": job_result.get("error"),
            "started_at": self._current_job["start_time"],
            "completed_at": now,
            "duration_ms": int((now - self._current_job["start_time"]) * 1000),
            "evidence_files": self._current_job["files"],
            "evidence_count": len(self._current_job["files"]),
            "evidence_dir": self._current_job["dir"],
        }

        # result.json 저장
        import json

        result_path = os.path.join(self._current_job["dir"], "result.json")
        try:
            with open(result_path, "w") as f:
                json.dump(result, f, indent=2, default=str)
        except Exception as e:
            logger.error("Failed to write result.json: %s", e)

        self._current_job = None
        logger.info(
            "Evidence job finished: %s (files=%d)",
            result["assignment_id"],
            result["evidence_count"],
        )
        return result

    def get_evidence_file_paths(self) -> list[str]:
        """현재 작업의 모든 증거 파일 경로."""
        if not self._current_job:
            return []
        return [f["path"] for f in self._current_job["files"]]

    def _generate_filename(self, job_id: str, action_type: str, ext: str = "png") -> str:
        """
        고유 파일명 생성 (AutoX.js Utils.generateUniqueFilename 호환).
        Format: YYYYMMDD_HHmmssSSS_SS_JobID_ActionType.ext
        """
        now = datetime.now()
        ts = now.strftime("%Y%m%d_%H%M%S") + f"{now.microsecond // 1000:03d}"

        # 밀리초 충돌 방지
        if ts == self._last_timestamp:
            self._sequence += 1
        else:
            self._sequence = 0
            self._last_timestamp = ts

        safe_job = self._sanitize(job_id)[:50]
        safe_action = self._sanitize(action_type)

        return f"{ts}_{self._sequence:02d}_{safe_job}_{safe_action}.{ext}"

    @staticmethod
    def _sanitize(text: str) -> str:
        """파일명 안전 문자열."""
        import re

        return re.sub(r'[\\/:*?"<>|]', "", text)[:50]

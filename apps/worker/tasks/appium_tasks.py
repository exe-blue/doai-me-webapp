"""
Appium YouTube 자동화 Celery 태스크

AutoX.js run_youtube_bot 대체.
Appium 세션 생성 → YouTube 봇 실행 → 결과 보고 → 세션 종료.
"""

import logging
import time
from typing import Optional

from celery import shared_task
from celery.utils.log import get_task_logger

from config import settings
from core.supabase_client import supabase

logger = get_task_logger(__name__)


def _get_session_manager():
    """SessionManager lazy import (Appium 의존성 격리)."""
    from appium_core.session_manager import get_session_manager

    return get_session_manager(
        appium_url=settings.appium_server_url,
        system_port_start=settings.appium_system_port_start,
        system_port_end=settings.appium_system_port_end,
        max_sessions=settings.appium_max_sessions,
    )


@shared_task(
    name="tasks.appium_tasks.run_youtube_appium",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    soft_time_limit=600,
    time_limit=660,
)
def run_youtube_appium(
    self,
    device_udid: str,
    assignment_id: str,
    target_url: Optional[str] = None,
    keyword: Optional[str] = None,
    video_title: Optional[str] = None,
    duration_sec: int = 180,
    duration_min_pct: int = 30,
    duration_max_pct: int = 90,
    prob_like: int = 0,
    prob_comment: int = 0,
    prob_subscribe: int = 0,
    comment_text: Optional[str] = None,
):
    """
    YouTube Appium 봇 실행 태스크.

    Args:
        device_udid: 디바이스 식별자 (ip:port 또는 serial)
        assignment_id: 작업 할당 ID
        target_url: YouTube 영상 URL (검색 대신 직접 이동)
        keyword: 검색 키워드
        video_title: 검색 결과에서 특정 제목 매칭
        duration_sec: 영상 길이 (초)
        duration_min_pct: 최소 시청 비율 (%)
        duration_max_pct: 최대 시청 비율 (%)
        prob_like: 좋아요 확률 (0-100)
        prob_comment: 댓글 확률 (0-100)
        prob_subscribe: 구독 확률 (0-100)
        comment_text: 댓글 텍스트 (None이면 랜덤)
    """
    from youtube.bot_orchestrator import YouTubeBotOrchestrator, JobParams
    from youtube.error_recovery import ErrorRecovery

    session_mgr = _get_session_manager()
    driver = None

    try:
        # 1. Appium 세션 생성
        self.update_state(state="STARTED", meta={"step": "session_create", "progress": 0})
        logger.info("Creating Appium session for %s", device_udid)
        driver = session_mgr.create_session(device_udid)

        # 2. 봇 실행
        self.update_state(state="STARTED", meta={"step": "bot_execute", "progress": 5})
        orchestrator = YouTubeBotOrchestrator(driver)

        params = JobParams(
            assignment_id=assignment_id,
            target_url=target_url,
            keyword=keyword,
            video_title=video_title,
            duration_sec=duration_sec,
            duration_min_pct=duration_min_pct,
            duration_max_pct=duration_max_pct,
            prob_like=prob_like,
            prob_comment=prob_comment,
            prob_subscribe=prob_subscribe,
            comment_text=comment_text,
        )

        def on_progress(pct: float, message: str):
            self.update_state(
                state="STARTED",
                meta={"step": "watching", "progress": int(pct), "message": message},
            )

        result = orchestrator.execute_job(params, on_progress=on_progress)

        # 3. Supabase 결과 보고
        _report_to_supabase(assignment_id, result)

        # 4. 결과 반환
        return {
            "success": result.success,
            "assignment_id": assignment_id,
            "device_udid": device_udid,
            "duration_sec": result.duration_sec,
            "did_like": result.did_like,
            "did_comment": result.did_comment,
            "did_subscribe": result.did_subscribe,
            "error_code": result.error_code,
            "error_message": result.error_message,
            "ad_stats": result.ad_stats,
            "evidence_count": result.evidence.get("evidence_count", 0) if result.evidence else 0,
        }

    except Exception as exc:
        logger.error("Appium task failed: device=%s, error=%s", device_udid, exc)

        # Supabase 실패 보고
        try:
            _report_failure_to_supabase(assignment_id, str(exc))
        except Exception:
            pass

        # 재시도 (WebDriverException은 세션 재생성 필요 → 재시도)
        from selenium.common.exceptions import WebDriverException

        if isinstance(exc, WebDriverException) and self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)

        raise

    finally:
        # 세션 종료 (항상 실행)
        if driver:
            try:
                session_mgr.close_session(device_udid)
            except Exception as e:
                logger.warning("Failed to close session: %s", e)


@shared_task(
    name="tasks.appium_tasks.stop_appium_session",
    soft_time_limit=30,
    time_limit=60,
)
def stop_appium_session(device_udid: str):
    """
    Appium 세션 강제 종료.
    """
    session_mgr = _get_session_manager()
    session_mgr.close_session(device_udid)
    logger.info("Session closed for %s", device_udid)
    return {"success": True, "device_udid": device_udid}


@shared_task(
    name="tasks.appium_tasks.appium_health_check",
    soft_time_limit=15,
    time_limit=30,
)
def appium_health_check():
    """
    Appium 서버 + 세션 풀 상태 확인.
    """
    session_mgr = _get_session_manager()
    health = session_mgr.health_check()
    logger.info("Appium health: %s", health)
    return health


def _report_to_supabase(assignment_id: str, result) -> None:
    """작업 결과를 Supabase에 보고."""
    try:
        if result.success:
            supabase.update_task_status(
                assignment_id,
                status="completed",
                progress=100,
                result={
                    "duration_sec": result.duration_sec,
                    "did_like": result.did_like,
                    "did_comment": result.did_comment,
                    "did_subscribe": result.did_subscribe,
                    "ad_stats": result.ad_stats,
                },
            )
        else:
            supabase.update_task_status(
                assignment_id,
                status="failed",
                error=result.error_message,
                result={
                    "error_code": result.error_code,
                    "duration_sec": result.duration_sec,
                },
            )
    except Exception as e:
        logger.warning("Failed to report to Supabase: %s", e)


def _report_failure_to_supabase(assignment_id: str, error_msg: str) -> None:
    """실패 결과를 Supabase에 보고."""
    try:
        supabase.update_task_status(
            assignment_id,
            status="failed",
            error=error_msg,
        )
    except Exception as e:
        logger.warning("Failed to report failure to Supabase: %s", e)

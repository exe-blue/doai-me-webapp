"""
Appium 세션 모니터링 API 라우터

Appium 서버 상태 + 세션 풀 메트릭을 동기적으로 반환.
Dashboard Workers 페이지 폴링용.
"""
import logging
import os

import httpx
from fastapi import APIRouter

from core.celery_client import celery_app

router = APIRouter(prefix="/api/appium", tags=["Appium"])
logger = logging.getLogger(__name__)

APPIUM_URL = os.getenv("APPIUM_URL", "http://localhost:4723")


@router.get("/metrics")
async def get_appium_metrics():
    """
    Appium 서버 상태 + 세션 풀 메트릭.

    1. Appium 서버 /status 직접 조회 (httpx)
    2. Celery worker에 health_check 태스크 발송 → 세션 데이터 수집

    Dashboard 5초 폴링에서 호출.
    """
    # 1. Appium 서버 직접 상태 조회
    appium_ready = False
    appium_error = None

    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{APPIUM_URL}/status")
            data = resp.json()
            appium_ready = data.get("value", {}).get("ready", False)
    except Exception as e:
        appium_error = str(e)
        logger.debug("Appium server unreachable: %s", e)

    # 2. Celery worker에서 세션 메트릭 가져오기
    session_metrics = {
        "active_sessions": 0,
        "max_sessions": 10,
        "available_ports": 101,
        "used_ports": {},
        "active_devices": [],
    }

    try:
        result = celery_app.send_task(
            "tasks.appium_tasks.appium_health_check",
            queue="pc01",
        )
        # 짧은 타임아웃으로 대기 (3초)
        worker_health = result.get(timeout=3)
        if isinstance(worker_health, dict):
            session_metrics.update({
                "active_sessions": worker_health.get("active_sessions", 0),
                "available_ports": worker_health.get("available_ports", 101),
            })
            # health_check()는 used_ports/active_devices를 안 줌
            # → get_metrics() 결과는 Celery에서 직접 못 가져옴
            # appium_ready도 worker에서 확인한 값 사용 가능
            if not appium_ready and worker_health.get("appium_ready"):
                appium_ready = True
    except Exception as e:
        logger.debug("Celery health check failed (worker offline?): %s", e)

    return {
        "appium_ready": appium_ready,
        "appium_error": appium_error,
        "active_sessions": session_metrics["active_sessions"],
        "max_sessions": session_metrics["max_sessions"],
        "available_ports": session_metrics["available_ports"],
        "used_ports": session_metrics["used_ports"],
        "active_devices": session_metrics["active_devices"],
    }


@router.get("/health")
async def get_appium_health():
    """
    간단한 Appium 서버 헬스체크.

    Appium /status 엔드포인트만 조회 (빠름).
    """
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{APPIUM_URL}/status")
            data = resp.json()
            ready = data.get("value", {}).get("ready", False)
            return {
                "appium_ready": ready,
                "appium_url": APPIUM_URL,
            }
    except Exception as e:
        return {
            "appium_ready": False,
            "appium_url": APPIUM_URL,
            "error": str(e),
        }

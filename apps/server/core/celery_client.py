"""
Celery 클라이언트 (태스크 발송용)
"""
from typing import Any, Optional
from celery import Celery

from .config import settings


# Celery 앱 (클라이언트 모드)
celery_app = Celery(
    "doai_server",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    # 결과 만료
    result_expires=3600,
)


def send_task(
    task_name: str,
    args: tuple = (),
    kwargs: Optional[dict] = None,
    queue: Optional[str] = None,
    **options: Any,
) -> str:
    """
    Celery 태스크 발송
    
    Args:
        task_name: 태스크 이름 (예: "tasks.device_tasks.scan_devices")
        args: 위치 인자
        kwargs: 키워드 인자
        queue: 대상 큐 (예: "pc01")
        **options: Celery 옵션
    
    Returns:
        task_id: Celery 태스크 ID
    """
    kwargs = kwargs or {}
    
    task_options = {
        "queue": queue,
        **options,
    }
    
    result = celery_app.send_task(
        task_name,
        args=args,
        kwargs=kwargs,
        **task_options,
    )
    
    return result.id


def get_task_result(task_id: str, timeout: float = 5.0) -> Any:
    """
    태스크 결과 조회
    
    Args:
        task_id: Celery 태스크 ID
        timeout: 대기 시간 (초)
    
    Returns:
        태스크 결과 또는 None
    """
    result = celery_app.AsyncResult(task_id)
    
    if result.ready():
        return result.get(timeout=timeout)
    
    return None


def get_task_status(task_id: str) -> dict:
    """
    태스크 상태 조회
    
    Args:
        task_id: Celery 태스크 ID
    
    Returns:
        상태 정보 딕셔너리
    """
    result = celery_app.AsyncResult(task_id)
    
    return {
        "task_id": task_id,
        "status": result.status,
        "ready": result.ready(),
        "successful": result.successful() if result.ready() else None,
        "result": result.result if result.ready() else None,
    }

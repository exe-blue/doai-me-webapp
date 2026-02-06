"""
Celery Application 설정
미니PC에서 실행되는 Worker 앱
"""
from celery import Celery
from kombu import Queue

from config import settings


# Celery 앱 생성
app = Celery(
    "doai_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "tasks.device_tasks",
        "tasks.install_tasks",
        "tasks.youtube_tasks",
        "tasks.appium_tasks",
    ],
)

# Celery 설정
app.conf.update(
    # Broker 설정
    broker_connection_retry_on_startup=True,
    
    # Result 설정
    result_expires=86400,  # 24시간 후 결과 삭제
    result_extended=True,
    
    # Task 설정
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    
    # 재시도 설정
    task_acks_late=True,  # 작업 완료 후 ACK
    task_reject_on_worker_lost=True,
    task_time_limit=settings.task_time_limit,
    task_soft_time_limit=settings.task_soft_time_limit,
    
    # Worker 설정
    worker_prefetch_multiplier=1,  # 한 번에 하나씩 처리
    worker_concurrency=settings.max_concurrent_adb,
    
    # 큐 설정 (PC별 라우팅)
    task_queues=[
        Queue("default", routing_key="default"),
        Queue(settings.worker_queue, routing_key=settings.worker_queue),
    ],
    task_default_queue="default",
    
    # 태스크 라우팅
    task_routes={
        "tasks.device_tasks.*": {"queue": settings.worker_queue},
        "tasks.install_tasks.*": {"queue": settings.worker_queue},
        "tasks.youtube_tasks.*": {"queue": settings.worker_queue},
        "tasks.appium_tasks.*": {"queue": settings.worker_queue},
    },
)

# Beat 스케줄 (선택적 - Beat 컨테이너에서 실행)
app.conf.beat_schedule = {
    # 5분마다 헬스체크
    "health-check-every-5-minutes": {
        "task": "tasks.device_tasks.batch_health_check",
        "schedule": 300.0,  # 5분
        "args": (),
        "options": {"queue": settings.worker_queue},
    },
    # 1시간마다 로그 수집
    "collect-logs-hourly": {
        "task": "tasks.device_tasks.collect_logs",
        "schedule": 3600.0,  # 1시간
        "args": (),
        "options": {"queue": settings.worker_queue},
    },
    # 10분마다 Appium 헬스체크
    "appium-health-check-every-10-minutes": {
        "task": "tasks.appium_tasks.appium_health_check",
        "schedule": 600.0,  # 10분
        "args": (),
        "options": {"queue": settings.worker_queue},
    },
}


if __name__ == "__main__":
    app.start()

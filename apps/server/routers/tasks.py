"""
작업(Task) 관리 API 라우터
"""
from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from models.task import (
    TaskResponse,
    TaskListResponse,
    TaskStatus,
    TaskFilter,
    InstallRequest,
    BatchInstallRequest,
    HealthCheckRequest,
    BatchHealthCheckRequest,
    RunBotRequest,
    BatchRunBotRequest,
    ScanDevicesRequest,
    RunAppiumBotRequest,
    StopAppiumSessionRequest,
)
from services.task_service import task_service
from services.device_service import device_service
from services.pc_service import pc_service

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    task_name: Optional[str] = None,
    device_id: Optional[UUID] = None,
    pc_id: Optional[UUID] = None,
    status: Optional[TaskStatus] = None,
    queue_name: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
):
    """
    작업 목록 조회
    
    필터:
    - **task_name**: 작업 유형
    - **device_id**: 디바이스 UUID
    - **pc_id**: PC UUID
    - **status**: 작업 상태
    - **queue_name**: 큐 이름
    - **created_after/before**: 생성 시간 범위
    """
    filters = TaskFilter(
        task_name=task_name,
        device_id=device_id,
        pc_id=pc_id,
        status=status,
        queue_name=queue_name.lower() if queue_name else None,
        created_after=created_after,
        created_before=created_before,
    )
    
    items, total = task_service.list_tasks(page, page_size, filters)
    
    return TaskListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats")
async def get_task_stats():
    """
    작업 통계
    
    상태별 작업 수
    """
    return task_service.get_stats()


@router.get("/recent")
async def get_recent_tasks(limit: int = Query(default=20, ge=1, le=100)):
    """
    최근 작업 목록
    """
    tasks = task_service.get_recent_tasks(limit)
    return {"items": tasks, "total": len(tasks)}


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID):
    """
    작업 상세 조회
    """
    task = task_service.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task


@router.get("/{task_id}/celery-status")
async def get_celery_status(task_id: UUID):
    """
    Celery 작업 상태 조회
    
    Redis에서 실시간 상태 확인
    """
    task = task_service.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    celery_status = task_service.get_celery_status(task["celery_task_id"])
    
    return {
        "task_id": str(task_id),
        "celery_task_id": task["celery_task_id"],
        "db_status": task["status"],
        "celery_status": celery_status,
    }


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(task_id: UUID):
    """
    작업 취소
    
    실행 중인 작업을 취소합니다.
    """
    task = task_service.cancel_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task


# === 작업 발송 엔드포인트 ===

@router.post("/install")
async def create_install_task(data: InstallRequest):
    """
    APK 설치 작업 생성
    
    단일 디바이스에 APK를 설치합니다.
    """
    device = device_service.get_device(data.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")
    
    queue = device["pc_number"].lower()
    
    task = task_service.dispatch_install_apk(
        device_id=data.device_id,
        serial=device["serial_number"],
        apk_name=data.apk_name,
        queue=queue,
    )
    
    return {
        "message": "Install task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/batch-install")
async def create_batch_install_task(data: BatchInstallRequest):
    """
    배치 APK 설치 작업 생성
    
    PC의 모든 디바이스에 APK를 설치합니다.
    """
    if not data.pc_id:
        raise HTTPException(status_code=400, detail="pc_id is required for batch install")
    
    pc = pc_service.get_pc(data.pc_id)
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    
    queue = pc["pc_number"].lower()
    
    task = task_service.dispatch_batch_install(
        apk_name=data.apk_name,
        pc_id=data.pc_id,
        queue=queue,
    )
    
    return {
        "message": "Batch install task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/health-check")
async def create_health_check_task(data: HealthCheckRequest):
    """
    단일 디바이스 헬스체크 작업 생성
    """
    device = device_service.get_device(data.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")
    
    queue = device["pc_number"].lower()
    
    task = task_service.dispatch_health_check(
        device_id=data.device_id,
        serial=device["serial_number"],
        queue=queue,
    )
    
    return {
        "message": "Health check task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/batch-health-check")
async def create_batch_health_check_task(data: BatchHealthCheckRequest):
    """
    PC 전체 헬스체크 작업 생성
    """
    pc = pc_service.get_pc(data.pc_id)
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    
    task = task_service.dispatch_batch_health_check(
        pc_number=pc["pc_number"],
        pc_id=data.pc_id,
    )
    
    return {
        "message": "Batch health check task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/scan-devices")
async def create_scan_devices_task(data: ScanDevicesRequest):
    """
    디바이스 스캔 작업 생성
    
    PC에 연결된 ADB 디바이스를 스캔하고 DB에 등록합니다.
    """
    pc = pc_service.get_pc_by_number(data.pc_number.upper())
    if not pc:
        raise HTTPException(status_code=404, detail=f"PC {data.pc_number} not found")
    
    task = task_service.dispatch_scan_devices(data.pc_number.upper())
    
    return {
        "message": "Scan devices task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/run-bot")
async def create_run_bot_task(data: RunBotRequest):
    """
    YouTube 봇 실행 작업 생성
    """
    device = device_service.get_device(data.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")
    
    if device.get("status") != "online":
        raise HTTPException(status_code=400, detail="Device is not online")
    
    queue = device["pc_number"].lower()
    
    task = task_service.dispatch_run_bot(
        device_id=data.device_id,
        serial=device["serial_number"],
        script_name=data.script_name,
        params=data.params,
        queue=queue,
    )
    
    return {
        "message": "Run bot task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/stop-bot")
async def create_stop_bot_task(device_id: UUID):
    """
    봇 중지 작업 생성
    """
    device = device_service.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")

    queue = device["pc_number"].lower()

    task = task_service.dispatch_stop_bot(
        device_id=device_id,
        serial=device["serial_number"],
        queue=queue,
    )

    return {
        "message": "Stop bot task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


# === Appium 작업 엔드포인트 ===

@router.post("/run-appium-bot")
async def create_run_appium_bot_task(data: RunAppiumBotRequest):
    """
    Appium YouTube 봇 실행 작업 생성

    AutoX.js 대체. Appium UIAutomator2를 사용하여 YouTube 자동화.
    """
    device = device_service.get_device(data.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")

    if device.get("status") != "online":
        raise HTTPException(status_code=400, detail="Device is not online")

    # 디바이스 UDID 결정 (ip:port 우선, fallback to serial)
    device_udid = device.get("serial_number", "")
    ip_addr = device.get("ip_address")
    if ip_addr:
        adb_port = device.get("adb_port", 5555)
        device_udid = f"{ip_addr}:{adb_port}"

    queue = device["pc_number"].lower()

    params = {
        "target_url": data.target_url,
        "keyword": data.keyword,
        "video_title": data.video_title,
        "duration_sec": data.duration_sec,
        "duration_min_pct": data.duration_min_pct,
        "duration_max_pct": data.duration_max_pct,
        "prob_like": data.prob_like,
        "prob_comment": data.prob_comment,
        "prob_subscribe": data.prob_subscribe,
        "comment_text": data.comment_text,
    }

    task = task_service.dispatch_run_appium_bot(
        device_id=data.device_id,
        device_udid=device_udid,
        assignment_id=data.assignment_id,
        params=params,
        queue=queue,
    )

    return {
        "message": "Appium bot task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/stop-appium-session")
async def create_stop_appium_session_task(data: StopAppiumSessionRequest):
    """
    Appium 세션 강제 종료
    """
    device = device_service.get_device(data.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not device.get("pc_number"):
        raise HTTPException(status_code=400, detail="Device is not assigned to any PC")

    device_udid = device.get("serial_number", "")
    ip_addr = device.get("ip_address")
    if ip_addr:
        adb_port = device.get("adb_port", 5555)
        device_udid = f"{ip_addr}:{adb_port}"

    queue = device["pc_number"].lower()

    task = task_service.dispatch_stop_appium_session(
        device_id=data.device_id,
        device_udid=device_udid,
        queue=queue,
    )

    return {
        "message": "Stop Appium session task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.post("/appium-health-check")
async def create_appium_health_check_task(pc_number: str = "PC01"):
    """
    Appium 서버 헬스체크

    Appium 서버 상태 + 활성 세션 수 + 가용 포트 수 확인.
    """
    pc = pc_service.get_pc_by_number(pc_number.upper())
    if not pc:
        raise HTTPException(status_code=404, detail=f"PC {pc_number} not found")

    queue = pc_number.lower()

    task = task_service.dispatch_appium_health_check(queue=queue)

    return {
        "message": "Appium health check task created",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }

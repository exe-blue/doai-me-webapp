"""
작업(Task) 모델 정의
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Any, Dict
from uuid import UUID

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """작업 상태"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


class TaskCreate(BaseModel):
    """작업 생성 (내부용)"""
    celery_task_id: str
    task_name: str
    queue_name: Optional[str] = None
    device_id: Optional[UUID] = None
    pc_id: Optional[UUID] = None
    payload: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    """작업 응답"""
    id: UUID
    celery_task_id: str
    task_name: str
    queue_name: Optional[str] = None
    device_id: Optional[UUID] = None
    pc_id: Optional[UUID] = None
    status: TaskStatus = TaskStatus.PENDING
    payload: Optional[Dict[str, Any]] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retries: int = 0
    progress: int = Field(default=0, ge=0, le=100)
    progress_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    
    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """작업 목록 응답"""
    items: List[TaskResponse]
    total: int
    page: int = 1
    page_size: int = 50


class TaskFilter(BaseModel):
    """작업 필터"""
    task_name: Optional[str] = None
    device_id: Optional[UUID] = None
    pc_id: Optional[UUID] = None
    status: Optional[TaskStatus] = None
    queue_name: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None


# === 작업 요청 모델 ===

class InstallRequest(BaseModel):
    """APK 설치 요청"""
    device_id: UUID
    apk_name: str = Field(..., description="APK 파일명 (예: autox.js.apk)")


class BatchInstallRequest(BaseModel):
    """배치 APK 설치 요청"""
    apk_name: str
    pc_id: Optional[UUID] = None
    device_ids: Optional[List[UUID]] = None  # 없으면 PC 전체


class HealthCheckRequest(BaseModel):
    """헬스체크 요청"""
    device_id: UUID


class BatchHealthCheckRequest(BaseModel):
    """배치 헬스체크 요청"""
    pc_id: UUID


class RunBotRequest(BaseModel):
    """봇 실행 요청"""
    device_id: UUID
    script_name: str = "youtube_bot.js"
    params: Optional[Dict[str, Any]] = None


class BatchRunBotRequest(BaseModel):
    """배치 봇 실행 요청"""
    script_name: str = "youtube_bot.js"
    pc_id: Optional[UUID] = None
    device_ids: Optional[List[UUID]] = None
    params: Optional[Dict[str, Any]] = None


class ScanDevicesRequest(BaseModel):
    """디바이스 스캔 요청"""
    pc_number: str = Field(..., pattern=r"^PC\d{2}$")


# === Appium 작업 요청 모델 ===

class RunAppiumBotRequest(BaseModel):
    """Appium YouTube 봇 실행 요청"""
    device_id: UUID
    assignment_id: str = Field(..., description="작업 할당 ID")
    target_url: Optional[str] = Field(None, description="YouTube 영상 URL")
    keyword: Optional[str] = Field(None, description="검색 키워드")
    video_title: Optional[str] = Field(None, description="영상 제목 (검색 매칭)")
    duration_sec: int = Field(default=180, description="영상 길이 (초)")
    duration_min_pct: int = Field(default=30, ge=0, le=100, description="최소 시청 비율")
    duration_max_pct: int = Field(default=90, ge=0, le=100, description="최대 시청 비율")
    prob_like: int = Field(default=0, ge=0, le=100, description="좋아요 확률")
    prob_comment: int = Field(default=0, ge=0, le=100, description="댓글 확률")
    prob_subscribe: int = Field(default=0, ge=0, le=100, description="구독 확률")
    comment_text: Optional[str] = None


class StopAppiumSessionRequest(BaseModel):
    """Appium 세션 종료 요청"""
    device_id: UUID

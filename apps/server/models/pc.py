"""
PC 모델 정의
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, IPvAnyAddress


class PCStatus(str, Enum):
    """PC 상태"""
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"


class PCBase(BaseModel):
    """PC 기본 필드"""
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    label: Optional[str] = None
    location: Optional[str] = None
    max_devices: int = Field(default=20, ge=1, le=100)


class PCCreate(PCBase):
    """PC 생성 요청"""
    pass


class PCUpdate(BaseModel):
    """PC 수정 요청"""
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    label: Optional[str] = None
    location: Optional[str] = None
    max_devices: Optional[int] = Field(default=None, ge=1, le=100)
    status: Optional[PCStatus] = None


class PCResponse(PCBase):
    """PC 응답"""
    id: UUID
    pc_number: str
    status: PCStatus = PCStatus.OFFLINE
    last_heartbeat: Optional[datetime] = None
    device_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PCListResponse(BaseModel):
    """PC 목록 응답"""
    items: List[PCResponse]
    total: int
    page: int = 1
    page_size: int = 20


class PCWithDevices(PCResponse):
    """PC 상세 (디바이스 포함)"""
    devices: List["DeviceResponse"] = []


# Forward reference 해결
from .device import DeviceResponse
PCWithDevices.model_rebuild()

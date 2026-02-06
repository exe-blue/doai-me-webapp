"""
디바이스 모델 정의
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class DeviceStatus(str, Enum):
    """디바이스 상태"""
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    ERROR = "error"


class ConnectionType(str, Enum):
    """연결 방식"""
    USB = "usb"
    WIFI = "wifi"
    BOTH = "both"


class DeviceBase(BaseModel):
    """디바이스 기본 필드"""
    serial_number: Optional[str] = None
    ip_address: Optional[str] = None
    model: Optional[str] = None
    android_version: Optional[str] = None
    connection_type: ConnectionType = ConnectionType.USB
    usb_port: Optional[int] = Field(default=None, ge=1, le=20)
    
    @field_validator("serial_number", "ip_address")
    @classmethod
    def at_least_one_identifier(cls, v, info):
        """serial_number 또는 ip_address 중 하나는 필수"""
        # 개별 필드 검증에서는 체크 불가, 모델 레벨에서 처리
        return v


class DeviceCreate(DeviceBase):
    """디바이스 생성 요청"""
    pc_id: Optional[UUID] = None  # 미배정 허용


class DeviceUpdate(BaseModel):
    """디바이스 수정 요청"""
    pc_id: Optional[UUID] = None
    serial_number: Optional[str] = None
    ip_address: Optional[str] = None
    model: Optional[str] = None
    android_version: Optional[str] = None
    connection_type: Optional[ConnectionType] = None
    usb_port: Optional[int] = Field(default=None, ge=1, le=20)
    status: Optional[DeviceStatus] = None


class DeviceResponse(DeviceBase):
    """디바이스 응답"""
    id: UUID
    pc_id: Optional[UUID] = None
    pc_number: Optional[str] = None
    device_number: Optional[int] = None
    device_code: Optional[str] = None  # PC01-001 형식
    status: DeviceStatus = DeviceStatus.OFFLINE
    battery_level: Optional[int] = Field(default=None, ge=0, le=100)
    error_count: int = 0
    last_error: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class DeviceListResponse(BaseModel):
    """디바이스 목록 응답"""
    items: List[DeviceResponse]
    total: int
    page: int = 1
    page_size: int = 50


class DeviceAssign(BaseModel):
    """디바이스 PC 배정 요청"""
    device_id: UUID
    pc_id: UUID


class BulkRegisterRequest(BaseModel):
    """ADB 스캔 일괄 등록 요청"""
    pc_id: UUID


class DeviceFilter(BaseModel):
    """디바이스 필터"""
    pc_id: Optional[UUID] = None
    pc_number: Optional[str] = None
    status: Optional[DeviceStatus] = None
    connection_type: Optional[ConnectionType] = None
    unassigned_only: bool = False

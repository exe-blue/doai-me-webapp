"""
디바이스 관리 API 라우터
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from models.device import (
    DeviceCreate,
    DeviceUpdate,
    DeviceResponse,
    DeviceListResponse,
    DeviceStatus,
    ConnectionType,
    DeviceAssign,
    BulkRegisterRequest,
    DeviceFilter,
)
from services.device_service import device_service
from services.task_service import task_service
from services.pc_service import pc_service

router = APIRouter(prefix="/api/devices", tags=["Devices"])


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    pc_id: Optional[UUID] = None,
    pc_number: Optional[str] = None,
    status: Optional[DeviceStatus] = None,
    connection_type: Optional[ConnectionType] = None,
    unassigned_only: bool = False,
):
    """
    디바이스 목록 조회
    
    필터:
    - **pc_id**: PC UUID
    - **pc_number**: PC 번호 (예: PC01)
    - **status**: 상태 (online/offline/busy/error)
    - **connection_type**: 연결 방식 (usb/wifi/both)
    - **unassigned_only**: 미배정 디바이스만
    """
    filters = DeviceFilter(
        pc_id=pc_id,
        pc_number=pc_number.upper() if pc_number else None,
        status=status,
        connection_type=connection_type,
        unassigned_only=unassigned_only,
    )
    
    items, total = device_service.list_devices(page, page_size, filters)
    
    return DeviceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=DeviceResponse, status_code=201)
async def create_device(data: DeviceCreate):
    """
    디바이스 등록
    
    serial_number 또는 ip_address 중 하나는 필수
    """
    if not data.serial_number and not data.ip_address:
        raise HTTPException(
            status_code=400,
            detail="serial_number 또는 ip_address 중 하나는 필수입니다",
        )
    
    try:
        device = device_service.create_device(data)
        return device
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/by-code/{code}", response_model=DeviceResponse)
async def get_device_by_code(code: str):
    """
    관리번호로 디바이스 조회
    
    - **code**: 관리번호 (예: PC01-001)
    """
    device = device_service.get_device_by_code(code.upper())
    
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {code} not found")
    
    return device


@router.get("/by-serial/{serial}", response_model=DeviceResponse)
async def get_device_by_serial(serial: str):
    """
    시리얼 번호로 디바이스 조회
    
    - **serial**: ADB 시리얼 (예: R58M41XXXXX)
    """
    device = device_service.get_device_by_serial(serial)
    
    if not device:
        raise HTTPException(status_code=404, detail=f"Device with serial {serial} not found")
    
    return device


@router.get("/by-ip/{ip}", response_model=DeviceResponse)
async def get_device_by_ip(ip: str):
    """
    IP 주소로 디바이스 조회
    
    - **ip**: WiFi ADB IP (예: 192.168.1.101)
    """
    device = device_service.get_device_by_ip(ip)
    
    if not device:
        raise HTTPException(status_code=404, detail=f"Device with IP {ip} not found")
    
    return device


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: UUID):
    """
    디바이스 상세 조회
    """
    device = device_service.get_device(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return device


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(device_id: UUID, data: DeviceUpdate):
    """
    디바이스 정보 수정
    """
    device = device_service.update_device(device_id, data)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return device


@router.delete("/{device_id}", status_code=204)
async def delete_device(device_id: UUID):
    """
    디바이스 삭제
    """
    success = device_service.delete_device(device_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")


@router.post("/assign", response_model=DeviceResponse)
async def assign_device(data: DeviceAssign):
    """
    디바이스를 PC에 배정
    
    device_number는 자동 할당됩니다
    """
    device = device_service.assign_to_pc(data.device_id, data.pc_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return device


@router.post("/{device_id}/unassign", response_model=DeviceResponse)
async def unassign_device(device_id: UUID):
    """
    디바이스 PC 배정 해제
    """
    device = device_service.unassign_from_pc(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return device


@router.post("/bulk-register")
async def bulk_register_devices(data: BulkRegisterRequest):
    """
    ADB 스캔으로 디바이스 일괄 등록
    
    PC에 연결된 모든 디바이스를 스캔하여 등록합니다.
    이 작업은 비동기로 처리되며 작업 ID가 반환됩니다.
    """
    # PC 정보 조회
    pc = pc_service.get_pc(data.pc_id)
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    
    # 스캔 작업 발송
    task = task_service.dispatch_scan_devices(pc["pc_number"])
    
    return {
        "message": "Scan task dispatched",
        "task_id": task["id"],
        "celery_task_id": task["celery_task_id"],
    }


@router.get("/online/list")
async def list_online_devices(pc_id: Optional[UUID] = None):
    """
    온라인 디바이스 목록
    
    봇 실행 대상 선택용
    """
    devices = device_service.get_online_devices(pc_id)
    
    return {
        "items": devices,
        "total": len(devices),
    }

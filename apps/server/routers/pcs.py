"""
PC 관리 API 라우터
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from models.pc import (
    PCCreate,
    PCUpdate,
    PCResponse,
    PCListResponse,
    PCStatus,
)
from services.pc_service import pc_service

router = APIRouter(prefix="/api/pcs", tags=["PCs"])


@router.get("", response_model=PCListResponse)
async def list_pcs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[PCStatus] = None,
):
    """
    PC 목록 조회
    
    - **page**: 페이지 번호 (1부터 시작)
    - **page_size**: 페이지당 항목 수
    - **status**: 상태 필터 (online/offline/error)
    """
    items, total = pc_service.list_pcs(page, page_size, status)
    
    return PCListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=PCResponse, status_code=201)
async def create_pc(data: PCCreate):
    """
    PC 등록
    
    pc_number는 서버에서 자동 할당됩니다 (PC01, PC02, ...)
    """
    try:
        pc = pc_service.create_pc(data)
        return pc
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/summary")
async def get_pc_summary():
    """
    PC 현황 요약
    
    전체/온라인/오프라인 PC 수 및 디바이스 수
    """
    return pc_service.get_summary()


@router.get("/{pc_number}", response_model=PCResponse)
async def get_pc(pc_number: str):
    """
    PC 상세 조회 (디바이스 목록 포함)
    
    - **pc_number**: PC 번호 (예: PC01)
    """
    pc = pc_service.get_pc_with_devices(pc_number.upper())
    
    if not pc:
        raise HTTPException(status_code=404, detail=f"PC {pc_number} not found")
    
    return pc


@router.patch("/{pc_id}", response_model=PCResponse)
async def update_pc(pc_id: UUID, data: PCUpdate):
    """
    PC 정보 수정
    
    - **pc_id**: PC UUID
    """
    pc = pc_service.update_pc(pc_id, data)
    
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    
    return pc


@router.delete("/{pc_id}", status_code=204)
async def delete_pc(pc_id: UUID):
    """
    PC 삭제
    
    연결된 디바이스가 있으면 삭제 불가
    """
    try:
        success = pc_service.delete_pc(pc_id)
        if not success:
            raise HTTPException(status_code=404, detail="PC not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pc_number}/heartbeat")
async def update_heartbeat(pc_number: str):
    """
    PC 하트비트 업데이트
    
    Worker가 주기적으로 호출하여 온라인 상태 유지
    """
    pc = pc_service.update_heartbeat(pc_number.upper())
    
    if not pc:
        raise HTTPException(status_code=404, detail=f"PC {pc_number} not found")
    
    return {"message": "Heartbeat updated", "pc_number": pc_number}

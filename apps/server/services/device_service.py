"""
디바이스 서비스
"""
from typing import Optional, List
from uuid import UUID
import logging

from core.database import supabase_client
from models.device import (
    DeviceCreate, 
    DeviceUpdate, 
    DeviceResponse, 
    DeviceStatus,
    ConnectionType,
    DeviceFilter,
)

logger = logging.getLogger(__name__)


class DeviceService:
    """디바이스 관리 서비스"""
    
    def __init__(self):
        self.db = supabase_client
        self.table = "devices"
    
    def list_devices(
        self,
        page: int = 1,
        page_size: int = 50,
        filters: Optional[DeviceFilter] = None,
    ) -> tuple[List[dict], int]:
        """
        디바이스 목록 조회
        
        Returns:
            (items, total)
        """
        # device_overview 뷰 사용 (pc_number, device_code 포함)
        query = self.db.table("device_overview").select("*", count="exact")
        
        if filters:
            if filters.pc_id:
                query = query.eq("pc_id", str(filters.pc_id))
            if filters.pc_number:
                query = query.eq("pc_number", filters.pc_number)
            if filters.status:
                query = query.eq("status", filters.status.value)
            if filters.connection_type:
                query = query.eq("connection_type", filters.connection_type.value)
            if filters.unassigned_only:
                query = query.is_("pc_id", "null")
        
        # 정렬 및 페이지네이션
        offset = (page - 1) * page_size
        query = query.order("pc_number", nullsfirst=False).order("device_number").range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        return result.data, result.count or 0
    
    def get_device(self, device_id: UUID) -> Optional[dict]:
        """디바이스 ID로 조회"""
        result = self.db.table("device_overview").select("*").eq("id", str(device_id)).single().execute()
        return result.data
    
    def get_device_by_serial(self, serial: str) -> Optional[dict]:
        """시리얼 번호로 조회"""
        result = self.db.table("device_overview").select("*").eq("serial_number", serial).single().execute()
        return result.data
    
    def get_device_by_code(self, code: str) -> Optional[dict]:
        """
        관리번호(device_code)로 조회
        예: PC01-001
        """
        result = self.db.table("device_overview").select("*").eq("device_code", code).single().execute()
        return result.data
    
    def get_device_by_ip(self, ip: str) -> Optional[dict]:
        """IP로 조회"""
        result = self.db.table("device_overview").select("*").eq("ip_address", ip).single().execute()
        return result.data
    
    def create_device(self, data: DeviceCreate) -> dict:
        """
        디바이스 생성
        device_number는 DB 트리거에서 자동 생성
        """
        insert_data = data.model_dump(exclude_none=True)
        
        # UUID를 문자열로 변환
        if "pc_id" in insert_data and insert_data["pc_id"]:
            insert_data["pc_id"] = str(insert_data["pc_id"])
        
        result = self.db.table(self.table).insert(insert_data).execute()
        
        if not result.data:
            raise ValueError("디바이스 생성 실패")
        
        return result.data[0]
    
    def update_device(self, device_id: UUID, data: DeviceUpdate) -> Optional[dict]:
        """디바이스 정보 수정"""
        update_data = data.model_dump(exclude_none=True)
        
        if not update_data:
            return self.get_device(device_id)
        
        # UUID를 문자열로 변환
        if "pc_id" in update_data and update_data["pc_id"]:
            update_data["pc_id"] = str(update_data["pc_id"])
        
        update_data["updated_at"] = "now()"
        
        result = self.db.table(self.table).update(update_data).eq("id", str(device_id)).execute()
        
        return result.data[0] if result.data else None
    
    def delete_device(self, device_id: UUID) -> bool:
        """디바이스 삭제"""
        result = self.db.table(self.table).delete().eq("id", str(device_id)).execute()
        return len(result.data) > 0
    
    def assign_to_pc(self, device_id: UUID, pc_id: UUID) -> Optional[dict]:
        """디바이스를 PC에 배정"""
        result = self.db.table(self.table).update({
            "pc_id": str(pc_id),
            "updated_at": "now()",
        }).eq("id", str(device_id)).execute()
        
        return result.data[0] if result.data else None
    
    def unassign_from_pc(self, device_id: UUID) -> Optional[dict]:
        """디바이스 PC 배정 해제"""
        result = self.db.table(self.table).update({
            "pc_id": None,
            "device_number": None,
            "updated_at": "now()",
        }).eq("id", str(device_id)).execute()
        
        return result.data[0] if result.data else None
    
    def update_status(
        self,
        device_id: UUID,
        status: DeviceStatus,
        battery_level: Optional[int] = None,
        error: Optional[str] = None,
    ) -> Optional[dict]:
        """디바이스 상태 업데이트"""
        update_data = {
            "status": status.value,
            "updated_at": "now()",
            "last_seen": "now()",
        }
        
        if battery_level is not None:
            update_data["battery_level"] = battery_level
        
        if error:
            update_data["last_error"] = error
            # 에러 카운트 증가는 별도 RPC 사용 권장
        
        result = self.db.table(self.table).update(update_data).eq("id", str(device_id)).execute()
        
        return result.data[0] if result.data else None
    
    def upsert_device(self, data: dict) -> dict:
        """
        디바이스 upsert (serial_number 기준)
        """
        # serial_number가 있으면 기존 레코드 찾기
        serial = data.get("serial_number")
        if serial:
            existing = self.get_device_by_serial(serial)
            if existing:
                # 업데이트
                update_data = {k: v for k, v in data.items() if v is not None and k != "serial_number"}
                return self.update_device(existing["id"], DeviceUpdate(**update_data)) or existing
        
        # 새로 생성
        return self.create_device(DeviceCreate(**data))
    
    def get_devices_by_pc(self, pc_id: UUID) -> List[dict]:
        """PC에 연결된 디바이스 목록"""
        result = self.db.table("device_overview").select("*").eq("pc_id", str(pc_id)).order("device_number").execute()
        return result.data or []
    
    def get_online_devices(self, pc_id: Optional[UUID] = None) -> List[dict]:
        """온라인 디바이스 목록"""
        query = self.db.table("device_overview").select("*").eq("status", "online")
        
        if pc_id:
            query = query.eq("pc_id", str(pc_id))
        
        result = query.order("pc_number", nullsfirst=False).order("device_number").execute()
        return result.data or []


# 싱글톤 인스턴스
device_service = DeviceService()

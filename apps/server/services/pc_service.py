"""
PC 서비스
"""
from typing import Optional, List
from uuid import UUID
import logging

from core.database import supabase_client
from models.pc import PCCreate, PCUpdate, PCResponse, PCStatus

logger = logging.getLogger(__name__)


class PCService:
    """PC 관리 서비스"""
    
    def __init__(self):
        self.db = supabase_client
        self.table = "pcs"
    
    def list_pcs(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[PCStatus] = None,
    ) -> tuple[List[dict], int]:
        """
        PC 목록 조회
        
        Returns:
            (items, total)
        """
        query = self.db.table(self.table).select("*", count="exact")
        
        if status:
            query = query.eq("status", status.value)
        
        # 정렬 및 페이지네이션
        offset = (page - 1) * page_size
        query = query.order("pc_number").range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        return result.data, result.count or 0
    
    def get_pc(self, pc_id: UUID) -> Optional[dict]:
        """PC ID로 조회"""
        result = self.db.table(self.table).select("*").eq("id", str(pc_id)).single().execute()
        return result.data
    
    def get_pc_by_number(self, pc_number: str) -> Optional[dict]:
        """PC 번호로 조회"""
        result = self.db.table(self.table).select("*").eq("pc_number", pc_number).single().execute()
        return result.data
    
    def create_pc(self, data: PCCreate) -> dict:
        """
        PC 생성 (번호 자동 할당)
        """
        insert_data = data.model_dump(exclude_none=True)
        
        # pc_number는 DB 트리거에서 자동 생성
        result = self.db.table(self.table).insert(insert_data).execute()
        
        if not result.data:
            raise ValueError("PC 생성 실패")
        
        return result.data[0]
    
    def update_pc(self, pc_id: UUID, data: PCUpdate) -> Optional[dict]:
        """PC 정보 수정"""
        update_data = data.model_dump(exclude_none=True)
        
        if not update_data:
            return self.get_pc(pc_id)
        
        update_data["updated_at"] = "now()"
        
        result = self.db.table(self.table).update(update_data).eq("id", str(pc_id)).execute()
        
        return result.data[0] if result.data else None
    
    def delete_pc(self, pc_id: UUID) -> bool:
        """PC 삭제"""
        # 연결된 디바이스 확인
        devices = self.db.table("devices").select("id").eq("pc_id", str(pc_id)).execute()
        
        if devices.data:
            raise ValueError(f"{len(devices.data)}개의 디바이스가 연결되어 있습니다. 먼저 디바이스를 제거하세요.")
        
        result = self.db.table(self.table).delete().eq("id", str(pc_id)).execute()
        return len(result.data) > 0
    
    def update_heartbeat(self, pc_number: str) -> Optional[dict]:
        """PC 하트비트 업데이트"""
        result = self.db.table(self.table).update({
            "last_heartbeat": "now()",
            "status": "online",
        }).eq("pc_number", pc_number).execute()
        
        return result.data[0] if result.data else None
    
    def get_pc_with_devices(self, pc_number: str) -> Optional[dict]:
        """PC 상세 정보 (디바이스 목록 포함)"""
        pc = self.get_pc_by_number(pc_number)
        
        if not pc:
            return None
        
        # 디바이스 목록 조회
        devices = self.db.table("devices").select("*").eq("pc_id", pc["id"]).order("device_number").execute()
        
        pc["devices"] = devices.data or []
        pc["device_count"] = len(pc["devices"])
        
        return pc
    
    def get_summary(self) -> dict:
        """PC 현황 요약"""
        result = self.db.table("pc_summary").select("*").execute()
        
        if not result.data:
            return {
                "total_pcs": 0,
                "online_pcs": 0,
                "offline_pcs": 0,
                "total_devices": 0,
            }
        
        summary = result.data[0] if result.data else {}
        return {
            "total_pcs": summary.get("total_pcs", 0),
            "online_pcs": summary.get("online_pcs", 0),
            "offline_pcs": summary.get("total_pcs", 0) - summary.get("online_pcs", 0),
            "total_devices": summary.get("total_devices", 0),
        }


# 싱글톤 인스턴스
pc_service = PCService()

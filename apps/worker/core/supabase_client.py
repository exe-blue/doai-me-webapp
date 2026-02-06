"""
Supabase 클라이언트
작업 상태 및 디바이스 정보 동기화
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

from supabase import create_client, Client

from config import settings

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Supabase 데이터베이스 클라이언트"""
    
    def __init__(self):
        self._client: Optional[Client] = None
    
    @property
    def client(self) -> Client:
        """Supabase 클라이언트 (지연 초기화)"""
        if self._client is None:
            self._client = create_client(
                settings.supabase_url,
                settings.supabase_key,
            )
        return self._client
    
    # ==========================================
    # PC 관련
    # ==========================================
    
    def get_pc_by_number(self, pc_number: str) -> Optional[Dict[str, Any]]:
        """PC 번호로 조회"""
        try:
            response = self.client.table("pcs").select("*").eq("pc_number", pc_number).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Failed to get PC {pc_number}: {e}")
            return None
    
    def update_pc_heartbeat(self, pc_number: str) -> bool:
        """PC 하트비트 업데이트"""
        try:
            self.client.table("pcs").update({
                "status": "online",
                "last_heartbeat": datetime.utcnow().isoformat(),
            }).eq("pc_number", pc_number).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update PC heartbeat: {e}")
            return False
    
    # ==========================================
    # 디바이스 관련
    # ==========================================
    
    def get_devices_by_pc(self, pc_id: str) -> List[Dict[str, Any]]:
        """PC에 연결된 디바이스 목록"""
        try:
            response = self.client.table("devices").select("*").eq("pc_id", pc_id).execute()
            return response.data or []
        except Exception as e:
            logger.error(f"Failed to get devices for PC {pc_id}: {e}")
            return []
    
    def get_device_by_serial(self, serial: str) -> Optional[Dict[str, Any]]:
        """시리얼로 디바이스 조회"""
        try:
            response = self.client.table("devices").select("*").eq("serial_number", serial).single().execute()
            return response.data
        except Exception as e:
            logger.debug(f"Device not found by serial {serial}: {e}")
            return None
    
    def upsert_device(self, device_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """디바이스 생성/업데이트"""
        try:
            response = self.client.table("devices").upsert(
                device_data,
                on_conflict="serial_number",
            ).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Failed to upsert device: {e}")
            return None
    
    def update_device_status(
        self,
        device_id: str,
        status: str,
        battery_level: Optional[int] = None,
        error: Optional[str] = None,
    ) -> bool:
        """디바이스 상태 업데이트"""
        try:
            update_data: Dict[str, Any] = {
                "status": status,
                "last_heartbeat": datetime.utcnow().isoformat(),
            }
            
            if battery_level is not None:
                update_data["battery_level"] = battery_level
            
            if error:
                update_data["last_error"] = error
                update_data["last_error_at"] = datetime.utcnow().isoformat()
                update_data["error_count"] = self.client.rpc(
                    "increment_column",
                    {"table_name": "devices", "column_name": "error_count", "row_id": device_id}
                )
            
            self.client.table("devices").update(update_data).eq("id", device_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update device status: {e}")
            return False
    
    # ==========================================
    # 작업(Task) 관련
    # ==========================================
    
    def create_task(
        self,
        task_name: str,
        celery_task_id: Optional[str] = None,
        device_id: Optional[str] = None,
        pc_id: Optional[str] = None,
        queue_name: Optional[str] = None,
        payload: Optional[Dict] = None,
    ) -> Optional[str]:
        """작업 생성"""
        try:
            response = self.client.table("tasks").insert({
                "task_name": task_name,
                "celery_task_id": celery_task_id,
                "device_id": device_id,
                "pc_id": pc_id,
                "queue_name": queue_name or settings.worker_queue,
                "payload": payload or {},
                "status": "pending",
            }).execute()
            
            if response.data:
                return response.data[0]["id"]
            return None
        except Exception as e:
            logger.error(f"Failed to create task: {e}")
            return None
    
    def update_task_status(
        self,
        task_id: str,
        status: str,
        result: Optional[Dict] = None,
        error: Optional[str] = None,
        progress: Optional[int] = None,
        progress_message: Optional[str] = None,
    ) -> bool:
        """작업 상태 업데이트"""
        try:
            update_data: Dict[str, Any] = {"status": status}
            
            if result is not None:
                update_data["result"] = result
            if error is not None:
                update_data["error"] = error
            if progress is not None:
                update_data["progress"] = progress
            if progress_message is not None:
                update_data["progress_message"] = progress_message
            
            # 상태별 타임스탬프
            if status == "running":
                update_data["started_at"] = datetime.utcnow().isoformat()
            elif status in ("success", "failed", "cancelled"):
                update_data["completed_at"] = datetime.utcnow().isoformat()
            
            self.client.table("tasks").update(update_data).eq("id", task_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update task status: {e}")
            return False
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """작업 조회"""
        try:
            response = self.client.table("tasks").select("*").eq("id", task_id).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Failed to get task {task_id}: {e}")
            return None
    
    def increment_task_retry(self, task_id: str) -> int:
        """재시도 카운트 증가"""
        try:
            response = self.client.rpc("increment_task_retry", {"p_task_id": task_id}).execute()
            return response.data if response.data else 0
        except Exception as e:
            logger.error(f"Failed to increment retry: {e}")
            return 0


# 싱글톤 인스턴스
supabase = SupabaseClient()

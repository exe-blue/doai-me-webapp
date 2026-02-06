"""
작업(Task) 서비스
"""
from typing import Optional, List, Any, Dict
from uuid import UUID
from datetime import datetime
import logging

from core.database import supabase_client
from core.celery_client import send_task, get_task_status, get_task_result
from models.task import TaskCreate, TaskStatus, TaskFilter

logger = logging.getLogger(__name__)


class TaskService:
    """작업 관리 서비스"""
    
    def __init__(self):
        self.db = supabase_client
        self.table = "tasks"
    
    def list_tasks(
        self,
        page: int = 1,
        page_size: int = 50,
        filters: Optional[TaskFilter] = None,
    ) -> tuple[List[dict], int]:
        """
        작업 목록 조회
        
        Returns:
            (items, total)
        """
        query = self.db.table(self.table).select("*", count="exact")
        
        if filters:
            if filters.task_name:
                query = query.eq("task_name", filters.task_name)
            if filters.device_id:
                query = query.eq("device_id", str(filters.device_id))
            if filters.pc_id:
                query = query.eq("pc_id", str(filters.pc_id))
            if filters.status:
                query = query.eq("status", filters.status.value)
            if filters.queue_name:
                query = query.eq("queue_name", filters.queue_name)
            if filters.created_after:
                query = query.gte("created_at", filters.created_after.isoformat())
            if filters.created_before:
                query = query.lte("created_at", filters.created_before.isoformat())
        
        # 최신순 정렬 및 페이지네이션
        offset = (page - 1) * page_size
        query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)
        
        result = query.execute()
        
        return result.data, result.count or 0
    
    def get_task(self, task_id: UUID) -> Optional[dict]:
        """작업 ID로 조회"""
        result = self.db.table(self.table).select("*").eq("id", str(task_id)).single().execute()
        return result.data
    
    def get_task_by_celery_id(self, celery_task_id: str) -> Optional[dict]:
        """Celery 작업 ID로 조회"""
        result = self.db.table(self.table).select("*").eq("celery_task_id", celery_task_id).single().execute()
        return result.data
    
    def create_task(self, data: TaskCreate) -> dict:
        """작업 레코드 생성"""
        insert_data = data.model_dump(exclude_none=True)
        
        # UUID를 문자열로 변환
        if "device_id" in insert_data and insert_data["device_id"]:
            insert_data["device_id"] = str(insert_data["device_id"])
        if "pc_id" in insert_data and insert_data["pc_id"]:
            insert_data["pc_id"] = str(insert_data["pc_id"])
        
        result = self.db.table(self.table).insert(insert_data).execute()
        
        if not result.data:
            raise ValueError("작업 생성 실패")
        
        return result.data[0]
    
    def update_task_status(
        self,
        task_id: UUID,
        status: TaskStatus,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        progress: Optional[int] = None,
        progress_message: Optional[str] = None,
    ) -> Optional[dict]:
        """작업 상태 업데이트"""
        update_data = {
            "status": status.value,
            "updated_at": "now()",
        }
        
        if status == TaskStatus.RUNNING:
            update_data["started_at"] = "now()"
        elif status in (TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.CANCELLED):
            update_data["completed_at"] = "now()"
        
        if result is not None:
            update_data["result"] = result
        if error is not None:
            update_data["error"] = error
        if progress is not None:
            update_data["progress"] = progress
        if progress_message is not None:
            update_data["progress_message"] = progress_message
        
        db_result = self.db.table(self.table).update(update_data).eq("id", str(task_id)).execute()
        
        return db_result.data[0] if db_result.data else None
    
    def increment_retry(self, task_id: UUID) -> Optional[dict]:
        """재시도 횟수 증가"""
        # RPC 함수 사용 (atomic operation)
        result = self.db.rpc("increment_task_retry", {"p_task_id": str(task_id)}).execute()
        return result.data
    
    # === Celery 작업 발송 ===
    
    def dispatch_scan_devices(self, pc_number: str) -> dict:
        """디바이스 스캔 작업 발송"""
        queue = pc_number.lower()  # PC01 -> pc01
        
        celery_task_id = send_task(
            "tasks.device_tasks.scan_devices",
            queue=queue,
        )
        
        # DB에 작업 기록
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="scan_devices",
            queue_name=queue,
            payload={"pc_number": pc_number},
        ))
        
        return task
    
    def dispatch_health_check(
        self,
        device_id: UUID,
        serial: str,
        queue: str,
    ) -> dict:
        """단일 디바이스 헬스체크 발송"""
        celery_task_id = send_task(
            "tasks.device_tasks.health_check",
            args=(str(device_id), serial),
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="health_check",
            queue_name=queue,
            device_id=device_id,
            payload={"serial": serial},
        ))
        
        return task
    
    def dispatch_batch_health_check(self, pc_number: str, pc_id: UUID) -> dict:
        """PC 전체 헬스체크 발송"""
        queue = pc_number.lower()
        
        celery_task_id = send_task(
            "tasks.device_tasks.batch_health_check",
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="batch_health_check",
            queue_name=queue,
            pc_id=pc_id,
            payload={"pc_number": pc_number},
        ))
        
        return task
    
    def dispatch_install_apk(
        self,
        device_id: UUID,
        serial: str,
        apk_name: str,
        queue: str,
    ) -> dict:
        """APK 설치 작업 발송"""
        celery_task_id = send_task(
            "tasks.install_tasks.install_apk",
            args=(serial, apk_name),
            kwargs={"device_id": str(device_id)},
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="install_apk",
            queue_name=queue,
            device_id=device_id,
            payload={"apk_name": apk_name, "serial": serial},
        ))
        
        # task_id를 Celery에 전달 (상태 업데이트용)
        # TODO: 더 나은 방식 검토
        
        return task
    
    def dispatch_batch_install(
        self,
        apk_name: str,
        pc_id: UUID,
        queue: str,
    ) -> dict:
        """배치 APK 설치 발송"""
        celery_task_id = send_task(
            "tasks.install_tasks.batch_install",
            args=(apk_name,),
            kwargs={"pc_id": str(pc_id)},
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="batch_install",
            queue_name=queue,
            pc_id=pc_id,
            payload={"apk_name": apk_name},
        ))
        
        return task
    
    def dispatch_run_bot(
        self,
        device_id: UUID,
        serial: str,
        script_name: str,
        params: Optional[Dict[str, Any]],
        queue: str,
    ) -> dict:
        """YouTube 봇 실행 발송"""
        celery_task_id = send_task(
            "tasks.youtube_tasks.run_youtube_bot",
            args=(serial, script_name, params),
            kwargs={"device_id": str(device_id)},
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="run_youtube_bot",
            queue_name=queue,
            device_id=device_id,
            payload={
                "script_name": script_name,
                "params": params,
                "serial": serial,
            },
        ))
        
        return task
    
    def dispatch_stop_bot(
        self,
        device_id: UUID,
        serial: str,
        queue: str,
    ) -> dict:
        """봇 중지 발송"""
        celery_task_id = send_task(
            "tasks.youtube_tasks.stop_bot",
            args=(serial,),
            kwargs={"device_id": str(device_id)},
            queue=queue,
        )
        
        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="stop_bot",
            queue_name=queue,
            device_id=device_id,
            payload={"serial": serial},
        ))
        
        return task
    
    # === Appium 작업 발송 ===

    def dispatch_run_appium_bot(
        self,
        device_id: UUID,
        device_udid: str,
        assignment_id: str,
        params: Dict[str, Any],
        queue: str,
    ) -> dict:
        """Appium YouTube 봇 실행 발송"""
        celery_task_id = send_task(
            "tasks.appium_tasks.run_youtube_appium",
            kwargs={
                "device_udid": device_udid,
                "assignment_id": assignment_id,
                **params,
            },
            queue=queue,
        )

        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="run_youtube_appium",
            queue_name=queue,
            device_id=device_id,
            payload={"assignment_id": assignment_id, "device_udid": device_udid, **params},
        ))

        return task

    def dispatch_stop_appium_session(
        self,
        device_id: UUID,
        device_udid: str,
        queue: str,
    ) -> dict:
        """Appium 세션 종료 발송"""
        celery_task_id = send_task(
            "tasks.appium_tasks.stop_appium_session",
            kwargs={"device_udid": device_udid},
            queue=queue,
        )

        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="stop_appium_session",
            queue_name=queue,
            device_id=device_id,
            payload={"device_udid": device_udid},
        ))

        return task

    def dispatch_appium_health_check(self, queue: str) -> dict:
        """Appium 헬스체크 발송"""
        celery_task_id = send_task(
            "tasks.appium_tasks.appium_health_check",
            queue=queue,
        )

        task = self.create_task(TaskCreate(
            celery_task_id=celery_task_id,
            task_name="appium_health_check",
            queue_name=queue,
        ))

        return task

    def get_celery_status(self, celery_task_id: str) -> dict:
        """Celery 작업 상태 조회"""
        return get_task_status(celery_task_id)
    
    def cancel_task(self, task_id: UUID) -> Optional[dict]:
        """작업 취소"""
        task = self.get_task(task_id)
        if not task:
            return None
        
        # Celery 작업 취소 시도
        from core.celery_client import celery_app
        celery_app.control.revoke(task["celery_task_id"], terminate=True)
        
        # DB 상태 업데이트
        return self.update_task_status(task_id, TaskStatus.CANCELLED)
    
    def get_stats(self) -> dict:
        """작업 통계"""
        result = self.db.table("task_stats").select("*").execute()
        
        if not result.data:
            return {
                "total": 0,
                "pending": 0,
                "running": 0,
                "success": 0,
                "failed": 0,
            }
        
        return result.data[0]
    
    def get_recent_tasks(self, limit: int = 20) -> List[dict]:
        """최근 작업 목록"""
        result = self.db.table("recent_tasks").select("*").limit(limit).execute()
        return result.data or []


# 싱글톤 인스턴스
task_service = TaskService()

"""
헬스체크 API 라우터
"""
from fastapi import APIRouter

from core.config import settings
from core.database import supabase_client
from core.celery_client import celery_app
from services.pc_service import pc_service
from services.task_service import task_service

router = APIRouter(prefix="/api/health", tags=["Health"])


@router.get("")
async def health_check():
    """
    기본 헬스체크
    
    서버 상태 확인용
    """
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
    }


@router.get("/status")
async def system_status():
    """
    전체 시스템 상태
    
    DB, Redis, Worker 상태 포함
    """
    status = {
        "api": "healthy",
        "database": "unknown",
        "celery_broker": "unknown",
        "workers": [],
    }
    
    # 1. Database 체크
    try:
        result = supabase_client.table("pcs").select("id").limit(1).execute()
        status["database"] = "healthy"
    except Exception as e:
        status["database"] = f"error: {str(e)}"
    
    # 2. Celery Broker (Redis) 체크
    try:
        inspect = celery_app.control.inspect()
        ping_result = inspect.ping()
        
        if ping_result:
            status["celery_broker"] = "healthy"
            
            # 3. Worker 상태
            active_queues = inspect.active_queues() or {}
            for worker_name, queues in active_queues.items():
                queue_names = [q["name"] for q in queues]
                status["workers"].append({
                    "name": worker_name,
                    "queues": queue_names,
                    "status": "online",
                })
        else:
            status["celery_broker"] = "no workers connected"
            
    except Exception as e:
        status["celery_broker"] = f"error: {str(e)}"
    
    # 4. PC/디바이스 요약
    try:
        pc_summary = pc_service.get_summary()
        status["pcs"] = pc_summary
    except Exception:
        status["pcs"] = {"error": "failed to get summary"}
    
    # 5. 작업 통계
    try:
        task_stats = task_service.get_stats()
        status["tasks"] = task_stats
    except Exception:
        status["tasks"] = {"error": "failed to get stats"}
    
    # 전체 상태 판단
    if status["database"] == "healthy" and status["celery_broker"] == "healthy":
        status["overall"] = "healthy"
    elif status["database"] != "healthy":
        status["overall"] = "degraded"
    else:
        status["overall"] = "degraded"
    
    return status


@router.get("/ready")
async def readiness_check():
    """
    준비 상태 체크 (Kubernetes readiness probe용)
    """
    # DB 연결 확인
    try:
        supabase_client.table("pcs").select("id").limit(1).execute()
    except Exception:
        return {"ready": False, "reason": "database not available"}
    
    return {"ready": True}


@router.get("/live")
async def liveness_check():
    """
    생존 상태 체크 (Kubernetes liveness probe용)
    """
    return {"alive": True}


@router.get("/workers")
async def list_workers():
    """
    Celery Worker 목록
    """
    try:
        inspect = celery_app.control.inspect()
        
        ping_result = inspect.ping() or {}
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        stats = inspect.stats() or {}
        
        workers = []
        
        for worker_name in ping_result.keys():
            worker_stats = stats.get(worker_name, {})
            
            workers.append({
                "name": worker_name,
                "status": "online",
                "active_tasks": len(active.get(worker_name, [])),
                "reserved_tasks": len(reserved.get(worker_name, [])),
                "pool": worker_stats.get("pool", {}),
                "broker": worker_stats.get("broker", {}),
            })
        
        return {
            "workers": workers,
            "total": len(workers),
        }
        
    except Exception as e:
        return {
            "workers": [],
            "total": 0,
            "error": str(e),
        }


@router.get("/queues")
async def list_queues():
    """
    Celery 큐 목록 및 상태
    """
    try:
        inspect = celery_app.control.inspect()
        
        active_queues = inspect.active_queues() or {}
        
        queues = {}
        
        for worker_name, worker_queues in active_queues.items():
            for q in worker_queues:
                queue_name = q["name"]
                if queue_name not in queues:
                    queues[queue_name] = {
                        "name": queue_name,
                        "workers": [],
                    }
                queues[queue_name]["workers"].append(worker_name)
        
        return {
            "queues": list(queues.values()),
            "total": len(queues),
        }
        
    except Exception as e:
        return {
            "queues": [],
            "total": 0,
            "error": str(e),
        }

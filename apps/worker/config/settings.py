"""
Celery Worker 설정
환경변수 기반 설정 관리
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Worker 설정"""
    
    # PC 식별
    pc_number: str = Field(default="PC01", description="할당된 PC 번호 (예: PC01)")
    worker_queue: str = Field(default="pc01", description="Celery 큐 이름")
    
    # Celery
    celery_broker_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis Broker URL"
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/1", 
        description="Redis Result Backend URL"
    )
    
    # Supabase
    supabase_url: str = Field(..., description="Supabase URL")
    supabase_key: str = Field(..., description="Supabase Service Role Key")
    
    # ADB
    adb_path: str = Field(default="adb", description="ADB 실행 파일 경로")
    adb_timeout: int = Field(default=30, description="ADB 명령 타임아웃 (초)")
    max_concurrent_adb: int = Field(default=5, description="동시 ADB 명령 최대 수")
    
    # APK 저장소
    apk_directory: str = Field(default="/opt/doai/apk", description="APK 파일 저장 경로")
    
    # 작업 설정
    task_time_limit: int = Field(default=300, description="작업 타임아웃 (초)")
    task_soft_time_limit: int = Field(default=270, description="소프트 타임아웃 (초)")
    max_retries: int = Field(default=3, description="최대 재시도 횟수")
    retry_delay: int = Field(default=60, description="재시도 간격 (초)")
    
    # Appium
    appium_server_url: str = Field(
        default="http://localhost:4723",
        description="Appium 서버 URL"
    )
    appium_max_sessions: int = Field(default=10, description="최대 동시 Appium 세션 수")
    appium_system_port_start: int = Field(default=8200, description="UIAutomator2 systemPort 시작")
    appium_system_port_end: int = Field(default=8300, description="UIAutomator2 systemPort 끝")
    appium_new_command_timeout: int = Field(default=300, description="Appium 유휴 타임아웃 (초)")

    # 로깅
    log_level: str = Field(default="INFO", description="로그 레벨")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """설정 싱글톤 반환"""
    return Settings()


# 전역 설정 객체
settings = get_settings()

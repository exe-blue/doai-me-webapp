"""
FastAPI 서버 설정
"""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """애플리케이션 설정"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    # 서버
    app_name: str = "DOAI Device Farm API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "https://doai.me"]
    
    # Supabase
    supabase_url: str
    supabase_key: str  # service role key
    
    # Celery / Redis
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    
    # API Keys (옵션)
    api_key: Optional[str] = None
    
    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds


@lru_cache
def get_settings() -> Settings:
    """설정 싱글톤"""
    return Settings()


settings = get_settings()

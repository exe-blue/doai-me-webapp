"""
Supabase 데이터베이스 클라이언트
"""
from functools import lru_cache

from supabase import create_client, Client

from .config import settings


@lru_cache
def get_supabase() -> Client:
    """Supabase 클라이언트 싱글톤"""
    return create_client(settings.supabase_url, settings.supabase_key)


# 전역 클라이언트 인스턴스
supabase_client = get_supabase()

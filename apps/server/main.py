"""
DOAI Device Farm API Server
FastAPI 메인 애플리케이션
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from routers import pcs_router, devices_router, tasks_router, health_router, appium_router

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 생명주기 관리"""
    # 시작
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Debug mode: {settings.debug}")
    
    yield
    
    # 종료
    logger.info("Shutting down...")


# FastAPI 앱 생성
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    ## DOAI Device Farm API
    
    Galaxy S9 디바이스 팜 관리를 위한 REST API
    
    ### 주요 기능
    - **PC 관리**: 미니PC 등록, 상태 모니터링
    - **디바이스 관리**: Galaxy S9 등록, 배정, 상태 관리
    - **작업 관리**: APK 설치, 헬스체크, YouTube 봇 실행
    
    ### 인증
    현재 버전은 API Key 인증을 지원합니다.
    """,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 글로벌 예외 핸들러
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# 라우터 등록
app.include_router(health_router)
app.include_router(pcs_router)
app.include_router(devices_router)
app.include_router(tasks_router)
app.include_router(appium_router)


# 루트 엔드포인트
@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs" if settings.debug else "disabled",
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

# Celery Worker Dockerfile
FROM python:3.11-slim

# 환경변수
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 작업 디렉토리
WORKDIR /app

# 시스템 의존성 (ADB 포함)
RUN apt-get update && apt-get install -y --no-install-recommends \
    adb \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드
COPY . .

# 비root 사용자 (보안)
RUN useradd --create-home --shell /bin/bash celery_user
USER celery_user

# 기본 명령 (Worker 실행)
# 실제 실행 시 -Q 옵션으로 큐 지정: celery -A celery_app worker -Q pc01 -c 5
CMD ["celery", "-A", "celery_app", "worker", "--loglevel=info"]

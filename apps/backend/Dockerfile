# ===========================================
# DoAi.Me Backend - Node.js Socket.io Server
# ===========================================
FROM node:20-alpine

# 작업 디렉토리 설정
WORKDIR /app

# curl 설치 (healthcheck용)
RUN apk add --no-cache curl

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 4000

# 환경 변수 기본값
ENV NODE_ENV=production
ENV PORT=4000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# 실행
CMD ["node", "socketio-server.js"]

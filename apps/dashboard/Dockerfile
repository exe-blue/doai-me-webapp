# ===========================================
# DoAi.Me Frontend - Next.js Dashboard
# Monorepo 호환: 루트 컨텍스트에서 빌드
# 사용법: docker build -f apps/dashboard/Dockerfile .
# ===========================================

# Stage 1: 빌드 단계
FROM node:20-alpine AS builder

WORKDIR /app

# 모노레포 루트 package files
COPY package.json package-lock.json ./

# 워크스페이스 package.json 복사 (file: 의존성 해결)
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# 의존성 설치 (workspace mode)
RUN npm install --workspace=apps/dashboard --include-workspace-root

# 로컬 패키지 소스 복사 (빌드에 필요)
COPY packages/shared/ ./packages/shared/
COPY packages/ui/ ./packages/ui/

# 대시보드 소스 복사
COPY apps/dashboard/ ./apps/dashboard/

# 빌드 시 필요한 환경 변수 (빌드 타임)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Next.js 빌드
WORKDIR /app/apps/dashboard
RUN npm run build

# Stage 2: 프로덕션 단계
FROM node:20-alpine AS runner

WORKDIR /app

# 프로덕션 환경 설정
ENV NODE_ENV=production
ENV PORT=3000

# curl 설치 (healthcheck용)
RUN apk add --no-cache curl

# 비루트 사용자 생성
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 빌드 결과물 복사
COPY --from=builder /app/apps/dashboard/public ./public
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./.next/static

# 소유권 변경
RUN chown -R nextjs:nodejs /app

# 비루트 사용자로 전환
USER nextjs

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# 실행
CMD ["node", "apps/dashboard/server.js"]

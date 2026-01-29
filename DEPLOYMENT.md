# DoAi.Me 서버 배포 가이드

## 🎯 개요

이 가이드는 Vultr 서버에 DoAi.Me 플랫폼을 Docker로 배포하는 방법을 설명합니다.

**구성 요소:**
- **Frontend**: Next.js 대시보드 (포트 3000)
- **Backend**: Node.js Socket.io 서버 (포트 4000)
- **Nginx**: 리버스 프록시 + SSL (포트 80/443)

---

## 1️⃣ Vultr 서버 준비

### 1.1 인스턴스 생성

1. [Vultr](https://www.vultr.com/) 로그인
2. **Deploy New Server** 클릭
3. 설정:
   - **Type**: Cloud Compute (Shared CPU)
   - **Location**: Tokyo (또는 Seoul)
   - **OS**: Ubuntu 22.04 LTS
   - **Plan**: 최소 $12/month (2 vCPU, 2GB RAM)
   - **SSH Keys**: 본인 SSH 키 등록

### 1.2 SSH 접속

```bash
ssh root@YOUR_SERVER_IP
```

---

## 2️⃣ 서버 초기 설정

### 2.1 시스템 업데이트

```bash
apt update && apt upgrade -y
```

### 2.2 Docker 설치

```bash
# Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker Compose 설치
apt install docker-compose-plugin -y

# Docker 서비스 시작
systemctl enable docker
systemctl start docker

# 설치 확인
docker --version
docker compose version
```

### 2.3 방화벽 설정

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## 3️⃣ 프로젝트 배포

### 3.1 소스 코드 클론

```bash
cd /opt
git clone https://github.com/exe-blue/doai-me-webapp.git
cd doai-me-webapp
```

### 3.2 환경 변수 설정

```bash
# .env 파일 생성
cat > .env << 'EOF'
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# URLs (도메인에 맞게 수정)
NEXT_PUBLIC_API_URL=https://doai.me/api
NEXT_PUBLIC_SOCKET_URL=https://doai.me
CORS_ORIGIN=https://doai.me
EOF
```

### 3.3 SSL 인증서 발급 (Let's Encrypt)

```bash
# Certbot 설치
apt install certbot -y

# 인증서 발급 (도메인을 본인 것으로 변경)
certbot certonly --standalone -d doai.me -d www.doai.me

# 인증서 복사
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/doai.me/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/doai.me/privkey.pem nginx/ssl/
```

### 3.4 Docker 빌드 및 실행

```bash
# 빌드 및 실행
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 상태 확인
docker compose ps
```

---

## 4️⃣ 도메인 설정

### DNS 레코드 설정

도메인 관리자에서 다음 레코드 추가:

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_SERVER_IP |
| A | www | YOUR_SERVER_IP |

---

## 5️⃣ 유지보수 명령어

### 서비스 관리

```bash
# 전체 서비스 상태 확인
docker compose ps

# 서비스 재시작
docker compose restart

# 서비스 중지
docker compose down

# 로그 확인
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

### 업데이트 배포

```bash
cd /opt/doai-me-webapp

# 최신 코드 가져오기
git pull origin main

# 재빌드 및 재시작
docker compose up -d --build

# 오래된 이미지 정리
docker image prune -f
```

### SSL 인증서 갱신

```bash
# 인증서 갱신 (자동 cron 등록 권장)
certbot renew

# 갱신 후 인증서 복사
cp /etc/letsencrypt/live/doai.me/fullchain.pem /opt/doai-me-webapp/nginx/ssl/
cp /etc/letsencrypt/live/doai.me/privkey.pem /opt/doai-me-webapp/nginx/ssl/

# Nginx 재시작
docker compose restart nginx
```

### 자동 갱신 설정 (cron)

```bash
crontab -e

# 매월 1일 자동 갱신
0 0 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/doai.me/*.pem /opt/doai-me-webapp/nginx/ssl/ && cd /opt/doai-me-webapp && docker compose restart nginx
```

---

## 6️⃣ 트러블슈팅

### 컨테이너가 시작되지 않을 때

```bash
# 상세 로그 확인
docker compose logs --tail=100 backend

# 컨테이너 내부 접속
docker compose exec backend sh
```

### 포트 충돌

```bash
# 사용 중인 포트 확인
netstat -tlnp | grep -E '80|443|3000|4000'

# 해당 프로세스 종료
kill -9 <PID>
```

### 메모리 부족

```bash
# 메모리 확인
free -h

# Docker 메모리 정리
docker system prune -a
```

---

## 7️⃣ 보안 권장사항

1. **SSH 키 인증만 사용** (패스워드 비활성화)
2. **정기적인 시스템 업데이트**
3. **Fail2ban 설치** (무차별 대입 공격 방지)
4. **환경 변수 파일 권한 제한** (`chmod 600 .env`)

---

## 📞 문의

배포 관련 문의: [GitHub Issues](https://github.com/exe-blue/doai-me-webapp/issues)

/**
 * Socket.io JWT Authentication Middleware
 *
 * Supabase JWT 토큰을 검증하여 Socket.io 연결을 보호합니다.
 * - Dashboard: Supabase Auth JWT (ANON_KEY로 발급된 토큰)
 * - Worker: 서버 토큰 (환경변수로 설정)
 */

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 환경 확인
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Supabase JWT Secret (프로젝트 설정에서 가져옴)
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Worker 인증용 토큰 (서버 간 통신) - 프로덕션에서는 필수
let WORKER_SECRET_TOKEN = process.env.WORKER_SECRET_TOKEN;

// Generate a secure random token for development if not set
// This is stored at module level so it persists for the process lifetime
let generatedDevToken = null;

// 환경 변수 검증
if (!SUPABASE_JWT_SECRET) {
  console.warn('[Auth] WARNING: SUPABASE_JWT_SECRET not set. JWT verification will fail.');
}

// WORKER_SECRET_TOKEN 필수 검증 (프로덕션 환경)
if (!WORKER_SECRET_TOKEN && IS_PRODUCTION) {
  console.error('[Auth] CRITICAL: WORKER_SECRET_TOKEN is required in production!');
  console.error('[Auth] Set WORKER_SECRET_TOKEN environment variable and restart.');
  process.exit(1);
}

if (!WORKER_SECRET_TOKEN) {
  // Generate a secure random token for development instead of using a predictable default
  generatedDevToken = crypto.randomBytes(32).toString('hex');
  WORKER_SECRET_TOKEN = generatedDevToken;
  
  // Write token to a local file with restrictive permissions instead of logging
  const fs = require('node:fs');
  const tokenFilePath = path.join(__dirname, '../../.dev-worker-token');
  try {
    fs.writeFileSync(tokenFilePath, generatedDevToken, { mode: 0o600 });
    console.warn('[Auth] WARNING: WORKER_SECRET_TOKEN not set.');
    console.warn('[Auth] Generated secure random token for this session (development only).');
    console.warn(`[Auth] Token saved to: ${tokenFilePath}`);
    // Only show full token if explicitly enabled via environment flag
    if (process.env.SHOW_DEV_TOKEN === 'true') {
      console.warn(`[Auth] Token: ${generatedDevToken}`);
    } else {
      console.warn(`[Auth] Token preview: ${generatedDevToken.substring(0, 8)}...`);
    }
    console.warn('[Auth] NOTE: This token will change on every server restart!');
  } catch (writeError) {
    console.error('[Auth] Failed to write token file:', writeError.message);
    // Fallback: only show truncated token
    console.warn('[Auth] Token preview: ' + generatedDevToken.substring(0, 8) + '...');
  }
}

/**
 * Supabase JWT 토큰 검증
 * @param {string} token - JWT 토큰
 * @returns {Promise<Object>} - 검증된 페이로드 또는 에러
 */
async function verifySupabaseJwt(token) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_JWT_SECRET) {
      reject(new Error('SUPABASE_JWT_SECRET not configured'));
      return;
    }

    jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.NEXT_PUBLIC_SUPABASE_URL
    }, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(decoded);
    });
  });
}

/**
 * Worker 토큰 검증 (상수 시간 비교로 타이밍 공격 방지)
 * @param {string} token - Worker 토큰
 * @returns {boolean} - 유효 여부
 */
function verifyWorkerToken(token) {
  // WORKER_SECRET_TOKEN is now always set (either from env or generated at startup)
  // No fallback to predictable default
  if (!WORKER_SECRET_TOKEN) {
    console.error('[Auth] CRITICAL: WORKER_SECRET_TOKEN is not available');
    return false;
  }
  
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // 상수 시간 비교 (타이밍 공격 방지)
  // 길이가 다른 경우에도 상수 시간을 유지하기 위해 동일한 길이로 패딩
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(WORKER_SECRET_TOKEN);
  
  // 길이가 다르면 더 긴 쪽에 맞춰서 비교 (상수 시간 유지)
  if (tokenBuffer.length !== secretBuffer.length) {
    // 길이가 다르면 실패하지만, 타이밍 공격 방지를 위해 비교는 수행
    const maxLen = Math.max(tokenBuffer.length, secretBuffer.length);
    const paddedToken = Buffer.alloc(maxLen);
    const paddedSecret = Buffer.alloc(maxLen);
    tokenBuffer.copy(paddedToken);
    secretBuffer.copy(paddedSecret);
    crypto.timingSafeEqual(paddedToken, paddedSecret);
    return false;
  }
  
  return crypto.timingSafeEqual(tokenBuffer, secretBuffer);
}

/**
 * Dashboard Namespace 인증 미들웨어
 * Supabase JWT 토큰을 검증합니다.
 *
 * @param {Socket} socket - Socket.io 소켓 객체
 * @param {Function} next - 다음 미들웨어 호출
 */
async function dashboardAuthMiddleware(socket, next) {
  try {
    // handshake.auth에서 토큰 추출
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log(`[Auth] Dashboard connection rejected: missing token (${socket.id})`);
      return next(new Error('Authentication required: token missing'));
    }

    // Supabase JWT 검증
    const decoded = await verifySupabaseJwt(token);

    // 소켓에 사용자 정보 첨부
    socket.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'authenticated',
      orgId: decoded.app_metadata?.org_id || null,
      aud: decoded.aud
    };

    // 토큰 만료 시간 저장 (재연결 시 검증용)
    socket.tokenExp = decoded.exp;

    // Log only non-PII identifier (user.id) and a hashed version of email if needed for debugging
    const userIdentifier = socket.user.id;
    const emailHash = socket.user.email 
      ? crypto.createHash('sha256').update(socket.user.email).digest('hex').substring(0, 8)
      : null;
    console.log(`[Auth] Dashboard authenticated: user=${userIdentifier}${emailHash ? ` (email_hash=${emailHash})` : ''} (${socket.id})`);
    next();
  } catch (err) {
    console.log(`[Auth] Dashboard auth failed: ${err.message} (${socket.id})`);

    // 구체적인 에러 메시지 반환
    if (err.name === 'TokenExpiredError') {
      return next(new Error('Authentication failed: token expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new Error('Authentication failed: invalid token'));
    }

    return next(new Error('Authentication failed'));
  }
}

/**
 * Worker Namespace 인증 미들웨어
 * PC Worker의 서버 토큰과 pcId를 검증합니다.
 *
 * @param {Socket} socket - Socket.io 소켓 객체
 * @param {Function} next - 다음 미들웨어 호출
 */
function workerAuthMiddleware(socket, next) {
  const { pcId, token } = socket.handshake.auth;

  // pcId 필수 검증
  if (!pcId) {
    console.log(`[Auth] Worker connection rejected: missing pcId (${socket.id})`);
    return next(new Error('Authentication required: pcId missing'));
  }

  // pcId 형식 검증 (P01, P01-WORKER 등)
  const validWorkerPattern = /^P\d{1,2}(-WORKER)?$/;
  if (!validWorkerPattern.test(pcId)) {
    console.log(`[Auth] Worker connection rejected: invalid pcId format "${pcId}" (${socket.id})`);
    return next(new Error('Authentication failed: invalid pcId format'));
  }

  // Worker 토큰 검증
  if (!verifyWorkerToken(token)) {
    console.log(`[Auth] Worker connection rejected: invalid token for ${pcId} (${socket.id})`);
    return next(new Error('Authentication failed: invalid worker token'));
  }

  // 소켓에 Worker 정보 첨부
  socket.worker = {
    pcId,
    authenticatedAt: new Date()
  };

  console.log(`[Auth] Worker authenticated: ${pcId} (${socket.id})`);
  next();
}

/**
 * 토큰 만료 체크 (주기적으로 실행)
 * @param {Socket} socket - Socket.io 소켓 객체
 * @returns {boolean} - 토큰이 유효한지 여부
 */
function isTokenValid(socket) {
  if (!socket.tokenExp) return true; // Worker는 tokenExp가 없음

  const now = Math.floor(Date.now() / 1000);
  return socket.tokenExp > now;
}

/**
 * RLS 정책에 필요한 org_id 추출
 * @param {Socket} socket - Socket.io 소켓 객체
 * @returns {string|null} - Organization ID
 */
function getOrgId(socket) {
  return socket.user?.orgId || null;
}

module.exports = {
  dashboardAuthMiddleware,
  workerAuthMiddleware,
  verifySupabaseJwt,
  verifyWorkerToken,
  isTokenValid,
  getOrgId
};

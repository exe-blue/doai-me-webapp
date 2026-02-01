import type { NextConfig } from "next";

// Backend URL (기본값: localhost:3001)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Docker 배포를 위한 standalone 빌드
  output: 'standalone',
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
    ],
  },

  // 환경 변수 노출
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
  },

  // 개발 환경에서 Backend 프록시 설정
  // /api/backend/* -> Backend 서버로 프록시
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${BACKEND_URL}/:path*`,
      },
      // Socket.io 연결 프록시 (개발 환경용)
      {
        source: '/socket.io/:path*',
        destination: `${BACKEND_URL}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

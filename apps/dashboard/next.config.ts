import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // 소켓 중복 연결 방지 (개발 모드)
  transpilePackages: ["@doai/shared", "@doai/ui"],
  
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    return [
      {
        // 소켓 경로는 더 구체적이므로 먼저 매칭되어야 함
        source: '/api/socket/io',
        destination: `${backendUrl}/socket.io/`, // 소켓 경로 매핑
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`, // 백엔드 API 포트
      },
    ];
  },
};

export default nextConfig;
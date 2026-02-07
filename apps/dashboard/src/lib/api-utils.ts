import { NextResponse } from "next/server";

// API 응답 헬퍼 타입
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 성공 응답
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    } as ApiResponse<T>,
    { status }
  );
}

// 에러 응답
// Supports two signatures:
// - errorResponse(code, message, status) - full error info
// - errorResponse(message, status) - simplified (code defaults to 'ERROR')
export function errorResponse(codeOrMessage: string, messageOrStatus: string | number, status?: number) {
  // Determine which signature is being used
  if (typeof messageOrStatus === 'number') {
    // Simplified: errorResponse(message, status)
    return NextResponse.json(
      {
        success: false,
        error: { code: 'ERROR', message: codeOrMessage },
      } as ApiResponse,
      { status: messageOrStatus }
    );
  }
  // Full: errorResponse(code, message, status)
  return NextResponse.json(
    {
      success: false,
      error: { code: codeOrMessage, message: messageOrStatus },
    } as ApiResponse,
    { status: status ?? 400 }
  );
}

// 페이지네이션 응답
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  const totalPages = Math.ceil(total / pageSize);
  return successResponse<PaginatedData<T>>({
    items,
    total,
    page,
    pageSize,
    totalPages,
  });
}

// URL 파라미터 파싱
export function getQueryParams(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Clamp pageSize to prevent excessive resource usage
  const MAX_PAGE_SIZE = 100;
  const rawPageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const pageSize = Math.min(Math.max(1, rawPageSize || 20), MAX_PAGE_SIZE);
  
  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: "asc" | "desc" = rawSortOrder === "asc" || rawSortOrder === "desc" 
    ? rawSortOrder 
    : "desc";
  
  return {
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1),
    pageSize,
    search: searchParams.get("search") || undefined,
    status: searchParams.get("status") || undefined,
    sortBy: searchParams.get("sortBy") || undefined,
    sortOrder,
    // 추가 파라미터
    nodeId: searchParams.get("nodeId") || undefined,
    deviceId: searchParams.get("deviceId") || undefined,
    videoId: searchParams.get("videoId") || undefined,
    channelId: searchParams.get("channelId") || undefined,
    category: searchParams.get("category") || undefined,
    level: searchParams.get("level") || undefined,
    source: searchParams.get("source") || undefined,
    type: searchParams.get("type") || undefined,
    severity: searchParams.get("severity") || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    date: searchParams.get("date") || undefined,
  };
}

// YouTube URL에서 Video ID 추출
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // 직접 ID 입력
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// YouTube URL에서 Channel ID 추출
export function extractYouTubeChannelId(url: string): string | null {
  const patterns = [
    /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
    /^(UC[a-zA-Z0-9_-]{22})$/, // 직접 Channel ID 입력
    /^@([a-zA-Z0-9_-]+)$/, // @handle 직접 입력
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

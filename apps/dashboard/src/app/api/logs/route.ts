import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// GET /api/logs - 시스템 로그 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const {
      page,
      pageSize,
      level,
      source,
      nodeId,
      search,
      dateFrom,
      dateTo,
      sortOrder = "desc",
    } = getQueryParams(request);

    let query = supabase.from("system_logs").select("*", { count: "exact" });

    // 필터링
    if (level && level !== "all") {
      query = query.eq("level", level);
    }
    if (source && source !== "all") {
      query = query.eq("source", source);
    }
    if (nodeId && nodeId !== "all") {
      query = query.eq("node_id", nodeId);
    }
    if (search) {
      // Sanitize search to prevent PostgREST injection
      // Remove special characters that could break the query
      const sanitizedSearch = search
        .replace(/[,.()\[\]%\\]/g, '')  // Remove special chars
        .slice(0, 100);  // Max length
      
      if (sanitizedSearch) {
        query = query.or(`message.ilike.%${sanitizedSearch}%,component.ilike.%${sanitizedSearch}%`);
      }
    }
    if (dateFrom) {
      query = query.gte("timestamp", dateFrom);
    }
    if (dateTo) {
      query = query.lte("timestamp", dateTo);
    }

    // 정렬 (최신순)
    query = query.order("timestamp", { ascending: sortOrder === "asc" });

    // 페이지네이션
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      // 테이블이 없는 경우 빈 결과 반환
      if (error.code === "42P01") {
        return paginatedResponse([], 0, page, pageSize);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return paginatedResponse(data || [], count || 0, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// POST /api/logs - 로그 생성 (내부용)
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "요청 본문이 유효한 JSON이 아닙니다", 400);
    }

    const { level, source, component, message, details, node_id, device_id, request_id } = body;

    if (!level || !source || !message) {
      return errorResponse("INVALID_REQUEST", "level, source, message가 필요합니다", 400);
    }

    const logData = {
      level,
      source,
      component: component || "unknown",
      message,
      details: details || null,
      node_id: node_id || null,
      device_id: device_id || null,
      request_id: request_id || null,
      timestamp: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("system_logs")
      .insert(logData)
      .select()
      .single();

    if (error) {
      // 테이블이 없는 경우 무시
      if (error.code === "42P01") {
        return successResponse({ logged: false, reason: "table_not_exists" });
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// GET /api/issues - 디바이스 이슈 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const {
      page,
      pageSize,
      status,
      severity,
      type,
      nodeId,
      deviceId,
      sortBy = "created_at",
      sortOrder = "desc",
    } = getQueryParams(request);

    // Use left join to include orphaned device_issues (devices may be deleted)
    let query = supabase.from("device_issues").select("*, devices(device_id, name)", {
      count: "exact",
    });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (severity && severity !== "all") {
      query = query.eq("severity", severity);
    }
    if (type && type !== "all") {
      query = query.eq("type", type);
    }
    if (nodeId && nodeId !== "all") {
      query = query.eq("devices.node_id", nodeId);
    }
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }

    // 정렬
    const validSortFields = ["created_at", "severity"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
    query = query.order(sortField, { ascending: sortOrder === "asc" });

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

// POST /api/issues - 이슈 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "요청 본문이 유효한 JSON이 아닙니다", 400);
    }

    const { device_id, type, severity, message, details, auto_recoverable } = body;

    if (!device_id || !type || !message) {
      return errorResponse("INVALID_REQUEST", "device_id, type, message가 필요합니다", 400);
    }

    const issueData = {
      device_id,
      type,
      severity: severity || "medium",
      status: "open",
      message,
      details: details || {},
      auto_recoverable: auto_recoverable ?? false,
      recovery_attempts: 0,
      resolved_at: null,
      resolved_by: null,
    };

    const { data, error } = await supabase
      .from("device_issues")
      .insert(issueData)
      .select()
      .single();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

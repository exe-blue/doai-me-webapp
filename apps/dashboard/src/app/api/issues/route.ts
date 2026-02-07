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

    // Try FK join first, fallback to manual join if FK doesn't exist
    let data: Record<string, unknown>[] | null = null;
    let count: number | null = null;

    const validSortFields = ["created_at", "severity"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Attempt 1: FK join
    {
      let query = supabase.from("device_issues").select("*, devices(id, serial_number, name)", {
        count: "exact",
      });
      if (status && status !== "all") query = query.eq("status", status);
      if (severity && severity !== "all") query = query.eq("severity", severity);
      if (type && type !== "all") query = query.eq("type", type);
      if (deviceId) query = query.eq("device_id", deviceId);
      query = query.order(sortField, { ascending: sortOrder === "asc" });
      query = query.range(from, to);

      const result = await query;
      if (!result.error) {
        data = result.data;
        count = result.count;
      }
    }

    // Attempt 2: Manual join (no FK relationship)
    if (data === null) {
      let query = supabase.from("device_issues").select("*", { count: "exact" });
      if (status && status !== "all") query = query.eq("status", status);
      if (severity && severity !== "all") query = query.eq("severity", severity);
      if (type && type !== "all") query = query.eq("type", type);
      if (deviceId) query = query.eq("device_id", deviceId);
      query = query.order(sortField, { ascending: sortOrder === "asc" });
      query = query.range(from, to);

      const result = await query;
      if (result.error) {
        if (result.error.code === "42P01") {
          return paginatedResponse([], 0, page, pageSize);
        }
        return errorResponse("DB_ERROR", result.error.message, 500);
      }
      data = result.data || [];
      count = result.count;

      // Manual device lookup
      const deviceIds = [...new Set((data || []).map((i) => i.device_id as string).filter(Boolean))];
      if (deviceIds.length > 0) {
        const { data: devices } = await supabase
          .from("devices")
          .select("id, serial_number, name")
          .in("serial_number", deviceIds);
        const deviceMap = new Map((devices || []).map((d) => [d.serial_number, d]));
        data = (data || []).map((issue) => ({
          ...issue,
          devices: deviceMap.get(issue.device_id as string) || null,
        }));
      }
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

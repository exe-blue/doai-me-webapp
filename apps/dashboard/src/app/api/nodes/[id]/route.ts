import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/nodes/:id - 단일 노드 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    const { data, error } = await supabase
      .from("nodes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      // Only fall back to devices for "not found" error (PGRST116)
      // Surface other errors (auth, network, etc.)
      if (error.code !== "PGRST116" && error.code !== "42P01") {
        return errorResponse("DB_ERROR", error.message, 500);
      }
      
      // nodes 테이블이 없거나 레코드가 없는 경우
      // 디바이스 기반으로 노드 정보 생성
      const { data: devices, error: devicesError } = await supabase
        .from("devices")
        .select("*")
        .eq("pc_id", id);

      if (devicesError) {
        console.error("[API] Failed to fetch devices:", devicesError.message);
        return errorResponse("DB_ERROR", devicesError.message, 500);
      }

      if (!devices || devices.length === 0) {
        return errorResponse("NOT_FOUND", "노드를 찾을 수 없습니다", 404);
      }

      const online = devices.filter(
        (d) => d.status === "online"
      ).length;
      const busy = devices.filter((d) => d.status === "busy").length;

      const nodeData = {
        id,
        name: `Node ${id.replace("node-", "")}`,
        status: online > 0 ? "online" : "offline",
        ip_address: "",
        device_count: devices.length,
        online_devices: online,
        busy_devices: busy,
        active_tasks: 0,
        cpu_usage: 0,
        memory_usage: 0,
        last_heartbeat: new Date().toISOString(),
        version: "1.0.0",
      };

      return successResponse(nodeData);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

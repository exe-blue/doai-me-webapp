import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

// GET /api/nodes - 노드 목록 조회
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const supabase = getServerClient();

    // 노드 테이블이 있으면 조회, 없으면 디바이스 기반으로 생성
    const { data: nodes, error } = await supabase.from("nodes").select("*");

    if (error) {
      // nodes 테이블이 없는 경우, 디바이스 기반으로 노드 정보 생성
      if (error.code === "42P01") {
        // 테이블 없음
        const { data: devices, error: devicesError } = await supabase.from("devices").select("pc_id, status");
        
        if (devicesError) {
          console.error("[API] Failed to fetch devices:", devicesError.message);
          return errorResponse("DB_ERROR", devicesError.message, 500);
        }

        // 디바이스에서 노드별 통계 집계
        const nodeStats: Record<
          string,
          {
            device_count: number;
            online_devices: number;
            busy_devices: number;
          }
        > = {};

        for (const device of devices || []) {
          const nodeId = device.pc_id || "node-default";
          if (!nodeStats[nodeId]) {
            nodeStats[nodeId] = { device_count: 0, online_devices: 0, busy_devices: 0 };
          }
          nodeStats[nodeId].device_count++;
          if (device.status === "online") {
            nodeStats[nodeId].online_devices++;
          }
          if (device.status === "busy") {
            // Count busy devices as both busy AND online
            nodeStats[nodeId].online_devices++;
            nodeStats[nodeId].busy_devices++;
          }
        }

        const generatedNodes = Object.entries(nodeStats).map(([nodeId, stats]) => ({
          id: nodeId,
          name: `Node ${nodeId.replace("node-", "")}`,
          status: stats.online_devices > 0 ? "online" : "offline",
          ip_address: "",
          device_count: stats.device_count,
          online_devices: stats.online_devices,
          busy_devices: stats.busy_devices,
          active_tasks: 0,
          cpu_usage: 0,
          memory_usage: 0,
          last_heartbeat: new Date().toISOString(),
          version: "1.0.0",
        }));

        return successResponse(generatedNodes);
      }

      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(nodes || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

// POST /api/devices/command - 디바이스 명령 전송
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    
    // Parse JSON with explicit error handling
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return errorResponse("INVALID_JSON", "요청 본문이 유효한 JSON이 아닙니다", 400);
    }

    const { device_ids, command, params } = body;

    if (!device_ids || !Array.isArray(device_ids) || device_ids.length === 0) {
      return errorResponse("INVALID_REQUEST", "device_ids가 필요합니다", 400);
    }

    const validCommands = ["reboot", "clear_cache", "kill_app", "screenshot", "enable", "disable"];
    if (!command || !validCommands.includes(command)) {
      return errorResponse(
        "INVALID_COMMAND",
        `유효한 command가 필요합니다 (${validCommands.join(", ")})`,
        400
      );
    }

    const results = { sent: 0, failed: [] as string[] };

    // 각 디바이스에 명령 큐에 추가
    for (const deviceId of device_ids) {
      const commandData = {
        device_id: deviceId,
        command_type: command,
        options: params || {},
        status: "pending",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("device_commands").insert(commandData);

      if (error) {
        // 테이블이 없으면 scrcpy_commands 테이블 사용
        if (error.code === "42P01") {
          // 디바이스 정보 조회
          const { data: device } = await supabase
            .from("devices")
            .select("pc_id")
            .eq("id", deviceId)
            .single();

          if (device) {
            const { error: scrcpyError } = await supabase.from("scrcpy_commands").insert({
              device_id: deviceId,
              pc_id: device.pc_id || "unknown",
              command_type: command === "reboot" ? "scrcpy_stop" : command,
              options: params || {},
              status: "pending",
            });

            if (scrcpyError) {
              results.failed.push(deviceId);
            } else {
              results.sent++;
            }
          } else {
            results.failed.push(deviceId);
          }
        } else {
          results.failed.push(deviceId);
        }
      } else {
        results.sent++;
      }
    }

    // 특수 명령 처리: disable/enable은 디바이스 상태 변경
    // Move status update BEFORE queuing commands to ensure atomic state change
    if (command === "disable" || command === "enable") {
      const newStatus = command === "disable" ? "maintenance" : "idle";
      const { error: updateError } = await supabase
        .from("devices")
        .update({ status: newStatus })
        .in("id", device_ids);
      
      if (updateError) {
        console.error("[API] Device status update failed:", updateError.message, { device_ids, newStatus });
        return errorResponse("UPDATE_FAILED", `디바이스 상태 변경 실패: ${updateError.message}`, 500);
      }
    }

    return successResponse(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

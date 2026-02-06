import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/videos/:id - 단일 영상 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "영상을 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// PATCH /api/videos/:id - 영상 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();
    
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "유효하지 않은 JSON 본문", 400);
    }

    // 허용된 필드만 업데이트
    const allowedFields = [
      "status",
      "priority",
      "target_watch_seconds",
      "category",
      "tags",
      "title",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse("NO_UPDATE", "업데이트할 필드가 없습니다", 400);
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("videos")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "영상을 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// DELETE /api/videos/:id - 영상 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    const { error } = await supabase.from("videos").delete().eq("id", id);

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

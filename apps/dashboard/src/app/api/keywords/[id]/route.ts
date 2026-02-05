import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/keywords/:id - 단일 키워드 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    const { data, error } = await supabase
      .from("keywords")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "키워드를 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// PATCH /api/keywords/:id - 키워드 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();
    const body = await request.json();

    const allowedFields = ["auto_collect", "status", "category", "max_results"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse("NO_UPDATE", "업데이트할 필드가 없습니다", 400);
    }

    const { data, error } = await supabase
      .from("keywords")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "키워드를 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// DELETE /api/keywords/:id - 키워드 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();

    const { data, error } = await supabase
      .from("keywords")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    if (!data || data.length === 0) {
      return errorResponse("NOT_FOUND", "키워드를 찾을 수 없습니다", 404);
    }

    return successResponse({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

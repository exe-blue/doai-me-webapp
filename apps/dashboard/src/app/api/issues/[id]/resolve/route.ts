import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import { successResponse, errorResponse } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/issues/:id/resolve - 이슈 해결
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));

    // First, fetch the existing issue to get current details
    const { data: existingIssue, error: fetchError } = await supabase
      .from("device_issues")
      .select("details")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return errorResponse("NOT_FOUND", "이슈를 찾을 수 없습니다", 404);
      }
      return errorResponse("DB_ERROR", fetchError.message, 500);
    }

    // Build update object, only include details if resolution_note is provided
    const updateData: Record<string, unknown> = {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: body.resolved_by || "manual",
    };

    if (body.resolution_note) {
      updateData.details = {
        ...(existingIssue?.details || {}),
        resolution_note: body.resolution_note,
      };
    }

    const { data, error } = await supabase
      .from("device_issues")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

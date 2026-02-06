import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase-server";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  getQueryParams,
} from "@/lib/api-utils";

// Escape special characters in LIKE patterns to prevent injection
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (char) => `\\${char}`);
}

// GET /api/keywords - 키워드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { page, pageSize, search, status, category, sortBy = "created_at", sortOrder = "desc" } =
      getQueryParams(request);

    let query = supabase.from("keywords").select("*", { count: "exact" });

    // 필터링
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (search) {
      const escapedSearch = escapeLike(search);
      query = query.ilike("keyword", `%${escapedSearch}%`);
    }

    // 정렬
    const validSortFields = ["created_at", "keyword", "video_count"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
    query = query.order(sortField, { ascending: sortOrder === "asc" });

    // 페이지네이션
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return errorResponse("DB_ERROR", error.message, 500);
    }

    return paginatedResponse(data || [], count || 0, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

// POST /api/keywords - 키워드 추가
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();

    // 단일 키워드 추가
    if (body.keyword) {
      const keyword = body.keyword.trim();
      if (!keyword) {
        return errorResponse("INVALID_KEYWORD", "키워드가 비어있습니다", 400);
      }

      // 중복 확인 - use maybeSingle to safely return null when no row is found
      const { data: existing, error: checkError } = await supabase
        .from("keywords")
        .select("id")
        .eq("keyword", keyword)
        .maybeSingle();

      // Handle real DB errors
      if (checkError) {
        return errorResponse("DB_ERROR", checkError.message, 500);
      }

      if (existing) {
        return errorResponse("DUPLICATE", "이미 등록된 키워드입니다", 409);
      }

      const keywordData = {
        keyword,
        category: body.category || null,
        auto_collect: body.auto_collect ?? false,
        max_results: body.max_results || 10,
        last_collected_at: null,
        video_count: 0,
        status: "active",
      };

      const { data, error } = await supabase
        .from("keywords")
        .insert(keywordData)
        .select()
        .single();

      if (error) {
        return errorResponse("DB_ERROR", error.message, 500);
      }

      return successResponse(data, 201);
    }

    // 벌크 추가
    if (body.keywords && Array.isArray(body.keywords)) {
      const results = { created: 0, failed: [] as string[] };

      for (const kw of body.keywords) {
        const keyword = typeof kw === "string" ? kw.trim() : kw.keyword?.trim();
        if (!keyword) {
          results.failed.push(kw);
          continue;
        }

        // use maybeSingle to properly handle "not found" vs real errors
        const { data: existing, error: checkError } = await supabase
          .from("keywords")
          .select("id")
          .eq("keyword", keyword)
          .maybeSingle();

        // Handle real DB errors (not just "not found")
        if (checkError && checkError.code !== "PGRST116") {
          results.failed.push(keyword);
          continue;
        }

        if (existing) {
          results.failed.push(keyword);
          continue;
        }

        const keywordData = {
          keyword,
          category: body.category || null,
          auto_collect: body.auto_collect ?? false,
          max_results: body.max_results || 10,
          last_collected_at: null,
          video_count: 0,
          status: "active",
        };

        const { error } = await supabase.from("keywords").insert(keywordData);

        if (error) {
          results.failed.push(keyword);
        } else {
          results.created++;
        }
      }

      return successResponse(results, 201);
    }

    return errorResponse("INVALID_REQUEST", "keyword 또는 keywords가 필요합니다", 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse("INTERNAL_ERROR", message, 500);
  }
}

import { logError, requestLogContext } from "@/lib/observability";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { supabase } from "@/lib/supabase/server";
import { isCommentHtmlEmpty, MAX_COMMENT_LENGTH } from "@/utils/comment-html";
import { sanitizeCommentHtml } from "@/utils/sanitize-comment-html";

const PRODUCT_ID_PATTERN = /^[1-9]\d*$/;
const PAGE_SIZE = 20;

const COMMENT_COLUMNS =
  "id, content, author_name, author_avatar_url, created_at, user_id";

type CommentRow = {
  id: number;
  content: string;
  author_name: string | null;
  author_avatar_url: string | null;
  created_at: string;
  user_id: string | null;
};

function toComment(row: CommentRow, owned: boolean) {
  return {
    id: row.id,
    content: row.content,
    authorName: row.author_name,
    avatarUrl: row.author_avatar_url,
    createdAt: row.created_at,
    owned,
  };
}

function parseProductId(productParam: string) {
  return PRODUCT_ID_PATTERN.test(productParam) ? Number(productParam) : null;
}

async function requireProduct(productId: number) {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const productId = parseProductId(productParam);
  const requestedPage = Number(new URL(request.url).searchParams.get("page"));

  if (
    productId === null ||
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1
  ) {
    return Response.json({ error: "Invalid comment request" }, { status: 400 });
  }

  try {
    if (!(await requireProduct(productId))) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const { count, error: countError } = await supabase
      .from("product_comments")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("is_deleted", false);

    if (countError) throw countError;

    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    const totalCount = count ?? 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);
    const currentPage = Math.min(requestedPage, Math.max(pageCount, 1));
    const { data: rows, error } = await supabase
      .from("product_comment_entries")
      .select(COMMENT_COLUMNS)
      .eq("product_id", productId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    if (error) throw error;

    return Response.json({
      items: (rows ?? []).map((row) => {
        const comment = toComment(row, user?.id === row.user_id);
        return { ...comment, content: sanitizeCommentHtml(comment.content) };
      }),
      totalCount,
      pageCount,
      currentPage,
    });
  } catch (error) {
    logError("product_comments_query_failed", error, {
      ...requestLogContext(request),
      productId,
      requestedPage,
    });
    return Response.json({ error: "Failed to load product comments" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const productId = parseProductId(productParam);

  if (productId === null) {
    return Response.json({ error: "Invalid comment request" }, { status: 400 });
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Expected JSON body" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("content" in body) ||
    typeof body.content !== "string"
  ) {
    return Response.json({ error: "Comment content is required" }, { status: 400 });
  }

  const content = sanitizeCommentHtml(body.content);
  if (isCommentHtmlEmpty(content) || content.length > MAX_COMMENT_LENGTH) {
    return Response.json({ error: "Invalid comment content" }, { status: 400 });
  }

  try {
    if (!(await requireProduct(productId))) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    const client = user ? authSupabase : supabase;
    const { data: inserted, error } = await client
      .from("product_comments")
      .insert({ content, product_id: productId, user_id: user?.id ?? null })
      .select("id")
      .single();

    if (error) throw error;

    const { data, error: readError } = await supabase
      .from("product_comment_entries")
      .select(COMMENT_COLUMNS)
      .eq("id", inserted.id)
      .single();

    if (readError) throw readError;
    return Response.json(
      {
        ...toComment(data, user?.id === data.user_id),
        content: sanitizeCommentHtml(data.content),
      },
      { status: 201 },
    );
  } catch (error) {
    logError("product_comment_create_failed", error, {
      ...requestLogContext(request),
      productId,
    });
    return Response.json({ error: "Failed to submit comment" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const productId = parseProductId(productParam);
  const commentId = Number(new URL(request.url).searchParams.get("id"));

  if (
    productId === null ||
    !Number.isSafeInteger(commentId) ||
    commentId < 1
  ) {
    return Response.json({ error: "Invalid comment request" }, { status: 400 });
  }

  try {
    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data, error } = await authSupabase
      .from("product_comments")
      .update({ is_deleted: true })
      .eq("id", commentId)
      .eq("product_id", productId)
      .eq("is_deleted", false)
      .select("id");

    if (error) throw error;
    if (!data?.length) {
      return Response.json({ error: "Comment not found" }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    logError("product_comment_delete_failed", error, {
      ...requestLogContext(request),
      productId,
      commentId,
    });
    return Response.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}

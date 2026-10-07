import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { supabase } from "@/lib/supabase/server";

const MAX_FEEDBACK_LENGTH = 5000;

export async function POST(request: Request) {
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
    return Response.json(
      { error: "Feedback content is required" },
      { status: 400 },
    );
  }

  const content = body.content.trim();
  if (!content || content.length > MAX_FEEDBACK_LENGTH) {
    return Response.json(
      { error: "Invalid feedback content" },
      { status: 400 },
    );
  }

  try {
    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    const client = user ? authSupabase : supabase;
    const { error } = await client
      .from("user_feedback")
      .insert({ content, user_id: user?.id ?? null });

    if (error) throw error;
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("User feedback submission failed", error);
    return Response.json(
      { error: "Failed to submit feedback" },
      { status: 500 },
    );
  }
}

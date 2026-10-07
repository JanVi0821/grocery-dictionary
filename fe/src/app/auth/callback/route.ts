import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedPath = url.searchParams.get("next") || "/";
  const nextPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";

  if (code) {
    const supabase = await createSupabaseAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(new URL(nextPath, url.origin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("authError", "1");
  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

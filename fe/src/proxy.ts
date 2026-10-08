import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const handleCacheableI18nRouting = createMiddleware({
  ...routing,
  localeDetection: false,
  localeCookie: false,
});

const PRODUCT_PATH_PATTERN = /^\/(?:en\/|zh\/)?product\/[^/]+\/?$/;

export default async function proxy(request: NextRequest) {
  if (PRODUCT_PATH_PATTERN.test(request.nextUrl.pathname)) {
    return handleCacheableI18nRouting(request);
  }

  let response: NextResponse | undefined;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToWrite, headers) {
          cookiesToWrite.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = handleI18nRouting(request);
          cookiesToWrite.forEach(({ name, value, options }) =>
            response?.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response?.headers.set(key, value),
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response ?? handleI18nRouting(request);
}

export const config = {
  matcher: "/((?!api|auth|trpc|_next|_vercel|.*\\..*).*)",
};

import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware({
  ...routing,
  localeDetection: false,
  localeCookie: false,
});

export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  // Locale comes from next/root-params; request header overrides bypass Vinext's shared cache.
  for (const name of [...response.headers.keys()]) {
    if (
      name === "x-middleware-override-headers" ||
      name.startsWith("x-middleware-request-")
    ) {
      response.headers.delete(name);
    }
  }

  return response;
}

export const config = {
  matcher: "/((?!api|auth|trpc|_next|_vercel|.*\\..*).*)",
};

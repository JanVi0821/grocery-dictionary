import "server-only";

import { logError, requestLogContext } from "@/lib/observability";

export const PUBLIC_DATA_CACHE_SECONDS = 60 * 60 * 3;

function cacheStorage() {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

function reportCacheError(
  error: unknown,
  stage: "match" | "put",
  request: Request,
) {
  logError("public_data_cache_failed", error, {
    ...requestLogContext(request),
    stage,
  });
}

/** Builds a stable cache key from validated public request parameters. */
export function cacheRequest(request: Request, params: Record<string, string>) {
  const url = new URL(request.url);
  url.search = "";
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url, { method: "GET" });
}

/** Only use this for responses that do not depend on cookies or user identity. */
export async function withCache(
  request: Request,
  load: () => Promise<Response>,
) {
  const cache = cacheStorage();
  const cacheable = cache !== undefined && request.method === "GET";

  if (cacheable) {
    try {
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch (error) {
      reportCacheError(error, "match", request);
    }
  }

  const response = await load();
  if (!cacheable || response.status !== 200) return response;

  try {
    await cache.put(request, response.clone());
  } catch (error) {
    reportCacheError(error, "put", request);
  }

  return response;
}

export function cachedJson(
  body: unknown,
  cacheSeconds = PUBLIC_DATA_CACHE_SECONDS,
) {
  return Response.json(body, {
    headers: {
      "Cache-Control": `public, s-maxage=${cacheSeconds}`,
    },
  });
}

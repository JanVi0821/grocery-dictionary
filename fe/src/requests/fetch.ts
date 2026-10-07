export async function getRequestOrigin(): Promise<string> {
  if (
    typeof globalThis.location !== "undefined" &&
    globalThis.location.origin !== "null"
  ) {
    return globalThis.location.origin;
  }

  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return new URL(origin).origin;

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) throw new Error("Unable to determine the request origin.");

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${protocol}://${host}`;
}

export type ApiQueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  query?: Record<string, ApiQueryValue>;
};

export class ApiError extends Error {
  readonly body: unknown;
  readonly status: number;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}.`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function buildUrl(
  path: string,
  query: Record<string, ApiQueryValue> | undefined,
): Promise<string> {
  const url = new URL(path, await getRequestOrigin());

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();

  const text = await response.text();
  return text || undefined;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { json, query, headers, ...requestInit } = options;
  const requestHeaders = new Headers(headers);

  if (json !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(await buildUrl(path, query), {
    ...requestInit,
    headers: requestHeaders,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const body = await readResponseBody(response);

  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

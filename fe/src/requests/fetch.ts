import { logError } from "@/lib/observability";

const INTERNAL_API_ORIGIN = "https://worker.internal";

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

async function getRequestOrigin() {
  if (typeof window !== "undefined") return window.location.origin;

  if (process.env.NODE_ENV === "development") {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");

    if (origin) return new URL(origin).origin;

    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

    if (!host) throw new Error("Unable to determine the development origin.");

    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    return `${protocol}://${host}`;
  }

  return INTERNAL_API_ORIGIN;
}

async function buildUrl(
  path: string,
  query: Record<string, ApiQueryValue> | undefined,
): Promise<URL> {
  const url = new URL(path, await getRequestOrigin());

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function executeRequest(url: URL, init: RequestInit) {
  if (typeof window !== "undefined" || process.env.NODE_ENV === "development") {
    return fetch(url, init);
  }

  const workersRuntime = "cloudflare:workers";
  const { env } = await import(/* @vite-ignore */ workersRuntime);
  const worker = (
    env as unknown as {
      WORKER_SELF_REFERENCE?: {
        fetch(input: string, init?: RequestInit): Promise<Response>;
      };
    }
  ).WORKER_SELF_REFERENCE;

  if (!worker) {
    throw new Error("WORKER_SELF_REFERENCE service binding is unavailable.");
  }

  return worker.fetch(url.toString(), init);
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

  const url = await buildUrl(path, query);
  const method = requestInit.method?.toUpperCase() ?? "GET";
  let response: Response;

  try {
    response = await executeRequest(url, {
      ...requestInit,
      headers: requestHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (error) {
    logError("api_request_network_error", error, {
      method,
      path: url.pathname,
    });
    throw error;
  }

  let body: unknown;
  try {
    body = await readResponseBody(response);
  } catch (error) {
    logError("api_response_parse_error", error, {
      method,
      path: url.pathname,
      status: response.status,
    });
    throw error;
  }

  if (!response.ok) {
    const error = new ApiError(response.status, body);
    if (response.status >= 500) {
      const responseError =
        body !== null &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : undefined;

      logError("api_response_error", error, {
        method,
        path: url.pathname,
        status: response.status,
        responseError,
      });
    }
    throw error;
  }
  return body as T;
}

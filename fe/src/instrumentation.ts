import type { Instrumentation } from "next";
import { logError } from "@/lib/observability";

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requestPathname(path: string) {
  return new URL(path, "https://local.invalid").pathname;
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  logError("next_request_error", error, {
    method: request.method,
    path: requestPathname(request.path),
    cfRay: headerValue(request.headers["cf-ray"]),
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};

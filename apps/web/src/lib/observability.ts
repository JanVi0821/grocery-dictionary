type LogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

function errorProperty(
  error: Record<string, unknown>,
  key: string,
): string | number | undefined {
  const value = error[key];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const extendedError = error as Error & {
      code?: string | number;
      digest?: string;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: extendedError.code,
      digest: extendedError.digest,
    };
  }

  if (error !== null && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    return {
      name: errorProperty(errorRecord, "name"),
      message: errorProperty(errorRecord, "message") ?? "Unknown error",
      stack: errorProperty(errorRecord, "stack"),
      code: errorProperty(errorRecord, "code"),
      details: errorProperty(errorRecord, "details"),
      hint: errorProperty(errorRecord, "hint"),
    };
  }

  return { message: String(error) };
}

export function logError(
  event: string,
  error: unknown,
  context: LogContext = {},
) {
  console.error({
    level: "error",
    event,
    ...context,
    error: serializeError(error),
  });
}

export function requestLogContext(request: Request): LogContext {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    cfRay: request.headers.get("cf-ray"),
  };
}

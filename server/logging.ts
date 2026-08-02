type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null;

export type SafeErrorDetails = {
  code: string;
  message: string;
};

export function logEvent(
  level: LogLevel,
  event: string,
  details: Record<string, LogValue> = {},
): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  const line = JSON.stringify(record) + "\n";

  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export function safeIntegrationError(
  channel: "vk" | "email",
  error: unknown,
): SafeErrorDetails {
  const prefix = channel.toUpperCase();
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const timedOut =
    errorName.includes("timeout") ||
    errorName.includes("abort") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("timed out");

  if (timedOut) {
    return {
      code: prefix + "_TIMEOUT",
      message: prefix + " delivery timed out",
    };
  }

  return {
    code: prefix + "_DELIVERY_ERROR",
    message: prefix + " delivery failed",
  };
}

export function safeRequestError(error: unknown): SafeErrorDetails {
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const tooLarge = errorName.includes("payloadtoolarge") || errorMessage.includes("body exceeded");

  return tooLarge
    ? { code: "REQUEST_TOO_LARGE", message: "Request body is too large" }
    : { code: "REQUEST_PROCESSING_ERROR", message: "Application request processing failed" };
}

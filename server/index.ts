import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleApplicationForm } from "@/server/forms/application-handler";
import { logEvent, safeRequestError } from "@/server/logging";

const host = process.env.HOST?.trim() || "127.0.0.1";
const port = parsePort(process.env.PORT);
const maxRequestSize = 52 * 1024 * 1024;

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "3000");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || request.socket.remoteAddress || "unknown";
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/api/application") {
    json(response, 404, { ok: false, message: "Not found" });
    return;
  }

  const requestId = randomUUID();
  const contentLength = Number(request.headers["content-length"] ?? "0");
  logEvent("info", "application.received", {
    requestId,
    hasContentLength: Number.isFinite(contentLength) && contentLength > 0,
  });

  if (Number.isFinite(contentLength) && contentLength > maxRequestSize) {
    logEvent("warn", "application.rejected", {
      requestId,
      code: "REQUEST_TOO_LARGE",
    });
    json(response, 413, { ok: false, message: "Общий размер вложений слишком большой." });
    request.resume();
    return;
  }

  try {
    const webRequest = new Request(url, {
      method: "POST",
      headers: requestHeaders(request),
      body: request as never,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const formData = await webRequest.formData();
    const result = await handleApplicationForm(formData, {
      ip: clientIp(request),
      requestId,
    });
    json(response, result.ok ? 200 : result.status, result);
  } catch (error) {
    const safeError = safeRequestError(error);
    logEvent("error", "application.failed", {
      requestId,
      code: safeError.code,
      message: safeError.message,
    });
    json(response, 400, { ok: false, message: "Не удалось обработать форму. Проверьте данные и файлы." });
  }
});

server.requestTimeout = 120_000;
server.headersTimeout = 125_000;
server.keepAliveTimeout = 5_000;

server.listen(port, host, () => {
  logEvent("info", "backend.started", {
    host,
    port,
  });
});

function shutdown(signal: string): void {
  logEvent("info", "backend.stopping", { signal });
  server.close((error) => {
    if (error) {
      logEvent("error", "backend.stop_failed", {
        code: "SERVER_SHUTDOWN_ERROR",
        message: "Backend shutdown failed",
      });
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

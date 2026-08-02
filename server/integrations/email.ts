import { readFile } from "node:fs/promises";
import { connect } from "node:tls";
import type { ApplicationInput } from "@/lib/forms/validation";
import type { PreparedPhoto } from "@/server/forms/file-processing";
import type { IntegrationResult } from "@/server/integrations/vk";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
};

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: Buffer | string): string {
  const encoded = Buffer.isBuffer(value) ? value.toString("base64") : Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

async function createMimeMessage(
  data: ApplicationInput,
  photos: PreparedPhoto[],
  config: SmtpConfig,
): Promise<string> {
  const boundary = `korpus-${crypto.randomUUID()}`;
  const body = [
    "Новая заявка с сайта KORPUS",
    "",
    `Имя: ${data.name}`,
    `Телефон: ${data.phone}`,
    `Тип мебели: ${data.furnitureType || "Не указан"}`,
    `Комментарий или размеры: ${data.comment || "Не указаны"}`,
    `Количество фотографий: ${photos.length}`,
  ].join("\n");
  const parts = [
    `From: ${cleanHeader(config.from)}`,
    `To: ${cleanHeader(config.to)}`,
    `Subject: ${encodeHeader("Новая заявка с сайта KORPUS")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(body),
  ];

  for (const photo of photos) {
    const bytes = await readFile(photo.path);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${photo.contentType}; name="${cleanHeader(photo.safeName)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${cleanHeader(photo.safeName)}"`,
      "",
      wrapBase64(bytes),
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

function smtpConfig(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.trim();
  const from = env.MAIL_FROM?.trim();
  const to = env.MAIL_TO?.trim();
  const port = Number(env.SMTP_PORT ?? "465");

  if (!host || !user || !password || !from || !to) return null;
  if (env.SMTP_SECURE?.toLowerCase() !== "true") throw new Error("Secure SMTP is required");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid SMTP port");

  return { host, port, user, password, from, to };
}

async function sendViaSecureSmtp(config: SmtpConfig, message: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: config.host, port: config.port, servername: config.host });
    socket.setTimeout(15_000);
    let buffer = "";
    const pending: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];

    const fail = (error: Error) => {
      while (pending.length) pending.shift()?.reject(error);
      socket.destroy();
      reject(error);
    };

    const readReply = () =>
      new Promise<string>((replyResolve, replyReject) => pending.push({ resolve: replyResolve, reject: replyReject }));

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) continue;
        pending.shift()?.resolve(line);
      }
    });
    socket.once("error", fail);
    socket.once("timeout", () => fail(new Error("SMTP timeout")));

    const command = async (value: string, expected: number[]) => {
      socket.write(`${value}\r\n`);
      const reply = await readReply();
      const code = Number(reply.slice(0, 3));
      if (!expected.includes(code)) throw new Error("SMTP rejected request");
    };

    void (async () => {
      try {
        const greeting = await readReply();
        if (Number(greeting.slice(0, 3)) !== 220) throw new Error("SMTP connection rejected");
        await command("EHLO korpus-site", [250]);
        await command("AUTH LOGIN", [334]);
        await command(Buffer.from(config.user).toString("base64"), [334]);
        await command(Buffer.from(config.password).toString("base64"), [235]);
        await command(`MAIL FROM:<${cleanHeader(config.from)}>`, [250]);
        await command(`RCPT TO:<${cleanHeader(config.to)}>`, [250, 251]);
        await command("DATA", [354]);
        const escapedMessage = message.replace(/^\./gm, "..");
        socket.write(`${escapedMessage}\r\n.\r\n`);
        const dataReply = await readReply();
        if (Number(dataReply.slice(0, 3)) !== 250) throw new Error("SMTP message rejected");
        await command("QUIT", [221]);
        socket.end();
        resolve();
      } catch (error) {
        fail(error instanceof Error ? error : new Error("SMTP delivery failed"));
      }
    })();
  });
}

export async function sendApplicationEmail(
  data: ApplicationInput,
  photos: PreparedPhoto[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntegrationResult> {
  const config = smtpConfig(env);
  if (!config) return { status: "skipped" };

  const message = await createMimeMessage(data, photos, config);
  await sendViaSecureSmtp(config, message);
  return { status: "sent" };
}

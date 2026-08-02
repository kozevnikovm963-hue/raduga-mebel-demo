#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

PROJECT_DIR="/var/www/korpus"
ENV_FILE="$PROJECT_DIR/.env"
UNIT_SOURCE="$PROJECT_DIR/deploy/korpus-backend.service"
UNIT_TARGET="/etc/systemd/system/korpus-backend.service"
BACKEND_ENTRY="$PROJECT_DIR/dist-server/index.mjs"
SERVICE_NAME="korpus-backend"
APP_USER="korpus"
STATE_FILE="$(mktemp /tmp/korpus-delivery-state.XXXXXX.json)"
START_TIME="$(date --iso-8601=seconds)"

cleanup() {
  rm -f "$STATE_FILE"
}
trap cleanup EXIT

log() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  exit 1
}

if [[ "$EUID" -ne 0 ]]; then
  fail "Run this script with sudo."
fi

for command_name in bash chmod chown curl cut date getent grep install journalctl mktemp node npm runuser sleep systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done

[[ -d "$PROJECT_DIR/.git" ]] || fail "Git repository not found at $PROJECT_DIR."
[[ -f "$ENV_FILE" ]] || fail "Environment file not found at $ENV_FILE."
[[ -f "$UNIT_SOURCE" ]] || fail "Unit template not found at $UNIT_SOURCE."
id "$APP_USER" >/dev/null 2>&1 || fail "System user $APP_USER does not exist."

log "Creating root-only backups"
BACKUP_DIR="/var/backups/korpus-delivery/$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$BACKUP_DIR"
install -m 0600 "$ENV_FILE" "$BACKUP_DIR/korpus.env"
if [[ -f "$UNIT_TARGET" ]]; then
  install -m 0600 "$UNIT_TARGET" "$BACKUP_DIR/korpus-backend.service"
fi
if [[ -f "$BACKEND_ENTRY" ]]; then
  install -m 0600 "$BACKEND_ENTRY" "$BACKUP_DIR/index.mjs"
fi
printf "Backup created: %s\n" "$BACKUP_DIR"

log "Checking the unit template"
grep -Fq "ExecStart=/usr/bin/node /var/www/korpus/dist-server/index.mjs" "$UNIT_SOURCE" \
  || fail "Unit template has an unexpected ExecStart."
grep -Fq "EnvironmentFile=/var/www/korpus/.env" "$UNIT_SOURCE" \
  || fail "Unit template has an unexpected EnvironmentFile."
grep -Fq "StandardOutput=journal" "$UNIT_SOURCE" \
  || fail "Unit template does not route stdout to journald."
grep -Fq "StandardError=journal" "$UNIT_SOURCE" \
  || fail "Unit template does not route stderr to journald."

log "Protecting the environment file"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

log "Adding missing non-secret delivery defaults"
node - "$ENV_FILE" <<'NODE'
const fs = require("node:fs");
const envPath = process.argv[2];
const text = fs.readFileSync(envPath, "utf8");
const existing = new Set();

for (const sourceLine of text.split(/\r?\n/)) {
  const line = sourceLine.trim();
  if (!line || line.startsWith("#") || line.startsWith(";")) continue;
  const equals = line.indexOf("=");
  if (equals > 0) existing.add(line.slice(0, equals).trim());
}

const publicDefaults = [
  ["VK_GROUP_ID", "169502771"],
  ["SMTP_HOST", "smtp.mail.ru"],
  ["SMTP_PORT", "465"],
  ["SMTP_SECURE", "true"],
  ["SMTP_USER", "korpusm2010@mail.ru"],
  ["MAIL_FROM", "korpusm2010@mail.ru"],
  ["MAIL_TO", "korpusm2010@mail.ru"],
];
const additions = publicDefaults.filter(([key]) => !existing.has(key));

if (additions.length > 0) {
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
  const block = additions.map(([key, value]) => key + "=" + value).join("\n") + "\n";
  fs.appendFileSync(envPath, separator + block, { mode: 0o600 });
}

for (const [key] of additions) console.log(key + ": ADDED_PUBLIC_DEFAULT");
if (additions.length === 0) console.log("Public delivery defaults: already present");
NODE
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

log "Installing dependencies and rebuilding the backend"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
runuser -u "$APP_USER" -- env HOME="$APP_HOME" \
  bash -c "cd '$PROJECT_DIR' && npm ci && npm run build:backend"
[[ -f "$BACKEND_ENTRY" ]] || fail "Backend build did not create $BACKEND_ENTRY."
grep -Fq "application.received" "$BACKEND_ENTRY" \
  || fail "The backend bundle does not contain current application logging."
grep -Fq "application.accepted" "$BACKEND_ENTRY" \
  || fail "The backend bundle does not contain the accepted outcome."
grep -Fq "ALL_DELIVERY_CHANNELS_FAILED" "$BACKEND_ENTRY" \
  || fail "The backend bundle does not contain the dual-channel failure rule."

log "Installing and restarting the systemd service"
install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

for attempt in {1..20}; do
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    break
  fi
  sleep 0.25
done
systemctl is-active --quiet "$SERVICE_NAME" || {
  systemctl status "$SERVICE_NAME" --no-pager >&2 || true
  fail "The backend service is not active."
}

MAIN_PID="$(systemctl show "$SERVICE_NAME" --property=MainPID --value)"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ ]] || fail "systemd did not provide a valid backend PID."
[[ -r "/proc/$MAIN_PID/environ" ]] || fail "Cannot inspect the active backend environment."

UNIT_EXEC="$(systemctl show "$SERVICE_NAME" --property=ExecStart --value)"
UNIT_ENV_FILES="$(systemctl show "$SERVICE_NAME" --property=EnvironmentFiles --value)"
UNIT_STDOUT="$(systemctl show "$SERVICE_NAME" --property=StandardOutput --value)"
UNIT_STDERR="$(systemctl show "$SERVICE_NAME" --property=StandardError --value)"

[[ "$UNIT_EXEC" == *"/usr/bin/node /var/www/korpus/dist-server/index.mjs"* ]] \
  || fail "The active service uses an unexpected ExecStart."
[[ "$UNIT_ENV_FILES" == *"/var/www/korpus/.env"* ]] \
  || fail "The active service does not load /var/www/korpus/.env."
[[ "$UNIT_STDOUT" == "journal" ]] || fail "The active service stdout is not journald."
[[ "$UNIT_STDERR" == "journal" ]] || fail "The active service stderr is not journald."

log "Checking health"
HEALTH_RESPONSE=""
for attempt in {1..40}; do
  if HEALTH_RESPONSE="$(curl --silent --show-error --fail http://127.0.0.1:3000/api/health 2>/dev/null)"; then
    break
  fi
  sleep 0.25
done
[[ "$HEALTH_RESPONSE" == *'"ok":true'* ]] || fail "Backend health check returned an unexpected response."
printf "/api/health: OK\n"

log "Validating environment and testing delivery channels"
node - "$ENV_FILE" "$MAIN_PID" "$STATE_FILE" <<'NODE'
const fs = require("node:fs");
const tls = require("node:tls");
const readline = require("node:readline");
const crypto = require("node:crypto");

const envPath = process.argv[2];
const mainPid = process.argv[3];
const statePath = process.argv[4];

const requiredKeys = [
  "VK_TOKEN",
  "VK_GROUP_ID",
  "VK_RECEIVER_ID",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
  "MAIL_TO",
];
const optionalKeys = new Set([
  "NODE_ENV",
  "HOST",
  "PORT",
  "NEXT_PUBLIC_FORM_ENDPOINT",
  ...requiredKeys,
]);
const wrongAliases = new Map([
  ["SMTP_FROM", "MAIL_FROM"],
  ["SMTP_TO", "MAIL_TO"],
  ["EMAIL_FROM", "MAIL_FROM"],
  ["EMAIL_TO", "MAIL_TO"],
  ["VK_PEER_ID", "VK_RECEIVER_ID"],
]);

function safeResult(ok, code, explanation) {
  return { ok, code, explanation };
}

function printStatus(scope, key, status, explanation = "") {
  const suffix = explanation ? " — " + explanation : "";
  console.log(scope + " " + key + ": " + status + suffix);
}

function valueFormatValid(key, value) {
  if (key === "VK_TOKEN") return value.length >= 20 && !/\s/.test(value);
  if (key === "VK_GROUP_ID") return /^[1-9]\d*$/.test(value);
  if (key === "VK_RECEIVER_ID") return /^-?[1-9]\d*$/.test(value);
  if (key === "SMTP_HOST") return /^[A-Za-z0-9.-]+$/.test(value);
  if (key === "SMTP_PORT") {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }
  if (key === "SMTP_SECURE") return value.toLowerCase() === "true";
  if (key === "SMTP_USER" || key === "MAIL_FROM" || key === "MAIL_TO") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  if (key === "SMTP_PASSWORD") return value.length >= 8 && !/[\r\n]/.test(value);
  return !/[\r\n]/.test(value);
}

function parseEnvironmentFile(text) {
  const values = new Map();
  const invalid = new Set();
  const duplicates = new Set();
  const unknown = new Set();
  const aliases = new Map();
  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line.trim() || line.trimStart().startsWith("#") || line.trimStart().startsWith(";")) continue;

    const equals = line.indexOf("=");
    if (equals < 1) {
      console.log("ENV LINE " + (index + 1) + ": INVALID_FORMAT — expected NAME=value");
      continue;
    }

    const rawKey = line.slice(0, equals);
    const rawValue = line.slice(equals + 1);
    const key = rawKey.trim();
    let value = rawValue;

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || rawKey !== key) invalid.add(key || "LINE_" + (index + 1));
    if (values.has(key)) duplicates.add(key);
    if (rawValue !== rawValue.trim()) invalid.add(key);
    if (rawValue.endsWith("\\")) invalid.add(key);

    const startsQuote = rawValue.startsWith('"') || rawValue.startsWith("'");
    const endsQuote = rawValue.endsWith('"') || rawValue.endsWith("'");
    if (startsQuote || endsQuote) {
      invalid.add(key);
      if (
        rawValue.length >= 2 &&
        ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
          (rawValue.startsWith("'") && rawValue.endsWith("'")))
      ) {
        value = rawValue.slice(1, -1);
      }
    }

    if (!optionalKeys.has(key)) unknown.add(key);
    if (wrongAliases.has(key)) aliases.set(key, wrongAliases.get(key));
    values.set(key, value);
  }

  for (const key of duplicates) invalid.add(key);
  return { values, invalid, duplicates, unknown, aliases };
}

function processEnvironment(pid) {
  const entries = fs.readFileSync("/proc/" + pid + "/environ").toString("utf8").split("\0");
  const values = new Map();
  for (const entry of entries) {
    const equals = entry.indexOf("=");
    if (equals > 0) values.set(entry.slice(0, equals), entry.slice(equals + 1));
  }
  return values;
}

const parsed = parseEnvironmentFile(fs.readFileSync(envPath, "utf8"));
const activeEnv = processEnvironment(mainPid);
let envFileOk = true;
let activeEnvOk = true;

for (const [alias, expected] of parsed.aliases) {
  printStatus("ENV", alias, "INVALID_FORMAT", "backend expects " + expected);
  envFileOk = false;
}
for (const key of parsed.unknown) {
  if (!wrongAliases.has(key)) printStatus("ENV", key, "INVALID_FORMAT", "unknown variable name");
  envFileOk = false;
}
for (const key of parsed.duplicates) {
  printStatus("ENV", key, "INVALID_FORMAT", "duplicate variable");
  envFileOk = false;
}

for (const key of requiredKeys) {
  let fileStatus = "PRESENT";
  if (!parsed.values.has(key)) fileStatus = "MISSING";
  else if (parsed.values.get(key) === "") fileStatus = "EMPTY";
  else if (parsed.invalid.has(key) || !valueFormatValid(key, parsed.values.get(key))) {
    fileStatus = "INVALID_FORMAT";
  }
  printStatus("ENV", key, fileStatus);
  if (fileStatus !== "PRESENT") envFileOk = false;

  let processStatus = "PRESENT";
  if (!activeEnv.has(key)) processStatus = "MISSING";
  else if (activeEnv.get(key) === "") processStatus = "EMPTY";
  else if (!valueFormatValid(key, activeEnv.get(key))) processStatus = "INVALID_FORMAT";
  else if (fileStatus === "PRESENT" && activeEnv.get(key) !== parsed.values.get(key)) {
    processStatus = "INVALID_FORMAT";
  }
  printStatus("SYSTEMD_ENV", key, processStatus);
  if (processStatus !== "PRESENT") activeEnvOk = false;
}

function vkExplanation(code) {
  const known = {
    5: "VK token is invalid or expired; create a new community token.",
    7: "VK token does not have permission for this method.",
    15: "Access to the VK group or conversation is denied.",
    27: "VK community authorization failed.",
    100: "A VK parameter has an invalid format.",
    901: "The VK recipient does not allow messages from the community.",
    902: "The VK recipient privacy settings block this message.",
    914: "The VK recipient blocked community messages.",
    917: "VK_RECEIVER_ID does not identify an available conversation.",
  };
  return known[code] || "VK API rejected the request; verify the token, group and receiver.";
}

async function vkCall(method, params) {
  const body = new URLSearchParams({
    ...params,
    access_token: activeEnv.get("VK_TOKEN"),
    v: "5.199",
  });
  const response = await fetch("https://api.vk.com/method/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) {
    throw safeResult(false, "VK_HTTP_" + response.status, "VK API is unavailable over HTTPS.");
  }
  if (result.error) {
    const apiCode = Number(result.error.error_code || 0);
    throw safeResult(false, "VK_API_" + apiCode, vkExplanation(apiCode));
  }
  return result.response;
}

async function diagnoseVk() {
  for (const key of ["VK_TOKEN", "VK_GROUP_ID", "VK_RECEIVER_ID"]) {
    if (!activeEnv.has(key) || !valueFormatValid(key, activeEnv.get(key))) {
      return safeResult(false, "VK_CONFIG_INVALID", key + " is missing or has an invalid format.");
    }
  }

  try {
    try {
      await vkCall("groups.getTokenPermissions", {});
      console.log("VK TOKEN: OK");
    } catch (error) {
      if (error && error.code !== "VK_API_3") throw error;
      console.log("VK TOKEN: checked through messaging methods");
    }

    const groups = await vkCall("groups.getById", {
      group_id: activeEnv.get("VK_GROUP_ID"),
    });
    const groupList = Array.isArray(groups) ? groups : groups && groups.groups;
    const group = Array.isArray(groupList) ? groupList[0] : null;
    if (!group || String(group.id) !== activeEnv.get("VK_GROUP_ID")) {
      return safeResult(false, "VK_GROUP_MISMATCH", "VK_GROUP_ID does not match the accessible community.");
    }
    console.log("VK GROUP ACCESS: OK");

    await vkCall("messages.getConversation", {
      peer_id: activeEnv.get("VK_RECEIVER_ID"),
    });
    console.log("VK RECEIVER: OK");

    await vkCall("messages.send", {
      peer_id: activeEnv.get("VK_RECEIVER_ID"),
      group_id: activeEnv.get("VK_GROUP_ID"),
      random_id: String(crypto.randomInt(1, 2147483647)),
      message: "Техническая проверка канала заявок KORPUS. Действий не требуется.",
    });
    console.log("VK TEST MESSAGE: OK");
    return safeResult(true, "OK", "Test message delivered.");
  } catch (error) {
    if (error && typeof error.code === "string") return error;
    const timeout = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return timeout
      ? safeResult(false, "VK_TIMEOUT", "VK API did not respond in time.")
      : safeResult(false, "VK_NETWORK_ERROR", "Cannot connect to the VK API.");
  }
}

class SmtpDiagnosticError extends Error {
  constructor(code, explanation) {
    super(explanation);
    this.code = code;
    this.explanation = explanation;
  }
}

function smtpExplanation(stage, code) {
  if (stage === "AUTH" && code === 535) {
    return "Mail.ru rejected authentication; replace SMTP_PASSWORD with an application password.";
  }
  if (stage === "MAIL_FROM" && (code === 550 || code === 553)) {
    return "Mail.ru rejected MAIL_FROM; it must match the authorized mailbox.";
  }
  if (stage === "RCPT_TO" && code >= 500) {
    return "Mail.ru rejected MAIL_TO; verify the recipient address.";
  }
  return "SMTP command " + stage + " was rejected.";
}

function timeout(promise, milliseconds, code, explanation) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SmtpDiagnosticError(code, explanation)), milliseconds);
    }),
  ]);
}

async function diagnoseEmail() {
  const emailKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM",
    "MAIL_TO",
  ];
  for (const key of emailKeys) {
    if (!activeEnv.has(key) || !valueFormatValid(key, activeEnv.get(key))) {
      return safeResult(false, "EMAIL_CONFIG_INVALID", key + " is missing or has an invalid format.");
    }
  }
  if (activeEnv.get("SMTP_HOST").toLowerCase() !== "smtp.mail.ru") {
    return safeResult(false, "SMTP_HOST_INVALID", "For Mail.ru use SMTP_HOST=smtp.mail.ru.");
  }
  if (activeEnv.get("SMTP_PORT") !== "465" || activeEnv.get("SMTP_SECURE").toLowerCase() !== "true") {
    return safeResult(false, "SMTP_TLS_CONFIG_INVALID", "For Mail.ru use port 465 with SMTP_SECURE=true.");
  }
  if (activeEnv.get("SMTP_USER").toLowerCase() !== activeEnv.get("MAIL_FROM").toLowerCase()) {
    return safeResult(false, "SMTP_FROM_MISMATCH", "MAIL_FROM must match SMTP_USER.");
  }

  let socket;
  let lines;
  try {
    socket = tls.connect({
      host: activeEnv.get("SMTP_HOST"),
      port: Number(activeEnv.get("SMTP_PORT")),
      servername: activeEnv.get("SMTP_HOST"),
      rejectUnauthorized: true,
    });
    lines = readline.createInterface({ input: socket, crlfDelay: Infinity });
    const iterator = lines[Symbol.asyncIterator]();

    await timeout(
      new Promise((resolve, reject) => {
        socket.once("secureConnect", resolve);
        socket.once("error", reject);
      }),
      15000,
      "SMTP_TLS_TIMEOUT",
      "TLS connection to Mail.ru timed out.",
    );
    if (!socket.authorized) {
      throw new SmtpDiagnosticError("SMTP_TLS_CERTIFICATE_ERROR", "Mail.ru TLS certificate validation failed.");
    }
    console.log("SMTP TLS: OK");

    async function readReply() {
      let replyCode = null;
      while (true) {
        const item = await timeout(
          iterator.next(),
          15000,
          "SMTP_REPLY_TIMEOUT",
          "Mail.ru did not return an SMTP reply in time.",
        );
        if (item.done) throw new SmtpDiagnosticError("SMTP_CONNECTION_CLOSED", "Mail.ru closed the SMTP connection.");
        const match = /^(\d{3})([ -])/.exec(item.value);
        if (!match) continue;
        if (replyCode === null) replyCode = Number(match[1]);
        if (match[2] === " ") return Number(match[1]);
      }
    }

    async function command(value, expected, stage) {
      socket.write(value + "\r\n");
      const code = await readReply();
      if (!expected.includes(code)) {
        throw new SmtpDiagnosticError(
          "SMTP_" + stage + "_" + code,
          smtpExplanation(stage, code),
        );
      }
      return code;
    }

    const greeting = await readReply();
    if (greeting !== 220) {
      throw new SmtpDiagnosticError("SMTP_GREETING_" + greeting, "Mail.ru returned an unexpected greeting.");
    }
    await command("EHLO korpus-site", [250], "EHLO");
    await command("AUTH LOGIN", [334], "AUTH");
    await command(Buffer.from(activeEnv.get("SMTP_USER")).toString("base64"), [334], "AUTH_USER");
    await command(Buffer.from(activeEnv.get("SMTP_PASSWORD")).toString("base64"), [235], "AUTH");
    console.log("SMTP AUTH: OK");

    await command("MAIL FROM:<" + activeEnv.get("MAIL_FROM") + ">", [250], "MAIL_FROM");
    await command("RCPT TO:<" + activeEnv.get("MAIL_TO") + ">", [250, 251], "RCPT_TO");
    await command("DATA", [354], "DATA");
    const messageId = crypto.randomUUID() + "@korpus-site";
    const message = [
      "From: <" + activeEnv.get("MAIL_FROM") + ">",
      "To: <" + activeEnv.get("MAIL_TO") + ">",
      "Subject: KORPUS delivery diagnostic",
      "Date: " + new Date().toUTCString(),
      "Message-ID: <" + messageId + ">",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      "Техническая проверка email-канала заявок KORPUS. Действий не требуется.",
    ].join("\r\n");
    socket.write(message.replace(/^\./gm, "..") + "\r\n.\r\n");
    const dataCode = await readReply();
    if (dataCode !== 250) {
      throw new SmtpDiagnosticError(
        "SMTP_MESSAGE_" + dataCode,
        smtpExplanation("MESSAGE", dataCode),
      );
    }
    await command("QUIT", [221], "QUIT");
    console.log("SMTP TEST EMAIL: OK");
    return safeResult(true, "OK", "Test email delivered.");
  } catch (error) {
    if (error instanceof SmtpDiagnosticError) {
      return safeResult(false, error.code, error.explanation);
    }
    const code = error && typeof error.code === "string" ? error.code : "UNKNOWN";
    const safeNetworkCodes = {
      ENOTFOUND: "SMTP host cannot be resolved.",
      ECONNREFUSED: "SMTP connection was refused.",
      ECONNRESET: "SMTP connection was reset.",
      ETIMEDOUT: "SMTP connection timed out.",
      CERT_HAS_EXPIRED: "SMTP TLS certificate has expired.",
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: "SMTP TLS certificate cannot be verified.",
    };
    return safeResult(
      false,
      "SMTP_NETWORK_" + code,
      safeNetworkCodes[code] || "Cannot establish a secure SMTP connection.",
    );
  } finally {
    if (lines) lines.close();
    if (socket && !socket.destroyed) socket.destroy();
  }
}

async function diagnoseApplication() {
  try {
    const form = new FormData();
    form.set("name", "Техническая проверка");
    form.set("phone", "+7 900 000-00-00");
    form.set("furnitureType", "Другое");
    form.set("comment", "Автоматическая проверка доставки. Действий не требуется.");
    form.set("website", "");
    const response = await fetch("http://127.0.0.1:3000/api/application", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json();
    if (response.status === 200 && payload && payload.ok === true) {
      return safeResult(true, "OK", "Backend accepted the application.");
    }
    return safeResult(
      false,
      "APPLICATION_HTTP_" + response.status,
      response.status === 503
        ? "Both delivery channels failed."
        : "Backend rejected the diagnostic application.",
    );
  } catch (error) {
    const timeout = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return timeout
      ? safeResult(false, "APPLICATION_TIMEOUT", "Backend did not answer in time.")
      : safeResult(false, "APPLICATION_REQUEST_ERROR", "Cannot submit a diagnostic application.");
  }
}

async function main() {
  const vk = await diagnoseVk();
  console.log("VK DIAGNOSTIC: " + (vk.ok ? "OK" : vk.code + " — " + vk.explanation));
  const email = await diagnoseEmail();
  console.log("EMAIL DIAGNOSTIC: " + (email.ok ? "OK" : email.code + " — " + email.explanation));
  const application = await diagnoseApplication();
  fs.writeFileSync(
    statePath,
    JSON.stringify({ envFileOk, activeEnvOk, vk, email, application }),
    { mode: 0o600 },
  );
}

main().catch(() => {
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      envFileOk: false,
      activeEnvOk: false,
      vk: safeResult(false, "VK_DIAGNOSTIC_ERROR", "VK diagnostic could not complete."),
      email: safeResult(false, "EMAIL_DIAGNOSTIC_ERROR", "Email diagnostic could not complete."),
      application: safeResult(false, "APPLICATION_DIAGNOSTIC_ERROR", "Application diagnostic could not complete."),
    }),
    { mode: 0o600 },
  );
});
NODE

log "Checking backend journal events"
JOURNAL_OUTPUT="$(journalctl -u "$SERVICE_NAME" --since "$START_TIME" --no-pager -o cat)"
grep -Fq '"event":"backend.started"' <<<"$JOURNAL_OUTPUT" \
  || fail "The current backend startup event is missing from journald."
grep -Fq '"event":"application.received"' <<<"$JOURNAL_OUTPUT" \
  || fail "The diagnostic application was not logged."
grep -Fq '"channel":"vk"' <<<"$JOURNAL_OUTPUT" \
  || fail "The VK channel result was not logged."
grep -Fq '"channel":"email"' <<<"$JOURNAL_OUTPUT" \
  || fail "The email channel result was not logged."
if ! grep -Eq '"event":"application\.(accepted|failed)"' <<<"$JOURNAL_OUTPUT"; then
  fail "The final application outcome is missing from journald."
fi
printf "JOURNAL LOGGING: OK\n"

log "Final delivery result"
node - "$STATE_FILE" <<'NODE'
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

function resultLine(name, result) {
  return name + ": " + (result.ok ? "OK" : result.code + " — " + result.explanation);
}

console.log(resultLine("VK", state.vk));
console.log(resultLine("EMAIL", state.email));
console.log(
  "SYSTEMD: " +
    (state.activeEnvOk && state.envFileOk
      ? "OK"
      : "ENVIRONMENT_ERROR — .env or the active process has missing or invalid variables."),
);
console.log("BACKEND: OK");
console.log(resultLine("APPLICATION FORM", state.application));

if (
  !state.activeEnvOk ||
  !state.envFileOk ||
  (!state.vk.ok && !state.email.ok) ||
  !state.application.ok
) {
  process.exitCode = 2;
}
NODE

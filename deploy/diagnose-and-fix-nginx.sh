#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="/var/www/korpus"
PUBLIC_DIR="${PROJECT_DIR}/out"
SOURCE_CONFIG="${PROJECT_DIR}/deploy/nginx-korpus.conf"
NGINX_CONFIG="/etc/nginx/sites-available/korpus"
NGINX_LINK="/etc/nginx/sites-enabled/korpus"
DEFAULT_LINK="/etc/nginx/sites-enabled/default"
SERVER_IP="135.106.180.226"
APP_USER="korpus"
WEB_USER="www-data"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  fail "Run this script with sudo."
fi

for command_name in curl find git install nginx npm runuser systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
done

[[ -d "${PROJECT_DIR}/.git" ]] || fail "Git repository not found at ${PROJECT_DIR}."
[[ -f "${SOURCE_CONFIG}" ]] || fail "Nginx config not found at ${SOURCE_CONFIG}."
id "${APP_USER}" >/dev/null 2>&1 || fail "System user ${APP_USER} does not exist."
id "${WEB_USER}" >/dev/null 2>&1 || fail "System user ${WEB_USER} does not exist."

required_output=(
  "${PUBLIC_DIR}/index.html"
  "${PUBLIC_DIR}/privacy/index.html"
  "${PUBLIC_DIR}/_next/static"
)

output_is_complete=true
for output_path in "${required_output[@]}"; do
  if [[ ! -e "${output_path}" ]]; then
    output_is_complete=false
    printf 'Missing: %s\n' "${output_path}"
  fi
done

if [[ "${output_is_complete}" != true ]]; then
  log "Static export is incomplete; rebuilding it"
  runuser -u "${APP_USER}" -- bash -lc "cd '${PROJECT_DIR}' && npm ci && npm run build:selectel"
fi

log "Checking required frontend files"
[[ -f "${PUBLIC_DIR}/index.html" ]] || fail "Missing ${PUBLIC_DIR}/index.html after build."
[[ -f "${PUBLIC_DIR}/privacy/index.html" ]] || fail "Missing ${PUBLIC_DIR}/privacy/index.html after build."
[[ -d "${PUBLIC_DIR}/_next/static" ]] || fail "Missing ${PUBLIC_DIR}/_next/static after build."
printf 'Found: %s\n' "${required_output[@]}"

log "Applying read-only public permissions to the exported frontend"
chmod 0711 "${PROJECT_DIR}"
chmod 0755 "${PUBLIC_DIR}"
find "${PUBLIC_DIR}" -type d -exec chmod 0755 {} +
find "${PUBLIC_DIR}" -type f -exec chmod 0644 {} +

runuser -u "${WEB_USER}" -- test -r "${PUBLIC_DIR}/index.html" \
  || fail "${WEB_USER} cannot read index.html."
runuser -u "${WEB_USER}" -- test -r "${PUBLIC_DIR}/privacy/index.html" \
  || fail "${WEB_USER} cannot read privacy/index.html."
runuser -u "${WEB_USER}" -- test -x "${PUBLIC_DIR}/_next/static" \
  || fail "${WEB_USER} cannot traverse _next/static."
printf '%s can read the frontend export.\n' "${WEB_USER}"

log "Installing the KORPUS Nginx server block"
if [[ -e "${NGINX_LINK}" && ! -L "${NGINX_LINK}" ]]; then
  fail "${NGINX_LINK} exists and is not a symbolic link; inspect it manually."
fi

backup_config=""
if [[ -f "${NGINX_CONFIG}" ]]; then
  backup_config="$(mktemp /tmp/korpus-nginx.XXXXXX.conf)"
  cp --preserve=mode "${NGINX_CONFIG}" "${backup_config}"
fi

install -m 0644 "${SOURCE_CONFIG}" "${NGINX_CONFIG}"

if [[ -e "${DEFAULT_LINK}" || -L "${DEFAULT_LINK}" ]]; then
  unlink "${DEFAULT_LINK}"
  printf 'Disabled: %s\n' "${DEFAULT_LINK}"
fi

ln -sfn "${NGINX_CONFIG}" "${NGINX_LINK}"

log "Checking active server configuration"
printf 'Enabled sites:\n'
find /etc/nginx/sites-enabled -maxdepth 1 -mindepth 1 -printf '  %f -> %l\n'

if ! nginx -t; then
  if [[ -n "${backup_config}" ]]; then
    install -m 0644 "${backup_config}" "${NGINX_CONFIG}"
    printf 'Restored the previous KORPUS config after failed validation.\n' >&2
  fi
  fail "nginx -t failed; Nginx was not reloaded."
fi

active_config="$(nginx -T 2>&1)"
grep -Fq 'listen 80 default_server;' <<<"${active_config}" \
  || fail "The active configuration has no IPv4 default_server for KORPUS."
grep -Fq 'root /var/www/korpus/out;' <<<"${active_config}" \
  || fail "The active configuration does not contain the KORPUS frontend root."
grep -Fq 'proxy_pass http://127.0.0.1:3000;' <<<"${active_config}" \
  || fail "The active configuration does not contain the backend proxy."

systemctl reload nginx
rm -f "${backup_config:-}"

check_status() {
  local path="$1"
  local expected="$2"
  local status
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --header "Host: ${SERVER_IP}" "http://127.0.0.1${path}")"
  printf '%s -> HTTP %s\n' "${path}" "${status}"
  [[ "${status}" == "${expected}" ]] || fail "Expected HTTP ${expected} for ${path}, got ${status}."
}

log "Checking the site through Nginx"
check_status "/" "200"
check_status "/privacy/" "200"

health_response="$(curl --silent --show-error --fail \
  --header "Host: ${SERVER_IP}" "http://127.0.0.1/api/health")"
[[ "${health_response}" == *'"ok":true'* ]] \
  || fail "Unexpected /api/health response."
printf '/api/health -> %s\n' "${health_response}"

log "KORPUS frontend and API checks passed"

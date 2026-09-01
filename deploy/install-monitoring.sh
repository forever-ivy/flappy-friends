#!/usr/bin/env bash
# Install Umami + Uptime Kuma on the hyunlix.top VPS (CentOS 7 / any Docker host).
# Run as root on the VPS, from a checkout of this repo:
#   bash deploy/install-monitoring.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UMAMI_DIR="${UMAMI_DIR:-/opt/umami}"
KUMA_DIR="${KUMA_DIR:-/opt/uptime-kuma}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Install Docker first, then re-run."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not found."
  exit 1
fi

rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

echo "==> Umami → ${UMAMI_DIR}"
mkdir -p "${UMAMI_DIR}"
cp "${ROOT}/deploy/umami/docker-compose.yml" "${UMAMI_DIR}/docker-compose.yml"
if [[ ! -f "${UMAMI_DIR}/.env" ]]; then
  cat > "${UMAMI_DIR}/.env" <<EOF
UMAMI_DB_PASSWORD=$(rand)
UMAMI_APP_SECRET=$(rand)$(rand)
EOF
  echo "    wrote ${UMAMI_DIR}/.env (secrets generated)"
fi
(cd "${UMAMI_DIR}" && docker compose up -d)
echo "    Umami listening on 127.0.0.1:3000"

echo "==> Uptime Kuma → ${KUMA_DIR}"
mkdir -p "${KUMA_DIR}"
cp "${ROOT}/deploy/uptime-kuma/docker-compose.yml" "${KUMA_DIR}/docker-compose.yml"
(cd "${KUMA_DIR}" && docker compose up -d)
echo "    Uptime Kuma listening on 127.0.0.1:3001"

if [[ -d /etc/nginx/conf.d ]]; then
  echo "==> Nginx snippets"
  cp "${ROOT}/deploy/nginx.stats.hyunlix.conf" /etc/nginx/conf.d/stats.hyunlix.conf
  cp "${ROOT}/deploy/nginx.status.hyunlix.conf" /etc/nginx/conf.d/status.hyunlix.conf
  if nginx -t; then
    systemctl reload nginx || service nginx reload || true
    echo "    nginx reloaded (HTTP only until certbot)"
  else
    echo "    nginx -t failed; fix configs before reload"
  fi
else
  echo "==> Skip nginx (no /etc/nginx/conf.d). Copy deploy/nginx.*.hyunlix.conf manually."
fi

echo
echo "Next steps:"
echo "  1. NameSilo A records:  stats → VPS IP ,  status → VPS IP"
echo "  2. certbot --nginx -d stats.hyunlix.top"
echo "  3. certbot --nginx -d status.hyunlix.top"
echo "  4. Open https://stats.hyunlix.top  (admin/umami → change password)"
echo "     Create website for https://hyunlix.top → copy Website ID"
echo "  5. Open https://status.hyunlix.top → add monitors for / and /api/health"
echo "  6. Rebuild game with Umami env (see deploy/MONITORING.md)"
echo "Done."

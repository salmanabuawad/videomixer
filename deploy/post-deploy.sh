#!/usr/bin/env bash
# Run ON THE SERVER after files are in /opt/zymtech_innovation (or set APP_ROOT).
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/zymtech_innovation}"
cd "$APP_ROOT"

if [[ ! -f .venv/bin/activate ]]; then
  python3.11 -m venv .venv 2>/dev/null || python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt

# Frontend (Vite) — build on server when local deploy machine has no Node/npm.
if [[ -f frontend/package.json ]] && command -v npm >/dev/null 2>&1; then
  echo "Building frontend (npm install && npm run build)..."
  (cd frontend && npm install && npm run build)
elif [[ ! -f frontend/dist/index.html ]]; then
  echo "WARNING: frontend/dist missing and npm not found. Install Node.js on the server or build locally before deploy."
fi

sudo mkdir -p data/uploads data/renders
sudo chown -R www-data:www-data data 2>/dev/null || true

if [[ -f /etc/systemd/system/zymtech.service ]]; then
  sudo systemctl daemon-reload
  sudo systemctl restart zymtech.service
  sudo systemctl status zymtech.service --no-pager || true
else
  echo "Tip: install deploy/zymtech.service first (see deploy/README.md)."
fi

echo "Post-deploy done. Check: curl -sS http://127.0.0.1:8025/api/health (after systemd unit is installed; see deploy/zymtech.service)"

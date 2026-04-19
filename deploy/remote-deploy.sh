#!/usr/bin/env bash
# One-shot deploy from your dev machine (Git Bash / WSL / Linux) when Node + SSH work.
# Usage:
#   chmod +x deploy/remote-deploy.sh
#   ./deploy/remote-deploy.sh [user@host] [remote_dir]
# Example:
#   ./deploy/remote-deploy.sh root@185.229.226.37 /opt/zymtech_innovation
set -euo pipefail
REMOTE="${1:-root@185.229.226.37}"
DEST="${2:-/opt/zymtech_innovation}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/frontend"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js LTS or run deploy/build-release.ps1 on Windows."
  exit 1
fi
npm ci
npm run build

echo "Syncing to ${REMOTE}:${DEST} ..."
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'frontend/node_modules' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude 'data/uploads' \
  --exclude 'data/renders' \
  --exclude '.env' \
  "$ROOT/" "${REMOTE}:${DEST}/"

echo "Running remote post-deploy ..."
# tr strips CR so Windows-checked-out scripts still parse under bash.
tr -d '\r' < "$(dirname "$0")/post-deploy.sh" | ssh "$REMOTE" "export APP_ROOT='$DEST'; bash -s"

echo "Done. Test: curl -sS https://mixer.wavelync.com/api/health"

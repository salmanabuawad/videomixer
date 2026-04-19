# Deploy on `mixer.wavelync.com` (Ubuntu-style)

Target server IP for DNS: **185.229.226.37** (A record for `mixer.wavelync.com` → this IP).

Stack: your **existing Nginx** (TLS + reverse proxy) → **Uvicorn** on `127.0.0.1:8000` → **PostgreSQL** on localhost.

Do **not** commit real passwords or API keys; keep them only in `/opt/zymtech_innovation/.env` on the server.

## 1. DNS

At your DNS host, create:

- **A** record: `mixer` → `185.229.226.37` (or the apex if you use a subdomain already named `mixer.wavelync.com`).

Wait for propagation before running Certbot.

## 2. Server packages

Install what you still need. **Skip `nginx` if it is already installed and in use.**

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip postgresql ffmpeg git
# Only if Nginx is not installed yet:
# sudo apt install -y nginx
# For HTTPS with Nginx (if not already present):
# sudo apt install -y certbot python3-certbot-nginx
```

Ensure `ffmpeg` and `ffprobe` work: `ffmpeg -version`.

## 3. PostgreSQL database

```bash
sudo -u postgres psql -c "CREATE USER your_user WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "CREATE DATABASE your_db OWNER your_user;"
```

Set `DATABASE_URL` in `.env` to match, e.g.:

`postgresql+psycopg2://your_user:your_secure_password@127.0.0.1:5432/your_db`

## 4. Application directory

Example layout (adjust paths if you prefer):

```bash
sudo mkdir -p /opt/zymtech_innovation
sudo chown $USER:$USER /opt/zymtech_innovation
```

Copy or clone the project into `/opt/zymtech_innovation`, then on your **dev machine** build the frontend and sync `frontend/dist` to the server, **or** on the server:

```bash
cd /opt/zymtech_innovation
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
```

Copy `deploy/env.production.example` to `.env` and edit `OPENAI_API_KEY`, `DATABASE_URL`, paths, and `CORS_ORIGINS`.

```bash
sudo mkdir -p data/uploads data/renders
sudo chown -R www-data:www-data data
```

Set ownership of the app tree if the service runs as `www-data`:

```bash
sudo chown -R www-data:www-data /opt/zymtech_innovation
```

## 5. systemd

```bash
sudo cp deploy/zymtech.service /etc/systemd/system/zymtech.service
# Edit paths inside the unit file if your install dir is not /opt/zymtech_innovation
sudo systemctl daemon-reload
sudo systemctl enable --now zymtech.service
sudo systemctl status zymtech.service
```

## 6. Nginx (add a site — keep your existing config)

This app adds **one new `server` block** for `mixer.wavelync.com`. It does not replace your default site or other vhosts.

**Option A — `sites-available` (common on Debian/Ubuntu):**

```bash
sudo cp deploy/nginx-mixer.wavelync.com.conf /etc/nginx/sites-available/mixer.wavelync.com
sudo ln -sf /etc/nginx/sites-available/mixer.wavelync.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Option B — `conf.d` drop-in (some installs):**

```bash
sudo cp deploy/nginx-mixer.wavelync.com.conf /etc/nginx/conf.d/mixer.wavelync.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

If another file already defines `upstream zymtech_mixer`, rename that block in **one** of the files so the name is unique, then `nginx -t` again.

## 7. TLS (Let’s Encrypt)

```bash
sudo certbot --nginx -d mixer.wavelync.com
```

Certbot edits this server block to add HTTPS; keep `proxy_pass` pointing at `127.0.0.1:8000`.

## 8. Smoke test

- Open `https://mixer.wavelync.com`
- `curl -sS https://mixer.wavelync.com/api/health`

## Firewall

Allow HTTP/HTTPS if using `ufw` (only if not already configured):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Deploy when the code is ready

From a machine with **Node.js** (for the React build) and **SSH** to the server:

1. **Git Bash / WSL / Linux** — from the repo root:

   ```bash
   chmod +x deploy/remote-deploy.sh deploy/post-deploy.sh
   ./deploy/remote-deploy.sh root@YOUR_SERVER_IP /opt/zymtech_innovation
   ```

   This runs `npm ci && npm run build` in `frontend/`, **rsync**s the app (excluding `.env`, `node_modules`, `.venv`), then runs **`post-deploy.sh`** on the server (`pip install`, restart `zymtech`).

2. **Windows (PowerShell)** — all-in-one (build + upload + remote `post-deploy`), **after** key-based `ssh root@SERVER` works:

   ```powershell
   cd d:\zymtech_innovation
   .\deploy\deploy-remote.ps1
   ```

   Optional: `.\deploy\deploy-remote.ps1 -RemoteHost "root@185.229.226.37" -RemotePath "/opt/zymtech_innovation"`

   Or build a zip only (no SSH):

   ```powershell
   .\deploy\build-release.ps1
   ```

   Upload `deploy\out\zymtech_release.zip` to the server, extract over `/opt/zymtech_innovation`, keep `.env` on the server, then run:

   ```bash
   export APP_ROOT=/opt/zymtech_innovation
   bash /opt/zymtech_innovation/deploy/post-deploy.sh
   ```

**Note:** Automated deploy from this environment cannot reach your server until your **SSH public key** is in `/root/.ssh/authorized_keys` on the host. See [deploy/keys/README.md](keys/README.md).

## SSH

Use **key-based** SSH (no passwords in scripts). A project public key is kept under [deploy/keys/](keys/) — see [deploy/keys/README.md](keys/README.md) to install it in `/root/.ssh/authorized_keys` on the server.

Do not store private keys or server passwords in this repo.

# Deploy zymtech_innovation to a Linux server over SSH (OpenSSH on Windows).
# Prerequisites:
#   1. Node.js + npm on PATH (for frontend build), OR run build-release.ps1 first.
#   2. Key-based SSH: ssh root@HOST must work without a password (add your .pub to server first).
#
# Usage:
#   cd d:\zymtech_innovation
#   .\deploy\deploy-remote.ps1
#   .\deploy\deploy-remote.ps1 -RemoteHost "root@185.229.226.37" -RemotePath "/opt/zymtech_innovation"

param(
    [string]$RemoteHost = "root@185.229.226.37",
    [string]$RemotePath = "/opt/zymtech_innovation",
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Frontend = Join-Path $Root "frontend"

function Test-Ssh {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $sshCmd = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "IdentitiesOnly=yes")
        if (Test-Path $IdentityFile) { $sshCmd += @("-i", $IdentityFile) }
        $sshCmd += @($RemoteHost, "echo __SSH_OK__")
        $null = & ssh @sshCmd 2>&1
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $prev
    }
}

Write-Host "Testing SSH to $RemoteHost ..."
if (-not (Test-Ssh)) {
    Write-Host ""
    Write-Host "SSH failed (key not accepted). Add your PUBLIC key on the server once:" -ForegroundColor Yellow
    Write-Host "  1) Copy key:  Get-Content `$env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard" -ForegroundColor Cyan
    Write-Host "  2) Log in with password (or console):  ssh $RemoteHost" -ForegroundColor Cyan
    Write-Host "  3) On server:  mkdir -p ~/.ssh && chmod 700 ~/.ssh" -ForegroundColor Cyan
    Write-Host "                echo 'PASTE_KEY_LINE' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" -ForegroundColor Cyan
    Write-Host "  See also: deploy\keys\README.md" -ForegroundColor Cyan
    exit 1
}
Write-Host "SSH OK." -ForegroundColor Green

# --- Frontend build ---
$npm = $null
if (Get-Command npm -ErrorAction SilentlyContinue) { $npm = "npm" }
if (-not $npm) {
    foreach ($p in @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:LocalAppData\Programs\nodejs\npm.cmd"
    )) { if (Test-Path $p) { $npm = $p; break } }
}
if (-not $npm) {
    Write-Host 'npm not found locally; frontend will be built on the server during post-deploy if Node/npm is installed there.' -ForegroundColor Yellow
} else {
    Write-Host "Building frontend with npm ..."
    Push-Location $Frontend
    try {
        if (Test-Path (Join-Path $Frontend "package-lock.json")) {
            if ($npm -eq "npm") { npm ci; npm run build } else { & $npm ci; & $npm run build }
        } else {
            if ($npm -eq "npm") { npm install; npm run build } else { & $npm install; & $npm run build }
        }
    } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $Frontend "dist\index.html"))) {
    Write-Host 'No local frontend/dist; continuing. post-deploy.sh will run npm on the server.' -ForegroundColor Yellow
}

# --- Pack and upload ---
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tarName = "zymtech-deploy-$stamp.tar.gz"
$tmpTar = Join-Path $env:TEMP $tarName

Write-Host "Creating archive..."
$excludes = @(
    ".git", ".venv", "venv", "frontend/node_modules", "__pycache__",
    "KortexdUI", ".env", "data/uploads", "data/renders"
)
$tarArgs = @("-czf", $tmpTar)
foreach ($e in $excludes) { $tarArgs += "--exclude=$e" }
$tarArgs += @("-C", $Root, ".")
& tar @tarArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmpTar)) { Write-Error "tar failed" }

Write-Host "Uploading $tarName -> ${RemoteHost}:${RemotePath}/"
$scpArgs = @("-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes")
if (Test-Path $IdentityFile) { $scpArgs += @("-i", $IdentityFile) }
$scpArgs += @($tmpTar, "${RemoteHost}:/tmp/$tarName")
& scp @scpArgs
if ($LASTEXITCODE -ne 0) { Write-Error "scp failed" }

$remoteScript = @"
set -e
mkdir -p '$RemotePath'
cd '$RemotePath'
tar -xzf '/tmp/$tarName'
rm -f '/tmp/$tarName'
export APP_ROOT='$RemotePath'
bash deploy/post-deploy.sh
"@

Write-Host "Extracting and running post-deploy on server..."
$sshArgs = @("-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes")
if (Test-Path $IdentityFile) { $sshArgs += @("-i", $IdentityFile) }
$sshArgs += @($RemoteHost, $remoteScript)
& ssh @sshArgs
if ($LASTEXITCODE -ne 0) { Write-Error "remote deploy failed" }

Remove-Item -Force $tmpTar -ErrorAction SilentlyContinue
Write-Host "Done. Test: curl -sS https://mixer.wavelync.com/api/health" -ForegroundColor Green

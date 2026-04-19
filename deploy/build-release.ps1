# Build frontend and create a release folder for upload (no secrets).
# Requires: Node.js/npm on PATH.
# Usage:  cd repo root; .\deploy\build-release.ps1
# Output: deploy\out\zymtech_release\  and  deploy\out\zymtech_release.zip

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Out = Join-Path $PSScriptRoot "out"
$Release = Join-Path $Out "zymtech_release"
$Frontend = Join-Path $Root "frontend"

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    foreach ($p in @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:LocalAppData\Programs\nodejs\npm.cmd"
    )) {
        if (Test-Path $p) { $npm = $p; break }
    }
}
if (-not $npm) {
    Write-Error "npm not found. Install Node.js LTS and re-run, or build on the server (see deploy/README.md)."
}

Write-Host "Building frontend..."
Push-Location $Frontend
if ($npm -is [string]) { & $npm ci; & $npm run build } else { & npm ci; & npm run build }
Pop-Location

if (-not (Test-Path (Join-Path $Frontend "dist\index.html"))) {
    Write-Error "frontend/dist missing after build."
}

Write-Host "Staging release..."
if (Test-Path $Release) { Remove-Item -Recurse -Force $Release }
New-Item -ItemType Directory -Force -Path $Release | Out-Null

$copy = @(
    "app",
    "deploy",
    "requirements.txt",
    "README.md",
    ".env.example",
    "frontend\dist"
)
foreach ($c in $copy) {
    $src = Join-Path $Root $c
    if (-not (Test-Path $src)) { Write-Warning "Skip missing: $c"; continue }
    Copy-Item -Recurse -Force $src (Join-Path $Release $c)
}

$zip = Join-Path $Out "zymtech_release.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $Release -DestinationPath $zip -Force

Write-Host "Done:"
Write-Host "  $Release"
Write-Host "  $zip"
Write-Host "Upload zip to the server, extract to /opt/zymtech_innovation, then run deploy/post-deploy.sh"

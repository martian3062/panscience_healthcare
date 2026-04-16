$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Write-Host "Ensuring working directories exist..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Join-Path $backend "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backend "uploads") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $frontend "public") | Out-Null

$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Backend virtual environment not found at $python"
}

Write-Host "Running backend tests..." -ForegroundColor Cyan
Push-Location $backend
& $python -m pytest
Pop-Location

Write-Host "Running frontend typecheck..." -ForegroundColor Cyan
Push-Location $frontend
npm run typecheck

Write-Host "Running frontend production build..." -ForegroundColor Cyan
npm run build
Pop-Location

Write-Host "All checks passed." -ForegroundColor Green

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  throw "Backend virtual environment not found at $python"
}

New-Item -ItemType Directory -Force -Path (Join-Path $backend "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backend "uploads") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $frontend "public") | Out-Null

$backendOut = Join-Path $backend "uvicorn.out.log"
$backendErr = Join-Path $backend "uvicorn.err.log"
$frontendOut = Join-Path $frontend "next.out.log"
$frontendErr = Join-Path $frontend "next.err.log"

Write-Host "Starting backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
$backendProcess = Start-Process `
  -FilePath $python `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
  -WorkingDirectory $backend `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -PassThru

Write-Host "Starting frontend on http://127.0.0.1:3000 ..." -ForegroundColor Cyan
$frontendProcess = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000" `
  -WorkingDirectory $frontend `
  -RedirectStandardOutput $frontendOut `
  -RedirectStandardError $frontendErr `
  -PassThru

Write-Host ""
Write-Host "Frontend PID: $($frontendProcess.Id)" -ForegroundColor Yellow
Write-Host "Backend PID:  $($backendProcess.Id)" -ForegroundColor Yellow
Write-Host "Frontend URL: http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "Backend URL:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host ""
Write-Host "Logs:" -ForegroundColor Cyan
Write-Host "  $frontendOut"
Write-Host "  $frontendErr"
Write-Host "  $backendOut"
Write-Host "  $backendErr"

param(
  [int]$Port = 4173,
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime"
$serverPidFile = Join-Path $runtimeDir "premiosemanal-main.pid"
$serverLog = Join-Path $runtimeDir "premiosemanal-main.log"
$serverErrLog = Join-Path $runtimeDir "premiosemanal-main.err.log"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if ($Build) {
  Push-Location $projectRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

if (Test-Path $serverPidFile) {
  $existingServerPid = Get-Content $serverPidFile -ErrorAction SilentlyContinue
  if ($existingServerPid) {
    $existingServer = Get-Process -Id $existingServerPid -ErrorAction SilentlyContinue
    if ($existingServer) {
      throw "Ja existe um servidor de producao rodando com PID $existingServerPid."
    }
  }
}

Remove-Item $serverLog,$serverErrLog -ErrorAction SilentlyContinue

$previousHost = $env:HOST
$previousPort = $env:PORT
$env:HOST = "127.0.0.1"
$env:PORT = "$Port"

$serverProcess = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "scripts/serve-dist.mjs" `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $serverLog `
  -RedirectStandardError $serverErrLog `
  -WindowStyle Hidden `
  -PassThru

$env:HOST = $previousHost
$env:PORT = $previousPort

Set-Content -Path $serverPidFile -Value $serverProcess.Id

Write-Host "Servidor de producao iniciado em http://127.0.0.1:$Port"
Write-Host "PID do servidor:" $serverProcess.Id

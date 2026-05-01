$ErrorActionPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime"
$pidFiles = @((Join-Path $runtimeDir "premiosemanal-main.pid"))

foreach ($pidFile in $pidFiles) {
  if (-not (Test-Path $pidFile)) {
    continue
  }

  $pidValue = Get-Content $pidFile

  if ($pidValue) {
    $process = Get-Process -Id $pidValue
    if ($process) {
      Stop-Process -Id $pidValue -Force
    }
  }

  Remove-Item $pidFile -Force
}

Write-Host "Processos de producao encerrados."

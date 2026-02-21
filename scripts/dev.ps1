$ErrorActionPreference = "Stop"

Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot\..")

$backend = Start-Process -FilePath npm.cmd -ArgumentList "--workspace","backend","run","dev:safe" -PassThru

try {
  $frontendDist = Join-Path (Get-Location) "frontend\\dist"
  if (-not (Test-Path -LiteralPath $frontendDist)) {
    throw "frontend/dist not found. Run 'npm --workspace frontend run build' once, then run 'npm run dev' again."
  }

  Write-Host "Backend API:  http://127.0.0.1:4000"
  Write-Host "Frontend UI:  http://127.0.0.1:5173"
  python -m http.server 5173 --directory $frontendDist
}
finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  }
}

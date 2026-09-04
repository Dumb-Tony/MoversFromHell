# Headless screenshot of the game, for docs and for eyeballing a layout change.
# Adapted from SomethingsDifferent\tools\shot.ps1 (Dev\INDEX.md -> Tooling & testing).
#
#   .\tools\shot.ps1                                        title screen
#   .\tools\shot.ps1 -Setup tools\_shot-playing.js -Out docs\m0-airport.png
#
# -Setup injects a module that runs AFTER main.js, so it can pose the game through
# window.__MFH before the frame is captured.
param(
  [string]$Setup = "",
  [string]$Out   = "docs\shot.png",
  [int]$Width    = 1600,
  [int]$Height   = 900,
  [int]$Port     = 8388,
  [string]$Query = "",    # extra query params for the page, e.g. "style=cel"
  [int]$Budget   = 12000   # --virtual-time-budget ms; the post chain on SwiftShader needs headroom
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $chrome)) { Write-Host "Chrome not found." -ForegroundColor Red; exit 2 }

# Per-PORT scratch name; see the note in smoketest.ps1.
$scratchName = "_shot-$Port.html"
$scratch = Join-Path $root $scratchName
$html = Get-Content (Join-Path $root "index.html") -Raw -Encoding UTF8
if ($Setup) {
  $inject = "<script type=""module"" src=""$($Setup -replace '\\','/')""></script>`r`n</body>"
  $html = $html -replace '</body>', $inject
}
Set-Content -Path $scratch -Value $html -Encoding utf8

$server = Start-Process powershell `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","$root\tools\serve.ps1","-NoBrowser","-Port","$Port" `
  -WindowStyle Hidden -PassThru

$url = "http://localhost:$Port/$scratchName"
# ?tier=gpu — a screenshot should show what a player with a graphics card sees, and headless
# Chrome IS the software tier, which drops the room lights (see lighting.js). The QUERY GOES
# ONLY TO CHROME: tools/serve.ps1 serves paths, not query strings, so probing the readiness
# of "...html?tier=gpu" never returns 200 and the shot reports "server never came up".
$shotUrl = "$url" + "?tier=gpu"
if ($Query) { $shotUrl = "$shotUrl&$Query" }
$tries = 0; $up = $false
while ($tries -lt 40 -and -not $up) {
  try { if ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $up = $true } }
  catch { Start-Sleep -Milliseconds 250; $tries++ }
}
if (-not $up) {
  Write-Host "Server never came up on port $Port." -ForegroundColor Red
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  exit 2
}

$outPath = Join-Path $root $Out
$outDir = Split-Path $outPath -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
$profileDir = Join-Path $env:TEMP ("abc-shot-" + [System.Guid]::NewGuid().ToString("N").Substring(0,8))

Start-Process $chrome -ArgumentList `
  "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--user-data-dir=$profileDir","--window-size=$Width,$Height",
  "--hide-scrollbars","--virtual-time-budget=$Budget",
  "--screenshot=$outPath",$shotUrl -NoNewWindow -Wait

if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
try { Remove-Item -Recurse -Force $profileDir -ErrorAction Stop } catch {}
try { Remove-Item $scratch -Force -ErrorAction Stop } catch {}

if (Test-Path $outPath) {
  Write-Host "wrote $Out ($([math]::Round((Get-Item $outPath).Length/1kb)) kb)" -ForegroundColor Green
} else {
  Write-Host "screenshot failed" -ForegroundColor Red; exit 1
}

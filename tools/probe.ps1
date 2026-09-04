# ONE-FRAME GPU-TIER PROBE. smoketest.ps1 with three differences: the page is loaded with
# ?tier=gpu (so post, blobs, VSM, bump/normal/env/rim all exist — the software tier the
# 14-suite gate runs on constructs none of them), --dump-dom captures the ==MFHTEST== block
# like a suite, and the virtual-time budget is a parameter (default 12000 ms: the post chain
# on SwiftShader needs headroom for one frame; a suite's 240 s would be wasted here).
#
# NOT part of the 14-suite gate. Everything that has to be true on a GPU but cannot be
# measured on the software tier (tools/m13g-gpu.js: post allocated, rim anchor found, both
# halves rendered, bright-pass fraction, VSM type) runs through here — one frame, one page.
#
#   .\tools\probe.ps1 -Setup tools\m13g-gpu.js
#   .\tools\probe.ps1 -Setup tools\_probe-look.js -Budget 20000
param(
  [string]$Setup  = "tools\m13g-gpu.js",
  [int]$Port      = 8397,
  [int]$Width     = 1600,
  [int]$Height    = 900,
  [int]$Budget    = 12000,
  [string]$Query  = ""     # extra query params, e.g. "post=off"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $chrome)) { Write-Host "Chrome not found." -ForegroundColor Red; exit 2 }

$setupPath = Join-Path $root $Setup
if (-not (Test-Path $setupPath)) { Write-Host "Setup not found: $setupPath" -ForegroundColor Red; exit 2 }

# Per-PORT scratch name, same reasoning as smoketest.ps1 (two runs on one name clobber each
# other and one silently reports the other's block). -Encoding UTF8 is REQUIRED on PS 5.1.
$scratchName = "_probe-$Port.html"
$scratch = Join-Path $root $scratchName
$html = Get-Content (Join-Path $root "index.html") -Raw -Encoding UTF8
$inject = "<script type=""module"" src=""$($Setup -replace '\\','/')""></script>`r`n</body>"
$html = $html -replace '</body>', $inject
Set-Content -Path $scratch -Value $html -Encoding utf8

$server = Start-Process powershell `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","$root\tools\serve.ps1","-NoBrowser","-Port","$Port" `
  -WindowStyle Hidden -PassThru

# Probe readiness on the BARE path — serve.ps1 serves paths, not query strings — and hand
# the query only to Chrome (the lesson from shot.ps1).
$url = "http://localhost:$Port/$scratchName"
$pageUrl = "$url" + "?tier=gpu"
if ($Query) { $pageUrl = "$pageUrl&$Query" }
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

$profileDir = Join-Path $env:TEMP ("abc-probe-" + [System.Guid]::NewGuid().ToString("N").Substring(0,8))
$domFile    = Join-Path $env:TEMP ("abc-probe-dom-" + [System.Guid]::NewGuid().ToString("N").Substring(0,8) + ".html")
# chrome.exe is a GUI-subsystem binary: --dump-dom must be REDIRECTED to a file, a direct
# capture gets nothing (smoketest.ps1 records the hour that cost).
$proc = Start-Process $chrome -ArgumentList `
  "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--user-data-dir=$profileDir","--window-size=$Width,$Height",
  "--virtual-time-budget=$Budget","--dump-dom",$pageUrl `
  -RedirectStandardOutput $domFile -NoNewWindow -Wait -PassThru

if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
try { Remove-Item -Recurse -Force $profileDir -ErrorAction Stop } catch {}
try { Remove-Item $scratch -Force -ErrorAction Stop } catch {}

$text = ""
if (Test-Path $domFile) { $text = Get-Content $domFile -Raw -Encoding UTF8 }
try { Remove-Item $domFile -Force -ErrorAction Stop } catch {}
if (-not $text) { $text = "" }

$m = [regex]::Match($text, '==MFHTEST-BEGIN==(.*?)==MFHTEST-END==', 'Singleline')
if (-not $m.Success) {
  Write-Host "No probe output found - the page probably crashed before the block was written." -ForegroundColor Red
  $eb = [regex]::Match($text, 'id="err-banner"[^>]*>(.*?)</div>', 'Singleline')
  if ($eb.Success) { Write-Host ("Error banner: " + $eb.Groups[1].Value.Trim()) -ForegroundColor Red }
  exit 1
}
$body = $m.Groups[1].Value.Trim() -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&'
foreach ($line in ($body -split "`n")) {
  $t = $line.Trim()
  if ($t -like 'FAIL*')          { Write-Host $t -ForegroundColor Red }
  elseif ($t -like 'PASS*')      { Write-Host $t -ForegroundColor DarkGray }
  elseif ($t -like '*ALL-PASS*') { Write-Host $t -ForegroundColor Green }
  elseif ($t -like '*FAILURES*') { Write-Host $t -ForegroundColor Red }
  else                           { Write-Host $t }
}
if ($body -match 'ALL-PASS') { exit 0 } else { exit 1 }

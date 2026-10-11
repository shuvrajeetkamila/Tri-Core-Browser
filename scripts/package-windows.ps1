$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$exe = Join-Path $release 'TriCoreBrowser.exe'
if (-not (Test-Path $exe -PathType Leaf)) {
  throw 'Expected release/TriCoreBrowser.exe was not produced by electron-builder.'
}

$stage = Join-Path $release 'TriCoreBrowser-Windows-x64'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item $exe (Join-Path $stage 'TriCoreBrowser.exe')
Copy-Item (Join-Path $root 'README.md'), (Join-Path $root 'LICENSE'), (Join-Path $root 'THIRD_PARTY_NOTICES.txt') -Destination $stage
Copy-Item (Join-Path $root 'docs') (Join-Path $stage 'docs') -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'diagnostics') | Out-Null
Copy-Item (Join-Path $root 'app/diagnostics/wasm-add.wat') (Join-Path $stage 'diagnostics/wasm-add.wat')
$thirdParty = Join-Path $stage 'third-party'
New-Item -ItemType Directory -Force -Path $thirdParty | Out-Null
$packagedRuntime = Join-Path $release 'win-unpacked'
$licenseFiles = @(
  @{ Source = (Join-Path $packagedRuntime 'LICENSE.electron.txt'); Destination = 'LICENSE.electron.txt' },
  @{ Source = (Join-Path $packagedRuntime 'LICENSES.chromium.html'); Destination = 'LICENSES.chromium.html' },
  @{ Source = (Join-Path $root 'node_modules/@fontsource-variable/dm-sans/LICENSE'); Destination = 'DM-Sans-LICENSE.txt' },
  @{ Source = (Join-Path $root 'node_modules/@fontsource-variable/manrope/LICENSE'); Destination = 'Manrope-LICENSE.txt' }
)
foreach ($license in $licenseFiles) {
  if (-not (Test-Path $license.Source -PathType Leaf)) { throw "Required upstream license file is missing: $($license.Source)" }
  Copy-Item $license.Source (Join-Path $thirdParty $license.Destination)
}

if ($env:TRICORE_SMOKE_TEST -ne 'PASS') {
  throw 'The tested-package workflow must mark TRICORE_SMOKE_TEST=PASS before assembling a distribution.'
}
if ($env:TRICORE_FSR_BROWSER_SMOKE -ne 'PASS' -or -not $env:TRICORE_FSR_SMOKE_OUT) {
  throw 'The packaged browser-frame FSR1 smoke must pass before assembling a distribution.'
}
$fsrSmokeRoot = Join-Path $env:TRICORE_FSR_SMOKE_OUT 'browser-frame-smoke-summary.json'
if (-not (Test-Path $fsrSmokeRoot -PathType Leaf)) { throw 'Browser-frame FSR1 smoke summary is missing.' }
$fsrSummary = Get-Content $fsrSmokeRoot -Raw | ConvertFrom-Json
if ($fsrSummary.status -ne 'PASS' -or $fsrSummary.source -ne 'Electron WebContents.capturePage() PNG'
    -or $fsrSummary.softwareAdapter -ne $true -or $fsrSummary.frameCount -ne 3 -or $fsrSummary.distinctInputFrames -ne 3
    -or $fsrSummary.distinctInputResolutions -ne 3
    -or $fsrSummary.frames.Count -ne 3) {
  throw 'Browser-frame FSR1 evidence does not prove three changing capturePage PNG frames processed on WARP.'
}
$referencePaths = @()
foreach ($frame in $fsrSummary.frames) {
  if ($frame.nativeReport.status -ne 'PASS' -or $frame.nativeReport.inputSource -ne 'Electron WebContents.capturePage() PNG'
      -or $frame.nativeReport.softwareAdapter -ne $true -or $frame.nativeReport.processingStatus -ne 'PASS'
      -or [System.IO.Path]::GetFullPath([string]$frame.nativeReport.bilinearReferencePath) -ne [System.IO.Path]::GetFullPath([string]$frame.referencePath)) {
    throw 'A per-frame native report does not validate the capturePage PNG to FSR1 WARP path and its bilinear-reference path.'
  }
  $referencePaths += [System.IO.Path]::GetFullPath([string]$frame.referencePath)
  foreach ($evidencePath in @($frame.inputPath, $frame.outputPath, $frame.referencePath, $frame.reportPath)) {
    if (-not (Test-Path $evidencePath -PathType Leaf)) { throw "Browser-frame FSR1 evidence is missing: $evidencePath" }
  }
  foreach ($imagePath in @($frame.inputPath, $frame.outputPath, $frame.referencePath)) {
    $imageBytes = [System.IO.File]::ReadAllBytes($imagePath)
    if ($imageBytes.Length -lt 80 -or $imageBytes[0] -ne 137 -or $imageBytes[1] -ne 80 -or $imageBytes[2] -ne 78 -or $imageBytes[3] -ne 71) { throw "Expected a non-empty browser-frame PNG: $imagePath" }
  }
}
if (@($referencePaths | Sort-Object -Unique).Count -ne 3) {
  throw 'The three browser frames must retain three distinct bilinear-reference PNG paths.'
}
$fsrEvidenceStage = Join-Path $stage 'diagnostics/fsr1-browser-frame-smoke'
New-Item -ItemType Directory -Force -Path $fsrEvidenceStage | Out-Null
Copy-Item (Join-Path $env:TRICORE_FSR_SMOKE_OUT '*') -Destination $fsrEvidenceStage -Recurse -Force
$smokeStdout = Join-Path $env:RUNNER_TEMP 'tricore-smoke.stdout.txt'
if (Test-Path $smokeStdout -PathType Leaf) {
  Copy-Item $smokeStdout (Join-Path $stage 'WINDOWS_SMOKE_TEST.txt')
} else {
  Set-Content -Path (Join-Path $stage 'WINDOWS_SMOKE_TEST.txt') -Value 'PASS: The packaged application smoke-test process exited with code 0. This Electron build emitted no redirected console output; the workflow step provides the exit-code evidence.' -Encoding utf8
}

$exeBytes = (Get-Item $exe).Length
$commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { (git -C $root rev-parse HEAD).Trim() }
$packageTests = @"

## Current Windows package verification

Source commit: $commit
Windows x64 portable packaging: PASS.
Packaged application launch; local HTTP, JavaScript, WebAssembly, presence of all five graphics-mode controls, tab lifecycle, and browser-frame FSR regression smoke tests: PASS (the required packaged process exited with code 0).
Browser-frame FSR evidence: three changing frames at three capture resolutions from the bundled sandboxed WebGL2 `WebContentsView` were captured through Electron `capturePage()` PNG, processed by AMD FSR 1.0.2 EASU + RCAS in a separate D3D12 helper on WARP, and returned as PNG previews. This is screenshot readback, not zero-copy, real-time, arbitrary-page, or physical-GPU evidence.
External HTTPS connectivity: see the package-root `WINDOWS_SMOKE_TEST.txt`; network unavailability is recorded as blocked without bypassing certificate validation.
See `diagnostics/fsr1-browser-frame-smoke/`, the commit-specific root `BUILD_REPORT.txt`, and `WINDOWS_SMOKE_TEST.txt` for captures/reports. DLSS remains not implemented; ordinary browser pages retain standard Chromium rendering.
"@
Add-Content -Path (Join-Path $stage 'docs/TEST_RESULTS.md') -Value $packageTests -Encoding utf8
$workflowUrl = if ($env:GITHUB_RUN_ID) { "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID" } else { 'Local build; no GitHub Actions run.' }
$report = @"
TRI-CORE BROWSER — WINDOWS BUILD REPORT
Build result: PASS (portable x64 executable produced and smoke-tested by the calling workflow)
Build time (UTC): $([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ssZ'))
Source commit: $commit
Workflow run: $workflowUrl
Runner: $env:RUNNER_OS / $env:RUNNER_ARCH
Node.js: $(node --version)
npm: $(npm --version)
Electron package: $(node -p 'require("./node_modules/electron/package.json").version')
Chromium/V8: recorded by the packaged runtime in WINDOWS_SMOKE_TEST.txt
Target: Windows x64, portable Electron/Chromium application
Configuration: Release portable package
Packaged runtime test: PASS for local HTTP page, JavaScript, WASM add(19,23)=42, presence of all five graphics-mode controls, tab create/select/close, and the required browser-frame FSR1 regression smoke. The external HTTPS probe result is in WINDOWS_SMOKE_TEST.txt.
WASM: PASS for the controlled V8 diagnostic; this is not a webpage upscaling feature.
FSR: PASS only for three changing frames at three capture resolutions from the bundled WebGL2 WebContentsView captured by Electron capturePage() as PNG and processed by AMD FSR 1.0.2 EASU + RCAS in a separate D3D12 helper on WARP. The captures/reports are in diagnostics/fsr1-browser-frame-smoke/.
FSR limits: CPU screenshot readback + D3D12 upload/readback + preview; not zero-copy, in-compositor, real-time, arbitrary-page, physical-GPU, or performance-improvement evidence. Physical-GPU validation remains NOT RUN.
DLSS: NOT IMPLEMENTED; no Streamline integration, authorized runtime, or native page-frame bridge is shipped.
Ordinary web pages: standard Chromium rendering only; no page upscaling is enabled.
Executable in this package: TriCoreBrowser.exe at the portable ZIP root ($exeBytes bytes)
Workflow runner path: release/TriCoreBrowser.exe
Portable distribution: TriCoreBrowser-Windows-x64-portable.zip
Signing: unsigned; Windows SmartScreen may show its normal publisher warning.
"@
Set-Content -Path (Join-Path $stage 'BUILD_REPORT.txt') -Value $report -Encoding utf8

$stagedBytesBeforeAudit = (Get-ChildItem $stage -File -Recurse | Measure-Object -Property Length -Sum).Sum
$preZipAudit = @"
TRI-CORE BROWSER — SIZE AUDIT
Source commit: $commit
TriCoreBrowser.exe: $exeBytes bytes
Portable staged directory before its own size-audit file: $stagedBytesBeforeAudit bytes (includes the executable, documentation and license files)
Chromium/Electron runtime: included in TriCoreBrowser.exe; no separate Chrome/Edge installation is required.
ZIP size: see the root SIZE_AUDIT.txt shipped beside the package.
"@
Set-Content -Path (Join-Path $stage 'SIZE_AUDIT.txt') -Value $preZipAudit -Encoding utf8

$zip = Join-Path $release 'TriCoreBrowser-Windows-x64-portable.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipBytes = (Get-Item $zip).Length
$stagedBytesFinal = (Get-ChildItem $stage -File -Recurse | Measure-Object -Property Length -Sum).Sum
$rootAudit = @"
TRI-CORE BROWSER — SIZE AUDIT
Source commit: $commit
TriCoreBrowser.exe: $exeBytes bytes
Portable staged directory before ZIP (includes its size report): $stagedBytesFinal bytes
TriCoreBrowser-Windows-x64-portable.zip: $zipBytes bytes
Chromium/Electron runtime: included in TriCoreBrowser.exe; no separate Chrome/Edge installation is required.
Signing: unsigned.
"@
Set-Content -Path (Join-Path $release 'SIZE_AUDIT.txt') -Value $rootAudit -Encoding utf8
Copy-Item (Join-Path $stage 'BUILD_REPORT.txt') (Join-Path $release 'BUILD_REPORT.txt')

$hashes = @()
foreach ($file in @($exe, $zip)) {
  $hash = Get-FileHash -Path $file -Algorithm SHA256
  $hashes += "$($hash.Hash.ToLower())  $([IO.Path]::GetFileName($file))"
}
Set-Content -Path (Join-Path $release 'SHA256SUMS.txt') -Value ($hashes -join "`n") -Encoding ascii
Write-Host $rootAudit

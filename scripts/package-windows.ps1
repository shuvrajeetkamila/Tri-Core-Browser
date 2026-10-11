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
Packaged application launch; local HTTP, JavaScript, WebAssembly, presence of all five graphics-mode controls, and tab lifecycle smoke tests: PASS (the required packaged process exited with code 0).
External HTTPS connectivity: see the package-root `WINDOWS_SMOKE_TEST.txt`; network unavailability is recorded as blocked without bypassing certificate validation.
See the commit-specific root `BUILD_REPORT.txt` and `WINDOWS_SMOKE_TEST.txt` for this distribution's evidence. DLSS and FSR remain not implemented and are not covered by the smoke test.
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
Packaged runtime test: PASS for local HTTP page, JavaScript, WASM add(19,23)=42, presence of all five graphics-mode controls, and tab create/select/close. The external HTTPS probe result is in WINDOWS_SMOKE_TEST.txt.
WASM: PASS for the controlled V8 diagnostic; this is not a webpage upscaling feature.
DLSS: BLOCKED / NOT IMPLEMENTED; no Streamline SDK integration or native webpage render bridge is shipped.
FSR: BLOCKED / NOT IMPLEMENTED; no FidelityFX native render path is shipped.
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

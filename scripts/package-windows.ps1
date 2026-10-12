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
if ($env:TRICORE_FSR_INTEGRATION_SMOKE -ne 'PASS' -or -not $env:TRICORE_FSR_SMOKE_OUT) {
  throw 'A required physical-GPU packaged FSR1 integration PASS is required before assembling a distribution.'
}
if ($env:TRICORE_GPU_TEST_MODE -ne 'required') {
  throw 'Distribution assembly is restricted to TRICORE_GPU_TEST_MODE=required; optional or hosted WARP checks are not release evidence.'
}
$packagedSmokeSummaryPath = Join-Path $env:TRICORE_FSR_SMOKE_OUT 'packaged-smoke-summary.json'
if (-not (Test-Path $packagedSmokeSummaryPath -PathType Leaf)) { throw 'The packaged smoke acceptance summary is missing.' }
$packagedSmokeSummary = Get-Content $packagedSmokeSummaryPath -Raw | ConvertFrom-Json
if ($packagedSmokeSummary.status -ne 'PASS' -or $packagedSmokeSummary.gpuTestPolicy -ne 'required' -or $packagedSmokeSummary.webGpuAcceptance.status -ne 'PASS' -or $packagedSmokeSummary.webGpuAcceptance.required -ne $true -or $packagedSmokeSummary.webGpuAcceptance.physicalGpuValidation -ne 'PASS' -or $packagedSmokeSummary.physicalGpuValidation -ne 'PASS' -or $packagedSmokeSummary.releaseEligible -ne $true) {
  throw 'The package summary does not prove required live FSR1 and separately validated physical-GPU acceptance.'
}
& node (Join-Path $root 'scripts/validate-packaged-smoke.cjs') --policy required --directory $env:TRICORE_FSR_SMOKE_OUT
if ($LASTEXITCODE -ne 0) { throw 'Strict packaged-smoke evidence validation failed during distribution assembly.' }
$fsrSmokeRoot = Join-Path $env:TRICORE_FSR_SMOKE_OUT 'browser-frame-smoke-summary.json'
if (-not (Test-Path $fsrSmokeRoot -PathType Leaf)) { throw 'Browser-frame FSR1 smoke summary is missing.' }
$fsrSummary = Get-Content $fsrSmokeRoot -Raw | ConvertFrom-Json
if ($fsrSummary.status -ne 'PASS' -or $fsrSummary.source -ne 'Electron WebContents.capturePage() PNG' -or $fsrSummary.softwareAdapter -ne $true -or $fsrSummary.frameCount -ne 3 -or $fsrSummary.distinctInputFrames -ne 3 -or $fsrSummary.distinctInputResolutions -ne 3 -or $fsrSummary.frames.Count -ne 3) {
  throw 'Browser-frame FSR1 evidence does not prove three changing capturePage PNG frames processed on WARP.'
}
$referencePaths = @()
foreach ($frame in $fsrSummary.frames) {
  if ($frame.nativeReport.status -ne 'PASS' -or $frame.nativeReport.inputSource -ne 'Electron WebContents.capturePage() PNG' -or $frame.nativeReport.softwareAdapter -ne $true -or $frame.nativeReport.processingStatus -ne 'PASS' -or [System.IO.Path]::GetFullPath([string]$frame.nativeReport.bilinearReferencePath) -ne [System.IO.Path]::GetFullPath([string]$frame.referencePath)) {
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
$webGpuComputeSummaryPath = Join-Path $env:TRICORE_FSR_SMOKE_OUT 'webgpu-compute-smoke-summary.json'
if (-not (Test-Path $webGpuComputeSummaryPath -PathType Leaf)) { throw 'Independent WebGPU known-answer compute summary is missing.' }
$webGpuComputeSummary = Get-Content $webGpuComputeSummaryPath -Raw | ConvertFrom-Json
if ($webGpuComputeSummary.status -ne 'PASS' -or $webGpuComputeSummary.state -ne 'output-verified' -or $webGpuComputeSummary.secureContext -ne $true -or $webGpuComputeSummary.apiDetected -ne $true -or $webGpuComputeSummary.deviceRequested -ne $true -or $webGpuComputeSummary.shaderCompilationStatus -ne 'passed' -or $webGpuComputeSummary.pipelineCreationStatus -ne 'passed' -or $webGpuComputeSummary.resourceInitializationStatus -ne 'passed' -or $webGpuComputeSummary.dispatches -ne 1 -or $webGpuComputeSummary.queueCompleted -ne $true -or $webGpuComputeSummary.expectedResult -ne 42 -or $webGpuComputeSummary.readbackResult -ne 42 -or $webGpuComputeSummary.readbackVerified -ne $true -or $webGpuComputeSummary.physicalGpuValidation -ne 'NOT RUN') {
  throw 'Independent WebGPU compute/readback evidence does not verify 19 + 23 = 42 and honest physical-GPU status.'
}
if ($webGpuComputeSummary.adapterInfo.softwareAdapter -ne $false -or $webGpuComputeSummary.adapterInfo.exposed -ne $true) { throw 'Required independent WebGPU compute did not use a classified non-software adapter.' }
$computePhysicalDevices = @($webGpuComputeSummary.graphicsEnvironment.chromiumGpuDevices | Where-Object {
  $_.active -eq $true -and -not [string]::IsNullOrWhiteSpace([string]$_.driverVersion) -and
  (([string]$_.vendor + ' ' + [string]$_.name) -notmatch '(?i)\bwarp\b|swiftshader|software raster|basic render|llvmpipe')
})
if ($computePhysicalDevices.Count -lt 1) { throw 'Known-answer compute has no active non-software Chromium device with driver evidence.' }
$computeAdapterDescription = @($webGpuComputeSummary.adapterInfo.vendor, $webGpuComputeSummary.adapterInfo.architecture, $webGpuComputeSummary.adapterInfo.device, $webGpuComputeSummary.adapterInfo.description) -join ' '
if ($computeAdapterDescription -match '(?i)\bwarp\b|swiftshader|software raster|basic render|llvmpipe') { throw 'Known-answer compute used a software adapter, not a physical GPU.' }
$webGpuComputeSwitches = $webGpuComputeSummary.launchDiagnostics.gpuRelatedSwitches
if ($webGpuComputeSwitches.'enable-unsafe-webgpu' -or $webGpuComputeSwitches.'ignore-gpu-blocklist' -or $webGpuComputeSwitches.'disable-gpu-driver-bug-workarounds' -or $webGpuComputeSwitches.'disable-gpu-sandbox' -or $webGpuComputeSwitches.'disable-gpu' -or $webGpuComputeSwitches.'disable-webgpu' -or ([string]$webGpuComputeSwitches.'disable-dawn-features' -match 'adapter_blocklist|allow_unsafe_apis') -or ([string]$webGpuComputeSwitches.'enable-dawn-features' -match 'allow_unsafe_apis') -or ([string]$webGpuComputeSwitches.'disable-features' -match '(^|,|\s)webgpu(,|\s|$)')) {
  throw 'Independent WebGPU smoke used an unsafe WebGPU, disabled GPU/sandbox, blocklist bypass, or driver-workaround override.'
}
$webGpuSummaryPath = Join-Path $env:TRICORE_FSR_SMOKE_OUT 'fsr1-webgpu-summary.json'
if (-not (Test-Path $webGpuSummaryPath -PathType Leaf)) { throw 'Live WebGPU FSR1 integration summary is missing.' }
$webGpuSummary = Get-Content $webGpuSummaryPath -Raw | ConvertFrom-Json
if ($webGpuSummary.status -ne 'PASS' -or $webGpuSummary.api -ne 'WebGPU' -or $webGpuSummary.readbackForProcessing -ne $false -or $webGpuSummary.physicalGpuValidation -ne 'NOT RUN' -or $webGpuSummary.processedFrames -lt 3 -or $webGpuSummary.input.width -ge $webGpuSummary.output.width -or $webGpuSummary.input.height -ge $webGpuSummary.output.height -or -not $webGpuSummary.timingDefinition.Contains('not a GPU timestamp')) {
  throw 'Live WebGPU FSR1 summary does not validate three visible GPU-processed frames, increased output dimensions, readback-free processing, and distinct per-run physical-GPU status.'
}
if ($webGpuSummary.softwareAdapter -ne $false -or $webGpuSummary.adapterInfoAvailable -ne $true) { throw 'Required FSR1 run did not identify a non-software WebGPU adapter.' }
$adapterDescription = @($webGpuSummary.adapter.vendor, $webGpuSummary.adapter.architecture, $webGpuSummary.adapter.device, $webGpuSummary.adapter.description) -join ' '
if ($adapterDescription -match '(?i)\bwarp\b|swiftshader|software raster|basic render|llvmpipe') { throw 'A software adapter cannot satisfy the physical-GPU distribution gate.' }
$activePhysicalDevices = @($webGpuSummary.graphicsEnvironment.chromiumGpuDevices | Where-Object {
  $_.active -eq $true -and -not [string]::IsNullOrWhiteSpace([string]$_.driverVersion) -and
  (([string]$_.vendor + ' ' + [string]$_.name) -notmatch '(?i)\bwarp\b|swiftshader|software raster|basic render|llvmpipe')
})
if ($activePhysicalDevices.Count -lt 1) { throw 'No active non-software Chromium GPU device with a driver version was recorded.' }
if ($webGpuSummary.lifecycle.adapterDetected -ne $true -or $webGpuSummary.lifecycle.shaderCompilationStatus -ne 'passed' -or $webGpuSummary.lifecycle.pipelineCreationStatus -ne 'passed' -or $webGpuSummary.lifecycle.resourceInitializationStatus -ne 'passed' -or $webGpuSummary.lifecycle.easuComputePipelineInitialized -ne $true -or $webGpuSummary.lifecycle.rcasComputePipelineInitialized -ne $true -or $webGpuSummary.lifecycle.presentationPipelineInitialized -ne $true -or $webGpuSummary.lifecycle.outputSubmittedToVisibleCanvas -ne $true) {
  throw 'Live WebGPU FSR1 must report adapter detection, successful shaders/resources, EASU/RCAS compute and presentation pipeline initialization, and output submission.'
}
if ($webGpuSummary.dispatch.easuDispatches -lt 3 -or $webGpuSummary.dispatch.rcasDispatches -lt 3) { throw 'Live WebGPU FSR1 must report at least three dispatches for both EASU and RCAS.' }
if ($webGpuSummary.imageValidation.status -ne 'PASS' -or $webGpuSummary.imageValidation.readbackFeedsProcessing -ne $false -or $webGpuSummary.imageValidation.motion.changed -ne $true -or $webGpuSummary.imageValidation.stageComparison.status -ne 'PASS' -or $webGpuSummary.imageValidation.visibleCanvas.status -ne 'PASS' -or $webGpuSummary.lifecycle.visibleCanvasScreenshotCompared -ne $true -or $webGpuSummary.lifecycle.visibleOutputVerified -ne $true) {
  throw 'Live WebGPU FSR1 numerical stage, motion, or post-processing visible-canvas screenshot comparison failed or is missing.'
}
if ($webGpuSummary.imageValidation.stageComparison.checks.dimensionsUpscaled -ne $true -or $webGpuSummary.imageValidation.stageComparison.checks.inputHasDetail -ne $true -or $webGpuSummary.imageValidation.stageComparison.checks.easuContributes -ne $true -or $webGpuSummary.imageValidation.stageComparison.checks.rcasContributes -ne $true -or $webGpuSummary.imageValidation.stageComparison.checks.outputHasDetail -ne $true) { throw 'Live WebGPU FSR1 stage comparison is missing one or more numerical contribution checks.' }
$webGpuCaptures = $webGpuSummary.imageValidation.captures
foreach ($captureName in @('lowResolutionInput', 'easuIntermediate', 'rcasOutput')) {
  $stageCapture = $webGpuCaptures.$captureName
  if (-not $stageCapture -or -not (Test-Path $stageCapture.path -PathType Leaf)) { throw "The post-processing WebGPU stage capture is missing: $captureName" }
  $stageCaptureBytes = [System.IO.File]::ReadAllBytes($stageCapture.path)
  if ($stageCaptureBytes.Length -lt 80 -or $stageCaptureBytes[0] -ne 137 -or $stageCaptureBytes[1] -ne 80 -or $stageCaptureBytes[2] -ne 78 -or $stageCaptureBytes[3] -ne 71) { throw "The WebGPU stage evidence is not a non-empty PNG: $captureName" }
  if ((Get-FileHash -Path $stageCapture.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $stageCapture.sha256.ToLowerInvariant()) { throw "The WebGPU stage capture SHA-256 does not match: $captureName" }
}
$webGpuCapture = $webGpuSummary.visibleOutputCapture
if (-not $webGpuCapture -or -not (Test-Path $webGpuCapture.path -PathType Leaf)) { throw 'The post-processing WebGPU visible-output evidence capture is missing.' }
$webGpuCaptureBytes = [System.IO.File]::ReadAllBytes($webGpuCapture.path)
if ($webGpuCaptureBytes.Length -lt 80 -or $webGpuCaptureBytes[0] -ne 137 -or $webGpuCaptureBytes[1] -ne 80 -or $webGpuCaptureBytes[2] -ne 78 -or $webGpuCaptureBytes[3] -ne 71) { throw 'The visible WebGPU output evidence is not a non-empty PNG.' }
if ((Get-FileHash -Path $webGpuCapture.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $webGpuCapture.sha256.ToLowerInvariant()) { throw 'The visible WebGPU output capture SHA-256 does not match.' }
$fsrEvidenceStage = Join-Path $stage 'diagnostics/fsr1-integration-smoke'
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
Packaged application launch; local HTTP, JavaScript, WebAssembly, all five graphics-mode controls, tab lifecycle, active-core immersive fullscreen enter/exit with browser-control restoration, the screenshot diagnostic, and the WebGPU FSR1 scene smoke: PASS (required packaged process and physical-GPU gate).
Live game-side FSR1 evidence: the bundled WebGPU scene rendered at a smaller browser-owned GPU color target, processed at least three frames through AMD FSR 1.0.2 EASU + RCAS WGSL passes, and displayed the result through the visible canvas without CPU readback in the processing path. The one saved `capturePage()` PNG is post-processing CI evidence only. Physical-GPU validation: PASS on the configured Windows GPU runner; see packaged-smoke-summary.json and fsr1-webgpu-summary.json for separate adapter/driver evidence.
Separate PNG diagnostic: three changing frames at three capture resolutions from the bundled sandboxed WebGL2 `WebContentsView` were captured by Electron `capturePage()` PNG, processed by the D3D12 FSR1 helper on WARP software, and returned as PNG previews. It remains diagnostic only and is not live integration, zero-copy, arbitrary-page processing, or physical-GPU evidence.
External HTTPS connectivity: see the package-root `WINDOWS_SMOKE_TEST.txt`; network unavailability is recorded as blocked without bypassing certificate validation.
See `diagnostics/fsr1-integration-smoke/`, the commit-specific root `BUILD_REPORT.txt`, and `WINDOWS_SMOKE_TEST.txt` for captures/reports. DLSS remains not implemented; ordinary browser pages retain standard Chromium rendering unless a game integrates the bounded WebGPU path explicitly.
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
Packaged runtime test: PASS for local HTTP page, JavaScript, WASM add(19,23)=42, presence of all five graphics-mode controls, tab create/select/close, and both distinct FSR1 integration tests. The external HTTPS probe result is in WINDOWS_SMOKE_TEST.txt.
WASM: PASS for the controlled V8 diagnostic; this is not a webpage upscaling feature.
FSR1 live vertical slice: PASS for the bundled WebGPU game-owned render target → AMD FSR 1.0.2 EASU + RCAS WGSL passes → visible WebGPU canvas, with at least three completed frames and no CPU readback in the processing path. The post-processing screenshot and summary are in diagnostics/fsr1-integration-smoke/; queue-completion wall timings are not GPU timestamps.
FSR1 PNG diagnostic: PASS only for three changing WebGL2 WebContentsView capturePage PNG frames at three resolutions processed by the separate D3D12 helper on WARP software. This route remains screenshot/readback diagnostic only.
FSR limits: the live vertical slice is opt-in and applies only to the bundled game scene or games that explicitly integrate the game-owned WebGPU path; it does not intercept arbitrary pages or the Chromium compositor. Physical-GPU validation: PASS on the configured Windows GPU runner with an active driver; WARP remains software-only and is not that evidence. No performance gain is claimed.
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

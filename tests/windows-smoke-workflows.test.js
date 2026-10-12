import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowNames = ['build.yml', 'release.yml'];

test('Windows build/release gates validate both the WARP PNG diagnostic and live WebGPU FSR1 output', () => {
  for (const workflowName of workflowNames) {
    const workflow = fs.readFileSync(new URL(`../.github/workflows/${workflowName}`, import.meta.url), 'utf8');
    assert.ok(workflow.includes('$frame.nativeReport.bilinearReferencePath'), `${workflowName} must tie each diagnostic reference PNG to its native report`);
    assert.ok(workflow.includes('[System.IO.Path]::GetFullPath([string]$frame.nativeReport.bilinearReferencePath) -ne [System.IO.Path]::GetFullPath([string]$frame.referencePath)'), `${workflowName} must normalize Windows slash direction before comparing reference paths`);
    assert.ok(workflow.includes('@($frame.inputPath, $frame.outputPath, $frame.referencePath)'), `${workflowName} must validate each screenshot input, FSR output, and reference PNG`);
    assert.ok(workflow.includes('$referencePaths | Sort-Object -Unique'), `${workflowName} must require a distinct reference path per diagnostic frame`);
    assert.ok(workflow.includes("'[smoke] Active-core immersive fullscreen: PASS'"), `${workflowName} must require the packaged fullscreen enter/layout test`);
    assert.ok(workflow.includes("'[smoke] Immersive fullscreen exit: PASS'"), `${workflowName} must require the packaged layout-restoration test`);
    assert.ok(workflow.includes("'[smoke] Diagnostic-only WebContentsView WebGL2 capture'"), `${workflowName} must label the capturePage route as diagnostic-only`);
    assert.ok(workflow.includes("'[smoke] Live WebGPU game target'"), `${workflowName} must require live WebGPU/FSR1 visible-output evidence`);
    assert.ok(workflow.includes("'fsr1-webgpu-summary.json'"), `${workflowName} must require the WebGPU FSR1 summary`);
    assert.ok(workflow.includes('$webGpuSummary.readbackForProcessing -ne $false'), `${workflowName} must reject readback-based live processing`);
    assert.ok(workflow.includes("$webGpuSummary.physicalGpuValidation -ne 'NOT RUN'"), `${workflowName} must keep physical-GPU validation separate`);
    assert.ok(workflow.includes('$webGpuSummary.processedFrames -lt 3'), `${workflowName} must require completed WebGPU frames`);
    assert.ok(workflow.includes('$webGpuSummary.dispatch.easuDispatches -lt 3'), `${workflowName} must require repeated EASU compute dispatches`);
    assert.ok(workflow.includes('$webGpuSummary.dispatch.rcasDispatches -lt 3'), `${workflowName} must require repeated RCAS compute dispatches`);
    assert.ok(workflow.includes("$webGpuSummary.lifecycle.shaderCompilationStatus -ne 'passed'"), `${workflowName} must require successful shader compilation`);
    assert.ok(workflow.includes("$webGpuSummary.lifecycle.pipelineCreationStatus -ne 'passed'"), `${workflowName} must require successful compute/presentation pipeline creation`);
    assert.ok(workflow.includes("$webGpuSummary.lifecycle.resourceInitializationStatus -ne 'passed'"), `${workflowName} must require resource initialization`);
    assert.ok(workflow.includes('$webGpuSummary.imageValidation.stageComparison.status -ne \'PASS\''), `${workflowName} must require numerical EASU/RCAS stage comparison`);
    assert.ok(workflow.includes('$webGpuSummary.imageValidation.visibleCanvas.status -ne \'PASS\''), `${workflowName} must require the visible-canvas screenshot comparison`);
    assert.ok(workflow.includes('$webGpuSummary.imageValidation.motion.changed -ne $true'), `${workflowName} must require distinct animated WebGPU input frames`);
    assert.ok(workflow.includes('$stageCapture.sha256.ToLowerInvariant()'), `${workflowName} must bind the saved stage evidence to its reported SHA-256`);
    assert.ok(workflow.includes("'not a GPU timestamp'"), `${workflowName} must validate the timing definition`);
    assert.ok(workflow.includes('$visibleCapture.path'), `${workflowName} must retain the post-processing output capture`);
    assert.ok(workflow.includes('$visibleCapture.sha256.ToLowerInvariant()'), `${workflowName} must check the visible-canvas capture SHA-256`);
    assert.ok(workflow.includes('packaged-smoke-failure-summary.json'), `${workflowName} must surface structured failure evidence`);
    assert.ok(workflow.includes("$logPath.EndsWith('.png'"), `${workflowName} must log PNG evidence metadata rather than decoding binary captures as text`);
    assert.ok(workflow.includes("'tricore-fsr-integration-smoke/fsr1-webgpu-visible-output.png'"), `${workflowName} must surface the WebGPU capture in failure diagnostics`);
    assert.ok(workflow.includes('TRICORE_REQUIRE_FSR_INTEGRATION_SMOKE'), `${workflowName} must explicitly opt in to both FSR tests`);
    assert.ok(workflow.includes('TRICORE_FSR_INTEGRATION_SMOKE'), `${workflowName} must gate package assembly on both FSR tests`);
    assert.ok(workflow.includes('fsr1-integration-smoke/**'), `${workflowName} must upload both sets of smoke evidence`);
    assert.ok(workflow.includes('tricore-smoke-diagnostics.md'), `${workflowName} must retain a readable smoke summary`);
    assert.ok(workflow.includes('tricore-smoke-main.log.txt'), `${workflowName} must collect the packaged app's own smoke log`);
    assert.ok(workflow.includes('TRICORE_SMOKE_LOG'), `${workflowName} must tell the packaged app where to write smoke diagnostics`);
    assert.ok(workflow.includes('[workflow] Packaged smoke validation failed at line'), `${workflowName} must append PowerShell assertion failures to the smoke diagnostic log`);
    assert.ok(workflow.includes('[package] Portable distribution assembly failed at line'), `${workflowName} must surface PowerShell packaging failures in the Actions annotation`);
    assert.ok(workflow.includes('$env:GITHUB_STEP_SUMMARY'), `${workflowName} must expose smoke details in the Actions summary`);
    assert.ok(workflow.includes('::error title=Packaged browser smoke diagnostics::'), `${workflowName} must expose smoke details as a check annotation`);
    assert.ok(workflow.includes('id: packaged_executable'), `${workflowName} must report executable validation separately`);
    assert.ok(workflow.includes('id: packaged_smoke'), `${workflowName} must report browser smoke separately`);
    assert.ok(workflow.includes('steps.packaged_executable.outcome == \'failure\''), `${workflowName} must surface diagnostics when executable validation fails`);
  }

  const buildWorkflow = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  const candidateUploadIndex = buildWorkflow.indexOf('name: Upload unverified packaged executable for diagnostics');
  const packagedSmokeIndex = buildWorkflow.indexOf('name: Run packaged-app smoke test');
  assert.ok(candidateUploadIndex >= 0 && candidateUploadIndex < packagedSmokeIndex, 'upload the packaged smoke candidate before the graphics/runtime gate so a failing gate does not discard the executable');
  const candidateUploadStep = buildWorkflow.slice(candidateUploadIndex, packagedSmokeIndex);
  assert.ok(candidateUploadStep.includes("if: always() && steps.packaged_executable.outcome == 'success'"), 'only upload the candidate when executable packaging/size validation passed, even if a later smoke gate fails');
  assert.ok(candidateUploadStep.includes('continue-on-error: true'), 'an artifact-service hiccup must not skip the strict packaged runtime smoke');
  assert.ok(candidateUploadStep.includes('name: TriCoreBrowser-Windows-x64-unverified-smoke-candidate'), 'make the unverified artifact status explicit in its artifact name');
  assert.ok(candidateUploadStep.includes('path: release/TriCoreBrowser.exe'), 'upload the actual packaged executable, not source or renderer output');
  assert.ok(candidateUploadStep.includes('retention-days: 30'), 'retain the diagnostic executable as a normal workflow artifact');

  const packageScript = fs.readFileSync(new URL('../scripts/package-windows.ps1', import.meta.url), 'utf8');
  assert.ok(packageScript.includes('[System.IO.Path]::GetFullPath([string]$frame.nativeReport.bilinearReferencePath) -ne [System.IO.Path]::GetFullPath([string]$frame.referencePath)'), 'the packaging gate must normalize Windows slash direction before comparing reference paths');
  assert.ok(packageScript.includes("'fsr1-webgpu-summary.json'"), 'the packaging gate must require the live WebGPU integration summary');
  assert.ok(packageScript.includes('$webGpuSummary.readbackForProcessing -ne $false'), 'the packaging gate must require no CPU readback in the live path');
  assert.ok(packageScript.includes('$webGpuSummary.physicalGpuValidation -ne \'NOT RUN\''), 'the packaging gate must preserve the physical-GPU NOT RUN label');
  assert.ok(packageScript.includes('$webGpuSummary.imageValidation.visibleCanvas.status -ne \'PASS\''), 'the packaging gate must require screenshot comparison of visible output');
  assert.ok(packageScript.includes('$webGpuCaptures.$captureName'), 'the packaging gate must require all diagnostic stage captures');
  assert.ok(packageScript.includes('$stageCapture.sha256.ToLowerInvariant()'), 'the packaging gate must verify the captured stage image hashes');
  assert.ok(packageScript.includes('$webGpuCapture.sha256.ToLowerInvariant()'), 'the packaging gate must verify the visible output screenshot hash');
  assert.ok(packageScript.includes('diagnostics/fsr1-integration-smoke'), 'the package must retain both controlled FSR evidence paths');
  assert.doesNotMatch(packageScript, /^\s+-(?:or|and)\b/m, 'the PowerShell package-gate boolean expressions must not begin continuation lines with an operator');
});

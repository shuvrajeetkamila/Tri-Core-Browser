import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const buildWorkflow = read('../.github/workflows/build.yml');
const releaseWorkflow = read('../.github/workflows/release.yml');
const validator = read('../scripts/validate-packaged-smoke.cjs');
const summaryWriter = read('../scripts/write-smoke-job-summary.cjs');
const packageScript = read('../scripts/package-windows.ps1');

test('Level A hosted Windows smoke preserves ordinary checks and never gates on optional GPU PASS', () => {
  assert.match(buildWorkflow, /runs-on: windows-latest/);
  assert.ok(buildWorkflow.includes("$env:TRICORE_GPU_TEST_MODE = 'optional'"));
  assert.ok(buildWorkflow.includes('--policy optional'));
  assert.ok(buildWorkflow.includes("TRICORE_FSR_INTEGRATION_SMOKE=SKIPPED"));
  assert.ok(buildWorkflow.includes("if: env.TRICORE_FSR_INTEGRATION_SMOKE == 'PASS'"), 'distribution assembly must stay off for Level A hosted/WARP runs');
  assert.ok(buildWorkflow.includes('name: Upload packaged smoke diagnostics'));
  assert.ok(buildWorkflow.includes('if: always()'), 'reports must upload for passing and failing hosted runs');
  for (const report of ['browser-frame-smoke-summary.json', 'webgpu-compute-smoke-summary.json', 'fsr1-webgpu-summary.json', 'packaged-smoke-summary.json']) {
    assert.ok(buildWorkflow.includes(report), `Level A diagnostics must retain ${report}`);
  }
  assert.ok(validator.includes("'[smoke] Active-core immersive fullscreen: PASS'"), 'the common validator must continue to enforce fullscreen behavior');
  assert.ok(validator.includes("'[smoke] Diagnostic-only WebContentsView WebGL2 capture'"), 'the common validator must enforce the PNG route');
});

test('Level B is explicit, opt-in, isolated from ordinary CI, and uses a configured self-hosted Windows GPU runner', () => {
  assert.ok(buildWorkflow.includes('run_physical_gpu_validation'));
  assert.ok(buildWorkflow.includes("github.event.inputs.run_physical_gpu_validation == 'true'"));
  const levelB = buildWorkflow.slice(buildWorkflow.indexOf('  windows-gpu-validation:'));
  assert.ok(levelB.includes('runs-on: [self-hosted, windows, x64, gpu]'));
  assert.ok(levelB.includes("$env:TRICORE_GPU_TEST_MODE = 'required'"));
  assert.ok(levelB.includes('--policy required'));
  assert.ok(levelB.includes('if: success() && env.TRICORE_FSR_INTEGRATION_SMOKE == \'PASS\''));
  assert.ok(levelB.includes('TriCoreBrowser-Level-B-GPU-Diagnostics'));
  assert.ok(levelB.includes('TriCoreBrowser-Windows-x64-physical-GPU-validated'));
});

test('Level A and Level B always append outcome-aware summaries after artifact handling without erasing prior failures', () => {
  const summarySteps = buildWorkflow.match(/name: Write (?:packaged smoke evidence|Level B GPU evidence) to job summary/g) || [];
  assert.equal(summarySteps.length, 2, 'both packaged Windows jobs must write their own evidence summary');
  assert.equal((buildWorkflow.match(/run: node scripts\/write-smoke-job-summary\.cjs/g) || []).length, 2);
  assert.equal((buildWorkflow.match(/TRICORE_DISTRIBUTION_BUILD_OUTCOME: \$\{\{ steps\.(?:assemble_portable_distribution|assemble_gpu_distribution)\.outcome \}\}/g) || []).length, 2);
  assert.equal((buildWorkflow.match(/TRICORE_EVIDENCE_VALIDATION_OUTCOME: \$\{\{ steps\.(?:validate_packaged_smoke_evidence|validate_gpu_smoke_evidence)\.outcome \}\}/g) || []).length, 2);
  assert.ok(buildWorkflow.includes('id: validate_packaged_smoke_evidence'));
  assert.ok(buildWorkflow.includes('id: validate_gpu_smoke_evidence'));
  assert.ok(buildWorkflow.includes('JSON/PNG evidence validation failed'), 'the report validator must be a distinct failure-bearing step');
  assert.ok(buildWorkflow.includes('TRICORE_CANDIDATE_ARTIFACT_OUTCOME: skipped'), 'Level B must state that no unverified candidate artifact was attempted');
  assert.ok(summaryWriter.includes('distributionBuildOutcome: normalizeStepOutcome(outcomes.distributionBuild)'));
  assert.ok(summaryWriter.includes('fs.appendFileSync(summaryPath, markdown'), 'summary writing must append rather than overwrite prior test/package failure details');
  assert.ok(summaryWriter.includes("if (normalized === 'failure') return { status: 'FAIL'"));
  assert.ok(summaryWriter.includes('The packaged smoke step succeeded but its packaged-smoke-summary.json is missing or not PASS.'));
  const summaryStep = buildWorkflow.slice(buildWorkflow.indexOf('name: Write packaged smoke evidence to job summary'));
  assert.match(summaryStep, /if: always\(\)/);
  assert.doesNotMatch(summaryStep, /continue-on-error:\s*true/);
  assert.ok(buildWorkflow.includes('retention-days: 30'), 'smoke diagnostics must remain available for investigation');
});

test('release workflow can build/publish only after required physical GPU evidence', () => {
  assert.ok(releaseWorkflow.includes('runs-on: [self-hosted, windows, x64, gpu]'));
  assert.ok(releaseWorkflow.includes("$env:TRICORE_GPU_TEST_MODE = 'required'"));
  assert.ok(releaseWorkflow.includes('--policy required'));
  assert.ok(releaseWorkflow.includes("$packaged.physicalGpuValidation -ne 'PASS'"));
  assert.ok(releaseWorkflow.includes("$packaged.releaseEligible -ne $true"));
  assert.ok(releaseWorkflow.includes("if: env.TRICORE_FSR_INTEGRATION_SMOKE == 'PASS'"));
  assert.ok(releaseWorkflow.includes('needs: windows-release-build'), 'publication must depend on the strict physical-GPU build');
  assert.match(releaseWorkflow, /strict Level B gate requires and records physical-GPU adapter and active-driver validation/);
});

test('shared packaged-smoke validator distinguishes unsupported, skipped, failed and physical GPU pass states', () => {
  assert.ok(validator.includes('validateWarpPngEvidence'));
  assert.ok(validator.includes('validateVisibleFsrEvidence'));
  assert.ok(validator.includes('validateNoAdapterSkip'));
  assert.ok(validator.includes('isNoAdapterReport'));
  assert.ok(validator.includes('isFsrUnsupported'));
  assert.ok(validator.includes('hasPhysicalGpuEvidence'));
  assert.ok(validator.includes("acceptance.status === 'SKIPPED'"));
  assert.ok(validator.includes("acceptance.status === 'PASS'"));
  assert.ok(validator.includes("policy === 'required'"));
  assert.ok(validator.includes("packaged.releaseEligible === true"));
  assert.ok(validator.includes('physicalGpuValidation'));
  assert.ok(validator.includes('not a GPU timestamp'));
  assert.ok(validator.includes('readbackForProcessing'));
  assert.ok(validator.includes('PNG SHA-256 differs from its report'));
});

test('strict distribution packaging rejects Level A, WARP-only, and NOT RUN physical evidence', () => {
  assert.ok(packageScript.includes("$env:TRICORE_GPU_TEST_MODE -ne 'required'"));
  assert.ok(packageScript.includes("$packagedSmokeSummary.physicalGpuValidation -ne 'PASS'"));
  assert.ok(packageScript.includes("$packagedSmokeSummary.releaseEligible -ne $true"));
  assert.ok(packageScript.includes('$webGpuSummary.softwareAdapter -ne $false'));
  assert.ok(packageScript.includes('$activePhysicalDevices.Count -lt 1'));
  assert.ok(packageScript.includes("'NOT RUN'"));
  assert.ok(packageScript.includes("'fsr1-webgpu-summary.json'"));
  assert.ok(packageScript.includes('$webGpuSummary.readbackForProcessing -ne $false'));
  assert.ok(packageScript.includes('$webGpuSummary.imageValidation.visibleCanvas.status -ne \'PASS\''));
  assert.ok(packageScript.includes('$stageCapture.sha256.ToLowerInvariant()'));
  assert.ok(packageScript.includes('$webGpuCapture.sha256.ToLowerInvariant()'));
  assert.doesNotMatch(packageScript, /^\s+-(?:or|and)\b/m, 'PowerShell boolean expressions must not begin continuation lines with an operator');
});

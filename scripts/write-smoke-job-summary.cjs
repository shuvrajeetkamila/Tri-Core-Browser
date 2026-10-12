'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeGpuTestPolicy,
  isKnownAnswerPass,
  isNoAdapterReport,
  isFsrPass,
  isFsrUnsupported,
  hasPhysicalGpuEvidence,
  classifyWebGpuSmoke,
} = require('../electron/webgpu-smoke-policy.cjs');

const FINAL_STATUSES = new Set(['PASS', 'FAIL', 'SKIPPED', 'UNSUPPORTED', 'NOT RUN']);
const INDEPENDENT_CHECK_LABELS = Object.freeze({
  packagedAppStartup: 'Packaged application startup',
  browserShellAndControls: 'Browser shell and controls',
  immersiveFullscreenEnterExit: 'Fullscreen enter/exit and layout restoration',
  localHttpJavascriptWebAssembly: 'Local HTTP, JavaScript, and WebAssembly',
  browserTabLifecycle: 'Browser tab lifecycle',
  httpsNavigation: 'HTTPS navigation (PASS or policy-safe BLOCKED)',
});

function boundedText(value, max = 700) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/https?:\/\/[^\s/:@]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
    .replace(/([?&](?:access[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|secret|token)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    .replace(/\b([a-z0-9_.-]*(?:authorization|password|passwd|secret|token|api[_-]?key)[a-z0-9_.-]*)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[REDACTED]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function markdownCell(value) {
  const text = boundedText(value, 700);
  return text ? text.replace(/\|/g, '\\|').replace(/`/g, '\\`') : '—';
}

function finalStatus(value, fallback = 'NOT RUN') {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PASSED') return 'PASS';
  if (normalized === 'FAILED') return 'FAIL';
  if (FINAL_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function stageStatus(stage, fallback = 'NOT RUN') {
  const status = finalStatus(stage?.status, '');
  if (status) return status;
  const legacy = String(stage?.status || '').trim().toLowerCase();
  if (legacy === 'passed') return 'PASS';
  if (legacy === 'failed') return 'FAIL';
  return fallback;
}

function normalizeStepOutcome(outcome) {
  const normalized = String(outcome || '').trim().toLowerCase();
  return ['success', 'failure', 'cancelled', 'skipped'].includes(normalized) ? normalized : 'unknown';
}

function artifactStepStatus(outcome) {
  const normalized = normalizeStepOutcome(outcome);
  if (normalized === 'success') return 'UPLOADED';
  if (normalized === 'failure') return 'UPLOAD FAILED';
  if (normalized === 'skipped') return 'NOT RUN';
  if (normalized === 'cancelled') return 'CANCELLED';
  return 'UNKNOWN';
}

function normalizeEvidenceValidationStatus(outcome) {
  const reportStatus = finalStatus(outcome, '');
  if (reportStatus) return reportStatus;
  const stepStatus = normalizeStepOutcome(outcome);
  if (stepStatus === 'success') return 'PASS';
  if (stepStatus === 'failure') return 'FAIL';
  return 'NOT RUN';
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { value: null, error: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { value: null, error: 'JSON root must be an object.' };
    return { value: parsed, error: '' };
  } catch (error) {
    return { value: null, error: boundedText(error?.message || error, 400) };
  }
}

function readLogTail(filePath, maximumLines = 12) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-maximumLines).map((line) => boundedText(line, 420));
  } catch {
    return [];
  }
}

function reportIsSynthetic(report) {
  return Boolean(report && (
    report.syntheticFixture === true
    || report.fixture === true
    || report.evidenceType === 'test-fixture'
    || report.evidenceProvenance === 'synthetic-test-fixture'
  ));
}

function deriveAdapterInfo(fsr, compute, failure, packaged) {
  const fsrDetails = fsr?.adapter || {};
  const computeDetails = compute?.adapterInfo || compute?.adapter || {};
  const failureDetails = failure?.webGpuIntegration?.snapshot?.adapter || {};
  const adapter = Object.keys(fsrDetails).length ? fsrDetails
    : Object.keys(failureDetails).length ? failureDetails : computeDetails;
  const graphics = fsr?.graphicsEnvironment
    || failure?.webGpuIntegration?.graphicsEnvironment
    || compute?.graphicsEnvironment
    || {};
  const devices = Array.isArray(graphics.chromiumGpuDevices) ? graphics.chromiumGpuDevices : [];
  const activeDevice = devices.find((device) => device?.active === true) || null;
  const parts = [adapter.vendor, adapter.architecture, adapter.device, adapter.description]
    .filter((part) => typeof part === 'string' && part.trim());
  const software = fsr?.softwareAdapter ?? adapter.softwareAdapter ?? computeDetails.softwareAdapter;
  const physicalConfirmed = packaged?.physicalGpuValidation === 'PASS'
    && hasPhysicalGpuEvidence(fsr)
    && hasPhysicalGpuEvidence(compute);
  const classification = software === true
    ? 'Software-rendered adapter (not physical-GPU evidence)'
    : physicalConfirmed
      ? 'Hardware-backed; required adapter and active-driver evidence passed'
      : software === false
        ? 'Not classified as software; physical hardware is not confirmed'
        : 'Unknown (adapter/software classification unavailable)';
  return {
    name: boundedText(adapter.description || adapter.device || activeDevice?.name || '', 160),
    vendor: boundedText(adapter.vendor || activeDevice?.vendor || '', 120),
    architecture: boundedText(adapter.architecture || '', 120),
    device: boundedText(adapter.device || activeDevice?.name || '', 160),
    vendorId: boundedText(activeDevice?.vendorId || '', 40),
    deviceId: boundedText(activeDevice?.deviceId || '', 40),
    driverVersion: boundedText(activeDevice?.driverVersion || '', 120),
    activeChromiumDevice: Boolean(activeDevice),
    softwareAdapter: software === true ? true : software === false ? false : null,
    classification,
    preference: fsr?.adapterRequestPath || compute?.adapterRequestPath || '',
    requestResults: fsr?.adapterRequestResults || compute?.adapterRequestResults || [],
    identity: parts.map((part) => boundedText(part, 160)).join(' · '),
  };
}

function stageFromReports(fsr, failure, name) {
  const direct = fsr?.stageResults?.[name]
    || failure?.webGpuIntegration?.stageResults?.[name];
  if (direct) return direct;
  const snapshotStage = failure?.webGpuIntegration?.snapshot?.stageResults?.[name];
  return snapshotStage || null;
}

function deriveDeviceStatus(fsr, compute, failure) {
  const stage = stageFromReports(fsr, failure, 'deviceInitialization');
  if (stage) return stageStatus(stage);
  const lifecycle = fsr?.lifecycle || {};
  if (lifecycle.deviceInitialized === true || fsr?.deviceInitialized === true) return 'PASS';
  if (lifecycle.state === 'device-failed' || fsr?.failureStage === 'device-request') return 'FAIL';
  if (compute?.deviceRequested === true
      && ['passed', 'PASS'].includes(compute?.resourceInitializationStatus)) return 'PASS';
  if (fsr?.adapterDetected === true || lifecycle.adapterDetected === true || compute?.adapterRequestResults?.some((item) => item.status === 'selected')) return 'NOT RUN';
  return 'NOT RUN';
}

function deriveShaderStatus(fsr, failure, stageName, legacyStatus) {
  const stage = stageFromReports(fsr, failure, stageName);
  if (stage) return stageStatus(stage);
  const overall = String(fsr?.lifecycle?.shaderCompilationStatus || fsr?.shaderCompilationStatus || '').toLowerCase();
  if (overall === 'passed') return 'PASS';
  if (overall === 'failed' && legacyStatus === 'failed') return 'FAIL';
  return 'NOT RUN';
}

function deriveDispatchStatus(fsr, failure, stageName, count) {
  const stage = stageFromReports(fsr, failure, stageName);
  if (stage) {
    const status = stageStatus(stage, '');
    const acceptanceStatus = finalStatus(stage.acceptanceStatus, '');
    return {
      status: status || (count > 0 ? 'PASS' : 'NOT RUN'),
      acceptanceStatus: acceptanceStatus || (count >= 3 ? 'PASS' : 'FAIL'),
      count,
      minimum: Number(stage.minimumRequiredDispatches) || 3,
    };
  }
  if (count >= 3) return { status: 'PASS', acceptanceStatus: 'PASS', count, minimum: 3 };
  const unavailable = fsr && isFsrUnsupported(fsr);
  const attempted = Number(fsr?.framesSubmitted || 0) > 0 || Number(failure?.webGpuIntegration?.snapshot?.framesSubmitted || 0) > 0;
  return {
    status: count > 0 ? 'PASS' : attempted ? 'FAIL' : 'NOT RUN',
    acceptanceStatus: count >= 3 ? 'PASS' : unavailable ? 'NOT RUN' : attempted ? 'FAIL' : 'NOT RUN',
    count,
    minimum: 3,
  };
}

function deriveOutputValidationStatus(fsr, failure) {
  const stage = stageFromReports(fsr, failure, 'outputValidation');
  if (stage) return stageStatus(stage);
  const stageAnalysis = fsr?.imageValidation?.stageComparison?.status
    || failure?.webGpuIntegration?.stageComparison?.status;
  const visible = fsr?.imageValidation?.visibleCanvas?.status
    || failure?.webGpuIntegration?.visibleCanvasComparison?.status;
  const imageStatus = fsr?.imageValidation?.status;
  if (imageStatus === 'PASS' && stageAnalysis === 'PASS' && visible === 'PASS') return 'PASS';
  if (imageStatus === 'FAIL' || stageAnalysis === 'FAIL' || visible === 'FAIL') return 'FAIL';
  return 'NOT RUN';
}

function summarizeImageEvidence(fsr, failure) {
  const summary = fsr || {};
  const failedIntegration = failure?.webGpuIntegration || {};
  const captures = summary.imageValidation?.captures || failedIntegration.diagnosticCaptures || {};
  const hashes = [];
  for (const key of ['lowResolutionInput', 'easuIntermediate', 'rcasOutput']) {
    const capture = captures[key];
    if (!capture) continue;
    hashes.push({
      label: key,
      width: capture.width,
      height: capture.height,
      sha256: boundedText(capture.sha256 || '', 80),
      file: path.basename(String(capture.path || '')),
    });
  }
  const visible = summary.visibleOutputCapture || {};
  const visibleHash = visible.sha256 || failedIntegration.visibleOutputCapture?.sha256 || '';
  if (visibleHash || visible.path) {
    hashes.push({
      label: 'visible canvas PNG (evidence only)',
      width: visible.width || null,
      height: visible.height || null,
      sha256: boundedText(visibleHash, 80),
      file: path.basename(String(visible.path || failedIntegration.visibleCapturePath || '')),
    });
  }
  const numeric = summary.imageValidation?.stageComparison?.numerical
    || failedIntegration.stageComparison?.numerical
    || {};
  const visibleComparison = summary.imageValidation?.visibleCanvas
    || failedIntegration.visibleCanvasComparison
    || {};
  return {
    input: summary.input || failedIntegration.snapshot?.stageResults?.outputGeneration?.input || null,
    output: summary.output || failedIntegration.snapshot?.stageResults?.outputGeneration?.output || null,
    hashes,
    numerical: {
      easuVsBilinearMae: numeric.easuVsBilinearMeanAbsoluteErrorNormalized ?? null,
      rcasVsEasuMae: numeric.rcasVsEasuMeanAbsoluteErrorNormalized ?? null,
      easuChangedPixelFraction: numeric.easuChangedPixelFraction ?? null,
      rcasChangedPixelFraction: numeric.rcasChangedPixelFraction ?? null,
      outputMeanNeighborDifference: numeric.rcasMeanNeighborDifferenceNormalized ?? null,
      visibleMeanAbsoluteError: visibleComparison.meanAbsoluteErrorNormalized ?? null,
      visibleLuminanceCorrelation: visibleComparison.luminanceCorrelation ?? null,
      visibleSampleCount: visibleComparison.sampleCount ?? null,
    },
  };
}

function outputStepStatus(outcome, report, reportReadError, checkErrors) {
  const normalized = normalizeStepOutcome(outcome);
  if (normalized === 'failure') return { status: 'FAIL', outcome: normalized };
  if (normalized === 'cancelled' || normalized === 'skipped' || normalized === 'unknown') {
    return { status: 'NOT RUN', outcome: normalized };
  }
  const errors = [...(checkErrors || [])];
  if (!report) errors.push(reportReadError || 'packaged-smoke-summary.json is missing.');
  else if (report.status !== 'PASS') errors.push(`packaged-smoke-summary.json has status ${report.status || 'missing'}, not PASS.`);
  if (errors.length) return { status: 'FAIL', outcome: normalized, errors };
  return { status: 'PASS', outcome: normalized, errors: [] };
}

function buildSmokeJobSummary({
  context = {},
  outcomes = {},
  reports = {},
  reportErrors = {},
  artifactNames = {},
  logTail = [],
} = {}) {
  const policy = normalizeGpuTestPolicy(context.policy || reports.packaged?.gpuTestPolicy || 'off');
  const fixture = context.isFixture === true || Object.values(reports).some(reportIsSynthetic);
  const packaged = reports.packaged || null;
  const compute = reports.compute || null;
  const fsr = reports.fsr || null;
  const failure = reports.failure || null;
  const acceptanceReport = packaged?.webGpuAcceptance || failure?.webGpuIntegration?.acceptance || null;
  const smokeStep = normalizeStepOutcome(outcomes.smoke);
  const evidenceValidationStatus = normalizeEvidenceValidationStatus(outcomes.evidenceValidation);
  const computeState = compute
    ? (compute.status === 'PASS' && !isKnownAnswerPass(compute) ? 'FAIL'
      : compute.status === 'UNSUPPORTED' && !isNoAdapterReport(compute) ? 'FAIL'
        : finalStatus(compute.status))
    : 'NOT RUN';
  const fsrState = fsr
    ? (fsr.status === 'PASS' && !isFsrPass(fsr) ? 'FAIL'
      : ['SKIPPED', 'UNSUPPORTED'].includes(fsr.status) && !isFsrUnsupported(fsr) ? 'FAIL'
        : finalStatus(fsr.status))
    : finalStatus(failure?.webGpuIntegration?.status, 'NOT RUN');
  const classifier = compute || fsr
    ? classifyWebGpuSmoke({ policy, computeProbe: compute, fsrReport: fsr })
    : { status: 'NOT RUN', reason: 'The WebGPU reports were not produced.' };
  let gpuAcceptanceStatus = finalStatus(acceptanceReport?.status || classifier.status);
  let gpuAcceptanceReason = boundedText(acceptanceReport?.reason || classifier.reason || '', 900);
  const consistencyErrors = [];
  if (packaged && packaged.schemaVersion !== 1) {
    consistencyErrors.push(`packaged-smoke-summary.json schemaVersion must be 1 (got ${packaged.schemaVersion ?? 'missing'}).`);
  }
  if (acceptanceReport && acceptanceReport.schemaVersion !== 1) {
    consistencyErrors.push(`WebGPU acceptance schemaVersion must be 1 (got ${acceptanceReport.schemaVersion ?? 'missing'}).`);
  }
  if (smokeStep === 'success' && evidenceValidationStatus !== 'PASS') {
    consistencyErrors.push(`The packaged smoke step succeeded without a PASS from the JSON/PNG evidence validator (got ${evidenceValidationStatus}).`);
  }

  if (acceptanceReport && classifier.status !== acceptanceReport.status) {
    consistencyErrors.push(`Packaged acceptance says ${acceptanceReport.status}, but report-derived policy classification is ${classifier.status}.`);
    gpuAcceptanceStatus = 'FAIL';
  }
  if (packaged?.webGpuAcceptance) {
    if (packaged.webGpuAcceptance.computeStatus !== compute?.status) {
      consistencyErrors.push('Packaged acceptance computeStatus does not match webgpu-compute-smoke-summary.json.');
    }
    if (packaged.webGpuAcceptance.fsrStatus !== fsr?.status) {
      consistencyErrors.push('Packaged acceptance fsrStatus does not match fsr1-webgpu-summary.json.');
    }
    if (packaged.physicalGpuValidation !== packaged.webGpuAcceptance.physicalGpuValidation) {
      consistencyErrors.push('Packaged and WebGPU acceptance physical-GPU statuses disagree.');
    }
    if (packaged.checks?.independentWebGpuCompute !== compute?.status) {
      consistencyErrors.push('Packaged independentWebGpuCompute check does not match the compute report.');
    }
    if (packaged.checks?.bundledWebGpuFsr1 !== packaged.webGpuAcceptance.status) {
      consistencyErrors.push('Packaged bundledWebGpuFsr1 check does not match WebGPU acceptance.');
    }
    if (normalizeGpuTestPolicy(packaged.gpuTestPolicy) !== policy) {
      consistencyErrors.push('Packaged GPU policy does not match the workflow policy.');
    }
    if (policy === 'optional' && packaged.releaseEligible !== false) {
      consistencyErrors.push('An optional hosted smoke must not claim release eligibility.');
    }
    if (policy === 'required' && packaged.releaseEligible === true
        && (packaged.webGpuAcceptance.status !== 'PASS' || packaged.physicalGpuValidation !== 'PASS')) {
      consistencyErrors.push('A required release-eligible package lacks WebGPU and physical-GPU PASS states.');
    }
  }

  if (fixture) {
    gpuAcceptanceReason = `SYNTHETIC TEST FIXTURE ONLY — not a packaged run or hardware evidence. ${gpuAcceptanceReason}`.trim();
  }

  const packageStep = normalizeStepOutcome(outcomes.package);
  const executableValidationStep = normalizeStepOutcome(outcomes.executableValidation);
  const smokeCheck = outputStepStatus(smokeStep, packaged, reportErrors.packaged, consistencyErrors);
  let packageStatus = smokeCheck.status;
  if (packageStep === 'failure' || executableValidationStep === 'failure') packageStatus = 'FAIL';
  else if (packageStep !== 'success' && packageStatus === 'PASS') packageStatus = 'NOT RUN';
  if (fixture) packageStatus = 'NOT RUN';

  const checks = packaged?.checks || {};
  const independentRows = Object.entries(INDEPENDENT_CHECK_LABELS).map(([key, label]) => ({
    key,
    label,
    status: checks[key] === 'BLOCKED' ? 'BLOCKED' : finalStatus(checks[key]),
  }));
  const presentIndependent = independentRows.filter((row) => checks[row.key]);
  const independentStatus = presentIndependent.length === 0
    ? 'NOT RUN'
    : presentIndependent.every((row) => row.status === 'PASS' || row.status === 'BLOCKED')
      ? 'PASS'
      : presentIndependent.some((row) => row.status === 'FAIL') ? 'FAIL' : 'NOT RUN';
  const warpReport = reports.browserFrame || null;
  const warpStatus = warpReport?.status === 'FAIL' ? 'FAIL'
    : warpReport?.status === 'PASS' && warpReport?.softwareAdapter === true && evidenceValidationStatus === 'PASS'
      ? 'PASS (WARP software only)'
      : evidenceValidationStatus === 'FAIL' && warpReport ? 'FAIL (evidence validation failed)'
        : 'NOT RUN';

  const adapter = deriveAdapterInfo(fsr, compute, failure, packaged);
  const fsrDispatch = fsr?.dispatch || {};
  const failureSnapshot = failure?.webGpuIntegration?.snapshot || {};
  const easuCount = Number(fsrDispatch.easuDispatches ?? failureSnapshot.easuDispatches ?? 0) || 0;
  const rcasCount = Number(fsrDispatch.rcasDispatches ?? failureSnapshot.rcasDispatches ?? 0) || 0;
  const easuDispatch = deriveDispatchStatus(fsr, failure, 'easuDispatch', easuCount);
  const rcasDispatch = deriveDispatchStatus(fsr, failure, 'rcasDispatch', rcasCount);
  const deviceStatus = deriveDeviceStatus(fsr, compute, failure);
  const easuShaderStatus = deriveShaderStatus(fsr, failure, 'easuShaderCompilation', 'failed');
  const rcasShaderStatus = deriveShaderStatus(fsr, failure, 'rcasShaderCompilation', 'failed');
  const outputGenerationStage = stageFromReports(fsr, failure, 'outputGeneration');
  const outputGenerationStatus = outputGenerationStage
    ? stageStatus(outputGenerationStage)
    : Number(fsr?.processedFrames || failureSnapshot.framesCompleted || 0) >= 3 ? 'PASS' : 'NOT RUN';
  const outputValidationStatus = deriveOutputValidationStatus(fsr, failure);
  const apiStage = stageFromReports(fsr, failure, 'apiDetection');
  const adapterDiscoveryStage = stageFromReports(fsr, failure, 'adapterDiscovery');
  const apiStatus = apiStage
    ? stageStatus(apiStage)
    : compute?.apiDetected === true || fsr?.apiDetected === true ? 'PASS'
      : compute?.apiDetected === false ? 'UNSUPPORTED' : 'NOT RUN';
  const adapterDiscoveryStatus = adapterDiscoveryStage
    ? stageStatus(adapterDiscoveryStage)
    : fsr?.adapterDetected === true || fsr?.lifecycle?.adapterDetected === true ? 'PASS'
      : fsr && isFsrUnsupported(fsr) ? 'UNSUPPORTED'
        : fsr?.failureStage === 'adapter-discovery' ? 'FAIL' : 'NOT RUN';
  const timingSnapshot = fsr || failure?.webGpuIntegration?.snapshot || {};
  const gpuTiming = fsr?.gpuTimestamps || {};
  let physicalGpu = fixture
    ? 'NOT RUN'
    : finalStatus(packaged?.physicalGpuValidation || acceptanceReport?.physicalGpuValidation || 'NOT RUN');
  const physicalEvidenceVerified = !fixture
    && policy === 'required'
    && physicalGpu === 'PASS'
    && hasPhysicalGpuEvidence(compute)
    && hasPhysicalGpuEvidence(fsr);
  if (physicalGpu === 'PASS' && !physicalEvidenceVerified) {
    consistencyErrors.push('A physical-GPU PASS lacks required-policy adapter, active Chromium device, and driver evidence in both compute and FSR reports.');
    physicalGpu = 'FAIL';
  }
  if (fixture) gpuAcceptanceStatus = 'NOT RUN';
  const ifSmokeReportMissing = !packaged;
  const failureReason = boundedText(
    failure?.failure?.message
      || failure?.failure?.code
      || (acceptanceReport?.status && acceptanceReport.status !== 'PASS' ? acceptanceReport.reason : '')
      || (fsrState === 'FAIL' ? fsr?.reason : '')
      || compute?.error
      || reportErrors.packaged
      || reportErrors.compute
      || reportErrors.fsr
      || (evidenceValidationStatus === 'FAIL' ? 'The packaged JSON/report/PNG evidence validator failed.' : '')
      || (packageStep === 'failure' ? 'The Windows package build step failed.' : '')
      || (executableValidationStep === 'failure' ? 'The packaged executable validation step failed.' : '')
      || (ifSmokeReportMissing && smokeStep === 'skipped' ? 'The packaged smoke process was not run; no report was produced.' : '')
      || (ifSmokeReportMissing && smokeStep === 'failure' ? 'The packaged smoke report was not produced; the process may have crashed or exited before reporting.' : '')
      || (ifSmokeReportMissing && smokeStep === 'success' ? 'The smoke process succeeded but packaged-smoke-summary.json is missing.' : '')
      || (smokeStep === 'failure' ? 'The packaged smoke process exited unsuccessfully.' : '')
      || '',
    1000,
  );
  const detailLines = Array.isArray(logTail) ? logTail.map((line) => boundedText(line, 420)).filter(Boolean).slice(-12) : [];
  const runId = boundedText(context.runId || '', 80);
  const repository = boundedText(context.repository || '', 200);
  const runUrl = runId && repository ? `https://github.com/${repository}/actions/runs/${encodeURIComponent(runId)}` : '';
  const artifactRows = Object.entries({
    executableCandidate: { name: artifactNames.candidate || 'TriCoreBrowser-Windows-x64-unverified-smoke-candidate', outcome: outcomes.candidateArtifact },
    diagnostics: { name: artifactNames.diagnostics || 'TriCoreBrowser-Packaged-Smoke-Diagnostics', outcome: outcomes.diagnosticsArtifact },
    distributionAssembly: { name: 'Portable distribution assembly', outcome: outcomes.distributionBuild },
    physicalGpuPackage: { name: artifactNames.distribution || 'TriCoreBrowser-Windows-x64-physical-GPU-validated', outcome: outcomes.distributionArtifact },
  }).map(([key, item]) => ({ key, name: item.name, outcome: artifactStepStatus(item.outcome) }));

  const integrityErrors = [...consistencyErrors];
  if (smokeStep === 'success' && (!packaged || packaged.status !== 'PASS')) {
    integrityErrors.push('The packaged smoke step succeeded but its packaged-smoke-summary.json is missing or not PASS.');
  }
  if (policy === 'required' && smokeStep === 'success' && (gpuAcceptanceStatus !== 'PASS' || physicalGpu !== 'PASS')) {
    integrityErrors.push('A required GPU job succeeded without a verified WebGPU PASS and physical-GPU PASS.');
  }
  if (policy === 'optional' && gpuAcceptanceStatus === 'UNSUPPORTED' && smokeStep === 'success') {
    integrityErrors.push('An optional successful job cannot report aggregate WebGPU UNSUPPORTED; the expected policy state is a validated SKIPPED.');
  }
  const exitCode = integrityErrors.length && smokeStep === 'success' ? 1 : 0;

  const model = {
    fixture,
    policy,
    run: {
      id: runId,
      attempt: boundedText(context.attempt || '', 20),
      branch: boundedText(context.branch || '', 200),
      commit: boundedText(context.commit || '', 80),
      workflow: boundedText(context.workflow || '', 160),
      event: boundedText(context.event || '', 80),
      job: boundedText(context.job || '', 120),
      url: runUrl,
    },
    appVersion: boundedText(packaged?.appVersion || failure?.appVersion || context.appVersion || '', 80),
    electronVersion: boundedText(
      packaged?.runtime?.electron || failure?.runtime?.electron || fsr?.runtime?.electron || compute?.runtime?.electron
        || (context.declaredElectronVersion ? `${context.declaredElectronVersion} declared; runtime not recorded` : ''),
      120,
    ),
    chromiumVersion: boundedText(packaged?.runtime?.chromium || failure?.runtime?.chromium || fsr?.runtime?.chromium || compute?.runtime?.chromium || '', 80),
    packageStatus,
    packageOutcome: packageStep,
    executableValidationOutcome: executableValidationStep,
    smokeOutcome: smokeStep,
    reportValidationStatus: fixture ? 'NOT RUN' : evidenceValidationStatus,
    distributionBuildOutcome: normalizeStepOutcome(outcomes.distributionBuild),
    independentStatus: fixture ? 'NOT RUN' : independentStatus,
    independentRows: fixture ? independentRows.map((row) => ({ ...row, status: 'NOT RUN' })) : independentRows,
    warpStatus: fixture ? 'NOT RUN (fixture)' : warpStatus,
    gpuAcceptanceStatus,
    gpuAcceptanceReason: gpuAcceptanceReason || failureReason,
    computeStatus: fixture ? 'NOT RUN' : computeState,
    fsrStatus: fixture ? 'NOT RUN' : fsrState,
    computeResult: compute ? `${compute.readbackResult ?? '—'} / expected ${compute.expectedResult ?? 42}` : 'No compute report',
    adapter,
    apiStatus: fixture ? 'NOT RUN' : apiStatus,
    adapterDiscoveryStatus: fixture ? 'NOT RUN' : adapterDiscoveryStatus,
    deviceStatus: fixture ? 'NOT RUN' : deviceStatus,
    easuShaderStatus: fixture ? 'NOT RUN' : easuShaderStatus,
    rcasShaderStatus: fixture ? 'NOT RUN' : rcasShaderStatus,
    easuPipelineStatus: fixture ? 'NOT RUN' : stageStatus(stageFromReports(fsr, failure, 'easuPipelineCreation')),
    rcasPipelineStatus: fixture ? 'NOT RUN' : stageStatus(stageFromReports(fsr, failure, 'rcasPipelineCreation')),
    easuDispatch: fixture ? { status: 'NOT RUN', acceptanceStatus: 'NOT RUN', count: 0, minimum: 3 } : easuDispatch,
    rcasDispatch: fixture ? { status: 'NOT RUN', acceptanceStatus: 'NOT RUN', count: 0, minimum: 3 } : rcasDispatch,
    outputGenerationStatus: fixture ? 'NOT RUN' : outputGenerationStatus,
    outputValidationStatus: fixture ? 'NOT RUN' : outputValidationStatus,
    dimensions: fixture ? {
      input: null,
      output: null,
      hashes: [],
      numerical: {
        easuVsBilinearMae: null,
        rcasVsEasuMae: null,
        easuChangedPixelFraction: null,
        rcasChangedPixelFraction: null,
        outputMeanNeighborDifference: null,
        visibleMeanAbsoluteError: null,
        visibleLuminanceCorrelation: null,
        visibleSampleCount: null,
      },
    } : summarizeImageEvidence(fsr, failure),
    physicalGpu: fixture ? 'NOT RUN' : physicalGpu,
    timing: fixture ? null : {
      lastQueueCompletionWallMs: timingSnapshot.lastQueueCompletionWallMs ?? null,
      averageQueueCompletionWallMs: timingSnapshot.averageQueueCompletionWallMs ?? null,
      maxQueueCompletionWallMs: timingSnapshot.maxQueueCompletionWallMs ?? null,
      easuGpuMs: gpuTiming.lastEasuGpuTimeMs ?? null,
      rcasGpuMs: gpuTiming.lastRcasGpuTimeMs ?? null,
      gpuTimestampSamples: gpuTiming.samples ?? 0,
    },
    reportErrors: Object.entries(reportErrors).filter(([, error]) => error).map(([name, error]) => `${name}: ${error}`),
    reason: fixture
      ? 'Synthetic test fixture only; it is not a real packaged run or hardware evidence.'
      : failureReason || (gpuAcceptanceStatus === 'SKIPPED' ? gpuAcceptanceReason : ''),
    detailLines: fixture ? [] : detailLines,
    artifacts: artifactRows,
    integrityErrors,
    exitCode,
  };
  return model;
}

function renderSmokeJobSummary(model) {
  const titleStatus = model.fixture ? 'SYNTHETIC TEST FIXTURE — NOT HARDWARE EVIDENCE' : model.packageStatus;
  const lines = [
    `## Packaged Windows smoke and WebGPU / FSR1 evidence — ${titleStatus}`,
    '',
    `**Run:** ${model.run.id ? `[#${model.run.id}](${model.run.url})` : 'not available'}${model.run.attempt ? ` (attempt ${model.run.attempt})` : ''}  `,
    `**Commit / branch:** \`${markdownCell(model.run.commit)}\` / \`${markdownCell(model.run.branch)}\`  `,
    `**Workflow / event / job:** ${markdownCell(model.run.workflow)} / ${markdownCell(model.run.event)} / ${markdownCell(model.run.job)}  `,
    `**App / Electron / Chromium:** ${markdownCell(model.appVersion || 'not recorded')} / ${markdownCell(model.electronVersion || 'not recorded')} / ${markdownCell(model.chromiumVersion || 'not recorded')}  `,
    `**Policy:** \`${model.policy}\` · **Package build / executable check:** \`${model.packageOutcome} / ${model.executableValidationOutcome}\` · **Smoke process / evidence validator:** \`${model.smokeOutcome}\` / **${model.reportValidationStatus}** · **Overall packaged status:** **${model.packageStatus}** · **GPU runtime:** **${model.gpuAcceptanceStatus}** · **Physical GPU:** **${model.physicalGpu}**`,
    '',
    '> A green GPU-independent packaged smoke does not imply a WebGPU pass. `SKIPPED`, `UNSUPPORTED`, and `NOT RUN` are not GPU passes. The WARP PNG route is reported separately as software-only.',
    '',
    '### GPU-independent packaged checks',
    '',
    '| Check | Result |',
    '|---|---|',
    ...model.independentRows.map((row) => `| ${row.label} | **${row.status}** |`),
    `| Packaged GPU-independent gates | **${model.independentStatus}** |`,
    `| JSON schema / report consistency / PNG integrity validator | **${model.reportValidationStatus}** |`,
    `| Separate capturePage → D3D12 WARP PNG diagnostic | **${model.warpStatus}** |`,
    '',
    '### WebGPU / FSR1 stages (bundled game-owned scene only)',
    '',
    '| Stage | Result | Evidence |',
    '|---|---|---|',
    `| Aggregate WebGPU acceptance | **${model.gpuAcceptanceStatus}** | ${markdownCell(model.gpuAcceptanceReason || 'No acceptance reason recorded.')} |`,
    `| Bundled FSR scene report | **${model.fsrStatus}** | This is separate from the independent compute probe |`,
    `| WebGPU API | **${model.apiStatus}** | Secure packaged renderer probe |`,
    `| Adapter discovery | **${model.adapterDiscoveryStatus}** | ${markdownCell(model.adapter.identity || model.adapter.requestResults.map((item) => `${item.path || ''}:${item.status || ''}`).join(', ') || 'No adapter identity/request evidence')} |`,
    `| Adapter classification | **${markdownCell(model.adapter.classification)}** | Vendor ${markdownCell(model.adapter.vendor)}; device ${markdownCell(model.adapter.device)}; vendor/device IDs ${markdownCell(model.adapter.vendorId)}/${markdownCell(model.adapter.deviceId)}; active Chromium device ${model.adapter.activeChromiumDevice ? 'yes' : 'no'}; driver ${markdownCell(model.adapter.driverVersion)} |`,
    `| Device initialization | **${model.deviceStatus}** | FSR renderer device lifecycle; distinct from the compute-probe device |`,
    `| Known-answer compute | **${model.computeStatus}** | Readback ${markdownCell(model.computeResult)} |`,
    `| EASU WGSL compilation / pipeline | **${model.easuShaderStatus} / ${model.easuPipelineStatus}** | EASU shader/pipeline fields from FSR report |`,
    `| EASU dispatch | **${model.easuDispatch.status}** (acceptance ${model.easuDispatch.acceptanceStatus}) | ${model.easuDispatch.count}/${model.easuDispatch.minimum} completed dispatches required |`,
    `| RCAS WGSL compilation / pipeline | **${model.rcasShaderStatus} / ${model.rcasPipelineStatus}** | RCAS shader/pipeline fields from FSR report |`,
    `| RCAS dispatch | **${model.rcasDispatch.status}** (acceptance ${model.rcasDispatch.acceptanceStatus}) | ${model.rcasDispatch.count}/${model.rcasDispatch.minimum} completed dispatches required |`,
    `| Output generation/presentation | **${model.outputGenerationStatus}** | ${formatDimensions(model.dimensions.input)} → ${formatDimensions(model.dimensions.output)} |`,
    `| Output validation | **${model.outputValidationStatus}** | See pixel metrics and PNG hashes below |`,
    `| Physical-GPU confirmation | **${model.physicalGpu}** | Requires non-software adapter plus active Chromium GPU device/driver evidence under required policy |`,
    '',
    `**GPU result reason:** ${markdownCell(model.gpuAcceptanceReason || 'No failure/skip reason recorded.')}`,
    '',
    '### Output evidence',
    '',
    `**Dimensions:** input ${formatDimensions(model.dimensions.input)} → output ${formatDimensions(model.dimensions.output)}  `,
    `**Metrics:** EASU vs bilinear MAE ${formatMetric(model.dimensions.numerical.easuVsBilinearMae)}; RCAS vs EASU MAE ${formatMetric(model.dimensions.numerical.rcasVsEasuMae)}; EASU changed-pixel fraction ${formatMetric(model.dimensions.numerical.easuChangedPixelFraction)}; RCAS changed-pixel fraction ${formatMetric(model.dimensions.numerical.rcasChangedPixelFraction)}; visible-canvas MAE ${formatMetric(model.dimensions.numerical.visibleMeanAbsoluteError)}; luminance correlation ${formatMetric(model.dimensions.numerical.visibleLuminanceCorrelation)}; samples ${formatMetric(model.dimensions.numerical.visibleSampleCount)}.  `,
    '**Capture SHA-256 values:**',
    '',
  ];
  if (model.dimensions.hashes.length) {
    for (const capture of model.dimensions.hashes) {
      lines.push(`- ${markdownCell(capture.label)} (${markdownCell(capture.file || 'file path not recorded')}, ${formatDimensions({ width: capture.width, height: capture.height })}): \`${markdownCell(capture.sha256 || 'not recorded')}\``);
    }
  } else {
    lines.push('- No output capture/hash was recorded.');
  }
  lines.push('', '### Timing', '',
    `**FSR queue-completion wall time:** last ${formatMetric(model.timing?.lastQueueCompletionWallMs)} ms; average ${formatMetric(model.timing?.averageQueueCompletionWallMs)} ms; max ${formatMetric(model.timing?.maxQueueCompletionWallMs)} ms. These are not GPU timestamps.  `,
    `**EASU / RCAS GPU timestamp samples:** ${markdownCell(model.timing?.easuGpuMs ?? 'not available')} / ${markdownCell(model.timing?.rcasGpuMs ?? 'not available')} ms (${markdownCell(model.timing?.gpuTimestampSamples ?? 0)} sample(s)).`,
    '',
    '### Failure / skip detail',
    '',
  );
  if (model.reason) lines.push(`- ${markdownCell(model.reason)}`);
  else lines.push('- No packaged-smoke failure message was recorded.');
  for (const error of model.reportErrors) lines.push(`- **Report read error:** ${markdownCell(error)}`);
  if (model.integrityErrors.length) {
    for (const error of model.integrityErrors) lines.push(`- **Evidence consistency error:** ${markdownCell(error)}`);
  }
  if (model.detailLines.length) {
    const longestBacktickRun = model.detailLines.reduce((maximum, line) => {
      const runs = line.match(/`+/g) || [];
      return Math.max(maximum, ...runs.map((run) => run.length));
    }, 0);
    const logFence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
    lines.push('', '<details><summary>Last available smoke log lines (redacted and truncated)</summary>', '', `${logFence}text`, ...model.detailLines, logFence, '', '</details>');
  }
  lines.push('', '### Diagnostic artifacts', '', '| Artifact | Upload step |', '|---|---|');
  const runArtifacts = model.run.url ? `${model.run.url}#artifacts` : '';
  for (const artifact of model.artifacts) {
    const name = runArtifacts ? `[\`${markdownCell(artifact.name)}\`](${runArtifacts})` : `\`${markdownCell(artifact.name)}\``;
    lines.push(`| ${name} | \`${artifact.outcome}\` |`);
  }
  lines.push('', `**Artifact layout:** \`${markdownCell(model.artifactDirectory)}\` (raw smoke logs/reports/PNG files are uploaded without secrets or environment dumps).`);
  if (model.fixture) lines.push('', '> **Synthetic fixture notice:** this summary was built from test fixture data. No packaged application, GPU, adapter, or physical hardware was exercised.');
  return `${lines.join('\n')}\n`;
}

function formatDimensions(dimensions) {
  if (!dimensions || !Number.isFinite(Number(dimensions.width)) || !Number.isFinite(Number(dimensions.height))
      || Number(dimensions.width) <= 0 || Number(dimensions.height) <= 0) return 'not recorded';
  return `${Number(dimensions.width)}×${Number(dimensions.height)}`;
}

function formatMetric(value) {
  if (value === null || value === undefined || value === '') return 'not available';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'not finite';
  return boundedText(value, 60);
}

function readReportsFromDirectory(directory) {
  const root = path.resolve(directory || '.');
  const entries = {
    packaged: 'packaged-smoke-summary.json',
    compute: 'webgpu-compute-smoke-summary.json',
    fsr: 'fsr1-webgpu-summary.json',
    failure: 'packaged-smoke-failure-summary.json',
    browserFrame: 'browser-frame-smoke-summary.json',
  };
  const reports = {};
  const errors = {};
  for (const [key, fileName] of Object.entries(entries)) {
    const { value, error } = readJsonIfPresent(path.join(root, fileName));
    reports[key] = value;
    if (error) errors[key] = `${fileName}: ${error}`;
  }
  return { reports, errors, root };
}

function loadPackageMetadata(cwd) {
  const filePath = path.join(cwd || process.cwd(), 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { version: pkg.version || '', electronVersion: pkg.devDependencies?.electron || '' };
  } catch {
    return { version: '', electronVersion: '' };
  }
}

function main(env = process.env) {
  const outputDirectory = env.TRICORE_SMOKE_EVIDENCE_DIR || path.join(env.RUNNER_TEMP || process.cwd(), 'tricore-fsr-integration-smoke');
  const loaded = readReportsFromDirectory(outputDirectory);
  const packageMetadata = loadPackageMetadata(process.cwd());
  const logTail = [
    ...readLogTail(env.TRICORE_SMOKE_LOG, 8),
    ...readLogTail(env.TRICORE_SMOKE_STDOUT, 4),
    ...readLogTail(env.TRICORE_SMOKE_STDERR, 8),
  ].slice(-12);
  const model = buildSmokeJobSummary({
    context: {
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
      repository: env.GITHUB_REPOSITORY,
      branch: env.GITHUB_REF_NAME,
      commit: env.GITHUB_SHA,
      workflow: env.GITHUB_WORKFLOW,
      event: env.GITHUB_EVENT_NAME,
      job: env.GITHUB_JOB,
      policy: env.TRICORE_GPU_TEST_POLICY,
      appVersion: packageMetadata.version,
      declaredElectronVersion: packageMetadata.electronVersion,
    },
    outcomes: {
      package: env.TRICORE_PACKAGE_OUTCOME,
      executableValidation: env.TRICORE_EXECUTABLE_VALIDATION_OUTCOME,
      smoke: env.TRICORE_SMOKE_OUTCOME,
      evidenceValidation: env.TRICORE_EVIDENCE_VALIDATION_OUTCOME,
      candidateArtifact: env.TRICORE_CANDIDATE_ARTIFACT_OUTCOME,
      diagnosticsArtifact: env.TRICORE_DIAGNOSTICS_ARTIFACT_OUTCOME,
      distributionBuild: env.TRICORE_DISTRIBUTION_BUILD_OUTCOME,
      distributionArtifact: env.TRICORE_DISTRIBUTION_ARTIFACT_OUTCOME,
    },
    reports: loaded.reports,
    reportErrors: loaded.errors,
    artifactNames: {
      candidate: env.TRICORE_CANDIDATE_ARTIFACT_NAME,
      diagnostics: env.TRICORE_DIAGNOSTICS_ARTIFACT_NAME,
      distribution: env.TRICORE_DISTRIBUTION_ARTIFACT_NAME,
    },
    logTail,
  });
  model.artifactDirectory = path.basename(loaded.root);
  const markdown = renderSmokeJobSummary(model);
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is not set; refusing to claim the job summary was written.');
  fs.appendFileSync(summaryPath, markdown, { encoding: 'utf8' });
  console.log(`[smoke-job-summary] appended truthful evidence summary for run ${model.run.id || 'unknown'}; packaged=${model.packageStatus}; WebGPU=${model.gpuAcceptanceStatus}; physicalGpu=${model.physicalGpu}`);
  return model.exitCode;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[smoke-job-summary] FAIL: ${boundedText(error?.stack || error, 2000)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  FINAL_STATUSES,
  buildSmokeJobSummary,
  renderSmokeJobSummary,
  readReportsFromDirectory,
  outputStepStatus,
  main,
};

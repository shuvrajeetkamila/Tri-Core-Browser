'use strict';

const WEBGPU_SMOKE_STATUSES = Object.freeze(['PASS', 'SKIPPED', 'UNSUPPORTED', 'FAIL', 'NOT RUN']);
const GPU_TEST_POLICIES = new Set(['off', 'optional', 'required']);
const ADAPTER_UNAVAILABLE_STAGES = new Set(['webgpu-api-detection', 'adapter-discovery']);
const SOFTWARE_ADAPTER_PATTERN = /\bwarp\b|swiftshader|software raster|basic render|llvmpipe/i;
const EMPTY_IDENTITY_PATTERN = /^(?:unknown(?:\s+(?:vendor|device|adapter|gpu|architecture))?|generic(?:\s+(?:vendor|device|adapter|gpu))?|none|n\/?a|not available)$/i;
const EMPTY_DRIVER_PATTERN = /^(?:unknown|generic|none|n\/?a|not available|0+(?:\.0+)*)$/i;

function normalizeGpuTestPolicy(value) {
  const policy = String(value || '').trim().toLowerCase();
  return GPU_TEST_POLICIES.has(policy) ? policy : 'off';
}

function isUnsafeLaunch(report) {
  const switches = report?.launchDiagnostics?.gpuRelatedSwitches || {};
  const disableDawnFeatures = String(switches['disable-dawn-features'] || '');
  const enableDawnFeatures = String(switches['enable-dawn-features'] || '');
  const disableFeatures = String(switches['disable-features'] || '');
  return Boolean(
    switches['enable-unsafe-webgpu']
    || switches['ignore-gpu-blocklist']
    || switches['disable-gpu-driver-bug-workarounds']
    || switches['disable-gpu-sandbox']
    || switches['disable-gpu']
    || switches['disable-webgpu']
    || /adapter_blocklist|allow_unsafe_apis/i.test(disableDawnFeatures)
    || /allow_unsafe_apis/i.test(enableDawnFeatures)
    || /(^|,|\s)webgpu(,|\s|$)/i.test(disableFeatures),
  );
}

function isKnownAnswerPass(report) {
  return Boolean(
    report
    && report.status === 'PASS'
    && report.state === 'output-verified'
    && report.secureContext === true
    && report.apiDetected === true
    && report.deviceRequested === true
    && report.shaderCompilationStatus === 'passed'
    && report.pipelineCreationStatus === 'passed'
    && report.resourceInitializationStatus === 'passed'
    && report.dispatches === 1
    && report.queueCompleted === true
    && report.expectedResult === 42
    && report.readbackResult === 42
    && report.readbackVerified === true
    && report.physicalGpuValidation === 'NOT RUN'
    && !isUnsafeLaunch(report),
  );
}

function isNoAdapterReport(report) {
  const failureStage = String(report?.failureStage || '');
  if (!report || !ADAPTER_UNAVAILABLE_STAGES.has(failureStage)) return false;
  if (report.status === 'UNSUPPORTED') {
    if (report.state !== 'unsupported') return false;
  } else if (!(report.unsupported === true && report.capabilityStatus === 'UNSUPPORTED')) {
    return false;
  }
  if (report.deviceRequested === true || report.dispatches > 0 || report.readbackVerified === true) return false;
  if (report.shaderCompilationStatus && report.shaderCompilationStatus !== 'NOT RUN') return false;
  if (report.pipelineCreationStatus && report.pipelineCreationStatus !== 'NOT RUN') return false;
  if (report.resourceInitializationStatus && report.resourceInitializationStatus !== 'NOT RUN') return false;
  if (failureStage === 'webgpu-api-detection') {
    if (report.apiDetected !== false || (report.adapterRequestResults || []).length !== 0) return false;
  } else {
    const requests = report.adapterRequestResults;
    if (report.apiDetected !== true || !Array.isArray(requests) || requests.length === 0
        || requests.some((result) => result?.status !== 'unavailable')) return false;
  }
  if (report.status === 'UNSUPPORTED' && isUnsafeLaunch(report)) return false;
  return true;
}

function isFsrPass(report) {
  return Boolean(
    report
    && report.status === 'PASS'
    && report.api === 'WebGPU'
    && report.readbackForProcessing === false
    && report.physicalGpuValidation === 'NOT RUN'
    && Number(report.processedFrames) >= 3
    && Number(report.input?.width) > 0
    && Number(report.input?.height) > 0
    && Number(report.output?.width) > Number(report.input?.width)
    && Number(report.output?.height) > Number(report.input?.height)
    && report.lifecycle?.adapterDetected === true
    && report.lifecycle?.shaderCompilationStatus === 'passed'
    && report.lifecycle?.pipelineCreationStatus === 'passed'
    && report.lifecycle?.resourceInitializationStatus === 'passed'
    && report.lifecycle?.easuComputePipelineInitialized === true
    && report.lifecycle?.rcasComputePipelineInitialized === true
    && report.lifecycle?.presentationPipelineInitialized === true
    && report.lifecycle?.outputSubmittedToVisibleCanvas === true
    && Number(report.dispatch?.easuDispatches) >= 3
    && Number(report.dispatch?.rcasDispatches) >= 3
    && report.imageValidation?.status === 'PASS'
    && report.imageValidation?.readbackFeedsProcessing === false
    && report.imageValidation?.motion?.changed === true
    && report.imageValidation?.stageComparison?.status === 'PASS'
    && report.imageValidation?.visibleCanvas?.status === 'PASS'
    && report.lifecycle?.visibleCanvasScreenshotCompared === true
    && report.lifecycle?.visibleOutputVerified === true
    && report.imageValidation?.stageComparison?.checks?.dimensionsUpscaled === true
    && report.imageValidation?.stageComparison?.checks?.inputHasDetail === true
    && report.imageValidation?.stageComparison?.checks?.easuContributes === true
    && report.imageValidation?.stageComparison?.checks?.rcasContributes === true
    && report.imageValidation?.stageComparison?.checks?.outputHasDetail === true,
  );
}

function isFsrUnsupported(report) {
  if (!report
      || (report.status !== 'SKIPPED' && report.status !== 'UNSUPPORTED')
      || report.capabilityStatus !== 'UNSUPPORTED'
      || !ADAPTER_UNAVAILABLE_STAGES.has(String(report.failureStage || ''))
      || report.lifecycle?.adapterDetected === true
      || Number(report.processedFrames || report.lifecycle?.framesCompleted || 0) !== 0
      || Number(report.dispatch?.easuDispatches || 0) !== 0
      || Number(report.dispatch?.rcasDispatches || 0) !== 0
      || (report.lifecycle?.shaderCompilationStatus && report.lifecycle.shaderCompilationStatus !== 'NOT RUN')
      || (report.lifecycle?.pipelineCreationStatus && report.lifecycle.pipelineCreationStatus !== 'NOT RUN')
      || (report.lifecycle?.resourceInitializationStatus && report.lifecycle.resourceInitializationStatus !== 'NOT RUN')) return false;
  if (report.failureStage === 'webgpu-api-detection') {
    return report.apiDetected === false && (report.adapterRequestResults || []).length === 0;
  }
  const requests = report.adapterRequestResults;
  return report.apiDetected === true
    && Array.isArray(requests)
    && requests.length > 0
    && requests.every((result) => result?.status === 'unavailable');
}

function hasPhysicalGpuEvidence(report) {
  if (!report) return false;
  const adapter = report.adapter || report.adapterInfo || {};
  const softwareAdapter = report.softwareAdapter ?? adapter.softwareAdapter;
  const adapterInfoAvailable = report.adapterInfoAvailable ?? adapter.exposed;
  if (softwareAdapter !== false || adapterInfoAvailable !== true) return false;
  const adapterParts = [adapter.vendor, adapter.architecture, adapter.device, adapter.description]
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part && !EMPTY_IDENTITY_PATTERN.test(part));
  const adapterIdentity = adapterParts.join(' ');
  if (!adapterIdentity || SOFTWARE_ADAPTER_PATTERN.test(adapterIdentity)) return false;
  const devices = report.graphicsEnvironment?.chromiumGpuDevices || report.chromiumGpuDevices;
  if (!Array.isArray(devices)) return false;
  return devices.some((device) => {
    const deviceParts = [device?.vendor, device?.name]
      .filter((part) => typeof part === 'string')
      .map((part) => part.trim())
      .filter((part) => part && !EMPTY_IDENTITY_PATTERN.test(part));
    const identity = deviceParts.join(' ');
    const driverVersion = String(device?.driverVersion || '').trim();
    return device?.active === true
      && identity.length > 0
      && driverVersion.length > 0
      && !EMPTY_DRIVER_PATTERN.test(driverVersion)
      && !SOFTWARE_ADAPTER_PATTERN.test(identity);
  });
}

function classifyWebGpuSmoke({ policy: rawPolicy, computeProbe, fsrReport } = {}) {
  const policy = normalizeGpuTestPolicy(rawPolicy);
  const required = policy === 'required';
  const result = {
    schemaVersion: 1,
    validationLevel: policy === 'required' ? 'GPU_REQUIRED' : policy === 'optional' ? 'GPU_OPTIONAL' : 'GPU_NOT_RUN',
    status: 'NOT RUN',
    required,
    shouldFail: false,
    computeStatus: computeProbe?.status || 'NOT RUN',
    fsrStatus: fsrReport?.status || 'NOT RUN',
    capabilityStatus: 'NOT RUN',
    reasonCode: '',
    reason: '',
    physicalGpuValidation: 'NOT RUN',
  };

  if (policy === 'off') {
    result.reasonCode = 'POLICY_DISABLED';
    result.reason = 'GPU-dependent smoke tests were not requested.';
    return result;
  }

  if (!computeProbe) {
    result.status = 'FAIL';
    result.shouldFail = true;
    result.capabilityStatus = 'NOT RUN';
    result.reasonCode = 'COMPUTE_REPORT_MISSING';
    result.reason = 'The independent WebGPU compute probe did not produce a report.';
    return result;
  }

  if (isUnsafeLaunch(computeProbe)) {
    result.status = 'FAIL';
    result.shouldFail = true;
    result.capabilityStatus = 'FAIL';
    result.reasonCode = 'UNSAFE_GPU_LAUNCH_CONFIGURATION';
    result.reason = 'The smoke used a disabled-GPU, unsafe-WebGPU, sandbox, blocklist, or driver-workaround override.';
    return result;
  }

  const computePassed = isKnownAnswerPass(computeProbe);
  const computeUnsupported = isNoAdapterReport(computeProbe);
  if (!computePassed && !computeUnsupported) {
    result.status = 'FAIL';
    result.shouldFail = true;
    result.capabilityStatus = computeProbe.status === 'NOT RUN' ? 'NOT RUN' : 'FAIL';
    result.reasonCode = computeProbe.status === 'NOT RUN' ? 'COMPUTE_NOT_RUN' : 'COMPUTE_DID_NOT_PASS';
    result.reason = 'The known-answer probe did not prove a safe WebGPU dispatch and readback of 19 + 23 = 42.';
    return result;
  }

  result.capabilityStatus = computeUnsupported ? 'UNSUPPORTED' : 'PASS';
  if (computeUnsupported) {
    if (fsrReport && fsrReport.status !== 'NOT RUN' && !isFsrUnsupported(fsrReport)) {
      result.status = 'FAIL';
      result.shouldFail = true;
      result.capabilityStatus = 'FAIL';
      result.reasonCode = 'CONFLICTING_COMPUTE_AND_FSR_EVIDENCE';
      result.reason = 'The compute probe reported no compatible adapter, but the FSR report is not a matching unsupported/skip result.';
      return result;
    }
    result.status = required ? 'UNSUPPORTED' : 'SKIPPED';
    result.shouldFail = required;
    result.reasonCode = 'NO_COMPATIBLE_ADAPTER';
    result.reason = 'Adapter discovery was attempted safely, but the environment supplied no compatible WebGPU adapter. GPU-dependent tests did not pass.';
    return result;
  }

  if (isFsrPass(fsrReport)) {
    if (required && (!hasPhysicalGpuEvidence(fsrReport) || !hasPhysicalGpuEvidence(computeProbe))) {
      result.status = 'UNSUPPORTED';
      result.shouldFail = true;
      result.capabilityStatus = 'UNSUPPORTED';
      result.reasonCode = 'PHYSICAL_GPU_NOT_VERIFIED';
      result.reason = 'The compute/FSR adapter evidence did not verify a physical GPU plus an active Chromium device and driver version for both runs.';
      return result;
    }
    result.status = 'PASS';
    result.shouldFail = false;
    result.capabilityStatus = 'PASS';
    result.reasonCode = '';
    result.reason = required
      ? 'Known-answer WebGPU compute and bundled FSR1 output passed on a classified non-software GPU with driver evidence.'
      : 'Known-answer WebGPU compute and bundled FSR1 output passed; physical-GPU validation remains separately reported.';
    result.physicalGpuValidation = required ? 'PASS' : 'NOT RUN';
    return result;
  }

  if (isFsrUnsupported(fsrReport)) {
    result.status = required ? 'UNSUPPORTED' : 'SKIPPED';
    result.shouldFail = required;
    result.capabilityStatus = 'UNSUPPORTED';
    result.reasonCode = 'FSR_ADAPTER_UNAVAILABLE';
    result.reason = 'The FSR scene could not initialize because WebGPU reported no compatible adapter; it did not process frames.';
    return result;
  }

  result.status = 'FAIL';
  result.shouldFail = true;
  result.capabilityStatus = 'FAIL';
  result.reasonCode = !fsrReport ? 'FSR_REPORT_MISSING' : fsrReport.status === 'NOT RUN' ? 'FSR_TEST_NOT_RUN' : 'FSR_ACCEPTANCE_FAILED';
  result.reason = !fsrReport
    ? 'The FSR1 integration did not produce a report.'
    : fsrReport.status === 'NOT RUN'
      ? 'The FSR1 integration was not executed.'
      : 'The FSR1 integration did not satisfy its runtime, dispatch, or output-validation requirements.';
  return result;
}

module.exports = {
  WEBGPU_SMOKE_STATUSES,
  normalizeGpuTestPolicy,
  isUnsafeLaunch,
  isKnownAnswerPass,
  isNoAdapterReport,
  isFsrPass,
  isFsrUnsupported,
  hasPhysicalGpuEvidence,
  classifyWebGpuSmoke,
};

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowNames = ['build.yml', 'release.yml'];

test('Windows build and release gates validate distinct bilinear references and surface smoke diagnostics', () => {
  for (const workflowName of workflowNames) {
    const workflow = fs.readFileSync(new URL(`../.github/workflows/${workflowName}`, import.meta.url), 'utf8');
    assert.ok(workflow.includes('$frame.nativeReport.bilinearReferencePath'), `${workflowName} must tie each reference PNG to its native report`);
    assert.ok(workflow.includes('@($frame.inputPath, $frame.outputPath, $frame.referencePath)'), `${workflowName} must validate each input, FSR output, and reference PNG`);
    assert.ok(workflow.includes('$referencePaths | Sort-Object -Unique'), `${workflowName} must require a distinct reference path per frame`);
    assert.ok(workflow.includes('tricore-smoke-diagnostics.md'), `${workflowName} must retain a readable smoke summary`);
    assert.ok(workflow.includes('$env:GITHUB_STEP_SUMMARY'), `${workflowName} must expose smoke details in the Actions summary`);
  }
});

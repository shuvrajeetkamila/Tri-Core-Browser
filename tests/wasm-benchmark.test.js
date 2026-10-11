import test from 'node:test';
import assert from 'node:assert/strict';
import { runWasmBenchmark } from '../src/wasm-benchmark.js';

test('compiles and executes the real WASM add module with the expected result', async () => {
  const result = await runWasmBenchmark(2_000);
  assert.equal(result.passed, true);
  assert.equal(result.answer, 42);
  assert.equal(result.iterations, 2_000);
  assert.equal(result.checksum, 3_000);
  assert.equal(result.expectedChecksum, 3_000);
  assert.equal(typeof result.elapsedMs, 'number');
  assert.equal(result.scope.includes('frame rate are unchanged'), true);
});

test('rejects unsafe or unreasonable benchmark iteration counts', async () => {
  await assert.rejects(runWasmBenchmark(0), RangeError);
  await assert.rejects(runWasmBenchmark(1.5), RangeError);
  await assert.rejects(runWasmBenchmark(20_000_001), RangeError);
});

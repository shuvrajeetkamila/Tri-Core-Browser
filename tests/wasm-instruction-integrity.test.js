import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runWasmBenchmark } from '../src/wasm-benchmark.js';

test('the documented WAT source matches the exported add contract', async () => {
  const source = await readFile(new URL('../app/diagnostics/wasm-add.wat', import.meta.url), 'utf8');
  assert.match(source, /\(export\s+"add"/);
  assert.match(source, /i32\.add/);
  const result = await runWasmBenchmark(4);
  assert.equal(result.answer, 42);
});

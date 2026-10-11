const ADD_I32_MODULE = new Uint8Array([
  // WebAssembly magic + version.
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  // (type (func (param i32 i32) (result i32)))
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  // One function using type 0.
  0x03, 0x02, 0x01, 0x00,
  // Export that function as "add".
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  // Body: no locals; local.get 0; local.get 1; i32.add; end.
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

const DEFAULT_ITERATIONS = 500_000;
const MAX_ITERATIONS = 20_000_000;

/**
 * Compile and run a small, real WebAssembly module in the current V8 runtime.
 * This is a CPU/runtime diagnostic only; it does not alter website rendering.
 */
export async function runWasmBenchmark(iterations = DEFAULT_ITERATIONS) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new RangeError(`iterations must be an integer between 1 and ${MAX_ITERATIONS}`);
  }

  if (typeof WebAssembly !== 'object' || typeof WebAssembly.compile !== 'function') {
    throw new Error('This Chromium runtime does not expose WebAssembly.compile.');
  }

  const module = await WebAssembly.compile(ADD_I32_MODULE);
  const instance = await WebAssembly.instantiate(module);
  const add = instance.exports.add;
  const answer = add(19, 23);
  if (answer !== 42) throw new Error(`WASM result mismatch: expected 42, received ${answer}`);

  const start = performance.now();
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    checksum += add(index & 1, 1);
  }
  const elapsedMs = Math.max(0, performance.now() - start);
  const expectedChecksum = iterations + Math.floor(iterations / 2);
  if (checksum !== expectedChecksum) {
    throw new Error(`WASM benchmark checksum mismatch: expected ${expectedChecksum}, received ${checksum}`);
  }

  return Object.freeze({
    passed: true,
    answer,
    iterations,
    checksum,
    expectedChecksum,
    elapsedMs,
    operationsPerSecond: elapsedMs > 0 ? Math.round(iterations * 1000 / elapsedMs) : null,
    runtime: typeof navigator === 'object' ? navigator.userAgent : `Node.js ${process.versions.node}`,
    scope: 'controlled WASM test only; webpage rendering and frame rate are unchanged',
  });
}

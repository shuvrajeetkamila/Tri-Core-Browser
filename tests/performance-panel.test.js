import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('performance panel has a native keyboard-operable disclosure button and labelled content', () => {
  assert.match(html, /<button[^>]*id="performance-panel-toggle"[^>]*type="button"[^>]*aria-expanded="false"[^>]*aria-controls="performance-panel-content"[^>]*aria-label="Expand performance panel"/);
  assert.match(html, /<div class="performance-panel-content" id="performance-panel-content" hidden>/);
  assert.match(html, /class="sr-only">Expand performance panel<\/span>/);
  assert.match(styles, /button:focus-visible[^\{]*\{[^}]*outline:/);
});

test('automatic upscaler priority is DLSS then FSR, with Chromium fallback and WASM reported separately', () => {
  assert.match(html, /Automatic upscaler priority: DLSS, then FSR; otherwise standard Chromium\. WASM is reported separately\./);
  assert.match(html, /<strong id="graphics-priority">DLSS → FSR → Chromium<\/strong>/);
  assert.match(html, /<option value="manual">Manual override<\/option>/);
  assert.doesNotMatch(html, /fsr-first/);
  assert.match(main, /chooseAutomaticMode\(graphicsCapabilities\)/);
  assert.match(main, /No compatible image upscaler; WASM runtime is available separately \(no upscaling\)\./);
});

test('FSR lab separates the live game-owned WebGPU path from the PNG screenshot diagnostic and exposes failure state', () => {
  assert.match(html, /LIVE GAME-SIDE INTEGRATION · CONTROLLED SCENE ONLY/);
  assert.match(html, /DIAGNOSTIC ONLY · CPU PNG READBACK/);
  assert.match(html, /No CPU readback feeds processing/);
  assert.match(html, /queue completion is not pixel-level display proof/);
  assert.match(html, /packaged Windows smoke separately compares a post-processing screenshot/);
  assert.match(main, /fsrLastResult\?\.ok === false \? 'FAILED'/);
  assert.match(main, /setFsrLifecycleState\('FAILED'\)/);
  assert.match(main, /PNG diagnostic NOT RUN/);
});

test('collapsing changes panel visibility and preference only, then recalculates browser layout', () => {
  const disclosure = main.match(/function setPerformancePanelExpanded\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(disclosure, /performancePanelCollapsed = !expanded/);
  assert.match(disclosure, /content\.hidden = !expanded/);
  assert.match(disclosure, /toggle\.setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.match(disclosure, /saveGraphicsPreferences\(\)/);
  assert.match(disclosure, /scheduleLayout\(\)/);
  assert.doesNotMatch(disclosure, /\.stop\s*\(/);
});

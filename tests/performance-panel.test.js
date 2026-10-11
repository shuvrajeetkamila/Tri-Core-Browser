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

test('collapsing changes panel visibility and preference only, then recalculates browser layout', () => {
  const disclosure = main.match(/function setPerformancePanelExpanded\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(disclosure, /performancePanelCollapsed = !expanded/);
  assert.match(disclosure, /content\.hidden = !expanded/);
  assert.match(disclosure, /toggle\.setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.match(disclosure, /saveGraphicsPreferences\(\)/);
  assert.match(disclosure, /scheduleLayout\(\)/);
  assert.doesNotMatch(disclosure, /\.stop\s*\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const preload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('a prominent accessible fullscreen toggle and a visible keyboard-operable exit control are present', () => {
  assert.match(html, /<button class="top-action immersive-toggle" id="immersive-toggle"[^>]*aria-pressed="false"[^>]*aria-label="Enter immersive full screen for the active browser core"/);
  assert.match(html, /<span class="immersive-toggle-label">Full screen<\/span>/);
  assert.match(html, /<div class="immersive-exitbar" id="immersive-exitbar" hidden>/);
  assert.match(html, /<button class="immersive-exit-button" id="immersive-exit" type="button"[^>]*aria-label="Exit full screen and restore the browser controls"/);
  assert.match(html, /<kbd>F11<\/kbd>/);
  assert.match(styles, /\.immersive-toggle\s*\{[^}]*min-height:\s*44px/);
});

test('immersive mode expands only the active core, hides normal browser chrome, and restores the prior focus layout', () => {
  const setMode = renderer.match(/function setImmersiveMode\(enabled\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(setMode, /focusedPaneBeforeImmersive = focusedPane/);
  assert.match(setMode, /focusedPane = activePane/);
  assert.match(setMode, /focusedPane = focusedPaneBeforeImmersive/);
  assert.match(setMode, /graphicsDialog\.close\(\)/);
  assert.match(setMode, /utilityDialog\.close\(\)/);
  assert.match(setMode, /document\.documentElement\.classList\.toggle\('is-immersive'/);
  assert.match(setMode, /document\.body\.classList\.toggle\('is-immersive'/);
  assert.match(setMode, /scheduleLayout\(\)/);
  assert.match(setMode, /restoreToolbarFocus/);
  assert.match(setMode, /focus\(\{ preventScroll: true \}\)/);
  assert.match(renderer, /browser\.onFullscreenState\(\(enabled\) => setImmersiveMode\(Boolean\(enabled\)\)\)/);
  assert.match(styles, /body\.is-immersive \.topbar[^\{]*\{[^}]*display:\s*none/);
  assert.match(styles, /body\.is-immersive \.pane-toolbar[^\{]*\{[^}]*display:\s*none/);
  assert.match(styles, /body\.is-immersive \.browser-grid[^\{]*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
});

test('fullscreen IPC validates a boolean and active-core index, the trusted sender, and preserved web-content security', () => {
  assert.match(preload, /setFullscreen:\s*\(enabled, slot\)\s*=>\s*ipcRenderer\.invoke\('browser:set-fullscreen',\s*\{\s*enabled,\s*slot\s*\}\)/);
  assert.match(preload, /onFullscreenState:\s*\(callback\)\s*=>\s*subscribe\('browser:fullscreen-state',\s*callback\)/);
  assert.match(main, /ipcMain\.handle\('browser:set-fullscreen',\s*\(event, payload = \{\}\)\s*=>\s*\{[\s\S]*?if \(!isUiSender\(event\)\)[\s\S]*?typeof payload\.enabled !== 'boolean'[\s\S]*?validSlot\(payload\.slot\)[\s\S]*?setMainWindowFullscreen\(payload\.enabled\)[\s\S]*?activeTabFor\(slot\).*?webContents\?\.focus\(\)/);
  assert.match(main, /function handleFullscreenShortcut\(event, input\)[\s\S]*?input\.key !== 'F11'[\s\S]*?event\.preventDefault\(\)/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
});

test('packaged smoke exercises enter, browser-view expansion, exit, and restoration to all cores', () => {
  assert.match(main, /smokeStage = 'immersive-fullscreen-toggle'/);
  assert.match(main, /document\.querySelector\('#immersive-toggle'\)\.click\(\)/);
  assert.match(main, /document\.querySelector\('#immersive-exit'\)\.click\(\)/);
  assert.match(main, /activeTabFor\(0\)\?\.view\?\.getBounds\(\)/);
  assert.match(main, /appChromeHidden/);
  assert.match(main, /exitStripBottom/);
  assert.match(main, /allCoresVisible/);
  assert.match(main, /all three cores\/browser controls returned/);
});

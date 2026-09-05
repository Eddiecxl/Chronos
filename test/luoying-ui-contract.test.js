import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readUi = async () => ({
  html: await readFile(new URL('../public/luoying-xiantu/index.html', import.meta.url), 'utf8'),
  script: await readFile(new URL('../public/luoying-xiantu/app.js', import.meta.url), 'utf8'),
  css: await readFile(new URL('../public/luoying-xiantu/styles.css', import.meta.url), 'utf8')
});

test('HTML exposes mode choice local actions AI channels and pause status', async () => {
  const { html } = await readUi();
  for (const id of ['localModeCard', 'aiModeCard', 'localActions', 'aiComposer', 'worldChannel', 'systemChannel', 'pauseBadge', 'aiTrialPanel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('interface exposes retry history independent saves and credential clearing', async () => {
  const { html } = await readUi();
  for (const id of ['retryPanel', 'retryButton', 'editRetryButton', 'historyButton', 'saveSlots', 'importButton', 'exportButton', 'clearCredentialButton']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /本地版/);
  assert.match(html, /AI.*版/s);
});

test('browser controller uses choice dispatch and text-only story rendering', async () => {
  const { script } = await readUi();
  assert.match(script, /dispatchLocalChoice/);
  assert.match(script, /\.textContent\s*=/);
  assert.doesNotMatch(script, /dispatchLocalAction/);
  assert.doesNotMatch(script, /storyLog\.innerHTML/);
  assert.doesNotMatch(script, /modelInput\.disabled\s*=\s*siteMode/);
  assert.match(script, /网站模式可切换允许的模型/);
});

test('responsive styles retain reachable controls and reduced motion support', async () => {
  const { css } = await readUi();
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.pause-badge/);
  assert.match(css, /\.mode-card/);
});

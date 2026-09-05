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

test('AI interface has no suggestion container or suggestion renderer', async () => {
  const { html, script } = await readUi();
  assert.doesNotMatch(html, /id="aiSuggestions"/);
  assert.doesNotMatch(script, /renderAiSuggestions/);
  assert.match(script, /localActions/);
  assert.match(script, /dom\.localActions\.hidden = mode !== 'local';/);
  assert.match(script, /dom\.aiComposer\.hidden = mode !== 'ai';/);
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

test('character sheet renders seven labeled slots without remote assets', async () => {
  const { script, css } = await readUi();
  assert.match(script, /EQUIPMENT_SLOT_ORDER/);
  assert.match(script, /equipment-slot/);
  for (const slot of ['head', 'neck', 'body', 'arms', 'hands', 'legs', 'feet']) {
    assert.match(script, new RegExp(slot));
  }
  assert.match(css, /\.paper-doll/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test('AI equipment save is revision-safe and does not create a story turn', async () => {
  const { script } = await readUi();
  assert.match(script, /async function saveAiEquipment\(itemName\)/);
  assert.match(script, /commitAiEquipment\(storage, original, itemName\)/);
  assert.match(script, /restoreAiEquipmentState\(storage, original\)/);
  assert.match(script, /if \(pending \|\| equipmentPending \|\| state\?\.battle\)/);
  assert.doesNotMatch(script, /saveAiEquipment[\s\S]{0,900}append(?:StoryBlock|TurnToStory|Turn)/);
});

test('all owned alternatives for a slot remain selectable while AI equipment is safe to save', async () => {
  const { script } = await readUi();
  assert.match(script, /function itemsForSlot/);
  assert.match(script, /for \(const replacement of replacements\)/);
  assert.match(script, /pending \|\| equipmentPending \|\| Boolean\(state\?\.battle\)/);
});

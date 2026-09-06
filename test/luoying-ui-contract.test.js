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

test('mobile cover title scales within a 390px viewport without legacy suggestion styling', async () => {
  const { css } = await readUi();
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.cover h1 \{[^}]*font-size:\s*clamp\(42px,\s*15vw,\s*56px\)/);
  assert.doesNotMatch(css, /\.suggestions/);
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
  assert.match(script, /commitAiEquipmentForActiveJourney\(storage, original, itemName, \(\) => state\)/);
  assert.match(script, /restoreAiEquipmentState\(storage, original\)/);
  assert.match(script, /if \(pending \|\| equipmentPending \|\| state\?\.battle\)/);
  assert.match(script, /if \(state\?\.journeyId !== original\.journeyId\) return;/);
  assert.doesNotMatch(script, /saveAiEquipment[\s\S]{0,900}append(?:StoryBlock|TurnToStory|Turn)/);
});

test('all owned alternatives for a slot remain selectable while AI equipment is safe to save', async () => {
  const { script } = await readUi();
  assert.match(script, /function itemsForSlot/);
  assert.match(script, /for \(const replacement of replacements\)/);
  assert.match(script, /pending \|\| equipmentPending \|\| Boolean\(state\?\.battle\)/);
});

test('AI inventory exposes discovered equipment controls without restoring local behavior', async () => {
  const { script } = await readUi();
  assert.match(script, /function aiEquipmentAction/);
  assert.match(script, /mode === 'ai' && ITEMS\[name\]\?\.slot/);
  assert.match(script, /button\.disabled = equipmentUnavailable\(\)/);
});

test('character presentation has a no-relationship empty state, 680px layout, and local slot connectors', async () => {
  const { script, css } = await readUi();
  assert.match(script, /旅途尚未留下可辨认的人物记录/);
  assert.match(script, /doll-line/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.doll-line/);
});

test('local panels retain their legacy map, relationship, equipment, quest, codex, and history paths', async () => {
  const { script } = await readUi();
  for (const name of ['renderLocalCharacterPanel', 'renderLocalQuestPanel', 'renderLocalInventoryPanel', 'renderLocalMapPanel', 'renderLocalCodexPanel', 'renderLocalHistoryPanel']) {
    assert.match(script, new RegExp(`function ${name}`));
  }
  assert.match(script, /if \(state\.mode === 'local'\) return renderLocalMapPanel\(\)/);
  assert.match(script, /for \(const \[name, location\] of Object\.entries\(LOCATIONS\)\)/);
  assert.match(script, /getLocalPanelActions\(state, 'travel'\)/);
});

test('AI codex renders neutral empty categories and character quick scan includes gold and game day', async () => {
  const { script } = await readUi();
  assert.match(script, /尚未结识可辨认人物/);
  assert.match(script, /尚未踏足可辨认地点/);
  assert.match(script, /尚无已知物品/);
  assert.match(script, /尚无已记录成就/);
  assert.match(script, /尚无已知结局/);
  assert.match(script, /attributeTile\('灵石', state\.player\.gold/);
  assert.match(script, /attributeTile\('游戏日', `第 \$\{state\.story\.day\} 日/);
});

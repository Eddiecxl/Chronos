# Luoying AI Discovery, Loadout, and Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-only, spoiler-free discovery interface, a functional seven-slot protagonist loadout, and a hidden pacing director that prevents circular AI storytelling while preserving free-text player control.

**Architecture:** Add pure discovery, equipment, and panel-presentation modules so state rules stay testable without the DOM. Integrate discoveries and pacing only inside the validated AI transaction path, then render the committed view model in the existing modal UI. Keep local choice gameplay and legacy combat fields compatible while AI suggestions disappear completely.

**Tech Stack:** Vanilla JavaScript ES modules, browser DOM/CSS/SVG, Node.js built-in test runner, IndexedDB/localStorage adapters, Vite 7, Express.

**Spec:** `docs/superpowers/specs/2026-09-06-luoying-ai-discovery-equipment-ui-design.md`

## Global Constraints

- Only AI mode changes behavior; do not expand or rewrite local-mode story content.
- AI mode accepts free text only and never renders model suggestions or preset choices.
- Unknown people, places, quests, items, achievements, and endings are not rendered as names, locks, question marks, totals, percentages, or requirements.
- Only validated and durably committed AI world turns may unlock discoveries or advance pacing.
- Opening panels, asking the system, and equipping items do not advance time, clocks, NPC plans, world turns, or history.
- Failed requests, invalid model output, autosave conflicts, and transaction rollbacks leave discoveries, pacing, equipment, and history unchanged.
- Keep `weapon`, `armor`, and `accessory` compatibility fields so local combat behavior remains unchanged.
- Render AI-derived text with text nodes only; do not insert model HTML.
- Preserve responsive controls, keyboard focus, 44px touch targets, and reduced-motion behavior.
- Never commit provider credentials or `.env`.

---

### Task 1: Seven-slot equipment state and derived statistics

**Files:**
- Create: `public/luoying-xiantu/equipment.js`
- Modify: `public/luoying-xiantu/game-state.js`
- Modify: `public/luoying-xiantu/game-data.js`
- Test: `test/luoying-equipment.test.js`
- Test: `test/luoying-game-state.test.js`

**Interfaces:**
- Produces: `EQUIPMENT_SLOT_ORDER: readonly string[]`
- Produces: `normalizeEquipment(equipment): { weapon, armor, accessory, slots }`
- Produces: `equipmentBonuses(state): { attack, defense, maxSpirit }`
- Produces: `derivedPlayerStats(state): { attack, defense, maxSpirit }`
- Produces: `equipOwnedItem(state, itemName, expectedMode = 'ai'): GameState`
- Consumes: `ITEMS[name].slot`, `attack`, `defense`, `spirit`, and `rarity` metadata.

- [ ] **Step 1: Write failing equipment and migration tests**

```js
test('v3 equipment migrates into seven slots without losing compatibility fields', () => {
  const old = createGameState('照月', 'ai', () => 'old-loadout');
  old.schemaVersion = 3;
  old.equipment = { weapon: '玄铁剑', armor: '流云法袍', accessory: '同心结' };
  const next = migrateGameState(old, 'ai');
  assert.equal(next.equipment.slots.hands, '玄铁剑');
  assert.equal(next.equipment.slots.body, '流云法袍');
  assert.equal(next.equipment.slots.neck, '同心结');
  assert.deepEqual(Object.keys(next.equipment.slots), ['head', 'neck', 'body', 'arms', 'hands', 'legs', 'feet']);
});

test('AI can equip only an owned item in its declared slot without advancing the world', () => {
  const state = createGameState('照月', 'ai', () => 'equip-ai');
  state.inventory.items['踏云履'] = 1;
  const before = structuredClone(state);
  const next = equipOwnedItem(state, '踏云履', 'ai');
  assert.equal(next.equipment.slots.feet, '踏云履');
  assert.equal(next.story.minuteOfDay, before.story.minuteOfDay);
  assert.equal(next.memory.turnCount, before.memory.turnCount);
  assert.equal(next.director.dangerClocks.zhaoPursuit, before.director.dangerClocks.zhaoPursuit);
  assert.throws(() => equipOwnedItem(state, '问天剑', 'ai'), /尚未持有/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/luoying-equipment.test.js test/luoying-game-state.test.js`

Expected: FAIL because `equipment.js`, `equipment.slots`, and schema v4 do not exist.

- [ ] **Step 3: Add slot metadata and bounded gear definitions**

Add `slot` and `rarity` to all existing wearable items. Add two bounded options for previously empty categories so AI rewards can populate the full paper doll:

```js
'云纹束冠': { type: 'armor', slot: 'head', rarity: 'uncommon', defense: 2, spirit: 3, price: 55, description: '以护神云纹稳住识海的外门束冠。' },
'星辉道冠': { type: 'armor', slot: 'head', rarity: 'epic', defense: 8, spirit: 10, price: 520, description: '冠上星砂会随神识流转而明灭。' },
'青藤护臂': { type: 'armor', slot: 'arms', rarity: 'uncommon', defense: 3, price: 48, description: '灵藤编成，受击时自行收紧。' },
'玄鳞护臂': { type: 'armor', slot: 'arms', rarity: 'epic', attack: 4, defense: 9, price: 610, description: '玄鳞层叠，能卸开近身重击。' },
'轻羽腿甲': { type: 'armor', slot: 'legs', rarity: 'rare', defense: 5, price: 130, description: '薄如羽翼，不妨碍步法变化。' },
'玄武胫甲': { type: 'armor', slot: 'legs', rarity: 'epic', defense: 12, price: 760, description: '沉重灵甲将下盘牢牢钉在地脉上。' },
'逐风靴': { type: 'armor', slot: 'feet', rarity: 'rare', defense: 2, spirit: 3, price: 115, description: '靴底风纹能减轻长途跋涉的负担。' },
'踏云履': { type: 'armor', slot: 'feet', rarity: 'epic', defense: 5, spirit: 7, price: 680, description: '落足如踏云，急转时几乎不留声息。' }
```

Map existing weapons to `hands`, robes/armor to `body`, and `同心结` to `neck`.

- [ ] **Step 4: Implement the pure equipment module**

```js
export const EQUIPMENT_SLOT_ORDER = Object.freeze(['head', 'neck', 'body', 'arms', 'hands', 'legs', 'feet']);
const cleanSlotItem = (value, slot) => {
  const name = typeof value === 'string' ? value.trim().slice(0, 32) : '';
  return name && ITEMS[name]?.slot === slot ? name : null;
};

export function normalizeEquipment(value = {}) {
  const slots = Object.fromEntries(EQUIPMENT_SLOT_ORDER.map((slot) => [slot, cleanSlotItem(value.slots?.[slot], slot)]));
  slots.hands ||= cleanSlotItem(value.weapon, 'hands');
  slots.body ||= cleanSlotItem(value.armor, 'body');
  slots.neck ||= cleanSlotItem(value.accessory, 'neck');
  return {
    weapon: slots.hands,
    armor: slots.body,
    accessory: slots.neck,
    slots
  };
}

export function equipmentBonuses(state) {
  return Object.values(normalizeEquipment(state.equipment).slots).filter(Boolean).reduce((sum, name) => ({
    attack: sum.attack + Number(ITEMS[name]?.attack || 0),
    defense: sum.defense + Number(ITEMS[name]?.defense || 0),
    maxSpirit: sum.maxSpirit + Number(ITEMS[name]?.spirit || 0)
  }), { attack: 0, defense: 0, maxSpirit: 0 });
}

export function derivedPlayerStats(state) {
  const bonus = equipmentBonuses(state);
  return {
    attack: state.player.attack + bonus.attack,
    defense: state.player.defense + bonus.defense,
    maxSpirit: state.player.maxSpirit + bonus.maxSpirit
  };
}

export function equipOwnedItem(source, itemName, expectedMode = 'ai') {
  if (source?.mode !== expectedMode) throw new Error('存档模式不匹配。');
  const state = structuredClone(source);
  const item = ITEMS[itemName];
  if (!item?.slot) throw new Error('这件物品无法装备。');
  if ((state.inventory.items[itemName] || 0) < 1) throw new Error('尚未持有这件装备。');
  state.equipment.slots[item.slot] = itemName;
  state.equipment = normalizeEquipment(state.equipment);
  const cap = derivedPlayerStats(state).maxSpirit;
  state.player.spirit = Math.min(state.player.spirit, cap);
  return state;
}
```

Keep `equipment.js` independent of `game-state.js` to avoid an import cycle: `equipOwnedItem` should receive an already migrated state and clone with `structuredClone`; `game-state.js` alone calls `normalizeEquipment` during migration.

- [ ] **Step 5: Upgrade schema migration to v4**

Set `GAME_SCHEMA_VERSION = 4`, initialize seven empty slots, call `normalizeEquipment(input.equipment)`, and retain the three compatibility fields. Validate slot values as bounded plain strings and discard unknown keys.

```js
const EMPTY_EQUIPMENT = normalizeEquipment({});
// createGameState
equipment: structuredClone(EMPTY_EQUIPMENT),
// normalizeV4
base.equipment = normalizeEquipment(input.equipment);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test test/luoying-equipment.test.js test/luoying-game-state.test.js`

Expected: PASS, including existing v1/v2/v3 migration coverage.

- [ ] **Step 7: Commit Task 1**

```bash
git add public/luoying-xiantu/equipment.js public/luoying-xiantu/game-state.js public/luoying-xiantu/game-data.js test/luoying-equipment.test.js test/luoying-game-state.test.js
git commit -m "feat: add seven-slot equipment state"
```

---

### Task 2: Atomic, visible-evidence discovery ledger

**Files:**
- Create: `public/luoying-xiantu/discovery.js`
- Modify: `public/luoying-xiantu/ai-turn.js`
- Test: `test/luoying-discovery.test.js`
- Test: `test/luoying-ai-turn.test.js`

**Interfaces:**
- Produces: `applyCommittedDiscoveries(state, narration): GameState`
- Produces: `visibleTextFor(narration): string`
- Consumes: validated `narration.blocks`, normalized committed inventory/location/quests, and registered `memory.entities`.
- Called by: `createAiTurnRunner.runWorldTurn` after entity/fact registration but before transactional autosave.

- [ ] **Step 1: Write failing discovery tests**

```js
test('contract actors and invisible entity candidates do not unlock spoilers', () => {
  const state = createGameState('照月', 'ai', () => 'discover-none');
  state.memory.entities['npc:hidden'] = { id: 'npc:hidden', kind: 'npc', name: '未来宗主', status: 'alive', location: '天机台' };
  const next = applyCommittedDiscoveries(state, { blocks: [{ type: 'narr', text: '我只看见柴房门上的旧锁。' }] });
  assert.deepEqual(next.codex.characters, []);
  assert.deepEqual(next.codex.locations, ['赵府柴房']);
});

test('visible dialogue and committed rewards unlock only what the player experienced', () => {
  const state = createGameState('照月', 'ai', () => 'discover-real');
  state.memory.entities['generated:npc:doctor'] = { id: 'generated:npc:doctor', kind: 'npc', name: '白芷', status: 'alive', location: '赵府柴房' };
  state.inventory.items['云纹束冠'] = 1;
  state.story.location = '青石镇';
  const next = applyCommittedDiscoveries(state, { blocks: [{ type: 'dlg', name: '白芷', text: '先别动。' }] });
  assert.deepEqual(next.codex.characters, ['白芷']);
  assert.ok(next.codex.locations.includes('青石镇'));
  assert.ok(next.codex.items.includes('云纹束冠'));
  assert.equal(next.codex.characters.includes('林小满'), false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-discovery.test.js test/luoying-ai-turn.test.js`

Expected: FAIL because the discovery module and transaction integration do not exist.

- [ ] **Step 3: Implement evidence-derived discoveries**

```js
const uniquePush = (list, value) => {
  if (value && !list.includes(value)) list.push(value);
};

export function visibleTextFor(narration) {
  return (narration.blocks || []).map((block) => `${block.name || ''}${block.text || ''}`).join('\n');
}

export function applyCommittedDiscoveries(source, narration) {
  const state = structuredClone(source);
  const visible = visibleTextFor(narration);
  const speakers = new Set((narration.blocks || []).filter((block) => block.type === 'dlg').map((block) => block.name));
  for (const entity of Object.values(state.memory.entities || {})) {
    if (entity.kind === 'npc' && entity.name && (speakers.has(entity.name) || visible.includes(entity.name))) uniquePush(state.codex.characters, entity.name);
  }
  for (const name of Object.keys(NPCS)) {
    if (speakers.has(name) || visible.includes(name)) uniquePush(state.codex.characters, name);
  }
  uniquePush(state.codex.locations, state.story.location);
  for (const [name, count] of Object.entries(state.inventory.items || {})) if (count > 0) uniquePush(state.codex.items, name);
  return state;
}
```

Include authored NPCs whose names appear in visible blocks even when they already exist only in `NPCS`, and never add names merely because they were present in the contract.

- [ ] **Step 4: Integrate discovery before the existing atomic save**

In `ai-turn.js`, order the candidate transforms exactly as follows:

```js
let committed = commitValidatedWorldTurn(state, contract, narration);
committed = registerEntityCandidates(committed, narration.memory?.entities || [], txId);
committed = appendValidatedFacts(committed, narration.memory?.facts || [], txId);
committed = applyCommittedDiscoveries(committed, narration);
```

Do not apply discoveries to `state` directly. Existing journal compensation must discard `committed` on failure.

- [ ] **Step 5: Add rollback assertions**

Extend the existing AI failure and autosave compensation tests to assert deep equality for `codex`, `equipment`, and the pacing fields introduced in Task 3.

```js
assert.deepEqual(result.state.codex, before.codex);
assert.deepEqual(result.state.equipment, before.equipment);
assert.equal(result.state.director.chapterTurns, before.director.chapterTurns);
assert.equal(result.state.director.turnsSinceChapterProgress, before.director.turnsSinceChapterProgress);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test test/luoying-discovery.test.js test/luoying-ai-turn.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add public/luoying-xiantu/discovery.js public/luoying-xiantu/ai-turn.js test/luoying-discovery.test.js test/luoying-ai-turn.test.js
git commit -m "feat: unlock AI records from committed discoveries"
```

---

### Task 3: Hidden chapter momentum and natural anti-loop pressure

**Files:**
- Modify: `public/luoying-xiantu/game-state.js`
- Modify: `public/luoying-xiantu/game-data.js`
- Modify: `public/luoying-xiantu/director.js`
- Modify: `public/luoying-xiantu/ai-turn.js`
- Test: `test/luoying-director.test.js`
- Test: `test/luoying-ai-turn.test.js`

**Interfaces:**
- Produces in `director`: `chapterTurns: number`, `turnsSinceChapterProgress: number`, `pacePressure: 0 | 1 | 2 | 3`
- Produces in scene contract: `pace: { level, chapterTurns, stalledTurns, instruction, requiredProgressIds, requirementsSatisfied }`
- Produces: `classifyChapterProgress(narration, contract): 'chapter' | 'material' | 'minor'`
- Consumes: `CHAPTERS[].pace = { gentle, firm, decisive }`, required discoveries, exits, danger clocks, quest IDs, and open loops.

- [ ] **Step 1: Write failing pacing tests**

```js
test('minor discoveries do not reset stalled chapter momentum', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 4;
  const contract = createSceneContract(state, '我继续检查树叶', 'turn-pace');
  const narration = narrationWithText('我发现一片与主线无关的新叶痕。');
  narration.progress.advanced = ['scene:leaf-mark'];
  narration.memory.facts = [{ subjectId: 'world:leaf', predicate: 'color', object: '叶缘发黄', confidence: 1 }];
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.turnsSinceChapterProgress, 5);
});

test('decisive pressure rejects decorative progress and asks for a natural route forward', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 8;
  const contract = createSceneContract(state, '我观察四周', 'turn-decisive');
  const result = validateAiWorldTurn(state, contract, narrationWithText('我又发现一处无关划痕。'), []);
  assert.equal(contract.pace.level, 3);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /章节推进|决定性机会/.test(error)));
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-director.test.js test/luoying-ai-turn.test.js`

Expected: FAIL because pacing state, contract instructions, and validation do not exist.

- [ ] **Step 3: Add bounded per-chapter pacing configuration**

Every chapter receives an explicit hidden budget; use `{ gentle: 2, firm: 5, decisive: 8 }` as the default and only vary chapters whose danger limit is shorter. Validate in tests that `0 < gentle < firm < decisive <= 12` for all 20 chapters.

```js
pace: { gentle: 2, firm: 5, decisive: 8 }
```

- [ ] **Step 4: Add pacing state migration and contract data**

Initialize missing fields to zero in schema v4. Compute the pressure level without exposing it to rendered UI:

```js
function pressureLevel(stalled, pace) {
  if (stalled >= pace.decisive) return 3;
  if (stalled >= pace.firm) return 2;
  if (stalled >= pace.gentle) return 1;
  return 0;
}
```

Map levels to prompt instructions that explicitly preserve player agency:

- level 0: meaningful exploration is allowed;
- level 1: introduce an actionable clue or relationship shift;
- level 2: introduce a causal danger, cost, or NPC action;
- level 3: reveal a decisive route to a missing required discovery or chapter exit, stopping before the player's decision.

- [ ] **Step 5: Classify progress and update counters only on commit**

`chapter` includes an exact chapter exit ID. `material` includes required discovery IDs, legal quest advancement, effective danger-clock change, or resolving a current main loop. Everything else is `minor`.

```js
const progressKind = classifyChapterProgress(narration, contract);
state.director.chapterTurns += 1;
state.director.turnsSinceChapterProgress = progressKind === 'minor'
  ? Math.min(99, state.director.turnsSinceChapterProgress + 1)
  : 0;
state.director.pacePressure = pressureLevel(state.director.turnsSinceChapterProgress, chapter.pace);
```

Reset all three values on a real chapter exit.

- [ ] **Step 6: Enforce pressure-specific validation and repair prompts**

At level 1 require at least `material`; at level 2 require a danger/consequence/NPC action plus `material`; at level 3 require a chapter exit when prerequisites are satisfied, otherwise require progress toward a named missing prerequisite. Validation errors must describe the in-world need and must not author replacement prose.

```js
if (contract.pace.level >= 1 && progressKind === 'minor') errors.push('剧情需要产生与当前章节目标有关的可行动进展。');
if (contract.pace.level >= 2 && (!consequences.length || progressKind === 'minor')) errors.push('局势已停滞，必须通过自然事件产生主线后果。');
if (contract.pace.level >= 3 && contract.pace.requirementsSatisfied && progressKind !== 'chapter') {
  errors.push('必须自然呈现通往章节出口的决定性机会，并停在玩家选择前。');
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `node --test test/luoying-director.test.js test/luoying-ai-turn.test.js`

Expected: PASS, including existing concrete-progress, loop, player-agency, and rollback tests.

- [ ] **Step 8: Commit Task 3**

```bash
git add public/luoying-xiantu/game-state.js public/luoying-xiantu/game-data.js public/luoying-xiantu/director.js public/luoying-xiantu/ai-turn.js test/luoying-director.test.js test/luoying-ai-turn.test.js
git commit -m "feat: add natural chapter pacing pressure"
```

---

### Task 4: Remove all AI choice suggestions while preserving local choices

**Files:**
- Modify: `public/luoying-xiantu/ai-client.js`
- Modify: `public/luoying-xiantu/ai-turn.js`
- Modify: `public/luoying-xiantu/app.js`
- Modify: `public/luoying-xiantu/index.html`
- Test: `test/luoying-ai-client.test.js`
- Test: `test/luoying-ai-turn.test.js`
- Test: `test/luoying-ui-contract.test.js`

**Interfaces:**
- AI world turn result no longer exposes actionable `suggestions` to the controller.
- Local `getAvailableActions` and `dispatchLocalChoice` remain unchanged.

- [ ] **Step 1: Write failing no-choice UI tests**

```js
test('AI interface has no suggestion container or suggestion renderer', async () => {
  const html = await readFile('public/luoying-xiantu/index.html', 'utf8');
  const app = await readFile('public/luoying-xiantu/app.js', 'utf8');
  assert.doesNotMatch(html, /id="aiSuggestions"/);
  assert.doesNotMatch(app, /renderAiSuggestions/);
  assert.match(app, /localActions/);
});
```

Extend parser/runner tests so incoming legacy `suggestions` are ignored and never returned as controller actions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-ai-client.test.js test/luoying-ai-turn.test.js test/luoying-ui-contract.test.js`

Expected: FAIL because the suggestion container and renderer still exist.

- [ ] **Step 3: Remove AI suggestions from prompt and controller**

Delete the prompt rule requiring 2–5 suggestions and remove `suggestions` from the documented AI JSON schema. Parser compatibility may sanitize and discard the field. Remove `aiSuggestions` from the DOM map, HTML, render flow, retry flow, and save restoration flow.

```js
// parseNarration compatibility result: intentionally omit data.suggestions
return { blocks, effects, progress, memory, usedFactIdsByActor, timeCost };
```

- [ ] **Step 4: Preserve local choice-only behavior**

Keep `localActions`, `getAvailableActions`, `dispatchLocalChoice`, and the local free-text rejection tests unchanged. Verify mode setup still shows local actions only for `mode === 'local'` and the AI composer only for `mode === 'ai'`.

```js
dom.localActions.hidden = mode !== 'local';
dom.aiComposer.hidden = mode !== 'ai';
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/luoying-ai-client.test.js test/luoying-ai-turn.test.js test/luoying-ui-contract.test.js test/luoying-engine.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add public/luoying-xiantu/ai-client.js public/luoying-xiantu/ai-turn.js public/luoying-xiantu/app.js public/luoying-xiantu/index.html test/luoying-ai-client.test.js test/luoying-ai-turn.test.js test/luoying-ui-contract.test.js
git commit -m "feat: make AI journeys free-text only"
```

---

### Task 5: Spoiler-free panel presentation model

**Files:**
- Create: `public/luoying-xiantu/panel-view.js`
- Modify: `public/luoying-xiantu/turn-router.js`
- Test: `test/luoying-panel-view.test.js`
- Test: `test/luoying-turn-router.test.js`

**Interfaces:**
- Produces: `buildCharacterView(state): { name, realm, hp, maxHp, qi, qiNeed, spirit, stats, slots, techniques, relationships }`
- Produces: `buildQuestView(state): { active, completed, failed }`
- Produces: `buildInventoryView(state): InventoryEntry[]`
- Produces: `buildMapView(state): LocationEntry[]`
- Produces: `buildCodexView(state): { characters, locations, items, achievements, endings }`
- Consumes: committed `codex`, quests, inventory, equipment, relationships, and static descriptions only for already discovered IDs/names.

- [ ] **Step 1: Write failing spoiler-filter tests**

```js
test('new AI panel views expose current knowledge but no future catalog', () => {
  const state = createGameState('照月', 'ai', () => 'panels-new');
  const character = buildCharacterView(state);
  const map = buildMapView(state);
  const codex = buildCodexView(state);
  assert.equal(character.name, '照月');
  assert.deepEqual(character.relationships, []);
  assert.deepEqual(map.map((entry) => entry.name), ['赵府柴房']);
  assert.deepEqual(codex.characters, []);
  assert.equal(JSON.stringify({ character, map, codex }).includes('飞升台'), false);
  assert.equal(JSON.stringify(codex).includes('/5'), false);
});

test('quest view retains completed work and reveals no future quest', () => {
  const state = createGameState('照月', 'ai', () => 'panels-quest');
  state.quests.completed = ['escape-zhao'];
  state.quests.active = [{ id: 'meet-elder', progress: 0, target: 1 }];
  const view = buildQuestView(state);
  assert.equal(view.completed[0].id, 'escape-zhao');
  assert.equal(view.active[0].id, 'meet-elder');
  assert.equal(JSON.stringify(view).includes('outer-trial'), false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-panel-view.test.js test/luoying-turn-router.test.js`

Expected: FAIL because the pure panel view module does not exist and relationship system answers enumerate default NPCs.

- [ ] **Step 3: Implement pure view builders**

Use only discovered collections as iteration sources. Static tables may enrich a discovered name but never supply rows:

```js
function safeLocationDetails(name) {
  const entry = LOCATIONS[name];
  return entry ? { icon: entry.icon, description: entry.description } : { icon: '✦', description: '旅途中亲自抵达的地点。' };
}

export function buildMapView(state) {
  return [...new Set([state.story.location, ...(state.codex.locations || [])])]
    .filter((name) => LOCATIONS[name] || name === state.story.location)
    .map((name) => ({ name, current: name === state.story.location, ...safeLocationDetails(name) }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}
```

`buildCharacterView` returns derived stats and relationships filtered by `state.codex.characters`. `buildCodexView` returns discovered arrays with no catalog totals.

- [ ] **Step 4: Filter time-stop system answers through the same knowledge boundary**

Change `relationshipAnswer`, `mapAnswer`, `inventoryAnswer`, `questAnswer`, and recap helpers to consume the view builders. If no relationship is discovered, answer neutrally without naming anyone. Never enumerate static map unlocks or future counts.

```js
function relationshipAnswer(state, input) {
  const rows = buildCharacterView(state).relationships;
  const visible = rows.filter((row) => !input || input.includes(row.name));
  return systemBlock(visible.length
    ? `人物关系：${visible.map((row) => `${row.name} ${row.value}`).join('｜')}`
    : '旅途尚未留下可辨认的人物关系记录。');
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/luoying-panel-view.test.js test/luoying-turn-router.test.js`

Expected: PASS, including the existing guarantee that system answers do not advance the world.

- [ ] **Step 6: Commit Task 5**

```bash
git add public/luoying-xiantu/panel-view.js public/luoying-xiantu/turn-router.js test/luoying-panel-view.test.js test/luoying-turn-router.test.js
git commit -m "feat: hide undiscovered AI records"
```

---

### Task 6: High-quality character loadout and progressive panels

**Files:**
- Modify: `public/luoying-xiantu/app.js`
- Modify: `public/luoying-xiantu/index.html`
- Modify: `public/luoying-xiantu/styles.css`
- Test: `test/luoying-ui-contract.test.js`
- Test: `test/luoying-equipment.test.js`

**Interfaces:**
- Consumes: all Task 1 equipment helpers and Task 5 panel view builders.
- Produces: `saveAiEquipment(itemName): Promise<void>` as a controller-local operation using `storage.saveAutoIfJourney`.
- Produces DOM classes: `.character-sheet`, `.paper-doll`, `.equipment-slot[data-slot]`, `.vital-meter`, `.attribute-tile`, `.relationship-card`, `.quest-section`.

- [ ] **Step 1: Write failing UI contract tests**

```js
test('character sheet renders seven labeled slots without remote assets', async () => {
  const app = await readFile('public/luoying-xiantu/app.js', 'utf8');
  const css = await readFile('public/luoying-xiantu/styles.css', 'utf8');
  assert.match(app, /EQUIPMENT_SLOT_ORDER/);
  assert.match(app, /equipment-slot/);
  for (const slot of ['head', 'neck', 'body', 'arms', 'hands', 'legs', 'feet']) assert.match(app, new RegExp(slot));
  assert.match(css, /\.paper-doll/);
  assert.doesNotMatch(app, /innerHTML\s*=/);
  assert.doesNotMatch(css, /https?:\/\//);
});
```

Add a controller-level test or exported pure save helper test proving equipment saves increment revision but not world time/history.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-ui-contract.test.js test/luoying-equipment.test.js`

Expected: FAIL because the paper doll and AI equipment save flow do not exist.

- [ ] **Step 3: Render progressive panels from pure views**

Replace direct iteration over `NPCS`, `LOCATIONS`, `QUESTS`, default relationships, and full catalog totals with Task 5 view objects. Render active/completed/failed quest sections only when non-empty. Use neutral empty copy without hidden counts.

```js
const view = buildQuestView(state);
for (const [status, entries] of Object.entries(view)) {
  if (!entries.length) continue;
  dom.panelContent.append(renderQuestSection(status, entries));
}
```

- [ ] **Step 4: Build the semantic paper doll**

Create the central silhouette with local SVG elements assembled through `document.createElementNS`, or a CSS figure with semantic labels. Each slot is a real button only when an owned replacement is available; otherwise it is a labeled status region. Use `data-slot` for positioning and an `aria-label` such as `鞋履：踏云履，防御加五，灵力上限加七`.

```js
const SLOT_LABELS = { head: '头饰', neck: '颈饰', body: '躯干', arms: '护臂', hands: '手持', legs: '腿甲', feet: '鞋履' };
for (const slot of EQUIPMENT_SLOT_ORDER) {
  const itemName = view.slots[slot];
  const cell = node('section', `equipment-slot rarity-${ITEMS[itemName]?.rarity || 'empty'}`);
  cell.dataset.slot = slot;
  cell.setAttribute('aria-label', `${SLOT_LABELS[slot]}：${itemName || '空'}`);
  cell.append(node('small', '', SLOT_LABELS[slot]), node('strong', '', itemName || '未装备'));
  doll.append(cell);
}
```

- [ ] **Step 5: Implement transactional AI time-stop equipping**

```js
async function saveAiEquipment(itemName) {
  const original = state;
  try {
    const candidate = equipOwnedItem(original, itemName, 'ai');
    state = await storage.saveAutoIfJourney('ai', candidate, original.journeyId, original.revision);
    renderTopbar();
    await renderPanel(activePanel);
  } catch (error) {
    state = original;
    showToast(error.message || '装备没有保存。');
  }
}
```

Do not append a transcript turn. Disable slot/inventory buttons while the conditional save is pending.

- [ ] **Step 6: Add high-quality responsive styling**

Use the existing color variables. Desktop layout: derived-stat column, centered figure, left/right slot rails. Mobile layout below 680px: compact figure above a two-column slot grid. Add rarity variables for common/uncommon/rare/epic, visible focus rings, meter labels, and `@media (prefers-reduced-motion: reduce)` coverage. Keep all interactive targets at least 44px.

```css
.character-sheet { display: grid; grid-template-columns: minmax(180px, .8fr) minmax(320px, 1.4fr); gap: 18px; }
.paper-doll { position: relative; min-height: 520px; border: 1px solid var(--line); border-radius: 24px; }
.equipment-slot { position: absolute; min-width: 132px; min-height: 64px; padding: 10px; border: 1px solid var(--slot-color, #ead6dc); border-radius: 14px; }
.equipment-slot:focus-visible { outline: 3px solid rgba(212, 79, 115, .35); outline-offset: 3px; }
@media (max-width: 680px) {
  .character-sheet { grid-template-columns: 1fr; }
  .paper-doll { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); min-height: auto; }
  .equipment-slot { position: static; min-width: 0; min-height: 64px; }
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `node --test test/luoying-ui-contract.test.js test/luoying-equipment.test.js test/luoying-storage.test.js`

Expected: PASS.

- [ ] **Step 8: Manually inspect desktop and mobile render**

Run: `npm run dev -- --host 127.0.0.1 --port 4175`

Inspect `/luoying-xiantu/index.html` at approximately 1440×900 and 390×844. Verify no future map/NPC rows, no horizontal overflow, readable meters, seven correctly positioned slots, visible focus states, and no AI suggestion buttons.

- [ ] **Step 9: Commit Task 6**

```bash
git add public/luoying-xiantu/app.js public/luoying-xiantu/index.html public/luoying-xiantu/styles.css test/luoying-ui-contract.test.js test/luoying-equipment.test.js
git commit -m "feat: build progressive AI character interface"
```

---

### Task 7: Derived equipment effects in AI contracts and top-level status

**Files:**
- Modify: `public/luoying-xiantu/director.js`
- Modify: `public/luoying-xiantu/game-engine.js`
- Modify: `public/luoying-xiantu/app.js`
- Modify: `public/luoying-xiantu/turn-router.js`
- Test: `test/luoying-director.test.js`
- Test: `test/luoying-engine.test.js`
- Test: `test/luoying-turn-router.test.js`

**Interfaces:**
- Consumes: `derivedPlayerStats(state)` from Task 1.
- The scene contract exposes effective attack, defense, and max spirit without mutating stored base attributes.
- `applyValidatedEffects` clamps spirit against effective max spirit.

- [ ] **Step 1: Write failing derived-stat tests**

```js
test('AI scene contract and system panel use equipped derived stats', () => {
  const state = createGameState('照月', 'ai', () => 'derived-ai');
  state.inventory.items['玄铁剑'] = 1;
  state.equipment = equipOwnedItem(state, '玄铁剑', 'ai').equipment;
  const contract = createSceneContract(state, '我准备迎战', 'turn-derived');
  assert.equal(contract.player.attack, state.player.attack + ITEMS['玄铁剑'].attack);
});
```

Add a spirit clamp test using `同心结`, and a regression test that local weapon/armor calculations remain unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/luoying-director.test.js test/luoying-engine.test.js test/luoying-turn-router.test.js`

Expected: FAIL because AI contracts and status displays still use base stats.

- [ ] **Step 3: Use derived statistics consistently**

Call `derivedPlayerStats(state)` in the scene contract, character view, top bar, and time-stop equipment answer. Update spirit clamping to use effective max spirit while keeping persistent `player.maxSpirit` as the unequipped base capacity.

```js
const derived = derivedPlayerStats(state);
const contractPlayer = {
  ...state.player,
  attack: derived.attack,
  defense: derived.defense,
  maxSpirit: derived.maxSpirit
};
// Use contractPlayer while assembling the object passed to deepFreeze.
state.player.spirit = clamp(state.player.spirit + normalized.spirit, 0, derived.maxSpirit);
```

- [ ] **Step 4: Preserve local combat compatibility**

Keep local `effectiveAttack`/`effectiveDefense` results identical for `weapon` and `armor`. If those functions adopt `derivedPlayerStats`, remove the old added bonus path so equipment is never counted twice.

```js
function effectiveAttack(state) {
  return derivedPlayerStats(state).attack;
}
function effectiveDefense(state) {
  return derivedPlayerStats(state).defense;
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/luoying-director.test.js test/luoying-engine.test.js test/luoying-turn-router.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add public/luoying-xiantu/director.js public/luoying-xiantu/game-engine.js public/luoying-xiantu/app.js public/luoying-xiantu/turn-router.js test/luoying-director.test.js test/luoying-engine.test.js test/luoying-turn-router.test.js
git commit -m "feat: apply equipment bonuses consistently"
```

---

### Task 8: Full regression, security audit, GitHub push, and Render verification

**Files:**
- Modify only if verification finds a defect: files already listed in Tasks 1–7 and their exact tests.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a clean `main` commit deployed by Render.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with zero failures, skips, or cancellations.

- [ ] **Step 2: Run JavaScript syntax checks**

Run `node --check` for every modified `.js` file, including `equipment.js`, `discovery.js`, and `panel-view.js`.

Expected: every command exits 0 with no syntax errors.

- [ ] **Step 3: Run whitespace and credential audits**

```bash
git diff --check
git grep -I -l -E 'gsk_[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}' -- .
git check-ignore .env
```

Expected: `git diff --check` is clean; secret grep returns no file; `.env` is reported as ignored.

- [ ] **Step 4: Build the exact production tree**

Run: `npm run build`

Expected: Vite completes successfully and reports transformed modules and generated `dist` assets.

- [ ] **Step 5: Perform final code review**

Review the complete branch diff against the spec, focusing on spoiler leakage, transaction rollback, cross-tab equipment saves, local-mode regressions, pacing false positives, and mobile accessibility. Resolve every Important-or-higher finding and rerun the affected tests plus the full suite.

- [ ] **Step 6: Push the verified commits**

```bash
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: push succeeds and both revisions match.

- [ ] **Step 7: Verify Render deployment**

Check `https://chronos-planner.onrender.com/api/health` and cache-busted copies of `/luoying-xiantu/app.js`, `/luoying-xiantu/equipment.js`, `/luoying-xiantu/discovery.js`, and `/luoying-xiantu/styles.css`.

Expected: health returns HTTP 200 and public files contain the new paper-doll, discovery, no-AI-suggestions, and pacing markers from the pushed commit.

- [ ] **Step 8: Report release evidence**

Report the pushed commit, test total, production build result, credential scan result, and public Render verification. State any limitation honestly; do not claim an online authenticated AI turn unless one was actually performed.

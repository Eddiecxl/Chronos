# 《落樱仙途》双命运线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Chronos Rift with a polished cultivation text game whose choice-only local campaign and freeform AI campaign are isolated, persistent, progression-driven, and safe from cross-mode fallback.

**Architecture:** Serve an isolated same-origin browser game from `public/luoying-xiantu/` and host it inside the authenticated Chronos game route. A versioned rules engine owns state and numeric validation; local mode consumes stable choice IDs, while AI mode uses a deterministic scene director, fact ledger, and transactional AI runner so only validated AI-authored world turns can commit. System questions use a paused channel that cannot advance time or actors.

**Tech Stack:** React 19, Vite 7, Express 5, browser ES modules, Node 22 built-in test runner, LocalStorage, IndexedDB, Groq/Mistral/Gemini REST APIs, OpenAI-compatible Chat Completions APIs.

**Spec:** `docs/superpowers/specs/2026-09-04-luoying-xiantu-design.md`

## Global Constraints

- The title screen must choose either `local` or `ai`; a saved journey can never change its mode.
- Local mode exposes buttons and stable action IDs only. It has no free-text world input.
- AI mode never calls local narration or a second provider after any AI error.
- A failed AI turn changes no state, history, memory, time, or autosave and preserves the player's original input for retry.
- Manual model switching affects the next request while preserving the same AI world and memories.
- `player.qi` is cultivation energy shown as “灵气”; `player.spirit` is spell energy shown as “灵力”.
- Panels, slash commands, and the AI system-question channel run under system pause and cannot advance time, NPC plans, combat, deadlines, or random events.
- The AI director must reject no-progress, contradictory, omniscient-NPC, player-puppeting, and out-of-range responses.
- Preserve the supplied pink cherry-blossom, ink-mountain, paper, and gold visual identity.
- Keep Groq, Mistral, Gemini, SiliconFlow/Qwen, OpenRouter, and custom OpenAI-compatible choices. Puter was removed after release review because its remote SDK would execute inside the authenticated Chronos origin.
- Default to Groq `openai/gpt-oss-120b`; recommend Mistral `mistral-small-latest` second; retain Gemini and Qwen only as optional choices.
- Personal API keys remain browser-local and never enter game saves, exports, repository files, or server logs.
- Site keys are read only from Render environment variables by an authenticated, provider-whitelisted server route.
- Model text is inserted with `textContent`; never execute model output or insert it as trusted HTML.
- Do not change Chronos account, planning, social, reader, trainer, or room behavior.
- Do not add a production dependency; use the browser and Node APIs already available.

## Current Branch Checkpoint

The feature worktree already contains committed v2 state/storage, authored world data, a deterministic local engine, and a multi-provider AI client. It also contains uncommitted UI shell files plus healing/equipment/alchemy engine refinements. This plan migrates those assets to the approved v3 architecture; it does not discard them or restore the old hybrid design.

---

### Task 1: V3 Mode-Aware State, Qi Terminology, and Isolated Saves

**Files:**
- Modify: `public/luoying-xiantu/game-state.js`
- Modify: `public/luoying-xiantu/storage.js`
- Modify: `test/luoying-game-state.test.js`
- Modify: `test/luoying-storage.test.js`

**Interfaces:**
- Produces: `createGameState(name?: string, mode?: 'local'|'ai', idFactory?: () => string): GameStateV3`
- Produces: `migrateGameState(input: unknown, expectedMode?: 'local'|'ai'): GameStateV3`
- Produces: `validateImportedState(input: unknown, expectedMode?: 'local'|'ai'): GameStateV3`
- Produces: `createStorage(storage: Storage): ModeStorage`
- `ModeStorage` exposes `loadAuto(mode)`, `saveAuto(mode, state)`, `loadSlot(mode, slot)`, `saveSlot(mode, slot, state)`, `deleteSlot(mode, slot)`, `getSlotMeta(mode, slot)`, `findLegacySave()`, and `importLegacy(mode)`.

- [ ] **Step 1: Replace state tests with failing v3 mode and terminology coverage**

```js
test('new games have a fixed mode and separate qi and spirit pools', () => {
  const state = createGameState('照月', 'ai', () => 'journey-ai');
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.mode, 'ai');
  assert.equal(state.journeyId, 'journey-ai');
  assert.equal(state.player.qi, 0);
  assert.equal(state.player.spirit, state.player.maxSpirit);
  assert.equal(state.player.exp, undefined);
});

test('v2 exp migrates to qi without changing spell spirit', () => {
  const state = migrateGameState({
    schemaVersion: 2,
    player: { name: '旧梦', realm: 4, hp: 61, maxHp: 140, exp: 77, spirit: 19 },
    story: { act: 2, day: 8, location: '青石镇' }
  }, 'local');
  assert.equal(state.mode, 'local');
  assert.equal(state.player.qi, 77);
  assert.equal(state.player.spirit, 19);
});

test('a save cannot load into the other mode', () => {
  const state = createGameState('照月', 'ai');
  assert.throws(() => migrateGameState(state, 'local'), /模式/);
});
```

- [ ] **Step 2: Run the targeted state tests and confirm the v2 assumptions fail**

Run: `node --test --test-name-pattern="fixed mode|exp migrates|other mode" test/luoying-game-state.test.js`

Expected: FAIL because `schemaVersion` is 2, `mode`/`qi` are missing, and cross-mode loading is not rejected.

- [ ] **Step 3: Implement the v3 state shape and explicit v1/v2 migration**

Use this top-level shape and sanitize every nested collection rather than spreading untrusted input:

```js
export const GAME_SCHEMA_VERSION = 3;

const defaultId = () => globalThis.crypto?.randomUUID?.()
  || `journey-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function createGameState(name = '顾长生', mode = 'local', idFactory = defaultId) {
  if (!['local', 'ai'].includes(mode)) throw new Error('游戏模式无效。');
  return {
    schemaVersion: 3,
    mode,
    journeyId: cleanId(idFactory(), 80),
    player: {
      name: cleanName(name), realm: 0, hp: 100, maxHp: 100,
      qi: 0, spirit: 30, maxSpirit: 30,
      gold: 0, attack: 11, defense: 4
    },
    story: {
      act: 1, scene: 'awakening', day: 1, period: '清晨',
      minuteOfDay: 360, location: '赵府柴房', flags: {}, completedEvents: []
    },
    director: {
      chapterId: 'act1-awakening', sceneGoal: '逃离赵府并接触修行之门',
      dangerClocks: { zhaoPursuit: 0 }, openLoops: [],
      consecutiveIdleTurns: 0, recentFingerprints: []
    },
    quests: { active: [], completed: [], failed: [] },
    inventory: { items: { '回春丹': 1 }, materials: {}, limit: 36 },
    equipment: { weapon: null, armor: null, accessory: null },
    techniques: { known: ['吐纳'], equipped: ['吐纳'], mastery: { '吐纳': 0 } },
    relationships: { ...DEFAULT_RELATIONSHIPS },
    karma: { mercy: 0, ambition: 0, demonic: 0, promises: [] },
    achievements: { unlocked: [], progress: {} },
    codex: { characters: [], locations: ['赵府柴房'], items: ['回春丹'], endings: [] },
    endings: { unlocked: [], newGamePlus: false },
    memory: { chapterSummaries: {}, facts: [], entities: {}, turnCount: 0 },
    battle: null,
    pending: mode === 'local' ? { type: 'intro-escape' } : null,
    stats: { turns: 0, battlesWon: 0, faceCount: 0, pillsCrafted: 0 },
    settings: { difficulty: 'normal' },
    updatedAt: new Date().toISOString()
  };
}
```

Map every v1/v2 `exp` and reward field to `qi`. Map an old `memory.summary` into `memory.chapterSummaries.legacy`. When an old state lacks `maxSpirit`, set it to `Math.max(30, spirit)`. `migrateGameState(input, expectedMode)` must preserve a v3 mode and reject a mismatch; old saves use `expectedMode` because they contain no trustworthy mode.

- [ ] **Step 4: Write failing storage-isolation tests**

```js
test('local and AI autosaves never share a key', () => {
  const raw = memoryStorage();
  const saves = createStorage(raw);
  saves.saveAuto('local', createGameState('本地身', 'local'));
  saves.saveAuto('ai', createGameState('万象身', 'ai'));
  assert.equal(saves.loadAuto('local').player.name, '本地身');
  assert.equal(saves.loadAuto('ai').player.name, '万象身');
});

test('slot writes reject a mismatched mode', () => {
  const saves = createStorage(memoryStorage());
  assert.throws(() => saves.saveSlot('local', 'slot1', createGameState('错位', 'ai')), /模式/);
});
```

- [ ] **Step 5: Implement namespaced v3 storage and non-destructive legacy discovery**

Use exact keys `luoying_v3_local_auto`, `luoying_v3_ai_auto`, `luoying_v3_${mode}_${slot}`, and matching `_meta` keys. `findLegacySave()` may read `luoying_save_v2` and `luoying_save`, but may not remove them. `importLegacy(mode)` migrates and writes the selected mode only after validation succeeds.

- [ ] **Step 6: Run state and storage tests**

Run: `node --test test/luoying-game-state.test.js test/luoying-storage.test.js`

Expected: all state and storage tests PASS.

- [ ] **Step 7: Commit the v3 persistence boundary**

```bash
git add public/luoying-xiantu/game-state.js public/luoying-xiantu/storage.js test/luoying-game-state.test.js test/luoying-storage.test.js
git commit -m "feat: isolate local and AI journey saves"
```

---

### Task 2: Choice-Only Local Campaign and Qi-Based Progression

**Files:**
- Modify: `public/luoying-xiantu/game-data.js`
- Modify: `public/luoying-xiantu/game-engine.js`
- Modify: `test/luoying-engine.test.js`

**Interfaces:**
- Consumes: `GameStateV3`
- Produces: `getAvailableActions(state): LocalChoice[]`
- Produces: `dispatchLocalChoice(state, choiceId, random?): TurnResult`
- Produces: `applyValidatedEffects(state, effects): GameStateV3`
- Private helpers: `offeredChoices(state)`, `battleChoices(state)`, `sceneChoices(state)`, `dispatchChoiceHandler(state, choiceId, random)`, and `unchangedTurn(state, message)`.
- `LocalChoice` is `{ id: string, label: string, icon: string }`.
- `TurnResult` is `{ state, blocks, suggestions, autosave, ending? }`.

- [ ] **Step 1: Add failing tests that require stable choice IDs and reject free text**

```js
test('local mode advances only through an offered choice id', () => {
  const state = createGameState('沈桃', 'local');
  const offered = getAvailableActions(state);
  assert.ok(offered.some((choice) => choice.id === 'intro:open-door'));
  const rejected = dispatchLocalChoice(state, '我要瞬移到仙界', () => 0.2);
  assert.equal(rejected.autosave, false);
  assert.equal(rejected.state.story.scene, state.story.scene);
});

test('cultivation rewards add qi while techniques consume spirit', () => {
  let state = createGameState('沈桃', 'local');
  state.pending = null;
  state.story.scene = 'outer-life';
  state.player.realm = 1;
  state.player.spirit = 30;
  state.techniques.known = ['吐纳', '落霞掌'];
  state.techniques.equipped = ['落霞掌'];
  state = dispatchLocalChoice(state, 'train:meditate', () => 0.1).state;
  assert.ok(state.player.qi > 0);
  assert.equal(state.player.spirit, 30);
  state.battle = { enemyId: 'spirit-rat', hp: 28, maxHp: 28, turn: 1, defending: false };
  const afterSkill = dispatchLocalChoice(state, 'battle:technique:落霞掌', () => 0.1).state;
  assert.ok(afterSkill.player.spirit < 30);
});
```

- [ ] **Step 2: Run the engine tests and observe missing choice-ID behavior**

Run: `node --test --test-name-pattern="choice id|rewards add qi" test/luoying-engine.test.js`

Expected: FAIL because the engine currently parses display text and stores progression in `exp`.

- [ ] **Step 3: Rename authored reward fields and progression helpers**

Mechanically change item, quest, event, and enemy reward properties from `exp` to `qi`. Rename `gainExperience` to `gainQi`; update breakthrough thresholds and all system copy to say “灵气”. Keep technique costs on `player.spirit`, cap regeneration at `player.maxSpirit`, and display technique costs as “灵力”.

- [ ] **Step 4: Introduce stable action IDs without duplicating the story engine**

Create a context-aware choice map:

```js
function offeredChoices(state) {
  if (state.pending?.type === 'intro-escape') return [{ id: 'intro:open-door', label: '推开柴门', icon: '🚪' }];
  if (state.battle) return battleChoices(state);
  return sceneChoices(state);
}

export function dispatchLocalChoice(source, choiceId, random = Math.random) {
  const choice = offeredChoices(source).find((entry) => entry.id === choiceId);
  if (!choice) return unchangedTurn(source, '这个选择不属于当前命运。');
  return dispatchChoiceHandler(source, choice.id, random);
}
```

Convert every existing suggestion to `{ id, label, icon }`. Preserve the authored five-act content, healing, equipment, alchemy, combat, achievements, and endings already present in the branch.

- [ ] **Step 5: Keep AI numeric validation rule-only**

`applyValidatedEffects` accepts `qi`, `spirit`, `hp`, `gold`, relationships, known items, known locations, and known quests. Clamp a normal AI turn to `qi 0..80`, `spirit -40..30`, `hp -80..40`, `gold -100..100`, and relationship deltas `-20..20`; ignore unknown identifiers. This function returns state only and never authors narrative blocks.

- [ ] **Step 6: Run all existing engine tests**

Run: `node --test test/luoying-engine.test.js`

Expected: progression, battle, healing, equipment, alchemy, content-count, and ending tests all PASS with `qi` terminology.

- [ ] **Step 7: Commit the local campaign boundary**

```bash
git add public/luoying-xiantu/game-data.js public/luoying-xiantu/game-engine.js test/luoying-engine.test.js
git commit -m "feat: make local campaign choice only"
```

---

### Task 3: Persistent Fact Ledger and Transcript Archive

**Files:**
- Create: `public/luoying-xiantu/memory.js`
- Create: `public/luoying-xiantu/transcript-store.js`
- Modify: `public/luoying-xiantu/storage.js`
- Create: `test/luoying-memory.test.js`
- Create: `test/luoying-transcript-store.test.js`

**Interfaces:**
- Produces: `applyMemoryCandidates(state, candidates, turnId): GameStateV3`
- Produces: `registerEntityCandidates(state, candidates, turnId): GameStateV3`
- Produces: `updateChapterSummary(state, chapterId, summary): GameStateV3`
- Produces: `selectRelevantMemory(state, context): MemoryPacket`
- Produces: `createTranscriptStore({ indexedDB?, memory? }): TranscriptStore`
- `TranscriptStore` exposes async `appendTurn(journeyId, turn)`, `recentTurns(journeyId, limit)`, `allTurns(journeyId)`, `importTurns(journeyId, turns)`, and `deleteJourney(journeyId)`.
- Extends: `ModeStorage.exportJourney(mode, state, transcriptStore)` and `ModeStorage.importJourney(mode, source, transcriptStore)`.

- [ ] **Step 1: Write failing fact-ledger tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { applyMemoryCandidates, selectRelevantMemory } from '../public/luoying-xiantu/memory.js';

function seedMemoryState() {
  const state = createGameState('照月', 'ai', () => 'memory-journey');
  state.memory.facts = [
    { id: 'fact:forest-footprints', subjectId: 'npc:lin-xiaoman', predicate: 'saw', object: '后山出现魔修足迹', sourceTurnId: 'turn-4', createdAtTurn: 4, locked: false },
    { id: 'fact:forest-mist', subjectId: 'location:cherry-forest', predicate: 'changed', object: '夜间出现青色迷雾', sourceTurnId: 'turn-5', createdAtTurn: 5, locked: false },
    { id: 'fact:jaded-letter', subjectId: 'loop:jaded-letter', predicate: 'unresolved', object: '匿名玉简尚未查明来历', sourceTurnId: 'turn-6', createdAtTurn: 6, locked: false },
    { id: 'fact:market-rumor', subjectId: 'npc:qian-duoduo', predicate: 'heard', object: '坊市灵石涨价', sourceTurnId: 'turn-2', createdAtTurn: 2, locked: false }
  ];
  return state;
}

test('validated facts persist by stable entity id and source turn', () => {
  const state = createGameState('照月', 'ai');
  const next = applyMemoryCandidates(state, [{
    subjectId: 'npc:lin-xiaoman', predicate: 'promised', object: '共赴青岚秘境', confidence: 1
  }], 'turn-7');
  assert.equal(next.memory.facts[0].sourceTurnId, 'turn-7');
  assert.equal(next.memory.entities['npc:lin-xiaoman'].facts[0], next.memory.facts[0].id);
});

test('generated entities receive stable ids and remain in the world registry', () => {
  const state = createGameState('照月', 'ai');
  const next = registerEntityCandidates(state, [{
    id: 'generated:npc:herbalist-qiu', kind: 'npc', name: '秋药师', location: '青石镇',
    purpose: '寻找失踪的徒弟', traits: ['谨慎', '记仇']
  }], 'turn-9');
  assert.equal(next.memory.entities['generated:npc:herbalist-qiu'].purpose, '寻找失踪的徒弟');
  assert.equal(next.memory.entities['generated:npc:herbalist-qiu'].createdTurnId, 'turn-9');
});

test('relevant memory selects the current location NPC and open loop', () => {
  const packet = selectRelevantMemory(seedMemoryState(), {
    locationId: 'location:cherry-forest', participantIds: ['npc:lin-xiaoman'], openLoopIds: ['loop:jaded-letter']
  });
  assert.ok(packet.facts.every((fact) => ['npc:lin-xiaoman', 'location:cherry-forest', 'loop:jaded-letter'].includes(fact.subjectId)));
  assert.ok(JSON.stringify(packet).length < 9000);
});
```

- [ ] **Step 2: Run memory tests and confirm the module is missing**

Run: `node --test test/luoying-memory.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `memory.js`.

- [ ] **Step 3: Implement sanitized facts, entities, and relevance scoring**

A fact has `{ id, subjectId, predicate, object, sourceTurnId, createdAtTurn, locked }`. Allow only 160-character objects, 80-character IDs, 48-character predicates, and 500 active facts. Deduplicate the tuple `subjectId|predicate|object`; never let a generated candidate overwrite a locked world-bible fact. Generated entities require an ID beginning `generated:npc:` or `generated:location:`, a known parent location, a non-empty purpose, and at most four short traits. `updateChapterSummary` stores one sanitized 1,200-character summary per completed chapter and never replaces facts. Score facts by participant match, location match, open-loop match, quest match, and recency; return at most 24 plus the current and immediately preceding chapter summaries.

- [ ] **Step 4: Write failing transcript tests with an in-memory adapter**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';

test('transcripts are isolated by journey id and retain exact blocks', async () => {
  const store = createTranscriptStore({ memory: new Map() });
  await store.appendTurn('ai-one', { id: 't1', kind: 'world', blocks: [{ type: 'dlg', name: '林小满', text: '走。' }] });
  await store.appendTurn('ai-two', { id: 't2', kind: 'world', blocks: [{ type: 'narr', text: '风起。' }] });
  assert.equal((await store.allTurns('ai-one')).length, 1);
  assert.equal((await store.allTurns('ai-one'))[0].blocks[0].name, '林小满');
});
```

- [ ] **Step 5: Implement IndexedDB with the same in-memory contract**

Use database `luoying-xiantu-v3`, version `1`, object store `turns`, key path `key`, and index `journeyId`. Store `{ key: journeyId + ':' + turn.id, journeyId, ...sanitizedTurn }`. The `memory` option uses a `Map` in Node tests. Reject any single turn over 100 KB and imports over 4 MB.

- [ ] **Step 6: Make journey export/import include transcript data but never credentials**

```js
async function exportJourney(mode, state, transcriptStore) {
  const clean = migrateGameState(state, mode);
  const turns = await transcriptStore.allTurns(state.journeyId);
  return new Blob([JSON.stringify({ format: 'luoying-journey-v3', mode, state: clean, turns })], {
    type: 'application/json;charset=utf-8'
  });
}
```

Validate the complete bundle before changing LocalStorage or IndexedDB. If transcript import fails, preserve the existing autosave and archive.

- [ ] **Step 7: Run memory, transcript, state, and storage tests**

Run: `node --test test/luoying-memory.test.js test/luoying-transcript-store.test.js test/luoying-game-state.test.js test/luoying-storage.test.js`

Expected: all tests PASS.

- [ ] **Step 8: Commit long-term memory persistence**

```bash
git add public/luoying-xiantu/memory.js public/luoying-xiantu/transcript-store.js public/luoying-xiantu/storage.js test/luoying-memory.test.js test/luoying-transcript-store.test.js
git commit -m "feat: persist AI world memory and transcripts"
```

---

### Task 4: Soft-Rail Director and Anti-Loop Validation

**Files:**
- Create: `public/luoying-xiantu/director.js`
- Modify: `public/luoying-xiantu/game-data.js`
- Create: `test/luoying-director.test.js`

**Interfaces:**
- Consumes: `GameStateV3`, `MemoryPacket`, authored act/chapter data.
- Produces: `createSceneContract(state, input, turnId): SceneContract`
- Produces: `validateAiWorldTurn(state, contract, narration, recentTurns): ValidationResult`
- Produces: `commitValidatedWorldTurn(state, contract, narration): GameStateV3`
- Produces: `buildRepairMessages(contract, narration, errors): Message[]`
- `ValidationResult` is `{ ok: boolean, errors: string[], fingerprint: string, normalizedEffects?: object }`.

- [ ] **Step 1: Write failing director tests for direction, looping, and player agency**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createSceneContract, validateAiWorldTurn } from '../public/luoying-xiantu/director.js';

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'ai-journey');
  state.story.location = '后山樱林';
  state.director.sceneGoal = '查明后山异动并决定是否告知宗门';
  state.director.dangerClocks = { demonicTrail: 2 };
  state.memory.facts = [{
    id: 'fact:forest-footprints', subjectId: 'npc:lin-xiaoman', predicate: 'saw',
    object: '后山出现魔修足迹', sourceTurnId: 'turn-4', createdAtTurn: 4, locked: false
  }];
  state.memory.entities = {
    'npc:lin-xiaoman': {
      id: 'npc:lin-xiaoman', name: '林小满', status: 'alive', location: '后山樱林',
      knownFactIds: ['fact:forest-footprints'], facts: ['fact:forest-footprints']
    }
  };
  return state;
}

function narrationWithText(text) {
  return {
    blocks: [{ type: 'narr', text }], effects: {},
    progress: { advanced: ['scene:new-information'], consequences: ['魔修察觉调查'], openLoops: ['loop:demonic-trail'] },
    memory: [], suggestions: ['拒绝邀请', '追问目的'], timeCost: 'brief'
  };
}

test('scene contracts carry a goal danger clock and NPC knowledge', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我问林小满昨夜看见了什么', 'turn-8');
  assert.equal(contract.sceneGoal, state.director.sceneGoal);
  assert.ok(contract.dangerClocks.length > 0);
  assert.deepEqual(contract.actors.find((actor) => actor.id === 'npc:lin-xiaoman').knownFactIds, ['fact:forest-footprints']);
});

test('a world response with no progress is rejected', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '继续交谈', 'turn-8');
  const result = validateAiWorldTurn(state, contract, {
    blocks: [{ type: 'dlg', name: '林小满', text: '我们再想想。' }],
    effects: {}, progress: { advanced: [], consequences: [], openLoops: [] },
    memory: [], suggestions: ['继续交谈'], timeCost: 'brief'
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /进展/.test(error)));
});

test('AI cannot speak or decide a critical action for the player', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '听对方解释', 'turn-8');
  const result = validateAiWorldTurn(state, contract, narrationWithText('你答应加入魔宗，并感到无比喜悦。'), []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /玩家/.test(error)));
});
```

- [ ] **Step 2: Run director tests and confirm the module is missing**

Run: `node --test test/luoying-director.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `director.js`.

- [ ] **Step 3: Add chapter contracts and danger clocks to authored data**

For each of the five acts, define at least four chapters with `id`, `goal`, `entry`, `requiredFacts`, `optionalThreads`, `dangerClock`, and `exits`. Add stable `id` properties to each recurring NPC and location. Existing `STORY_SCENES`, 15 main quests, 12 side quests, 30 random events, 8 recurring NPCs, and 12 locations remain the authored base.

- [ ] **Step 4: Build immutable scene contracts**

Only include facts the current actors may know. Include current numeric caps, legal item/location IDs, open-loop IDs, required progress categories, and an `idleLimit` of 2. Freeze the returned contract recursively so later UI code cannot alter it before validation.

- [ ] **Step 5: Implement structural and continuity validation**

Require 1–8 non-empty blocks, 2–5 suggestions, allowed `timeCost`, at least one valid `progress.advanced` entry, and one resulting state/time/danger change. Reject unknown reward/location IDs, out-of-cap effects, dead actors speaking, NPC use of facts outside their knowledge set, and common player-puppeting phrases. Compute a normalized fingerprint from speakers, action verbs, progress IDs, and the final 120 characters; reject a fingerprint matching either of the two preceding world turns above a 0.82 token-set similarity.

- [ ] **Step 6: Commit a validated world turn without authoring replacement prose**

Apply numeric effects through `applyValidatedEffects`, advance `minuteOfDay` using `instant=0`, `brief=10`, `scene=60`, `long=240`, update danger clocks/open loops, append fingerprints, and advance chapter only when an authored exit condition matches. The commit function does not contain story paragraphs.

- [ ] **Step 7: Run director and engine tests**

Run: `node --test test/luoying-director.test.js test/luoying-engine.test.js`

Expected: all tests PASS.

- [ ] **Step 8: Commit the director**

```bash
git add public/luoying-xiantu/director.js public/luoying-xiantu/game-data.js test/luoying-director.test.js
git commit -m "feat: add progression driven AI director"
```

---

### Task 5: System Pause Router

**Files:**
- Create: `public/luoying-xiantu/turn-router.js`
- Create: `test/luoying-turn-router.test.js`

**Interfaces:**
- Produces: `classifyTurn({ mode, channel, input }): TurnClassification`
- Produces: `answerSystemQuery(state, input): SystemAnswer`
- `TurnClassification` is `{ kind: 'local-choice'|'system'|'world'|'ambiguous', normalizedInput: string, command?: string }`.
- `SystemAnswer` is `{ handled: boolean, blocks: StoryBlock[] }` and never contains state effects.

- [ ] **Step 1: Write failing time-pause classification tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { classifyTurn, answerSystemQuery } from '../public/luoying-xiantu/turn-router.js';

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'pause-journey');
  state.story.day = 4;
  state.story.minuteOfDay = 780;
  state.player.qi = 18;
  state.battle = { enemyId: 'spirit-rat', hp: 20, maxHp: 28, turn: 2, defending: false };
  return state;
}

test('panels slash commands and system channel always pause time', () => {
  assert.equal(classifyTurn({ mode: 'ai', channel: 'system', input: '林小满现在信任我吗' }).kind, 'system');
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '/技能' }).kind, 'system');
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '查看我的面板' }).kind, 'system');
});

test('speaking to an NPC remains a world turn', () => {
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '我对林小满说，今晚一起去后山吧' }).kind, 'world');
});

test('free text is never accepted by local mode', () => {
  assert.equal(classifyTurn({ mode: 'local', channel: 'world', input: '随便走走' }).kind, 'ambiguous');
});
```

- [ ] **Step 2: Run router tests and confirm the module is missing**

Run: `node --test test/luoying-turn-router.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `turn-router.js`.

- [ ] **Step 3: Implement conservative routing and deterministic system answers**

Recognize exact slash commands plus Chinese patterns for status, realm, qi, spirit, technique, inventory, equipment, quest, relationship, map, recap, save, and help. Explicit NPC speech/action verbs take priority over incidental words such as “技能”. Ambiguous mixed phrases return `ambiguous` so the UI asks the player to choose a channel without sending a request.

`answerSystemQuery` reads state and authored data to answer status, skill costs/effects, breakthrough qi remaining, inventory, quests, relationships, location, and recent facts. It returns only `sys` blocks and does not clone or mutate state.

- [ ] **Step 4: Prove system answers do not change world state**

```js
test('system answers leave time combat and NPC plans untouched', () => {
  const state = seededAiState();
  const before = JSON.stringify(state);
  const answer = answerSystemQuery(state, '突破还差多少灵气');
  assert.equal(answer.handled, true);
  assert.match(answer.blocks[0].text, /灵气/);
  assert.equal(JSON.stringify(state), before);
});
```

- [ ] **Step 5: Run router tests**

Run: `node --test test/luoying-turn-router.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit system pause routing**

```bash
git add public/luoying-xiantu/turn-router.js test/luoying-turn-router.test.js
git commit -m "feat: add non advancing system pause"
```

---

### Task 6: Provider Updates, Transactional AI Turns, and Model Trial Arena

**Files:**
- Modify: `public/luoying-xiantu/ai-client.js`
- Create: `public/luoying-xiantu/ai-turn.js`
- Modify: `test/luoying-ai-client.test.js`
- Create: `test/luoying-ai-turn.test.js`

**Interfaces:**
- Produces: `createAiClient({ fetchImpl, storage }): AiClient`
- Produces: `parseNarration(text, requestType): AiNarration`
- Produces: `createAiTurnRunner({ aiClient, transcriptStore, now, idFactory }): AiTurnRunner`
- `AiNarration` is `{ blocks, effects, progress, memory: { facts, entities, chapterSummary? }, suggestions, timeCost }` for world requests and `{ blocks }` for paused system requests.
- `AiTurnRunner` exposes async `runOpening({ state, settings })`, `runWorld({ state, input, settings })`, `runSystem({ state, input, settings })`, and `runTrial({ settings, trial })`.
- World success is `{ ok: true, state, blocks, suggestions, turn }`; failure is `{ ok: false, error, retry: { input, transactionId, contract } }`.

- [ ] **Step 1: Update provider tests for GPT-OSS and Mistral**

Add `PROVIDERS` to the existing `ai-client.js` import and add this helper before the tests:

```js
const testContext = () => ({
  requestType: 'trial', transactionId: 'trial-1',
  messages: [{ role: 'user', content: '只返回严格 JSON。' }]
});

test('Groq defaults to its production GPT OSS model', () => {
  assert.equal(PROVIDERS.groq.model, 'openai/gpt-oss-120b');
});

test('personal Mistral uses its fixed OpenAI-compatible endpoint', async () => {
  const calls = [];
  const client = createAiClient({
    storage: fakeStorage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '{"blocks":[{"type":"sys","text":"连接成功"}]}' } }] });
    }
  });
  await client.narrate({ provider: 'mistral', credentialMode: 'personal', key: 'secret' }, testContext());
  assert.equal(calls[0].url, 'https://api.mistral.ai/v1/chat/completions');
});
```

- [ ] **Step 2: Run AI client tests and confirm the current defaults fail**

Run: `node --test --test-name-pattern="GPT OSS|personal Mistral" test/luoying-ai-client.test.js`

Expected: FAIL because Groq still defaults to Qwen and Mistral is absent.

- [ ] **Step 3: Extend provider configuration and structured response parsing**

```js
export const PROVIDERS = {
  groq: { label: 'Groq · GPT-OSS', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1', credentialMode: 'site', recommended: true },
  mistral: { label: 'Mistral', model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1', credentialMode: 'site', recommended: true },
  gemini: { label: 'Google Gemini', model: 'gemini-3.5-flash', credentialMode: 'site', advanced: true },
  siliconflow: { label: 'SiliconFlow', model: 'Qwen/Qwen2.5-7B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1', credentialMode: 'personal', advanced: true },
  openrouter: { label: 'OpenRouter', model: '', baseUrl: 'https://openrouter.ai/api/v1', credentialMode: 'personal', advanced: true },
  custom: { label: '自定义接口', model: '', baseUrl: '', credentialMode: 'personal', advanced: true }
};
```

For world responses, parse and sanitize `blocks`, `effects`, `progress`, `memory`, `suggestions`, and `timeCost`. For paused system responses, accept only `blocks` with type `sys` and ignore every effect-like field. Send `requestType` and `transactionId` through site mode.

- [ ] **Step 4: Write failing atomic-turn tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';
import { createAiTurnRunner } from '../public/luoying-xiantu/ai-turn.js';

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'ai-journey');
  state.pending = null;
  state.director.sceneGoal = '调查柴房外的追兵并寻找逃生路线';
  state.director.dangerClocks = { zhaoPursuit: 1 };
  return state;
}

const noProgressResponse = () => JSON.stringify({
  blocks: [{ type: 'narr', text: '四周仍旧安静。' }], effects: {},
  progress: { advanced: [], consequences: [], openLoops: [] },
  memory: [], suggestions: ['继续等待', '再想想'], timeCost: 'brief'
});

const systemResponseWithInjectedEffects = () => JSON.stringify({
  blocks: [{ type: 'sys', text: '落霞掌消耗四点灵力。' }],
  effects: { gold: 999 }, progress: { advanced: ['illegal'] }, timeCost: 'long'
});

function runnerWithNarrator(narrate) {
  return createAiTurnRunner({
    aiClient: { narrate },
    transcriptStore: createTranscriptStore({ memory: new Map() }),
    idFactory: () => 'tx-test'
  });
}

test('an AI failure leaves the complete world byte-for-byte unchanged', async () => {
  const state = seededAiState();
  const before = JSON.stringify(state);
  const transcriptStore = createTranscriptStore({ memory: new Map() });
  const runner = createAiTurnRunner({
    aiClient: { narrate: async () => { throw new Error('429'); } },
    transcriptStore,
    idFactory: () => 'tx-1'
  });
  const result = await runner.runWorld({ state, input: '推开石门', settings: { provider: 'groq' } });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.equal((await transcriptStore.allTurns(state.journeyId)).length, 0);
  assert.equal(result.retry.input, '推开石门');
});

test('invalid narration receives one repair call then rolls back', async () => {
  let calls = 0;
  const runner = runnerWithNarrator(async () => { calls += 1; return noProgressResponse(); });
  const result = await runner.runWorld({ state: seededAiState(), input: '继续', settings: { provider: 'groq' } });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
});

test('a paused AI answer cannot commit effects or time', async () => {
  const state = seededAiState();
  const runner = runnerWithNarrator(async () => systemResponseWithInjectedEffects());
  const result = await runner.runSystem({ state, input: '解释我的剑法', settings: { provider: 'mistral' } });
  assert.equal(result.state.story.minuteOfDay, state.story.minuteOfDay);
  assert.equal(result.state.player.gold, state.player.gold);
});

test('AI journey opening contains only model-authored story blocks', async () => {
  const runner = runnerWithNarrator(async () => JSON.stringify({
    blocks: [{ type: 'narr', text: '冷雨敲在柴房破瓦上，你在草席间睁开眼。' }],
    effects: {},
    progress: { advanced: ['opening:awakened'], consequences: ['赵府家丁正在接近'], openLoops: ['loop:escape-zhao'] },
    memory: { facts: [], entities: [] },
    suggestions: ['查看门缝', '寻找趁手物件'], timeCost: 'instant'
  }));
  const result = await runner.runOpening({ state: seededAiState(), settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.match(result.blocks[0].text, /冷雨/);
});
```

- [ ] **Step 5: Implement the transactional AI runner without importing local narration**

`ai-turn.js` may import `director.js`, `memory.js`, `turn-router.js`, `game-engine.js` only for `applyValidatedEffects`, and `ai-client.js`. It must not import or call `dispatchLocalChoice` or any story-scene renderer. Clone the source state, create one immutable contract/transaction ID, select relevant facts and chapter summaries, and load the latest ten transcript turns. Build the request from the world bible, scene contract, selected memory, recent turns, and exact player input. Make the first request, optionally make one repair request, validate, then append transcript and return the committed clone. On any exception, discard the clone and return retry data. `runOpening` follows the same transaction but uses the authored first scene goal and requires model-authored opening blocks before the journey enters play.

- [ ] **Step 6: Implement paused system fallback and trial isolation**

`runSystem` first calls `answerSystemQuery`; only when `handled` is false does it call the selected AI with a paused prompt and strict system-only parser. Successful world commits apply validated fact/entity candidates and a chapter summary, if present, through the memory module. `runTrial` uses a fixed micro-state and does not receive `GameState` or `TranscriptStore`. It returns `{ output, latencyMs, parsePassed, progressPassed, repetitionScore }` for UI comparison.

- [ ] **Step 7: Run client, director, router, memory, and AI-turn tests**

Run: `node --test test/luoying-ai-client.test.js test/luoying-director.test.js test/luoying-turn-router.test.js test/luoying-memory.test.js test/luoying-ai-turn.test.js`

Expected: all tests PASS.

- [ ] **Step 8: Commit the AI transaction layer**

```bash
git add public/luoying-xiantu/ai-client.js public/luoying-xiantu/ai-turn.js test/luoying-ai-client.test.js test/luoying-ai-turn.test.js
git commit -m "feat: make AI turns atomic and progression aware"
```

---

### Task 7: Dual-Mode Game Interface and Time-Pause UX

**Files:**
- Modify: `public/luoying-xiantu/index.html`
- Modify: `public/luoying-xiantu/styles.css`
- Create: `public/luoying-xiantu/app.js`
- Create: `test/luoying-ui-contract.test.js`
- Reference: `C:/Users/User/Downloads/Chronos/落仙v2.html`

**Interfaces:**
- Consumes: state, mode storage, transcript store, local choices, AI runner, providers, and authored data.
- Produces: standalone game at `/luoying-xiantu/index.html`.
- DOM functions: `renderTitle`, `renderTopbar`, `appendStoryBlock`, `renderLocalChoices`, `renderAiComposer`, `renderPanel`, `renderSaveDialog`, `renderAiDialog`, and `renderTrialArena`.

- [ ] **Step 1: Write a failing static UI contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('HTML exposes mode choice local actions AI channels and pause status', async () => {
  const html = await readFile(new URL('../public/luoying-xiantu/index.html', import.meta.url), 'utf8');
  for (const id of ['localModeCard', 'aiModeCard', 'localActions', 'aiComposer', 'worldChannel', 'systemChannel', 'pauseBadge', 'aiTrialPanel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});
```

- [ ] **Step 2: Run the UI contract test and confirm the current shell is incomplete**

Run: `node --test test/luoying-ui-contract.test.js`

Expected: FAIL because the mode cards, dual AI channels, pause badge, or trial panel are absent.

- [ ] **Step 3: Finish the semantic HTML shell without replacing the supplied visual identity**

Add two title cards with separate continue buttons, a persistent mode badge, hidden-by-default pause badge, local action container, AI composer with explicit channel tabs, retry panel, character/journal/inventory/codex/history panels, save/import/export dialog, AI settings, and trial arena. Keep the original mountain/cherry cover and static decorative SVG.

- [ ] **Step 4: Complete responsive and accessible styling**

Reuse `--pink`, `--deep`, `--gold`, `--ink`, and `--paper`. Give mode cards distinct but related accents, make “时停中” visible without covering prose, set touch targets to at least 44px, support safe-area insets and modal scrolling, add focus-visible states, and disable nonessential motion under `prefers-reduced-motion`. At 360×740, local choices and the AI send button remain reachable without horizontal overflow.

- [ ] **Step 5: Implement text-only story rendering and title flow**

```js
function appendStoryBlock(block) {
  const article = document.createElement('article');
  article.className = `blk ${block.type}`;
  if (block.name) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = block.name;
    article.append(tag);
  }
  const text = document.createElement('div');
  text.className = 'txt';
  text.textContent = block.text;
  article.append(text);
  elements.storyLog.append(article);
}
```

Title flow selects the mode before creating or loading. Continue buttons read only the matching autosave. New-game creation requires a character name and stores the selected mode immediately. Local mode then renders the authored first choice. AI mode verifies that a provider is configured and calls `runOpening`; if opening generation fails, it remains on the retry screen with an empty transcript and never inserts a local opening paragraph.

- [ ] **Step 6: Wire mode-specific play controls**

In local mode, hide `aiComposer`, render only `getAvailableActions(state)`, and call `dispatchLocalChoice(state, choice.id)`. In AI mode, hide `localActions`, preserve the typed value until `runWorld` succeeds, show a pending indicator, and on failure display retry/switch/edit/title actions without appending story or saving. Channel tabs set `world` or `system`; `system` and every open panel show `pauseBadge`.

- [ ] **Step 7: Wire panels, history, independent slots, export/import, and legacy migration**

Panels read state without dispatching turns. History pages through IndexedDB. Save cards show mode, character, realm, act, location, day, and timestamp. Import validates the currently selected mode. If `findLegacySave()` returns data, display one non-destructive choice to import it into local or AI; do not delete the legacy key.

- [ ] **Step 8: Wire AI settings and the isolated model trial arena**

Recommended providers appear first, advanced providers remain available, credentials are masked, and “清除凭据” removes only AI settings. Connection test and trial runs state how many requests they consume. Trial outputs appear side-by-side with measured latency, validation badges, and a player 1–5 fun score; no trial result calls save or transcript APIs.

- [ ] **Step 9: Run all browser-module tests**

Run: `node --test test/luoying-*.test.js`

Expected: all tests PASS.

- [ ] **Step 10: Commit the playable standalone UI**

```bash
git add public/luoying-xiantu/index.html public/luoying-xiantu/styles.css public/luoying-xiantu/app.js test/luoying-ui-contract.test.js
git commit -m "feat: add isolated local and AI game interface"
```

---

### Task 8: Authenticated Groq, Mistral, and Gemini Proxy

**Files:**
- Create: `server/game-ai.js`
- Modify: `server/index.js`
- Create: `test/game-ai.test.js`

**Interfaces:**
- Produces: `validateGameAiBody(body): ValidatedGameAiRequest`
- Produces: `createGameAiService({ fetchImpl, env, now }): GameAiService`
- `GameAiService.generate(accountKey, request)` returns `{ text, provider, model, transactionId }`.
- Endpoint: `POST /api/game/ai`, protected by the existing `requireAuth` middleware.

- [ ] **Step 1: Write failing provider-whitelist and fixed-endpoint tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAiService, validateGameAiBody } from '../server/game-ai.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

const validRequest = (provider) => ({
  provider,
  model: '',
  transactionId: 'tx-1',
  requestType: 'world',
  messages: [{ role: 'user', content: '继续剧情' }]
});

test('site proxy accepts only its three configured providers', () => {
  assert.throws(() => validateGameAiBody(validRequest('custom')), /提供商/);
  assert.equal(validateGameAiBody({ provider: 'mistral', transactionId: 'tx-1', requestType: 'world', messages: [{ role: 'user', content: 'x' }] }).provider, 'mistral');
});

test('Groq uses the fixed official endpoint and configured production model', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret', GROQ_MODEL: 'openai/gpt-oss-120b' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '结果' } }] });
    }
  });
  const result = await service.generate('player', validRequest('groq'));
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(result.model, 'openai/gpt-oss-120b');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('Mistral uses the fixed official endpoint', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { MISTRAL_API_KEY: 'secret', MISTRAL_MODEL: 'mistral-small-latest' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '结果' } }] });
    }
  });
  await service.generate('player', validRequest('mistral'));
  assert.equal(calls[0].url, 'https://api.mistral.ai/v1/chat/completions');
});
```

- [ ] **Step 2: Run proxy tests and confirm the service is missing**

Run: `node --test test/game-ai.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/game-ai.js`.

- [ ] **Step 3: Implement validation, rate limiting, timeouts, and provider adapters**

Allow only `groq`, `mistral`, and `gemini`; request types `world`, `system`, `repair`, and `trial`; transaction IDs matching `/^[A-Za-z0-9_-]{1,80}$/`; at most 12 messages, 6,000 characters per message, and 50,000 characters total. Use a 45-second timeout and one retry for 429/502/503. Account rate limiting permits 12 requests per rolling minute and 240 per day. Return error objects with codes `AI_NOT_CONFIGURED`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_AUTH_FAILED`, and `AI_UPSTREAM_FAILED`; do not return provider bodies containing secrets.

- [ ] **Step 4: Register the authenticated route in the existing server**

```js
const gameAi = createGameAiService({ fetchImpl: fetch, env: process.env });

app.post('/api/game/ai', requireAuth, async (req, res, next) => {
  try {
    const result = await gameAi.generate(req.auth.usernameKey, validateGameAiBody(req.body));
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    next(error);
  }
});
```

Place the route before static SPA fallback. Keep the current global JSON limit at 120 KB and all existing account/social/room routes unchanged.

- [ ] **Step 5: Run proxy and complete Node test suite**

Run: `node --test test/*.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit the authenticated AI proxy**

```bash
git add server/game-ai.js server/index.js test/game-ai.test.js
git commit -m "feat: proxy supported game AI providers"
```

---

### Task 9: Replace Chronos Rift with the Same-Origin Game Host

**Files:**
- Replace: `src/ChronosRiftGame.jsx`
- Replace: `src/game.css`
- Modify: `src/main.jsx`
- Create: `test/luoying-host-contract.test.js`

**Interfaces:**
- Consumes: authenticated Chronos page and `/luoying-xiantu/index.html`.
- Produces: the existing `ChronosRiftGame` export as a lightweight iframe host so no unrelated route imports change.

- [ ] **Step 1: Write a failing host contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Chronos game host loads the same-origin cultivation game', async () => {
  const source = await readFile(new URL('../src/ChronosRiftGame.jsx', import.meta.url), 'utf8');
  assert.match(source, /src="\/luoying-xiantu\/index\.html"/);
  assert.match(source, /title="落樱仙途"/);
  assert.doesNotMatch(source, /requestAnimationFrame|Chronos Rift/);
});
```

- [ ] **Step 2: Run the host test and confirm Rift still exists**

Run: `node --test test/luoying-host-contract.test.js`

Expected: FAIL because the current component contains the platformer and animation loop.

- [ ] **Step 3: Replace the component with a minimal host**

```jsx
import './game.css';

export default function ChronosRiftGame() {
  return <main className="luoying-host">
    <iframe
      className="luoying-frame"
      src="/luoying-xiantu/index.html"
      title="落樱仙途"
      referrerPolicy="same-origin"
    />
  </main>;
}
```

Do not add `allow` permissions. Keep the historical component filename to avoid unrelated router changes.

- [ ] **Step 4: Replace Rift CSS and rename mobile navigation copy**

Make the host fill the available game viewport with no iframe border, allow the game to manage its own scroll, and retain bottom-nav clearance on narrow screens. Change only the game mobile subtitle in `src/main.jsx` from `Rift` to `落樱仙途`.

- [ ] **Step 5: Run host test and production build**

Run: `node --test test/luoying-host-contract.test.js`

Expected: PASS.

Run: `.\node_modules\.bin\vite.cmd build`

Expected: Vite exits 0 and emits `dist/luoying-xiantu/index.html` plus the Chronos application bundle.

- [ ] **Step 6: Commit the Chronos integration**

```bash
git add src/ChronosRiftGame.jsx src/game.css src/main.jsx test/luoying-host-contract.test.js
git commit -m "feat: replace Chronos Rift with Luoying Xiantu"
```

---

### Task 10: Render Configuration and Operator Documentation

**Files:**
- Modify: `render.yaml`
- Modify: `README.md`
- Create: `.env.example`

**Interfaces:**
- Documents server-owned keys and player-owned provider setup.
- Declares optional Render environment variables without values.

- [ ] **Step 1: Add optional provider variables to Render**

```yaml
      - key: GROQ_API_KEY
        sync: false
      - key: GROQ_MODEL
        value: openai/gpt-oss-120b
      - key: MISTRAL_API_KEY
        sync: false
      - key: MISTRAL_MODEL
        value: mistral-small-latest
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        sync: false
```

- [ ] **Step 2: Add a safe environment template**

```dotenv
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
GEMINI_API_KEY=
GEMINI_MODEL=
```

The template contains no real credential. Confirm `.env` remains ignored.

- [ ] **Step 3: Document gameplay modes, AI setup, privacy, and failure semantics**

README must state that local mode is choice-only, AI mode is freeform, saves are isolated, system questions pause time, AI errors never fall back to local, site AI requires Chronos login, and players can instead enter a browser-local personal key. Include Render dashboard steps for the six environment variables and note that free tiers and model availability can change.

- [ ] **Step 4: Verify no secret-like value entered tracked files**

Run: `rg -n "(gsk_|AIza|sk-[A-Za-z0-9]{12,}|MISTRAL_API_KEY=.+|GROQ_API_KEY=.+)" --glob '!node_modules/**' --glob '!dist/**'`

Expected: no real key match; empty `.env.example` assignments and documentation variable names are acceptable.

- [ ] **Step 5: Commit deployment documentation**

```bash
git add render.yaml README.md .env.example
git commit -m "docs: configure Luoying AI deployment"
```

---

### Task 11: Full Verification, Browser Smoke Test, and Main Push

**Files:**
- Modify only files required by verified defects found in this task.

**Interfaces:**
- Verifies the complete spec; produces no new public module contract.

- [ ] **Step 1: Run the complete test suite from a clean command**

Run: `node --test test/*.test.js`

Expected: every test passes with zero failures, skips caused by missing modules, or unhandled rejections.

- [ ] **Step 2: Run production build and inspect emitted game files**

Run: `.\node_modules\.bin\vite.cmd build`

Expected: exit 0.

Run: `Get-Item dist\index.html,dist\luoying-xiantu\index.html,dist\luoying-xiantu\app.js | Select-Object FullName,Length`

Expected: all three files exist and have non-zero length.

- [ ] **Step 3: Start the production server for smoke testing**

Run: `node --env-file-if-exists=.env server/index.js`

Expected: server reports its listening port and keeps running in the PTY session.

- [ ] **Step 4: Verify public routes and authenticated boundary**

Run in another terminal: `Invoke-WebRequest http://127.0.0.1:3001/luoying-xiantu/index.html -UseBasicParsing | Select-Object StatusCode`

Expected: `200`.

Run: `Invoke-WebRequest http://127.0.0.1:3001/api/game/ai -Method Post -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck | Select-Object StatusCode`

Expected: `401` without a Chronos session.

- [ ] **Step 5: Perform desktop and mobile browser scenarios**

At desktop 1440×900 and mobile 360×740 verify:

1. Open Chronos, sign in, enter `Game`, and confirm the cultivation title screen replaces Rift.
2. Create local and AI characters with different names; reload and confirm each continue card loads only its own mode.
3. In local mode confirm no input field exists and play choices through one battle, one item use, one equipment change, and one cultivation reward.
4. In AI mode open status/skills/history and confirm “时停中”; ask a system question and confirm displayed day/time and NPC plans do not change.
5. Send a world action with an intentionally invalid key and confirm the action text remains, no local prose appears, and retry/switch/edit/title controls appear.
6. Open the model trial arena, run a configured provider once, and confirm formal save timestamps and transcript counts do not change.
7. Export and import one save of each mode; reject an AI export when local mode is selected.
8. Confirm modal controls, choices, composer, and Chronos navigation have no horizontal overflow.

- [ ] **Step 6: Inspect repository state and staged diff**

Run: `git status --short`

Expected: no accidental `dist`, `.env`, API key, or unrelated user file is staged.

Run: `git diff --check main...HEAD`

Expected: no whitespace errors.

- [ ] **Step 7: Commit only verified smoke-test fixes if any exist**

If Step 5 exposes a defect, add a regression test first, confirm it fails, patch the smallest responsible module, rerun Steps 1–5, then commit only those named files with `git commit -m "fix: resolve Luoying release smoke defects"`. If there is no defect, create no empty commit.

- [ ] **Step 8: Review the finished branch and integrate it**

Invoke `superpowers:requesting-code-review`, address verified findings, rerun Steps 1–6, then invoke `superpowers:finishing-a-development-branch`. Merge the approved feature branch into local `main` without discarding unrelated changes.

- [ ] **Step 9: Push the verified main branch**

Run: `git push origin main`

Expected: push succeeds and the remote `main` points at the verified integration commit.

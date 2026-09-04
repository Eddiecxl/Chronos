# 《落樱仙途》Chronos Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Chronos Rift with a polished cultivation text game that remains fully playable locally and can switch at any time among local, Groq, Gemini, Puter, SiliconFlow, OpenRouter, and custom AI narration.

**Architecture:** Serve the game as an isolated same-origin static module under `public/luoying-xiantu/` and host it in the authenticated Chronos game route with an iframe. Keep deterministic state, progression, combat, quests, saves, and endings in pure browser modules; treat AI as an optional validated narration adapter. Route only site-funded Groq/Gemini requests through an authenticated Express proxy.

**Tech Stack:** React 19, Vite 7, Express 5, browser ES modules, Node 22 built-in test runner, LocalStorage, Gemini `generateContent` REST API, Groq OpenAI-compatible Chat Completions API.

**Spec:** `docs/superpowers/specs/2026-09-04-luoying-xiantu-design.md`

## Global Constraints

- Preserve the supplied pink cherry-blossom, ink-mountain UI and its free-text interaction model.
- The local engine must support a complete opening-to-ending playthrough without network access.
- AI is an enhancement layer; any AI failure falls back for the current turn without changing the selected provider.
- Keep local, Puter, Gemini, SiliconFlow, OpenRouter, Groq, and custom provider choices available in the in-game settings at all times.
- Site-funded keys exist only in `GEMINI_API_KEY` and `GROQ_API_KEY`; neither may enter browser bundles, logs, saves, or exports.
- Personal keys stay in the player's browser and never pass through the Chronos server.
- AI-authored text is rendered as text and parsed data; model output is never executed as JavaScript or inserted as trusted HTML.
- Do not modify Chronos account, planning, social, reader, or trainer behavior.
- Do not add production dependencies; use Node 22, Express, React, and browser APIs already present.

---

### Task 1: Versioned Game State and Save Migration

**Files:**
- Modify: `package.json`
- Create: `public/luoying-xiantu/game-state.js`
- Create: `public/luoying-xiantu/storage.js`
- Create: `test/luoying-game-state.test.js`

**Interfaces:**
- Produces: `createGameState(name?: string): GameState`
- Produces: `migrateGameState(input: unknown): GameState`
- Produces: `validateImportedState(input: unknown): GameState`
- Produces: `createStorage(storage: Storage): { loadAuto, saveAuto, loadSlot, saveSlot, deleteSlot, exportState, importState }`
- `GameState` includes `schemaVersion`, player stats, story, quests, inventory, equipment, relationships, karma, achievements, codex, endings, memory, battle, and pending interaction.

- [ ] **Step 1: Add the Node test script and write failing state tests**

```json
"scripts": {
  "test": "node --test test/*.test.js"
}
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, migrateGameState, validateImportedState } from '../public/luoying-xiantu/game-state.js';

test('new game has complete versioned collections', () => {
  const state = createGameState('顾长生');
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.quests.active, []);
  assert.equal(state.player.realm, 0);
  assert.equal(state.story.act, 1);
  assert.equal(state.settings.difficulty, 'normal');
});

test('v1 save keeps progress and gains new fields', () => {
  const state = migrateGameState({ name: '旧梦', realm: 4, hp: 61, gold: 88, exp: 20, flags: { metLi: true }, aff: { '李老': 17 } });
  assert.equal(state.player.name, '旧梦');
  assert.equal(state.player.realm, 4);
  assert.equal(state.relationships['李老'], 17);
  assert.equal(state.story.flags.metLi, true);
  assert.ok(Array.isArray(state.achievements.unlocked));
});

test('invalid imported saves are rejected without evaluation', () => {
  assert.throws(() => validateImportedState({ schemaVersion: 2, player: { name: '<script>' } }), /存档/);
});
```

- [ ] **Step 2: Run the state tests and confirm they fail because the modules do not exist**

Run: `pnpm test -- --test-name-pattern="new game|v1 save|invalid imported"`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `game-state.js`.

- [ ] **Step 3: Implement normalized state creation and explicit migration**

```js
export const GAME_SCHEMA_VERSION = 2;
export function createGameState(name = '顾长生') {
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    player: { name: cleanName(name), realm: 0, hp: 100, maxHp: 100, exp: 0, gold: 0, attack: 11, defense: 4, spirit: 10 },
    story: { act: 1, scene: 'awakening', day: 1, location: '赵府柴房', flags: {}, completedEvents: [] },
    quests: { active: [], completed: [], failed: [] },
    inventory: { items: { '回春丹': 1 }, materials: {}, limit: 36 },
    equipment: { weapon: null, armor: null, accessory: null },
    techniques: { known: ['吐纳'], equipped: ['吐纳'], mastery: { '吐纳': 0 } },
    relationships: { '林小满': 0, '李老': 0, '苏晚晴': 0, '钱多多': 0 },
    karma: { mercy: 0, ambition: 0, demonic: 0, promises: [] },
    achievements: { unlocked: [], progress: {} },
    codex: { characters: [], locations: [], items: [], endings: [] },
    endings: { unlocked: [], newGamePlus: false },
    memory: { summary: '', facts: [], turnCount: 0 },
    battle: null,
    pending: { type: 'intro-name' },
    stats: { turns: 0, battlesWon: 0, faceCount: 0, pillsCrafted: 0 },
    settings: { difficulty: 'normal' },
    updatedAt: new Date().toISOString()
  };
}
```

Implement `cleanName`, finite-number clamps, collection defaults, v1 field mapping, and a 400 KB serialized import limit. Do not use object spread from untrusted input for privileged fields.

- [ ] **Step 4: Implement storage keys, slots, export, and non-destructive import**

Use `luoying_save_v2`, `luoying_slot1_data` through `luoying_slot3_data`, and retain reads from `luoying_save` plus `luoying_slot*_data`. `exportState` must omit AI settings and return a JSON `Blob`; `importState` validates before writing.

- [ ] **Step 5: Run state tests**

Run: `pnpm test -- --test-name-pattern="new game|v1 save|invalid imported"`

Expected: 3 tests PASS.

- [ ] **Step 6: Commit the state layer**

```bash
git add package.json public/luoying-xiantu/game-state.js public/luoying-xiantu/storage.js test/luoying-game-state.test.js
git commit -m "feat: add versioned Luoying game state"
```

---

### Task 2: World Content, Progression, Combat, and Local Narration

**Files:**
- Create: `public/luoying-xiantu/game-data.js`
- Create: `public/luoying-xiantu/game-engine.js`
- Create: `test/luoying-engine.test.js`

**Interfaces:**
- Consumes: `GameState`, `createGameState`, `migrateGameState`
- Produces: `dispatchLocalAction(state: GameState, raw: string, random?: () => number): TurnResult`
- Produces: `applyValidatedEffects(state: GameState, effects: AiEffects): GameState`
- Produces: `getAvailableActions(state: GameState): SuggestedAction[]`
- `TurnResult` is `{ state, blocks, suggestions, autosave, ending? }`.

- [ ] **Step 1: Write failing engine tests for progression, battle, limits, and endings**

```js
test('the intro can enter the sect without AI', () => {
  let state = createGameState('沈桃');
  for (const input of ['我叫沈桃', '推开柴门', '帮助林小满', '接受李老传功', '前往落霞宗']) {
    state = dispatchLocalAction(state, input, () => 0.2).state;
  }
  assert.equal(state.story.location, '落霞宗外门');
  assert.ok(state.quests.active.some((quest) => quest.id === 'outer-trial'));
});

test('AI effects cannot invent items or excessive rewards', () => {
  const state = applyValidatedEffects(createGameState(), { gold: 999999, hp: -999, addItems: { '管理员之剑': 1 }, location: '源代码后台' });
  assert.equal(state.player.gold, 100);
  assert.equal(state.player.hp, 1);
  assert.equal(state.inventory.items['管理员之剑'], undefined);
  assert.equal(state.story.location, '赵府柴房');
});

test('mercy path unlocks the guardian ending', () => {
  const state = createGameState();
  state.story.act = 5;
  state.player.realm = 22;
  state.karma.mercy = 8;
  state.story.flags.savedSect = true;
  const result = dispatchLocalAction(state, '留下守护人间', () => 0.1);
  assert.equal(result.ending.id, 'guardian');
});
```

- [ ] **Step 2: Run engine tests and confirm the missing-module failure**

Run: `pnpm test -- --test-name-pattern="without AI|excessive rewards|guardian ending"`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `game-engine.js`.

- [ ] **Step 3: Define data for five acts and the reusable systems**

`game-data.js` must export exactly these collections: `REALMS`, `LOCATIONS`, `ITEMS`, `TECHNIQUES`, `NPCS`, `QUESTS`, `STORY_SCENES`, `RANDOM_EVENTS`, `ENEMIES`, `ACHIEVEMENTS`, and `ENDINGS`.

Minimum authored content:

- 23 realm labels from mortal through tribulation.
- 12 locations with act/realm unlock conditions.
- 24 items, 10 techniques, 8 recurring NPCs, and 18 enemies.
- 15 main quests, 12 side quests, and 30 weighted random events.
- Five acts with at least four required story scenes each.
- Five endings: `ascension`, `guardian`, `wanderer`, `demonic`, and `fallen`.

- [ ] **Step 4: Implement deterministic input routing and immutable turn results**

Normalize Chinese punctuation, match current pending state first, then battle commands, explicit system commands, story choices, location travel, NPC interaction, and finally freeform local reactions. Each route returns narrative blocks using `{ type: 'narr'|'dlg'|'sys', name?, text }`.

- [ ] **Step 5: Implement combat and progression validation**

Combat exposes attack, equipped techniques, defend, item, and flee. Enemy intent is chosen before the player command. Clamp one-turn AI changes to `hp -80..40`, `gold -100..100`, `exp 0..80`, and relationship deltas `-20..20`; unknown item, quest, technique, NPC, and location identifiers are ignored.

- [ ] **Step 6: Run all engine and state tests**

Run: `pnpm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit the complete local engine**

```bash
git add public/luoying-xiantu/game-data.js public/luoying-xiantu/game-engine.js test/luoying-engine.test.js
git commit -m "feat: build complete local cultivation engine"
```

---

### Task 3: AI Provider Client and Safe Structured Narration

**Files:**
- Create: `public/luoying-xiantu/ai-client.js`
- Create: `test/luoying-ai-client.test.js`

**Interfaces:**
- Consumes: `applyValidatedEffects`, current `GameState`, recent narrative blocks, session token stored at `chronos-session-token-v1`
- Produces: `createAiClient({ fetchImpl, storage, puterLoader }): AiClient`
- Produces: `parseNarration(text: string): { blocks, effects, suggestions }`
- Produces: `buildNarrationPrompt(state, history, input): Message[]`
- `AiClient.testConnection(settings)` and `AiClient.narrate(settings, context)` resolve to normalized text.

- [ ] **Step 1: Write failing tests for strict parsing, provider switching, and site-key authentication**

```js
test('parser never treats model HTML as markup', () => {
  const parsed = parseNarration('{"blocks":[{"type":"dlg","name":"魔修","text":"<img src=x onerror=alert(1)>"}]}');
  assert.equal(parsed.blocks[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(parsed.blocks[0].html, undefined);
});

test('site Gemini uses the authenticated Chronos proxy', async () => {
  const calls = [];
  const client = createAiClient({ fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ text: '{}', model: 'gemini-3.5-flash' }); }, storage: fakeStorage({ 'chronos-session-token-v1': 'session' }) });
  await client.narrate({ provider: 'gemini', credentialMode: 'site', model: '' }, { messages: [{ role: 'user', content: '继续' }] });
  assert.equal(calls[0].url, '/api/game/ai');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer session');
});

test('a failed request does not overwrite the selected provider', async () => {
  const storage = fakeStorage({ luoying_ai_v2: JSON.stringify({ provider: 'groq' }) });
  const client = createAiClient({ fetchImpl: async () => { throw new Error('offline'); }, storage });
  await assert.rejects(() => client.narrate({ provider: 'groq', credentialMode: 'personal', key: 'x', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.6-27b' }, { messages: [] }));
  assert.equal(JSON.parse(storage.getItem('luoying_ai_v2')).provider, 'groq');
});
```

- [ ] **Step 2: Run AI client tests and confirm they fail**

Run: `pnpm test -- --test-name-pattern="model HTML|site Gemini|selected provider"`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `ai-client.js`.

- [ ] **Step 3: Implement provider settings and request adapters**

Defaults:

```js
export const PROVIDERS = {
  local: { model: '', credentialMode: 'none' },
  puter: { model: 'gpt-4o-mini', credentialMode: 'none' },
  gemini: { model: 'gemini-3.5-flash', credentialMode: 'site' },
  siliconflow: { model: 'Qwen/Qwen2.5-7B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1', credentialMode: 'personal' },
  openrouter: { model: '', baseUrl: 'https://openrouter.ai/api/v1', credentialMode: 'personal' },
  groq: { model: 'qwen/qwen3.6-27b', baseUrl: 'https://api.groq.com/openai/v1', credentialMode: 'site' },
  custom: { model: '', baseUrl: '', credentialMode: 'personal' }
};
```

Gemini personal mode calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`. Groq and OpenAI-compatible modes call `{baseUrl}/chat/completions` with Bearer authentication. Site mode calls `/api/game/ai`. Puter loads only after selection.

- [ ] **Step 4: Implement strict structured parsing and bounded retries**

Strip code-fence wrappers, select the first complete JSON object, apply only trailing-comma repair, then use `JSON.parse`. Reject missing blocks and never use `new Function`, `eval`, or `innerHTML`. Use a 45-second AbortController timeout and one retry for 429, 502, and 503.

- [ ] **Step 5: Run AI and engine tests**

Run: `pnpm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the AI client**

```bash
git add public/luoying-xiantu/ai-client.js test/luoying-ai-client.test.js
git commit -m "feat: add switchable safe AI narration"
```

---

### Task 4: Preserve and Expand the Supplied Game UI

**Files:**
- Create: `public/luoying-xiantu/index.html`
- Create: `public/luoying-xiantu/styles.css`
- Create: `public/luoying-xiantu/app.js`
- Reference input: `../落仙v2.html` outside the repository

**Interfaces:**
- Consumes: state, storage, local engine, AI client, content data
- Produces: a standalone game at `/luoying-xiantu/index.html`
- DOM rendering functions: `renderTopbar`, `renderLogBlock`, `renderSuggestions`, `renderCharacterPanel`, `renderJournal`, `renderCodex`, `renderSaveDialog`, and `renderAiDialog`

- [ ] **Step 1: Build the semantic HTML shell from the supplied page**

Keep the SVG mountain/cherry cover, title, cover buttons, game top bar, scrollable story log, suggestion chips, free-text input, breakthrough overlay, ending card, save modal, and AI modal. Add buttons and modal tabs for `角色`, `任务`, `背包`, `图鉴`, and `设置`. Load `styles.css` and `app.js` as local module resources; keep Google Fonts optional rather than required.

- [ ] **Step 2: Move and extend the supplied CSS without changing its visual identity**

Retain the original color tokens `--pink`, `--deep`, `--gold`, `--ink`, and `--paper`. Add accessible focus states, `prefers-reduced-motion`, 44px mobile tap targets, landscape height handling, modal scrolling, safe-area padding, and panel grids. Ensure every main action remains reachable at 360×740 and 1440×900.

- [ ] **Step 3: Implement DOM rendering with text-only content insertion**

```js
function appendStoryBlock(block) {
  const container = document.createElement('article');
  container.className = `blk ${block.type}`;
  if (block.name) {
    const name = document.createElement('span');
    name.className = 'tag';
    name.textContent = block.name;
    container.append(name);
  }
  const text = document.createElement('div');
  text.className = 'txt';
  text.textContent = block.text;
  container.append(text);
  logElement.append(container);
}
```

All player and AI text must use `textContent`. Decorative static SVG remains authored markup.

- [ ] **Step 4: Wire local turns, AI turns, suggestions, panels, and saves**

Start and continue must load the versioned state. Explicit actions dispatch locally. Freeform actions call the selected AI, validate effects, append blocks, then autosave; errors append a Chinese system block and dispatch the same input locally. AI configuration persists separately from game saves and can be changed without reload.

- [ ] **Step 5: Add save import/export and three-slot controls**

Export downloads `落樱仙途-角色名-日期.json`. Import uses a hidden file input, rejects oversize/invalid files, and never writes until validation succeeds. Slot cards display character, realm, act, location, day, and save time.

- [ ] **Step 6: Perform standalone browser smoke checks**

Run a local static server and verify cover → new game → name → five local commands → autosave → refresh → continue. Open every panel and modal, switch each provider without sending a paid request, export/import a save, and confirm no console errors.

- [ ] **Step 7: Commit the playable standalone game**

```bash
git add public/luoying-xiantu/index.html public/luoying-xiantu/styles.css public/luoying-xiantu/app.js
git commit -m "feat: add polished Luoying Xiantu interface"
```

---

### Task 5: Authenticated Gemini and Groq Proxy

**Files:**
- Create: `server/game-ai.js`
- Modify: `server/index.js:22,65-77,99`
- Create: `test/game-ai.test.js`

**Interfaces:**
- Produces: `validateGameAiBody(body): { provider, model, messages }`
- Produces: `createGameAiService({ fetchImpl, env, now }): { generate, checkLimit }`
- Consumes: `req.auth.usernameKey` established by existing `requireAuth`
- Endpoint: `POST /api/game/ai` returns `{ text, provider, model }`

- [ ] **Step 1: Write failing proxy tests**

```js
test('proxy only accepts Gemini and Groq', () => {
  assert.throws(() => validateGameAiBody({ provider: 'custom', messages: [] }), /提供商/);
});

test('Groq request uses the fixed official endpoint', async () => {
  const calls = [];
  const service = createGameAiService({ env: { GROQ_API_KEY: 'secret', GROQ_MODEL: 'qwen/qwen3.6-27b' }, fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ choices: [{ message: { content: '结果' } }] }); } });
  const result = await service.generate('player', { provider: 'groq', messages: [{ role: 'user', content: '继续' }] });
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(result.text, '结果');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('rate limit is scoped by signed-in account', () => {
  const service = createGameAiService({ env: {}, now: () => 1000 });
  for (let count = 0; count < 12; count += 1) assert.equal(service.checkLimit('player-a'), true);
  assert.equal(service.checkLimit('player-a'), false);
  assert.equal(service.checkLimit('player-b'), true);
});
```

- [ ] **Step 2: Run proxy tests and confirm the missing-module failure**

Run: `pnpm test -- --test-name-pattern="Gemini and Groq|official endpoint|signed-in account"`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/game-ai.js`.

- [ ] **Step 3: Implement validation, rate limits, and fixed upstream adapters**

Allow at most 12 requests per account per rolling 60 seconds, 12 messages, 10,000 characters total, and 4,000 characters per message. Permit only roles `system`, `user`, and `assistant`. Model IDs must match `/^[a-zA-Z0-9._\/-]{1,100}$/`.

Gemini uses `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`; Groq uses the fixed Chat Completions URL with Bearer authentication. Default to `gemini-3.5-flash` and `qwen/qwen3.6-27b`. Abort after 45 seconds. Translate missing configuration to status 503, rate limiting to 429, bad requests to 400, upstream authentication to 502, and other upstream failure to 503.

- [ ] **Step 4: Mount the authenticated route**

```js
const gameAi = createGameAiService({ fetchImpl: fetch, env: process.env });
app.post('/api/game/ai', requireAuth, async (req, res, next) => {
  try {
    if (!gameAi.checkLimit(req.auth.usernameKey)) return res.status(429).json({ error: 'AI 请求太快，请稍后再试。' });
    res.json(await gameAi.generate(req.auth.usernameKey, validateGameAiBody(req.body)));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});
```

- [ ] **Step 5: Run proxy tests and the full test suite**

Run: `pnpm test`

Expected: all tests PASS without real network requests.

- [ ] **Step 6: Commit the proxy**

```bash
git add server/game-ai.js server/index.js test/game-ai.test.js
git commit -m "feat: proxy authenticated game AI requests"
```

---

### Task 6: Replace Chronos Rift with the Game Host

**Files:**
- Replace: `src/ChronosRiftGame.jsx`
- Replace: `src/game.css`
- Modify: `src/main.jsx:227,1091`

**Interfaces:**
- Consumes: `/luoying-xiantu/index.html`
- Produces: authenticated `/chronos/game` host with `LuoyingXiantuGame({ username })`

- [ ] **Step 1: Replace the canvas platformer component with an iframe host**

```jsx
export default function LuoyingXiantuGame({ username }) {
  return <main className="luoying-host">
    <iframe
      className="luoying-frame"
      src="/luoying-xiantu/index.html"
      title={`落樱仙途 — ${username}`}
      allow="clipboard-read; clipboard-write"
      referrerPolicy="same-origin"
    />
  </main>;
}
```

Do not sandbox the same-origin iframe because the game must read the existing session token for authenticated site-key AI calls. Grant no camera, microphone, geolocation, payment, or fullscreen permissions.

- [ ] **Step 2: Add isolated full-height host styling**

Use `height: calc(100dvh - var(--actual-header-height))`, a minimum height of 620px on desktop, no iframe border, and a mobile height that reserves Chronos bottom navigation. Ensure the surrounding Chronos page does not add the normal content max-width or padding.

- [ ] **Step 3: Update route copy while preserving the route**

Keep desktop `Game`. Change the mobile secondary label from `Rift` to `仙途`. The existing `page === 'game'` branch continues to require a logged-in username.

- [ ] **Step 4: Build Chronos and inspect route output**

Run: `pnpm run build`

Expected: Vite exits 0 and `dist/luoying-xiantu/index.html` exists.

- [ ] **Step 5: Commit the Chronos replacement**

```bash
git add src/ChronosRiftGame.jsx src/game.css src/main.jsx
git commit -m "feat: replace Rift with Luoying Xiantu"
```

---

### Task 7: Render Configuration and Operator Documentation

**Files:**
- Modify: `render.yaml`
- Modify: `README.md`

**Interfaces:**
- Documents: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`
- Produces: Render deployment that remains functional when all four are unset

- [ ] **Step 1: Declare optional Render environment variables**

```yaml
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        value: gemini-3.5-flash
      - key: GROQ_API_KEY
        sync: false
      - key: GROQ_MODEL
        value: qwen/qwen3.6-27b
```

- [ ] **Step 2: Document game access and both credential modes**

Add a README section describing `/chronos/game`, the complete local engine, game-level provider switching, Render environment setup, personal-key browser storage, rate limiting, and the fact that unset hosted keys do not disable the game.

- [ ] **Step 3: Verify no credential values are committed**

Run: `git grep -n -E "AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}" -- . ':!pnpm-lock.yaml'`

Expected: no output.

- [ ] **Step 4: Commit deployment documentation**

```bash
git add render.yaml README.md
git commit -m "docs: configure Luoying AI deployment"
```

---

### Task 8: Final Verification and Delivery

**Files:**
- Modify only files required by verification failures, with a failing regression test added before each fix.

**Interfaces:**
- Produces: tested `main` branch ready for Render auto-deploy

- [ ] **Step 1: Run automated tests**

Run: `pnpm test`

Expected: all state, engine, AI client, and server proxy tests PASS.

- [ ] **Step 2: Run the production build**

Run: `pnpm run build`

Expected: Vite exits 0, React bundle builds, and the complete game directory appears in `dist/luoying-xiantu/`.

- [ ] **Step 3: Start the production server and run endpoint smoke checks**

Run: `pnpm start`

Verify `/api/health` returns 200, `/luoying-xiantu/index.html` returns 200, unauthenticated `/api/game/ai` returns 401, and `/chronos/game` returns the SPA shell.

- [ ] **Step 4: Run headless desktop and mobile visual smoke checks**

Capture 1440×900 and 390×844 screenshots for the cover and active game. Confirm the input, AI settings, save dialog, panel buttons, and Chronos navigation are visible and usable, with no horizontal overflow.

- [ ] **Step 5: Review the final diff and repository status**

Run: `git diff --check HEAD~7..HEAD` and `git status --short --branch`.

Expected: no whitespace errors and no untracked implementation files.

- [ ] **Step 6: Push the completed main branch**

Run: `git push origin main`

Expected: the remote accepts all commits and reports `main -> main`.

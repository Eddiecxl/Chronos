import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createStorage } from '../public/luoying-xiantu/storage.js';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('autosave round trip preserves progress but clears transient battle', () => {
  const adapter = createStorage(memoryStorage());
  const state = createGameState('云舟', 'local');
  state.player.gold = 73;
  state.battle = { enemyId: 'wolf' };
  adapter.saveAuto('local', state);
  const loaded = adapter.loadAuto('local');
  assert.equal(loaded.player.name, '云舟');
  assert.equal(loaded.player.gold, 73);
  assert.equal(loaded.battle, null);
});

test('manual slot metadata describes the saved journey', () => {
  const adapter = createStorage(memoryStorage());
  const state = createGameState('折枝', 'local');
  state.story.act = 3;
  state.story.location = '青岚秘境';
  adapter.saveSlot('local', 'slot2', state);
  assert.deepEqual(adapter.getSlotMeta('local', 'slot2'), {
    mode: 'local', name: '折枝', realm: 0, act: 3, location: '青岚秘境', day: 1,
    savedAt: adapter.getSlotMeta('local', 'slot2').savedAt
  });
});

test('local and AI autosaves never share a key', () => {
  const raw = memoryStorage();
  const adapter = createStorage(raw);
  adapter.saveAuto('local', createGameState('本地身', 'local'));
  adapter.saveAuto('ai', createGameState('万象身', 'ai'));
  assert.equal(adapter.loadAuto('local').player.name, '本地身');
  assert.equal(adapter.loadAuto('ai').player.name, '万象身');
});

test('slot writes reject a mismatched mode', () => {
  const adapter = createStorage(memoryStorage());
  assert.throws(() => adapter.saveSlot('local', 'slot1', createGameState('错位', 'ai')), /模式/);
});

test('legacy save import is explicit and leaves the source untouched', () => {
  const legacy = JSON.stringify({ name: '旧身', realm: 2, exp: 45, spirit: 17 });
  const raw = memoryStorage({ luoying_save: legacy });
  const adapter = createStorage(raw);
  assert.equal(adapter.findLegacySave().player.name, '旧身');
  const imported = adapter.importLegacy('ai');
  assert.equal(imported.mode, 'ai');
  assert.equal(adapter.loadAuto('ai').player.name, '旧身');
  assert.equal(raw.getItem('luoying_save'), legacy);
});

test('journey export includes transcripts and strips credentials', async () => {
  const adapter = createStorage(memoryStorage());
  const transcripts = createTranscriptStore({ memory: new Map() });
  const state = createGameState('照月', 'ai', () => 'export-ai');
  state.apiKey = 'never-export-this';
  await transcripts.appendTurn(state.journeyId, {
    id: 'turn-1', kind: 'world', provider: 'groq', model: 'openai/gpt-oss-120b',
    blocks: [{ type: 'narr', text: '柴门外传来脚步声。' }]
  });
  const blob = await adapter.exportJourney('ai', state, transcripts);
  const bundle = JSON.parse(await blob.text());
  assert.equal(bundle.format, 'luoying-journey-v3');
  assert.equal(bundle.turns[0].blocks[0].text, '柴门外传来脚步声。');
  assert.doesNotMatch(await blob.text(), /never-export-this/);
});

test('journey import validates before replacing autosave or transcript archive', async () => {
  const raw = memoryStorage();
  const adapter = createStorage(raw);
  const transcripts = createTranscriptStore({ memory: new Map() });
  const current = createGameState('原身', 'ai', () => 'same-journey');
  adapter.saveAuto('ai', current);
  await transcripts.appendTurn(current.journeyId, { id: 'old', kind: 'world', blocks: [{ type: 'narr', text: '旧记录' }] });

  const incoming = createGameState('新身', 'ai', () => 'same-journey');
  const invalidBundle = JSON.stringify({
    format: 'luoying-journey-v3', mode: 'ai', state: incoming,
    turns: [{ id: 'huge', kind: 'world', blocks: [{ type: 'narr', text: 'x'.repeat(101_000) }] }]
  });
  await assert.rejects(adapter.importJourney('ai', invalidBundle, transcripts), /过大/);
  assert.equal(adapter.loadAuto('ai').player.name, '原身');
  assert.equal((await transcripts.allTurns('same-journey'))[0].id, 'old');
});

test('journey import restores state and its complete archive', async () => {
  const adapter = createStorage(memoryStorage());
  const transcripts = createTranscriptStore({ memory: new Map() });
  const incoming = createGameState('归档身', 'ai', () => 'import-ai');
  const bundle = JSON.stringify({
    format: 'luoying-journey-v3', mode: 'ai', state: incoming,
    turns: [{ id: 'turn-1', kind: 'world', blocks: [{ type: 'dlg', name: '林小满', text: '你终于回来了。' }] }]
  });
  const restored = await adapter.importJourney('ai', bundle, transcripts);
  assert.equal(restored.player.name, '归档身');
  assert.equal(adapter.loadAuto('ai').journeyId, 'import-ai');
  assert.equal((await transcripts.allTurns('import-ai'))[0].blocks[0].name, '林小满');
});

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

test('conditional autosave refuses to overwrite a different journey', async () => {
  const adapter = createStorage(memoryStorage());
  const first = createGameState('先行者', 'ai', () => 'journey-first');
  const stale = createGameState('迟到者', 'ai', () => 'journey-stale');
  adapter.saveAuto('ai', first);
  await assert.rejects(adapter.saveAutoIfJourney('ai', stale, 'journey-stale'), /另一窗口|已改变/);
  assert.equal(adapter.loadAuto('ai').journeyId, 'journey-first');
});

test('conditional autosave rejects a stale tab on the same journey revision', async () => {
  const adapter = createStorage(memoryStorage());
  const original = createGameState('同路人', 'ai', () => 'shared-journey');
  adapter.saveAuto('ai', original);
  const tabA = structuredClone(adapter.loadAuto('ai'));
  const tabB = structuredClone(adapter.loadAuto('ai'));
  tabA.player.gold = 10;
  const committedA = await adapter.saveAutoIfJourney('ai', tabA, tabA.journeyId, tabA.revision);
  assert.equal(committedA.revision, tabA.revision + 1);
  tabB.player.gold = 99;
  await assert.rejects(adapter.saveAutoIfJourney('ai', tabB, tabB.journeyId, tabB.revision), /修订|另一窗口|已改变/);
  assert.equal(adapter.loadAuto('ai').player.gold, 10);
});

test('conditional AI autosaves request one origin-wide exclusive lock', async () => {
  const calls = [];
  let tail = Promise.resolve();
  const lockManager = {
    request(name, options, callback) {
      calls.push({ name, options });
      const running = tail.then(callback);
      tail = running.catch(() => {});
      return running;
    }
  };
  const adapter = createStorage(memoryStorage(), { lockManager });
  const original = createGameState('并发身', 'ai', () => 'locked-journey');
  adapter.saveAuto('ai', original);
  const tabA = structuredClone(adapter.loadAuto('ai'));
  const tabB = structuredClone(adapter.loadAuto('ai'));
  tabA.player.gold = 11;
  tabB.player.gold = 22;
  const results = await Promise.allSettled([
    adapter.saveAutoIfJourney('ai', tabA, tabA.journeyId, tabA.revision),
    adapter.saveAutoIfJourney('ai', tabB, tabB.journeyId, tabB.revision)
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.name === 'luoying:v3:ai:autosave' && call.options.mode === 'exclusive'));
});

test('journal finalization cannot clear a different transaction', async () => {
  const adapter = createStorage(memoryStorage());
  const original = createGameState('守卷人', 'ai', () => 'journal-journey');
  adapter.saveAuto('ai', original);
  const journaled = structuredClone(original);
  journaled.transactionJournal = {
    type: 'ai-world-turn',
    turn: { id: 'tx-owner', kind: 'world', blocks: [{ type: 'narr', text: '本回合已落笔。' }] }
  };
  const prepared = await adapter.saveAutoIfJourney(
    'ai', journaled, original.journeyId, original.revision
  );
  const finalized = { ...prepared, transactionJournal: null };
  await assert.rejects(
    adapter.saveAutoIfJourney('ai', finalized, prepared.journeyId, prepared.revision, 'tx-stranger'),
    /待写回合|另一窗口|事务/
  );
  assert.equal(adapter.loadAuto('ai').transactionJournal.turn.id, 'tx-owner');
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

test('legacy manual slot keys are discovered and migrated into matching slots', () => {
  const legacySlot = JSON.stringify({ name: '旧命簿', realm: 3, exp: 19, spirit: 12 });
  const raw = memoryStorage({ luoying_slot1_data: legacySlot });
  const adapter = createStorage(raw);
  assert.equal(adapter.findLegacySave().player.name, '旧命簿');
  adapter.importLegacy('local');
  assert.equal(adapter.loadSlot('local', 'slot1').player.name, '旧命簿');
  assert.equal(raw.getItem('luoying_slot1_data'), legacySlot);
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
  assert.notEqual(adapter.loadAuto('ai').journeyId, 'import-ai');
  assert.equal((await transcripts.allTurns(restored.journeyId))[0].blocks[0].name, '林小满');
  assert.deepEqual(await transcripts.allTurns('import-ai'), []);
});

test('manual journey slots fork a transcript snapshot instead of sharing future history', async () => {
  let id = 0;
  const adapter = createStorage(memoryStorage(), { idFactory: () => `slot-copy-${++id}` });
  const transcripts = createTranscriptStore({ memory: new Map() });
  const live = createGameState('照月', 'ai', () => 'live-journey');
  await transcripts.appendTurn(live.journeyId, { id: 'before-save', kind: 'world', blocks: [{ type: 'narr', text: '存档前' }] });
  const snapshot = await adapter.saveJourneySlot('ai', 'slot1', live, transcripts);
  await transcripts.appendTurn(live.journeyId, { id: 'after-save', kind: 'world', blocks: [{ type: 'narr', text: '存档后' }] });
  assert.equal(snapshot.journeyId, 'slot-copy-1');
  assert.deepEqual((await transcripts.allTurns(snapshot.journeyId)).map((turn) => turn.id), ['before-save']);
  assert.deepEqual((await transcripts.allTurns(live.journeyId)).map((turn) => turn.id), ['before-save', 'after-save']);
});

test('loading a manual AI slot activates its branch for the next conditional autosave', async () => {
  let id = 0;
  const adapter = createStorage(memoryStorage(), { idFactory: () => `branch-${++id}` });
  const transcripts = createTranscriptStore({ memory: new Map() });
  const live = createGameState('照月', 'ai', () => 'live-main');
  adapter.saveAuto('ai', live);
  const snapshot = await adapter.saveJourneySlot('ai', 'slot1', live, transcripts);
  live.player.gold = 88;
  adapter.saveAuto('ai', live);
  const activated = adapter.activateSlotAsAuto('ai', 'slot1');
  activated.player.gold = 3;
  await assert.doesNotReject(adapter.saveAutoIfJourney('ai', activated, snapshot.journeyId));
  assert.equal(adapter.loadAuto('ai').journeyId, snapshot.journeyId);
  assert.equal(adapter.loadAuto('ai').player.gold, 3);
});

test('import always rekeys a journey and cannot replace an existing transcript with the same id', async () => {
  const adapter = createStorage(memoryStorage(), { idFactory: () => 'safe-import-copy' });
  const transcripts = createTranscriptStore({ memory: new Map() });
  await transcripts.appendTurn('collision', { id: 'existing', kind: 'world', blocks: [{ type: 'narr', text: '不可覆盖' }] });
  const incoming = createGameState('归来者', 'ai', () => 'collision');
  const restored = await adapter.importJourney('ai', JSON.stringify({
    format: 'luoying-journey-v3', mode: 'ai', state: incoming,
    turns: [{ id: 'incoming', kind: 'world', blocks: [{ type: 'narr', text: '导入内容' }] }]
  }), transcripts);
  assert.equal(restored.journeyId, 'safe-import-copy');
  assert.equal((await transcripts.allTurns('collision'))[0].blocks[0].text, '不可覆盖');
  assert.equal((await transcripts.allTurns('safe-import-copy'))[0].blocks[0].text, '导入内容');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createStorage } from '../public/luoying-xiantu/storage.js';

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

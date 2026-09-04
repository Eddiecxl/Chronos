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
  const state = createGameState('云舟');
  state.player.gold = 73;
  state.battle = { enemyId: 'wolf' };
  adapter.saveAuto(state);
  const loaded = adapter.loadAuto();
  assert.equal(loaded.player.name, '云舟');
  assert.equal(loaded.player.gold, 73);
  assert.equal(loaded.battle, null);
});

test('manual slot metadata describes the saved journey', () => {
  const adapter = createStorage(memoryStorage());
  const state = createGameState('折枝');
  state.story.act = 3;
  state.story.location = '青岚秘境';
  adapter.saveSlot('slot2', state);
  assert.deepEqual(adapter.getSlotMeta('slot2'), {
    name: '折枝', realm: 0, act: 3, location: '青岚秘境', day: 1,
    savedAt: adapter.getSlotMeta('slot2').savedAt
  });
});

test('import validates before replacing the current autosave', async () => {
  const storage = memoryStorage();
  const adapter = createStorage(storage);
  adapter.saveAuto(createGameState('原身'));
  await assert.rejects(() => adapter.importState('{"player":{"name":"<script>"}}'), /存档/);
  assert.equal(adapter.loadAuto().player.name, '原身');
});

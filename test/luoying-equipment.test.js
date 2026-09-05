import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { equipOwnedItem } from '../public/luoying-xiantu/equipment.js';
import { createStorage } from '../public/luoying-xiantu/storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('equipping an owned item changes only its equipment slot', () => {
  const state = createGameState('照月', 'ai');
  state.inventory.items['踏云履'] = 1;
  state.story.minuteOfDay = 720;
  state.memory.turnCount = 4;
  state.director.dangerClocks.zhaoPursuit = 3;

  const equipped = equipOwnedItem(state, '踏云履');

  assert.equal(equipped.equipment.slots.feet, '踏云履');
  assert.equal(equipped.story.minuteOfDay, 720);
  assert.equal(equipped.memory.turnCount, 4);
  assert.equal(equipped.director.dangerClocks.zhaoPursuit, 3);
  assert.throws(() => equipOwnedItem(state, '问天剑'), /尚未持有/);
});

test('AI equipment conditional save advances revision without world progress', async () => {
  const adapter = createStorage(memoryStorage());
  const original = createGameState('照月', 'ai', () => 'gear-journey');
  original.inventory.items['踏云履'] = 1;
  original.story.minuteOfDay = 720;
  original.memory.turnCount = 4;
  adapter.saveAuto('ai', original);

  const candidate = equipOwnedItem(original, '踏云履');
  const saved = await adapter.saveAutoIfJourney('ai', candidate, original.journeyId, original.revision);

  assert.equal(saved.revision, original.revision + 1);
  assert.equal(saved.story.minuteOfDay, 720);
  assert.equal(saved.memory.turnCount, 4);
  assert.equal(saved.equipment.slots.feet, '踏云履');
});

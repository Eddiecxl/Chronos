import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { equipOwnedItem } from '../public/luoying-xiantu/equipment.js';

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

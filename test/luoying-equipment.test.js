import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { commitAiEquipment, commitAiEquipmentForActiveJourney, equipOwnedItem, normalizeEquipment, restoreAiEquipmentState } from '../public/luoying-xiantu/equipment.js';
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

test('AI equipment refuses to write while battle state exists', async () => {
  const source = createGameState('照月', 'ai', () => 'battle-gear');
  source.inventory.items['踏云履'] = 1;
  source.battle = { enemyId: 'wolf', hp: 23 };
  let writes = 0;
  const storage = { saveAutoIfJourney: async () => { writes += 1; } };

  await assert.rejects(commitAiEquipment(storage, source, '踏云履'), /战斗/);
  assert.equal(writes, 0);
  assert.deepEqual(source.battle, { enemyId: 'wolf', hp: 23 });
});

test('low-level AI equipment rejects battle and pending states while local equipment remains unchanged', () => {
  const battle = createGameState('照月', 'ai', () => 'battle-direct-gear');
  battle.pending = null;
  battle.inventory.items['踏云履'] = 1;
  battle.battle = { enemyId: 'wolf', hp: 23 };
  assert.throws(() => equipOwnedItem(battle, '踏云履', 'ai'), /战斗/);

  const pending = createGameState('照月', 'ai', () => 'pending-direct-gear');
  pending.pending = { type: 'intro-escape' };
  pending.inventory.items['踏云履'] = 1;
  assert.throws(() => equipOwnedItem(pending, '踏云履', 'ai'), /进行|待处理/);

  const local = createGameState('照月', 'local', () => 'local-direct-gear');
  local.pending = { type: 'intro-escape' };
  local.battle = { enemyId: 'wolf', hp: 23 };
  local.inventory.items['踏云履'] = 1;
  assert.equal(equipOwnedItem(local, '踏云履', 'local').equipment.slots.feet, '踏云履');
});

test('AI equipment refuses pending state before it mutates or saves', async () => {
  const source = createGameState('照月', 'ai', () => 'pending-gear');
  source.pending = { type: 'intro-escape' };
  source.inventory.items['踏云履'] = 1;
  let writes = 0;

  assert.throws(() => equipOwnedItem(source, '踏云履'), /进行|待处理/);
  await assert.rejects(commitAiEquipment({ saveAutoIfJourney: async () => { writes += 1; } }, source, '踏云履'), /进行|待处理/);
  assert.equal(writes, 0);
  assert.equal(source.equipment.slots.feet, null);
});

test('equipment normalization tolerates null legacy payloads', () => {
  assert.deepEqual(normalizeEquipment(null).slots, {
    head: null, neck: null, body: null, arms: null, hands: null, legs: null, feet: null
  });
});

test('a stale equipment tab restores the authoritative autosave after a revision conflict', async () => {
  const adapter = createStorage(memoryStorage());
  const original = createGameState('照月', 'ai', () => 'stale-gear');
  original.inventory.items['踏云履'] = 1;
  original.inventory.items['逐风靴'] = 1;
  adapter.saveAuto('ai', original);
  const firstTab = structuredClone(adapter.loadAuto('ai'));
  const staleTab = structuredClone(adapter.loadAuto('ai'));
  const committed = await commitAiEquipment(adapter, firstTab, '踏云履');

  await assert.rejects(commitAiEquipment(adapter, staleTab, '逐风靴'), /修订|另一窗口|已改变/);
  const recovered = restoreAiEquipmentState(adapter, staleTab);

  assert.equal(recovered.revision, committed.revision);
  assert.equal(recovered.equipment.slots.feet, '踏云履');
  assert.equal(adapter.loadAuto('ai').equipment.slots.feet, '踏云履');
});

test('equipment recovery never replaces one journey with a different autosave journey', () => {
  const adapter = createStorage(memoryStorage());
  const original = createGameState('甲', 'ai', () => 'journey-a');
  const otherJourney = createGameState('乙', 'ai', () => 'journey-b');
  otherJourney.inventory.items['踏云履'] = 1;
  adapter.saveAuto('ai', otherJourney);

  const recovered = restoreAiEquipmentState(adapter, original);

  assert.equal(recovered.journeyId, 'journey-a');
  assert.equal(recovered.player.name, '甲');
});

test('an equipment save completing after the active journey changes cannot overwrite it', async () => {
  const source = createGameState('甲', 'ai', () => 'journey-a');
  source.inventory.items['踏云履'] = 1;
  const otherJourney = createGameState('乙', 'ai', () => 'journey-b');
  let active = source;
  let releaseSave;
  const storage = {
    saveAutoIfJourney: () => new Promise((resolve) => { releaseSave = () => resolve(equipOwnedItem(source, '踏云履')); })
  };

  const pendingSave = commitAiEquipmentForActiveJourney(storage, source, '踏云履', () => active);
  active = otherJourney;
  releaseSave();

  assert.equal(await pendingSave, null);
  assert.equal(active.journeyId, 'journey-b');
});

test('AI equipment transaction allows switching between two owned items in one slot', async () => {
  const adapter = createStorage(memoryStorage());
  const source = createGameState('照月', 'ai', () => 'switch-gear');
  source.inventory.items['踏云履'] = 1;
  source.inventory.items['逐风靴'] = 1;
  adapter.saveAuto('ai', source);

  const first = await commitAiEquipment(adapter, source, '踏云履');
  const second = await commitAiEquipment(adapter, first, '逐风靴');

  assert.equal(first.equipment.slots.feet, '踏云履');
  assert.equal(second.equipment.slots.feet, '逐风靴');
  assert.equal(second.revision, source.revision + 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { applyValidatedEffects, dispatchLocalAction, getAvailableActions } from '../public/luoying-xiantu/game-engine.js';

test('the intro can enter the sect without AI', () => {
  let state = createGameState('沈桃');
  for (const input of ['我叫沈桃', '推开柴门', '帮助林小满', '接受李老传功', '前往落霞宗']) {
    state = dispatchLocalAction(state, input, () => 0.2).state;
  }
  assert.equal(state.story.location, '落霞宗外门');
  assert.ok(state.quests.active.some((quest) => quest.id === 'outer-trial'));
});

test('AI effects cannot invent items or excessive rewards', () => {
  const state = applyValidatedEffects(createGameState(), {
    gold: 999999,
    hp: -999,
    addItems: { '管理员之剑': 1 },
    location: '源代码后台'
  });
  assert.equal(state.player.gold, 100);
  assert.equal(state.player.hp, 20);
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
  assert.ok(result.state.endings.unlocked.includes('guardian'));
});

test('battle actions defeat a weakened enemy and grant progress', () => {
  const state = createGameState();
  state.pending = null;
  state.player.attack = 30;
  state.battle = { enemyId: 'spirit-rat', hp: 8, maxHp: 8, defending: false, turn: 1 };
  const result = dispatchLocalAction(state, '攻击', () => 0);
  assert.equal(result.state.battle, null);
  assert.equal(result.state.stats.battlesWon, 1);
  assert.ok(result.state.player.exp > 0);
});

test('suggestions reflect the current interaction state', () => {
  const state = createGameState();
  state.pending = null;
  state.battle = { enemyId: 'spirit-rat', hp: 10, maxHp: 10, defending: false, turn: 1 };
  const labels = getAvailableActions(state).map((action) => action.label);
  assert.deepEqual(labels.slice(0, 3), ['攻击', '施展功法', '防御']);
});

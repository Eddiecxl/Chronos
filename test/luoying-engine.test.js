import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { applyValidatedEffects, dispatchLocalChoice, getAvailableActions } from '../public/luoying-xiantu/game-engine.js';

test('the local intro enters the sect through stable choice ids', () => {
  let state = createGameState('沈桃', 'local');
  for (const choiceId of ['intro:open-door', 'intro:help-xiaoman', 'intro:accept-teaching', 'intro:travel-sect']) {
    state = dispatchLocalChoice(state, choiceId, () => 0.2).state;
  }
  assert.equal(state.story.location, '落霞宗外门');
  assert.ok(state.quests.active.some((quest) => quest.id === 'outer-trial'));
});

test('local mode rejects anything that is not an offered choice id', () => {
  const state = createGameState('沈桃', 'local');
  const before = structuredClone(state);
  const result = dispatchLocalChoice(state, '我要瞬移到仙界', () => 0);

  assert.equal(result.autosave, false);
  assert.deepEqual(result.state, before);
  assert.equal(result.state.pending?.type, 'intro-escape');
  assert.ok(getAvailableActions(state).some((action) => action.id === 'intro:open-door'));
});

test('AI effects cannot invent items or excessive rewards', () => {
  const state = applyValidatedEffects(createGameState('顾长生', 'ai'), {
    gold: 999999,
    hp: -999,
    qi: 999999,
    spirit: -999,
    addItems: { '管理员之剑': 1 },
    location: '源代码后台'
  });
  assert.equal(state.player.gold, 100);
  assert.equal(state.player.hp, 20);
  assert.equal(state.player.realm, 2);
  assert.equal(state.player.qi, 10);
  assert.equal(state.player.spirit, 0);
  assert.equal(state.inventory.items['管理员之剑'], undefined);
  assert.equal(state.story.location, '赵府柴房');
});

test('mercy path unlocks the guardian ending', () => {
  const state = createGameState();
  state.pending = { type: 'final-choice' };
  state.story.act = 5;
  state.player.realm = 22;
  state.karma.mercy = 8;
  state.story.flags.savedSect = true;
  const result = dispatchLocalChoice(state, 'ending:guardian', () => 0.1);
  assert.equal(result.ending.id, 'guardian');
  assert.ok(result.state.endings.unlocked.includes('guardian'));
});

test('battle actions defeat a weakened enemy and grant qi', () => {
  const state = createGameState();
  state.pending = null;
  state.player.attack = 30;
  state.battle = { enemyId: 'spirit-rat', hp: 8, maxHp: 8, defending: false, turn: 1 };
  const result = dispatchLocalChoice(state, 'battle:attack', () => 0);
  assert.equal(result.state.battle, null);
  assert.equal(result.state.stats.battlesWon, 1);
  assert.ok(result.state.player.qi > 0);
  assert.equal('exp' in result.state.player, false);
});

test('techniques consume spirit while cultivation raises qi', () => {
  let state = createGameState();
  state.pending = null;
  state.player.realm = 1;
  state.player.qi = 0;
  state.player.spirit = 30;
  state.techniques.known = ['吐纳诀', '落霞掌'];
  state.techniques.equipped = ['吐纳诀', '落霞掌'];

  state = dispatchLocalChoice(state, 'train:meditate', () => 0).state;
  assert.ok(state.player.qi > 0);
  assert.equal(state.player.spirit, 30);

  state.battle = { enemyId: 'mountain-wolf', hp: 58, maxHp: 58, defending: false, turn: 1 };
  const result = dispatchLocalChoice(state, 'battle:technique:落霞掌', () => 0);
  assert.ok(result.state.player.spirit < 30);
});

test('suggestions expose ids and reflect the current interaction state', () => {
  const state = createGameState();
  state.pending = null;
  state.player.realm = 1;
  state.techniques.known = ['吐纳诀', '落霞掌'];
  state.techniques.equipped = ['吐纳诀', '落霞掌'];
  state.battle = { enemyId: 'spirit-rat', hp: 10, maxHp: 10, defending: false, turn: 1 };
  const actions = getAvailableActions(state);
  assert.deepEqual(actions.slice(0, 3).map((action) => action.label), ['攻击', '落霞掌', '防御']);
  assert.deepEqual(actions.slice(0, 3).map((action) => action.id), ['battle:attack', 'battle:technique:落霞掌', 'battle:defend']);
});

test('a healing pill restores health through its inventory choice', () => {
  const state = createGameState();
  state.pending = null;
  state.player.hp = 40;
  const result = dispatchLocalChoice(state, 'item:use:回春丹', () => 0.5);
  assert.equal(result.state.player.hp, 75);
  assert.equal(result.state.inventory.items['回春丹'], undefined);
});

test('owned equipment can be equipped through its inventory choice', () => {
  const state = createGameState();
  state.pending = null;
  state.inventory.items['玄铁剑'] = 1;
  const result = dispatchLocalChoice(state, 'item:equip:玄铁剑', () => 0.5);
  assert.equal(result.state.equipment.weapon, '玄铁剑');
});

test('alchemy consumes herbs and creates a pill through a recipe choice', () => {
  const state = createGameState();
  state.pending = null;
  state.inventory.items['止血草'] = 2;
  state.inventory.items['凝露花'] = 1;
  const result = dispatchLocalChoice(state, 'alchemy:回春丹', () => 0.1);
  assert.equal(result.state.inventory.items['止血草'], undefined);
  assert.equal(result.state.inventory.items['凝露花'], undefined);
  assert.equal(result.state.inventory.items['回春丹'], 2);
  assert.equal(result.state.stats.pillsCrafted, 1);
});

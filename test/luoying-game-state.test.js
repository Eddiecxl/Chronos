import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, migrateGameState, validateImportedState } from '../public/luoying-xiantu/game-state.js';

test('new games have a fixed mode and separate qi and spirit pools', () => {
  const state = createGameState('照月', 'ai', () => 'journey-ai');
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.mode, 'ai');
  assert.equal(state.journeyId, 'journey-ai');
  assert.equal(state.player.qi, 0);
  assert.equal(state.player.spirit, state.player.maxSpirit);
  assert.equal(state.player.exp, undefined);
  assert.deepEqual(state.quests.active, []);
  assert.equal(state.player.realm, 0);
  assert.equal(state.story.act, 1);
  assert.equal(state.settings.difficulty, 'normal');
});

test('v1 save keeps progress and gains new fields', () => {
  const state = migrateGameState({
    name: '旧梦', realm: 4, hp: 61, gold: 88, exp: 20,
    flags: { metLi: true }, aff: { '李老': 17 }
  }, 'local');
  assert.equal(state.player.name, '旧梦');
  assert.equal(state.mode, 'local');
  assert.equal(state.player.realm, 4);
  assert.equal(state.player.qi, 20);
  assert.equal(state.relationships['李老'], 17);
  assert.equal(state.story.flags.metLi, true);
  assert.ok(Array.isArray(state.achievements.unlocked));
});

test('v2 exp migrates to qi without changing spell spirit', () => {
  const state = migrateGameState({
    schemaVersion: 2,
    player: { name: '旧梦', realm: 4, hp: 61, maxHp: 140, exp: 77, spirit: 19 },
    story: { act: 2, day: 8, location: '青石镇' },
    memory: { summary: '曾在青石镇救过一名药童。', facts: ['药童平安'] }
  }, 'local');
  assert.equal(state.mode, 'local');
  assert.equal(state.player.qi, 77);
  assert.equal(state.player.spirit, 19);
  assert.equal(state.player.maxSpirit, 30);
  assert.equal(state.memory.chapterSummaries.legacy, '曾在青石镇救过一名药童。');
});

test('a save cannot load into the other mode', () => {
  const state = createGameState('照月', 'ai');
  assert.throws(() => migrateGameState(state, 'local'), /模式/);
});

test('invalid imported saves are rejected without evaluation', () => {
  assert.throws(
    () => validateImportedState({ schemaVersion: 3, mode: 'local', player: { name: '<script>' } }, 'local'),
    /存档/
  );
});

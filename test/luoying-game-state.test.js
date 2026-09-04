import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, migrateGameState, validateImportedState } from '../public/luoying-xiantu/game-state.js';

test('new game has complete versioned collections', () => {
  const state = createGameState('顾长生');
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.quests.active, []);
  assert.equal(state.player.realm, 0);
  assert.equal(state.story.act, 1);
  assert.equal(state.settings.difficulty, 'normal');
});

test('v1 save keeps progress and gains new fields', () => {
  const state = migrateGameState({
    name: '旧梦', realm: 4, hp: 61, gold: 88, exp: 20,
    flags: { metLi: true }, aff: { '李老': 17 }
  });
  assert.equal(state.player.name, '旧梦');
  assert.equal(state.player.realm, 4);
  assert.equal(state.relationships['李老'], 17);
  assert.equal(state.story.flags.metLi, true);
  assert.ok(Array.isArray(state.achievements.unlocked));
});

test('invalid imported saves are rejected without evaluation', () => {
  assert.throws(
    () => validateImportedState({ schemaVersion: 2, player: { name: '<script>' } }),
    /存档/
  );
});

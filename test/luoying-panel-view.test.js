import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import {
  buildCharacterView,
  buildCodexView,
  buildInventoryView,
  buildLocalMapView,
  buildMapView,
  buildQuestView
} from '../public/luoying-xiantu/panel-view.js';

test('new AI panel views expose current knowledge but no future catalog', () => {
  const state = createGameState('照月', 'ai', () => 'panels-new');
  const character = buildCharacterView(state);
  const map = buildMapView(state);
  const codex = buildCodexView(state);

  assert.equal(character.name, '照月');
  assert.deepEqual(character.relationships, []);
  assert.deepEqual(map.map((entry) => entry.name), ['赵府柴房']);
  assert.deepEqual(codex.characters, []);
  assert.equal(JSON.stringify({ character, map, codex }).includes('飞升台'), false);
  assert.equal(JSON.stringify(codex).includes('/5'), false);
});

test('local map retains unlocked travel rows that are not in the progressive codex', () => {
  const state = createGameState('本地照月', 'local', () => 'local-map');
  state.story.act = 2;
  state.player.realm = 4;
  state.codex.locations = [state.story.location];

  const rows = buildLocalMapView(state);
  const market = rows.find((entry) => entry.name === '百宝坊市');

  assert.equal(market.unlocked, true);
  assert.equal(state.codex.locations.includes('百宝坊市'), false);
});

test('quest view retains completed work and reveals no future quest', () => {
  const state = createGameState('照月', 'ai', () => 'panels-quest');
  state.quests.completed = ['escape-zhao'];
  state.quests.active = [{ id: 'meet-elder', progress: 0, target: 1 }];
  const view = buildQuestView(state);

  assert.equal(view.completed[0].id, 'escape-zhao');
  assert.equal(view.active[0].id, 'meet-elder');
  assert.equal(JSON.stringify(view).includes('outer-trial'), false);
});

test('inventory and codex only enrich committed discovery sources', () => {
  const state = createGameState('照月', 'ai', () => 'panels-discovered');
  state.inventory.items['问天剑'] = 1;
  state.inventory.items['止血草'] = 2;
  state.codex.items = ['止血草'];
  state.codex.characters = ['林小满'];
  state.relationships['林小满'] = 12;
  state.relationships['赵天霸'] = -10;

  assert.deepEqual(buildInventoryView(state).map((entry) => entry.name), ['止血草']);
  assert.deepEqual(buildCharacterView(state).relationships.map((entry) => entry.name), ['林小满']);
  assert.equal(JSON.stringify(buildCodexView(state)).includes('赵天霸'), false);
});

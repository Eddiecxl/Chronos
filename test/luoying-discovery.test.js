import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { applyCommittedDiscoveries, visibleTextFor } from '../public/luoying-xiantu/discovery.js';

test('visible text joins only narration block names and text', () => {
  const narration = {
    blocks: [
      { type: 'narr', text: '雨落在瓦上。' },
      { type: 'dlg', name: '白芷', text: '先别动。' }
    ]
  };

  assert.equal(visibleTextFor(narration), '雨落在瓦上。\n白芷先别动。');
});

test('contract actors and invisible entity candidates do not unlock spoilers', () => {
  const state = createGameState('照月', 'ai', () => 'discover-none');
  state.memory.entities['npc:hidden'] = {
    id: 'npc:hidden', kind: 'npc', name: '未来宗主', status: 'alive', location: '天机台'
  };

  const next = applyCommittedDiscoveries(state, {
    blocks: [{ type: 'narr', text: '我只看见柴房门上的旧锁。' }]
  });

  assert.deepEqual(next.codex.characters, []);
  assert.deepEqual(next.codex.locations, ['赵府柴房']);
});

test('visible dialogue and committed rewards unlock only what the player experienced', () => {
  const state = createGameState('照月', 'ai', () => 'discover-real');
  state.memory.entities['generated:npc:doctor'] = {
    id: 'generated:npc:doctor', kind: 'npc', name: '白芷', status: 'alive', location: '赵府柴房'
  };
  state.inventory.items['云纹束冠'] = 1;
  state.story.location = '青石镇';

  const next = applyCommittedDiscoveries(state, {
    blocks: [{ type: 'dlg', name: '白芷', text: '先别动。' }]
  });

  assert.deepEqual(next.codex.characters, ['白芷']);
  assert.ok(next.codex.locations.includes('青石镇'));
  assert.ok(next.codex.items.includes('云纹束冠'));
  assert.equal(next.codex.characters.includes('林小满'), false);
});

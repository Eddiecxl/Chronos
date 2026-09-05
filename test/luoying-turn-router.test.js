import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { answerSystemQuery, classifyTurn } from '../public/luoying-xiantu/turn-router.js';

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'pause-journey');
  state.story.day = 4;
  state.story.minuteOfDay = 780;
  state.player.qi = 18;
  state.player.realm = 2;
  state.battle = { enemyId: 'spirit-rat', hp: 20, maxHp: 28, turn: 2, defending: false };
  state.relationships['林小满'] = 27;
  state.codex.characters = ['林小满'];
  state.memory.chapterSummaries['act1-awakening'] = '照月从赵府柴房逃出，救下林小满。';
  state.memory.facts.push({
    id: 'fact:promise', subjectId: 'npc:lin-xiaoman', predicate: 'promised', object: '一起调查后山',
    sourceTurnId: 'turn-3', createdAtTurn: 3, locked: false
  });
  return state;
}

test('panels slash commands and system channel always pause time', () => {
  assert.equal(classifyTurn({ mode: 'ai', channel: 'system', input: '林小满现在信任我吗' }).kind, 'system');
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '/技能' }).kind, 'system');
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '查看我的面板' }).kind, 'system');
});

test('speaking to an NPC remains a world turn even when asking about a skill', () => {
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '我对林小满说，今晚一起去后山吧' }).kind, 'world');
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '我问李老，这门技能是谁创的' }).kind, 'world');
});

test('mixed system and world intent is left ambiguous', () => {
  assert.equal(classifyTurn({ mode: 'ai', channel: 'world', input: '查看面板然后继续赶路' }).kind, 'ambiguous');
});

test('free text is never accepted by local mode', () => {
  assert.equal(classifyTurn({ mode: 'local', channel: 'world', input: '随便走走' }).kind, 'ambiguous');
  assert.equal(classifyTurn({ mode: 'local', channel: 'choice', input: 'train:meditate' }).kind, 'local-choice');
});

test('system answers leave time combat and NPC plans untouched', () => {
  const state = seededAiState();
  const before = JSON.stringify(state);
  const answer = answerSystemQuery(state, '突破还差多少灵气');
  assert.equal(answer.handled, true);
  assert.match(answer.blocks[0].text, /灵气/);
  assert.equal(JSON.stringify(state), before);
});

test('system answers cover skills inventory relationships location and recap with sys blocks only', () => {
  const state = seededAiState();
  const queries = ['我的技能', '查看背包', '林小满信任我吗', '我在哪里', '回顾之前发生的事'];
  for (const query of queries) {
    const answer = answerSystemQuery(state, query);
    assert.equal(answer.handled, true, query);
    assert.ok(answer.blocks.length > 0, query);
    assert.ok(answer.blocks.every((block) => block.type === 'sys'), query);
  }
  assert.match(answerSystemQuery(state, '林小满信任我吗').blocks[0].text, /27/);
  assert.match(answerSystemQuery(state, '人物关系').blocks[0].text, /林小满 27/);
  assert.match(answerSystemQuery(state, '回顾之前发生的事').blocks.map((block) => block.text).join(''), /柴房|后山/);
});

test('system panel answers do not enumerate people or places that were not discovered', () => {
  const state = createGameState('照月', 'ai', () => 'spoiler-free-router');
  state.relationships['林小满'] = 27;
  const relation = answerSystemQuery(state, '人物关系').blocks[0].text;
  const map = answerSystemQuery(state, '地图').blocks[0].text;
  const inventory = answerSystemQuery(state, '背包').blocks[0].text;

  assert.doesNotMatch(relation, /林小满|赵天霸/);
  assert.doesNotMatch(map, /青石镇|飞升台|已解锁/);
  assert.doesNotMatch(inventory, /\d+\/\d+/);
});

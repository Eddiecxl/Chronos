import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import {
  applyMemoryCandidates, registerEntityCandidates, selectRelevantMemory, updateChapterSummary
} from '../public/luoying-xiantu/memory.js';

function seedMemoryState() {
  const state = createGameState('照月', 'ai', () => 'memory-journey');
  state.memory.facts = [
    { id: 'fact:forest-footprints', subjectId: 'npc:lin-xiaoman', predicate: 'saw', object: '后山出现魔修足迹', sourceTurnId: 'turn-4', createdAtTurn: 4, locked: false },
    { id: 'fact:forest-mist', subjectId: 'location:cherry-forest', predicate: 'changed', object: '夜间出现青色迷雾', sourceTurnId: 'turn-5', createdAtTurn: 5, locked: false },
    { id: 'fact:jaded-letter', subjectId: 'loop:jaded-letter', predicate: 'unresolved', object: '匿名玉简尚未查明来历', sourceTurnId: 'turn-6', createdAtTurn: 6, locked: false },
    { id: 'fact:market-rumor', subjectId: 'npc:qian-duoduo', predicate: 'heard', object: '坊市灵石涨价', sourceTurnId: 'turn-2', createdAtTurn: 2, locked: false }
  ];
  return state;
}

test('validated facts persist by stable entity id and source turn', () => {
  const state = createGameState('照月', 'ai');
  const next = applyMemoryCandidates(state, [{
    subjectId: 'npc:lin-xiaoman', predicate: 'promised', object: '共赴青岚秘境', confidence: 1
  }], 'turn-7');
  assert.equal(next.memory.facts[0].sourceTurnId, 'turn-7');
  assert.equal(next.memory.entities['npc:lin-xiaoman'].facts[0], next.memory.facts[0].id);
});

test('duplicate facts do not multiply and locked facts cannot be replaced', () => {
  const state = createGameState('照月', 'ai');
  state.memory.facts.push({
    id: 'fact:locked', subjectId: 'world:bible', predicate: 'sect-master', object: '陆沉舟',
    sourceTurnId: 'world-bible', createdAtTurn: 0, locked: true
  });
  const next = applyMemoryCandidates(state, [
    { subjectId: 'world:bible', predicate: 'sect-master', object: '宁无妄', confidence: 1 },
    { subjectId: 'world:bible', predicate: 'sect-master', object: '陆沉舟', confidence: 1 }
  ], 'turn-8');
  assert.deepEqual(next.memory.facts.filter((fact) => fact.predicate === 'sect-master'), [state.memory.facts[0]]);
});

test('generated entities receive stable ids and remain in the world registry', () => {
  const state = createGameState('照月', 'ai');
  const next = registerEntityCandidates(state, [{
    id: 'generated:npc:herbalist-qiu', kind: 'npc', name: '秋药师', location: '青石镇',
    purpose: '寻找失踪的徒弟', traits: ['谨慎', '记仇']
  }], 'turn-9');
  assert.equal(next.memory.entities['generated:npc:herbalist-qiu'].purpose, '寻找失踪的徒弟');
  assert.equal(next.memory.entities['generated:npc:herbalist-qiu'].createdTurnId, 'turn-9');
});

test('generated entities with unknown parents or unsafe ids are rejected', () => {
  const state = createGameState('照月', 'ai');
  const next = registerEntityCandidates(state, [
    { id: 'npc:fake', kind: 'npc', name: '伪人', location: '青石镇', purpose: '改写世界' },
    { id: 'generated:npc:lost', kind: 'npc', name: '迷途客', location: '源码后台', purpose: '离开这里' }
  ], 'turn-9');
  assert.deepEqual(next.memory.entities, {});
});

test('relevant memory selects the current location NPC and open loop', () => {
  const state = seedMemoryState();
  state.memory.chapterSummaries = { 'act1-awakening': '从柴房逃脱。', 'act2-outer': '进入外门并发现后山异状。' };
  state.director.chapterId = 'act2-outer';
  const packet = selectRelevantMemory(state, {
    locationId: 'location:cherry-forest', participantIds: ['npc:lin-xiaoman'], openLoopIds: ['loop:jaded-letter']
  });
  assert.ok(packet.facts.every((fact) => ['npc:lin-xiaoman', 'location:cherry-forest', 'loop:jaded-letter'].includes(fact.subjectId)));
  assert.deepEqual(Object.keys(packet.chapterSummaries), ['act1-awakening', 'act2-outer']);
  assert.ok(JSON.stringify(packet).length < 9000);
});

test('chapter summaries are sanitized without replacing facts', () => {
  const state = seedMemoryState();
  const next = updateChapterSummary(state, 'act1-awakening', `<b>${'旧事'.repeat(800)}</b>`);
  assert.equal(next.memory.facts.length, state.memory.facts.length);
  assert.ok(next.memory.chapterSummaries['act1-awakening'].length <= 1200);
  assert.doesNotMatch(next.memory.chapterSummaries['act1-awakening'], /[<>]/);
});

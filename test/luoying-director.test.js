import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { CHAPTERS, LOCATIONS, NPCS } from '../public/luoying-xiantu/game-data.js';
import {
  buildRepairMessages, commitValidatedWorldTurn, createSceneContract, validateAiWorldTurn
} from '../public/luoying-xiantu/director.js';

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'ai-journey');
  state.story.location = '后山樱林';
  state.director.chapterId = 'act2-forest-signs';
  state.director.sceneGoal = '查明后山异动并决定是否告知宗门';
  state.director.dangerClocks = { demonicTrail: 2 };
  state.director.openLoops = ['loop:demonic-trail'];
  state.memory.facts = [{
    id: 'fact:forest-footprints', subjectId: 'npc:lin-xiaoman', predicate: 'saw',
    object: '后山出现魔修足迹', sourceTurnId: 'turn-4', createdAtTurn: 4, locked: false
  }];
  state.memory.entities = {
    'npc:lin-xiaoman': {
      id: 'npc:lin-xiaoman', kind: 'npc', name: '林小满', status: 'alive', location: '后山樱林',
      purpose: '找出足迹来源', traits: ['嘴硬心软'], knownFactIds: ['fact:forest-footprints'],
      facts: ['fact:forest-footprints'], createdTurnId: 'world-bible', lastSeenTurn: 4
    }
  };
  return state;
}

function narrationWithText(text) {
  return {
    blocks: [{ type: 'narr', text }], effects: {},
    progress: { advanced: ['scene:new-information'], consequences: ['魔修察觉调查'], openLoops: ['loop:demonic-trail'] },
    memory: [], suggestions: ['拒绝邀请', '追问目的'], timeCost: 'brief'
  };
}

test('authored rails contain four complete chapters per act and stable world ids', () => {
  for (let act = 1; act <= 5; act += 1) assert.equal(CHAPTERS.filter((chapter) => chapter.act === act).length, 4);
  assert.ok(CHAPTERS.every((chapter) => chapter.id && chapter.goal && chapter.entry && chapter.dangerClock && Array.isArray(chapter.exits)));
  assert.ok(Object.values(NPCS).every((npc) => npc.id.startsWith('npc:')));
  assert.ok(Object.values(LOCATIONS).every((location) => location.id.startsWith('location:')));
});

test('scene contracts carry a goal danger clock and NPC knowledge', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我问林小满昨夜看见了什么', 'turn-8');
  assert.equal(contract.sceneGoal, state.director.sceneGoal);
  assert.ok(contract.dangerClocks.length > 0);
  assert.deepEqual(contract.actors.find((actor) => actor.id === 'npc:lin-xiaoman').knownFactIds, ['fact:forest-footprints']);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.actors), true);
});

test('a world response with no progress is rejected', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '继续交谈', 'turn-8');
  const result = validateAiWorldTurn(state, contract, {
    blocks: [{ type: 'dlg', name: '林小满', text: '我们再想想。' }],
    effects: {}, progress: { advanced: [], consequences: [], openLoops: [] },
    memory: [], suggestions: ['继续交谈'], timeCost: 'brief'
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /进展/.test(error)));
});

test('AI cannot speak or decide a critical action for the player', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '听对方解释', 'turn-8');
  const result = validateAiWorldTurn(state, contract, narrationWithText('你答应加入魔宗，并感到无比喜悦。'), []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /玩家/.test(error)));
});

test('dead actors and facts outside NPC knowledge are rejected', () => {
  const state = seededAiState();
  state.memory.entities['npc:lin-xiaoman'].status = 'dead';
  const contract = createSceneContract(state, '查看四周', 'turn-8');
  const narration = {
    ...narrationWithText('林间出现新的足迹。'),
    blocks: [{ type: 'dlg', name: '林小满', text: '我知道魔尊的真名。' }],
    usedFactIdsByActor: { 'npc:lin-xiaoman': ['fact:forbidden'] }
  };
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.ok(result.errors.some((error) => /死亡角色/.test(error)));
  assert.ok(result.errors.some((error) => /知识边界/.test(error)));
});

test('near-duplicate recent world turns are rejected as loops', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '继续追查', 'turn-8');
  const narration = narrationWithText('林间又出现一串新的魔修足迹，林小满俯身查看泥土。');
  const first = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(first.ok, true);
  const repeated = validateAiWorldTurn(state, contract, narration, [{ kind: 'world', fingerprint: first.fingerprint }]);
  assert.equal(repeated.ok, false);
  assert.ok(repeated.errors.some((error) => /重复|循环/.test(error)));
});

test('validated commits advance time clocks loops and authored chapters without local prose', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '把证据交给执事', 'turn-8');
  const narration = {
    blocks: [{ type: 'narr', text: '证据被送入戒律堂。' }],
    effects: { qi: 12, spirit: -4 },
    progress: {
      advanced: ['chapter:act2-forest-signs:complete'], consequences: ['宗门开始戒备'],
      openLoops: ['loop:masked-scout'], resolvedLoops: ['loop:demonic-trail'],
      dangerClocks: { demonicTrail: 1 }
    },
    memory: [], suggestions: ['追查内应', '先去疗伤'], timeCost: 'scene'
  };
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.story.minuteOfDay, state.story.minuteOfDay + 60);
  assert.equal(next.director.dangerClocks.demonicTrail, 3);
  assert.ok(next.director.openLoops.includes('loop:masked-scout'));
  assert.ok(!next.director.openLoops.includes('loop:demonic-trail'));
  assert.equal(next.director.chapterId, 'act2-sect-undercurrent');
  assert.equal(next.player.qi, 12);
});

test('repair messages contain validation errors and never invent replacement story', () => {
  const contract = createSceneContract(seededAiState(), '继续追查', 'turn-8');
  const broken = { blocks: [], suggestions: [] };
  const messages = buildRepairMessages(contract, broken, ['缺少进展']);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /缺少进展/);
  assert.doesNotMatch(messages.map((message) => message.content).join(''), /你走进|忽然出现/);
});

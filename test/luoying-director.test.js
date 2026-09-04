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
  assert.equal(contract.chapter.requiredDiscoveries[0].progressId, 'discovery:forest-footprints');
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

test('soft rails reject empty wandering but allow meaningful side routes and chapter exits', () => {
  const state = seededAiState();
  state.director.consecutiveIdleTurns = 2;
  const contract = createSceneContract(state, '继续调查附近支线', 'turn-rail');
  const wandering = narrationWithText('树下又找到一枚无关紧要的旧铜钱。');
  const rejected = validateAiWorldTurn(state, contract, wandering, []);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => /主线|章节/.test(error)));

  const sideRoute = {
    ...wandering,
    progress: { ...wandering.progress, advanced: ['quest:herb-basket:clue'] }
  };
  assert.equal(validateAiWorldTurn(state, contract, sideRoute, []).ok, true);

  const advancing = {
    ...wandering,
    progress: { ...wandering.progress, advanced: ['chapter:act2-forest-signs:complete'] }
  };
  assert.equal(validateAiWorldTurn(state, contract, advancing, []).ok, true);
});

test('authored discovery progress creates the stable fact required by a chapter exit', () => {
  const state = seededAiState();
  state.memory.facts = [];
  state.memory.entities['npc:lin-xiaoman'].knownFactIds = [];
  const contract = createSceneContract(state, '查清足迹并把证据交给宗门', 'turn-authored-fact');
  const narration = {
    ...narrationWithText('泥痕中的魔砂证明这串足迹来自魔修，证据随即送往戒律堂。'),
    progress: {
      advanced: ['discovery:forest-footprints', 'chapter:act2-forest-signs:complete'],
      consequences: ['戒律堂开始封锁后山'], openLoops: [], dangerClocks: { demonicTrail: 1 }
    }
  };
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.chapterId, 'act2-sect-undercurrent');
  assert.ok(next.memory.facts.some((fact) => fact.id === 'fact:forest-footprints'));
});

test('danger clocks enforce their authored limit and create a deterministic aftermath', () => {
  const state = seededAiState();
  state.director.dangerClocks.demonicTrail = 5;
  const contract = createSceneContract(state, '追踪魔气源头', 'turn-danger');
  const narration = {
    ...narrationWithText('魔气骤然冲破林间阵眼，巡山弟子被迫后撤。'),
    progress: {
      advanced: ['danger:demonicTrail:erupts'], consequences: ['阵眼破裂，魔修开始转移'],
      openLoops: [], dangerClocks: { demonicTrail: 1 }
    }
  };
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.dangerClocks.demonicTrail, 0);
  assert.ok(next.director.openLoops.some((loop) => loop.startsWith('danger:demonicTrail:aftermath:')));
});

test('every known NPC dialogue declares its fact citations even when none are used', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '询问林小满', 'turn-citations');
  const narration = {
    ...narrationWithText('林小满压低声音。'),
    blocks: [{ type: 'dlg', name: '林小满', text: '这件事得从昨夜说起。' }]
  };
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /知识来源|引用/.test(error)));
});

test('dead actors cannot re-enter active narration outside dialogue', () => {
  const state = seededAiState();
  state.memory.entities['npc:lin-xiaoman'].status = 'dead';
  const contract = createSceneContract(state, '查看林间', 'turn-dead-narration');
  const narration = narrationWithText('死去的林小满忽然出现，推开阵门并向众人招手。');
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /死亡角色/.test(error)));
});

test('an NPC cannot state forbidden knowledge with an empty block citation', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '询问魔尊身份', 'turn-empty-citation');
  const narration = {
    ...narrationWithText('林间风声骤停。'),
    blocks: [{ type: 'dlg', name: '林小满', text: '我知道魔尊真正的名字。', factIds: [] }],
    usedFactIdsByActor: { 'npc:lin-xiaoman': [] }
  };
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /事实|知识来源|引用/.test(error)));
});

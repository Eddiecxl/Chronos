import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { CHAPTERS, LOCATIONS, NPCS } from '../public/luoying-xiantu/game-data.js';
import { applyValidatedEffects } from '../public/luoying-xiantu/game-engine.js';
import { equipOwnedItem } from '../public/luoying-xiantu/equipment.js';
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
  state.codex.characters.push('林小满');
  return state;
}

test('AI scene contracts expose stacked equipped stats without changing persistent base stats', () => {
  let state = createGameState('照月', 'ai', () => 'derived-ai');
  for (const itemName of ['玄铁剑', '外门青衫', '云纹束冠', '踏云履']) {
    state.inventory.items[itemName] = 1;
    state = equipOwnedItem(state, itemName, 'ai');
  }

  const contract = createSceneContract(state, '我准备迎战', 'turn-derived');

  assert.deepEqual(
    { attack: contract.player.attack, defense: contract.player.defense, maxSpirit: contract.player.maxSpirit },
    { attack: 29, defense: 14, maxSpirit: 40 }
  );
  assert.deepEqual(
    { attack: state.player.attack, defense: state.player.defense, maxSpirit: state.player.maxSpirit },
    { attack: 11, defense: 4, maxSpirit: 30 }
  );
});

function narrationWithText(text) {
  const detailedText = `${text}我俯身拨开积在树根旁的湿叶，泥土里残留的痕迹被雨水冲成断续细线。风穿过樱林时带来一缕陌生焦味，我循着气味望向西侧石径，记下灯火移动的方向和枝叶折断的位置。这些变化让我有了可以继续追查的依据，却也意味着藏在暗处的人已经离得不远。`;
  return {
    blocks: [{ type: 'narr', text: detailedText }], effects: {},
    progress: {
      advanced: ['scene:new-information'], consequences: ['魔修察觉调查'],
      openLoops: ['loop:new-evidence'], dangerClocks: { demonicTrail: 1 }
    },
    memory: {
      facts: [{ subjectId: 'world:trail', predicate: 'changed', object: '樱林西侧出现可追查的新痕迹', confidence: 1 }],
      entities: []
    },
    suggestions: ['拒绝邀请', '追问目的'], timeCost: 'brief'
  };
}

test('authored rails contain four complete chapters per act and stable world ids', () => {
  for (let act = 1; act <= 5; act += 1) assert.equal(CHAPTERS.filter((chapter) => chapter.act === act).length, 4);
  assert.ok(CHAPTERS.every((chapter) => chapter.id && chapter.goal && chapter.entry && chapter.dangerClock && Array.isArray(chapter.exits)));
  assert.ok(CHAPTERS.every((chapter) => chapter.pace
    && chapter.pace.gentle > 0
    && chapter.pace.gentle < chapter.pace.firm
    && chapter.pace.firm < chapter.pace.decisive
    && chapter.pace.decisive <= 12));
  assert.ok(Object.values(NPCS).every((npc) => npc.id.startsWith('npc:')));
  assert.ok(Object.values(LOCATIONS).every((location) => location.id.startsWith('location:')));
});

test('scene contracts carry a goal danger clock and NPC knowledge', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我问林小满昨夜看见了什么', 'turn-8');
  assert.equal(contract.sceneGoal, state.director.sceneGoal);
  assert.ok(contract.dangerClocks.length > 0);
  assert.equal(contract.chapter.requiredDiscoveries[0].progressId, 'discovery:forest-footprints');
  assert.ok(contract.actors.find((actor) => actor.id === 'npc:lin-xiaoman').knownFactIds.includes('fact:forest-footprints'));
  assert.deepEqual(contract.pace, {
    level: 0,
    chapterTurns: 0,
    stalledTurns: 0,
    instruction: '允许围绕当前目标进行有意义的探索。',
    requiredProgressIds: [],
    requirementsSatisfied: true,
    opportunityId: 'opportunity:act2-forest-signs'
  });
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.actors), true);
});

test('gentle pressure rejects a concrete but chapter-minor discovery', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 2;
  const contract = createSceneContract(state, '我继续检查树叶', 'turn-pace');
  const narration = narrationWithText('我发现一片与主线无关的新叶痕。');
  narration.progress.advanced = ['scene:leaf-mark'];
  narration.progress.dangerClocks = {};
  narration.memory.facts = [{ subjectId: 'world:leaf', predicate: 'color', object: '叶缘发黄', confidence: 1 }];
  narration.timeCost = 'instant';
  const result = validateAiWorldTurn(state, contract, narration);
  assert.equal(contract.pace.level, 1);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /当前章节目标/.test(error)));
});

test('implicit danger clock movement is material chapter progress', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 1;
  const contract = createSceneContract(state, '我沿石径追查', 'turn-implicit-clock');
  const narration = narrationWithText('我沿着被雨水冲开的石径追查，远处的灯火随之逼近。');
  narration.progress.dangerClocks = {};
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.turnsSinceChapterProgress, 0);
});

test('chapter turns create reachable pressure even when material progress resets stalls', () => {
  let state = seededAiState();
  state.director.chapterId = 'act5-tribulation';
  state.story.act = 5;
  state.director.dangerClocks = { tribulation: 0 };
  for (let index = 0; index < 8; index += 1) {
    const contract = createSceneContract(state, '我稳住脚步观察雷云', `turn-escalation-${index}`);
    const narration = narrationWithText('我望见雷云压低，石台边缘开始落下细碎的电光。');
    narration.blocks[0].text += `${'甲乙丙丁戊己庚辛'.at(index).repeat(140)}`;
    narration.progress = {
      advanced: ['danger:tribulation:pressure'], consequences: ['雷云继续压低'],
      openLoops: [], resolvedLoops: [], dangerClocks: { tribulation: 1 }
    };
    state = commitValidatedWorldTurn(state, contract, narration);
  }
  const decisive = createSceneContract(state, '我停在飞升台边缘观察变化', 'turn-escalation-decisive');
  assert.equal(state.director.turnsSinceChapterProgress, 0);
  assert.equal(state.director.chapterTurns, 8);
  assert.equal(decisive.pace.level, 3);
});

test('decisive pressure accepts a chapter opportunity without auto-exiting', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  const contract = createSceneContract(state, '我观察戒律堂外的动静', 'turn-opportunity');
  const narration = narrationWithText('我看见执事把后山封锁令放在案边，门外正好留出一条能递交证物的空隙。');
  narration.progress = {
    advanced: ['opportunity:act2-forest-signs'], consequences: ['递交证物的时机已经出现'],
    openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
  };
  const result = validateAiWorldTurn(state, contract, narration);
  assert.equal(contract.pace.level, 3);
  assert.equal(result.ok, true);
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.chapterId, 'act2-forest-signs');
});

test('decisive pressure rejects markerless and same-turn opportunity chapter exits', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  const contract = createSceneContract(state, '我把证据交给执事', 'turn-decisive-exit');
  const narration = narrationWithText('我把封好的证物递到执事案前，堂外的封锁令也随之传开。');
  narration.progress = {
    advanced: ['chapter:act2-forest-signs:complete'], consequences: ['宗门开始封锁后山'],
    openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
  };
  const markerless = validateAiWorldTurn(state, contract, narration);
  assert.equal(markerless.ok, false);
  assert.ok(markerless.errors.some((error) => /决定性机会/.test(error)));

  narration.progress.advanced.unshift(contract.pace.opportunityId);
  assert.equal(validateAiWorldTurn(state, contract, narration).ok, false);
});

test('exitless final chapter remains playable under decisive pressure', () => {
  const state = seededAiState();
  state.director.chapterId = 'act5-tribulation';
  state.story.act = 5;
  state.director.chapterTurns = 8;
  state.director.dangerClocks = { tribulation: 0 };
  const contract = createSceneContract(state, '我听着雷云的变化', 'turn-final-opportunity');
  const narration = narrationWithText('我看见雷云在台阶尽头短暂裂开，露出一条尚未落雷的登台石路。');
  narration.progress = {
    advanced: ['opportunity:act5-tribulation'], consequences: ['一条登台石路短暂显现'],
    openLoops: [], resolvedLoops: [], dangerClocks: { tribulation: 1 }
  };
  assert.equal(contract.chapter.exits.length, 0);
  assert.equal(validateAiWorldTurn(state, contract, narration).ok, true);
});

test('arbitrary and repeated quest tags do not reset chapter momentum', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 2;
  const contract = createSceneContract(state, '我检查樱林边缘', 'turn-quest-tag');
  const narration = narrationWithText('我在湿泥中找到一枚普通铜扣，暂时没有新的主线线索。');
  narration.progress = {
    advanced: ['quest:herb-basket:clue'], consequences: ['我记下铜扣的位置'],
    openLoops: ['loop:quest-copper'], resolvedLoops: [], dangerClocks: {}
  };
  narration.timeCost = 'instant';
  const rejected = validateAiWorldTurn(state, contract, narration);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => /当前章节目标/.test(error)));

  const started = {
    ...narration,
    effects: { addQuests: ['herb-basket'] }
  };
  assert.equal(validateAiWorldTurn(state, contract, started).ok, true);
  const committed = commitValidatedWorldTurn(state, contract, started);
  const repeatedContract = createSceneContract(committed, '我再看一眼铜扣', 'turn-quest-repeat');
  assert.equal(validateAiWorldTurn(committed, repeatedContract, started).ok, false);
});

test('AI contracts expose only quests legal for the current chapter and reject future authored quests', () => {
  const state = createGameState('照月', 'ai', () => 'quest-gate');
  const contract = createSceneContract(state, '我查看门缝', 'turn-quest-gate');
  const narration = narrationWithText('我在墙角找到一块通往飞升台的令牌，却知道现在还不能接下那条遥远的道路。');
  narration.effects = { addQuests: ['final-tribulation'] };
  narration.progress = {
    advanced: ['quest:final-tribulation:clue'], consequences: ['我记下远方传闻'],
    openLoops: ['loop:far-future'], resolvedLoops: [], dangerClocks: { zhaoPursuit: 1 }
  };

  assert.equal(contract.legalQuestIds.includes('final-tribulation'), false);
  const result = validateAiWorldTurn(state, contract, narration);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /任务/.test(error)));
});

test('a newly introduced decisive opportunity cannot also apply player decision effects', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  const contract = createSceneContract(state, '我观察戒律堂外的动静', 'turn-opportunity-effects');
  const narration = narrationWithText('我看见执事把后山封锁令放在案边，门外正好留出一条能递交证物的空隙。');
  narration.effects = { location: '百宝坊市', addQuests: ['herb-basket'] };
  narration.progress = {
    advanced: [contract.pace.opportunityId], consequences: ['递交证物的时机已经出现'],
    openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
  };

  const result = validateAiWorldTurn(state, contract, narration);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /机会|选择/.test(error)));
});

test('a pre-existing decisive opportunity may resolve naturally after the player chooses it', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  const firstContract = createSceneContract(state, '我观察戒律堂外的动静', 'turn-opportunity-marker');
  const marker = narrationWithText('我看见执事把后山封锁令放在案边，门外正好留出一条能递交证物的空隙。');
  marker.progress = {
    advanced: [firstContract.pace.opportunityId], consequences: ['递交证物的时机已经出现'],
    openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
  };
  const afterMarker = commitValidatedWorldTurn(state, firstContract, marker);
  const nextContract = createSceneContract(afterMarker, '我决定前往青石镇交付线索', 'turn-opportunity-choice');
  const chosen = narrationWithText('我顺着已经显露的机会离开樱林，将线索送往可以继续追查的雨巷。');
  chosen.blocks[0].text = `我把证物收进衣襟，沿着夜雨中的石阶赶往青石镇。巷口的灯火映在积水里，巡查的脚步从身后渐远；我借着摊棚遮掩穿过人群，终于抵达能继续追查线索的地方。${'甲乙丙丁戊己庚辛'.repeat(24)}`;
  chosen.effects = { location: '青石镇' };
  chosen.progress = {
    advanced: ['scene:opportunity-chosen'], consequences: ['我抵达坊市继续追查'],
    openLoops: [], resolvedLoops: [nextContract.pace.opportunityId], dangerClocks: { demonicTrail: 1 }
  };

  assert.ok(nextContract.openLoopIds.includes(nextContract.pace.opportunityId));
  assert.equal(validateAiWorldTurn(afterMarker, nextContract, chosen).ok, true);
});

test('a negative or targetless choice cannot turn a prior opportunity into a decision effect', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  state.director.openLoops = ['opportunity:act2-forest-signs'];
  const rejectedContract = createSceneContract(state, '我决定不去青石镇，暂时留在原地', 'turn-negative-choice');
  const movement = narrationWithText('我把证物收进衣襟，雨水沿石阶流向镇口。远处坊市的灯火仍在雨幕里摇晃，我却停在原地重新查看脚边的泥痕；赵府的巡查声逐渐靠近，局势没有给我更多犹豫的余地。');
  movement.effects = { location: '青石镇' };
  movement.progress = {
    advanced: ['scene:opportunity-refused'], consequences: ['我暂不离开樱林'],
    openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
  };
  const rejected = validateAiWorldTurn(state, rejectedContract, movement);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => /选择/.test(error)));

  const acceptedContract = createSceneContract(state, '我接受小满的药篮，立刻去收集止血草', 'turn-quest-choice');
  const quest = {
    ...movement,
    effects: { addQuests: ['herb-basket'] },
    progress: {
      advanced: ['quest:herb-basket:accepted'], consequences: ['我接下收集止血草的委托'],
      openLoops: [], resolvedLoops: [], dangerClocks: { demonicTrail: 1 }
    }
  };
  assert.equal(validateAiWorldTurn(state, acceptedContract, quest).ok, true);
});

test('completed quests cannot be re-added as material chapter progress', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 2;
  state.quests.completed = ['herb-basket'];
  const contract = createSceneContract(state, '我翻看旧药篓', 'turn-completed-quest');
  const narration = narrationWithText('我翻出一张旧药方，内容与已经办完的药篓差事没有新的联系。');
  narration.progress = {
    advanced: ['quest:herb-basket:clue'], consequences: ['我确认药篓差事已经结束'],
    openLoops: ['loop:old-basket'], resolvedLoops: [], dangerClocks: {}
  };
  narration.effects = { addQuests: ['herb-basket'] };
  narration.timeCost = 'instant';
  const result = validateAiWorldTurn(state, contract, narration);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /当前章节目标/.test(error)));
});

test('decisive pressure rejects decorative progress and asks for a natural route forward', () => {
  const state = seededAiState();
  state.director.chapterTurns = 8;
  const contract = createSceneContract(state, '我观察四周', 'turn-decisive');
  const result = validateAiWorldTurn(state, contract, narrationWithText('我又发现一处无关划痕。'), []);
  assert.equal(contract.pace.level, 3);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /章节推进|决定性机会/.test(error)));
});

test('a real chapter exit resets hidden chapter pacing counters', () => {
  const state = seededAiState();
  state.director.chapterTurns = 7;
  state.director.turnsSinceChapterProgress = 6;
  state.director.pacePressure = 2;
  state.director.openLoops = ['opportunity:act2-forest-signs'];
  const contract = createSceneContract(state, '我决定前往落霞宗外门交付证据给执事', 'turn-pace-exit');
  const narration = {
    ...narrationWithText('我把拓印和黑砂交到戒律堂，执事验明来源后立刻封锁后山。'),
    effects: { location: '落霞宗外门' },
    progress: {
      advanced: ['chapter:act2-forest-signs:complete'], consequences: ['宗门开始戒备'],
      openLoops: [], resolvedLoops: ['loop:demonic-trail'], dangerClocks: { demonicTrail: 1 }
    }
  };
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.chapterTurns, 0);
  assert.equal(next.director.turnsSinceChapterProgress, 0);
  assert.equal(next.director.pacePressure, 0);
});

test('the opening contract exposes Zhao Tianba as a canonical actor instead of a generated duplicate', () => {
  const state = createGameState('照月', 'ai', () => 'opening-journey');
  const contract = createSceneContract(state, '我刚在赵府柴房醒来', 'turn-opening');
  const zhao = contract.actors.find((actor) => actor.name === '赵天霸');
  assert.equal(zhao?.id, 'npc:zhao-tianba');
  assert.ok(zhao.knownFactIds.includes('fact:authored:zhao-tianba:identity'));
  assert.ok(contract.facts.some((fact) => fact.id === 'fact:authored:zhao-tianba:identity'));
});

test('the opening may stop at the first choice without inventing a player-action consequence', () => {
  const state = createGameState('照月', 'ai', () => 'opening-no-consequence');
  const contract = createSceneContract(state, '生成旅程开篇：主角刚在赵府柴房醒来，等待玩家作出第一个行动。', 'turn-opening-no-consequence');
  const result = validateAiWorldTurn(state, contract, {
    blocks: [{ type: 'narr', text: '我从潮湿的稻草间醒来，后脑的钝痛随着呼吸一阵阵加深。月光从破窗漏进来，照出门边晃动的两道人影；铁锁正在被人从外面拨动，木屑也随着每次撞击落到地上。我摸到身旁一截断木，又看见后窗插销已经腐朽，门外的人却在这时喊出了赵天霸的名字。危险已经逼近，而我尚未采取任何行动。' }],
    effects: {},
    progress: { advanced: ['opening:awakened'], consequences: [], openLoops: ['loop:escape-zhao'], dangerClocks: {} },
    memory: { facts: [], entities: [] }, suggestions: ['查看门缝', '尝试松开后窗'], timeCost: 'instant'
  }, []);
  assert.equal(result.ok, true);
});

test('known NPC fact summaries may use the displayed actor name as their key', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我问林小满足迹来自何处', 'turn-name-key');
  const narration = narrationWithText('我把沾着黑砂的叶片托到林小满面前，请她辨认上面的气味。');
  narration.blocks.push({
    type: 'dlg', name: '林小满', text: '你手里的黑砂和我昨夜看到的足迹来自同一个方向。',
    factIds: ['fact:forest-footprints']
  });
  narration.usedFactIdsByActor = { 林小满: ['fact:forest-footprints'] };
  assert.equal(validateAiWorldTurn(state, contract, narration, []).ok, true);
});

test('relationship effects require the same character to have visible validated dialogue evidence', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我询问林小满昨夜看见了什么', 'turn-relationship-evidence');
  const withoutDialogue = narrationWithText('我把沾着黑砂的叶片摊在石阶上，等待林小满回应。');
  withoutDialogue.effects = { relationships: { '林小满': 4 } };
  const rejected = validateAiWorldTurn(state, contract, withoutDialogue, []);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => /关系.*对白|对白.*关系/.test(error)));

  const withDialogue = {
    ...withoutDialogue,
    blocks: [...withoutDialogue.blocks, {
      type: 'dlg', name: '林小满', text: '这片黑砂和我昨夜看到的足迹来自同一个方向。',
      factIds: ['fact:forest-footprints']
    }],
    usedFactIdsByActor: { 'npc:lin-xiaoman': ['fact:forest-footprints'] }
  };
  const accepted = validateAiWorldTurn(state, contract, withDialogue, []);
  assert.equal(accepted.ok, true);
  const committed = commitValidatedWorldTurn(state, contract, withDialogue);
  assert.equal(committed.relationships['林小满'], 4);
  assert.equal(committed.memory.entities['npc:lin-xiaoman'].name, '林小满');
});

test('AI memory facts require current, previously discovered, or visibly validated subject evidence', () => {
  const unseenNpcState = createGameState('照月', 'ai');
  const unseenNpcContract = createSceneContract(unseenNpcState, '我想起林小满的名字', 'turn-fact-hidden-npc');
  const unseenNpc = narrationWithText('我只在柴房里听见雨声，没有见到那位尚未相识的人。');
  unseenNpc.memory.facts = [{ subjectId: 'npc:lin-xiaoman', predicate: 'waits', object: '林小满正在未来章节等待', confidence: 1 }];
  assert.equal(validateAiWorldTurn(unseenNpcState, unseenNpcContract, unseenNpc).ok, false);

  const hiddenLocationState = createGameState('照月', 'ai');
  const hiddenLocationContract = createSceneContract(hiddenLocationState, '我检查柴房门缝', 'turn-fact-hidden-location');
  const hiddenLocation = narrationWithText('我只看见柴房门缝里的雨水，没有抵达远方裂隙。');
  hiddenLocation.memory.facts = [{ subjectId: 'location:nether-rift', predicate: 'contains', object: '幽冥裂隙深处藏着魔门', confidence: 1 }];
  assert.equal(validateAiWorldTurn(hiddenLocationState, hiddenLocationContract, hiddenLocation).ok, false);

  const discoveredState = seededAiState();
  const discoveredContract = createSceneContract(discoveredState, '我继续检查足迹', 'turn-fact-known-person');
  const discovered = narrationWithText('我沿着已经见过的林小满留下的足迹继续核对泥痕。');
  discovered.memory.facts = [{ subjectId: 'npc:lin-xiaoman', predicate: 'returns', object: '林小满曾在樱林西侧留下回返记号', confidence: 1 }];
  assert.equal(validateAiWorldTurn(discoveredState, discoveredContract, discovered).ok, true);
});

test('AI addItems quantities are positive integers and cannot be zero or fractional', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我检查足迹', 'turn-item-quantity');
  for (const amount of [0, -1, 0.5]) {
    const narration = narrationWithText(`我记录下物资数量 ${amount}。`);
    narration.effects = { addItems: { '问天剑': amount } };
    const result = validateAiWorldTurn(state, contract, narration);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /数量|正整数/.test(error)));
  }
});

test('AI quest lifecycle progresses only active quests and completes after legal progress', () => {
  const state = seededAiState();
  state.quests.active = [{ id: 'herb-basket', progress: 0, target: 2 }];
  const contract = createSceneContract(state, '我收集止血草', 'turn-quest-progress');
  const narration = narrationWithText('我在樱林边缘收集到一株止血草，先把药篮扎紧。');
  narration.effects = { questProgress: { 'herb-basket': 1 } };
  narration.progress.advanced = ['quest:herb-basket:progress'];
  assert.equal(validateAiWorldTurn(state, contract, narration).ok, true);
  const progressed = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(progressed.quests.active[0].progress, 1);

  const finishContract = createSceneContract(progressed, '我收集最后一株止血草', 'turn-quest-complete');
  const finish = narrationWithText('我把最后一株止血草放入药篮，数量终于足够交差。');
  finish.effects = { questProgress: { 'herb-basket': 1 }, completeQuests: ['herb-basket'] };
  finish.progress.advanced = ['quest:herb-basket:complete'];
  const completed = commitValidatedWorldTurn(progressed, finishContract, finish);
  assert.deepEqual(completed.quests.active, []);
  assert.ok(completed.quests.completed.includes('herb-basket'));

  const failedState = seededAiState();
  failedState.quests.active = [{ id: 'herb-basket', progress: 1, target: 2 }];
  const failedContract = createSceneContract(failedState, '我放弃收集药草', 'turn-quest-fail');
  const failed = narrationWithText('我确认药篮已经被雨水冲走，只能记下这次失败。');
  failed.effects = { failQuests: ['herb-basket'] };
  failed.progress.advanced = ['quest:herb-basket:failed'];
  const failedResult = commitValidatedWorldTurn(failedState, failedContract, failed);
  assert.deepEqual(failedResult.quests.active, []);
  assert.ok(failedResult.quests.failed.includes('herb-basket'));
});

test('AI quest lifecycle rejects instant completion, future quests, mixed add, and complete/fail', () => {
  const state = seededAiState();
  state.quests.active = [{ id: 'herb-basket', progress: 0, target: 2 }];
  const contract = createSceneContract(state, '我看见一篮草药', 'turn-quest-illegal');
  const cases = [
    { questProgress: {}, completeQuests: ['herb-basket'] },
    { questProgress: { 'herb-basket': 3 }, completeQuests: ['herb-basket'] },
    { addQuests: ['herb-basket'], questProgress: { 'herb-basket': 1 } },
    { questProgress: { 'herb-basket': 1 }, completeQuests: ['herb-basket'], failQuests: ['herb-basket'] },
    { questProgress: { 'final-tribulation': 1 } }
  ];
  for (const effects of cases) {
    const narration = narrationWithText('我在原地整理药篮，暂不改变既有任务状态。');
    narration.effects = effects;
    const result = validateAiWorldTurn(state, contract, narration);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /任务|进度|完成|失败/.test(error)));
  }
});

test('chapter exits require a pre-existing opportunity marker and structural prerequisites', () => {
  const state = seededAiState();
  state.director.chapterTurns = 0;
  const contract = createSceneContract(state, '我决定交付证据', 'turn-exit-prerequisite');
  assert.ok(contract.chapter.prerequisites.minCommittedTurns >= 1);
  const narration = narrationWithText('我把证据交给执事，宗门随即开始封锁后山。');
  narration.progress.advanced = ['chapter:act2-forest-signs:complete'];
  assert.equal(validateAiWorldTurn(state, contract, narration).ok, false);

  const markerState = structuredClone(state);
  markerState.director.chapterTurns = 1;
  markerState.director.openLoops = ['opportunity:act2-forest-signs'];
  const markerContract = createSceneContract(markerState, '我决定前往落霞宗外门交付证据', 'turn-exit-existing-opportunity');
  const validExit = { ...narration, effects: { location: '落霞宗外门' }, progress: { ...narration.progress, advanced: ['chapter:act2-forest-signs:complete'] } };
  assert.equal(validateAiWorldTurn(markerState, markerContract, validExit).ok, true);

  const sameTurn = { ...validExit, progress: { ...validExit.progress, advanced: ['opportunity:act2-forest-signs', 'chapter:act2-forest-signs:complete'] } };
  const fresh = createSceneContract(structuredClone(state), '我决定交付证据', 'turn-exit-same-turn-marker');
  assert.equal(validateAiWorldTurn(state, fresh, sameTurn).ok, false);
});

test('chapter exits require an affirmative choice bound to a concrete legal effect target', () => {
  const state = seededAiState();
  state.director.chapterTurns = 1;
  state.director.openLoops = ['opportunity:act2-forest-signs'];
  const emptyContract = createSceneContract(state, '我决定交付证据给执事', 'turn-exit-empty-target');
  const emptyExit = narrationWithText('我把证据交到戒律堂，执事随即封锁后山。');
  emptyExit.progress.advanced = ['chapter:act2-forest-signs:complete'];
  assert.equal(validateAiWorldTurn(state, emptyContract, emptyExit).ok, false);

  const rejectedContract = createSceneContract(state, '我决定留在樱林继续观察，不去青石镇', 'turn-exit-wrong-target');
  const targetedExit = {
    ...emptyExit,
    effects: { location: '落霞宗外门' }
  };
  assert.equal(validateAiWorldTurn(state, rejectedContract, targetedExit).ok, false);

  const chosenContract = createSceneContract(state, '我决定前往落霞宗外门交付证据', 'turn-exit-chosen-target');
  assert.equal(validateAiWorldTurn(state, chosenContract, targetedExit).ok, true);
});

test('validated chapter exits commit their exact declared entry locations across every authored transition', () => {
  for (const chapter of CHAPTERS.filter((candidate) => candidate.exits.length)) {
    const state = createGameState('照月', 'ai', () => `exit-${chapter.id}`);
    state.director.chapterId = chapter.id;
    state.director.sceneGoal = chapter.goal;
    state.story.act = chapter.act;
    state.player.realm = 22;
    state.director.chapterTurns = 1;
    state.memory.facts = chapter.requiredFacts.map((id) => ({
      id, subjectId: 'world:prerequisite', predicate: 'known', object: id,
      sourceTurnId: 'world-bible', createdAtTurn: 0, locked: true
    }));
    const setupContract = createSceneContract(state, '我准备作出决定', `turn-${chapter.id}-setup`);
    state.story.location = setupContract.chapter.prerequisites.requiredLocation || state.story.location;
    state.director.openLoops = [setupContract.pace.opportunityId];
    const exit = setupContract.chapter.exits[0];
    const target = exit.targetLocation;
    const nextChapter = CHAPTERS.find((candidate) => candidate.id === exit.nextChapterId);
    const contract = createSceneContract(state, `我决定前往${target}`, `turn-${chapter.id}-exit`);
    const narration = narrationWithText(`我循着已经显露的机会动身，穿过最后一道阻碍，明确前往${target}。`);
    narration.effects = { location: target };
    narration.progress.advanced = [exit.progressId];
    narration.progress.dangerClocks = { [chapter.dangerClock.id]: 1 };

    const validation = validateAiWorldTurn(state, contract, narration);
    assert.equal(validation.ok, true, `${chapter.id}: ${validation.errors.join('；')}`);
    const committed = commitValidatedWorldTurn(state, contract, narration);
    assert.equal(committed.story.act, nextChapter.act, chapter.id);
    assert.equal(committed.director.chapterId, nextChapter.id, chapter.id);
    assert.equal(committed.story.location, target, chapter.id);
  }
});

test('ordinary travel still cannot bypass an act-locked chapter entry location', () => {
  const state = createGameState('照月', 'ai', () => 'locked-travel');
  state.story.act = 2;
  state.player.realm = 22;

  const traveled = applyValidatedEffects(state, { location: '青岚秘境' });

  assert.equal(traveled.story.location, state.story.location);
});

test('world facts apply the same visibility gate to authored Chinese item and quest names', () => {
  const unseenState = seededAiState();
  const unseenContract = createSceneContract(unseenState, '我继续检查足迹', 'turn-hidden-authored-name');
  for (const [label, object] of [
    ['问天剑', '问天剑已经在远处等我'],
    ['九重天劫', '九重天劫即将降临']
  ]) {
    const narration = narrationWithText(`我听见关于${label}的传闻，却没有取得任何能够证实它的东西。`);
    narration.memory.facts = [{ subjectId: 'world:future-name', predicate: 'foretells', object, confidence: 1 }];
    assert.equal(validateAiWorldTurn(unseenState, unseenContract, narration).ok, false, label);
  }

  const knownItem = seededAiState();
  knownItem.inventory.items['问天剑'] = 1;
  const knownItemNarration = narrationWithText('我擦去问天剑上的泥痕，确认它仍在掌中。');
  knownItemNarration.memory.facts = [{ subjectId: 'world:known-sword', predicate: 'carries', object: '问天剑仍在我掌中', confidence: 1 }];
  assert.equal(validateAiWorldTurn(knownItem, createSceneContract(knownItem, '我检查问天剑', 'turn-known-sword'), knownItemNarration).ok, true);

  const acceptedQuest = seededAiState();
  const acceptedQuestNarration = narrationWithText('我接受了桃花一壶的委托，先将酒壶的来历记下。');
  acceptedQuestNarration.effects = { addQuests: ['elder-wine'] };
  acceptedQuestNarration.memory.facts = [{ subjectId: 'world:accepted-quest', predicate: 'accepted', object: '桃花一壶已经由我接下', confidence: 1 }];
  assert.equal(validateAiWorldTurn(acceptedQuest, createSceneContract(acceptedQuest, '我接受桃花一壶', 'turn-accepted-quest'), acceptedQuestNarration).ok, true);

  const gainedItem = seededAiState();
  const gainedItemNarration = narrationWithText('我从石缝中取出问天剑，剑鸣证明它已归我所有。');
  gainedItemNarration.effects = { addItems: { '问天剑': 1 } };
  gainedItemNarration.memory.facts = [{ subjectId: 'world:gained-sword', predicate: 'gained', object: '问天剑已被我取得', confidence: 1 }];
  assert.equal(validateAiWorldTurn(gainedItem, createSceneContract(gainedItem, '我取出问天剑', 'turn-gained-sword'), gainedItemNarration).ok, true);
});

test('world fact catalog-name visibility canonicalizes Unicode and whitespace without matching different words', () => {
  const unknown = seededAiState();
  const contract = createSceneContract(unknown, '我继续检查足迹', 'turn-obscured-authored-name');
  for (const label of ['问 天 剑', '问\u00a0天\u3000剑', '九 重 天 劫']) {
    const object = `${label}已经被我看见`;
    const narration = narrationWithText(`我确认${object}。`);
    narration.memory.facts = [{ subjectId: 'world:obscured-catalog', predicate: 'claims', object, confidence: 1 }];
    assert.equal(validateAiWorldTurn(unknown, contract, narration).ok, false, label);
  }

  const knownItem = seededAiState();
  knownItem.inventory.items['问天剑'] = 1;
  const knownItemNarration = narrationWithText('我确认问\u200b天\u200d剑仍在掌中。');
  knownItemNarration.memory.facts = [{ subjectId: 'world:known-obscured-item', predicate: 'carries', object: '问\u200b天\u200d剑仍在掌中', confidence: 1 }];
  assert.equal(validateAiWorldTurn(knownItem, createSceneContract(knownItem, '我检查剑痕', 'turn-known-obscured-item'), knownItemNarration).ok, true);

  const knownQuest = seededAiState();
  knownQuest.quests.active = [{ id: 'final-tribulation', progress: 0, target: 9 }];
  const knownQuestNarration = narrationWithText('我确认九\u200b重天\ufeff劫已经记入任务。');
  knownQuestNarration.memory.facts = [{ subjectId: 'world:known-obscured-quest', predicate: 'tracks', object: '九\u200b重天\ufeff劫已经记入任务', confidence: 1 }];
  assert.equal(validateAiWorldTurn(knownQuest, createSceneContract(knownQuest, '我查看任务', 'turn-known-obscured-quest'), knownQuestNarration).ok, true);

  const unrelatedNarration = narrationWithText('我确认问剑刻痕只是普通石纹。');
  unrelatedNarration.memory.facts = [{ subjectId: 'world:unrelated-name', predicate: 'marks', object: '问剑刻痕只是普通石纹', confidence: 1 }];
  assert.equal(validateAiWorldTurn(unknown, contract, unrelatedNarration).ok, true);
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

test('world narration must stay in the protagonist first person while NPC dialogue may address me', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我停在树后观察', 'turn-first-person');
  const secondPerson = {
    ...narrationWithText('你停在树后，雨水顺着你的衣袖滴进泥里。远处的巡山灯火忽然转向这边。'),
    progress: {
      advanced: ['discovery:patrol-route'], consequences: ['巡山弟子改变了搜索方向'],
      openLoops: ['loop:patrol-route'], dangerClocks: { demonicTrail: 1 }
    },
    memory: { facts: [{ subjectId: 'world:patrol', predicate: 'route', object: '巡山灯火转向樱林西侧', confidence: 1 }] }
  };
  const rejected = validateAiWorldTurn(state, contract, secondPerson, []);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => /第一人称|视角/.test(error)));

  const firstPerson = {
    ...secondPerson,
    blocks: [
      { type: 'narr', text: '我停在树后，雨水顺着衣袖滴进泥里。远处的巡山灯火忽然转向这边，我看见领头弟子俯身检查被踩断的樱枝。灯笼映出的影子在泥地上越拉越长，我屏住呼吸，顺着树根慢慢挪开半步，鞋底却碰到一枚带着余温的黑砂。那名弟子立刻抬头，手也按上了腰间剑柄；这条藏身路线已经不再安全。' },
      { type: 'dlg', name: '林小满', text: '你别出声，他们正在循着足迹找过来。', factIds: ['fact:forest-footprints'] }
    ],
    usedFactIdsByActor: { 'npc:lin-xiaoman': ['fact:forest-footprints'] }
  };
  assert.equal(validateAiWorldTurn(state, contract, firstPerson, []).ok, true);
});

test('first-person narration cannot invent a decision the player did not make', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我听完黑衣人的条件', 'turn-no-puppet');
  const result = validateAiWorldTurn(state, contract, {
    ...narrationWithText('我听完黑衣人的条件，立刻答应加入魔宗，并发誓从此效忠。他递来的血契在雨中泛起暗红微光，林间阵纹随之亮起。'),
    effects: { relationships: { 林小满: -5 } },
    progress: {
      advanced: ['relationship:masked-man:pact'], consequences: ['血契开始生效'],
      openLoops: ['loop:blood-oath'], dangerClocks: { demonicTrail: 1 }
    }
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /替玩家|擅自|决定/.test(error)));
});

test('narration may present a pending decision without choosing it for the player', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我听完双方的条件', 'turn-pending-choice');
  const narration = narrationWithText('我听完双方的条件，意识到必须在天亮前作出决定，但此刻没有答应任何一方。');
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, true);
});

test('first-person narration cannot reveal an off-screen character inner monologue', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我留在樱林检查足迹', 'turn-no-omniscience');
  const result = validateAiWorldTurn(state, contract, {
    ...narrationWithText('我蹲在樱树下拨开湿泥，指尖碰到一粒尚有余温的黑砂。与此同时，远在戒律堂的执事暗自决定明日便将我逐出宗门。'),
    effects: {},
    progress: {
      advanced: ['discovery:warm-black-sand'], consequences: ['我找到一条仍然新鲜的魔修踪迹'],
      openLoops: ['loop:warm-black-sand'], dangerClocks: { demonicTrail: 1 }
    },
    memory: { facts: [{ subjectId: 'world:trail', predicate: 'fresh', object: '黑砂尚有余温', confidence: 1 }] }
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /全知|视角|亲历/.test(error)));
});

test('thin summary prose is rejected even when it claims progress metadata', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我检查泥里的足迹', 'turn-depth');
  const result = validateAiWorldTurn(state, contract, {
    blocks: [{ type: 'narr', text: '我检查了足迹，发现有问题。' }],
    effects: { qi: 1 },
    progress: {
      advanced: ['discovery:odd-footprint'], consequences: ['调查有所进展'],
      openLoops: ['loop:odd-footprint'], dangerClocks: { demonicTrail: 1 }
    },
    memory: { facts: [{ subjectId: 'world:trail', predicate: 'oddity', object: '足迹混有魔砂', confidence: 1 }] },
    suggestions: ['继续检查', '返回宗门'], timeCost: 'brief'
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /过短|展开|细节/.test(error)));
});

test('narration cannot swap the current qi and spirit values in prose', () => {
  const state = createGameState('照月', 'ai', () => 'stat-journey');
  const contract = createSceneContract(state, '我检查体内状态', 'turn-stat-consistency');
  const narration = narrationWithText('我凝神内视，发现体内只有三十点灵气，灵力却已经几乎耗尽。');
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(state.player.qi, 0);
  assert.equal(state.player.spirit, 30);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /灵气|灵力|数值/.test(error)));
});

test('narration cannot leak internal JSON field names into visible story prose', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我感受体内力量', 'turn-no-schema-leak');
  const narration = narrationWithText('我沉下呼吸感受经脉，确认 spirit 仍然充足，随后把注意力移回林间的脚步声。');
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /内部|字段|术语/.test(error)));
});

test('a world turn needs a concrete state memory clock or loop change rather than a decorative scene id', () => {
  const state = seededAiState();
  const contract = createSceneContract(state, '我继续等待', 'turn-concrete-progress');
  const result = validateAiWorldTurn(state, contract, {
    blocks: [{ type: 'narr', text: '我靠在湿冷的树干后继续等待。风从林隙穿过，吹得枝头雨珠接连坠落；远处灯火来回晃动，却没有任何人靠近，也没有新的痕迹出现。' }],
    effects: {},
    progress: { advanced: ['scene:still-waiting'], consequences: ['什么也没有改变'], openLoops: ['loop:demonic-trail'], dangerClocks: {} },
    memory: { facts: [], entities: [] }, suggestions: ['换个位置观察', '返回宗门'], timeCost: 'brief'
  }, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /实际进展|状态|线索/.test(error)));
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
  state.director.chapterTurns = 1;
  state.director.openLoops = ['opportunity:act2-forest-signs'];
  const contract = createSceneContract(state, '我决定前往落霞宗外门交付证据给执事', 'turn-8');
  const narration = {
    blocks: [{ type: 'narr', text: '我把装着魔砂与足迹拓印的布包交到戒律堂案前。值守弟子先是皱眉，随后取出验魔针逐一核对；针尖转黑的刹那，堂内原本松散的说话声全停了。执事当场封住后山令牌，又派人通知巡山队改换暗号。我虽然暂时摆脱独自查证的风险，却也让藏在宗门里的眼线知道证据已经暴露。' }],
    effects: { qi: 12, spirit: -4, location: '落霞宗外门' },
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

  const advancingState = structuredClone(state);
  advancingState.director.chapterTurns = 1;
  advancingState.director.openLoops = ['opportunity:act2-forest-signs'];
  const advancingContract = createSceneContract(advancingState, '我决定前往落霞宗外门交付证据', 'turn-rail-exit');
  const advancing = {
    ...wandering,
    effects: { location: '落霞宗外门' },
    progress: { ...wandering.progress, advanced: ['chapter:act2-forest-signs:complete'] }
  };
  assert.equal(validateAiWorldTurn(advancingState, advancingContract, advancing, []).ok, true);
});

test('authored discovery progress creates the stable fact required by a chapter exit', () => {
  const state = seededAiState();
  state.memory.facts = [];
  state.memory.entities['npc:lin-xiaoman'].knownFactIds = [];
  state.director.chapterTurns = 1;
  state.director.openLoops = ['opportunity:act2-forest-signs'];
  const contract = createSceneContract(state, '我决定前往落霞宗外门交付证据并查清足迹', 'turn-authored-fact');
  const narration = {
    ...narrationWithText('我在泥痕深处挑出几粒黑砂，验魔符贴近时立刻卷边发焦，足以证明这串足迹来自魔修。我用油纸封住样本，再把足印的方向与深浅逐一拓下，随后沿避雨石廊赶到戒律堂。值守弟子核对证据后敲响警钟，后山各处阵门随即落锁；我的发现终于迫使宗门正视潜入者。'),
    effects: { location: '落霞宗外门' },
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
    ...narrationWithText('我刚追到林间阵眼，脚下石纹便被涌出的黑气一寸寸撑裂。灵光与魔气相撞，震得我虎口发麻，守在两侧的巡山弟子也被逼得接连后退。最后一枚阵钉崩飞后，原本受困的魔气沿山脊散开，留下三条不同方向的痕迹；敌人显然趁阵眼破裂开始转移。'),
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
    blocks: [{ type: 'dlg', name: '林小满', text: '魔尊名为夜无疆。', factIds: [] }],
    usedFactIdsByActor: { 'npc:lin-xiaoman': [] }
  };
  const result = validateAiWorldTurn(state, contract, narration, []);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /事实|知识来源|引用/.test(error)));
});

test('authored NPCs always receive a stable intrinsic fact they can cite', () => {
  const state = seededAiState();
  state.memory.entities['npc:lin-xiaoman'].knownFactIds = [];
  const contract = createSceneContract(state, '和林小满打招呼', 'turn-intrinsic');
  const actor = contract.actors.find((entry) => entry.id === 'npc:lin-xiaoman');
  assert.ok(actor.knownFactIds.some((id) => id.startsWith('fact:authored:')));
  assert.ok(contract.facts.some((fact) => actor.knownFactIds.includes(fact.id)));
});

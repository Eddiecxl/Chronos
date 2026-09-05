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
    requirementsSatisfied: true
  });
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.actors), true);
});

test('minor discoveries do not reset stalled chapter momentum', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 4;
  const contract = createSceneContract(state, '我继续检查树叶', 'turn-pace');
  const narration = narrationWithText('我发现一片与主线无关的新叶痕。');
  narration.progress.advanced = ['scene:leaf-mark'];
  narration.progress.dangerClocks = {};
  narration.memory.facts = [{ subjectId: 'world:leaf', predicate: 'color', object: '叶缘发黄', confidence: 1 }];
  const next = commitValidatedWorldTurn(state, contract, narration);
  assert.equal(next.director.chapterTurns, 1);
  assert.equal(next.director.turnsSinceChapterProgress, 5);
  assert.equal(next.director.pacePressure, 2);
});

test('decisive pressure rejects decorative progress and asks for a natural route forward', () => {
  const state = seededAiState();
  state.director.turnsSinceChapterProgress = 8;
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
  const contract = createSceneContract(state, '把证据交给执事', 'turn-pace-exit');
  const narration = {
    ...narrationWithText('我把拓印和黑砂交到戒律堂，执事验明来源后立刻封锁后山。'),
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
  const contract = createSceneContract(state, '把证据交给执事', 'turn-8');
  const narration = {
    blocks: [{ type: 'narr', text: '我把装着魔砂与足迹拓印的布包交到戒律堂案前。值守弟子先是皱眉，随后取出验魔针逐一核对；针尖转黑的刹那，堂内原本松散的说话声全停了。执事当场封住后山令牌，又派人通知巡山队改换暗号。我虽然暂时摆脱独自查证的风险，却也让藏在宗门里的眼线知道证据已经暴露。' }],
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
    ...narrationWithText('我在泥痕深处挑出几粒黑砂，验魔符贴近时立刻卷边发焦，足以证明这串足迹来自魔修。我用油纸封住样本，再把足印的方向与深浅逐一拓下，随后沿避雨石廊赶到戒律堂。值守弟子核对证据后敲响警钟，后山各处阵门随即落锁；我的发现终于迫使宗门正视潜入者。'),
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

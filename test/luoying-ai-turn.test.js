import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';
import { createAiTurnRunner } from '../public/luoying-xiantu/ai-turn.js';
import { createStorage } from '../public/luoying-xiantu/storage.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function seededAiState() {
  const state = createGameState('照月', 'ai', () => 'ai-journey');
  state.pending = null;
  state.director.sceneGoal = '调查柴房外的追兵并寻找逃生路线';
  state.director.dangerClocks = { zhaoPursuit: 1 };
  return state;
}

const noProgressResponse = () => JSON.stringify({
  blocks: [{ type: 'narr', text: '四周仍旧安静。' }], effects: {},
  progress: { advanced: [], consequences: [], openLoops: [] },
  memory: { facts: [], entities: [] }, suggestions: ['继续等待', '再想想'], timeCost: 'brief'
});

const systemResponseWithInjectedEffects = () => JSON.stringify({
  blocks: [{ type: 'sys', text: '落霞掌消耗四点灵力。' }],
  effects: { gold: 999 }, progress: { advanced: ['illegal'] }, timeCost: 'long'
});

function detailedFirstPerson(text) {
  return `我贴近门缝，先听见鞋底碾过碎石的轻响，才从木板裂隙看清${text}我没有贸然推门，而是顺着墙角继续观察。雨水正从破瓦滴到草席边缘，屋外灯影每隔片刻便掠过一次；后窗的旧插销已经松动，药车轮印则一直通向巷口。这些细节给了我新的退路，也让追兵开始缩小搜查范围。`;
}

const validWorldResponse = (text = '门缝外掠过两道人影，林小满正躲在雨幕里向我示警，其中一人腰间挂着赵府铁牌。') => JSON.stringify({
  blocks: [{ type: 'narr', text: detailedFirstPerson(text) }], effects: { qi: 8 },
  progress: { advanced: ['discovery:zhao-scouts'], consequences: ['追兵开始搜查柴房'], openLoops: ['loop:escape-route'], dangerClocks: { zhaoPursuit: 1 } },
  memory: {
    facts: [{ subjectId: 'world:pursuit', predicate: 'identified', object: '柴房外有两名赵府追兵', confidence: 1 }],
    entities: [{ id: 'generated:npc:zhao-scout', kind: 'npc', name: '赵府斥候', location: '赵府柴房', purpose: '搜捕逃跑者', traits: ['警觉'] }]
  },
  suggestions: ['从后窗离开', '制造声响引开追兵'], timeCost: 'brief'
});

function runnerWithNarrator(narrate, transcriptStore = createTranscriptStore({ memory: new Map() })) {
  return createAiTurnRunner({ aiClient: { narrate }, transcriptStore, idFactory: () => 'tx-test', now: () => 1000 });
}

test('world runner ignores legacy suggestions in AI responses and stored turns', async () => {
  const transcriptStore = createTranscriptStore({ memory: new Map() });
  const runner = runnerWithNarrator(async () => validWorldResponse(), transcriptStore);
  const result = await runner.runWorld({ state: seededAiState(), input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.equal('suggestions' in result, false);
  assert.equal('suggestions' in result.turn, false);
  assert.equal('suggestions' in (await transcriptStore.allTurns('ai-journey'))[0], false);
});

test('an AI failure leaves the complete world byte-for-byte unchanged', async () => {
  const state = seededAiState();
  state.director.chapterTurns = 3;
  state.director.turnsSinceChapterProgress = 3;
  state.director.pacePressure = 1;
  const before = JSON.stringify(state);
  const transcriptStore = createTranscriptStore({ memory: new Map() });
  const runner = createAiTurnRunner({
    aiClient: { narrate: async () => { throw new Error('429'); } },
    transcriptStore,
    idFactory: () => 'tx-1'
  });
  const result = await runner.runWorld({ state, input: '推开石门', settings: { provider: 'groq' } });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(result.state.codex, state.codex);
  assert.deepEqual(result.state.equipment, state.equipment);
  assert.equal(result.state.director.chapterTurns, 3);
  assert.equal(result.state.director.turnsSinceChapterProgress, 3);
  assert.equal(result.state.director.pacePressure, 1);
  assert.equal((await transcriptStore.allTurns(state.journeyId)).length, 0);
  assert.equal(result.retry.input, '推开石门');
});

test('invalid narration receives two repair calls then rolls back', async () => {
  let calls = 0;
  const requestTypes = [];
  const state = seededAiState();
  state.director.chapterTurns = 6;
  state.director.turnsSinceChapterProgress = 6;
  state.director.pacePressure = 2;
  const before = JSON.stringify(state);
  const runner = runnerWithNarrator(async (_settings, context) => { calls += 1; requestTypes.push(context.requestType); return noProgressResponse(); });
  const result = await runner.runWorld({ state, input: '继续', settings: { provider: 'groq' } });
  assert.equal(calls, 3);
  assert.deepEqual(requestTypes, ['world', 'repair', 'repair']);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.state.director.chapterTurns, 6);
  assert.equal(result.state.director.turnsSinceChapterProgress, 6);
  assert.equal(result.state.director.pacePressure, 2);
});

test('one repair attempt can turn an invalid response into a committed world turn', async () => {
  let calls = 0;
  const runner = runnerWithNarrator(async () => (++calls === 1 ? noProgressResponse() : validWorldResponse()));
  const result = await runner.runWorld({ state: seededAiState(), input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.state.player.qi, 8);
});

test('a second repair attempt can recover a stubborn malformed model response', async () => {
  let calls = 0;
  const requestTypes = [];
  const runner = runnerWithNarrator(async (_settings, context) => {
    calls += 1;
    requestTypes.push(context.requestType);
    return calls < 3 ? noProgressResponse() : validWorldResponse();
  });
  const result = await runner.runWorld({ state: seededAiState(), input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(requestTypes, ['world', 'repair', 'repair']);
});

test('a paused AI answer cannot commit effects or time', async () => {
  const state = seededAiState();
  const runner = runnerWithNarrator(async () => systemResponseWithInjectedEffects());
  const result = await runner.runSystem({ state, input: '解释我的剑法', settings: { provider: 'mistral' } });
  assert.equal(result.state.story.minuteOfDay, state.story.minuteOfDay);
  assert.equal(result.state.player.gold, state.player.gold);
  assert.ok(result.blocks.every((block) => block.type === 'sys'));
});

test('AI journey opening contains only model-authored story blocks', async () => {
  const requestTypes = [];
  const runner = runnerWithNarrator(async (_settings, context) => {
    requestTypes.push(context.requestType);
    return JSON.stringify({
    blocks: [{ type: 'narr', text: '冷雨敲在柴房破瓦上，我在潮湿草席间睁开眼。后脑仍残留着钝痛，掌心按到的却不是熟悉床褥，而是一层混着泥水的碎稻草。我刚撑起半边身体，门外便传来急促脚步和铁器碰撞声；一束灯光从门缝扫过，停在锁扣附近。屋里只有断腿木凳、半扇松动后窗与一把生锈柴刀。门锁已经开始响动，留给我的时间不多了。' }],
    effects: {},
    progress: { advanced: ['opening:awakened'], consequences: ['赵府家丁正在接近'], openLoops: ['loop:escape-zhao'] },
    memory: { facts: [], entities: [] },
    suggestions: ['查看门缝', '寻找趁手物件'], timeCost: 'instant'
    });
  });
  const result = await runner.runOpening({ state: seededAiState(), settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.deepEqual(requestTypes, ['world']);
  assert.match(result.blocks[0].text, /冷雨/);
  assert.equal(result.state.director.chapterTurns, 0);
  assert.equal(result.state.director.turnsSinceChapterProgress, 0);
  assert.equal(result.state.director.pacePressure, 0);
});

test('successful turns persist transcript facts and generated entities only after commit', async () => {
  const transcriptStore = createTranscriptStore({ memory: new Map() });
  const runner = runnerWithNarrator(async () => validWorldResponse(), transcriptStore);
  const result = await runner.runWorld({ state: seededAiState(), input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.equal((await transcriptStore.allTurns('ai-journey')).length, 1);
  assert.ok(result.state.memory.facts.some((fact) => fact.object.includes('两名赵府追兵')));
  assert.equal(result.state.memory.entities['generated:npc:zhao-scout'].name, '赵府斥候');
  assert.equal(result.state.codex.characters.includes('林小满'), false);
});

test('autosave failure compensates the transcript and reports an unchanged AI turn', async () => {
  const transcriptStore = createTranscriptStore({ memory: new Map() });
  const state = seededAiState();
  const before = JSON.stringify(state);
  const runner = createAiTurnRunner({
    aiClient: { narrate: async () => validWorldResponse() },
    transcriptStore,
    stateStore: { saveAuto: () => { throw new Error('quota full'); } },
    idFactory: () => 'tx-storage-failure'
  });
  const result = await runner.runWorld({ state, input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(result.state.codex, state.codex);
  assert.deepEqual(result.state.equipment, state.equipment);
  assert.deepEqual(await transcriptStore.allTurns(state.journeyId), []);
  assert.match(result.error, /quota full/);
});

test('a final autosave conflict removes only this appended turn and returns the authoritative state', async () => {
  const transcripts = createTranscriptStore({ memory: new Map() });
  const storage = createStorage(memoryStorage());
  const state = seededAiState();
  storage.saveAuto('ai', state);
  await transcripts.appendTurn(state.journeyId, {
    id: 'existing', kind: 'world', blocks: [{ type: 'narr', text: '别的标签页留下的旧记录。' }]
  });
  let saves = 0;
  const stateStore = {
    saveAuto: (...args) => storage.saveAuto(...args),
    loadAuto: (...args) => storage.loadAuto(...args),
    async saveAutoIfJourney(...args) {
      saves += 1;
      if (saves === 2) {
        const otherTab = storage.loadAuto('ai');
        otherTab.player.gold = 77;
        await storage.saveAutoIfJourney('ai', otherTab, otherTab.journeyId, otherTab.revision);
      }
      return storage.saveAutoIfJourney(...args);
    }
  };
  const runner = createAiTurnRunner({
    aiClient: { narrate: async () => validWorldResponse() }, transcriptStore: transcripts, stateStore,
    idFactory: () => 'tx-conflicted-final-save'
  });

  const result = await runner.runWorld({ state, input: '查看门缝', settings: { provider: 'groq' } });

  assert.equal(result.ok, false);
  assert.equal(result.state.player.gold, 77);
  assert.deepEqual((await transcripts.allTurns(state.journeyId)).map((turn) => turn.id), ['existing']);
});

test('a durable journal recovers a committed world turn after transcript storage fails', async () => {
  const backing = createTranscriptStore({ memory: new Map() });
  let failAppend = true;
  const transcripts = {
    recentTurns: (...args) => backing.recentTurns(...args),
    allTurns: (...args) => backing.allTurns(...args),
    appendTurn: (...args) => failAppend ? Promise.reject(new Error('indexeddb unavailable')) : backing.appendTurn(...args),
    deleteTurn: (...args) => backing.deleteTurn(...args)
  };
  const storage = createStorage(memoryStorage());
  const state = seededAiState();
  storage.saveAuto('ai', state);
  const runner = createAiTurnRunner({
    aiClient: { narrate: async () => validWorldResponse() },
    transcriptStore: transcripts, stateStore: storage, idFactory: () => 'tx-journal'
  });
  const result = await runner.runWorld({ state, input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.equal(storage.loadAuto('ai').transactionJournal.turn.id, 'tx-journal');
  assert.deepEqual(await backing.allTurns(state.journeyId), []);

  failAppend = false;
  const recovered = await storage.recoverPendingTurn('ai', storage.loadAuto('ai'), transcripts);
  assert.equal(recovered.transactionJournal, null);
  assert.equal((await backing.allTurns(state.journeyId))[0].id, 'tx-journal');
});

test('provider switching changes only the next request and keeps one AI journey', async () => {
  const providers = [];
  let counter = 0;
  const runner = createAiTurnRunner({
    aiClient: { narrate: async (settings) => {
      providers.push(settings.provider);
      return validWorldResponse(settings.provider === 'groq'
        ? '门缝外掠过两道人影，其中一人腰间挂着赵府铁牌。'
        : '屋梁落下灰尘，后窗插销早已腐烂；雨巷里只有一辆运药板车停在墙根。');
    } },
    transcriptStore: createTranscriptStore({ memory: new Map() }),
    idFactory: () => `tx-${++counter}`
  });
  const first = await runner.runWorld({ state: seededAiState(), input: '第一次查探', settings: { provider: 'groq' } });
  const second = await runner.runWorld({ state: first.state, input: '换个角度查探', settings: { provider: 'mistral' } });
  assert.equal(second.ok, true);
  assert.deepEqual(providers, ['groq', 'mistral']);
  assert.equal(second.state.journeyId, 'ai-journey');
});

test('model trials return diagnostics without accepting game state', async () => {
  const runner = runnerWithNarrator(async () => validWorldResponse('试炼场中的纸鹤绕梁一周，落在青石棋盘上。'));
  const result = await runner.runTrial({ settings: { provider: 'groq' }, trial: '纸鹤试炼' });
  assert.equal(result.parsePassed, true);
  assert.equal(result.progressPassed, true);
  assert.equal(typeof result.repetitionScore, 'number');
  assert.equal(result.latencyMs, 0);
});

test('large histories and memories are compacted below the site proxy message limit', async () => {
  const state = seededAiState();
  state.memory.chapterSummaries = Array.from({ length: 20 }, (_, index) => ({
    chapterId: `chapter-${index}`, summary: `第${index}章${'旧事'.repeat(500)}`
  }));
  state.memory.facts = Array.from({ length: 50 }, (_, index) => ({
    id: `fact:bulk-${index}`, subjectId: 'world:bulk', predicate: 'remembers',
    object: `事实${index}${'细节'.repeat(100)}`, sourceTurnId: 'seed', createdAtTurn: index, locked: false
  }));
  const transcripts = createTranscriptStore({ memory: new Map() });
  for (let index = 0; index < 10; index += 1) {
    await transcripts.appendTurn(state.journeyId, {
      id: `bulk-${index}`, kind: 'world', userText: `行动${index}${'很长'.repeat(300)}`,
      blocks: [{ type: 'narr', text: `历史${index}${'往事'.repeat(3_000)}` }], suggestions: ['继续调查']
    });
  }
  let captured;
  const runner = createAiTurnRunner({
    aiClient: { narrate: async (_settings, context) => { captured = context.messages; return validWorldResponse(); } },
    transcriptStore: transcripts,
    idFactory: () => 'tx-bounded'
  });
  const result = await runner.runWorld({ state, input: '查看门缝', settings: { provider: 'groq' } });
  assert.equal(result.ok, true);
  assert.ok(captured.every((message) => message.content.length <= 6_000));
});

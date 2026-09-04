import { migrateGameState } from './game-state.js';
import { applyValidatedEffects } from './game-engine.js';
import { CHAPTERS, ITEMS, LOCATIONS, NPCS, QUESTS } from './game-data.js';

const TIME_COSTS = { instant: 0, brief: 10, scene: 60, long: 240 };
const EFFECT_CAPS = {
  qi: [0, 80], spirit: [-40, 30], hp: [-80, 40], gold: [-100, 100]
};
const PROGRESS_PREFIXES = ['opening:', 'scene:', 'chapter:', 'quest:', 'fact:', 'relationship:', 'danger:', 'battle:', 'discovery:'];
const AUTHORED_FACTS = {
  'fact:forest-footprints': {
    progressId: 'discovery:forest-footprints',
    subjectId: 'location:cherry-forest', predicate: 'contains', object: '后山出现了不属于落霞宗的魔修足迹'
  }
};
const AUTHORED_NPCS_BY_ID = new Map(Object.entries(NPCS).map(([name, npc]) => [npc.id, { name, ...npc }]));
const PLAYER_PUPPET_PATTERNS = [
  /你(?:立刻|毫不犹豫地|终于)?(?:答应|同意|拒绝|决定|选择|承诺|发誓|加入|背叛|爱上)/,
  /你(?:感到|觉得)(?:无比|非常|由衷)?(?:喜悦|幸福|悔恨|忠诚|爱慕|憎恨)/,
  /你说道[：:“\"]|你回答[：:“\"]|你开口(?:答应|拒绝)/
];

const cleanText = (value, max) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const cleanId = (value, max = 100) => cleanText(value, max).replace(/[^\p{L}\p{N}_.:/\-]/gu, '');
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function currentChapter(state) {
  const exact = CHAPTERS.find((chapter) => chapter.id === state.director.chapterId);
  return exact || CHAPTERS.find((chapter) => chapter.act === state.story.act) || CHAPTERS[0];
}

function intrinsicFactId(npcId) {
  return `fact:authored:${String(npcId).replace(/^npc:/, '')}:identity`;
}

function intrinsicFact(name, npc) {
  return {
    id: intrinsicFactId(npc.id),
    subjectId: npc.id,
    predicate: 'identity',
    object: `${name}是${npc.role}；${npc.description}`,
    sourceTurnId: 'world-bible',
    createdAtTurn: 0,
    locked: true
  };
}

function authoredActor(name, npc, state) {
  const existing = state.memory.entities[npc.id];
  return {
    id: npc.id,
    name,
    status: existing?.status || 'alive',
    location: existing?.location || npc.location,
    role: npc.role,
    purpose: existing?.purpose || npc.description,
    knownFactIds: [...new Set([
      intrinsicFactId(npc.id), ...(existing?.knownFactIds || []), ...(existing?.facts || [])
    ])]
  };
}

function contractActors(state, input) {
  const actors = new Map();
  for (const [name, npc] of Object.entries(NPCS)) {
    if (npc.location === state.story.location || String(input).includes(name) || state.memory.entities[npc.id]?.location === state.story.location) {
      actors.set(npc.id, authoredActor(name, npc, state));
    }
  }
  for (const entity of Object.values(state.memory.entities)) {
    if (entity.kind !== 'npc') continue;
    if (AUTHORED_NPCS_BY_ID.has(entity.id)) continue;
    if (entity.location === state.story.location || String(input).includes(entity.name)) {
      actors.set(entity.id, {
        id: entity.id, name: entity.name, status: entity.status, location: entity.location,
        purpose: entity.purpose, knownFactIds: [...new Set([...(entity.knownFactIds || []), ...(entity.facts || [])])]
      });
    }
  }
  return [...actors.values()].slice(0, 16);
}

export function createSceneContract(source, input, turnId) {
  const state = migrateGameState(source, 'ai');
  const chapter = currentChapter(state);
  const actors = contractActors(state, input);
  const actorFactIds = new Set(actors.flatMap((actor) => actor.knownFactIds));
  const rememberedFacts = state.memory.facts
    .filter((fact) => fact.locked || actorFactIds.has(fact.id) || chapter.requiredFacts.includes(fact.id))
    .slice(-40);
  const intrinsicFacts = actors
    .map((actor) => AUTHORED_NPCS_BY_ID.get(actor.id))
    .filter(Boolean)
    .map((npc) => intrinsicFact(npc.name, npc));
  const facts = [...new Map([...rememberedFacts, ...intrinsicFacts].map((fact) => [fact.id, fact])).values()];
  const clocks = { ...state.director.dangerClocks };
  if (chapter.dangerClock?.id && !(chapter.dangerClock.id in clocks)) clocks[chapter.dangerClock.id] = 0;
  const unlockedLocations = Object.entries(LOCATIONS)
    .filter(([, location]) => state.story.act >= location.act && state.player.realm >= location.realm)
    .map(([name, location]) => ({ id: location.id, name }));

  return deepFreeze({
    turnId: cleanId(turnId) || `turn-${state.memory.turnCount + 1}`,
    playerInput: cleanText(input, 2_000),
    chapter: {
      id: chapter.id, act: chapter.act, entry: chapter.entry,
      requiredFacts: [...chapter.requiredFacts], optionalThreads: [...chapter.optionalThreads],
      requiredDiscoveries: chapter.requiredFacts.map((factId) => ({
        factId,
        progressId: AUTHORED_FACTS[factId]?.progressId || null,
        description: AUTHORED_FACTS[factId]?.object || null
      })),
      dangerClock: structuredClone(chapter.dangerClock), exits: structuredClone(chapter.exits)
    },
    sceneGoal: state.director.sceneGoal || chapter.goal,
    location: { id: LOCATIONS[state.story.location]?.id || 'location:unknown', name: state.story.location },
    actors,
    facts,
    dangerClocks: Object.entries(clocks).map(([id, value]) => ({
      id, value, limit: chapter.dangerClock?.id === id ? chapter.dangerClock.limit : 100
    })),
    openLoopIds: [...state.director.openLoops],
    legalItemIds: Object.keys(ITEMS),
    legalLocations: unlockedLocations,
    legalQuestIds: Object.keys(QUESTS),
    legalRelationshipIds: Object.keys(NPCS),
    effectCaps: structuredClone(EFFECT_CAPS),
    requiredProgressCategories: [...PROGRESS_PREFIXES],
    idleLimit: 2,
    consecutiveIdleTurns: state.director.consecutiveIdleTurns,
    player: {
      realm: state.player.realm, hp: state.player.hp, maxHp: state.player.maxHp,
      qi: state.player.qi, spirit: state.player.spirit, maxSpirit: state.player.maxSpirit,
      gold: state.player.gold
    }
  });
}

function effectiveClockDeltas(contract, narration) {
  const requested = narration?.progress?.dangerClocks && typeof narration.progress.dangerClocks === 'object'
    ? narration.progress.dangerClocks
    : {};
  const output = new Map();
  for (const clock of contract.dangerClocks) {
    const explicit = Object.hasOwn(requested, clock.id);
    const value = explicit
      ? Number(requested[clock.id])
      : narration.timeCost !== 'instant' && contract.chapter.dangerClock?.id === clock.id ? 1 : 0;
    output.set(clock.id, value);
  }
  return output;
}

function hasMeaningfulProgress(advanced, narration, contract) {
  const exitIds = new Set(contract.chapter.exits.map((exit) => exit.progressId));
  const clockIds = new Set(contract.dangerClocks.map((clock) => clock.id));
  const hasMemoryFact = Array.isArray(narration?.memory?.facts) && narration.memory.facts.length > 0;
  const relationshipChanged = narration?.effects?.relationships
    && Object.values(narration.effects.relationships).some((value) => Number(value) !== 0);
  return advanced.some((id) => {
    if (id.startsWith('opening:')) return true;
    if (exitIds.has(id)) return true;
    if (id.startsWith('quest:')) {
      return contract.legalQuestIds.some((questId) => id === `quest:${questId}` || id.startsWith(`quest:${questId}:`));
    }
    if (id.startsWith('danger:')) return [...clockIds].some((clockId) => id.startsWith(`danger:${clockId}:`));
    if (id.startsWith('discovery:')) {
      return Object.values(AUTHORED_FACTS).some((fact) => fact.progressId === id) || hasMemoryFact;
    }
    if (id.startsWith('fact:')) return hasMemoryFact;
    if (id.startsWith('relationship:')) return relationshipChanged;
    return id.startsWith('battle:');
  }) || Boolean(narration?.effects?.location);
}

function fingerprintFor(narration) {
  const blocks = Array.isArray(narration?.blocks) ? narration.blocks : [];
  const speakers = blocks.filter((block) => block?.type === 'dlg').map((block) => cleanText(block.name, 40)).filter(Boolean);
  const text = blocks.map((block) => cleanText(block?.text, 12_000)).join(' ');
  const verbs = [...text.matchAll(/(发现|追问|拒绝|接受|攻击|防御|前往|调查|逃离|救下|交付|承诺|揭露|开启|关闭|死亡|受伤|出现|消失)/g)].map((match) => match[1]);
  const progress = Array.isArray(narration?.progress?.advanced)
    ? narration.progress.advanced.map((id) => cleanId(id)).filter(Boolean)
    : [];
  const tail = text.replace(/[\s，。！？、：“”‘’.,!?;:]/g, '').slice(-120);
  return [...new Set(speakers)].sort().join(',') + '|' + [...new Set(verbs)].sort().join(',') + '|' + progress.sort().join(',') + '|' + tail;
}

function fingerprintTokens(value) {
  const text = String(value || '').toLowerCase();
  const tokens = new Set(text.match(/[a-z0-9:_-]+|[\p{Script=Han}]/gu) || []);
  const han = (text.match(/[\p{Script=Han}]/gu) || []).join('');
  for (let index = 0; index < han.length - 1; index += 1) tokens.add(han.slice(index, index + 2));
  return tokens;
}

function similarity(left, right) {
  const a = fingerprintTokens(left);
  const b = fingerprintTokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function validateEffects(contract, effects, errors) {
  if (effects == null) return {};
  if (typeof effects !== 'object' || Array.isArray(effects)) {
    errors.push('数值效果必须是对象。');
    return {};
  }
  const normalized = {};
  for (const [key, [minimum, maximum]] of Object.entries(EFFECT_CAPS)) {
    if (effects[key] === undefined) continue;
    const value = Number(effects[key]);
    if (!Number.isFinite(value) || value < minimum || value > maximum) errors.push(`${key} 超出单回合限制。`);
    else normalized[key] = value;
  }
  if (effects.location !== undefined) {
    const legalNames = new Set(contract.legalLocations.flatMap((location) => [location.name, location.id]));
    if (!legalNames.has(effects.location)) errors.push('地点不在当前合法地点列表中。');
    else normalized.location = contract.legalLocations.find((location) => location.id === effects.location)?.name || effects.location;
  }
  if (effects.addItems !== undefined) {
    if (!effects.addItems || typeof effects.addItems !== 'object' || Array.isArray(effects.addItems)) errors.push('物品效果格式无效。');
    else {
      normalized.addItems = {};
      for (const [name, amount] of Object.entries(effects.addItems)) {
        if (!contract.legalItemIds.includes(name)) errors.push(`未知物品：${name}。`);
        else if (!Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > 5) errors.push(`${name} 的数量超出限制。`);
        else normalized.addItems[name] = Number(amount);
      }
    }
  }
  if (effects.relationships !== undefined) {
    if (!effects.relationships || typeof effects.relationships !== 'object' || Array.isArray(effects.relationships)) errors.push('关系效果格式无效。');
    else {
      normalized.relationships = {};
      for (const [name, amount] of Object.entries(effects.relationships)) {
        const value = Number(amount);
        if (!contract.legalRelationshipIds.includes(name)) errors.push(`未知关系角色：${name}。`);
        else if (!Number.isFinite(value) || value < -20 || value > 20) errors.push(`${name} 的关系变化超出限制。`);
        else normalized.relationships[name] = value;
      }
    }
  }
  if (effects.addQuests !== undefined) {
    const quests = Array.isArray(effects.addQuests) ? effects.addQuests : [];
    if (quests.some((id) => !contract.legalQuestIds.includes(id))) errors.push('任务效果包含未知任务。');
    else normalized.addQuests = quests;
  }
  return normalized;
}

export function validateAiWorldTurn(source, contract, narration, recentTurns = []) {
  const state = migrateGameState(source, 'ai');
  const errors = [];
  if (!narration || typeof narration !== 'object' || Array.isArray(narration)) {
    return { ok: false, errors: ['AI 回应不是对象。'], fingerprint: '' };
  }
  const blocks = Array.isArray(narration.blocks) ? narration.blocks : [];
  if (blocks.length < 1 || blocks.length > 8) errors.push('内容块必须为 1–8 个。');
  const actorByName = new Map(contract.actors.map((actor) => [actor.name, actor]));
  const factsByActor = narration.usedFactIdsByActor && typeof narration.usedFactIdsByActor === 'object'
    ? narration.usedFactIdsByActor
    : {};
  for (const block of blocks) {
    if (!block || !['narr', 'dlg', 'sys'].includes(block.type) || !cleanText(block.text, 12_000)) errors.push('存在空白或非法内容块。');
    if (block?.type === 'dlg') {
      const actor = actorByName.get(cleanText(block.name, 40));
      const generated = Array.isArray(narration.entities) && narration.entities.some((entity) => cleanText(entity?.name, 40) === cleanText(block.name, 40));
      if (!actor && !generated) errors.push(`未登记角色不能发言：${cleanText(block.name, 40)}。`);
      if (actor?.status === 'dead') errors.push(`死亡角色不能发言：${actor.name}。`);
      if (!Array.isArray(block.factIds)) errors.push(`角色 ${actor?.id || cleanText(block.name, 40)} 的对白缺少逐段事实引用。`);
      const blockFactIds = Array.isArray(block.factIds) ? block.factIds.map((id) => cleanId(id)).filter(Boolean) : [];
      if (actor && blockFactIds.some((id) => !actor.knownFactIds.includes(id))) {
        errors.push(`角色 ${actor.id} 使用了知识边界之外的事实。`);
      }
      if (actor && AUTHORED_NPCS_BY_ID.has(actor.id) && !blockFactIds.length) {
        errors.push(`角色 ${actor.id} 的对白缺少知识来源引用。`);
      }
    }
  }
  const allText = blocks.map((block) => cleanText(block?.text, 12_000)).join('');
  for (const actor of contract.actors.filter((candidate) => candidate.status === 'dead')) {
    const relevant = blocks.map((block) => cleanText(block?.text, 12_000)).filter((text) => text.includes(actor.name));
    const active = relevant.some((text) => /(?:出现|赶来|走|跑|推|挥|攻击|招手|开口|说道|回答|起身|站起|进入|离开)/u.test(text)
      && !/(?:回忆|遗言|画像|幻象|梦境|尸体|遗骸)/u.test(text));
    if (active) errors.push(`死亡角色不能重新参与当前行动：${actor.name}。`);
  }
  if (PLAYER_PUPPET_PATTERNS.some((pattern) => pattern.test(allText))) errors.push('AI 不得替玩家说话、决定关键选择或指定感受。');

  const suggestions = Array.isArray(narration.suggestions) ? narration.suggestions.filter((value) => cleanText(value, 160)) : [];
  if (suggestions.length < 2 || suggestions.length > 5) errors.push('必须提供 2–5 个有区别的后续行动。');
  if (!(narration.timeCost in TIME_COSTS)) errors.push('timeCost 必须是 instant、brief、scene 或 long。');

  const progress = narration.progress && typeof narration.progress === 'object' ? narration.progress : {};
  const advanced = Array.isArray(progress.advanced) ? progress.advanced.map((id) => cleanId(id)).filter(Boolean) : [];
  if (!advanced.length || advanced.some((id) => !PROGRESS_PREFIXES.some((prefix) => id.startsWith(prefix)))) {
    errors.push('世界回合必须包含至少一项有效进展。');
  }
  const chapterExitIds = new Set(contract.chapter.exits.map((exit) => exit.progressId));
  const advancesChapter = advanced.some((id) => chapterExitIds.has(id));
  if (contract.consecutiveIdleTurns >= contract.idleLimit && contract.chapter.exits.length
    && !hasMeaningfulProgress(advanced, narration, contract)) {
    errors.push('连续空转已达上限，本回合必须推动主线压力、线索、任务或有效支路。');
  }
  if (advancesChapter) {
    const knownFacts = new Set(contract.facts.map((fact) => fact.id));
    const missingFacts = contract.chapter.requiredFacts.filter((id) => !knownFacts.has(id)
      && (!AUTHORED_FACTS[id]?.progressId || !advanced.includes(AUTHORED_FACTS[id].progressId)));
    if (missingFacts.length) errors.push(`章节前置事实尚未满足：${missingFacts.join('、')}。`);
  }
  const legalClockIds = new Set(contract.dangerClocks.map((clock) => clock.id));
  for (const [id, delta] of Object.entries(progress.dangerClocks || {})) {
    const value = Number(delta);
    if (!legalClockIds.has(id)) errors.push(`未知危险时钟：${id}。`);
    else if (!Number.isFinite(value) || value < 0 || value > 3) errors.push(`危险时钟 ${id} 的变化超出限制。`);
  }
  for (const clock of contract.dangerClocks) {
    const delta = effectiveClockDeltas(contract, narration).get(clock.id) || 0;
    if (clock.value + delta >= clock.limit) {
      const eruption = advanced.some((id) => id.startsWith(`danger:${clock.id}:`));
      const consequences = Array.isArray(progress.consequences) && progress.consequences.some((value) => cleanText(value, 160));
      if (!eruption || !consequences) errors.push(`危险时钟 ${clock.id} 已满，必须结算爆发及其明确后果。`);
    }
  }
  const hasEffect = narration.effects && Object.entries(narration.effects).some(([, value]) => {
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return Boolean(value);
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  });
  const hasClockChange = progress.dangerClocks && Object.values(progress.dangerClocks).some((value) => Number(value) !== 0);
  const hasLoopChange = (Array.isArray(progress.openLoops) && progress.openLoops.length)
    || (Array.isArray(progress.resolvedLoops) && progress.resolvedLoops.length);
  if (narration.timeCost === 'instant' && !hasEffect && !hasClockChange && !hasLoopChange) errors.push('回合没有产生状态、时间或危险变化。');

  const normalizedEffects = validateEffects(contract, narration.effects || {}, errors);
  const actorById = new Map(contract.actors.map((actor) => [actor.id, actor]));
  for (const [actorId, factIds] of Object.entries(factsByActor)) {
    const actor = actorById.get(actorId);
    if (!actor || !Array.isArray(factIds) || factIds.some((id) => !actor.knownFactIds.includes(id))) {
      errors.push(`角色 ${actorId} 使用了知识边界之外的事实。`);
    }
  }

  const fingerprint = fingerprintFor(narration);
  const recentFingerprints = [
    ...state.director.recentFingerprints,
    ...recentTurns.filter((turn) => !turn.kind || turn.kind === 'world').map((turn) => turn.fingerprint || fingerprintFor(turn))
  ].filter(Boolean).slice(-2);
  if (recentFingerprints.some((previous) => similarity(previous, fingerprint) > 0.82)) errors.push('叙事与最近世界回合高度重复，形成循环。');
  return { ok: errors.length === 0, errors: [...new Set(errors)], fingerprint, normalizedEffects };
}

function periodForMinute(minute) {
  if (minute < 360) return '夜晚';
  if (minute < 720) return '清晨';
  if (minute < 1020) return '白昼';
  if (minute < 1200) return '黄昏';
  return '夜晚';
}

export function commitValidatedWorldTurn(source, contract, narration) {
  const validation = validateAiWorldTurn(source, contract, narration, []);
  if (!validation.ok) throw new Error(`AI 世界回合未通过验证：${validation.errors.join('；')}`);
  let state = applyValidatedEffects(source, validation.normalizedEffects);
  const minutes = TIME_COSTS[narration.timeCost];
  const totalMinutes = state.story.minuteOfDay + minutes;
  state.story.day += Math.floor(totalMinutes / 1440);
  state.story.minuteOfDay = totalMinutes % 1440;
  state.story.period = periodForMinute(state.story.minuteOfDay);

  const progress = narration.progress || {};
  const advanced = Array.isArray(progress.advanced) ? progress.advanced.map((id) => cleanId(id)).filter(Boolean) : [];
  for (const [factId, fact] of Object.entries(AUTHORED_FACTS)) {
    if (!advanced.includes(fact.progressId) || state.memory.facts.some((entry) => entry.id === factId)) continue;
    state.memory.facts.push({
      id: factId, subjectId: fact.subjectId, predicate: fact.predicate, object: fact.object,
      sourceTurnId: contract.turnId, createdAtTurn: state.memory.turnCount + 1, locked: true
    });
  }
  const aftermath = [];
  for (const clock of contract.dangerClocks) {
    const delta = effectiveClockDeltas(contract, narration).get(clock.id) || 0;
    const projected = clamp((state.director.dangerClocks[clock.id] || 0) + delta, 0, clock.limit);
    if (projected >= clock.limit) {
      state.director.dangerClocks[clock.id] = 0;
      aftermath.push(`danger:${clock.id}:aftermath:${state.memory.turnCount + 1}`);
    } else {
      state.director.dangerClocks[clock.id] = projected;
    }
  }
  const resolved = new Set(Array.isArray(progress.resolvedLoops) ? progress.resolvedLoops.map((id) => cleanId(id)) : []);
  state.director.openLoops = [...new Set([
    ...state.director.openLoops.filter((id) => !resolved.has(id)),
    ...(Array.isArray(progress.openLoops) ? progress.openLoops.map((id) => cleanId(id)).filter(Boolean) : []),
    ...aftermath
  ])].slice(-40);
  state.director.recentFingerprints = [...state.director.recentFingerprints, validation.fingerprint].slice(-8);

  const chapter = CHAPTERS.find((candidate) => candidate.id === contract.chapter.id) || currentChapter(state);
  const exit = chapter.exits.find((candidate) => advanced.includes(candidate.progressId));
  state.director.consecutiveIdleTurns = hasMeaningfulProgress(advanced, narration, contract)
    ? 0
    : clamp(state.director.consecutiveIdleTurns + 1, 0, 10);
  if (exit) {
    const next = CHAPTERS.find((candidate) => candidate.id === exit.nextChapterId);
    if (next) {
      state.director.chapterId = next.id;
      state.director.sceneGoal = next.goal;
      state.story.act = next.act;
      state.story.scene = next.id;
      if (next.dangerClock?.id && !(next.dangerClock.id in state.director.dangerClocks)) state.director.dangerClocks[next.dangerClock.id] = 0;
    }
  }
  state.stats.turns += 1;
  state.memory.turnCount += 1;
  state.updatedAt = new Date().toISOString();
  return migrateGameState(state, 'ai');
}

export function buildRepairMessages(contract, narration, errors = []) {
  const issueList = errors.map((error, index) => `${index + 1}. ${cleanText(error, 240)}`).join('\n');
  return [
    {
      role: 'system',
      content: cleanText(`上一份 JSON 未通过游戏规则验证。只修复结构和逻辑，不得改写玩家输入，不得生成本地替代剧情。\n验证问题：\n${issueList}\n场景目标：${contract.sceneGoal}\n回合编号：${contract.turnId}`, 5_800)
    },
    {
      role: 'user',
      content: cleanText(`请重新输出一个严格 JSON 对象。待修复对象：${JSON.stringify(narration)}`, 5_800)
    }
  ];
}

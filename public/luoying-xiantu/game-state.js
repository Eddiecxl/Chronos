import { derivedPlayerStats, normalizeEquipment } from './equipment.js';

export const GAME_SCHEMA_VERSION = 4;
export const REALM_COUNT = 23;
export const GAME_MODES = ['local', 'ai'];

const DEFAULT_RELATIONSHIPS = {
  '林小满': 0,
  '李老': 0,
  '苏晚晴': 0,
  '钱多多': 0,
  '慕容雪': 0,
  '赵天霸': -10,
  '陆沉舟': 0,
  '宁无妄': -5
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
const cleanText = (value, max = 80) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const cleanId = (value, max = 80) => cleanText(value, max).replace(/[^\p{L}\p{N}_.:/\-]/gu, '');
const defaultId = () => globalThis.crypto?.randomUUID?.()
  || `journey-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const stringList = (value, maxItems = 100, maxLength = 80) => Array.isArray(value)
  ? [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems)
  : [];

function assertMode(mode) {
  if (!GAME_MODES.includes(mode)) throw new Error('游戏模式无效。');
  return mode;
}

function safeMap(value, { maxEntries = 80, min = 0, max = 999 } = {}) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxEntries)) {
    const key = cleanText(rawKey, 48);
    if (key) output[key] = clamp(rawValue, min, max);
  }
  return output;
}

function safeStringMap(value, { maxEntries = 40, maxLength = 1200 } = {}) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxEntries)) {
    const key = cleanId(rawKey, 80);
    const text = cleanText(rawValue, maxLength);
    if (key && text) output[key] = text;
  }
  return output;
}

function safeFlags(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 180)) {
    const key = cleanId(rawKey, 60);
    if (!key) continue;
    if (typeof rawValue === 'boolean') output[key] = rawValue;
    else if (typeof rawValue === 'number') output[key] = clamp(rawValue, -9999, 9999);
    else if (typeof rawValue === 'string') output[key] = cleanText(rawValue, 160);
  }
  return output;
}

function safeQuestList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((entry) => {
    if (typeof entry === 'string') return { id: cleanId(entry), progress: 0, target: 1 };
    if (!isRecord(entry)) return null;
    const id = cleanId(entry.id);
    if (!id) return null;
    return {
      id,
      progress: clamp(entry.progress, 0, 9999),
      target: clamp(entry.target || 1, 1, 9999),
      startedAt: cleanText(entry.startedAt, 40) || undefined
    };
  }).filter(Boolean);
}

function safeFacts(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((entry, index) => {
    if (typeof entry === 'string') {
      const object = cleanText(entry, 160);
      return object ? {
        id: `legacy:fact:${index + 1}`, subjectId: 'world:legacy', predicate: 'remembered', object,
        sourceTurnId: 'legacy', createdAtTurn: index, locked: false
      } : null;
    }
    if (!isRecord(entry)) return null;
    const subjectId = cleanId(entry.subjectId, 80);
    const predicate = cleanId(entry.predicate, 48);
    const object = cleanText(entry.object, 160);
    if (!subjectId || !predicate || !object) return null;
    return {
      id: cleanId(entry.id, 80) || `fact:${index + 1}`,
      subjectId,
      predicate,
      object,
      sourceTurnId: cleanId(entry.sourceTurnId, 80) || 'unknown',
      createdAtTurn: Math.floor(clamp(entry.createdAtTurn, 0, 999999)),
      locked: Boolean(entry.locked)
    };
  }).filter(Boolean);
}

function safeEntities(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawId, rawEntity] of Object.entries(value).slice(0, 240)) {
    if (!isRecord(rawEntity)) continue;
    const id = cleanId(rawEntity.id || rawId, 80);
    const name = cleanText(rawEntity.name, 32);
    if (!id || !name) continue;
    output[id] = {
      id,
      kind: ['npc', 'location'].includes(rawEntity.kind) ? rawEntity.kind : (id.includes(':location:') ? 'location' : 'npc'),
      name,
      status: ['alive', 'dead', 'missing', 'changed'].includes(rawEntity.status) ? rawEntity.status : 'alive',
      location: cleanText(rawEntity.location, 40) || null,
      purpose: cleanText(rawEntity.purpose, 160),
      traits: stringList(rawEntity.traits, 4, 32),
      knownFactIds: stringList(rawEntity.knownFactIds, 80, 80),
      facts: stringList(rawEntity.facts, 80, 80),
      createdTurnId: cleanId(rawEntity.createdTurnId, 80) || undefined,
      lastSeenTurn: Math.floor(clamp(rawEntity.lastSeenTurn, 0, 999999))
    };
  }
  return output;
}

function safePending(value) {
  if (!isRecord(value)) return null;
  const type = cleanId(value.type, 48);
  if (!type) return null;
  const output = { type };
  if (value.id) output.id = cleanId(value.id, 80);
  if (value.value) output.value = cleanText(value.value, 160);
  return output;
}

function safeTransactionJournal(value) {
  if (!isRecord(value) || value.type !== 'ai-world-turn' || !isRecord(value.turn)) return null;
  const id = cleanId(value.turn.id, 100);
  const blocks = Array.isArray(value.turn.blocks) ? value.turn.blocks.slice(0, 8).map((block) => {
    if (!isRecord(block) || !['narr', 'dlg'].includes(block.type)) return null;
    const text = cleanText(block.text, 12_000);
    if (!text) return null;
    return block.type === 'dlg'
      ? { type: 'dlg', name: cleanText(block.name, 40) || '无名之人', text }
      : { type: 'narr', text };
  }).filter(Boolean) : [];
  if (!id || !blocks.length) return null;
  return {
    type: 'ai-world-turn',
    turn: {
      id,
      kind: 'world',
      userText: cleanText(value.turn.userText, 2_000),
      provider: cleanText(value.turn.provider, 40),
      model: cleanText(value.turn.model, 100),
      blocks,
      suggestions: stringList(value.turn.suggestions, 5, 160),
      fingerprint: cleanText(value.turn.fingerprint, 1_000),
      createdAt: cleanText(value.turn.createdAt, 40)
    }
  };
}

function safeBattle(value) {
  if (!isRecord(value)) return null;
  const enemyId = cleanId(value.enemyId, 80);
  if (!enemyId) return null;
  const maxHp = Math.floor(clamp(value.maxHp || value.hp || 1, 1, 999999));
  return {
    enemyId,
    hp: Math.floor(clamp(value.hp, 0, maxHp)),
    maxHp,
    defending: Boolean(value.defending),
    turn: Math.floor(clamp(value.turn || 1, 1, 999999))
  };
}

function cleanName(value) {
  const name = cleanText(value || '顾长生', 12);
  if (!name || /[<>]/.test(String(value ?? ''))) throw new Error('存档中的角色名无效。');
  return name;
}

export function createGameState(name = '顾长生', mode = 'local', idFactory = defaultId) {
  const safeMode = assertMode(mode);
  const journeyId = cleanId(idFactory(), 80);
  if (!journeyId) throw new Error('旅程编号无效。');
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    mode: safeMode,
    journeyId,
    revision: 0,
    player: {
      name: cleanName(name), realm: 0, hp: 100, maxHp: 100,
      qi: 0, spirit: 30, maxSpirit: 30,
      gold: 0, attack: 11, defense: 4
    },
    story: {
      act: 1, scene: 'awakening', day: 1, period: '清晨', minuteOfDay: 360,
      location: '赵府柴房', flags: {}, completedEvents: []
    },
    director: {
      chapterId: 'act1-awakening', sceneGoal: '逃离赵府并接触修行之门',
      dangerClocks: { zhaoPursuit: 0 }, openLoops: [],
      consecutiveIdleTurns: 0, recentFingerprints: [],
      chapterTurns: 0, turnsSinceChapterProgress: 0, pacePressure: 0
    },
    quests: { active: [], completed: [], failed: [] },
    inventory: { items: { '回春丹': 1 }, materials: {}, limit: 36 },
    equipment: normalizeEquipment({}),
    techniques: { known: ['吐纳'], equipped: ['吐纳'], mastery: { '吐纳': 0 } },
    relationships: { ...DEFAULT_RELATIONSHIPS },
    karma: { mercy: 0, ambition: 0, demonic: 0, promises: [] },
    achievements: { unlocked: [], progress: {} },
    codex: { characters: [], locations: ['赵府柴房'], items: ['回春丹'], endings: [] },
    endings: { unlocked: [], newGamePlus: false },
    memory: { chapterSummaries: {}, facts: [], entities: {}, turnCount: 0 },
    battle: null,
    pending: safeMode === 'local' ? { type: 'intro-escape' } : null,
    transactionJournal: null,
    stats: { turns: 0, battlesWon: 0, faceCount: 0, pillsCrafted: 0 },
    settings: { difficulty: 'normal' },
    updatedAt: new Date().toISOString()
  };
}

function normalizeV3(input, expectedMode) {
  const inputMode = GAME_MODES.includes(input?.mode) ? input.mode : null;
  const mode = inputMode || expectedMode || 'local';
  assertMode(mode);
  if (expectedMode && inputMode && inputMode !== expectedMode) throw new Error('存档模式不匹配。');

  const base = createGameState(input?.player?.name || input?.name || '顾长生', mode);
  const player = isRecord(input.player) ? input.player : {};
  const story = isRecord(input.story) ? input.story : {};
  const director = isRecord(input.director) ? input.director : {};
  const inventory = isRecord(input.inventory) ? input.inventory : {};
  const techniques = isRecord(input.techniques) ? input.techniques : {};
  const relationships = { ...DEFAULT_RELATIONSHIPS, ...safeMap(input.relationships, { min: -100, max: 100 }) };
  const karma = isRecord(input.karma) ? input.karma : {};
  const achievements = isRecord(input.achievements) ? input.achievements : {};
  const codex = isRecord(input.codex) ? input.codex : {};
  const endings = isRecord(input.endings) ? input.endings : {};
  const memory = isRecord(input.memory) ? input.memory : {};
  const stats = isRecord(input.stats) ? input.stats : {};
  const settings = isRecord(input.settings) ? input.settings : {};
  const quests = isRecord(input.quests) ? input.quests : {};

  base.journeyId = cleanId(input.journeyId, 80) || base.journeyId;
  base.revision = Math.floor(clamp(input.revision, 0, 999_999_999));
  const maxSpirit = Math.floor(clamp(player.maxSpirit ?? Math.max(30, finite(player.spirit, 30)), 1, 9999));
  base.player = {
    name: cleanName(player.name || base.player.name),
    realm: Math.floor(clamp(player.realm, 0, REALM_COUNT - 1)),
    maxHp: Math.floor(clamp(player.maxHp || 100, 1, 9999)),
    hp: 1,
    qi: Math.floor(clamp(player.qi ?? player.exp, 0, 999999)),
    spirit: Math.floor(clamp(player.spirit ?? maxSpirit, 0, 9999)),
    maxSpirit,
    gold: Math.floor(clamp(player.gold, 0, 999999)),
    attack: Math.floor(clamp(player.attack || 11, 1, 9999)),
    defense: Math.floor(clamp(player.defense || 4, 0, 9999))
  };
  base.player.hp = Math.floor(clamp(player.hp ?? base.player.maxHp, 0, base.player.maxHp));
  base.story = {
    act: Math.floor(clamp(story.act || 1, 1, 5)),
    scene: cleanId(story.scene || 'awakening', 60) || 'awakening',
    day: Math.floor(clamp(story.day || 1, 1, 99999)),
    period: ['清晨', '白昼', '黄昏', '夜晚'].includes(story.period) ? story.period : '清晨',
    minuteOfDay: Math.floor(clamp(story.minuteOfDay ?? 360, 0, 1439)),
    location: cleanText(story.location || '赵府柴房', 40) || '赵府柴房',
    flags: safeFlags(story.flags),
    completedEvents: stringList(story.completedEvents, 300, 60)
  };
  base.director = {
    chapterId: cleanId(director.chapterId, 80) || base.director.chapterId,
    sceneGoal: cleanText(director.sceneGoal, 240) || base.director.sceneGoal,
    dangerClocks: safeMap(director.dangerClocks, { maxEntries: 30, min: 0, max: 100 }),
    openLoops: stringList(director.openLoops, 40, 80),
    consecutiveIdleTurns: Math.floor(clamp(director.consecutiveIdleTurns, 0, 10)),
    recentFingerprints: stringList(director.recentFingerprints, 8, 240),
    chapterTurns: Math.floor(clamp(director.chapterTurns, 0, 999999)),
    turnsSinceChapterProgress: Math.floor(clamp(director.turnsSinceChapterProgress, 0, 99)),
    pacePressure: Math.floor(clamp(director.pacePressure, 0, 3))
  };
  base.quests = {
    active: safeQuestList(quests.active),
    completed: stringList(quests.completed, 100, 60),
    failed: stringList(quests.failed, 100, 60)
  };
  base.inventory = {
    items: safeMap(inventory.items),
    materials: safeMap(inventory.materials),
    limit: Math.floor(clamp(inventory.limit || 36, 12, 120))
  };
  const equipment = isRecord(input.equipment) ? input.equipment : {};
  base.equipment = normalizeEquipment(equipment);
  base.player.spirit = Math.min(base.player.spirit, derivedPlayerStats(base).maxSpirit);
  base.techniques = {
    known: stringList(techniques.known, 30, 32),
    equipped: stringList(techniques.equipped, 4, 32),
    mastery: safeMap(techniques.mastery, { maxEntries: 30, min: 0, max: 100 })
  };
  if (!base.techniques.known.length) base.techniques.known = ['吐纳'];
  if (!base.techniques.equipped.length) base.techniques.equipped = ['吐纳'];
  base.relationships = relationships;
  base.karma = {
    mercy: clamp(karma.mercy, -20, 20),
    ambition: clamp(karma.ambition, -20, 20),
    demonic: clamp(karma.demonic, -20, 20),
    promises: stringList(karma.promises, 30, 100)
  };
  base.achievements = {
    unlocked: stringList(achievements.unlocked, 100, 60),
    progress: safeMap(achievements.progress, { maxEntries: 100, min: 0, max: 99999 })
  };
  base.codex = {
    characters: stringList(codex.characters, 100, 40),
    locations: stringList(codex.locations, 100, 40),
    items: stringList(codex.items, 200, 40),
    endings: stringList(codex.endings, 20, 40)
  };
  if (mode === 'ai' && !isRecord(input.codex)) {
    const ownedItems = [...new Set([
      ...Object.entries(base.inventory.items),
      ...Object.entries(base.inventory.materials)
    ].filter(([, amount]) => amount > 0).map(([name]) => name))];
    const storedLocation = cleanText(story.location, 40);
    base.codex.locations = storedLocation ? [storedLocation] : [];
    base.codex.items = ownedItems;
  }
  base.endings = {
    unlocked: stringList(endings.unlocked, 20, 40),
    newGamePlus: Boolean(endings.newGamePlus)
  };
  const chapterSummaries = safeStringMap(memory.chapterSummaries, { maxEntries: 30, maxLength: 1200 });
  const legacySummary = cleanText(memory.summary, 1200);
  if (legacySummary && !chapterSummaries.legacy) chapterSummaries.legacy = legacySummary;
  base.memory = {
    chapterSummaries,
    facts: safeFacts(memory.facts),
    entities: safeEntities(memory.entities),
    turnCount: Math.floor(clamp(memory.turnCount, 0, 999999))
  };
  base.battle = safeBattle(input.battle);
  base.pending = safePending(input.pending);
  base.transactionJournal = mode === 'ai' ? safeTransactionJournal(input.transactionJournal) : null;
  base.stats = {
    turns: Math.floor(clamp(stats.turns, 0, 999999)),
    battlesWon: Math.floor(clamp(stats.battlesWon, 0, 999999)),
    faceCount: Math.floor(clamp(stats.faceCount, 0, 999999)),
    pillsCrafted: Math.floor(clamp(stats.pillsCrafted, 0, 999999))
  };
  base.settings = { difficulty: ['story', 'normal', 'hard'].includes(settings.difficulty) ? settings.difficulty : 'normal' };
  base.updatedAt = cleanText(input.updatedAt, 40) || new Date().toISOString();
  return base;
}

function migrateV1(input, mode) {
  const state = createGameState(input.name || '顾长生', mode);
  state.player.realm = Math.floor(clamp(input.realm, 0, REALM_COUNT - 1));
  state.player.maxHp = Math.max(100, 100 + Math.max(0, state.player.realm - 1) * 22);
  state.player.hp = Math.floor(clamp(input.hp ?? state.player.maxHp, 0, state.player.maxHp));
  state.player.qi = Math.floor(clamp(input.exp, 0, 999999));
  state.player.spirit = Math.floor(clamp(input.spirit ?? state.player.spirit, 0, 9999));
  state.player.maxSpirit = Math.max(30, state.player.spirit);
  state.player.gold = Math.floor(clamp(input.gold, 0, 999999));
  state.story.day = Math.floor(clamp(input.day || 1, 1, 99999));
  state.story.location = cleanText(input.loc || '赵府柴房', 40) || '赵府柴房';
  state.story.flags = safeFlags(input.flags);
  state.relationships = { ...state.relationships, ...safeMap(input.aff, { min: -100, max: 100 }) };
  state.inventory.items = { ...state.inventory.items, ...safeMap(input.items) };
  state.stats.faceCount = Math.floor(clamp(input.face, 0, 999999));
  if (input.art) state.techniques.known.push('落樱剑诀');
  if (input.xuantie) {
    state.inventory.items['玄铁剑'] = 1;
    state.equipment.weapon = '玄铁剑';
  }
  if (isRecord(input.memory)) {
    const summary = cleanText(input.memory.summary, 1200);
    if (summary) state.memory.chapterSummaries.legacy = summary;
    state.memory.facts = safeFacts(input.memory.facts);
    state.memory.turnCount = Math.floor(clamp(input.memory.turnCount, 0, 999999));
  }
  return normalizeV3(state, mode);
}

export function migrateGameState(input, expectedMode) {
  if (!isRecord(input)) throw new Error('存档格式无效。');
  if (expectedMode !== undefined) assertMode(expectedMode);
  if (Number(input.schemaVersion) >= 2 || isRecord(input.player)) return normalizeV3(input, expectedMode);
  return migrateV1(input, expectedMode || 'local');
}

export function validateImportedState(input, expectedMode) {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > 400_000) throw new Error('存档文件过大。');
    try { value = JSON.parse(value); }
    catch { throw new Error('存档不是有效的 JSON。'); }
  }
  if (!isRecord(value)) throw new Error('存档格式无效。');
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch { throw new Error('存档无法读取。'); }
  if (serialized.length > 400_000) throw new Error('存档文件过大。');
  if (!value.player && !value.name) throw new Error('存档缺少角色资料。');
  return migrateGameState(value, expectedMode);
}

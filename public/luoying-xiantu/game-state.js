export const GAME_SCHEMA_VERSION = 2;
export const REALM_COUNT = 23;

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
const stringList = (value, maxItems = 100, maxLength = 80) => Array.isArray(value)
  ? [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems)
  : [];

function safeMap(value, { maxEntries = 80, min = 0, max = 999 } = {}) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxEntries)) {
    const key = cleanText(rawKey, 32);
    if (key) output[key] = clamp(rawValue, min, max);
  }
  return output;
}

function safeFlags(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 160)) {
    const key = cleanId(rawKey, 60);
    if (!key) continue;
    if (typeof rawValue === 'boolean') output[key] = rawValue;
    else if (typeof rawValue === 'number') output[key] = clamp(rawValue, -9999, 9999);
    else if (typeof rawValue === 'string') output[key] = cleanText(rawValue, 120);
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

function cleanName(value) {
  const name = cleanText(value || '顾长生', 12);
  if (!name || /[<>]/.test(String(value ?? ''))) throw new Error('存档中的角色名无效。');
  return name;
}

export function createGameState(name = '顾长生') {
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    player: {
      name: cleanName(name), realm: 0, hp: 100, maxHp: 100, exp: 0,
      gold: 0, attack: 11, defense: 4, spirit: 10
    },
    story: {
      act: 1, scene: 'awakening', day: 1, location: '赵府柴房',
      flags: {}, completedEvents: []
    },
    quests: { active: [], completed: [], failed: [] },
    inventory: { items: { '回春丹': 1 }, materials: {}, limit: 36 },
    equipment: { weapon: null, armor: null, accessory: null },
    techniques: { known: ['吐纳'], equipped: ['吐纳'], mastery: { '吐纳': 0 } },
    relationships: { ...DEFAULT_RELATIONSHIPS },
    karma: { mercy: 0, ambition: 0, demonic: 0, promises: [] },
    achievements: { unlocked: [], progress: {} },
    codex: { characters: [], locations: ['赵府柴房'], items: ['回春丹'], endings: [] },
    endings: { unlocked: [], newGamePlus: false },
    memory: { summary: '', facts: [], turnCount: 0 },
    battle: null,
    pending: { type: 'intro-name' },
    stats: { turns: 0, battlesWon: 0, faceCount: 0, pillsCrafted: 0 },
    settings: { difficulty: 'normal' },
    updatedAt: new Date().toISOString()
  };
}

function normalizeV2(input) {
  const base = createGameState(input?.player?.name || input?.name || '顾长生');
  const player = isRecord(input.player) ? input.player : {};
  const story = isRecord(input.story) ? input.story : {};
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

  base.player = {
    name: cleanName(player.name || base.player.name),
    realm: Math.floor(clamp(player.realm, 0, REALM_COUNT - 1)),
    maxHp: Math.floor(clamp(player.maxHp || 100, 1, 9999)),
    hp: 1,
    exp: Math.floor(clamp(player.exp, 0, 999999)),
    gold: Math.floor(clamp(player.gold, 0, 999999)),
    attack: Math.floor(clamp(player.attack || 11, 1, 9999)),
    defense: Math.floor(clamp(player.defense || 4, 0, 9999)),
    spirit: Math.floor(clamp(player.spirit || 10, 1, 9999))
  };
  base.player.hp = Math.floor(clamp(player.hp ?? base.player.maxHp, 1, base.player.maxHp));
  base.story = {
    act: Math.floor(clamp(story.act || 1, 1, 5)),
    scene: cleanId(story.scene || 'awakening', 60) || 'awakening',
    day: Math.floor(clamp(story.day || 1, 1, 99999)),
    location: cleanText(story.location || '赵府柴房', 30) || '赵府柴房',
    flags: safeFlags(story.flags),
    completedEvents: stringList(story.completedEvents, 300, 60)
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
  base.equipment = {
    weapon: cleanText(equipment.weapon, 32) || null,
    armor: cleanText(equipment.armor, 32) || null,
    accessory: cleanText(equipment.accessory, 32) || null
  };
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
  base.endings = {
    unlocked: stringList(endings.unlocked, 20, 40),
    newGamePlus: Boolean(endings.newGamePlus)
  };
  base.memory = {
    summary: cleanText(memory.summary, 600),
    facts: stringList(memory.facts, 12, 80),
    turnCount: Math.floor(clamp(memory.turnCount, 0, 999999))
  };
  base.battle = isRecord(input.battle) ? JSON.parse(JSON.stringify(input.battle)) : null;
  base.pending = isRecord(input.pending) ? JSON.parse(JSON.stringify(input.pending)) : null;
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

function migrateV1(input) {
  const state = createGameState(input.name || '顾长生');
  state.player.realm = Math.floor(clamp(input.realm, 0, REALM_COUNT - 1));
  state.player.maxHp = Math.max(100, 100 + Math.max(0, state.player.realm - 1) * 22);
  state.player.hp = Math.floor(clamp(input.hp ?? state.player.maxHp, 1, state.player.maxHp));
  state.player.exp = Math.floor(clamp(input.exp, 0, 999999));
  state.player.gold = Math.floor(clamp(input.gold, 0, 999999));
  state.story.day = Math.floor(clamp(input.day || 1, 1, 99999));
  state.story.location = cleanText(input.loc || '赵府柴房', 30) || '赵府柴房';
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
    state.memory.summary = cleanText(input.memory.summary, 600);
    state.memory.facts = stringList(input.memory.facts, 12, 80);
    state.memory.turnCount = Math.floor(clamp(input.memory.turnCount, 0, 999999));
  }
  return normalizeV2(state);
}

export function migrateGameState(input) {
  if (!isRecord(input)) throw new Error('存档格式无效。');
  return Number(input.schemaVersion) === GAME_SCHEMA_VERSION || isRecord(input.player)
    ? normalizeV2(input)
    : migrateV1(input);
}

export function validateImportedState(input) {
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
  return migrateGameState(value);
}

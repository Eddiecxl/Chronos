import { ACHIEVEMENTS, ENDINGS, ITEMS, LOCATIONS, NPCS, QUESTS, REALMS, TECHNIQUES } from './game-data.js';
import { derivedPlayerStats, normalizeEquipment } from './equipment.js';

const list = (value) => Array.isArray(value) ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry))] : [];
const entityByName = (state, name) => Object.values(state.memory?.entities || {}).find((entity) => entity?.name === name);

function locationDetails(name) {
  const entry = LOCATIONS[name];
  return entry
    ? { icon: entry.icon, description: entry.description }
    : { icon: '✦', description: '旅途中亲自抵达的地点。' };
}

function itemDetails(name) {
  const entry = ITEMS[name];
  return entry
    ? { type: entry.type, rarity: entry.rarity || 'common', description: entry.description }
    : { type: 'unknown', rarity: 'common', description: '这件物品的来历尚待辨认。' };
}

function characterDetails(state, name) {
  const entity = entityByName(state, name);
  const entry = NPCS[name];
  return {
    name,
    role: entity?.purpose || entry?.role || '旅途中相识之人',
    description: entry?.description || entity?.traits?.join('、') || '你已亲眼见过此人。',
    status: entity?.status || 'alive'
  };
}

function questDetails(id, status, active = {}, history = {}) {
  const entry = QUESTS[id];
  const target = Math.max(1, Number(active.target || history.target || entry?.target || 1));
  return {
    id,
    status,
    title: entry?.title || id,
    type: entry?.type || 'unknown',
    description: entry?.description || '这段经历已被记录。',
    progress: status === 'completed' ? target : Math.max(0, Number(active.progress ?? history.progress ?? 0)),
    target
  };
}

export function buildCharacterView(state) {
  const derived = derivedPlayerStats(state);
  const equipment = normalizeEquipment(state.equipment);
  const realm = REALMS[state.player.realm] || REALMS[0];
  const relationships = list(state.codex?.characters).map((name) => ({
    ...characterDetails(state, name),
    value: Number(state.relationships?.[name] || 0)
  }));
  const techniques = list(state.techniques?.known).map((name) => {
    const technique = TECHNIQUES[name];
    return {
      name,
      equipped: state.techniques?.equipped?.includes(name) || false,
      cost: Number(technique?.cost || 0),
      description: technique?.description || '你已掌握这门法诀。'
    };
  });

  return {
    name: state.player.name,
    realm: realm.name,
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    qi: state.player.qi,
    qiNeed: realm.need,
    spirit: state.player.spirit,
    maxSpirit: derived.maxSpirit,
    stats: { attack: derived.attack, defense: derived.defense },
    slots: equipment.slots,
    techniques,
    relationships
  };
}

export function buildQuestView(state) {
  const active = Array.isArray(state.quests?.active) ? state.quests.active : [];
  const history = state.quests?.history || {};
  return {
    active: active.filter((entry) => entry?.id).map((entry) => questDetails(entry.id, 'active', entry)),
    completed: list(state.quests?.completed).map((id) => questDetails(id, 'completed', {}, history[id])),
    failed: list(state.quests?.failed).map((id) => questDetails(id, 'failed', {}, history[id]))
  };
}

export function buildInventoryView(state) {
  return list(state.codex?.items).map((name) => {
    const amount = Number(state.inventory?.items?.[name] || state.inventory?.materials?.[name] || 0);
    return { name, amount, ...itemDetails(name) };
  }).filter((entry) => entry.amount > 0);
}

export function buildMapView(state) {
  return [...new Set([state.story?.location, ...list(state.codex?.locations)].filter(Boolean))]
    .map((name) => ({ name, current: name === state.story?.location, ...locationDetails(name) }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

// Local journeys intentionally keep their original, rules-driven atlas.  Unlike
// the AI journey's discovery view, an unlocked local destination is always
// actionable even before its codex entry has been written.
export function buildLocalMapView(state) {
  return Object.entries(LOCATIONS).map(([name, location]) => ({
    name,
    ...location,
    current: name === state.story?.location,
    unlocked: state.story?.act >= location.act && state.player?.realm >= location.realm
  }));
}

export function buildCodexView(state) {
  const achievementIds = list(state.achievements?.unlocked);
  const endingIds = [...new Set([...list(state.codex?.endings), ...list(state.endings?.unlocked)])];
  return {
    characters: list(state.codex?.characters).map((name) => characterDetails(state, name)),
    locations: list(state.codex?.locations).map((name) => ({ name, ...locationDetails(name) })),
    items: list(state.codex?.items).map((name) => ({ name, ...itemDetails(name) })),
    achievements: achievementIds.map((id) => ({ id, title: ACHIEVEMENTS[id]?.title || id, description: ACHIEVEMENTS[id]?.description || '一段已完成的经历。' })),
    endings: endingIds.map((id) => ({ id, title: ENDINGS[id]?.title || id, description: ENDINGS[id]?.description || '一段已知的结局。' }))
  };
}

export function buildHistoryView(state) {
  return {
    summaries: Object.values(state.memory?.chapterSummaries || {}).slice(-2),
    facts: (state.memory?.facts || []).slice(-6).map((fact) => `${fact.subjectId}：${fact.object}`)
  };
}

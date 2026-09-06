import { migrateGameState } from './game-state.js';
import { LOCATIONS } from './game-data.js';

const cleanText = (value, max) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const cleanId = (value, max = 80) => cleanText(value, max).replace(/[^\p{L}\p{N}_.:/\-]/gu, '');
const unique = (values) => [...new Set(values)];

function stableFactId(tuple) {
  let hash = 2166136261;
  for (let index = 0; index < tuple.length; index += 1) {
    hash ^= tuple.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fact:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function turnNumber(turnId, fallback) {
  const found = String(turnId).match(/^turn-(\d+)$/);
  return found ? Math.max(0, Number(found[1])) : fallback;
}

function trimFacts(facts) {
  if (facts.length <= 500) return facts;
  const locked = facts.filter((fact) => fact.locked).slice(0, 500);
  const room = 500 - locked.length;
  return [...locked, ...facts.filter((fact) => !fact.locked).slice(-room)];
}

export function registerEntityCandidates(source, candidates = [], turnId = 'unknown', options = {}) {
  const state = migrateGameState(source);
  if (!Array.isArray(candidates)) return state;
  const safeTurnId = cleanId(turnId) || 'unknown';
  const visibleEntityIds = new Set(Array.isArray(options?.visibleEntityIds) ? options.visibleEntityIds.map((id) => cleanId(id)).filter(Boolean) : []);
  const knownLocations = new Set(Object.keys(LOCATIONS));
  for (const entity of Object.values(state.memory.entities)) {
    if (entity.kind === 'location') knownLocations.add(entity.id);
  }

  for (const raw of candidates.slice(0, 30)) {
    if (!raw || typeof raw !== 'object') continue;
    const id = cleanId(raw.id);
    const kind = raw.kind === 'location' ? 'location' : raw.kind === 'npc' ? 'npc' : '';
    if (!kind || !id.startsWith(`generated:${kind}:`)) continue;
    if (!visibleEntityIds.has(id)) continue;
    const name = cleanText(raw.name, 32);
    const location = cleanText(raw.location, 80);
    const purpose = cleanText(raw.purpose, 160);
    const traits = Array.isArray(raw.traits)
      ? unique(raw.traits.map((trait) => cleanText(trait, 32)).filter(Boolean)).slice(0, 4)
      : [];
    if (!name || !purpose || !location || !knownLocations.has(location)) continue;
    if (state.memory.entities[id]) {
      state.memory.entities[id].lastSeenTurn = turnNumber(safeTurnId, state.memory.turnCount);
      continue;
    }
    state.memory.entities[id] = {
      id, kind, name, status: 'alive', location, purpose, traits,
      knownFactIds: [], facts: [], createdTurnId: safeTurnId,
      lastSeenTurn: turnNumber(safeTurnId, state.memory.turnCount)
    };
    if (kind === 'location') knownLocations.add(id);
  }
  return migrateGameState(state);
}

export function applyMemoryCandidates(source, candidates = [], turnId = 'unknown') {
  const state = migrateGameState(source);
  if (!Array.isArray(candidates)) return state;
  const safeTurnId = cleanId(turnId) || 'unknown';
  const createdAtTurn = turnNumber(safeTurnId, Math.max(1, state.memory.turnCount));

  for (const raw of candidates.slice(0, 80)) {
    if (!raw || typeof raw !== 'object' || Number(raw.confidence ?? 1) < 0.65) continue;
    const subjectId = cleanId(raw.subjectId);
    const predicate = cleanId(raw.predicate, 48);
    const object = cleanText(raw.object, 160);
    const currentLocationId = LOCATIONS[state.story.location]?.id;
    const allowedSubject = subjectId.startsWith('loop:') || subjectId.startsWith('quest:')
      || subjectId.startsWith('world:') || subjectId === currentLocationId || state.memory.entities[subjectId];
    if (!subjectId || !predicate || !object || !allowedSubject) continue;

    const lockedConflict = state.memory.facts.some((fact) => fact.locked
      && fact.subjectId === subjectId && fact.predicate === predicate && fact.object !== object);
    if (lockedConflict) continue;
    const tuple = `${subjectId}|${predicate}|${object}`;
    if (state.memory.facts.some((fact) => `${fact.subjectId}|${fact.predicate}|${fact.object}` === tuple)) continue;

    const fact = {
      id: stableFactId(tuple), subjectId, predicate, object,
      sourceTurnId: safeTurnId, createdAtTurn, locked: false
    };
    state.memory.facts.push(fact);
    const entity = state.memory.entities[subjectId];
    if (entity) {
      entity.facts = unique([...(entity.facts || []), fact.id]).slice(-80);
      entity.knownFactIds = unique([...(entity.knownFactIds || []), fact.id]).slice(-80);
      entity.lastSeenTurn = createdAtTurn;
    }
  }
  state.memory.facts = trimFacts(state.memory.facts);
  state.memory.turnCount = Math.max(state.memory.turnCount, createdAtTurn);
  return migrateGameState(state);
}

export function updateChapterSummary(source, chapterId, summary) {
  const state = migrateGameState(source);
  const id = cleanId(chapterId);
  const text = cleanText(summary, 1200);
  if (!id || !text) return state;
  state.memory.chapterSummaries[id] = text;
  const keys = Object.keys(state.memory.chapterSummaries);
  for (const oldId of keys.slice(0, Math.max(0, keys.length - 30))) delete state.memory.chapterSummaries[oldId];
  return migrateGameState(state);
}

export function selectRelevantMemory(source, context = {}) {
  const state = migrateGameState(source);
  const participantIds = Array.isArray(context.participantIds) ? context.participantIds.map((id) => cleanId(id)).filter(Boolean) : [];
  const openLoopIds = Array.isArray(context.openLoopIds) ? context.openLoopIds.map((id) => cleanId(id)).filter(Boolean) : [];
  const questIds = Array.isArray(context.questIds) ? context.questIds.map((id) => cleanId(id)).filter(Boolean) : [];
  const locationId = cleanId(context.locationId);
  const targets = new Set([...participantIds, ...openLoopIds, ...questIds.map((id) => id.startsWith('quest:') ? id : `quest:${id}`)]);
  if (locationId) targets.add(locationId);

  const facts = state.memory.facts
    .filter((fact) => !targets.size || targets.has(fact.subjectId) || fact.locked)
    .map((fact) => {
      let score = fact.locked ? 120 : 0;
      if (participantIds.includes(fact.subjectId)) score += 100;
      if (fact.subjectId === locationId) score += 90;
      if (openLoopIds.includes(fact.subjectId)) score += 80;
      if (questIds.includes(fact.subjectId) || questIds.some((id) => fact.subjectId === `quest:${id}`)) score += 70;
      score += Math.min(40, fact.createdAtTurn / Math.max(1, state.memory.turnCount) * 40);
      return { fact, score };
    })
    .sort((left, right) => right.score - left.score || right.fact.createdAtTurn - left.fact.createdAtTurn)
    .slice(0, 24)
    .map(({ fact }) => fact);

  const summaryIds = Object.keys(state.memory.chapterSummaries);
  const currentId = cleanId(context.chapterId || state.director.chapterId);
  const currentIndex = summaryIds.indexOf(currentId);
  const selectedSummaryIds = currentIndex >= 0
    ? summaryIds.slice(Math.max(0, currentIndex - 1), currentIndex + 1)
    : summaryIds.slice(-2);
  const chapterSummaries = Object.fromEntries(selectedSummaryIds.map((id) => [id, state.memory.chapterSummaries[id]]));
  const referencedIds = new Set([...participantIds, locationId, ...facts.map((fact) => fact.subjectId)].filter(Boolean));
  const entities = Object.fromEntries([...referencedIds]
    .filter((id) => state.memory.entities[id])
    .slice(0, 12)
    .map((id) => [id, state.memory.entities[id]]));
  const packet = { chapterSummaries, facts, entities };
  while (JSON.stringify(packet).length >= 2200 && packet.facts.length) packet.facts.pop();
  return packet;
}

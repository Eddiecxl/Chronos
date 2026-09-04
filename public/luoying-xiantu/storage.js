import { GAME_MODES, migrateGameState, validateImportedState } from './game-state.js';
import { createTranscriptStore } from './transcript-store.js';

const LEGACY_KEYS = ['luoying_save_v2', 'luoying_save'];
const LEGACY_SLOT_KEYS = ['luoying_slot1_data', 'luoying_slot2_data', 'luoying_slot3_data'];
const validSlot = (slot) => /^slot[1-3]$/.test(slot);
const assertMode = (mode) => {
  if (!GAME_MODES.includes(mode)) throw new Error('游戏模式无效。');
  return mode;
};
const autoKey = (mode) => `luoying_v3_${mode}_auto`;
const slotKey = (mode, slot) => `luoying_v3_${mode}_${slot}`;
const slotMetaKey = (mode, slot) => `${slotKey(mode, slot)}_meta`;
const MAX_JOURNEY_BYTES = 4_500_000;

function assertSlot(slot) {
  if (!validSlot(slot)) throw new Error('存档槽位无效。');
  return slot;
}

function serializeState(mode, state) {
  const clean = migrateGameState({
    ...state,
    battle: null,
    pending: state.pending ?? null,
    updatedAt: new Date().toISOString()
  }, mode);
  return JSON.stringify(clean);
}

async function readJourneySource(source) {
  if (typeof source === 'string') {
    if (source.length > MAX_JOURNEY_BYTES) throw new Error('旅程档案过大。');
    try { return JSON.parse(source); }
    catch { throw new Error('旅程档案不是有效的 JSON。'); }
  }
  if (typeof Blob === 'function' && source instanceof Blob) return readJourneySource(await source.text());
  if (!source || typeof source !== 'object') throw new Error('旅程档案格式无效。');
  let raw;
  try { raw = JSON.stringify(source); }
  catch { throw new Error('旅程档案无法读取。'); }
  return readJourneySource(raw);
}

const defaultId = () => globalThis.crypto?.randomUUID?.() || `journey-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function createStorage(storage = globalThis.localStorage, { idFactory = defaultId } = {}) {
  if (!storage) throw new Error('当前环境不支持本地存档。');

  const freshJourneyId = () => {
    const id = String(idFactory?.() ?? '').replace(/[^\p{L}\p{N}_.:/\-]/gu, '').slice(0, 100);
    if (!id) throw new Error('无法建立新的旅程编号。');
    return id;
  };

  const read = (key, mode) => {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return validateImportedState(raw, mode); }
    catch { return null; }
  };

  const readLegacyEntries = () => {
    const entries = [];
    for (const key of [...LEGACY_KEYS, ...LEGACY_SLOT_KEYS]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        validateImportedState(parsed, 'local');
        entries.push({ key, raw, parsed });
      } catch { /* try the older key */ }
    }
    return entries;
  };

  const writeSlot = (mode, slot, state) => {
    const raw = serializeState(mode, state);
    storage.setItem(slotKey(mode, slot), raw);
    const clean = JSON.parse(raw);
    storage.setItem(slotMetaKey(mode, slot), JSON.stringify({
      mode,
      name: clean.player.name,
      realm: clean.player.realm,
      act: clean.story.act,
      location: clean.story.location,
      day: clean.story.day,
      savedAt: clean.updatedAt
    }));
    return clean;
  };

  const journeyIsReferenced = (journeyId, excludedMode, excludedSlot) => {
    for (const candidateMode of GAME_MODES) {
      const automatic = read(autoKey(candidateMode), candidateMode);
      if (automatic?.journeyId === journeyId) return true;
      for (let number = 1; number <= 3; number += 1) {
        const candidateSlot = `slot${number}`;
        if (candidateMode === excludedMode && candidateSlot === excludedSlot) continue;
        if (read(slotKey(candidateMode, candidateSlot), candidateMode)?.journeyId === journeyId) return true;
      }
    }
    return false;
  };

  return {
    loadAuto(mode) {
      assertMode(mode);
      return read(autoKey(mode), mode);
    },
    saveAuto(mode, state) {
      assertMode(mode);
      storage.setItem(autoKey(mode), serializeState(mode, state));
      return read(autoKey(mode), mode);
    },
    saveAutoIfJourney(mode, state, expectedJourneyId) {
      assertMode(mode);
      const current = read(autoKey(mode), mode);
      if (current && current.journeyId !== expectedJourneyId) {
        throw new Error('自动存档已在另一窗口改变；本回合没有覆盖较新的旅程。');
      }
      storage.setItem(autoKey(mode), serializeState(mode, state));
      return read(autoKey(mode), mode);
    },
    loadSlot(mode, slot) {
      assertMode(mode);
      assertSlot(slot);
      return read(slotKey(mode, slot), mode);
    },
    saveSlot(mode, slot, state) {
      assertMode(mode);
      assertSlot(slot);
      return writeSlot(mode, slot, state);
    },
    async saveJourneySlot(mode, slot, state, transcriptStore) {
      assertMode(mode);
      assertSlot(slot);
      if (!transcriptStore?.allTurns || !transcriptStore?.importTurns || !transcriptStore?.deleteJourney) {
        throw new Error('游戏记录存储不可用。');
      }
      const current = migrateGameState(state, mode);
      const previous = read(slotKey(mode, slot), mode);
      const previousRaw = storage.getItem(slotKey(mode, slot));
      const previousMetaRaw = storage.getItem(slotMetaKey(mode, slot));
      const turns = await transcriptStore.allTurns(current.journeyId);
      let snapshot;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = freshJourneyId();
        if (!journeyIsReferenced(candidate) && !(await transcriptStore.allTurns(candidate)).length) {
          snapshot = migrateGameState({ ...current, journeyId: candidate }, mode);
          break;
        }
      }
      if (!snapshot) throw new Error('无法建立不冲突的命簿旅程编号。');
      let saved;
      try {
        await transcriptStore.importTurns(snapshot.journeyId, turns);
        saved = writeSlot(mode, slot, snapshot);
      } catch (error) {
        try { await transcriptStore.deleteJourney(snapshot.journeyId); } catch { /* retain the original failure */ }
        if (previousRaw === null) storage.removeItem(slotKey(mode, slot));
        else storage.setItem(slotKey(mode, slot), previousRaw);
        if (previousMetaRaw === null) storage.removeItem(slotMetaKey(mode, slot));
        else storage.setItem(slotMetaKey(mode, slot), previousMetaRaw);
        throw error;
      }
      if (previous?.journeyId && previous.journeyId !== saved.journeyId
        && !journeyIsReferenced(previous.journeyId, mode, slot)) {
        try { await transcriptStore.deleteJourney(previous.journeyId); } catch { /* orphan cleanup is best effort */ }
      }
      return saved;
    },
    deleteSlot(mode, slot) {
      assertMode(mode);
      assertSlot(slot);
      storage.removeItem(slotKey(mode, slot));
      storage.removeItem(slotMetaKey(mode, slot));
    },
    async deleteJourneySlot(mode, slot, transcriptStore) {
      assertMode(mode);
      assertSlot(slot);
      if (!transcriptStore?.deleteJourney) throw new Error('游戏记录存储不可用。');
      const previous = read(slotKey(mode, slot), mode);
      storage.removeItem(slotKey(mode, slot));
      storage.removeItem(slotMetaKey(mode, slot));
      if (previous?.journeyId && !journeyIsReferenced(previous.journeyId, mode, slot)) {
        try { await transcriptStore.deleteJourney(previous.journeyId); } catch { /* orphan cleanup is best effort */ }
      }
    },
    getSlotMeta(mode, slot) {
      assertMode(mode);
      assertSlot(slot);
      try {
        const meta = JSON.parse(storage.getItem(slotMetaKey(mode, slot)) || 'null');
        return meta?.mode === mode ? meta : null;
      } catch { return null; }
    },
    findLegacySave() {
      const entry = readLegacyEntries()[0];
      if (!entry) return null;
      try { return validateImportedState(entry.parsed, 'local'); }
      catch { return null; }
    },
    importLegacy(mode) {
      assertMode(mode);
      const entries = readLegacyEntries();
      const entry = entries.find((candidate) => LEGACY_KEYS.includes(candidate.key)) || entries[0];
      if (!entry) throw new Error('没有找到可迁移的旧存档。');
      const clean = validateImportedState(entry.parsed, mode);
      storage.setItem(autoKey(mode), serializeState(mode, clean));
      for (let index = 0; index < LEGACY_SLOT_KEYS.length; index += 1) {
        const legacySlot = entries.find((candidate) => candidate.key === LEGACY_SLOT_KEYS[index]);
        if (legacySlot) writeSlot(mode, `slot${index + 1}`, validateImportedState(legacySlot.parsed, mode));
      }
      return read(autoKey(mode), mode);
    },
    async exportJourney(mode, state, transcriptStore) {
      assertMode(mode);
      if (!transcriptStore?.allTurns) throw new Error('游戏记录存储不可用。');
      const clean = migrateGameState(state, mode);
      const turns = await transcriptStore.allTurns(clean.journeyId);
      const raw = JSON.stringify({ format: 'luoying-journey-v3', mode, state: clean, turns });
      if (raw.length > MAX_JOURNEY_BYTES) throw new Error('旅程档案过大。');
      return new Blob([raw], { type: 'application/json;charset=utf-8' });
    },
    async importJourney(mode, source, transcriptStore) {
      assertMode(mode);
      if (!transcriptStore?.allTurns || !transcriptStore?.importTurns || !transcriptStore?.deleteJourney) {
        throw new Error('游戏记录存储不可用。');
      }
      const bundle = await readJourneySource(source);
      if (bundle.format !== 'luoying-journey-v3' || bundle.mode !== mode || !Array.isArray(bundle.turns)) {
        throw new Error('旅程档案格式或模式不匹配。');
      }
      const clean = validateImportedState(bundle.state, mode);
      let imported;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = freshJourneyId();
        if (!journeyIsReferenced(candidate) && !(await transcriptStore.allTurns(candidate)).length) {
          imported = migrateGameState({ ...clean, journeyId: candidate }, mode);
          break;
        }
      }
      if (!imported) throw new Error('无法建立不冲突的导入旅程编号。');

      const validator = createTranscriptStore({ memory: new Map() });
      await validator.importTurns(imported.journeyId, bundle.turns);

      const targetKey = autoKey(mode);
      const previousRaw = storage.getItem(targetKey);
      try {
        await transcriptStore.importTurns(imported.journeyId, bundle.turns);
        storage.setItem(targetKey, serializeState(mode, imported));
      } catch (error) {
        try {
          await transcriptStore.deleteJourney(imported.journeyId);
        } catch { /* preserve the original import error */ }
        if (previousRaw === null) storage.removeItem(targetKey);
        else storage.setItem(targetKey, previousRaw);
        throw error;
      }
      return read(targetKey, mode);
    }
  };
}

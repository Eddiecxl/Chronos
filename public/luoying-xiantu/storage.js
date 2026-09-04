import { GAME_MODES, migrateGameState, validateImportedState } from './game-state.js';
import { createTranscriptStore } from './transcript-store.js';

const LEGACY_KEYS = ['luoying_save_v2', 'luoying_save'];
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

export function createStorage(storage = globalThis.localStorage) {
  if (!storage) throw new Error('当前环境不支持本地存档。');

  const read = (key, mode) => {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return validateImportedState(raw, mode); }
    catch { return null; }
  };

  const readLegacyRaw = () => {
    for (const key of LEGACY_KEYS) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        validateImportedState(parsed, 'local');
        return { key, raw, parsed };
      } catch { /* try the older key */ }
    }
    return null;
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
    loadSlot(mode, slot) {
      assertMode(mode);
      assertSlot(slot);
      return read(slotKey(mode, slot), mode);
    },
    saveSlot(mode, slot, state) {
      assertMode(mode);
      assertSlot(slot);
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
    },
    deleteSlot(mode, slot) {
      assertMode(mode);
      assertSlot(slot);
      storage.removeItem(slotKey(mode, slot));
      storage.removeItem(slotMetaKey(mode, slot));
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
      const entry = readLegacyRaw();
      if (!entry) return null;
      try { return validateImportedState(entry.parsed, 'local'); }
      catch { return null; }
    },
    importLegacy(mode) {
      assertMode(mode);
      const entry = readLegacyRaw();
      if (!entry) throw new Error('没有找到可迁移的旧存档。');
      const clean = validateImportedState(entry.parsed, mode);
      storage.setItem(autoKey(mode), serializeState(mode, clean));
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

      const validator = createTranscriptStore({ memory: new Map() });
      await validator.importTurns(clean.journeyId, bundle.turns);

      const targetKey = autoKey(mode);
      const previousRaw = storage.getItem(targetKey);
      const previousTurns = await transcriptStore.allTurns(clean.journeyId);
      try {
        await transcriptStore.deleteJourney(clean.journeyId);
        await transcriptStore.importTurns(clean.journeyId, bundle.turns);
        storage.setItem(targetKey, serializeState(mode, clean));
      } catch (error) {
        try {
          await transcriptStore.deleteJourney(clean.journeyId);
          await transcriptStore.importTurns(clean.journeyId, previousTurns);
        } catch { /* preserve the original import error */ }
        if (previousRaw === null) storage.removeItem(targetKey);
        else storage.setItem(targetKey, previousRaw);
        throw error;
      }
      return read(targetKey, mode);
    }
  };
}

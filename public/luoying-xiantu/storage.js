import { migrateGameState, validateImportedState } from './game-state.js';

const AUTO_KEY = 'luoying_save_v2';
const LEGACY_AUTO_KEY = 'luoying_save';
const slotKey = (slot) => `luoying_${slot}_data`;
const slotMetaKey = (slot) => `luoying_${slot}_meta`;
const validSlot = (slot) => /^slot[1-3]$/.test(slot);

function serializeState(state) {
  const clean = migrateGameState({
    ...state,
    battle: null,
    pending: state.pending ?? null,
    updatedAt: new Date().toISOString()
  });
  return JSON.stringify(clean);
}

export function createStorage(storage = globalThis.localStorage) {
  if (!storage) throw new Error('当前环境不支持本地存档。');

  const read = (key) => {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return validateImportedState(raw); }
    catch { return null; }
  };

  return {
    loadAuto() {
      return read(AUTO_KEY) || read(LEGACY_AUTO_KEY);
    },
    saveAuto(state) {
      storage.setItem(AUTO_KEY, serializeState(state));
      return read(AUTO_KEY);
    },
    loadSlot(slot) {
      if (!validSlot(slot)) throw new Error('存档槽位无效。');
      return read(slotKey(slot));
    },
    saveSlot(slot, state) {
      if (!validSlot(slot)) throw new Error('存档槽位无效。');
      const raw = serializeState(state);
      storage.setItem(slotKey(slot), raw);
      const clean = JSON.parse(raw);
      storage.setItem(slotMetaKey(slot), JSON.stringify({
        name: clean.player.name,
        realm: clean.player.realm,
        act: clean.story.act,
        location: clean.story.location,
        day: clean.story.day,
        savedAt: clean.updatedAt
      }));
      return clean;
    },
    deleteSlot(slot) {
      if (!validSlot(slot)) throw new Error('存档槽位无效。');
      storage.removeItem(slotKey(slot));
      storage.removeItem(slotMetaKey(slot));
    },
    getSlotMeta(slot) {
      if (!validSlot(slot)) throw new Error('存档槽位无效。');
      try { return JSON.parse(storage.getItem(slotMetaKey(slot))) || null; }
      catch { return null; }
    },
    exportState(state) {
      return new Blob([serializeState(state)], { type: 'application/json;charset=utf-8' });
    },
    async importState(source) {
      const text = typeof source === 'string' ? source : await source.text();
      const clean = validateImportedState(text);
      storage.setItem(AUTO_KEY, serializeState(clean));
      return clean;
    }
  };
}

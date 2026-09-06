import { ITEMS } from './game-data.js';

export const EQUIPMENT_SLOT_ORDER = Object.freeze(['head', 'neck', 'body', 'arms', 'hands', 'legs', 'feet']);

const cleanSlotItem = (value, slot) => {
  const name = typeof value === 'string' ? value.trim().slice(0, 32) : '';
  return name && ITEMS[name]?.slot === slot ? name : null;
};

export function normalizeEquipment(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const slots = Object.fromEntries(EQUIPMENT_SLOT_ORDER.map((slot) => [slot, cleanSlotItem(source.slots?.[slot], slot)]));
  slots.hands ||= cleanSlotItem(source.weapon, 'hands');
  slots.body ||= cleanSlotItem(source.armor, 'body');
  slots.neck ||= cleanSlotItem(source.accessory, 'neck');
  return { weapon: slots.hands, armor: slots.body, accessory: slots.neck, slots };
}

export function equipmentBonuses(state) {
  return Object.values(normalizeEquipment(state.equipment).slots).filter(Boolean).reduce((sum, name) => ({
    attack: sum.attack + Number(ITEMS[name]?.attack || 0),
    defense: sum.defense + Number(ITEMS[name]?.defense || 0),
    maxSpirit: sum.maxSpirit + Number(ITEMS[name]?.spirit || 0)
  }), { attack: 0, defense: 0, maxSpirit: 0 });
}

export function derivedPlayerStats(state) {
  const bonus = equipmentBonuses(state);
  return {
    attack: state.player.attack + bonus.attack,
    defense: state.player.defense + bonus.defense,
    maxSpirit: state.player.maxSpirit + bonus.maxSpirit
  };
}

export function equipOwnedItem(source, itemName, expectedMode = 'ai') {
  if (source?.mode !== expectedMode) throw new Error('存档模式不匹配。');
  const state = structuredClone(source);
  if (expectedMode === 'ai' && state.pending) throw new Error('当前行动仍在进行，暂不能更换装备。');
  if (expectedMode === 'ai' && state.battle) throw new Error('战斗尚未结束，暂不能更换装备。');
  const item = ITEMS[itemName];
  if (!item?.slot) throw new Error('这件物品无法装备。');
  if ((state.inventory.items[itemName] || 0) < 1) throw new Error('尚未持有这件装备。');
  state.equipment.slots[item.slot] = itemName;
  state.equipment = normalizeEquipment(state.equipment);
  state.player.spirit = Math.min(state.player.spirit, derivedPlayerStats(state).maxSpirit);
  return state;
}

export function assertAiEquipmentSaveAllowed(source) {
  if (source?.mode !== 'ai') throw new Error('存档模式不匹配。');
  if (source?.pending) throw new Error('当前行动仍在进行，暂不能更换装备。');
  if (source?.battle) throw new Error('战斗尚未结束，暂不能更换装备。');
}

export async function commitAiEquipment(storage, source, itemName) {
  assertAiEquipmentSaveAllowed(source);
  const candidate = equipOwnedItem(source, itemName, 'ai');
  return storage.saveAutoIfJourney('ai', candidate, source.journeyId, source.revision);
}

export async function commitAiEquipmentForActiveJourney(storage, source, itemName, getActiveState) {
  const saved = await commitAiEquipment(storage, source, itemName);
  return getActiveState?.()?.journeyId === source?.journeyId ? saved : null;
}

export function restoreAiEquipmentState(storage, original) {
  const authoritative = storage.loadAuto('ai');
  return authoritative?.journeyId === original?.journeyId ? authoritative : original;
}

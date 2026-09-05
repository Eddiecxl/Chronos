import { NPCS } from './game-data.js';

const uniquePush = (list, value) => {
  if (value && !list.includes(value)) list.push(value);
};

export function visibleTextFor(narration) {
  return (narration?.blocks || [])
    .map((block) => `${block?.name || ''}${block?.text || ''}`)
    .join('\n');
}

export function applyCommittedDiscoveries(source, narration) {
  const state = structuredClone(source);
  const blocks = narration?.blocks || [];
  const visible = visibleTextFor(narration);
  const speakers = new Set(blocks
    .filter((block) => block?.type === 'dlg')
    .map((block) => block.name)
    .filter(Boolean));

  for (const entity of Object.values(state.memory.entities || {})) {
    if (entity.kind === 'npc' && entity.name && (speakers.has(entity.name) || visible.includes(entity.name))) {
      uniquePush(state.codex.characters, entity.name);
    }
  }
  for (const name of Object.keys(NPCS)) {
    if (speakers.has(name) || visible.includes(name)) uniquePush(state.codex.characters, name);
  }
  uniquePush(state.codex.locations, state.story.location);
  for (const [name, count] of Object.entries(state.inventory.items || {})) {
    if (count > 0) uniquePush(state.codex.items, name);
  }
  return state;
}

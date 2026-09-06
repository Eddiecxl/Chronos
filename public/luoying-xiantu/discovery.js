const uniquePush = (list, value) => {
  if (value && !list.includes(value)) list.push(value);
};

export function visibleTextFor(narration) {
  return (narration?.blocks || [])
    .filter((block) => ['narr', 'dlg', 'sys'].includes(block?.type))
    .map((block) => `${block?.name || ''}${block?.text || ''}`)
    .join('\n');
}

export function hasVisibleFactEvidence(fact, visibleText) {
  const object = String(fact?.object || '').replace(/\s/gu, '');
  const visible = String(visibleText || '').replace(/\s/gu, '');
  if (!object || !visible) return false;
  if (visible.includes(object)) return true;
  const matches = new Set();
  for (let index = 0; index < object.length - 1; index += 1) {
    const fragment = object.slice(index, index + 2);
    if (/^[\p{Script=Han}]{2}$/u.test(fragment) && visible.includes(fragment)) matches.add(fragment);
  }
  return matches.size >= 2;
}

export function chapterSummaryFromVisibleBlocks(narration) {
  const narrated = (narration?.blocks || [])
    .filter((block) => block?.type === 'narr')
    .map((block) => String(block?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 360);
  return narrated ? `我经历：${narrated}` : '';
}

export function applyCommittedDiscoveries(source, narration) {
  const state = structuredClone(source);
  const blocks = narration?.blocks || [];
  const speakers = new Set(blocks
    .filter((block) => block?.type === 'dlg')
    .map((block) => block.name)
    .filter(Boolean));

  for (const entity of Object.values(state.memory.entities || {})) {
    const generatedNpc = entity.kind === 'npc' && entity.id?.startsWith('generated:npc:')
      && visibleTextFor(narration).includes(entity.name);
    if (entity.kind === 'npc' && entity.name && (speakers.has(entity.name) || generatedNpc)) {
      uniquePush(state.codex.characters, entity.name);
    }
  }
  uniquePush(state.codex.locations, state.story.location);
  for (const [name, count] of Object.entries(state.inventory.items || {})) {
    if (count > 0) uniquePush(state.codex.items, name);
  }
  return state;
}

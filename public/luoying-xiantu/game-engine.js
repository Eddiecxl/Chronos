import { migrateGameState } from './game-state.js';
import { derivedPlayerStats, normalizeEquipment } from './equipment.js';
import {
  ACHIEVEMENTS, ENDINGS, ENEMIES, ITEMS, LOCATIONS, NPCS, QUESTS,
  RANDOM_EVENTS, REALMS, STORY_SCENES, TECHNIQUES
} from './game-data.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const narr = (text) => ({ type: 'narr', text });
const sys = (text) => ({ type: 'sys', text });
const dlg = (name, text) => ({ type: 'dlg', name, text });
const choice = (id, label, command, icon = '❀') => ({ id, label, command, icon });
const copy = (state) => migrateGameState(structuredClone(state));

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value);
}

function addItem(state, name, amount = 1) {
  if (!ITEMS[name]) return false;
  const before = Math.max(0, Number(state.inventory.items[name] || 0));
  const delta = Math.floor(Number(amount) || 0);
  state.inventory.items[name] = Math.max(0, before + delta);
  if (state.inventory.items[name] === 0) delete state.inventory.items[name];
  if (state.inventory.items[name] > before) uniquePush(state.codex.items, name);
  return true;
}

function equipLocalItem(state, name) {
  const item = ITEMS[name];
  if (!item?.slot) return false;
  state.equipment = normalizeEquipment({
    ...state.equipment,
    [item.type]: name,
    slots: { ...state.equipment.slots, [item.slot]: name }
  });
  return true;
}

function addTechnique(state, name) {
  if (!TECHNIQUES[name]) return false;
  uniquePush(state.techniques.known, name);
  if (state.techniques.equipped.length < 4) uniquePush(state.techniques.equipped, name);
  state.techniques.mastery[name] ||= 0;
  return true;
}

function relation(state, name, delta) {
  if (!(name in state.relationships)) return;
  state.relationships[name] = clamp(state.relationships[name] + delta, -100, 100);
  if (state.mode !== 'ai') uniquePush(state.codex.characters, name);
}

function unlockAchievement(state, id, blocks) {
  if (!ACHIEVEMENTS[id] || state.achievements.unlocked.includes(id)) return;
  state.achievements.unlocked.push(id);
  blocks?.push(sys(`成就解锁 · ${ACHIEVEMENTS[id].title} —— ${ACHIEVEMENTS[id].description}`));
}

function addQuest(state, id, blocks) {
  const quest = QUESTS[id];
  if (!quest || state.quests.completed.includes(id) || state.quests.active.some((entry) => entry.id === id)) return;
  state.quests.active.push({ id, progress: 0, target: quest.target, startedAt: new Date().toISOString() });
  blocks?.push(sys(`新任务 · ${quest.title}：${quest.description}`));
}

function applyAiQuestLifecycle(state, effects) {
  const progress = effects?.questProgress && typeof effects.questProgress === 'object'
    ? effects.questProgress : {};
  for (const [id, amount] of Object.entries(progress)) {
    const entry = state.quests.active.find((quest) => quest.id === id);
    if (entry) entry.progress = Math.min(entry.target, entry.progress + Math.floor(Number(amount) || 0));
  }
  const history = state.quests.history || (state.quests.history = {});
  for (const id of Array.isArray(effects?.completeQuests) ? effects.completeQuests : []) {
    const index = state.quests.active.findIndex((quest) => quest.id === id);
    if (index < 0) continue;
    const [entry] = state.quests.active.splice(index, 1);
    history[id] = { status: 'completed', progress: entry.progress, target: entry.target };
    uniquePush(state.quests.completed, id);
    applyReward(state, QUESTS[id]?.reward);
  }
  for (const id of Array.isArray(effects?.failQuests) ? effects.failQuests : []) {
    const index = state.quests.active.findIndex((quest) => quest.id === id);
    if (index < 0) continue;
    const [entry] = state.quests.active.splice(index, 1);
    history[id] = { status: 'failed', progress: entry.progress, target: entry.target };
    uniquePush(state.quests.failed, id);
  }
}

function applyReward(state, reward = {}, blocks = []) {
  if (reward.qi) gainQi(state, reward.qi, blocks);
  if (reward.gold) state.player.gold = Math.max(0, state.player.gold + reward.gold);
  for (const [name, amount] of Object.entries(reward.items || {})) addItem(state, name, amount);
  for (const name of reward.techniques || []) addTechnique(state, name);
  for (const [name, amount] of Object.entries(reward.relationship || {})) relation(state, name, amount);
  for (const [key, amount] of Object.entries(reward.karma || {})) {
    if (key in state.karma && typeof state.karma[key] === 'number') state.karma[key] = clamp(state.karma[key] + amount, -20, 20);
  }
  if (Object.keys(reward).length) blocks.push(sys('任务奖励已经收入囊中。'));
}

function progressQuest(state, id, amount, blocks) {
  const entry = state.quests.active.find((quest) => quest.id === id);
  if (!entry) return false;
  entry.progress = Math.min(entry.target, entry.progress + amount);
  if (entry.progress < entry.target) {
    blocks.push(sys(`${QUESTS[id].title} · 进度 ${entry.progress}/${entry.target}`));
    return false;
  }
  state.quests.active = state.quests.active.filter((quest) => quest.id !== id);
  uniquePush(state.quests.completed, id);
  blocks.push(sys(`任务完成 · ${QUESTS[id].title}`));
  applyReward(state, QUESTS[id].reward, blocks);
  return true;
}

function finishEnding(state, id, blocks) {
  const ending = ENDINGS[id];
  if (!ending) return null;
  uniquePush(state.endings.unlocked, id);
  uniquePush(state.codex.endings, id);
  state.endings.newGamePlus = true;
  blocks.push(narr(ending.description), sys(`结局解锁 · ${ending.title}`));
  if (state.endings.unlocked.length === Object.keys(ENDINGS).length) unlockAchievement(state, 'all-endings', blocks);
  return { id, ...ending };
}

function finalChoice(state, raw, blocks) {
  if (state.story.act < 5 || state.player.realm < 22) return null;
  if (/留下|守护|人间/.test(raw) && state.karma.mercy >= 5) return finishEnding(state, 'guardian', blocks);
  if (/同游|归隐|山海|离开/.test(raw)) return finishEnding(state, 'wanderer', blocks);
  if (/魔|黑日|裂隙|吞噬/.test(raw) && state.karma.demonic >= 4) return finishEnding(state, 'demonic', blocks);
  if (/飞升|斩天|渡劫|开天/.test(raw)) return finishEnding(state, 'ascension', blocks);
  return null;
}

function advanceAct(state, blocks) {
  if (state.player.realm >= 19 && state.story.act < 5) {
    state.story.act = 5;
    state.story.scene = 'star-reflection';
    addQuest(state, 'read-stars', blocks);
    blocks.push(narr('星光在白昼显现，天机台上传来只对你一人响起的钟声。第五幕 · 问天渡劫，开启。'));
  } else if (state.player.realm >= 14 && state.story.act < 4) {
    state.story.act = 4;
    state.story.scene = 'north-arrival';
    addQuest(state, 'north-defense', blocks);
    blocks.push(narr('北境烽书越过千山落入掌中。第四幕 · 金丹劫火，开启。'));
  } else if (state.player.realm >= 9 && state.story.act < 3) {
    state.story.act = 3;
    state.story.scene = 'mystic-gate';
    addItem(state, '青岚令', 1);
    addQuest(state, 'mystic-entry', blocks);
    blocks.push(narr('青岚令在袖中震动，十年一开的秘境重现人间。第三幕 · 筑基秘境，开启。'));
  }
  if (state.player.realm >= 22 && !state.story.flags.readyForEnding) {
    state.story.flags.readyForEnding = true;
    state.story.scene = 'final-choice';
    state.story.location = '飞升台';
    state.pending = { type: 'final-choice' };
    addQuest(state, 'final-tribulation', blocks);
    progressQuest(state, 'final-tribulation', 9, blocks);
    blocks.push(narr('九重雷劫散去，天门与人间同时在你面前展开。飞升、守护、远游，或者走向幽冥——最后一笔由你来写。'));
  }
}

function gainQi(state, amount, blocks) {
  state.player.qi += Math.max(0, Math.floor(amount));
  const realms = [];
  while (state.player.realm < REALMS.length - 1 && state.player.qi >= REALMS[state.player.realm].need) {
    state.player.qi -= REALMS[state.player.realm].need;
    state.player.realm += 1;
    state.player.maxHp += 18 + state.player.realm * 2;
    state.player.hp = state.player.maxHp;
    state.player.attack += 4 + Math.floor(state.player.realm / 3);
    state.player.defense += 2 + Math.floor(state.player.realm / 5);
    state.player.maxSpirit += 3;
    state.player.spirit = derivedPlayerStats(state).maxSpirit;
    realms.push(REALMS[state.player.realm].name);
  }
  for (const realm of realms) blocks.push(sys(`灵台轰鸣，气机周天圆满——突破至 ${realm}！`));
  if (state.player.realm >= 14) unlockAchievement(state, 'realm-master', blocks);
  advanceAct(state, blocks);
}

function handleIntro(state, raw, blocks) {
  const pending = state.pending?.type;
  if (pending === 'intro-name') {
    const spoken = raw.replace(/^.*?(?:我叫|名字是|名为)/, '').replace(/[。！!，,].*$/, '').trim();
    if (spoken && spoken.length <= 12) state.player.name = spoken.replace(/[<>]/g, '');
    state.pending = { type: 'intro-escape' };
    blocks.push(
      narr('你在潮湿柴草间睁开眼，陌生记忆像碎雪涌入脑海。门外有人摔碎了药碗。'),
      dlg('系统', `命数已经落在「${state.player.name}」身上。这里没有预写的顺从。`),
      dlg('林小满', '里面的人还活着吗？赵天霸带人过来了！')
    );
    return true;
  }
  if (pending === 'intro-escape') {
    state.story.scene = 'broken-door';
    state.pending = { type: 'help-xiaoman' };
    addQuest(state, 'escape-zhao', blocks);
    blocks.push(narr('你一脚踹开朽门。碎木迎着雨飞出去，正好落在赵府恶仆脚边。'), dlg('赵天霸', '病秧子也敢出来？把药和人一起留下！'));
    return true;
  }
  if (pending === 'help-xiaoman') {
    const helped = /帮|救|护|一起|出手/.test(raw);
    if (helped) {
      state.karma.mercy += 1;
      relation(state, '林小满', 8);
      blocks.push(narr('你挡在林小满身前。她愣了一瞬，悄悄把半块灵米饭团塞进你掌心。'), dlg('林小满', '先说好，我不是需要你救……但这次，谢了。'));
    } else {
      state.karma.ambition += 1;
      blocks.push(narr('你没有贸然出手，而是掀翻雨棚制造混乱，带着林小满从后巷脱身。'));
    }
    state.story.location = '青石镇';
    uniquePush(state.codex.locations, '青石镇');
    progressQuest(state, 'escape-zhao', 1, blocks);
    addQuest(state, 'meet-elder', blocks);
    state.pending = { type: 'elder-choice' };
    state.story.scene = 'elder-test';
    blocks.push(dlg('李老', '逃得不算难看。小家伙，想不想学点能让别人逃的本事？'));
    return true;
  }
  if (pending === 'elder-choice') {
    if (/接受|学|愿意|传功|拜/.test(raw)) {
      addTechnique(state, '落霞掌');
      gainQi(state, 28, blocks);
      relation(state, '李老', 6);
      blocks.push(narr('李老以竹枝点在你眉心，一缕霞光沿经脉游走。你第一次真正感觉到灵气。'), dlg('李老', '法可教，道得自己走。山上有个落霞宗，去不去？'));
    } else {
      state.karma.ambition += 1;
      blocks.push(dlg('李老', '有戒心是好事。功法我仍放在这里，等你用行动证明。'));
    }
    progressQuest(state, 'meet-elder', 1, blocks);
    state.pending = { type: 'travel-sect' };
    return true;
  }
  if (pending === 'travel-sect') {
    state.story.location = '落霞宗外门';
    state.story.scene = 'outer-arrival';
    state.story.act = 2;
    state.pending = null;
    uniquePush(state.codex.locations, '落霞宗外门');
    addItem(state, '外门青衫', 1);
    equipLocalItem(state, '外门青衫');
    addQuest(state, 'outer-trial', blocks);
    unlockAchievement(state, 'first-step', blocks);
    unlockAchievement(state, 'sect-disciple', blocks);
    blocks.push(narr('九百级石阶在云海里铺开。你踏过山门时，铜钟自行响了一声。'), dlg('王执事', '新弟子先领青衫。三项外门功课，一项也不能少。'));
    return true;
  }
  return false;
}

function currentAttack(state) {
  return derivedPlayerStats(state).attack;
}

function currentDefense(state) {
  return derivedPlayerStats(state).defense;
}

function startBattle(state, enemyId, blocks) {
  const enemy = ENEMIES[enemyId];
  if (!enemy) return;
  state.battle = { enemyId, hp: enemy.hp, maxHp: enemy.hp, defending: false, turn: 1 };
  blocks.push(narr(`${enemy.name}截住去路，气机已经锁定你。`), sys(`战斗开始 · ${enemy.name} · 气血 ${enemy.hp}`));
}

function finishBattle(state, enemy, blocks) {
  const wasStronger = enemy.realm > state.player.realm;
  state.battle = null;
  state.stats.battlesWon += 1;
  state.player.gold += enemy.gold;
  gainQi(state, enemy.qi, blocks);
  blocks.push(narr(`${enemy.name}再也无力追击。你收敛气息，从这一战里悟出新的东西。`), sys(`战斗胜利 · 灵气 +${enemy.qi} · 灵石 +${enemy.gold}`));
  unlockAchievement(state, 'first-blood', blocks);
  if (wasStronger) unlockAchievement(state, 'punching-up', blocks);
  progressQuest(state, 'outer-trial', 1, blocks);
  progressQuest(state, 'sect-tournament', 1, blocks);
  progressQuest(state, 'north-defense', 1, blocks);
}

function enemyTurn(state, enemy, random, blocks, multiplier = 1) {
  const roll = 0.82 + random() * 0.36;
  const guard = state.battle.defending ? 0.45 : 1;
  const damage = Math.max(1, Math.round((enemy.attack * roll - currentDefense(state) * 0.45) * guard * multiplier));
  state.player.hp = Math.max(0, state.player.hp - damage);
  state.battle.defending = false;
  blocks.push(dlg(enemy.name, pickEnemyLine(enemy, state.battle.turn)), sys(`你受到 ${damage} 点伤害。`));
}

function pickEnemyLine(enemy, turn) {
  const lines = ['别分神！', '这一招，你接得住吗？', '你的气息乱了。', '还没有结束！'];
  return `${lines[turn % lines.length]}（${enemy.name}再度逼近）`;
}

function useBattleItem(state, raw, blocks) {
  const name = Object.keys(state.inventory.items).find((item) => raw.includes(item) && state.inventory.items[item] > 0);
  const item = ITEMS[name];
  if (!item || item.type !== 'consumable') return false;
  addItem(state, name, -1);
  if (item.heal) state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.heal);
  if (item.damage && state.battle) state.battle.hp = Math.max(0, state.battle.hp - item.damage);
  if (item.qi) gainQi(state, item.qi, blocks);
  blocks.push(sys(`你使用了 ${name}。`));
  return true;
}

function handleBattle(state, raw, random, blocks) {
  if (!state.battle) return null;
  const enemy = ENEMIES[state.battle.enemyId];
  if (!enemy) { state.battle = null; return null; }
  if (/逃|撤|遁/.test(raw)) {
    const hasTalisman = (state.inventory.items['遁地符'] || 0) > 0;
    if (hasTalisman) addItem(state, '遁地符', -1);
    if (hasTalisman || random() < 0.55) {
      state.battle = null;
      blocks.push(narr('你抓住气机交错的一瞬退出战圈，身后杀招只差半寸。'));
      return { ending: null };
    }
    blocks.push(sys('脱身失败，敌人封住了退路。'));
    enemyTurn(state, enemy, random, blocks, 0.9);
  } else if (/防|守|格挡/.test(raw)) {
    state.battle.defending = true;
    state.player.spirit = Math.min(derivedPlayerStats(state).maxSpirit, state.player.spirit + 5);
    blocks.push(narr('你沉肩稳息，把灵力收束成护体气障。'));
    enemyTurn(state, enemy, random, blocks);
  } else if (/丹|符|药|使用/.test(raw) && useBattleItem(state, raw, blocks)) {
    if (state.battle?.hp > 0) enemyTurn(state, enemy, random, blocks);
  } else {
    const techniqueName = state.techniques.equipped.find((name) => raw.includes(name))
      || (/功法|绝招|技能/.test(raw) ? state.techniques.equipped.find((name) => TECHNIQUES[name]?.kind === 'attack') : null);
    const technique = TECHNIQUES[techniqueName];
    if (technique && state.player.spirit < technique.cost) {
      blocks.push(sys(`灵力不足：施展《${techniqueName}》需要 ${technique.cost} 点灵力。`));
      enemyTurn(state, enemy, random, blocks);
      if (state.player.hp <= 0) {
        state.battle = null;
        return { ending: finishEnding(state, 'fallen', blocks) };
      }
      state.battle.turn += 1;
      return { ending: null };
    }
    if (technique) state.player.spirit -= technique.cost;
    const multiplier = technique?.power || 1;
    const damage = Math.max(1, Math.round((currentAttack(state) * multiplier - enemy.defense * 0.55) * (0.9 + random() * 0.25)));
    state.battle.hp = Math.max(0, state.battle.hp - damage);
    if (techniqueName) {
      state.techniques.mastery[techniqueName] = clamp((state.techniques.mastery[techniqueName] || 0) + 2, 0, 100);
      blocks.push(narr(`你运转《${techniqueName}》，灵光循势而出。`));
    } else blocks.push(narr('你踏前半步，凝力直取对手破绽。'));
    blocks.push(sys(`你对 ${enemy.name} 造成 ${damage} 点伤害。`));
    if (state.battle.hp <= 0) finishBattle(state, enemy, blocks);
    else enemyTurn(state, enemy, random, blocks);
  }
  if (state.player.hp <= 0) {
    state.battle = null;
    return { ending: finishEnding(state, 'fallen', blocks) };
  }
  if (state.battle) state.battle.turn += 1;
  return { ending: null };
}

function locationEnemy(state) {
  const byLocation = {
    '赵府柴房': 'zhao-guard', '青石镇': 'spirit-rat', '落霞宗外门': 'wood-puppet',
    '后山樱林': 'mountain-wolf', '百宝坊市': 'rogue-cultivator', '丹霞谷': 'poison-bee',
    '古剑冢': 'sword-spirit', '青岚秘境': 'fog-beast', '北境天关': 'demon-scout',
    '幽冥裂隙': 'rift-wraith', '天机台': 'heart-demon', '飞升台': 'heaven-avatar'
  };
  return byLocation[state.story.location] || 'spirit-rat';
}

function cultivate(state, raw, random, blocks) {
  if (state.player.realm >= REALMS.length - 1) {
    blocks.push(narr('你的修为已经抵达人间极限，再多灵气也只会汇入头顶雷云。'));
    advanceAct(state, blocks);
    return;
  }
  const retreat = /闭关|苦修|整日/.test(raw);
  const amount = retreat ? 52 + state.player.realm * 15 : 22 + state.player.realm * 8;
  state.story.day += retreat ? 3 : 1;
  gainQi(state, amount, blocks);
  state.techniques.mastery['吐纳'] = clamp((state.techniques.mastery['吐纳'] || 0) + 1, 0, 100);
  blocks.push(narr(retreat ? '洞门合拢，三日晨昏被压成一息。你让每一缕灵气都沿经脉走到尽头。' : '你盘膝收心，呼吸渐渐与山间风声重合。'), sys(`修炼完成 · 灵气 +${amount}`));
  progressQuest(state, 'outer-trial', 1, blocks);
  progressQuest(state, 'read-stars', 1, blocks);
  if (random() < 0.22) triggerRandomEvent(state, random, blocks);
}

function triggerRandomEvent(state, random, blocks) {
  const candidates = RANDOM_EVENTS.filter((event) => event.locations.includes(state.story.location) && !state.story.completedEvents.includes(event.id));
  if (!candidates.length) return;
  const event = candidates[Math.floor(random() * candidates.length) % candidates.length];
  uniquePush(state.story.completedEvents, event.id);
  blocks.push(narr(event.text));
  if (event.effect.qi) gainQi(state, event.effect.qi, blocks);
  if (event.effect.gold) state.player.gold += event.effect.gold;
  if (event.effect.mercy) state.karma.mercy = clamp(state.karma.mercy + event.effect.mercy, -20, 20);
  if (event.effect.ambition) state.karma.ambition = clamp(state.karma.ambition + event.effect.ambition, -20, 20);
  if (event.effect.demonic) state.karma.demonic = clamp(state.karma.demonic + event.effect.demonic, -20, 20);
}

function travel(state, raw, blocks) {
  const location = Object.keys(LOCATIONS).find((name) => raw.includes(name) || raw.includes(name.replace(/落霞宗|百宝|青岚|幽冥/g, '')));
  if (!location) return false;
  const requirement = LOCATIONS[location];
  if (state.story.act < requirement.act || state.player.realm < requirement.realm) {
    blocks.push(sys(`${location} 尚未解锁：需要第 ${requirement.act} 幕、${REALMS[requirement.realm].name}。`));
    return true;
  }
  state.story.location = location;
  state.story.day += 1;
  uniquePush(state.codex.locations, location);
  blocks.push(narr(`你动身前往${location}。${requirement.description}`));
  if (location === '青岚秘境') progressQuest(state, 'mystic-entry', 1, blocks);
  if (location === '北境天关') progressQuest(state, 'north-defense', 1, blocks);
  return true;
}

function talk(state, raw, blocks) {
  const name = Object.keys(NPCS).find((npc) => raw.includes(npc));
  if (!name) return false;
  uniquePush(state.codex.characters, name);
  const affinity = state.relationships[name] || 0;
  const lines = affinity >= 35
    ? `${state.player.name}，你来得正好。我有些话，只愿意告诉你。`
    : affinity <= -20
      ? '我们之间没什么好说的。除非你先解释过去做的事。'
      : `修行不只在闭关。你今天到${state.story.location}，是想问什么？`;
  blocks.push(dlg(name, lines), narr(`${NPCS[name].description} 对方的态度会记住你今天说的每一句话。`));
  if (/道歉|谢谢|关心|帮助/.test(raw)) relation(state, name, 2);
  if (/桃花酿/.test(raw) && name === '李老' && (state.inventory.items['桃花酿'] || 0) > 0) {
    addItem(state, '桃花酿', -1);
    relation(state, '李老', 8);
    progressQuest(state, 'elder-wine', 1, blocks);
  }
  return true;
}

function showStatus(state, blocks) {
  const derived = derivedPlayerStats(state);
  blocks.push(sys(`${state.player.name} · ${REALMS[state.player.realm].name} · 气血 ${state.player.hp}/${state.player.maxHp} · 灵气 ${state.player.qi}/${REALMS[state.player.realm].need} · 灵力 ${state.player.spirit}/${derived.maxSpirit} · 灵石 ${state.player.gold} · 第 ${state.story.day} 日 · ${state.story.location}`));
}

function showQuests(state, blocks) {
  if (!state.quests.active.length) blocks.push(sys('当前没有进行中的任务。四处走走，也许会遇见新的因果。'));
  for (const entry of state.quests.active) {
    const quest = QUESTS[entry.id];
    if (quest) blocks.push(sys(`${quest.type === 'main' ? '主线' : '支线'} · ${quest.title} ${entry.progress}/${entry.target}：${quest.description}`));
  }
}

function showInventory(state, blocks) {
  const items = Object.entries(state.inventory.items).filter(([, amount]) => amount > 0).map(([name, amount]) => `${name}×${amount}`);
  blocks.push(sys(`背包：${items.join('、') || '空'}。装备：${state.equipment.weapon || '无武器'} / ${state.equipment.armor || '无护甲'}。`));
}

function useOrEquipItem(state, raw, blocks) {
  const name = Object.keys(state.inventory.items).find((item) => raw.includes(item) && state.inventory.items[item] > 0);
  const item = ITEMS[name];
  if (!item) return false;
  if (/装备|穿上|佩戴/.test(raw) && ['weapon', 'armor', 'accessory'].includes(item.type)) {
    equipLocalItem(state, name);
    blocks.push(sys(`已经装备 ${name}。${item.description}`));
    return true;
  }
  if (/使用|服用|吃|吞/.test(raw) && item.type === 'consumable') {
    addItem(state, name, -1);
    if (item.heal) state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.heal);
    if (item.qi) gainQi(state, item.qi, blocks);
    blocks.push(sys(`已经使用 ${name}。${item.description}`));
    return true;
  }
  return false;
}

function refinePill(state, raw, random, blocks) {
  if (!/炼|开炉/.test(raw)) return false;
  const recipe = raw.includes('聚气丹')
    ? { output: '聚气丹', ingredients: { '凝露花': 2, '赤焰果': 1 } }
    : { output: '回春丹', ingredients: { '止血草': 2, '凝露花': 1 } };
  const missing = Object.entries(recipe.ingredients).find(([name, amount]) => (state.inventory.items[name] || 0) < amount);
  if (missing) {
    blocks.push(sys(`炼制 ${recipe.output} 还缺少 ${missing[0]}×${missing[1] - (state.inventory.items[missing[0]] || 0)}。`));
    return true;
  }
  for (const [name, amount] of Object.entries(recipe.ingredients)) addItem(state, name, -amount);
  if (random() < 0.82) {
    addItem(state, recipe.output, 1);
    state.stats.pillsCrafted += 1;
    unlockAchievement(state, 'pill-maker', blocks);
    progressQuest(state, 'alchemy-start', 1, blocks);
    blocks.push(narr('炉盖轻震，药香凝而不散。一枚圆润丹药落入玉盘。'), sys(`炼丹成功 · ${recipe.output} +1`));
  } else blocks.push(narr('炉中火候忽然偏了半分。药材化为一撮气味复杂的灰，但你记住了失败的脉络。'), sys('炼丹失败，材料已经消耗。'));
  return true;
}

function localFreeform(state, raw, random, blocks) {
  const nearby = Object.entries(NPCS).filter(([, npc]) => npc.location === state.story.location).map(([name]) => name);
  if (/帮助|救|扶|治疗/.test(raw)) {
    state.karma.mercy = clamp(state.karma.mercy + 1, -20, 20);
    blocks.push(narr('你的善意没有化成耀眼异象，却被一个真正需要它的人牢牢记住。'));
    if (nearby[0]) relation(state, nearby[0], 2);
  } else if (/偷|抢|杀|献祭/.test(raw)) {
    state.karma.demonic = clamp(state.karma.demonic + 1, -20, 20);
    blocks.push(narr('阴影顺着念头爬上指尖。力量来得很快，代价只是暂时没有开口。'));
  } else if (/赌|下注/.test(raw)) {
    const stake = Math.min(20, state.player.gold);
    if (!stake) blocks.push(sys('你摸遍口袋，连一枚可下注的灵石都没有。'));
    else if (random() < 0.46) { state.player.gold += stake; blocks.push(sys(`赌运不错，灵石 +${stake}。`)); }
    else { state.player.gold -= stake; blocks.push(sys(`天意不站在这边，灵石 -${stake}。`)); }
  } else if (/爱|喜欢|心悦|抱/.test(raw) && nearby[0]) {
    relation(state, nearby[0], 3);
    blocks.push(dlg(nearby[0], affinityReply(state.relationships[nearby[0]])), narr('有些话比剑诀更难出口，也更难收回。'));
  } else {
    const observer = nearby[0];
    blocks.push(narr(`你在${state.story.location}${/说|问|喊/.test(raw) ? '说出' : '尝试'}：“${raw.slice(0, 80)}”`));
    if (observer) blocks.push(dlg(observer, weirdReply(raw)));
    else blocks.push(narr('风穿过衣袖，远处似乎有什么因这句话改变了方向。'));
  }
  if (random() < 0.16) triggerRandomEvent(state, random, blocks);
}

function affinityReply(value) {
  if (value >= 50) return '我等这句话，比等一次突破还久。';
  if (value >= 15) return '你、你先把修为稳住再说……这件事我会记着。';
  return '修仙界的怪话很多，你这句尤其让人不知怎么接。';
}

function weirdReply(raw) {
  if (/[a-zA-Z]/.test(raw)) return '你方才夹着说的那几个音节……是哪一洲的秘语？';
  if (raw.length > 70) return '等等，你先喘口气。我记性再好也经不起你一口气倒出整条河。';
  return '我听见了。可你真正想做的，恐怕还在后半句话里。';
}

export function applyValidatedEffects(source, effects = {}) {
  const state = copy(source);
  if (!effects || typeof effects !== 'object') return state;
  const hpBeforeEffects = state.player.hp;
  const qiEffect = effects.qi ?? effects.exp;
  if (Number.isFinite(Number(qiEffect)) && Number(qiEffect) > 0) gainQi(state, clamp(qiEffect, 0, 80), []);
  if (Number.isFinite(Number(effects.spirit))) {
    state.player.spirit = clamp(state.player.spirit + clamp(effects.spirit, -40, 30), 0, derivedPlayerStats(state).maxSpirit);
  }
  if (Number.isFinite(Number(effects.hp))) state.player.hp = clamp(hpBeforeEffects + clamp(effects.hp, -80, 40), 1, state.player.maxHp);
  if (Number.isFinite(Number(effects.gold))) state.player.gold = Math.max(0, state.player.gold + clamp(effects.gold, -100, 100));
  if (effects.relationships && typeof effects.relationships === 'object') {
    for (const [name, amount] of Object.entries(effects.relationships)) if (Number.isFinite(Number(amount))) relation(state, name, clamp(amount, -20, 20));
  }
  if (effects.addItems && typeof effects.addItems === 'object') {
    for (const [name, amount] of Object.entries(effects.addItems)) if (ITEMS[name]) addItem(state, name, clamp(amount, 0, 5));
  }
  if (Array.isArray(effects.addQuests)) {
    for (const id of effects.addQuests.slice(0, 5)) if (QUESTS[id]) addQuest(state, id);
  }
  applyAiQuestLifecycle(state, effects);
  if (typeof effects.location === 'string' && LOCATIONS[effects.location]) {
    const target = LOCATIONS[effects.location];
    if (state.story.act >= target.act && state.player.realm >= target.realm) {
      state.story.location = effects.location;
      uniquePush(state.codex.locations, effects.location);
    }
  }
  return migrateGameState(state);
}

function battleChoices(state) {
  const actions = [choice('battle:attack', '攻击', '攻击', '⚔')];
  for (const name of state.techniques.equipped) {
    const technique = TECHNIQUES[name];
    if (technique?.kind === 'attack' && state.player.realm >= technique.realm) {
      actions.push(choice(`battle:technique:${name}`, name, name, '✨'));
    }
  }
  actions.push(choice('battle:defend', '防御', '防御', '🛡'));
  if ((state.inventory.items['回春丹'] || 0) > 0) actions.push(choice('battle:item:回春丹', '使用回春丹', '使用回春丹', '💊'));
  actions.push(choice('battle:flee', '逃跑', '逃跑', '💨'));
  return actions;
}

function pendingChoices(state) {
  const pending = state.pending?.type;
  const pendingActions = {
    'intro-escape': [choice('intro:open-door', '推开柴门', '推开柴门', '🚪')],
    'help-xiaoman': [
      choice('intro:help-xiaoman', '帮助林小满', '帮助林小满', '🤝'),
      choice('intro:create-diversion', '制造混乱脱身', '制造混乱带她脱身', '💨')
    ],
    'elder-choice': [
      choice('intro:accept-teaching', '接受传功', '接受李老传功', '📜'),
      choice('intro:stay-wary', '保持戒心', '先观察再决定', '👁')
    ],
    'travel-sect': [choice('intro:travel-sect', '前往落霞宗', '前往落霞宗', '⛩')]
  };
  if (pending === 'final-choice') {
    const actions = [choice('ending:ascension', '飞升', '斩开天门飞升', '☁')];
    if (state.karma.mercy >= 5) actions.push(choice('ending:guardian', '守护人间', '留下守护人间', '🌸'));
    actions.push(choice('ending:wanderer', '山海同游', '与故人山海同游', '🛶'));
    if (state.karma.demonic >= 4) actions.push(choice('ending:demonic', '执掌幽冥', '吞噬裂隙执掌魔道', '🌑'));
    return actions;
  }
  return pendingActions[pending] || null;
}

function primaryChoices(state) {
  if (state.battle) return battleChoices(state);
  const pending = pendingChoices(state);
  if (pending) return pending;
  const actions = [
    choice('train:meditate', '修炼', '打坐修炼', '🧘'),
    choice('train:retreat', '闭关', '闭关苦修三日', '⌛')
  ];
  if (state.player.hp < state.player.maxHp) actions.push(choice('rest', '休息', '休息疗伤', '🛏'));
  actions.push(choice('explore', '探索', `探索${state.story.location}`, '🧭'));
  actions.push(choice('battle:start', '挑战', '挑战附近对手', '⚔'));
  const npc = Object.entries(NPCS).find(([, data]) => data.location === state.story.location)?.[0];
  if (npc) actions.push(choice(`talk:${npc}`, `找${npc}`, `找${npc}聊聊`, '💬'));
  return actions.slice(0, 7);
}

function panelChoices(state, panel) {
  if (state.battle || state.pending) return [];
  if (panel === 'inventory') {
    return Object.entries(state.inventory.items).flatMap(([name, amount]) => {
      const item = ITEMS[name];
      if (!item || amount <= 0) return [];
      if (item.type === 'consumable') return [choice(`item:use:${name}`, `使用${name}`, `使用${name}`, '💊')];
      if (['weapon', 'armor', 'accessory'].includes(item.type)) return [choice(`item:equip:${name}`, `装备${name}`, `装备${name}`, '⚔')];
      return [];
    });
  }
  if (panel === 'travel') {
    return Object.entries(LOCATIONS)
      .filter(([name, requirement]) => name !== state.story.location && state.story.act >= requirement.act && state.player.realm >= requirement.realm)
      .map(([name, data]) => choice(`travel:${name}`, `前往${name}`, `前往${name}`, data.icon));
  }
  if (panel === 'alchemy') {
    const recipes = [
      { name: '回春丹', ingredients: { '止血草': 2, '凝露花': 1 } },
      { name: '聚气丹', ingredients: { '凝露花': 2, '赤焰果': 1 } }
    ];
    return recipes
      .filter((recipe) => Object.entries(recipe.ingredients).every(([name, amount]) => (state.inventory.items[name] || 0) >= amount))
      .map((recipe) => choice(`alchemy:${recipe.name}`, `炼制${recipe.name}`, `炼制${recipe.name}`, '⚗'));
  }
  return [];
}

function legalChoices(state) {
  const primary = primaryChoices(state);
  if (state.battle || state.pending) return primary;
  return [...primary, ...panelChoices(state, 'inventory'), ...panelChoices(state, 'travel'), ...panelChoices(state, 'alchemy')];
}

const toPublicChoice = ({ command: _command, ...action }) => action;

export function getAvailableActions(state) {
  return primaryChoices(state).map(toPublicChoice);
}

export function getLocalPanelActions(state, panel) {
  return panelChoices(state, panel).map(toPublicChoice);
}

function dispatchLocalCommand(source, input, random = Math.random) {
  const state = copy(source);
  const raw = String(input ?? '').trim().slice(0, 240);
  const blocks = [];
  let ending = null;
  if (!raw) return { state, blocks: [sys('心念未动。写下你想说的话，或想做的事。')], suggestions: getAvailableActions(state), autosave: false };

  state.stats.turns += 1;
  state.updatedAt = new Date().toISOString();
  ending = finalChoice(state, raw, blocks);
  if (!ending && handleIntro(state, raw, blocks)) {
    return { state: migrateGameState(state), blocks, suggestions: getAvailableActions(state), autosave: true };
  }
  if (!ending && state.battle) ending = handleBattle(state, raw, random, blocks)?.ending || null;
  else if (!ending && /面板|状态|属性/.test(raw)) showStatus(state, blocks);
  else if (!ending && /任务|日志/.test(raw)) showQuests(state, blocks);
  else if (!ending && /背包|物品|查看装备/.test(raw)) showInventory(state, blocks);
  else if (!ending && /图鉴|成就/.test(raw)) blocks.push(sys(`图鉴：人物 ${state.codex.characters.length} · 地点 ${state.codex.locations.length} · 物品 ${state.codex.items.length} · 结局 ${state.codex.endings.length}/5。成就 ${state.achievements.unlocked.length}/${Object.keys(ACHIEVEMENTS).length}。`));
  else if (!ending && /回忆|之前|发生过/.test(raw)) blocks.push(narr(Object.values(state.memory.chapterSummaries).at(-1) || `你从赵府柴房醒来，至今已走到${state.story.location}。真正重要的选择，会留在任务、关系与因果之中。`));
  else if (!ending && /修炼|打坐|吐纳|闭关|苦修/.test(raw)) cultivate(state, raw, random, blocks);
  else if (!ending && /签到/.test(raw)) {
    const key = `signedDay${state.story.day}`;
    if (state.story.flags[key]) blocks.push(sys('今天已经签到过了。修行讲究持之以恒，也不能薅两次。'));
    else { state.story.flags[key] = true; state.player.gold += 12; addItem(state, '聚气丹', 1); blocks.push(sys('签到成功 · 灵石 +12 · 聚气丹 +1')); }
  }
  else if (!ending && /休息|睡|疗伤/.test(raw)) {
    const heal = Math.max(18, Math.round(state.player.maxHp * 0.45));
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    state.story.day += 1;
    blocks.push(narr('你收起杂念好好睡了一觉。修仙者也需要枕头，这是许多传记不肯写的事实。'), sys(`气血恢复 ${heal} 点。`));
  }
  else if (!ending && useOrEquipItem(state, raw, blocks)) { /* handled */ }
  else if (!ending && refinePill(state, raw, random, blocks)) { /* handled */ }
  else if (!ending && /去|前往|动身|返回/.test(raw) && travel(state, raw, blocks)) { /* handled */ }
  else if (!ending && talk(state, raw, blocks)) { /* handled */ }
  else if (!ending && /挑战|战斗|攻击|打一架|出剑/.test(raw)) startBattle(state, locationEnemy(state), blocks);
  else if (!ending && /探索|搜寻|四处看看/.test(raw)) {
    triggerRandomEvent(state, random, blocks);
    if (!blocks.length) blocks.push(narr(`你仔细走过${state.story.location}，旧路没有新事，却让心境安定了几分。`));
  }
  else if (!ending) localFreeform(state, raw, random, blocks);

  advanceAct(state, blocks);
  state.player.hp = clamp(state.player.hp, ending?.id === 'fallen' ? 0 : 1, state.player.maxHp);
  return { state: migrateGameState(state), blocks, suggestions: getAvailableActions(state), autosave: true, ...(ending ? { ending } : {}) };
}

export function dispatchLocalChoice(source, choiceId, random = Math.random) {
  const state = copy(source);
  if (state.mode !== 'local') {
    return { state, blocks: [sys('AI 旅程不能调用本地剧情选项。')], suggestions: getAvailableActions(state), autosave: false };
  }
  const selected = legalChoices(state).find((action) => action.id === String(choiceId ?? ''));
  if (!selected) {
    return { state, blocks: [sys('这个选项当前不可用。请选择画面中提供的行动。')], suggestions: getAvailableActions(state), autosave: false };
  }
  return dispatchLocalCommand(state, selected.command, random);
}

export { ACHIEVEMENTS, ENDINGS, ITEMS, LOCATIONS, NPCS, QUESTS, REALMS, STORY_SCENES, TECHNIQUES };

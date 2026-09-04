import { ITEMS, LOCATIONS, NPCS, QUESTS, REALMS, TECHNIQUES } from './game-data.js';

const SLASH_COMMANDS = new Map([
  ['/状态', 'status'], ['/面板', 'status'], ['/境界', 'realm'], ['/灵气', 'qi'], ['/灵力', 'spirit'],
  ['/技能', 'technique'], ['/功法', 'technique'], ['/背包', 'inventory'], ['/装备', 'equipment'],
  ['/任务', 'quest'], ['/关系', 'relationship'], ['/地图', 'map'], ['/位置', 'map'], ['/回顾', 'recap'],
  ['/存档', 'save'], ['/帮助', 'help']
]);

const cleanInput = (value) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 2_000);

function inferSystemCommand(input) {
  if (/面板|属性|状态|气血|生命/.test(input)) return 'status';
  if (/突破.*(?:还差|需要|多少)|灵气|修炼进度/.test(input)) return 'qi';
  if (/灵力|法力|施法消耗|功法消耗/.test(input)) return 'spirit';
  if (/技能|功法|法术|招式/.test(input) || Object.keys(TECHNIQUES).some((name) => input.includes(name))) return 'technique';
  if (/装备|武器|护甲|配饰/.test(input)) return 'equipment';
  if (/背包|物品|丹药|材料/.test(input)) return 'inventory';
  if (/任务|主线|支线|目标/.test(input)) return 'quest';
  if (/关系|好感|信任|讨厌|喜欢我吗/.test(input) || Object.keys(NPCS).some((name) => input.includes(name) && /如何|怎样|多少|信任|关系|好感/.test(input))) return 'relationship';
  if (/地图|位置|在哪里|能去哪里|地点/.test(input)) return 'map';
  if (/回顾|回忆|之前发生|经历过|记得什么/.test(input)) return 'recap';
  if (/存档|保存|读档|导出|导入/.test(input)) return 'save';
  if (/帮助|怎么操作|怎么玩|指令/.test(input)) return 'help';
  if (/境界|修为层次|什么阶段/.test(input)) return 'realm';
  return null;
}

function explicitNpcSpeech(input) {
  return /我(?:对|向|问|告诉|回答|喊住).{0,30}(?:说|问|喊|回答|解释|告诉)|我问(?:林小满|李老|苏晚晴|钱多多|慕容雪|赵天霸|陆沉舟|宁无妄)/.test(input);
}

function explicitWorldAction(input) {
  return /(?:继续|立刻|准备|尝试|我要|我去|我用|我施展)?.{0,8}(?:赶路|前往|攻击|防御|追赶|逃跑|调查|搜索|打开|修炼|闭关|施展|购买|交付|救助|跟踪|潜入|战斗|探索)/.test(input);
}

export function classifyTurn({ mode, channel, input }) {
  const normalizedInput = cleanInput(input);
  if (!normalizedInput) return { kind: 'ambiguous', normalizedInput };
  if (channel === 'system') {
    return { kind: 'system', normalizedInput, command: SLASH_COMMANDS.get(normalizedInput) || inferSystemCommand(normalizedInput) || 'query' };
  }
  if (normalizedInput.startsWith('/')) {
    const command = SLASH_COMMANDS.get(normalizedInput);
    return command
      ? { kind: 'system', normalizedInput, command }
      : { kind: 'ambiguous', normalizedInput };
  }
  if (mode === 'local') {
    if (channel === 'choice' && /^[\p{L}\p{N}_.:/\-]+$/u.test(normalizedInput)) {
      return { kind: 'local-choice', normalizedInput };
    }
    const command = inferSystemCommand(normalizedInput);
    return command
      ? { kind: 'system', normalizedInput, command }
      : { kind: 'ambiguous', normalizedInput };
  }
  if (mode !== 'ai') return { kind: 'ambiguous', normalizedInput };
  if (explicitNpcSpeech(normalizedInput)) return { kind: 'world', normalizedInput };

  const command = inferSystemCommand(normalizedInput);
  const worldAction = explicitWorldAction(normalizedInput);
  if (command && worldAction) return { kind: 'ambiguous', normalizedInput };
  if (command) return { kind: 'system', normalizedInput, command };
  return { kind: 'world', normalizedInput };
}

const systemBlock = (text) => ({ type: 'sys', text });

function statusAnswer(state) {
  const realm = REALMS[state.player.realm] || REALMS[0];
  return systemBlock(`${state.player.name} · ${realm.name}｜气血 ${state.player.hp}/${state.player.maxHp}｜灵气 ${state.player.qi}/${realm.need}｜灵力 ${state.player.spirit}/${state.player.maxSpirit}｜灵石 ${state.player.gold}｜第 ${state.story.day} 日 ${state.story.period}｜${state.story.location}`);
}

function qiAnswer(state) {
  if (state.player.realm >= REALMS.length - 1) return systemBlock('你已抵达渡劫期；灵气将用于稳固道基与应对天劫。');
  const need = REALMS[state.player.realm].need;
  return systemBlock(`当前灵气 ${state.player.qi}/${need}，距离突破至 ${REALMS[state.player.realm + 1].name} 还差 ${Math.max(0, need - state.player.qi)} 点灵气。灵气只用于修炼突破。`);
}

function spiritAnswer(state) {
  const equippedCosts = state.techniques.equipped
    .filter((name) => TECHNIQUES[name])
    .map((name) => `${name} ${TECHNIQUES[name].cost}点`)
    .join('、');
  return systemBlock(`当前灵力 ${state.player.spirit}/${state.player.maxSpirit}。灵力用于施展功法，不计入突破；已装备功法消耗：${equippedCosts || '暂无可施展功法'}。`);
}

function techniqueAnswer(state) {
  const lines = state.techniques.known.map((name) => {
    const technique = TECHNIQUES[name];
    if (!technique) return name;
    const equipped = state.techniques.equipped.includes(name) ? '已装备' : '未装备';
    return `《${name}》· ${equipped} · 灵力 ${technique.cost} · ${technique.description}`;
  });
  return systemBlock(`已掌握功法：${lines.join('；') || '尚未掌握功法'}。`);
}

function inventoryAnswer(state) {
  const lines = Object.entries(state.inventory.items)
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => `${name}×${amount}${ITEMS[name] ? `（${ITEMS[name].description}）` : ''}`);
  return systemBlock(`背包 ${Object.keys(state.inventory.items).length}/${state.inventory.limit}：${lines.join('；') || '空'}。`);
}

function equipmentAnswer(state) {
  return systemBlock(`装备：武器 ${state.equipment.weapon || '无'}｜护甲 ${state.equipment.armor || '无'}｜配饰 ${state.equipment.accessory || '无'}。装备详情可在背包面板查看。`);
}

function questAnswer(state) {
  const lines = state.quests.active.map((entry) => {
    const quest = QUESTS[entry.id];
    return quest ? `${quest.type === 'main' ? '主线' : '支线'}《${quest.title}》${entry.progress}/${entry.target}：${quest.description}` : entry.id;
  });
  return systemBlock(lines.length ? lines.join('；') : '当前没有进行中的任务。主线导演会在世界回合中继续推进因果。');
}

function relationshipAnswer(state, input) {
  const mentioned = Object.keys(state.relationships).filter((name) => input.includes(name));
  const names = mentioned.length ? mentioned : Object.keys(state.relationships);
  return systemBlock(`人物关系：${names.map((name) => `${name} ${state.relationships[name]}`).join('｜')}。正值代表亲近，负值代表戒备或敌意。`);
}

function mapAnswer(state) {
  const unlocked = Object.entries(LOCATIONS)
    .filter(([, location]) => state.story.act >= location.act && state.player.realm >= location.realm)
    .map(([name]) => name);
  return systemBlock(`当前位置：${state.story.location}。${LOCATIONS[state.story.location]?.description || ''} 已解锁地点：${unlocked.join('、')}。查看地图不会推动时间。`);
}

function recapAnswer(state) {
  const summaries = Object.values(state.memory.chapterSummaries).slice(-2);
  const facts = state.memory.facts.slice(-6).map((fact) => `${fact.subjectId}：${fact.object}`);
  const lines = [...summaries, ...facts];
  return systemBlock(lines.length ? `旅程回顾：${lines.join('；')}` : `你从赵府柴房醒来，如今身在${state.story.location}。更完整的经历会随世界回合写入旅程记录。`);
}

export function answerSystemQuery(state, input) {
  if (!state || typeof state !== 'object') return { handled: false, blocks: [] };
  const classification = classifyTurn({ mode: state.mode, channel: 'system', input });
  const command = classification.command;
  let block;
  if (command === 'status') block = statusAnswer(state);
  else if (command === 'realm' || command === 'qi') block = qiAnswer(state);
  else if (command === 'spirit') block = spiritAnswer(state);
  else if (command === 'technique') block = techniqueAnswer(state);
  else if (command === 'inventory') block = inventoryAnswer(state);
  else if (command === 'equipment') block = equipmentAnswer(state);
  else if (command === 'quest') block = questAnswer(state);
  else if (command === 'relationship') block = relationshipAnswer(state, classification.normalizedInput);
  else if (command === 'map') block = mapAnswer(state);
  else if (command === 'recap') block = recapAnswer(state);
  else if (command === 'save') block = systemBlock('存档管理位于右上角：本地版与 AI 版各自拥有独立自动存档和三个手动槽位；导出旅程会连同完整文字记录一起保存，但不会包含 API 密钥。');
  else block = systemBlock('系统频道会暂停时间。可问：面板、境界、灵气、灵力、技能、背包、装备、任务、关系、地图、回顾、存档；切回“行动”频道才会推动世界。');
  return { handled: true, blocks: [block] };
}

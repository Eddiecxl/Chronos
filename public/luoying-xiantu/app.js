import { createGameState } from './game-state.js';
import {
  ACHIEVEMENTS, ENDINGS, ITEMS, LOCATIONS, NPCS, QUESTS, REALMS, TECHNIQUES,
  dispatchLocalChoice, getAvailableActions, getLocalPanelActions
} from './game-engine.js';
import { createStorage } from './storage.js';
import { createTranscriptStore } from './transcript-store.js';
import { createAiClient, modelsForProvider, PROVIDERS } from './ai-client.js';
import { createAiTurnRunner } from './ai-turn.js';
import { classifyTurn } from './turn-router.js';
import {
  derivedPlayerStats, EQUIPMENT_SLOT_ORDER, commitAiEquipmentForActiveJourney, restoreAiEquipmentState
} from './equipment.js';
import {
  buildCharacterView, buildCodexView, buildHistoryView, buildInventoryView, buildMapView, buildQuestView
} from './panel-view.js';

const byId = (id) => document.getElementById(id);
const dom = Object.fromEntries([
  'cover', 'game', 'characterName', 'newLocalButton', 'continueLocalButton', 'newAiButton', 'continueAiButton',
  'titleAiSettingsButton', 'legacyCard', 'legacyText', 'legacyLocalButton', 'legacyAiButton', 'titleButton',
  'statusName', 'statusRealm', 'statusHp', 'statusQi', 'statusSpirit', 'statusGold', 'statusLocation', 'statusMode',
  'hpBar', 'qiBar', 'spiritBar', 'modeBadge', 'actLabel', 'dayLabel', 'pauseBadge', 'storyLog', 'pendingIndicator',
  'localActions', 'aiComposer', 'worldChannel', 'systemChannel', 'aiInputForm', 'playerInput', 'sendButton',
  'composerHint', 'retryPanel', 'retryMessage', 'retryButton', 'switchProviderButton', 'editRetryButton',
  'retryTitleButton', 'panelLayer', 'panelTitle', 'panelTabs', 'panelContent', 'saveLayer', 'saveButton',
  'saveModeNote', 'saveSlots', 'exportButton', 'importButton', 'importInput', 'aiLayer', 'aiButton', 'providerSelect',
  'credentialField', 'credentialSelect', 'keyField', 'apiKeyInput', 'baseField', 'baseUrlInput', 'modelInput', 'modelOptions',
  'providerTip', 'connectionStatus', 'clearCredentialButton', 'testAiButton', 'saveAiButton', 'trialPrompt',
  'trialProviderA', 'trialProviderB', 'runTrialButton', 'trialResults', 'endingCard', 'endingTitle', 'endingText',
  'newGamePlusButton', 'breakthrough', 'breakthroughRealm', 'toast', 'petalField'
].map((id) => [id, byId(id)]));

const ACT_TITLES = ['', '第一幕 · 尘缘初醒', '第二幕 · 山门风云', '第三幕 · 青岚遗境', '第四幕 · 金丹劫火', '第五幕 · 问天渡劫'];
const LOCAL_OPENING = [
  { type: 'narr', text: '潮湿柴草扎着掌心。你从一场不属于自己的噩梦里睁开眼，门外雨声正紧。' },
  { type: 'dlg', name: '林小满', text: '里面的人还活着吗？赵天霸带人过来了！' },
  { type: 'sys', text: '本地版只接受下方选项。所有剧情均来自固定本地内容，不会连接 AI。' }
];

const storage = createStorage();
const transcriptStore = createTranscriptStore();
const aiClient = createAiClient();
const aiRunner = createAiTurnRunner({ aiClient, transcriptStore, stateStore: storage });

let state = null;
let mode = null;
let channel = 'world';
let activePanel = 'character';
let historyVisible = 30;
let pending = false;
let equipmentPending = false;
let retryContext = null;
let aiSettings = aiClient.loadSettings();
let runtimeKey = '';
let toastTimer;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showToast(message) {
  clearTimeout(toastTimer);
  dom.toast.textContent = String(message);
  dom.toast.hidden = false;
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 3200);
}

function spawnPetals() {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 18; index += 1) {
    const petal = node('i', 'petal');
    petal.style.left = `${(index * 37) % 100}%`;
    petal.style.setProperty('--size', `${7 + (index % 6)}px`);
    petal.style.setProperty('--opacity', `${0.3 + (index % 5) * 0.1}`);
    petal.style.setProperty('--duration', `${10 + (index % 7)}s`);
    petal.style.setProperty('--delay', `${-(index % 11)}s`);
    petal.style.setProperty('--sway', `${20 + (index % 5) * 13}px`);
    fragment.append(petal);
  }
  dom.petalField.append(fragment);
}

function appendStoryBlock(block) {
  const type = ['narr', 'dlg', 'sys', 'player'].includes(block?.type) ? block.type : 'narr';
  const article = node('article', `blk ${type}`);
  const name = block?.name || (type === 'sys' ? '系统' : type === 'player' ? state?.player?.name || '你' : '');
  if (name) article.append(node('span', 'tag', name));
  const text = node('div', 'txt');
  text.textContent = String(block?.text || '');
  article.append(text);
  dom.storyLog.append(article);
  requestAnimationFrame(() => dom.storyLog.scrollTo({ top: dom.storyLog.scrollHeight, behavior: 'smooth' }));
}

function appendTurnToStory(turn) {
  if (turn?.userText) appendStoryBlock({ type: 'player', text: turn.userText });
  for (const block of turn?.blocks || []) appendStoryBlock(block);
}

async function renderTranscript() {
  dom.storyLog.replaceChildren();
  const turns = await transcriptStore.allTurns(state.journeyId);
  for (const turn of turns) appendTurnToStory(turn);
  return turns;
}

function updatePauseBadge() {
  const modalOpen = !dom.panelLayer.hidden || !dom.saveLayer.hidden || !dom.aiLayer.hidden;
  const paused = modalOpen || (mode === 'ai' && channel === 'system');
  dom.pauseBadge.hidden = !paused;
}

function renderTopbar() {
  if (!state) return;
  const realm = REALMS[state.player.realm] || REALMS[0];
  const derived = derivedPlayerStats(state);
  dom.statusName.textContent = state.player.name;
  dom.statusRealm.textContent = realm.name;
  dom.statusHp.textContent = `${state.player.hp}/${state.player.maxHp}`;
  dom.statusQi.textContent = `${state.player.qi}/${realm.need}`;
  dom.statusSpirit.textContent = `${state.player.spirit}/${derived.maxSpirit}`;
  dom.statusGold.textContent = String(state.player.gold);
  dom.statusLocation.textContent = state.story.location;
  dom.statusMode.textContent = mode === 'ai' ? `AI · ${PROVIDERS[aiSettings.provider]?.label || '未设置'}` : '本地版';
  dom.modeBadge.classList.toggle('ai-mode', mode === 'ai');
  dom.hpBar.style.width = `${Math.max(0, Math.min(100, state.player.hp / state.player.maxHp * 100))}%`;
  dom.qiBar.style.width = `${Math.max(0, Math.min(100, state.player.qi / realm.need * 100))}%`;
  dom.spiritBar.style.width = `${Math.max(0, Math.min(100, state.player.spirit / derived.maxSpirit * 100))}%`;
  dom.actLabel.textContent = ACT_TITLES[state.story.act] || `第 ${state.story.act} 幕`;
  dom.dayLabel.textContent = `第 ${state.story.day} 日 · ${state.story.period}`;
}

function setPending(value) {
  pending = value;
  dom.pendingIndicator.hidden = !value;
  dom.sendButton.disabled = value;
  dom.playerInput.disabled = value;
  for (const button of dom.localActions.querySelectorAll('button')) button.disabled = value;
  syncEquipmentControls();
}

function renderLocalChoices() {
  dom.localActions.replaceChildren();
  if (!state || mode !== 'local') return;
  for (const action of getAvailableActions(state)) {
    const button = node('button');
    button.type = 'button';
    button.dataset.choiceId = action.id;
    button.append(node('span', '', action.icon), document.createTextNode(action.label));
    button.addEventListener('click', () => runLocalChoice(action.id, action.label));
    dom.localActions.append(button);
  }
}

function renderModeControls() {
  dom.localActions.hidden = mode !== 'local';
  dom.aiComposer.hidden = mode !== 'ai';
  dom.aiButton.hidden = false;
  if (mode === 'local') renderLocalChoices();
  updateChannelUi();
}

function equipmentUnavailable() {
  return pending || equipmentPending || Boolean(state?.battle);
}

function syncEquipmentControls() {
  for (const button of dom.panelContent.querySelectorAll('[data-equipment-item]')) button.disabled = equipmentUnavailable();
}

function setEquipmentPending(value) {
  equipmentPending = value;
  syncEquipmentControls();
}

function updateChannelUi() {
  const system = channel === 'system';
  dom.worldChannel.classList.toggle('active', !system);
  dom.systemChannel.classList.toggle('active', system);
  dom.worldChannel.setAttribute('aria-selected', String(!system));
  dom.systemChannel.setAttribute('aria-selected', String(system));
  dom.playerInput.placeholder = system ? '询问面板、技能、灵气、关系、回顾……时间不会前进' : '说什么、做什么，都可以直接写……';
  dom.composerHint.textContent = system ? '系统频道：时间、战斗与 NPC 计划全部暂停。' : '行动频道会推动世界；AI 失败时世界原样不动。';
  updatePauseBadge();
}

function showBreakthrough(previousRealm) {
  if (state.player.realm <= previousRealm) return;
  dom.breakthroughRealm.textContent = REALMS[state.player.realm]?.name || '';
  dom.breakthrough.hidden = false;
  setTimeout(() => { dom.breakthrough.hidden = true; }, 2300);
}

function showEnding(ending) {
  if (!ending) return;
  dom.endingTitle.textContent = ending.title;
  dom.endingText.textContent = ending.description;
  dom.endingCard.hidden = false;
}

async function runLocalChoice(choiceId, label) {
  if (pending || mode !== 'local') return;
  const previousRealm = state.player.realm;
  const result = dispatchLocalChoice(state, choiceId);
  if (!result.autosave) {
    showToast(result.blocks?.[0]?.text || '这个选择当前不可用。');
    return;
  }
  state = result.state;
  storage.saveAuto('local', state);
  const turn = {
    id: `local-${Date.now()}-${state.stats.turns}`,
    kind: 'world', userText: label,
    blocks: result.blocks,
    createdAt: new Date().toISOString()
  };
  await transcriptStore.appendTurn(state.journeyId, turn);
  appendStoryBlock({ type: 'player', text: label });
  for (const block of result.blocks) appendStoryBlock(block);
  renderTopbar();
  renderLocalChoices();
  showBreakthrough(previousRealm);
  showEnding(result.ending);
}

function showRetry(result, type) {
  retryContext = { type, ...result.retry };
  const message = String(result.error || 'AI 回合失败').replace(/[。.!！]+$/u, '');
  dom.retryMessage.textContent = `${message}。世界仍停在行动前；可重试、换模型或修改输入。`;
  dom.retryPanel.hidden = false;
}

function clearRetry() {
  retryContext = null;
  dom.retryPanel.hidden = true;
}

function currentAiSettings() {
  return { ...aiSettings, key: runtimeKey };
}

async function runAiOpening(transactionId) {
  if (pending || mode !== 'ai') return;
  const journeyId = state.journeyId;
  clearRetry();
  setPending(true);
  const result = await aiRunner.runOpening({ state, settings: currentAiSettings(), transactionId });
  setPending(false);
  if (dom.game.hidden || mode !== 'ai' || state?.journeyId !== journeyId) return;
  if (!result.ok) {
    showRetry(result, 'opening');
    return;
  }
  state = result.state;
  for (const block of result.blocks) appendStoryBlock(block);
  renderTopbar();
}

async function runAiWorld(input, transactionId) {
  if (pending || mode !== 'ai') return;
  const journeyId = state.journeyId;
  clearRetry();
  setPending(true);
  const result = await aiRunner.runWorld({ state, input, settings: currentAiSettings(), transactionId });
  setPending(false);
  if (dom.game.hidden || mode !== 'ai' || state?.journeyId !== journeyId) return;
  if (!result.ok) {
    showRetry(result, 'world');
    return;
  }
  state = result.state;
  appendStoryBlock({ type: 'player', text: input });
  for (const block of result.blocks) appendStoryBlock(block);
  dom.playerInput.value = '';
  resizeComposer();
  renderTopbar();
}

async function runAiSystem(input) {
  if (pending || mode !== 'ai') return;
  const journeyId = state.journeyId;
  clearRetry();
  setPending(true);
  const result = await aiRunner.runSystem({ state, input, settings: currentAiSettings() });
  setPending(false);
  if (dom.game.hidden || mode !== 'ai' || state?.journeyId !== journeyId) return;
  if (!result.ok) {
    showRetry(result, 'system');
    return;
  }
  appendStoryBlock({ type: 'player', text: input });
  for (const block of result.blocks) appendStoryBlock(block);
  dom.playerInput.value = '';
  resizeComposer();
}

async function submitAiInput(event) {
  event.preventDefault();
  const input = dom.playerInput.value.trim();
  const classification = classifyTurn({ mode: 'ai', channel, input });
  if (classification.kind === 'ambiguous') {
    showToast('这句话同时像系统询问和世界行动，请先选择“行动”或“系统”频道。');
    return;
  }
  if (classification.kind === 'system') await runAiSystem(classification.normalizedInput);
  else await runAiWorld(classification.normalizedInput);
}

async function ensureLocalOpening() {
  const turns = await transcriptStore.allTurns(state.journeyId);
  if (turns.length) return;
  const turn = { id: 'local-opening', kind: 'world', blocks: LOCAL_OPENING, createdAt: new Date().toISOString() };
  await transcriptStore.appendTurn(state.journeyId, turn);
}

async function enterGame(nextState, { skipOpening = false } = {}) {
  state = nextState.mode === 'ai'
    ? await storage.recoverPendingTurn('ai', nextState, transcriptStore)
    : nextState;
  mode = state.mode;
  channel = 'world';
  clearRetry();
  dom.endingCard.hidden = true;
  dom.cover.hidden = true;
  dom.game.hidden = false;
  if (mode === 'local') await ensureLocalOpening();
  const turns = await renderTranscript();
  renderTopbar();
  renderModeControls();
  if (mode === 'ai' && !skipOpening && !turns.some((turn) => turn.kind === 'world')) await runAiOpening();
}

function requestedName() {
  return dom.characterName.value.trim() || '顾长生';
}

async function startNew(modeToStart) {
  try {
    const created = createGameState(requestedName(), modeToStart);
    storage.saveAuto(modeToStart, created);
    await enterGame(created);
  } catch (error) {
    showToast(error.message);
  }
}

async function continueMode(modeToContinue) {
  const saved = storage.loadAuto(modeToContinue);
  if (!saved) return showToast('这个版本还没有自动存档。');
  await enterGame(saved);
}

function closeAllLayers() {
  dom.panelLayer.hidden = true;
  dom.saveLayer.hidden = true;
  dom.aiLayer.hidden = true;
  updatePauseBadge();
}

function renderTitle() {
  closeAllLayers();
  dom.game.hidden = true;
  dom.cover.hidden = false;
  const localSave = storage.loadAuto('local');
  const aiSave = storage.loadAuto('ai');
  dom.continueLocalButton.hidden = !localSave;
  dom.continueAiButton.hidden = !aiSave;
  if (localSave) dom.continueLocalButton.textContent = `继续 ${localSave.player.name} · ${REALMS[localSave.player.realm].name}`;
  if (aiSave) dom.continueAiButton.textContent = `继续 ${aiSave.player.name} · ${PROVIDERS[aiSettings.provider]?.label || 'AI'}`;
  const legacy = storage.findLegacySave();
  dom.legacyCard.hidden = !legacy;
  if (legacy) dom.legacyText.textContent = `发现旧版存档「${legacy.player.name}」。可复制到一个新版本，原存档不会删除。`;
}

function panelCard(title, lines, className = '') {
  const card = node('section', `panel-card ${className}`.trim());
  card.append(node('h3', '', title));
  for (const line of lines) card.append(node('p', '', line));
  return card;
}

const SLOT_LABELS = Object.freeze({
  head: '头饰', neck: '颈饰', body: '躯干', arms: '护臂', hands: '手持', legs: '腿甲', feet: '鞋履'
});

const statText = (item) => [
  item?.attack ? `攻击加${item.attack}` : '', item?.defense ? `防御加${item.defense}` : '',
  item?.spirit ? `灵力上限加${item.spirit}` : ''
].filter(Boolean).join('，');

function vitalMeter(label, value, max, kind) {
  const meter = node('section', `vital-meter ${kind}`);
  const heading = node('header');
  heading.append(node('span', '', label), node('b', '', `${value}/${max}`));
  const rail = node('div', 'vital-rail');
  const fill = node('i');
  fill.style.width = `${Math.max(0, Math.min(100, Number(value) / Math.max(1, Number(max)) * 100))}%`;
  rail.append(fill);
  meter.append(heading, rail);
  return meter;
}

function attributeTile(label, value, detail) {
  const tile = node('section', 'attribute-tile');
  tile.append(node('small', '', label), node('strong', '', String(value)));
  if (detail) tile.append(node('span', '', detail));
  return tile;
}

function itemsForSlot(stateToRender, slot, equippedName) {
  return buildInventoryView(stateToRender).filter((item) => ITEMS[item.name]?.slot === slot
    && item.amount > 0 && item.name !== equippedName);
}

function equipmentSlot(view, slot) {
  const itemName = view.slots[slot];
  const equipped = itemName ? ITEMS[itemName] : null;
  const replacements = mode === 'ai' ? itemsForSlot(state, slot, itemName) : [];
  const className = `equipment-slot rarity-${equipped?.rarity || 'empty'}`;
  const label = SLOT_LABELS[slot];
  const description = equipped ? `${label}：${itemName}${statText(equipped) ? `，${statText(equipped)}` : ''}` : `${label}：未装备`;
  const element = node('section', className);
  element.dataset.slot = slot;
  element.setAttribute('aria-label', state?.battle ? `${description}。战斗未结束，不能更换装备。` : description);
  element.append(node('small', '', label), node('strong', '', itemName || '未装备'));
  if (equipped && statText(equipped)) element.append(node('span', '', statText(equipped)));
  if (state?.battle) element.append(node('span', 'equip-prompt', '战斗中不可更换'));
  const actions = node('div', 'equipment-replacements');
  for (const replacement of replacements) {
    const button = node('button', 'equip-action', `换上 ${replacement.name}`);
    button.type = 'button';
    button.dataset.equipmentItem = replacement.name;
    button.disabled = equipmentUnavailable();
    button.setAttribute('aria-label', `${label}：装备 ${replacement.name}${statText(replacement) ? `，${statText(replacement)}` : ''}`);
    button.addEventListener('click', () => saveAiEquipment(replacement.name));
    actions.append(button);
  }
  if (replacements.length) element.append(actions);
  return element;
}

function paperDoll(view) {
  const doll = node('section', 'paper-doll');
  doll.setAttribute('aria-label', `${view.name}的七槽装备构筑`);
  const silhouette = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  silhouette.setAttribute('class', 'doll-silhouette');
  silhouette.setAttribute('viewBox', '0 0 220 430');
  silhouette.setAttribute('aria-hidden', 'true');
  for (const d of ['M110 70 L110 6', 'M86 122 L18 122', 'M134 170 L202 170', 'M76 264 L18 264', 'M144 316 L202 316', 'M88 374 L18 404', 'M132 374 L202 404']) {
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    connector.setAttribute('class', 'doll-line');
    connector.setAttribute('d', d);
    silhouette.append(connector);
  }
  const shapes = [
    ['circle', { cx: '110', cy: '58', r: '35' }], ['path', { d: 'M78 104 Q110 86 142 104 L164 215 L137 238 L138 371 L82 371 L83 238 L56 215Z' }],
    ['path', { d: 'M83 130 L37 230 L61 242 L100 171Z' }], ['path', { d: 'M137 130 L183 230 L159 242 L120 171Z' }],
    ['path', { d: 'M83 367 L70 412 L100 412 L108 367Z' }], ['path', { d: 'M137 367 L150 412 L120 412 L112 367Z' }]
  ];
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    silhouette.append(shape);
  }
  doll.append(silhouette);
  for (const slot of EQUIPMENT_SLOT_ORDER) doll.append(equipmentSlot(view, slot));
  return doll;
}

async function saveAiEquipment(itemName) {
  if (pending || equipmentPending || state?.battle) {
    if (state?.battle) showToast('战斗尚未结束，暂不能更换装备。');
    return;
  }
  if (mode !== 'ai' || !state) return;
  const original = state;
  setEquipmentPending(true);
  try {
    const saved = await commitAiEquipmentForActiveJourney(storage, original, itemName, () => state);
    if (!saved) return;
    if (state?.journeyId !== original.journeyId) return;
    state = saved;
    renderTopbar();
    await renderPanel(activePanel);
    showToast(`${itemName}已装备。此操作未推进世界时间。`);
  } catch (error) {
    if (state?.journeyId !== original.journeyId) return;
    state = restoreAiEquipmentState(storage, original);
    showToast(error?.message || '装备没有保存。');
    await renderPanel(activePanel);
  } finally {
    setEquipmentPending(false);
  }
}

function renderLocalCharacterPanel() {
  const grid = node('div', 'panel-grid');
  const realm = REALMS[state.player.realm];
  grid.append(panelCard('道途', [
    `${state.player.name} · ${realm.name}`,
    `气血 ${state.player.hp}/${state.player.maxHp} · 灵气 ${state.player.qi}/${realm.need}`,
    `灵力 ${state.player.spirit}/${state.player.maxSpirit} · 灵石 ${state.player.gold}`
  ]));
  grid.append(panelCard('攻守', [
    `攻击 ${state.player.attack} · 防御 ${state.player.defense}`,
    `武器 ${state.equipment.weapon || '无'} · 护甲 ${state.equipment.armor || '无'} · 配饰 ${state.equipment.accessory || '无'}`
  ]));
  grid.append(panelCard('所学功法', state.techniques.known.map((name) => {
    const art = TECHNIQUES[name];
    return art ? `《${name}》· 灵力 ${art.cost} · ${art.description}` : name;
  }), 'wide'));
  grid.append(panelCard('人物关系', Object.entries(state.relationships).map(([name, value]) => `${name} ${value >= 0 ? '+' : ''}${value}`), 'wide'));
  dom.panelContent.append(grid);
}

function renderCharacterPanel() {
  if (state.mode === 'local') return renderLocalCharacterPanel();
  const view = buildCharacterView(state);
  const sheet = node('div', 'character-sheet');
  const stats = node('aside', 'character-stats');
  stats.append(node('p', 'character-kicker', `${view.name} · ${view.realm}`));
  stats.append(vitalMeter('气血', view.hp, view.maxHp, 'hp'));
  stats.append(vitalMeter('灵气', view.qi, view.qiNeed, 'qi'));
  stats.append(vitalMeter('法术灵力', view.spirit, view.maxSpirit, 'spirit'));
  const attributes = node('div', 'attribute-grid');
  attributes.append(
    attributeTile('攻击', view.stats.attack, '本命与装备'),
    attributeTile('防御', view.stats.defense, '护体与装备'),
    attributeTile('灵石', state.player.gold, '随身财货'),
    attributeTile('游戏日', `第 ${state.story.day} 日`, state.story.period)
  );
  stats.append(attributes);
  sheet.append(stats, paperDoll(view));
  dom.panelContent.append(sheet);

  if (view.techniques.length) {
    const techniques = node('section', 'panel-card technique-card');
    techniques.append(node('h3', '', '所学功法'));
    for (const art of view.techniques) techniques.append(node('p', '', `《${art.name}》· 灵力 ${art.cost} · ${art.description}`));
    dom.panelContent.append(techniques);
  }
  if (view.relationships.length) {
    const relations = node('section', 'panel-card relationship-section');
    relations.append(node('h3', '', '人物关系'));
    const list = node('div', 'relationship-list');
    for (const person of view.relationships) {
      const card = node('article', 'relationship-card');
      card.append(node('strong', '', person.name), node('span', '', person.role), node('b', '', `${person.value >= 0 ? '+' : ''}${person.value}`));
      list.append(card);
    }
    relations.append(list);
    dom.panelContent.append(relations);
  } else dom.panelContent.append(panelCard('人物关系', ['旅途尚未留下可辨认的人物记录。']));
}

function renderLocalQuestPanel() {
  if (!state.quests.active.length) dom.panelContent.append(panelCard('暂无进行中任务', ['世界行动会继续牵动主线与支线。'], 'wide'));
  for (const entry of state.quests.active) {
    const quest = QUESTS[entry.id];
    const card = node('section', 'quest-card');
    card.append(node('h3', '', `${quest?.type === 'main' ? '主线' : '支线'} · ${quest?.title || entry.id}`));
    card.append(node('p', '', quest?.description || ''));
    card.append(node('p', '', `进度 ${entry.progress}/${entry.target}`));
    const progress = node('div', 'progress');
    const bar = node('i');
    bar.style.width = `${Math.min(100, entry.progress / entry.target * 100)}%`;
    progress.append(bar);
    card.append(progress);
    dom.panelContent.append(card);
  }
}

function renderQuestPanel() {
  if (state.mode === 'local') return renderLocalQuestPanel();
  const view = buildQuestView(state);
  const labels = { active: '进行中', completed: '已完成', failed: '已失败' };
  for (const [status, entries] of Object.entries(view)) {
    if (!entries.length) continue;
    const section = node('section', 'quest-section');
    section.append(node('h3', '', labels[status]));
    for (const quest of entries) {
      const card = node('article', 'quest-card');
      card.append(node('h4', '', `${quest.type === 'main' ? '主线' : '支线'} · ${quest.title}`), node('p', '', quest.description));
      if (status === 'active') {
        card.append(node('p', '', `进度 ${quest.progress}/${quest.target}`));
        const progress = node('div', 'progress');
        const bar = node('i');
        bar.style.width = `${Math.min(100, quest.progress / quest.target * 100)}%`;
        progress.append(bar);
        card.append(progress);
      }
      section.append(card);
    }
    dom.panelContent.append(section);
  }
  if (!dom.panelContent.childElementCount) dom.panelContent.append(panelCard('暂无任务记录', ['新的因果会在真正发生后留下痕迹。'], 'wide'));
}

function actionButton(action) {
  const button = node('button', '', action.label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    closeAllLayers();
    await runLocalChoice(action.id, action.label);
  });
  return button;
}

function aiEquipmentAction(item) {
  const button = node('button', 'equip-action inventory-equip-action');
  const equipped = buildCharacterView(state).slots[ITEMS[item.name]?.slot] === item.name;
  button.type = 'button';
  button.dataset.equipmentItem = item.name;
  button.disabled = equipmentUnavailable() || equipped;
  button.textContent = equipped ? '已装备' : `装备 · ${SLOT_LABELS[ITEMS[item.name]?.slot] || '法器'}`;
  button.setAttribute('aria-label', equipped ? `${item.name}已装备` : `装备${item.name}${statText(ITEMS[item.name]) ? `，${statText(ITEMS[item.name])}` : ''}`);
  button.addEventListener('click', () => saveAiEquipment(item.name));
  return button;
}

function renderLocalInventoryPanel() {
  const grid = node('div', 'inventory-grid');
  const actions = getLocalPanelActions(state, 'inventory');
  for (const [name, amount] of Object.entries(state.inventory.items).filter(([, count]) => count > 0)) {
    const item = ITEMS[name];
    const card = node('section', 'inventory-card');
    const heading = node('header');
    heading.append(node('h3', '', name), node('b', '', `×${amount}`));
    card.append(heading, node('p', '', item?.description || '尚未录入图鉴。'));
    const action = actions.find((candidate) => candidate.id.endsWith(`:${name}`));
    if (action) card.append(actionButton(action));
    grid.append(card);
  }
  if (!grid.childElementCount) grid.append(panelCard('背包为空', ['有些因果无法装进储物袋。']));
  dom.panelContent.append(grid);
  const recipes = getLocalPanelActions(state, 'alchemy');
  const alchemy = panelCard('可炼丹方', recipes.length ? ['材料已齐，可以开炉。'] : ['回春丹：止血草×2、凝露花×1；聚气丹：凝露花×2、赤焰果×1。']);
  for (const recipe of recipes) alchemy.append(actionButton(recipe));
  dom.panelContent.append(alchemy);
}

function renderInventoryPanel() {
  if (state.mode === 'local') return renderLocalInventoryPanel();
  const grid = node('div', 'inventory-grid');
  for (const item of buildInventoryView(state)) {
    const { name, amount } = item;
    const card = node('section', 'inventory-card');
    const heading = node('header');
    heading.append(node('h3', '', name), node('b', '', `×${amount}`));
    card.append(heading, node('p', '', item.description));
    if (mode === 'ai' && ITEMS[name]?.slot) card.append(aiEquipmentAction(item));
    grid.append(card);
  }
  if (!grid.childElementCount) grid.append(panelCard('背包为空', ['有些因果无法装进储物袋。']));
  dom.panelContent.append(grid);
}

function renderLocalMapPanel() {
  const grid = node('div', 'map-grid');
  const actions = getLocalPanelActions(state, 'travel');
  for (const [name, location] of Object.entries(LOCATIONS)) {
    const unlocked = state.story.act >= location.act && state.player.realm >= location.realm;
    const card = node('section', `map-card${unlocked ? '' : ' locked'}`);
    card.append(node('h3', '', `${location.icon} ${name}${name === state.story.location ? ' · 当前' : ''}`));
    card.append(node('p', '', unlocked ? location.description : `需要第 ${location.act} 幕、${REALMS[location.realm].name}`));
    const action = actions.find((candidate) => candidate.id === `travel:${name}`);
    if (action) card.append(actionButton(action));
    grid.append(card);
  }
  dom.panelContent.append(grid);
}

function renderMapPanel() {
  if (state.mode === 'local') return renderLocalMapPanel();
  const grid = node('div', 'map-grid');
  for (const location of buildMapView(state)) {
    const card = node('section', 'map-card');
    card.append(node('h3', '', `${location.icon} ${location.name}${location.current ? ' · 当前' : ''}`));
    card.append(node('p', '', location.description));
    grid.append(card);
  }
  dom.panelContent.append(grid);
}

function renderLocalCodexPanel() {
  const grid = node('div', 'codex-grid');
  grid.append(panelCard('人物', state.codex.characters.length ? state.codex.characters.map((name) => `${name} · ${NPCS[name]?.role || '旅途相逢'}`) : ['尚未结识']));
  grid.append(panelCard('地点', state.codex.locations.length ? state.codex.locations : ['尚未踏足']));
  grid.append(panelCard('物品', state.codex.items.length ? state.codex.items : ['尚无记录']));
  grid.append(panelCard('成就', state.achievements.unlocked.length
    ? state.achievements.unlocked.map((id) => ACHIEVEMENTS[id]?.title || id)
    : [`0/${Object.keys(ACHIEVEMENTS).length} · 尚待落笔`]));
  grid.append(panelCard('结局', state.endings.unlocked.length
    ? state.endings.unlocked.map((id) => ENDINGS[id]?.title || id)
    : ['五种结局仍藏在命数之后']), 'wide');
  dom.panelContent.append(grid);
}

function renderCodexPanel() {
  if (state.mode === 'local') return renderLocalCodexPanel();
  const view = buildCodexView(state);
  const grid = node('div', 'codex-grid');
  const sections = [
    ['人物', view.characters.length ? view.characters.map((entry) => `${entry.name} · ${entry.role}`) : ['尚未结识可辨认人物。']],
    ['地点', view.locations.length ? view.locations.map((entry) => entry.name) : ['尚未踏足可辨认地点。']],
    ['物品', view.items.length ? view.items.map((entry) => `${entry.name} · ${entry.description}`) : ['尚无已知物品。']],
    ['成就', view.achievements.length ? view.achievements.map((entry) => `${entry.title} · ${entry.description}`) : ['尚无已记录成就。']],
    ['结局', view.endings.length ? view.endings.map((entry) => `${entry.title} · ${entry.description}`) : ['尚无已知结局。']]
  ];
  for (const [title, lines] of sections) grid.append(panelCard(title, lines));
  dom.panelContent.append(grid);
}

async function renderLocalHistoryPanel() {
  const marker = node('p', 'modal-note', '正在翻阅完整命簿……');
  dom.panelContent.append(marker);
  const turns = await transcriptStore.allTurns(state.journeyId);
  marker.remove();
  const shown = turns.slice(-historyVisible);
  if (!shown.length) return dom.panelContent.append(panelCard('尚无记录', ['成功的回合才会写进这里。失败的 AI 请求不会留下半句。']));
  if (turns.length > historyVisible) {
    const more = node('button', 'secondary-button small', `加载更早记录（尚有 ${turns.length - historyVisible} 回合）`);
    more.addEventListener('click', () => { historyVisible += 30; renderPanel('history'); });
    dom.panelContent.append(more);
  }
  for (const turn of shown) {
    const card = node('section', 'panel-card wide');
    card.append(node('h3', '', `${turn.kind === 'system' ? '时停问答' : '世界回合'} · ${turn.provider || '本地'}`));
    if (turn.userText) card.append(node('p', '', `你：${turn.userText}`));
    for (const block of turn.blocks || []) card.append(node('p', '', `${block.name ? `${block.name}：` : ''}${block.text}`));
    dom.panelContent.append(card);
  }
}

async function renderHistoryPanel() {
  if (state.mode === 'local') return renderLocalHistoryPanel();
  const marker = node('p', 'modal-note', '正在翻阅完整命簿……');
  dom.panelContent.append(marker);
  const turns = await transcriptStore.allTurns(state.journeyId);
  marker.remove();
  const shown = turns.slice(-historyVisible);
  const history = buildHistoryView(state);
  if (!shown.length && !history.summaries.length && !history.facts.length) return dom.panelContent.append(panelCard('尚无记录', ['成功的回合才会写进这里。失败的 AI 请求不会留下半句。']));
  if (history.summaries.length || history.facts.length) {
    const traces = node('section', 'panel-card history-traces');
    traces.append(node('h3', '', '已知脉络'));
    for (const line of [...history.summaries, ...history.facts]) traces.append(node('p', '', String(line)));
    dom.panelContent.append(traces);
  }
  if (turns.length > historyVisible) {
    const more = node('button', 'secondary-button small', `加载更早记录（尚有 ${turns.length - historyVisible} 回合）`);
    more.addEventListener('click', () => { historyVisible += 30; renderPanel('history'); });
    dom.panelContent.append(more);
  }
  for (const turn of shown) {
    const card = node('section', 'panel-card wide');
    card.append(node('h3', '', `${turn.kind === 'system' ? '时停问答' : '世界回合'} · ${turn.provider || 'AI'}`));
    if (turn.userText) card.append(node('p', '', `你：${turn.userText}`));
    for (const block of turn.blocks || []) card.append(node('p', '', `${block.name ? `${block.name}：` : ''}${block.text}`));
    dom.panelContent.append(card);
  }
}

async function renderPanel(tab = activePanel) {
  activePanel = tab;
  dom.panelContent.replaceChildren();
  for (const button of dom.panelTabs.querySelectorAll('button')) button.classList.toggle('active', button.dataset.tab === tab);
  const titles = { character: '人物', quests: '任务', inventory: '背包', map: '地图', codex: '图鉴', history: '完整历史' };
  dom.panelTitle.textContent = titles[tab] || '命簿';
  if (tab === 'character') renderCharacterPanel();
  else if (tab === 'quests') renderQuestPanel();
  else if (tab === 'inventory') renderInventoryPanel();
  else if (tab === 'map') renderMapPanel();
  else if (tab === 'codex') renderCodexPanel();
  else await renderHistoryPanel();
}

async function openPanel(tab) {
  if (!state) return;
  if (tab === 'history' && activePanel !== 'history') historyVisible = 30;
  dom.panelLayer.hidden = false;
  updatePauseBadge();
  await renderPanel(tab);
}

function renderSaveDialog() {
  dom.saveModeNote.textContent = `当前只显示并操作「${mode === 'ai' ? 'AI 版' : '本地版'}」存档，另一版本不会被覆盖。`;
  dom.saveSlots.replaceChildren();
  for (let number = 1; number <= 3; number += 1) {
    const slot = `slot${number}`;
    const meta = storage.getSlotMeta(mode, slot);
    const card = node('section', 'save-slot');
    const header = node('header');
    header.append(node('h3', '', `命簿 ${number}`), node('span', '', meta ? (meta.mode === 'ai' ? 'AI 版' : '本地版') : '空白'));
    card.append(header, node('p', '', meta
      ? `${meta.name} · ${REALMS[meta.realm]?.name || '凡人'} · 第${meta.act}幕 · ${meta.location} · 第${meta.day}日\n${new Date(meta.savedAt).toLocaleString()}`
      : '这一页尚未落笔。'));
    const actions = node('div', 'slot-actions');
    const save = node('button', '', meta ? '覆盖保存' : '保存');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await storage.saveJourneySlot(mode, slot, state, transcriptStore);
        renderSaveDialog();
        showToast(`已保存到命簿 ${number}`);
      } catch (error) {
        save.disabled = false;
        showToast(`保存失败：${error.message}`);
      }
    });
    actions.append(save);
    if (meta) {
      const load = node('button', '', '读取');
      load.addEventListener('click', async () => {
        try {
          const loaded = storage.activateSlotAsAuto(mode, slot);
          closeAllLayers();
          await enterGame(loaded, { skipOpening: true });
        } catch (error) { showToast(`读取失败：${error.message}`); }
      });
      const remove = node('button', 'danger', '删除');
      remove.addEventListener('click', async () => {
        if (globalThis.confirm?.(`删除命簿 ${number}？自动存档不会删除。`)) {
          try {
            await storage.deleteJourneySlot(mode, slot, transcriptStore);
            renderSaveDialog();
          } catch (error) { showToast(`删除失败：${error.message}`); }
        }
      });
      actions.append(load, remove);
    }
    card.append(actions);
    dom.saveSlots.append(card);
  }
}

function openSaveDialog() {
  if (!state) return;
  renderSaveDialog();
  dom.saveLayer.hidden = false;
  updatePauseBadge();
}

function populateProviderSelect(select, selected) {
  select.replaceChildren();
  const recommended = node('optgroup');
  recommended.label = '推荐';
  const advanced = node('optgroup');
  advanced.label = '高级 / 测试';
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const option = node('option', '', provider.label);
    option.value = id;
    option.selected = id === selected;
    if (provider.recommended) recommended.append(option);
    else advanced.append(option);
  }
  select.append(recommended, advanced);
}

function syncAiFields(resetModel = false) {
  const id = dom.providerSelect.value;
  const provider = PROVIDERS[id];
  const none = provider.credentialMode === 'none';
  const siteCapable = ['groq', 'mistral', 'gemini'].includes(id);
  if (!siteCapable && !none) dom.credentialSelect.value = 'personal';
  dom.credentialSelect.querySelector('option[value="site"]').disabled = !siteCapable;
  dom.credentialField.hidden = none;
  dom.keyField.hidden = none || dom.credentialSelect.value !== 'personal';
  dom.baseField.hidden = id !== 'custom';
  if (resetModel) dom.modelInput.value = provider.model;
  dom.modelOptions.replaceChildren(...modelsForProvider(id).map((model) => {
    const option = document.createElement('option');
    option.value = model;
    return option;
  }));
  const siteMode = siteCapable && dom.credentialSelect.value === 'site';
  dom.modelInput.disabled = false;
  dom.modelInput.title = siteMode
    ? `网站模式可切换允许的模型：${(provider.models || [provider.model]).join('、')}`
    : '';
  dom.baseUrlInput.value = provider.baseUrl || '';
  dom.providerTip.textContent = `${provider.tip}${siteMode ? ' 网站模式可切换允许的模型，默认值由部署配置决定。' : ''}`;
}

function openAiDialog() {
  populateProviderSelect(dom.providerSelect, aiSettings.provider);
  dom.credentialSelect.value = aiSettings.credentialMode;
  dom.apiKeyInput.value = runtimeKey;
  dom.modelInput.value = aiSettings.model || PROVIDERS[aiSettings.provider]?.model || '';
  populateProviderSelect(dom.trialProviderA, 'groq');
  populateProviderSelect(dom.trialProviderB, 'mistral');
  dom.connectionStatus.textContent = '';
  syncAiFields();
  dom.aiLayer.hidden = false;
  updatePauseBadge();
}

function collectAiSettings() {
  return {
    provider: dom.providerSelect.value,
    credentialMode: dom.credentialSelect.value,
    key: dom.apiKeyInput.value.trim(),
    baseUrl: dom.baseUrlInput.value.trim(),
    model: dom.modelInput.value.trim()
  };
}

function saveAiSettings() {
  const collected = collectAiSettings();
  const siteModels = collected.credentialMode === 'site' ? modelsForProvider(collected.provider) : [];
  if (siteModels.length && !siteModels.includes(collected.model)) {
    dom.connectionStatus.textContent = '这个模型不在网站允许列表中，请从模型建议中选择。';
    return;
  }
  runtimeKey = collected.key;
  aiSettings = aiClient.saveSettings(collected);
  renderTopbar();
  dom.connectionStatus.textContent = '已保存。下一次 AI 请求立即使用这个提供商；当前旅程与记忆保持不变。';
  showToast('AI 模型已切换');
}

async function testAiConnection() {
  dom.connectionStatus.textContent = '正在消耗 1 次请求测试连接……';
  dom.testAiButton.disabled = true;
  try {
    const result = await aiClient.testConnection(collectAiSettings());
    dom.connectionStatus.textContent = result.message;
  } catch (error) {
    dom.connectionStatus.textContent = `连接失败：${error.message}`;
  } finally {
    dom.testAiButton.disabled = false;
  }
}

function settingsForTrial(providerId) {
  const provider = PROVIDERS[providerId];
  const same = providerId === dom.providerSelect.value;
  return {
    provider: providerId,
    credentialMode: provider.credentialMode === 'none' ? 'none' : ['groq', 'mistral', 'gemini'].includes(providerId) ? 'site' : 'personal',
    key: same ? dom.apiKeyInput.value.trim() : '',
    model: same ? dom.modelInput.value.trim() : provider.model,
    baseUrl: provider.baseUrl || ''
  };
}

function renderTrialResult(providerId, result) {
  const card = node('article', 'trial-result');
  card.append(node('h4', '', PROVIDERS[providerId]?.label || providerId));
  const badges = node('div', 'trial-badges');
  for (const [label, passed] of [['JSON', result.parsePassed], ['推进', result.progressPassed]]) {
    badges.append(node('span', passed ? '' : 'bad', `${label} ${passed ? '通过' : '失败'}`));
  }
  badges.append(node('span', '', `${result.latencyMs}ms`), node('span', result.repetitionScore > .35 ? 'bad' : '', `重复 ${result.repetitionScore}`));
  const output = node('pre');
  output.textContent = result.output || result.error || '没有输出';
  const score = node('label', 'fun-score');
  score.append(document.createTextNode('好玩度 1'));
  const input = document.createElement('input');
  input.type = 'range'; input.min = '1'; input.max = '5'; input.value = '3';
  score.append(input, document.createTextNode('5'));
  card.append(badges, output, score);
  return card;
}

async function runTrials() {
  const first = dom.trialProviderA.value;
  const second = dom.trialProviderB.value;
  dom.trialResults.replaceChildren(node('p', 'modal-note', '两个模型正在独立答题，各消耗 1 次请求……'));
  dom.runTrialButton.disabled = true;
  const [a, b] = await Promise.all([
    aiRunner.runTrial({ settings: settingsForTrial(first), trial: dom.trialPrompt.value }),
    aiRunner.runTrial({ settings: settingsForTrial(second), trial: dom.trialPrompt.value })
  ]);
  dom.runTrialButton.disabled = false;
  dom.trialResults.replaceChildren(renderTrialResult(first, a), renderTrialResult(second, b));
}

function resizeComposer() {
  dom.playerInput.style.height = '48px';
  dom.playerInput.style.height = `${Math.min(128, Math.max(48, dom.playerInput.scrollHeight))}px`;
}

async function importLegacy(targetMode) {
  try {
    const imported = storage.importLegacy(targetMode);
    await transcriptStore.appendTurn(imported.journeyId, {
      id: 'legacy-import', kind: 'system',
      blocks: [{ type: 'sys', text: `旧版旅程已复制到${targetMode === 'ai' ? ' AI 版' : '本地版'}；旧存档仍安全保留。` }],
      createdAt: new Date().toISOString()
    });
    await enterGame(imported, { skipOpening: true });
  } catch (error) {
    showToast(error.message);
  }
}

dom.newLocalButton.addEventListener('click', () => startNew('local'));
dom.newAiButton.addEventListener('click', () => startNew('ai'));
dom.continueLocalButton.addEventListener('click', () => continueMode('local'));
dom.continueAiButton.addEventListener('click', () => continueMode('ai'));
dom.titleAiSettingsButton.addEventListener('click', openAiDialog);
dom.legacyLocalButton.addEventListener('click', () => importLegacy('local'));
dom.legacyAiButton.addEventListener('click', () => importLegacy('ai'));
dom.titleButton.addEventListener('click', renderTitle);
dom.worldChannel.addEventListener('click', () => { channel = 'world'; updateChannelUi(); dom.playerInput.focus(); });
dom.systemChannel.addEventListener('click', () => { channel = 'system'; updateChannelUi(); dom.playerInput.focus(); });
dom.aiInputForm.addEventListener('submit', submitAiInput);
dom.playerInput.addEventListener('input', resizeComposer);
dom.retryButton.addEventListener('click', () => {
  if (!retryContext) return;
  if (retryContext.type === 'opening') runAiOpening(retryContext.transactionId);
  else if (retryContext.type === 'world') runAiWorld(retryContext.input, retryContext.transactionId);
  else runAiSystem(retryContext.input);
});
dom.switchProviderButton.addEventListener('click', openAiDialog);
dom.editRetryButton.addEventListener('click', () => { dom.retryPanel.hidden = true; dom.playerInput.value = retryContext?.input || dom.playerInput.value; resizeComposer(); dom.playerInput.focus(); });
dom.retryTitleButton.addEventListener('click', renderTitle);
dom.saveButton.addEventListener('click', openSaveDialog);
dom.aiButton.addEventListener('click', openAiDialog);
dom.providerSelect.addEventListener('change', () => { syncAiFields(true); });
dom.credentialSelect.addEventListener('change', () => syncAiFields());
dom.saveAiButton.addEventListener('click', saveAiSettings);
dom.testAiButton.addEventListener('click', testAiConnection);
dom.clearCredentialButton.addEventListener('click', () => {
  runtimeKey = '';
  dom.apiKeyInput.value = '';
  localStorage.removeItem('luoying_ai_v3');
  aiSettings = aiClient.loadSettings();
  dom.connectionStatus.textContent = '游戏 AI 设置与本页个人 Key 已清除；Chronos 登录状态未改变。';
});
dom.runTrialButton.addEventListener('click', runTrials);
dom.newGamePlusButton.addEventListener('click', renderTitle);

for (const button of document.querySelectorAll('[data-open-panel]')) button.addEventListener('click', () => openPanel(button.dataset.openPanel));
for (const button of dom.panelTabs.querySelectorAll('[data-tab]')) button.addEventListener('click', () => renderPanel(button.dataset.tab));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => {
  const layer = button.dataset.close === 'panel' ? dom.panelLayer : button.dataset.close === 'save' ? dom.saveLayer : dom.aiLayer;
  layer.hidden = true;
  updatePauseBadge();
});
for (const layer of [dom.panelLayer, dom.saveLayer, dom.aiLayer]) layer.addEventListener('click', (event) => {
  if (event.target === layer) { layer.hidden = true; updatePauseBadge(); }
});

dom.exportButton.addEventListener('click', async () => {
  try {
    const blob = await storage.exportJourney(mode, state, transcriptStore);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `落樱仙途-${mode}-${state.player.name}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { showToast(error.message); }
});
dom.importButton.addEventListener('click', () => dom.importInput.click());
dom.importInput.addEventListener('change', async () => {
  const file = dom.importInput.files?.[0];
  if (!file) return;
  try {
    const imported = await storage.importJourney(mode, file, transcriptStore);
    closeAllLayers();
    await enterGame(imported, { skipOpening: true });
    showToast('旅程与完整文字记录已导入');
  } catch (error) { showToast(error.message); }
  finally { dom.importInput.value = ''; }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllLayers();
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && mode === 'ai' && !dom.game.hidden) dom.aiInputForm.requestSubmit();
});

spawnPetals();
renderTitle();

import { derivedPlayerStats } from './equipment.js';
import { generationOptions, throwIfCancelled } from './ai-policy.js';

const SETTINGS_KEY = 'luoying_ai_v3';
const SESSION_KEY = 'chronos-session-token-v1';

export const PROVIDERS = {
  groq: {
    label: 'Groq · GPT-OSS', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1',
    credentialMode: 'site', recommended: true, tip: '高速长文本叙事；可用 Chronos 网站额度或自己的 Groq Key。',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b']
  },
  mistral: {
    label: 'Mistral', model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1',
    credentialMode: 'site', recommended: true, tip: '稳定、节奏明快；可用网站额度或自己的 Mistral Key。'
  },
  gemini: {
    label: 'Google Gemini', model: 'gemini-3.6-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', credentialMode: 'site', advanced: true,
    tip: '稳定长上下文叙事；支持网站额度或个人 Google AI Studio Key。',
    models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
  },
  siliconflow: {
    label: 'SiliconFlow · Qwen', model: 'Qwen/Qwen2.5-7B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1',
    credentialMode: 'personal', advanced: true, tip: 'Qwen 高级测试入口，需要个人 API Key。'
  },
  openrouter: {
    label: 'OpenRouter', model: '', baseUrl: 'https://openrouter.ai/api/v1', credentialMode: 'personal', advanced: true,
    tip: '可填写 OpenRouter 上的任意可用模型，需要个人 API Key。'
  },
  custom: { label: '自定义接口', model: '', baseUrl: '', credentialMode: 'personal', advanced: true, tip: 'OpenAI Chat Completions 兼容接口。' }
};

export function modelsForProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return [];
  return [...(provider.models || (provider.model ? [provider.model] : []))];
}

const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const allowedRole = (role) => ['system', 'user', 'assistant'].includes(role) ? role : 'user';

function findJsonObject(text) {
  const source = String(text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = source.indexOf('{');
  if (start < 0) throw new Error('AI 没有返回 JSON 对象。');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('AI 返回的 JSON 不完整。');
}

function parseBlocks(data, requestType) {
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('AI 返回的 JSON 缺少内容段落。');
  const blocks = data.blocks.slice(0, 8).map((block) => {
    const requestedType = ['narr', 'dlg', 'sys'].includes(block?.type) ? block.type : 'narr';
    if (requestType === 'system' && requestedType !== 'sys') return null;
    const output = { type: requestedType, text: cleanText(block?.text, 12_000) };
    if (requestedType === 'dlg') {
      output.name = cleanText(block?.name || '神秘人', 40);
      if (Array.isArray(block?.factIds)) output.factIds = block.factIds.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 20);
    }
    return output.text ? output : null;
  }).filter(Boolean);
  if (!blocks.length) throw new Error(requestType === 'system' ? 'AI 没有返回系统答复。' : 'AI 返回的剧情内容为空。');
  return blocks;
}

function normalizeProgress(progress) {
  const source = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  const stringList = (value, max = 20) => Array.isArray(value)
    ? value.map((entry) => cleanText(entry, 160)).filter(Boolean).slice(0, max)
    : [];
  const clocks = {};
  if (source.dangerClocks && typeof source.dangerClocks === 'object' && !Array.isArray(source.dangerClocks)) {
    for (const [id, delta] of Object.entries(source.dangerClocks).slice(0, 20)) {
      if (Number.isFinite(Number(delta))) clocks[cleanText(id, 80)] = Number(delta);
    }
  }
  return {
    advanced: stringList(source.advanced), consequences: stringList(source.consequences),
    openLoops: stringList(source.openLoops), resolvedLoops: stringList(source.resolvedLoops), dangerClocks: clocks
  };
}

function normalizeMemory(memory) {
  const source = memory && typeof memory === 'object' && !Array.isArray(memory) ? memory : {};
  const facts = Array.isArray(source.facts) ? source.facts.slice(0, 40).map((fact) => ({
    subjectId: cleanText(fact?.subjectId, 80) === 'world' ? 'world:observation' : cleanText(fact?.subjectId, 80), predicate: cleanText(fact?.predicate, 48),
    object: cleanText(fact?.object, 160), confidence: Number(fact?.confidence ?? 1)
  })).filter((fact) => fact.subjectId && fact.predicate && fact.object) : [];
  const entities = Array.isArray(source.entities) ? source.entities.slice(0, 20).map((entity) => ({
    id: cleanText(entity?.id, 80), kind: cleanText(entity?.kind, 20), name: cleanText(entity?.name, 40),
    location: cleanText(entity?.location, 80), purpose: cleanText(entity?.purpose, 160),
    traits: Array.isArray(entity?.traits) ? entity.traits.map((trait) => cleanText(trait, 32)).filter(Boolean).slice(0, 4) : []
  })).filter((entity) => entity.id && entity.name) : [];
  const chapterSummary = cleanText(source.chapterSummary, 1200);
  return { facts, entities, ...(chapterSummary ? { chapterSummary } : {}) };
}

function normalizeEffects(effects) {
  const source = effects && typeof effects === 'object' && !Array.isArray(effects) ? effects : {};
  const output = {};
  for (const key of ['hp', 'qi', 'spirit', 'gold']) if (source[key] !== undefined) output[key] = Number(source[key]);
  if (typeof source.location === 'string') output.location = cleanText(source.location, 80);
  for (const key of ['addItems', 'relationships', 'questProgress']) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = Object.fromEntries(Object.entries(source[key]).slice(0, 30)
        .map(([id, value]) => [cleanText(id, 80), Number(value)]));
    }
  }
  for (const key of ['addQuests', 'completeQuests', 'failQuests']) {
    if (Array.isArray(source[key])) output[key] = source[key].map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 30);
  }
  return output;
}

export function parseNarration(text, requestType = 'world') {
  const json = findJsonObject(text).replace(/,(\s*[}\]])/g, '$1');
  let data;
  try { data = JSON.parse(json); }
  catch (error) { throw new Error(`AI 返回的 JSON 无法解析：${error.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI 返回内容不是对象。');
  const blocks = parseBlocks(data, requestType);
  if (requestType === 'system') return { blocks };
  const usedFactIdsByActor = {};
  if (data.usedFactIdsByActor && typeof data.usedFactIdsByActor === 'object' && !Array.isArray(data.usedFactIdsByActor)) {
    for (const [actorId, ids] of Object.entries(data.usedFactIdsByActor).slice(0, 16)) {
      if (Array.isArray(ids)) usedFactIdsByActor[cleanText(actorId, 80)] = ids.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 30);
    }
  }
  return {
    blocks,
    effects: normalizeEffects(data.effects),
    progress: normalizeProgress(data.progress),
    memory: normalizeMemory(data.memory),
    timeCost: ['instant', 'brief', 'scene', 'long'].includes(data.timeCost) ? data.timeCost : 'brief',
    usedFactIdsByActor,
    entities: normalizeMemory(data.memory).entities
  };
}

export function buildNarrationPrompt(state, history, input) {
  const derived = derivedPlayerStats(state);
  const snapshot = {
    name: state.player.name,
    realm: state.player.realm,
    hp: `${state.player.hp}/${state.player.maxHp}`,
    qi: `${state.player.qi}`,
    spirit: `${state.player.spirit}/${derived.maxSpirit}`,
    stats: derived,
    gold: state.player.gold,
    act: state.story.act,
    scene: state.story.scene,
    day: state.story.day,
    period: state.story.period,
    location: state.story.location,
    inventory: Object.entries(state.inventory?.items || {}).filter(([, amount]) => amount > 0).slice(0, 20),
    equipment: state.equipment,
    techniques: state.techniques.known.slice(0, 12),
    quests: state.quests.active.slice(0, 8).map((quest) => ({ id: quest.id, progress: quest.progress, target: quest.target })),
    relationships: state.relationships,
    karma: state.karma,
    memory: { chapterSummaries: state.memory.chapterSummaries, facts: state.memory.facts.slice(-12) }
  };
  const recent = (history || []).slice(-10).map((entry) => ({
    type: ['narr', 'dlg', 'sys', 'player'].includes(entry?.type) ? entry.type : undefined,
    kind: entry?.kind,
    name: cleanText(entry?.name, 40) || undefined,
    text: cleanText(entry?.text, 600) || undefined,
    blocks: Array.isArray(entry?.blocks) ? entry.blocks.slice(0, 8) : undefined
  }));
  return [
    {
      role: 'system',
      content: `你是中文修仙文字游戏《落樱仙途》的纯 AI 叙事引擎。所有 narr 旁白必须以主角第一人称“我”书写，只写我能亲历、感知或合理推断的内容；不得用“你、主角、玩家”称呼主角，不得切到他人内心或场外全知视角。不得调用或模仿本地预写剧情，不得替玩家决定关键行动、对白、承诺或感受。世界回合用具体过程展现行动、环境或人物反应、明确后果与新进展，不得用摘要带过。每个世界回合必须带来可验证的新信息、状态变化、危险变化或目标推进。灵气只用于突破，灵力只用于施展功法。NPC 对白独立放在 dlg，可在对白中用“你”称呼我。只输出严格 JSON。当前状态：${JSON.stringify(snapshot)}`
    },
    {
      role: 'user',
      content: `最近记录：${JSON.stringify(recent)}\n玩家原话：“${cleanText(input, 2_000)}”\n输出 blocks、effects、progress、memory、timeCost。`
    }
  ];
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('AI 请求缺少剧情消息。');
  const normalized = messages.slice(-16).map((message) => ({
    role: allowedRole(message?.role),
    content: cleanText(message?.content, 5_800)
  })).filter((message) => message.content);
  if (!normalized.length) throw new Error('AI 请求缺少有效消息。');
  return normalized;
}

function normalizeSettings(input = {}) {
  const provider = PROVIDERS[input.provider] ? input.provider : 'groq';
  const defaults = PROVIDERS[provider];
  const siteCapable = ['groq', 'mistral', 'gemini'].includes(provider);
  const credentialMode = defaults.credentialMode === 'none'
    ? 'none'
    : siteCapable && input.credentialMode !== 'personal'
      ? 'site'
      : 'personal';
  const baseUrl = provider === 'custom' ? cleanText(input.baseUrl, 300).replace(/\/+$/, '') : defaults.baseUrl || '';
  return {
    provider,
    credentialMode,
    key: cleanText(input.key, 500),
    baseUrl,
    model: cleanText(input.model || defaults.model, 140)
  };
}

function extractOpenAi(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型返回为空。');
  return text;
}

function extractGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part) => part?.text || '').join('') : '';
  if (!text.trim()) throw new Error(data?.promptFeedback?.blockReason ? `Gemini 拒绝了请求：${data.promptFeedback.blockReason}` : 'Gemini 返回为空。');
  return text;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryWaitMs(response, data, fallback) {
  const headerSeconds = Number(response?.headers?.get?.('retry-after'));
  const message = String(data?.error?.message || data?.error || '');
  const messageSeconds = Number(message.match(/try again in\s+([\d.]+)s/i)?.[1]);
  const seconds = Number.isFinite(headerSeconds) && headerSeconds > 0 ? headerSeconds : messageSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.max(250, Math.min(30_000, Math.ceil(seconds * 1_000)));
}

async function requestJson(fetchImpl, url, options, attempts = 2, sleep = delay) {
  const parentSignal = options.signal;
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 28_000);
  try {
  throwIfCancelled(parentSignal);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const data = await response.json();
      throwIfCancelled(parentSignal);
      if (response.ok) return data;
      const message = data?.error?.message || data?.error || `HTTP ${response.status}`;
      if (response.status === 429) {
        const seconds = Math.ceil((data.retryAfterMs || retryWaitMs(response, data, 10_000)) / 1000);
        throw new Error(`当前模型额度繁忙，约 ${seconds} 秒后再试，或切换模型。`);
      }
      if (![502, 503].includes(response.status) || attempt === attempts - 1) throw new Error(String(message));
      const waitMs = retryWaitMs(response, data, 500);
      if (waitMs > 1500) throw new Error(String(message));
      await sleep(waitMs);
      throwIfCancelled(parentSignal);
      if (controller.signal.aborted) throw new Error('AI 请求超时，请重试或切换模型。');
  }
  } catch (error) {
    throwIfCancelled(parentSignal);
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error('AI 请求超时，请重试或切换模型。');
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

export function createAiClient({ fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage, sleep = delay } = {}) {
  if (!fetchImpl) throw new Error('当前环境不支持网络请求。');
  const client = {
    loadSettings() {
      try { return normalizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}')); }
      catch { return normalizeSettings(); }
    },
    saveSettings(settingsInput) {
      const clean = normalizeSettings(settingsInput);
      const { key: _key, ...safeToPersist } = clean;
      storage?.setItem(SETTINGS_KEY, JSON.stringify(safeToPersist));
      return clean;
    },
    async narrate(settingsInput, context = {}) {
      const settings = normalizeSettings(settingsInput);
      const messages = normalizeMessages(context.messages);
      const requestType = cleanText(context.requestType || 'world', 20);
      const transactionId = cleanText(context.transactionId, 100);

      if (settings.credentialMode === 'site' && ['gemini', 'groq', 'mistral'].includes(settings.provider)) {
        const token = storage?.getItem(SESSION_KEY) || '';
        if (!token) throw new Error('请先登录 Chronos 再使用网站 AI。');
        const data = await requestJson(fetchImpl, '/api/game/ai', {
          signal: context.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provider: settings.provider, model: settings.model, messages, requestType, transactionId })
        }, 1, sleep);
        if (typeof data?.text !== 'string' || !data.text.trim()) throw new Error('网站 AI 返回为空。');
        return data.text;
      }

      if (!settings.key) throw new Error('请填写 API Key。');
      if (settings.provider === 'gemini') {
        const model = encodeURIComponent(settings.model || PROVIDERS.gemini.model);
        const systemText = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
        const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        }));
        const data = await requestJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          signal: context.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, generationConfig: generationOptions('gemini', settings.model, requestType) })
        }, 2, sleep);
        return extractGemini(data);
      }

      if (!/^https?:\/\//i.test(settings.baseUrl)) throw new Error('Base URL 必须是 http 或 https 地址。');
      if (!settings.model) throw new Error('请填写模型名称。');
      const data = await requestJson(fetchImpl, `${settings.baseUrl}/chat/completions`, {
        signal: context.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
        body: JSON.stringify({
          model: settings.model, messages, ...generationOptions(settings.provider, settings.model, requestType)
        })
      }, 2, sleep);
      return extractOpenAi(data);
    },
    async testConnection(settings) {
      await client.narrate(settings, {
        requestType: 'trial', transactionId: `connection-${Date.now()}`,
        messages: [{ role: 'user', content: '只回复一个严格 JSON：{"blocks":[{"type":"sys","text":"连接成功"}]}' }]
      });
      return { ok: true, message: `${PROVIDERS[settings.provider]?.label || 'AI'} 连接成功。` };
    }
  };
  return client;
}

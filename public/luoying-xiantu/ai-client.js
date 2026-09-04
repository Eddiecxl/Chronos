const SETTINGS_KEY = 'luoying_ai_v2';
const SESSION_KEY = 'chronos-session-token-v1';

export const PROVIDERS = {
  local: { label: '本地命运线', model: '', credentialMode: 'none', tip: '完全离线，主线、战斗、任务与结局都可正常游玩。' },
  puter: { label: 'Puter.js', model: 'gpt-4o-mini', credentialMode: 'none', tip: '免 Key；首次使用会载入 Puter 并可能要求登录。' },
  gemini: { label: 'Google Gemini', model: 'gemini-3.5-flash', credentialMode: 'site', tip: '可使用网站提供的 Key，也可使用自己的 Google AI Studio Key。' },
  siliconflow: { label: 'SiliconFlow', model: 'Qwen/Qwen2.5-7B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1', credentialMode: 'personal', tip: '适合国内网络；需要自己的 API Key。' },
  openrouter: { label: 'OpenRouter', model: '', baseUrl: 'https://openrouter.ai/api/v1', credentialMode: 'personal', tip: '可填写任意可用模型；需要自己的 API Key。' },
  groq: { label: 'Groq', model: 'qwen/qwen3.6-27b', baseUrl: 'https://api.groq.com/openai/v1', credentialMode: 'site', tip: '速度极快；可使用网站 Key 或自己的 Groq Key。' },
  custom: { label: '自定义接口', model: '', baseUrl: '', credentialMode: 'personal', tip: '支持 OpenAI Chat Completions 兼容接口。' }
};

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

export function parseNarration(text) {
  const json = findJsonObject(text).replace(/,(\s*[}\]])/g, '$1');
  let data;
  try { data = JSON.parse(json); }
  catch (error) { throw new Error(`AI 返回的 JSON 无法解析：${error.message}`); }
  if (!data || !Array.isArray(data.blocks) || !data.blocks.length) throw new Error('AI 返回的 JSON 缺少剧情段落。');
  const blocks = data.blocks.slice(0, 8).map((block) => {
    const type = ['narr', 'dlg', 'sys'].includes(block?.type) ? block.type : 'narr';
    const output = { type, text: cleanText(block?.text, 1200) };
    if (type === 'dlg') output.name = cleanText(block?.name || '神秘人', 16);
    return output;
  }).filter((block) => block.text);
  if (!blocks.length) throw new Error('AI 返回的剧情内容为空。');
  const suggestions = Array.isArray(data.suggestions)
    ? data.suggestions.slice(0, 6).map((entry) => typeof entry === 'string'
      ? { label: cleanText(entry, 24), value: cleanText(entry, 100), icon: '❀' }
      : { label: cleanText(entry?.label, 24), value: cleanText(entry?.value || entry?.label, 100), icon: cleanText(entry?.icon || '❀', 4) }
    ).filter((entry) => entry.label && entry.value)
    : [];
  return { blocks, effects: data.effects && typeof data.effects === 'object' ? data.effects : {}, suggestions };
}

export function buildNarrationPrompt(state, history, input) {
  const inventory = Object.entries(state.inventory?.items || {}).filter(([, amount]) => amount > 0).slice(0, 20);
  const snapshot = {
    name: state.player.name,
    realm: state.player.realm,
    hp: `${state.player.hp}/${state.player.maxHp}`,
    exp: state.player.exp,
    gold: state.player.gold,
    act: state.story.act,
    scene: state.story.scene,
    day: state.story.day,
    location: state.story.location,
    inventory,
    equipment: state.equipment,
    techniques: state.techniques.known.slice(0, 12),
    quests: state.quests.active.slice(0, 8).map((quest) => ({ id: quest.id, progress: quest.progress, target: quest.target })),
    relationships: state.relationships,
    karma: state.karma,
    flags: Object.keys(state.story.flags).filter((key) => state.story.flags[key]).slice(-40),
    memory: { summary: state.memory.summary, facts: state.memory.facts.slice(0, 12) }
  };
  const recent = (history || []).slice(-16).map((block) => ({
    type: ['narr', 'dlg', 'sys', 'player'].includes(block.type) ? block.type : 'narr',
    name: cleanText(block.name, 16) || undefined,
    text: cleanText(block.text, 500)
  }));
  const system = `你是中文修仙文字游戏《落樱仙途》的叙事增强引擎。玩家就是主角“${state.player.name}”。\n` +
    '尊重玩家任意行动，角色要真实回应怪话、中英混杂、挑衅、告白和临时改变主意。文风生动、节奏明快，可有日常、幽默、感情、战斗与因果，但不得替玩家决定关键选择。\n' +
    '必须严格服从当前状态，不得凭空提升境界、制造巨额奖励或复活已死角色。每回合输出 2 至 5 个短段落，并留下可回应的悬念。\n' +
    '只输出一个严格 JSON 对象，不要代码围栏。格式：{"blocks":[{"type":"narr","text":"旁白"},{"type":"dlg","name":"姓名","text":"对白"},{"type":"sys","text":"提示"}],"effects":{"hp":0,"gold":0,"exp":0,"relationships":{"姓名":0},"addItems":{"物品":0},"location":"地点"},"suggestions":["行动一","行动二"]}。\n' +
    `当前状态：${JSON.stringify(snapshot)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: `最近剧情：${JSON.stringify(recent)}\n玩家现在说或做：“${cleanText(input, 240)}”\n继续剧情，只输出 JSON。` }
  ];
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('AI 请求缺少剧情消息。');
  return messages.slice(0, 12).map((message) => ({
    role: allowedRole(message?.role),
    content: cleanText(message?.content, 6000)
  })).filter((message) => message.content);
}

function normalizeSettings(input = {}) {
  const provider = PROVIDERS[input.provider] ? input.provider : 'local';
  const defaults = PROVIDERS[provider];
  const credentialMode = provider === 'gemini' || provider === 'groq'
    ? (input.credentialMode === 'personal' ? 'personal' : 'site')
    : defaults.credentialMode;
  return {
    provider,
    credentialMode,
    key: cleanText(input.key, 300),
    baseUrl: cleanText(input.baseUrl || defaults.baseUrl, 300).replace(/\/+$/, ''),
    model: cleanText(input.model || defaults.model, 100)
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

async function requestJson(fetchImpl, url, options, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const message = data?.error?.message || data?.error || `HTTP ${response.status}`;
      if (![429, 502, 503].includes(response.status) || attempt === attempts - 1) throw new Error(String(message));
      lastError = new Error(String(message));
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('AI 请求超时。');
      if (!lastError || attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timer);
    }
    await delay(attempt ? 2400 : 900);
  }
  throw lastError || new Error('AI 请求失败。');
}

async function defaultPuterLoader() {
  if (globalThis.puter) return globalThis.puter;
  if (typeof document === 'undefined') throw new Error('当前环境不能加载 Puter。');
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-luoying-puter]');
    if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.dataset.luoyingPuter = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Puter 脚本加载失败。'));
    document.head.append(script);
  });
  return globalThis.puter;
}

export function createAiClient({ fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage, puterLoader = defaultPuterLoader } = {}) {
  if (!fetchImpl) throw new Error('当前环境不支持网络请求。');

  const client = {
    loadSettings() {
      try { return normalizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}')); }
      catch { return normalizeSettings(); }
    },
    saveSettings(settings) {
      const clean = normalizeSettings(settings);
      storage?.setItem(SETTINGS_KEY, JSON.stringify(clean));
      return clean;
    },
    async narrate(settingsInput, context) {
      const settings = normalizeSettings(settingsInput);
      const messages = normalizeMessages(context?.messages);
      if (settings.provider === 'local') throw new Error('当前使用本地命运线。');

      if (settings.provider === 'puter') {
        const puter = await puterLoader();
        if (!puter?.ai?.chat) throw new Error('Puter AI 尚未就绪。');
        const result = await puter.ai.chat(messages, { model: settings.model || PROVIDERS.puter.model });
        const content = typeof result === 'string' ? result : result?.message?.content ?? result?.text ?? result?.content;
        if (Array.isArray(content)) return content.map((part) => part?.text || '').join('');
        if (typeof content !== 'string' || !content.trim()) throw new Error('Puter 返回为空。');
        return content;
      }

      if ((settings.provider === 'gemini' || settings.provider === 'groq') && settings.credentialMode === 'site') {
        const token = storage?.getItem(SESSION_KEY) || '';
        if (!token) throw new Error('请先登录 Chronos 再使用网站 AI。');
        const data = await requestJson(fetchImpl, '/api/game/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provider: settings.provider, model: settings.model, messages })
        });
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } })
        });
        return extractGemini(data);
      }

      if (!/^https?:\/\//i.test(settings.baseUrl)) throw new Error('Base URL 必须是 http 或 https 地址。');
      if (!settings.model) throw new Error('请填写模型名称。');
      const data = await requestJson(fetchImpl, `${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
        body: JSON.stringify({ model: settings.model, messages, temperature: 0.9, max_completion_tokens: 1200 })
      });
      return extractOpenAi(data);
    },
    async testConnection(settings) {
      if (settings.provider === 'local') return { ok: true, message: '本地命运线已经就绪。' };
      await client.narrate(settings, { messages: [{ role: 'user', content: '只回复一个严格 JSON：{"blocks":[{"type":"sys","text":"连接成功"}]}' }] });
      return { ok: true, message: `${PROVIDERS[settings.provider]?.label || 'AI'} 连接成功。` };
    }
  };
  return client;
}

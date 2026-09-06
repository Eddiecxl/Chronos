import { generationOptions } from '../public/luoying-xiantu/ai-policy.js';
import { aiHttpError, retryAfterMs } from '../public/luoying-xiantu/ai-errors.js';

const PROVIDER_CONFIG = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyName: 'OPENAI_API_KEY', modelName: 'OPENAI_MODEL', defaultModel: 'gpt-4.1-mini', protocol: 'openai',
    allowedModels: ['gpt-4.1-mini', 'gpt-5.4-mini', 'gpt-5.6-terra']
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyName: 'GROQ_API_KEY', modelName: 'GROQ_MODEL', defaultModel: 'openai/gpt-oss-120b', protocol: 'openai',
    allowedModels: [
      'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b',
      'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'
    ]
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    keyName: 'MISTRAL_API_KEY', modelName: 'MISTRAL_MODEL', defaultModel: 'mistral-small-latest', protocol: 'openai',
    allowedModels: ['mistral-small-latest']
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyName: 'GEMINI_API_KEY', modelName: 'GEMINI_MODEL', defaultModel: 'gemini-3.6-flash', protocol: 'gemini',
    allowedModels: [
      'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
      'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'
    ]
  }
};

const REQUEST_TYPES = new Set(['world', 'system', 'repair', 'trial']);
const TRANSIENT_STATUSES = new Set([502, 503]);
const ROLES = new Set(['system', 'user', 'assistant']);
const MINUTE_LIMIT = 12;
const DAY_LIMIT = 240;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GameAiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'GameAiError';
    this.code = code;
    this.status = status;
  }
}

const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function validateGameAiBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GameAiError('AI 请求格式无效。', 'AI_BAD_REQUEST', 400);
  const provider = cleanText(body.provider, 20);
  if (!PROVIDER_CONFIG[provider]) throw new GameAiError('不支持这个 AI 提供商。', 'AI_BAD_REQUEST', 400);
  const requestType = cleanText(body.requestType, 20);
  if (!REQUEST_TYPES.has(requestType)) throw new GameAiError('AI 请求类型无效。', 'AI_BAD_REQUEST', 400);
  const transactionId = cleanText(body.transactionId, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(transactionId)) throw new GameAiError('AI 事务编号无效。', 'AI_BAD_REQUEST', 400);
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 12) {
    throw new GameAiError('AI 消息数量无效。', 'AI_BAD_REQUEST', 400);
  }
  let total = 0;
  const messages = body.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new GameAiError('AI 消息格式无效。', 'AI_BAD_REQUEST', 400);
    const content = String(message.content ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
    if (!content || content.length > 6_000) throw new GameAiError('单条 AI 消息长度无效。', 'AI_BAD_REQUEST', 400);
    total += content.length;
    return { role: ROLES.has(message.role) ? message.role : 'user', content };
  });
  if (total > 50_000) throw new GameAiError('AI 消息总长度过大。', 'AI_BAD_REQUEST', 400);
  return {
    provider, requestType, transactionId, messages,
    model: cleanText(body.model, 140)
  };
}

function rateLimiter(now) {
  const records = new Map();
  return (accountKey) => {
    const account = cleanText(accountKey, 80).toLowerCase();
    if (!account) throw new GameAiError('登录账户无效。', 'AI_AUTH_FAILED', 401);
    const current = now();
    const previous = records.get(account) || [];
    const daily = previous.filter((timestamp) => timestamp > current - 86_400_000);
    const minuteCount = daily.filter((timestamp) => timestamp > current - 60_000).length;
    if (minuteCount >= MINUTE_LIMIT || daily.length >= DAY_LIMIT) {
      const wait = daily.length >= DAY_LIMIT ? daily[0] + 86400000 - current
        : daily.filter((timestamp) => timestamp > current - 60000)[0] + 60000 - current;
      throw Object.assign(new GameAiError('Chronos 网站保护额度已到，请稍后再试或使用个人 API。', 'AI_SITE_LIMITED', 429), { retryAfterMs: Math.max(1, wait) });
    }
    daily.push(current);
    records.set(account, daily);
    if (records.size > 5_000) {
      for (const [key, timestamps] of records) if (!timestamps.some((timestamp) => timestamp > current - 86_400_000)) records.delete(key);
    }
  };
}

function openAiBody(model, messages, provider, requestType) {
  return {
    model, messages, ...generationOptions(provider, model, requestType)
  };
}

function geminiBody(messages, model, requestType) {
  const systemText = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
  return {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
    generationConfig: generationOptions('gemini', model, requestType)
  };
}

function extractText(provider, data) {
  if (provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((part) => part?.text || '').join('') : '';
    if (text.trim()) return text;
  } else {
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return text;
  }
  throw new GameAiError('AI 上游返回为空。', 'AI_UPSTREAM_FAILED', 502);
}

export function createGameAiService({
  fetchImpl = globalThis.fetch, env = globalThis.process?.env || {}, now = () => Date.now(), timeoutMs = 25_000, sleep = delay
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const takeRateSlot = rateLimiter(now);

  return {
    async generate(accountKey, input, { signal } = {}) {
      const request = validateGameAiBody(input);
      takeRateSlot(accountKey);
      const config = PROVIDER_CONFIG[request.provider];
      const key = cleanText(env[config.keyName], 1_000);
      if (!key) throw new GameAiError('这个网站 AI 提供商尚未配置。', 'AI_NOT_CONFIGURED', 503);
      const configuredModel = cleanText(env[config.modelName] || config.defaultModel, 140);
      const model = request.model || configuredModel;
      if (model !== configuredModel && !config.allowedModels.includes(model)) {
        throw new GameAiError('网站模式不支持这个模型，请选择该提供商的允许模型。', 'AI_BAD_REQUEST', 400);
      }
      const url = config.protocol === 'gemini'
        ? `${config.endpoint}/${encodeURIComponent(model)}:generateContent`
        : config.endpoint;
      const body = config.protocol === 'gemini'
        ? geminiBody(request.messages, model, request.requestType)
        : openAiBody(model, request.messages, request.provider, request.requestType);
      const headers = {
        'Content-Type': 'application/json',
        ...(config.protocol === 'gemini' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` })
      };

      const startedAt = now();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(abort, timeoutMs);
      try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (controller.signal.aborted) throw new GameAiError('AI 请求超时或已取消。', 'AI_TIMEOUT', 504);
          const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const classified = aiHttpError(response, errorData);
            const failure = Object.assign(new GameAiError(classified.message, classified.code,
              response.status === 401 || response.status === 403 ? 503 : response.status),
              classified.retryAfterMs ? { retryAfterMs: classified.retryAfterMs } : {});
            if (response.status === 429) {
              throw failure;
            }
            if (!TRANSIENT_STATUSES.has(response.status) || attempt === 1) throw failure;
            const waitMs = retryAfterMs(response, errorData, 500);
            if (waitMs > 1500 || now() - startedAt + waitMs >= timeoutMs) throw failure;
            await sleep(waitMs);
            continue;
          }
          let data;
          try { data = await response.json(); }
          catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted) throw new GameAiError('AI 请求超时。', 'AI_TIMEOUT', 504);
            throw new GameAiError('AI 上游返回格式无效。', 'AI_UPSTREAM_FAILED', 502);
          }
          return {
            text: extractText(request.provider, data),
            provider: request.provider,
            model,
            transactionId: request.transactionId,
            latencyMs: Math.max(0, now() - startedAt), attempts: attempt + 1
          };
        } catch (error) {
          if (error instanceof GameAiError) throw error;
          if (error?.name === 'AbortError' || controller.signal.aborted) throw new GameAiError('AI 请求超时。', 'AI_TIMEOUT', 504);
          throw new GameAiError('无法连接 AI 上游。', 'AI_UPSTREAM_FAILED', 502);
        }
      }
      throw new GameAiError('AI 上游暂时不可用。', 'AI_UPSTREAM_FAILED', 502);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    }
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildNarrationPrompt, createAiClient, modelsForProvider, parseNarration, PROVIDERS } from '../public/luoying-xiantu/ai-client.js';
import { createGameState } from '../public/luoying-xiantu/game-state.js';

function fakeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('provider registry never loads remote executable code into the Chronos origin', async () => {
  const source = await readFile(new URL('../public/luoying-xiantu/ai-client.js', import.meta.url), 'utf8');
  assert.equal('puter' in PROVIDERS, false);
  assert.doesNotMatch(source, /js\.puter\.com|createElement\(['"]script['"]\)/);
});

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => body
  };
}

const testContext = () => ({
  requestType: 'trial', transactionId: 'trial-1',
  messages: [{ role: 'user', content: '只返回严格 JSON。' }]
});

test('Groq defaults to its production GPT OSS model', () => {
  assert.equal(PROVIDERS.groq.model, 'openai/gpt-oss-120b');
});

test('Gemini defaults to the stable 3.6 Flash model', () => {
  assert.equal(PROVIDERS.gemini.model, 'gemini-3.6-flash');
});

test('the settings model picker receives only the selected provider models', () => {
  assert.deepEqual(modelsForProvider('groq'), [
    'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b',
    'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'
  ]);
  assert.deepEqual(modelsForProvider('gemini'), [
    'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
    'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'
  ]);
  assert.deepEqual(modelsForProvider('missing'), []);
});

test('personal Groq requests JSON object mode for reliable game turns', async () => {
  const calls = [];
  const client = createAiClient({
    storage: fakeStorage(),
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return jsonResponse({ choices: [{ message: { content: '{"blocks":[{"type":"sys","text":"连接成功"}]}' } }] });
    }
  });
  await client.narrate({ provider: 'groq', credentialMode: 'personal', key: 'secret' }, testContext());
  assert.deepEqual(calls[0].response_format, { type: 'json_object' });
});

test('personal AI waits for the upstream retry-after window before a rate-limit retry', async () => {
  let calls = 0;
  const waits = [];
  const client = createAiClient({
    storage: fakeStorage(),
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetchImpl: async () => (++calls === 1
      ? jsonResponse({ error: { message: 'Please try again in 4.5s' } }, 429, { 'retry-after': '4.5' })
      : jsonResponse({ choices: [{ message: { content: '{"blocks":[{"type":"sys","text":"连接成功"}]}' } }] }))
  });
  await client.narrate({ provider: 'groq', credentialMode: 'personal', key: 'secret' }, testContext());
  assert.deepEqual(waits, [4500]);
});

test('personal AI can follow two rolling rate-limit windows before succeeding', async () => {
  let calls = 0;
  const waits = [];
  const client = createAiClient({
    storage: fakeStorage(),
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: { message: 'try again in 2s' } }, 429, { 'retry-after': '2' });
      if (calls === 2) return jsonResponse({ error: { message: 'try again in 0.75s' } }, 429, { 'retry-after': '0.75' });
      return jsonResponse({ choices: [{ message: { content: '{"blocks":[{"type":"sys","text":"连接成功"}]}' } }] });
    }
  });
  await client.narrate({ provider: 'groq', credentialMode: 'personal', key: 'secret' }, testContext());
  assert.deepEqual(waits, [2000, 750]);
});

test('personal Mistral uses its fixed OpenAI-compatible endpoint', async () => {
  const calls = [];
  const client = createAiClient({
    storage: fakeStorage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '{"blocks":[{"type":"sys","text":"连接成功"}]}' } }] });
    }
  });
  await client.narrate({ provider: 'mistral', credentialMode: 'personal', key: 'secret' }, testContext());
  assert.equal(calls[0].url, 'https://api.mistral.ai/v1/chat/completions');
});

test('parser preserves model HTML as inert text data', () => {
  const parsed = parseNarration('{"blocks":[{"type":"dlg","name":"魔修","text":"<img src=x onerror=alert(1)>"}]}');
  assert.equal(parsed.blocks[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(parsed.blocks[0].html, undefined);
});

test('parser preserves per-dialogue fact citations for local validation', () => {
  const parsed = parseNarration(JSON.stringify({
    blocks: [{ type: 'dlg', name: '林小满', text: '我昨夜看见了足迹。', factIds: ['fact:forest-footprints'] }],
    effects: {}, progress: { advanced: ['discovery:forest-footprints'] }, memory: {},
    suggestions: ['追问方向', '检查泥土'], timeCost: 'brief'
  }));
  assert.deepEqual(parsed.blocks[0].factIds, ['fact:forest-footprints']);
});

test('parser rejects JavaScript-shaped output instead of evaluating it', () => {
  assert.throws(() => parseNarration("({blocks:[{type:'narr',text:'坏'}]})"), /JSON/);
  assert.equal(globalThis.__luoyingInjected, undefined);
});

test('paused parser accepts sys blocks and discards every effect field', () => {
  const parsed = parseNarration(JSON.stringify({
    blocks: [{ type: 'sys', text: '落霞掌消耗四点灵力。' }, { type: 'narr', text: '世界继续。' }],
    effects: { gold: 999 }, progress: { advanced: ['illegal'] }, timeCost: 'long'
  }), 'system');
  assert.deepEqual(parsed, { blocks: [{ type: 'sys', text: '落霞掌消耗四点灵力。' }] });
});

test('site Gemini uses the authenticated Chronos proxy', async () => {
  const calls = [];
  const client = createAiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ text: '{"blocks":[{"type":"narr","text":"云开了。"}]}', model: 'gemini-3.5-flash' });
    },
    storage: fakeStorage({ 'chronos-session-token-v1': 'session' })
  });
  const text = await client.narrate(
    { provider: 'gemini', credentialMode: 'site', model: '' },
    { messages: [{ role: 'user', content: '继续' }] }
  );
  assert.equal(calls[0].url, '/api/game/ai');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer session');
  assert.equal(JSON.parse(calls[0].options.body).requestType, 'world');
  assert.match(text, /云开了/);
});

test('personal Gemini key is sent in a header to the fixed Google endpoint', async () => {
  const calls = [];
  const client = createAiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '结果' }] } }] });
    },
    storage: fakeStorage()
  });
  const text = await client.narrate(
    { provider: 'gemini', credentialMode: 'personal', key: 'personal-secret', model: 'gemini-3.5-flash' },
    { messages: [{ role: 'user', content: '继续' }] }
  );
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'personal-secret');
  assert.equal(text, '结果');
});

test('a failed request does not overwrite the selected provider', async () => {
  const storage = fakeStorage({ luoying_ai_v2: JSON.stringify({ provider: 'groq', credentialMode: 'personal' }) });
  const client = createAiClient({ fetchImpl: async () => { throw new Error('offline'); }, storage });
  await assert.rejects(() => client.narrate(
    { provider: 'groq', credentialMode: 'personal', key: 'x', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.6-27b' },
    { messages: [{ role: 'user', content: '继续' }] }
  ));
  assert.equal(JSON.parse(storage.getItem('luoying_ai_v2')).provider, 'groq');
});

test('narration prompt carries bounded state and player intent', () => {
  const state = createGameState('青禾');
  state.story.location = '青石镇';
  const messages = buildNarrationPrompt(state, [{ type: 'dlg', name: '林小满', text: '别发呆。' }], '我要去找李老');
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /青禾/);
  assert.match(messages[1].content, /我要去找李老/);
  assert.ok(JSON.stringify(messages).length < 12000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrationPrompt, createAiClient, parseNarration } from '../public/luoying-xiantu/ai-client.js';
import { createGameState } from '../public/luoying-xiantu/game-state.js';

function fakeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('parser preserves model HTML as inert text data', () => {
  const parsed = parseNarration('{"blocks":[{"type":"dlg","name":"魔修","text":"<img src=x onerror=alert(1)>"}]}');
  assert.equal(parsed.blocks[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(parsed.blocks[0].html, undefined);
});

test('parser rejects JavaScript-shaped output instead of evaluating it', () => {
  assert.throws(() => parseNarration("({blocks:[{type:'narr',text:'坏'}]})"), /JSON/);
  assert.equal(globalThis.__luoyingInjected, undefined);
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

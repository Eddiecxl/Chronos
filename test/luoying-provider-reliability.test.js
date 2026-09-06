import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient, PROVIDERS } from '../public/luoying-xiantu/ai-client.js';
import { createGameAiService } from '../server/game-ai.js';
import { aiHttpError } from '../public/luoying-xiantu/ai-errors.js';

const context = { requestType: 'world', transactionId: 'reliability', messages: [{ role: 'user', content: '只输出 JSON。我倾听。' }] };
const response = (data, status = 200, headers = {}) => ({ ok: status === 200, status, json: async () => data, headers: new Headers(headers) });
const success = () => response({ choices: [{ message: { content: '{}' } }] });

test('Gemini generic quota wording is not mistaken for an exhausted paid balance', () => {
  const error = aiHttpError({ status: 429 }, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.',
    details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '42s' }] } });
  assert.equal(error.code, 'AI_RATE_LIMITED');
  assert.equal(error.retryAfterMs, 42000);
});

test('explicit 503 recovery windows also prevent immediate manual retry traffic', async () => {
  let calls = 0;
  const client = createAiClient({ storage: { getItem: () => 'session' }, fetchImpl: async () => {
    calls++; return response({ error: '上游维护', code: 'AI_UPSTREAM_FAILED', retryAfterMs: 120000 }, 503);
  } });
  await assert.rejects(client.narrate({ provider: 'groq' }, context), e => e.retryAfterMs === 120000);
  await assert.rejects(client.narrate({ provider: 'groq' }, context), e => e.code === 'AI_UPSTREAM_FAILED');
  assert.equal(calls, 1);
});

test('official OpenAI is explicit, prefilled, and personal by default', async () => {
  assert.equal(PROVIDERS.openai.baseUrl, 'https://api.openai.com/v1');
  let url, body;
  const client = createAiClient({ storage: null, fetchImpl: async (target, options) => {
    url = target; body = JSON.parse(options.body); return success();
  } });
  await client.narrate({ provider: 'openai', key: 'test-only' }, context);
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.reasoning_effort, undefined);
});

test('OpenAI website mode uses server credentials and supports selected model', async () => {
  let url, body;
  const service = createGameAiService({ env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (target, options) => {
    url = target; body = JSON.parse(options.body); return success();
  } });
  await service.generate('player', { ...context, provider: 'openai', model: 'gpt-5.4-mini' });
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.temperature, undefined);
});

test('exhausted balance is not falsely presented as a seconds-long cooldown', async () => {
  let calls = 0;
  const client = createAiClient({ storage: null, fetchImpl: async () => {
    calls++; return response({ error: { code: 'insufficient_quota', message: 'Check your plan and billing details.' } }, 429);
  } });
  await assert.rejects(client.narrate({ provider: 'custom', baseUrl: 'https://example.com/v1', model: 'test', key: 'test' }, context),
    error => error.code === 'AI_QUOTA_EXHAUSTED' && !error.retryAfterMs && /余额|预算/.test(error.message));
  assert.equal(calls, 1);
});

test('server preserves a long upstream cooldown and client avoids premature re-requests', async () => {
  const service = createGameAiService({ env: { GROQ_API_KEY: 'test-only' }, fetchImpl: async () =>
    response({ error: { message: 'Rate limit reached' } }, 429, { 'retry-after': '120' }) });
  await assert.rejects(service.generate('player', { ...context, provider: 'groq' }), e => e.retryAfterMs === 120000);
  let calls = 0;
  const client = createAiClient({ storage: null, fetchImpl: async () => {
    calls++; return response({ error: { message: 'Rate limit reached' } }, 429, { 'retry-after': '120' });
  } });
  const settings = { provider: 'groq', credentialMode: 'personal', key: 'test-only' };
  await assert.rejects(client.narrate(settings, context), e => e.code === 'AI_RATE_LIMITED');
  await assert.rejects(client.narrate(settings, context), e => e.retryAfterMs > 119000);
  assert.equal(calls, 1);
});

test('model access errors and billing failures retain actionable codes through site proxy', async () => {
  for (const [status, upstreamCode, expected] of [[404, 'model_not_found', 'AI_MODEL_UNAVAILABLE'], [429, 'insufficient_quota', 'AI_QUOTA_EXHAUSTED']]) {
    const service = createGameAiService({ env: { GROQ_API_KEY: 'test-only' }, fetchImpl: async () => response({ error: { code: upstreamCode } }, status) });
    await assert.rejects(service.generate('player', { ...context, provider: 'groq' }), e => e.code === expected);
  }
});

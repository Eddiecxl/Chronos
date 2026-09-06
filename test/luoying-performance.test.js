import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../public/luoying-xiantu/ai-client.js';
import { createGameAiService } from '../server/game-ai.js';
import { createAiTurnRunner } from '../public/luoying-xiantu/ai-turn.js';
import { createGameState } from '../public/luoying-xiantu/game-state.js';

const context = { requestType: 'world', transactionId: 'latency-test', messages: [{ role: 'user', content: '我听门外的声音。' }] };
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('site errors reach the player without multiplying server retries', async () => {
  let calls = 0;
  const client = createAiClient({ storage: { getItem: () => 'session' }, sleep: async () => {},
    fetchImpl: async () => { calls++; return response({ error: '上游忙', code: 'AI_UPSTREAM_FAILED' }, 502); } });
  await assert.rejects(client.narrate({ provider: 'groq' }, context), /上游忙/);
  assert.equal(calls, 1);
});

test('Groq generation uses low reasoning with enough room for complete story JSON', async () => {
  let body;
  const service = createGameAiService({ env: { GROQ_API_KEY: 'test' }, fetchImpl: async (_, options) => {
    body = JSON.parse(options.body); return response({ choices: [{ message: { content: '{}' } }] });
  } });
  await service.generate('player', { ...context, provider: 'groq' });
  assert.equal(body.reasoning_effort, 'low');
  assert.ok(body.max_completion_tokens >= 2800);
});

test('quota exhaustion returns immediately without another billable generation', async () => {
  let calls = 0;
  const service = createGameAiService({ env: { GROQ_API_KEY: 'test' }, sleep: async () => {},
    fetchImpl: async () => { calls++; return response({ error: { message: 'try again in 30s' } }, 429); } });
  await assert.rejects(service.generate('player', { ...context, provider: 'groq' }), e => e.code === 'AI_RATE_LIMITED');
  assert.equal(calls, 1);
});

test('cancelling a turn cannot publish late AI narration or mutate the save', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const state = createGameState('照月', 'ai');
  const before = JSON.stringify(state);
  const runner = createAiTurnRunner({ aiClient: { narrate: async () => { calls++; return '{}'; } },
    transcriptStore: { recentTurns: async () => [], appendTurn: async () => { throw Error('must not write'); } } });
  const result = await runner.runWorld({ state, input: '我抬头', signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(state), before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAiService, validateGameAiBody } from '../server/game-ai.js';

const jsonResponse = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  json: async () => body
});

const validRequest = (provider) => ({
  provider,
  model: '',
  transactionId: 'tx-1',
  requestType: 'world',
  messages: [{ role: 'user', content: '继续剧情' }]
});

test('site proxy accepts only its three configured providers', () => {
  assert.throws(() => validateGameAiBody(validRequest('custom')), /提供商/);
  assert.equal(validateGameAiBody({ provider: 'mistral', transactionId: 'tx-1', requestType: 'world', messages: [{ role: 'user', content: 'x' }] }).provider, 'mistral');
});

test('validation bounds transaction ids request types and message sizes', () => {
  assert.throws(() => validateGameAiBody({ ...validRequest('groq'), transactionId: '../secret' }), /事务/);
  assert.throws(() => validateGameAiBody({ ...validRequest('groq'), requestType: 'opening' }), /请求类型/);
  assert.throws(() => validateGameAiBody({ ...validRequest('groq'), messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'x' })) }), /消息/);
  assert.throws(() => validateGameAiBody({ ...validRequest('groq'), messages: [{ role: 'user', content: 'x'.repeat(6001) }] }), /消息/);
});

test('Groq uses the fixed official endpoint and configured production model', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret', GROQ_MODEL: 'openai/gpt-oss-120b' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '结果' } }] });
    }
  });
  const result = await service.generate('player', validRequest('groq'));
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).model, 'openai/gpt-oss-120b');
  assert.deepEqual(JSON.parse(calls[0].options.body).response_format, { type: 'json_object' });
  assert.equal(result.model, 'openai/gpt-oss-120b');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('site Groq accepts a supported model switch without changing providers', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret', GROQ_MODEL: 'openai/gpt-oss-120b' },
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return jsonResponse({ choices: [{ message: { content: '结果' } }] });
    }
  });
  const result = await service.generate('player', {
    ...validRequest('groq'), model: 'openai/gpt-oss-20b'
  });
  assert.equal(calls[0].model, 'openai/gpt-oss-20b');
  assert.equal(result.model, 'openai/gpt-oss-20b');
});

test('site proxy rejects models outside its provider allowlist', async () => {
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' },
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: '不应调用' } }] })
  });
  await assert.rejects(
    service.generate('player', { ...validRequest('groq'), model: 'untrusted/expensive-model' }),
    (error) => error.code === 'AI_BAD_REQUEST' && error.status === 400
  );
});

test('Mistral uses the fixed official endpoint', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { MISTRAL_API_KEY: 'secret', MISTRAL_MODEL: 'mistral-small-latest' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ choices: [{ message: { content: '结果' } }] });
    }
  });
  await service.generate('player', validRequest('mistral'));
  assert.equal(calls[0].url, 'https://api.mistral.ai/v1/chat/completions');
});

test('Gemini uses its fixed endpoint and extracts candidate text', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { GEMINI_API_KEY: 'secret', GEMINI_MODEL: 'gemini-3.5-flash' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '星光落下。' }] } }] });
    }
  });
  const result = await service.generate('player', validRequest('gemini'));
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash:generateContent$/);
  assert.equal(result.text, '星光落下。');
});

test('Gemini site mode defaults to Gemini 3.6 Flash', async () => {
  const calls = [];
  const service = createGameAiService({
    env: { GEMINI_API_KEY: 'secret' },
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '樱花落下。' }] } }] });
    }
  });
  const result = await service.generate('player', validRequest('gemini'));
  assert.match(calls[0], /\/gemini-3\.6-flash:generateContent$/);
  assert.equal(result.model, 'gemini-3.6-flash');
});

test('missing site credentials return a stable non-secret error code', async () => {
  const service = createGameAiService({ env: {}, fetchImpl: async () => jsonResponse({}) });
  await assert.rejects(service.generate('player', validRequest('groq')), (error) => {
    assert.equal(error.code, 'AI_NOT_CONFIGURED');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /API_KEY/);
    return true;
  });
});

test('transient upstream responses receive exactly one retry', async () => {
  let calls = 0;
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' },
    sleep: async () => {},
    fetchImpl: async () => (++calls === 1
      ? jsonResponse({ error: { message: 'busy secret' } }, 503)
      : jsonResponse({ choices: [{ message: { content: '恢复' } }] }))
  });
  assert.equal((await service.generate('player', { ...validRequest('groq'), model: 'openai/gpt-oss-120b' })).text, '恢复');
  assert.equal(calls, 2);
});

test('default Qwen does not repeat a transient site request', async () => {
  let calls = 0;
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' }, sleep: async () => {},
    fetchImpl: async () => { calls += 1; return jsonResponse({ error: { message: 'busy' } }, 503); }
  });
  await assert.rejects(service.generate('player', validRequest('groq')), error => error.code === 'AI_UPSTREAM_FAILED');
  assert.equal(calls, 1);
});

test('site proxy reports the upstream retry-after window without silently waiting', async () => {
  let calls = 0;
  const waits = [];
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' },
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetchImpl: async () => (++calls === 1
      ? jsonResponse({ error: { message: 'Please try again in 6.25s' } }, 429, { 'retry-after': '6.25' })
      : jsonResponse({ choices: [{ message: { content: '恢复' } }] }))
  });
  await assert.rejects(service.generate('player', validRequest('groq')), error => error.retryAfterMs === 6250);
  assert.deepEqual(waits, []);
  assert.equal(calls, 1);
});

test('site quota exhaustion does not consume extra requests in a retry loop', async () => {
  let calls = 0;
  const waits = [];
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' },
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: { message: 'try again in 3s' } }, 429, { 'retry-after': '3' });
      if (calls === 2) return jsonResponse({ error: { message: 'try again in 1.25s' } }, 429, { 'retry-after': '1.25' });
      return jsonResponse({ choices: [{ message: { content: '恢复' } }] });
    }
  });
  await assert.rejects(service.generate('player', validRequest('groq')), error => error.code === 'AI_RATE_LIMITED');
  assert.deepEqual(waits, []);
  assert.equal(calls, 1);
});

test('upstream timeout remains active while the response body is being read', async () => {
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' }, timeoutMs: 5,
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      })
    })
  });
  await assert.rejects(service.generate('player', validRequest('groq')), (error) => error.code === 'AI_TIMEOUT');
});

test('per-account rolling minute limits do not affect another account', async () => {
  const service = createGameAiService({
    env: { GROQ_API_KEY: 'secret' }, now: () => 1000,
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] })
  });
  for (let index = 0; index < 12; index += 1) await service.generate('one', { ...validRequest('groq'), transactionId: `tx-${index}` });
  await assert.rejects(service.generate('one', { ...validRequest('groq'), transactionId: 'tx-limit' }), (error) => error.code === 'AI_SITE_LIMITED' && error.retryAfterMs === 60000);
  assert.equal((await service.generate('two', validRequest('groq'))).text, 'ok');
});

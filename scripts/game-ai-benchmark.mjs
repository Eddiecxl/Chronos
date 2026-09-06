import { createAiClient } from '../public/luoying-xiantu/ai-client.js';
import { createAiTurnRunner } from '../public/luoying-xiantu/ai-turn.js';
import { createGameState } from '../public/luoying-xiantu/game-state.js';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';
const provider = process.argv[2] || 'groq';
const key = process.env[provider === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'];
if (!key) throw Error('Missing provider environment secret');
let count = 0;
const client = createAiClient({ storage: null, fetchImpl: async (url, options) => {
  const started = performance.now();
  const response = await fetch(url, options);
  const data = await response.clone().json().catch(() => ({}));
  console.log(JSON.stringify({ request: ++count, status: response.status, ms: Math.round(performance.now() - started),
    promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens,
    finish: data.choices?.[0]?.finish_reason, code: data.error?.code }));
  return response;
} });
const runner = createAiTurnRunner({ aiClient: client, transcriptStore: createTranscriptStore({ memory: new Map() }) });
const started = performance.now();
const settings = { provider, credentialMode: 'personal', key };
const method = process.argv.includes('--world') ? 'runWorld' : 'runOpening';
const result = await runner[method]({ state: createGameState('顾长生', 'ai'), input: '我贴近门缝，屏住呼吸，仔细辨认脚步来自哪里。', settings, signal: AbortSignal.timeout(45000),
  onProgress: (stage, details) => console.log(JSON.stringify({ stage, ...details, ms: Math.round(performance.now() - started) })) });
console.log(JSON.stringify({ ok: result.ok, totalMs: Math.round(performance.now() - started), requests: count,
  error: result.error, text: result.blocks?.map(b => b.text).join('\n'), rememberedFacts: result.state?.memory?.facts?.length }));
if (!result.ok) process.exitCode = 1;
if (result.ok && process.argv.includes('--continue')) {
  const start = performance.now();
  const continuation = await runner.runWorld({ state: result.state, input: '我贴近门缝，屏住呼吸，仔细辨认脚步来自哪里。', settings,
    signal: AbortSignal.timeout(45000), onProgress: (stage, details) => console.log(JSON.stringify({ stage, ...details, ms: Math.round(performance.now() - start) })) });
  console.log(JSON.stringify({ continuation: continuation.ok, totalMs: Math.round(performance.now() - start),
    error: continuation.error, text: continuation.blocks?.map(b => b.text).join('\n'), rememberedFacts: continuation.state?.memory?.facts?.length }));
  if (!continuation.ok) process.exitCode = 1;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { personalGroqRecoveryDraft, recoveryActionFor } from '../public/luoying-xiantu/ai-recovery.js';

test('a shared Groq rate limit offers the player an independent personal-key path', () => {
  assert.deepEqual(
    recoveryActionFor({ code: 'AI_RATE_LIMITED' }, { provider: 'groq', credentialMode: 'site' }),
    { kind: 'personal-groq', label: '使用自己的 Groq Key' }
  );
});

test('other recovery cases leave model settings as the next action', () => {
  assert.deepEqual(
    recoveryActionFor({ code: 'AI_RATE_LIMITED' }, { provider: 'gemini', credentialMode: 'site' }),
    { kind: 'settings', label: '切换模型' }
  );
});

test('personal Groq recovery uses only the stored Groq key, never a different provider key', () => {
  assert.deepEqual(
    personalGroqRecoveryDraft('groq-only-key'),
    { provider: 'groq', credentialMode: 'personal', model: 'qwen/qwen3.8-27b', key: 'groq-only-key' }
  );
  assert.equal(personalGroqRecoveryDraft('').key, '');
});

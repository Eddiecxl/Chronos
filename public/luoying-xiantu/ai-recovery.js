export function recoveryActionFor(result = {}, settings = {}) {
  if (result.code === 'AI_RATE_LIMITED' && settings.provider === 'groq' && settings.credentialMode === 'site') {
    return { kind: 'personal-groq', label: '使用自己的 Groq Key' };
  }
  return { kind: 'settings', label: '切换模型' };
}

export function personalGroqRecoveryDraft(groqKey = '') {
  return {
    provider: 'groq', credentialMode: 'personal', model: 'qwen/qwen3.8-27b', key: String(groqKey || '')
  };
}

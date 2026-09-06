// Shared by personal-key requests and the server proxy.
export function generationOptions(provider, model, requestType = 'world') {
  const tokens = requestType === 'trial' ? 1000 : requestType === 'system' ? 1200 : 3200;
  if (provider === 'gemini') return { temperature: 0.75, maxOutputTokens: tokens, responseMimeType: 'application/json' };
  if (provider === 'groq') return {
    temperature: 0.75, max_completion_tokens: tokens,
    response_format: { type: 'json_object' },
    ...(/^openai\/gpt-oss-(?:20b|120b)$/.test(model) ? { reasoning_effort: 'low', reasoning_format: 'hidden' } : {})
  };
  return { temperature: 0.75, max_tokens: tokens };
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Error(signal.reason?.name === 'TimeoutError'
    ? '本回合等待超时，请重试或切换模型。' : '已停止等待，世界和输入保持原样。');
}

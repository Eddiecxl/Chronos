export function isGroqQwen38(provider, model) {
  return provider === 'groq' && model === 'qwen/qwen3.8-27b';
}

export function modelNarrativeProfile(provider, model) {
  const qwen38 = isGroqQwen38(provider, model);
  return qwen38
    ? { perspective: 'third', compactContext: true, maxAttempts: 1, narrativeChars: '180–320' }
    : { perspective: 'first', compactContext: false, maxAttempts: 2, narrativeChars: '260–500' };
}

// Shared by personal-key requests and the server proxy.
export function generationOptions(provider, model, requestType = 'world') {
  const qwen38 = isGroqQwen38(provider, model);
  if (qwen38) {
    const tokens = requestType === 'world' || requestType === 'repair' ? 1100 : 700;
    return {
      temperature: 0.72, max_completion_tokens: tokens,
      // Qwen's instruct mode avoids spending the compact response budget on
      // hidden reasoning, which also prevents Groq from rejecting a truncated
      // JSON-object response as json_validate_failed.
      response_format: { type: 'json_object' }, reasoning_effort: 'none'
    };
  }
  const tokens = requestType === 'trial' ? 1000 : requestType === 'system' ? 1200 : 3200;
  if (provider === 'gemini') return { temperature: 0.75, maxOutputTokens: tokens, responseMimeType: 'application/json' };
  if (provider === 'openai') return {
    max_completion_tokens: tokens, response_format: { type: 'json_object' },
    ...(/^gpt-5/.test(model) ? { reasoning_effort: /^gpt-5(?:-mini|-nano|$)/.test(model) ? 'minimal' : 'none' } : { temperature: 0.75 })
  };
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

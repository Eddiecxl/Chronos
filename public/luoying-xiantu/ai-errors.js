// Shared, sanitized error classification. Never display raw upstream bodies or keys.
export function retryAfterMs(response, data, fallback = 10000, now = Date.now()) {
  if (Number.isFinite(data?.retryAfterMs) && data.retryAfterMs > 0) return Math.ceil(data.retryAfterMs);
  const header = response?.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  }
  const message = String(data?.error?.message || '');
  const retryInfo = data?.error?.details?.find?.(detail => detail['@type']?.endsWith('RetryInfo'));
  const retrySeconds = Number(String(retryInfo?.retryDelay || '').replace(/s$/, ''));
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) return Math.ceil(retrySeconds * 1000);
  const duration = message.match(/try again in\s+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)(ms|s))?/i);
  if (duration) {
    const ms = Number(duration[1] || 0) * 3600000 + Number(duration[2] || 0) * 60000
      + Number(duration[3] || 0) * (duration[4] === 'ms' ? 1 : 1000);
    if (ms > 0) return Math.ceil(ms);
  }
  return fallback;
}

export function aiHttpError(response, data = {}, trustedProxy = false) {
  const status = response.status;
  const upstreamCode = String(data?.code || data?.error?.code || data?.error?.type || '');
  const message = String(data?.error?.message || data?.error || '');
  let code = 'AI_UPSTREAM_FAILED';
  let text = 'AI 服务暂时不可用，请稍后再试或切换服务商。';
  let wait;
  if (upstreamCode === 'AI_QUOTA_EXHAUSTED' || /insufficient_quota|billing_hard_limit|credit_balance|quota_exhausted/i.test(upstreamCode)
    || /insufficient (?:balance|credits)|credit balance is too low/i.test(message) || status === 402) {
    code = 'AI_QUOTA_EXHAUSTED';
    text = '这个 API 账户的余额或预算已用完。等待和重复点击无法恢复，请检查 API 账单，或换有额度的服务商。';
  } else if (upstreamCode === 'AI_NOT_CONFIGURED') {
    code = upstreamCode; text = '网站尚未配置这个服务商的 API Key。请用个人 Key，或由站长配置后再用。';
  } else if (status === 401 || status === 403 || upstreamCode === 'AI_AUTH_FAILED') {
    code = 'AI_AUTH_FAILED'; text = '登录状态或 API Key 无效／没有权限。网站模式请重新登录；个人模式请检查对应服务商的 Key。';
  } else if (status === 404 || /model_not_found|AI_MODEL_UNAVAILABLE/i.test(upstreamCode)) {
    code = 'AI_MODEL_UNAVAILABLE'; text = '这个模型不存在，或当前 API 账户没有访问权限。请在设置中更换模型。';
  } else if (status === 429) {
    code = upstreamCode === 'AI_SITE_LIMITED' ? upstreamCode : 'AI_RATE_LIMITED';
    wait = retryAfterMs(response, data);
    text = `${code === 'AI_SITE_LIMITED' ? 'Chronos 网站保护额度' : '当前模型额度'}繁忙，约 ${Math.ceil(wait / 1000)} 秒后再试；也可切换有独立额度的服务商。`;
  } else if (status === 400) {
    code = 'AI_BAD_REQUEST'; text = '模型不接受当前请求参数。请检查模型名称或改用设置中列出的模型。';
  } else if (status === 504 || upstreamCode === 'AI_TIMEOUT') {
    code = 'AI_TIMEOUT'; text = 'AI 服务响应超时。世界未推进，请稍后再试或换模型。';
  } else if (trustedProxy && upstreamCode === 'AI_UPSTREAM_FAILED' && typeof data.error === 'string') {
    // Same-origin proxy messages are already sanitized by the server.
    text = data.error.slice(0, 300);
  }
  if (code === 'AI_UPSTREAM_FAILED' && [502, 503].includes(status)) {
    wait = retryAfterMs(response, data, 0) || undefined;
    if (wait) text += ` 服务方建议约 ${Math.ceil(wait / 1000)} 秒后再试。`;
  }
  return Object.assign(new Error(text), { code, status, ...(wait ? { retryAfterMs: wait } : {}) });
}

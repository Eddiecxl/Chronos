# AI 服务选择与连续游玩验收

新仓库和 Cloudflare 发布暂停。先在 Chronos 验证游戏；连接测试成功不等于连续剧情合格。

## 当前可选项

| 服务 / 模型 | 用途 | 官方输入 / 输出价格（美元 / 百万 token） |
| --- | --- | --- |
| OpenAI `gpt-4.1-mini` | 低成本、低延迟候选；OpenAI 入口默认 | 0.40 / 1.60 |
| OpenAI `gpt-5.4-mini` | 对比复杂指令遵循，关闭额外推理等待 | 0.75 / 4.50 |
| OpenAI `gpt-5.6-terra` | 更高预算的对比候选，关闭额外推理等待 | 2.00 / 12.00 |
| Groq GPT-OSS 120B / 20B | 保留，高速测试；现有免费额度会限流 | 以账户账单为准 |
| Mistral `mistral-small-latest` | 已保留的另一家服务，需独立 API 额度 | 以账户账单为准 |
| Gemini | 原有模型保留，可随时切换 | 以 AI Studio 账户为准 |

OpenAI 文档已核对，但本机没有 OpenAI 或 Mistral Key，尚不能声称它们在此游戏中已经实测合格。所有 API 都有额度和限流，没有无限免费且保证稳定的承诺。

按每回合 2,500 输入 + 700 输出 token、不含缓存优惠和修正请求估算，100 回合分别约为 **$0.21 / $0.50 / $1.34**。长记忆、修正、更多正文会增加实际用量。这里只是成本估算，不是付款或充值操作。

官方资料（2026-09-07 核对）：

- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/models/gpt-5.6-terra
- https://developers.openai.com/api/docs/guides/rate-limits
- https://developers.openai.com/api/docs/guides/error-codes
- https://docs.mistral.ai/admin/billing-usage/usage-limits

## 如何使用

个人测试：游戏 → AI 设置 → OpenAI → 自己的 API Key。官方 Base URL `https://api.openai.com/v1` 已填好，先用 `gpt-4.1-mini`。Key 只在当前页面内存保留、不写入存档或 localStorage；不同服务商分别保存到本页关闭。请求直接发给所选官方 API（浏览器需允许跨域请求）。不要使用别人的 Key，不要把 Key 写进仓库或聊天记录。

正式站点优先用后端：站长在 Render Environment 设置 `OPENAI_API_KEY` 和可选 `OPENAI_MODEL=gpt-4.1-mini`，部署后玩家选“Chronos 网站额度”。服务器的 Key 不传给浏览器。网站模式依然有每账户保护限额；个人模式不使用网站共享额度。ChatGPT 会员与 API 账单分开，不能用会员登录令牌替代 API Key。

切换服务商或模型只影响下一次请求，原有旅程与记忆保留；不自动切回本地故事，也不偷偷切换到付费模型。若以前公开过 Key，请在对应控制台轮换。

## 这次修正

- 余额不足、凭据问题、模型无权限、站点保护、上游限流、内容因果校验分别反馈。
- 保留真实 Retry-After（包括长于 30 秒、HTTP 日期及 Gemini RetryInfo），冷却期间不再次发送相同凭据/模型请求；503 明确要求等待时同样遵守。
- 不因空的可选地点字段要求重写剧情；世界事实的可选记忆注释若是唯一问题，可移除没有正文依据的注释，再跑全部校验。不会补造剧情、掩盖未发现角色或放弃有效推进要求。
- “我必须立刻决定”与“我决定加入”区分，避免把尚未发生的决定误判为替玩家选择；首次苏醒不强行推进时间，但开篇标记不可重复用于后续回合。

## 验收与已知阻碍

现有 Groq/Gemini 的立即连续调用测试确实复现 429。Groq 20B 开篇约 0.9 秒，120B 开篇约 1.5 秒；Gemini 3.6 开篇约 14.7 秒，随后限流。它们是少量现场样本，不能承诺稳定速度或质量。

最终 Groq 120B 带 15 秒阅读间隔的测试：开篇 1.78 秒，两个普通回合 1.95 / 2.18 秒，一次请求各自完成，保存 5 条事实；第三个普通回合仍被 429 拒绝（建议等待 4 秒）。因此**仍未达到连续畅玩门槛**，没有继续耗额度盲目重试。

本轮代码验证：228 项 Node 测试通过，Vite 构建通过；桌面和手机浏览器验证 OpenAI 预填、服务商 Key 隔离、429 冷却、输入保留、取消、系统暂停、七槽装备和重载恢复通过。独立代码审查通过。模拟检查只验证游戏逻辑，不代表 OpenAI 已实测。

验收脚本 `scripts/game-ai-benchmark.mjs` 支持 `--journey`（开篇 + 最多 8 个世界回合），首个失败即停止。`GAME_BENCH_MODEL` 指定模型，`GAME_BENCH_READING_MS` 可设置每回合前的阅读时间，默认 0；报告明确显示阅读时间，不能把带间隔的结果说成无间隔压力测试。使用真实 Key 会消耗对应 API 额度，脚本不打印 Key、不操作玩家存档。

发布新仓库之前，仍需要用有可用额度的目标服务完成连续场景、记忆召回、第一人称、系统暂停及章节推进验收。尚未满足此门槛。

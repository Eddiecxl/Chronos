import { migrateGameState } from './game-state.js';
import { parseNarration, PROVIDERS } from './ai-client.js';
import {
  buildRepairMessages, commitValidatedWorldTurn, createSceneContract, validateAiWorldTurn
} from './director.js';
import {
  applyMemoryCandidates, registerEntityCandidates, selectRelevantMemory, updateChapterSummary
} from './memory.js';
import { answerSystemQuery } from './turn-router.js';
import { LOCATIONS } from './game-data.js';

const WORLD_BIBLE = `你是中文修仙文字游戏《落樱仙途》的唯一叙事作者。本回合绝不能使用本地预写剧情作后备。
规则：
1. 严格遵守场景契约、已知事实、死亡状态、地点和数值上限。
2. 不得替玩家说话、决定关键选择、指定感受或把玩家写成旁观者。
3. 每回合必须产生新信息、明确后果或目标进展；不得复述、拖延或绕圈。
4. 灵气用于境界突破；灵力用于功法消耗，两者绝不混用。
5. NPC 只能引用其 knownFactIds 中的事实；新角色和地点必须提供稳定 generated: ID、目的与归属地点。
6. 提供 2–5 个有实质差异的行动建议，但玩家仍可自由输入。
只输出一个严格 JSON 对象，不要代码围栏。世界回合格式：
{"blocks":[{"type":"narr","text":"旁白"},{"type":"dlg","name":"角色名","text":"对白"}],"effects":{"hp":0,"qi":0,"spirit":0,"gold":0,"relationships":{},"addItems":{},"addQuests":[],"location":"地点名"},"progress":{"advanced":["scene:进展ID"],"consequences":["后果"],"openLoops":["loop:悬念ID"],"resolvedLoops":[],"dangerClocks":{}},"memory":{"facts":[{"subjectId":"world:主题","predicate":"事实关系","object":"事实内容","confidence":1}],"entities":[],"chapterSummary":"可选章节摘要"},"usedFactIdsByActor":{},"suggestions":["行动一","行动二"],"timeCost":"instant|brief|scene|long"}`;

const cleanText = (value, max = 2_000) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const defaultId = () => globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function recentForPrompt(turns) {
  return turns.slice(-10).map((turn) => ({
    id: turn.id,
    kind: turn.kind,
    userText: turn.userText,
    blocks: turn.blocks,
    suggestions: turn.suggestions
  }));
}

function buildWorldMessages(contract, memoryPacket, recentTurns, requestType) {
  const openingRule = requestType === 'opening'
    ? '这是开篇：所有可见剧情文字都必须由你生成。让玩家醒来并感到迫近的危险，但不要替玩家采取行动。'
    : '这是普通世界行动：逐字尊重场景契约内的 playerInput，并让它产生真实后果。';
  return [
    {
      role: 'system',
      content: `${WORLD_BIBLE}\n${openingRule}\n场景契约：${JSON.stringify(contract)}\n相关长期记忆：${JSON.stringify(memoryPacket)}`
    },
    {
      role: 'user',
      content: `最近十个回合：${JSON.stringify(recentForPrompt(recentTurns))}\n本次玩家原话：${contract.playerInput}\n严格输出一个 JSON 对象。`
    }
  ];
}

function narrationFrom(raw, requestType) {
  return parseNarration(raw, requestType === 'system' ? 'system' : 'world');
}

function failure(error, input, transactionId, contract) {
  return {
    ok: false,
    error: cleanText(error?.message || error || 'AI 回合失败。', 600),
    retry: { input, transactionId, contract }
  };
}

function repetitionScore(text) {
  const normalized = cleanText(text, 20_000).replace(/\s+/g, '');
  if (normalized.length < 4) return 0;
  const grams = [];
  for (let index = 0; index < normalized.length - 2; index += 1) grams.push(normalized.slice(index, index + 3));
  return Number((1 - new Set(grams).size / Math.max(1, grams.length)).toFixed(3));
}

export function createAiTurnRunner({ aiClient, transcriptStore, now = () => Date.now(), idFactory = defaultId } = {}) {
  if (!aiClient?.narrate) throw new Error('AI 客户端不可用。');
  if (!transcriptStore?.recentTurns || !transcriptStore?.appendTurn) throw new Error('游戏记录存储不可用。');

  async function executeWorld({ state: source, input, settings = {}, transactionId }, requestType) {
    let contract;
    const cleanInput = cleanText(input, 2_000);
    const txId = cleanText(transactionId || idFactory(), 100);
    try {
      const state = migrateGameState(source, 'ai');
      contract = createSceneContract(state, cleanInput, txId);
      const locationId = LOCATIONS[state.story.location]?.id;
      const memoryPacket = selectRelevantMemory(state, {
        chapterId: contract.chapter.id,
        locationId,
        participantIds: contract.actors.map((actor) => actor.id),
        openLoopIds: contract.openLoopIds,
        questIds: state.quests.active.map((quest) => quest.id)
      });
      const recentTurns = await transcriptStore.recentTurns(state.journeyId, 10);
      let messages = buildWorldMessages(contract, memoryPacket, recentTurns, requestType);
      let narration;
      let validation;
      let raw = '';

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const proxyRequestType = attempt === 1 ? 'repair' : requestType === 'opening' ? 'world' : requestType;
        raw = await aiClient.narrate(settings, { requestType: proxyRequestType, transactionId: txId, messages });
        try {
          narration = narrationFrom(raw, requestType);
          validation = validateAiWorldTurn(state, contract, narration, recentTurns);
        } catch (error) {
          narration = { blocks: [], suggestions: [], raw: cleanText(raw, 12_000) };
          validation = { ok: false, errors: [error.message], fingerprint: '' };
        }
        if (validation.ok) break;
        if (attempt === 0) {
          messages = [
            ...messages,
            { role: 'assistant', content: cleanText(raw, 12_000) },
            ...buildRepairMessages(contract, narration, validation.errors)
          ];
        }
      }
      if (!validation?.ok) throw new Error(`AI 内容连续两次未通过验证：${validation?.errors?.join('；') || '未知结构错误'}`);

      let committed = commitValidatedWorldTurn(state, contract, narration);
      committed = registerEntityCandidates(committed, narration.memory?.entities || [], txId);
      committed = applyMemoryCandidates(committed, narration.memory?.facts || [], txId);
      if (narration.memory?.chapterSummary) {
        committed = updateChapterSummary(committed, contract.chapter.id, narration.memory.chapterSummary);
      }

      const turn = {
        id: txId,
        kind: 'world',
        userText: requestType === 'opening' ? '' : cleanInput,
        provider: settings.provider || 'groq',
        model: settings.model || PROVIDERS[settings.provider || 'groq']?.model || '',
        blocks: narration.blocks,
        suggestions: narration.suggestions,
        fingerprint: validation.fingerprint,
        createdAt: new Date(now()).toISOString()
      };
      await transcriptStore.appendTurn(committed.journeyId, turn);
      return { ok: true, state: committed, blocks: narration.blocks, suggestions: narration.suggestions, turn };
    } catch (error) {
      return failure(error, cleanInput, txId, contract);
    }
  }

  return {
    async runOpening({ state, settings = {}, transactionId } = {}) {
      return executeWorld({
        state,
        input: '生成旅程开篇：主角刚在赵府柴房醒来，等待玩家作出第一个行动。',
        settings,
        transactionId
      }, 'opening');
    },
    async runWorld({ state, input, settings = {}, transactionId } = {}) {
      if (!cleanText(input)) return failure('请输入行动。', '', cleanText(transactionId || idFactory(), 100), undefined);
      return executeWorld({ state, input, settings, transactionId }, 'world');
    },
    async runSystem({ state, input, settings = {}, transactionId } = {}) {
      const txId = cleanText(transactionId || idFactory(), 100);
      const cleanInput = cleanText(input, 2_000);
      try {
        migrateGameState(state, state.mode);
        let answer = answerSystemQuery(state, cleanInput);
        if (!answer.handled) {
          const raw = await aiClient.narrate(settings, {
            requestType: 'system', transactionId: txId,
            messages: [
              { role: 'system', content: '时间完全暂停。只回答玩家关于既有状态的问题；只输出 {"blocks":[{"type":"sys","text":"答复"}]}，不得输出任何效果、剧情行动或 NPC 推进。' },
              { role: 'user', content: cleanInput }
            ]
          });
          answer = { handled: true, ...narrationFrom(raw, 'system') };
        }
        const turn = {
          id: txId, kind: 'system', userText: cleanInput,
          provider: settings.provider || 'system', model: settings.model || '',
          blocks: answer.blocks, createdAt: new Date(now()).toISOString()
        };
        await transcriptStore.appendTurn(state.journeyId, turn);
        return { ok: true, state, blocks: answer.blocks, suggestions: [], turn };
      } catch (error) {
        return failure(error, cleanInput, txId, undefined);
      }
    },
    async runTrial({ settings = {}, trial = '宗门夜巡' } = {}) {
      const transactionId = cleanText(idFactory(), 100);
      const startedAt = now();
      let raw = '';
      try {
        raw = await aiClient.narrate(settings, {
          requestType: 'trial', transactionId,
          messages: [
            {
              role: 'system',
              content: `${WORLD_BIBLE}\n这是完全隔离的模型试炼，不含任何玩家存档。用一小段场景展示逻辑、对白和推进能力。`
            },
            {
              role: 'user',
              content: `试炼题目：${cleanText(trial, 300)}。固定状态：炼气二层、青石镇、黄昏、正在追查失踪药师。`
            }
          ]
        });
        const parsed = narrationFrom(raw, 'trial');
        const progressPassed = Array.isArray(parsed.progress?.advanced) && parsed.progress.advanced.length > 0;
        return {
          output: raw,
          latencyMs: Math.max(0, now() - startedAt),
          parsePassed: true,
          progressPassed,
          repetitionScore: repetitionScore(parsed.blocks.map((block) => block.text).join(''))
        };
      } catch (error) {
        return {
          output: raw,
          error: cleanText(error?.message || error, 600),
          latencyMs: Math.max(0, now() - startedAt),
          parsePassed: false,
          progressPassed: false,
          repetitionScore: repetitionScore(raw)
        };
      }
    }
  };
}

import { migrateGameState } from './game-state.js';
import { parseNarration, PROVIDERS } from './ai-client.js';
import {
  buildRepairMessages, commitValidatedWorldTurn, createSceneContract, validateAiWorldTurn
} from './director.js';
import {
  applyMemoryCandidates, registerEntityCandidates, selectRelevantMemory, updateChapterSummary
} from './memory.js';
import { applyCommittedDiscoveries } from './discovery.js';
import { answerSystemQuery } from './turn-router.js';
import { LOCATIONS } from './game-data.js';

const WORLD_BIBLE = `你是中文修仙文字游戏《落樱仙途》的唯一叙事作者。本回合绝不能使用本地预写剧情作后备。
规则：
1. 严格遵守场景契约、已知事实、死亡状态、地点和数值上限。
2. 所有 narr 旁白必须使用主角第一人称“我”，绝不能以“你、主角、玩家”称呼主角。只写我亲眼所见、亲耳所闻、身体感受及有依据的推断；不得切换到场外角色的内心、秘密行动或全知视角。
3. 逐字尊重玩家原话。不得替我新增对白、承诺、选择、立场、感情或未输入的关键动作；玩家未决定的事必须停在可选择处。
4. 普通世界回合应有约 260–700 个中文字，用具体场面依次展现“我的行动发生 → 环境或 NPC 反应 → 明确结果 → 新线索、代价或局势推进”，不得摘要带过、复述、拖延或绕圈。
5. 每回合必须产生可验证的新事实、数值/关系/地点变化、危险时钟变化、新开/解决的悬念或章节/任务进展；不能只填写装饰性的 scene 标签。
6. 灵气用于境界突破；灵力用于功法消耗，两者绝不混用。场景契约 player 内的 qi、spirit 与上限是绝对事实；正文若提到当前数值或充盈/耗尽状态，必须与它完全一致。qi、spirit、hp、effects、progress 等 JSON 字段只用于结构，绝不能出现在玩家可见正文，正文统一写“灵气、灵力、气血”等中文术语。
7. NPC 只能引用其 knownFactIds 中的事实；新角色和地点必须提供稳定 generated: ID、目的与归属地点。
8. 每段已登记 NPC 对白都要在该 dlg 块的 factIds 列出至少一项实际引用的 knownFactIds；日常对白可引用其 fact:authored:...:identity 固定身份事实，绝不能空引用。usedFactIdsByActor 同时给出角色汇总，其键优先使用 actors 中的精确 id（兼容 name），不得自创 actor: 前缀。NPC 可在 dlg 对白中用“你”称呼我。
9. 任务只允许按场景契约 activeQuests 操作：questProgress 只能推进本回合开始前已接取任务，completeQuests 必须同回合推进至 target，failQuests 只能失败已接取任务；addQuests 不得与推进、完成或失败同回合发生。
只输出一个严格 JSON 对象，不要代码围栏。世界回合格式：
{"blocks":[{"type":"narr","text":"旁白"},{"type":"dlg","name":"角色名","text":"对白","factIds":[]}],"effects":{"hp":0,"qi":0,"spirit":0,"gold":0,"relationships":{},"addItems":{},"addQuests":[],"location":"地点名"},"progress":{"advanced":["scene:进展ID"],"consequences":["后果"],"openLoops":["loop:悬念ID"],"resolvedLoops":[],"dangerClocks":{}},"memory":{"facts":[{"subjectId":"world:主题","predicate":"事实关系","object":"事实内容","confidence":1}],"entities":[],"chapterSummary":"可选章节摘要"},"usedFactIdsByActor":{},"timeCost":"instant|brief|scene|long"}`;

const cleanText = (value, max = 2_000) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const defaultId = () => globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function recentForPrompt(turns) {
  return turns.slice(-6).map((turn) => ({
    id: cleanText(turn.id, 100),
    kind: turn.kind,
    userText: cleanText(turn.userText, 300),
    blocks: Array.isArray(turn.blocks) ? turn.blocks.slice(-4).map((block) => ({
      type: block.type,
      ...(block.name ? { name: cleanText(block.name, 40) } : {}),
      text: cleanText(block.text, 500)
    })) : []
  }));
}

function compactContract(contract) {
  return {
    turnId: contract.turnId,
    playerInput: contract.playerInput,
    chapter: contract.chapter,
    sceneGoal: contract.sceneGoal,
    location: contract.location,
    actors: contract.actors.slice(0, 8).map((actor) => ({
      id: actor.id, name: actor.name, status: actor.status, location: actor.location,
      purpose: actor.purpose, knownFactIds: actor.knownFactIds.slice(0, 12)
    })),
    facts: contract.facts.slice(-12),
    dangerClocks: contract.dangerClocks,
    openLoopIds: contract.openLoopIds.slice(-12),
    legalItemIds: contract.legalItemIds,
    legalLocations: contract.legalLocations,
    legalQuestIds: contract.legalQuestIds,
    activeQuests: contract.activeQuests,
    legalRelationshipIds: contract.legalRelationshipIds,
    effectCaps: contract.effectCaps,
    idleLimit: contract.idleLimit,
    consecutiveIdleTurns: contract.consecutiveIdleTurns,
    pace: contract.pace,
    player: contract.player,
    questProtocol: '仅可对 activeQuests 中本回合开始已有任务使用 questProgress；completeQuests 必须同回合推进至 target，failQuests 仅可作用于已接取任务；不得在 addQuests 同回合推进、完成或失败。'
  };
}

function buildWorldMessages(contract, memoryPacket, recentTurns, requestType) {
  const openingRule = requestType === 'opening'
    ? '这是开篇：所有可见剧情文字都必须由你生成。以“我”从昏沉中恢复感知写起，让我察觉迫近危险，但停在第一个需要由我决定的行动前。progress.advanced 必须至少包含精确值 "opening:awakened"。'
    : '这是普通世界行动：逐字尊重场景契约内的 playerInput，并让它产生真实后果。';
  return [
    {
      role: 'system',
      content: cleanText(`${WORLD_BIBLE}\n${openingRule}\n场景契约：${JSON.stringify(compactContract(contract))}\n相关长期记忆：${JSON.stringify(memoryPacket)}`, 5_800)
    },
    {
      role: 'user',
      content: cleanText(`本次玩家原话：${contract.playerInput}\n最近六个回合：${JSON.stringify(recentForPrompt(recentTurns))}\n严格输出一个 JSON 对象。`, 5_800)
    }
  ];
}

function narrationFrom(raw, requestType) {
  return parseNarration(raw, requestType === 'system' ? 'system' : 'world');
}

function failure(error, input, transactionId, contract, state) {
  return {
    ok: false,
    error: cleanText(error?.message || error || 'AI 回合失败。', 600),
    retry: { input, transactionId, contract },
    ...(state ? { state } : {})
  };
}

function repetitionScore(text) {
  const normalized = cleanText(text, 20_000).replace(/\s+/g, '');
  if (normalized.length < 4) return 0;
  const grams = [];
  for (let index = 0; index < normalized.length - 2; index += 1) grams.push(normalized.slice(index, index + 3));
  return Number((1 - new Set(grams).size / Math.max(1, grams.length)).toFixed(3));
}

export function createAiTurnRunner({ aiClient, transcriptStore, stateStore, now = () => Date.now(), idFactory = defaultId } = {}) {
  if (!aiClient?.narrate) throw new Error('AI 客户端不可用。');
  if (!transcriptStore?.recentTurns || !transcriptStore?.appendTurn) throw new Error('游戏记录存储不可用。');
  if (stateStore && !stateStore.saveAuto) throw new Error('AI 原子存档组件不可用。');

  async function executeWorld({ state: source, input, settings = {}, transactionId }, requestType) {
    let contract;
    let failureState = source;
    const cleanInput = cleanText(input, 2_000);
    const txId = cleanText(transactionId || idFactory(), 100);
    try {
      let state = migrateGameState(source, 'ai');
      if (state.transactionJournal) {
        if (!stateStore?.recoverPendingTurn) throw new Error('上一回合仍待恢复，请重新读取自动存档。');
        state = await stateStore.recoverPendingTurn('ai', state, transcriptStore);
      }
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

      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const proxyRequestType = attempt > 0 ? 'repair' : requestType === 'opening' ? 'world' : requestType;
        raw = await aiClient.narrate(settings, { requestType: proxyRequestType, transactionId: txId, messages });
        try {
          narration = narrationFrom(raw, requestType);
          validation = validateAiWorldTurn(state, contract, narration, recentTurns);
        } catch (error) {
          narration = { blocks: [], raw: cleanText(raw, 12_000) };
          validation = { ok: false, errors: [error.message], fingerprint: '' };
        }
        if (validation.ok) break;
        if (attempt < 2) {
          messages = [
            ...messages,
            { role: 'assistant', content: cleanText(raw, 5_800) },
            ...buildRepairMessages(contract, narration, validation.errors)
          ];
        }
      }
      if (!validation?.ok) throw new Error(`AI 内容连续 ${maxAttempts} 次未通过验证：${validation?.errors?.join('；') || '未知结构错误'}`);

      let committed = commitValidatedWorldTurn(state, contract, narration);
      const visibleNames = new Set((narration.blocks || [])
        .filter((block) => block?.type === 'dlg' && Array.isArray(block.factIds))
        .map((block) => String(block.name || '').trim()).filter(Boolean));
      const visibleEntityIds = (narration.memory?.entities || [])
        .filter((entity) => visibleNames.has(String(entity?.name || '').trim()))
        .map((entity) => entity.id);
      committed = registerEntityCandidates(committed, narration.memory?.entities || [], txId, { visibleEntityIds });
      committed = applyMemoryCandidates(committed, narration.memory?.facts || [], txId);
      committed = applyCommittedDiscoveries(committed, narration);
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
        fingerprint: validation.fingerprint,
        createdAt: new Date(now()).toISOString()
      };
      if (stateStore) {
        try {
          let journaled = migrateGameState({
            ...committed,
            transactionJournal: { type: 'ai-world-turn', turn }
          }, 'ai');
          if (stateStore.saveAutoIfJourney) {
            journaled = await stateStore.saveAutoIfJourney('ai', journaled, state.journeyId, state.revision);
          } else journaled = stateStore.saveAuto('ai', journaled) || journaled;
          let transcriptAppended = false;
          try {
            await transcriptStore.appendTurn(committed.journeyId, turn);
            transcriptAppended = true;
            committed = migrateGameState({ ...journaled, transactionJournal: null }, 'ai');
            if (stateStore.saveAutoIfJourney) {
              try {
                committed = await stateStore.saveAutoIfJourney(
                  'ai', committed, state.journeyId, journaled.revision, txId
                );
              } catch (error) {
                if (!transcriptStore.deleteTurn) throw new Error('自动存档冲突后无法补偿本回合记录。');
                await transcriptStore.deleteTurn(committed.journeyId, turn.id);
                const authoritative = stateStore.loadAuto?.('ai');
                failureState = authoritative || journaled;
                const journal = authoritative?.transactionJournal;
                if (stateStore.saveAutoIfJourney
                  && authoritative?.journeyId === state.journeyId
                  && journal?.type === 'ai-world-turn'
                  && journal.turn?.id === turn.id) {
                  try {
                    failureState = await stateStore.saveAutoIfJourney(
                      'ai', migrateGameState({ ...authoritative, transactionJournal: null }, 'ai'),
                      authoritative.journeyId, authoritative.revision, turn.id
                    );
                  } catch {
                    failureState = stateStore.loadAuto?.('ai') || authoritative;
                  }
                }
                throw error;
              }
            } else committed = stateStore.saveAuto('ai', committed) || committed;
          } catch (error) {
            if (transcriptAppended) throw error;
            committed = journaled;
          }
        } catch (error) {
          throw error;
        }
      } else await transcriptStore.appendTurn(committed.journeyId, turn);
      return { ok: true, state: committed, blocks: narration.blocks, turn };
    } catch (error) {
      return failure(error, cleanInput, txId, contract, failureState);
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
        return { ok: true, state, blocks: answer.blocks, turn };
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

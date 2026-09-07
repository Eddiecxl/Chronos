import { migrateGameState } from './game-state.js';
import { parseNarration, PROVIDERS } from './ai-client.js';
import {
  buildRepairMessages, commitValidatedWorldTurn, createSceneContract, validateAiWorldTurn
} from './director.js';
import {
  applyMemoryCandidates, registerEntityCandidates, selectRelevantMemory, updateChapterSummary
} from './memory.js';
import { applyCommittedDiscoveries, chapterSummaryFromVisibleBlocks, storyVisibleTextFor, hasVisibleFactEvidence } from './discovery.js';
import { answerSystemQuery } from './turn-router.js';
import { LOCATIONS } from './game-data.js';
import { modelNarrativeProfile, throwIfCancelled } from './ai-policy.js';

const WORLD_BIBLE = `你是中文修仙文字游戏《落樱仙途》的唯一叙事作者。本回合绝不能使用本地预写剧情作后备。
规则：
1. 严格遵守场景契约、已知事实、死亡状态、地点和数值上限。
2. 所有 narr 旁白必须使用主角第一人称“我”，绝不能以“你、主角、玩家”称呼主角。只写我亲眼所见、亲耳所闻、身体感受及有依据的推断；不得切换到场外角色的内心、秘密行动或全知视角。
3. 逐字尊重玩家原话。不得替我新增对白、承诺、选择、立场、感情或未输入的关键动作；玩家未决定的事必须停在可行动的当下。不要列出选项或问“选择哪个”，玩家只自由输入。不得编造我在开篇前炼丹、服药、许诺或修炼等既往经历。
4. 普通世界回合应有约 260–700 个中文字，用具体场面依次展现“我的行动发生 → 环境或 NPC 反应 → 明确结果 → 新线索、代价或局势推进”，不得摘要带过、复述、拖延或绕圈。
5. 每回合必须产生可验证的新事实、数值/关系/地点变化、危险时钟变化、新开/解决的悬念或章节/任务进展；不能只填写装饰性的 scene 标签。
6. 灵气用于境界突破；灵力用于功法消耗，两者绝不混用。场景契约 player 内的 qi、spirit 与上限是绝对事实；正文若提到当前数值或充盈/耗尽状态，必须与它完全一致。qi、spirit、hp、effects、progress 等 JSON 字段只用于结构，绝不能出现在玩家可见正文，正文统一写“灵气、灵力、气血”等中文术语。
7. NPC 只能引用其 knownFactIds 中的事实；新角色和地点必须提供稳定 generated: ID、目的与归属地点。
8. 每段已登记 NPC 对白都要在该 dlg 块的 factIds 列出至少一项实际引用的 knownFactIds；日常对白可引用其 fact:authored:...:identity 固定身份事实，绝不能空引用。usedFactIdsByActor 同时给出角色汇总，其键优先使用 actors 中的精确 id（兼容 name），不得自创 actor: 前缀。NPC 可在 dlg 对白中用“你”称呼我。
9. 任务只允许按场景契约 activeQuests 操作：questProgress 只能推进本回合开始前已接取任务，completeQuests 必须同回合推进至 target，failQuests 只能失败已接取任务；addQuests 不得与推进、完成或失败同回合发生。
10. 提交章节出口时，effects 必须包含一个合法且具体的地点或任务效果目标；玩家本回合原话必须明确肯定并写出同一个目标。仅有出口标记、空 effects、含糊“继续观察”或拒绝目标都不得跳章。chapter.exits 的 targetLocation 是可用于出口的合法目的地。
11. 每次聚焦一个有因果的场面，不跳过谈判、追查或关键行动。NPC 的措辞、迟疑和小动作体现各自目的，不用旁白替他们解释全部。反转必须承接已见线索和动机，不能每回合凭空出现敌人。旧悬念要有兑现，推进以新证据、选择的代价或关系变化自然发生；没有玩家决定不得跨章。记忆只记正文已出现的事实，object 尽量逐字摘取正文，既有事实不重复写入。
只输出一个严格 JSON 对象，不要代码围栏。世界回合格式：
{"blocks":[{"type":"narr","text":"旁白"},{"type":"dlg","name":"角色名","text":"对白","factIds":[]}],"effects":{"hp":0,"qi":0,"spirit":0,"gold":0,"relationships":{},"addItems":{},"addQuests":[],"location":"地点名"},"progress":{"advanced":["scene:进展ID"],"consequences":["后果"],"openLoops":["loop:悬念ID"],"resolvedLoops":[],"dangerClocks":{}},"memory":{"facts":[{"subjectId":"world:主题","predicate":"事实关系","object":"事实内容","confidence":1}],"entities":[],"chapterSummary":"可选章节摘要"},"usedFactIdsByActor":{},"timeCost":"instant|brief|scene|long"}`;

const cleanText = (value, max = 2_000) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const defaultId = () => globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function recentForPrompt(turns, { limit = 4, textLimit = 500, inputLimit = 300 } = {}) {
  return turns.filter((turn) => turn.kind !== 'system').slice(-limit).map((turn) => ({
    id: cleanText(turn.id, 100),
    kind: turn.kind,
    userText: cleanText(turn.userText, inputLimit),
    blocks: Array.isArray(turn.blocks) ? turn.blocks.slice(-4).map((block) => ({
      type: block.type,
      ...(block.name ? { name: cleanText(block.name, 40) } : {}),
      text: cleanText(block.text, textLimit)
    })) : []
  }));
}

function compactQwenContract(contract) {
  return {
    now: [contract.time.day, contract.time.period, contract.location.name],
    player: {
      name: contract.player.name, realm: contract.player.realm,
      hp: `${contract.player.hp}/${contract.player.maxHp}`,
      qi: contract.player.qi, spirit: `${contract.player.spirit}/${contract.player.maxSpirit}`
    },
    chapter: { id: contract.chapter.id, goal: contract.sceneGoal },
    actors: contract.actors.slice(0, 4).map((actor) => ({
      id: actor.id, name: actor.name, status: actor.status, purpose: actor.purpose,
      facts: actor.knownFactIds.slice(0, 4)
    })),
    facts: contract.facts.slice(-8).map((fact) => ({ id: fact.id, subjectId: fact.subjectId, object: fact.object })),
    threads: {
      clocks: contract.dangerClocks, loops: contract.openLoopIds.slice(-5),
      quests: contract.activeQuests, destinations: contract.legalLocations.slice(0, 5).map((entry) => entry.name)
    }
  };
}

function compactQwenMemory(packet) {
  const summary = Object.values(packet?.chapterSummaries || {}).join(' ').slice(-360);
  const facts = Array.isArray(packet?.facts) ? packet.facts.slice(0, 6).map((fact) => ({
    id: fact.id, subjectId: fact.subjectId, object: cleanText(fact.object, 100)
  })) : [];
  return { ...(summary ? { summary } : {}), facts };
}

function buildQwenMessages(contract, memoryPacket, recentTurns, requestType) {
  const opening = requestType === 'opening';
  const recent = recentForPrompt(recentTurns, { limit: 1, textLimit: 260, inputLimit: 160 });
  const jsonShape = '{"blocks":[{"type":"narr","text":"正文"}],"effects":{},"progress":{"advanced":["scene:进展"],"consequences":["实际后果"],"openLoops":[],"resolvedLoops":[],"dangerClocks":{}},"memory":{"facts":[],"entities":[]},"timeCost":"brief"}';
  const system = `你是《落樱仙途》的中文互动叙事作者。旁白固定第三人称：主角只能写“${contract.player.name}”或“他”，不可称“你、主角、玩家”，也不可写他人的内心或场外秘密。玩家原话是主角刚做的唯一行动；不得替他新增关键对白、承诺、选择、立场或感情。写一个180–320字的具体当下场面：行动→反应→结果→可继续的压力或线索。不要列选项，不要总结跳过过程。灵气用于突破，灵力用于功法。只输出一个 JSON 对象，不要代码块，也不可省略任何顶层字段。必须按这个形状填入真实内容：${jsonShape}。每回合必须有一个实际进展和具体后果；memory.facts 只写正文中直接出现的新证据。${opening ? '这是开篇：写他在赵府柴房苏醒，停在第一个可行动的危险前；progress.advanced 必须为 ["opening:awakened"]。' : ''}`;
  const user = `状态=${JSON.stringify(compactQwenContract(contract))}\n记忆=${JSON.stringify(compactQwenMemory(memoryPacket))}\n最近=${JSON.stringify(recent)}\n行动=${contract.playerInput}\n仅输出 JSON。`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function compactContract(contract) {
  return {
    turnId: contract.turnId,
    playerInput: contract.playerInput,
    chapter: contract.chapter,
    sceneGoal: contract.sceneGoal,
    time: contract.time,
    location: contract.location,
    actors: contract.actors.slice(0, 8).map((actor) => ({
      id: actor.id, name: actor.name, status: actor.status, location: actor.location,
      purpose: actor.purpose, knownFactIds: actor.knownFactIds.slice(0, 12)
    })),
    facts: contract.facts.filter((fact) => contract.actors.some((actor) => actor.knownFactIds.includes(fact.id))).slice(-16),
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

function buildWorldMessages(contract, memoryPacket, recentTurns, requestType, profile) {
  if (profile.compactContext) return buildQwenMessages(contract, memoryPacket, recentTurns, requestType);
  const openingRule = requestType === 'opening'
    ? '这是开篇：所有可见剧情文字都必须由你生成。以“我”从昏沉中恢复感知写起，让我察觉迫近危险，但停在第一个需要由我决定的行动前。progress.advanced 必须至少包含精确值 "opening:awakened"。'
    : '这是普通世界行动：逐字尊重场景契约内的 playerInput，并让它产生真实后果。';
  const { actors, facts, playerInput, ...core } = compactContract(contract);
  const recent = recentForPrompt(recentTurns);
  while (JSON.stringify(recent).length > 3500 && recent.length > 1) recent.shift();
  // Keep JSON sections complete: substring truncation used to cut off memory and rules mid-object.
  const messages = [
    { role: 'system', content: `${WORLD_BIBLE}\n${openingRule}` },
    { role: 'system', content: `场景契约：${JSON.stringify(core)}` },
    { role: 'system', content: `在场人物及其可引用事实：${JSON.stringify({ actors, facts })}` },
    { role: 'system', content: `相关长期记忆：${JSON.stringify(memoryPacket)}` },
    { role: 'user', content: `最近世界回合：${JSON.stringify(recent)}\n本次玩家原话：${playerInput}\n写出一个完整的当下场面，旁白约260–500字，遵守当前时段，不提前替我选下一步。${requestType === 'opening' ? '开篇的 progress.advanced 必须为 ["opening:awakened"]。' : 'progress.advanced 至少一个以 discovery:、scene:、quest: 或 danger: 开头的字符串；progress.consequences 至少一个本次行动实际造成的后果；memory.facts 记录1–3条正文中逐字可见的新证据，object 直接摘抄正文。'}无变化字段用空对象或空数组。只输出严格 JSON，使用英文键名 blocks、effects、progress、memory、timeCost，不可翻译键名。` }
  ];
  if (messages.some((message) => message.content.length > 5800)) throw new Error('本回合上下文过大，请缩短输入后重试。');
  return messages;
}

function narrationFrom(raw, requestType) {
  return parseNarration(raw, requestType === 'system' ? 'system' : 'world');
}

function failure(error, input, transactionId, contract, state) {
  return {
    ok: false,
    error: cleanText(error?.message || error || 'AI 回合失败。', 600),
    code: error?.code || 'AI_TURN_FAILED',
    ...(error?.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
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

  async function executeWorld({ state: source, input, settings = {}, transactionId, signal, onProgress = () => {} }, requestType) {
    let contract;
    let failureState = source;
    const cleanInput = cleanText(input, 2_000);
    const txId = cleanText(transactionId || idFactory(), 100);
    try {
      throwIfCancelled(signal);
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
      // Callers outside the game shell may intentionally omit a model.  Keep
      // the historic first-person contract for those calls; the persisted game
      // settings always supply Qwen explicitly after normalization.
      const profile = modelNarrativeProfile(settings.provider || 'groq', settings.model || '');
      let messages = buildWorldMessages(contract, memoryPacket, recentTurns, requestType, profile);
      let narration;
      let validation;
      let raw = '';

      const maxAttempts = profile.maxAttempts;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        throwIfCancelled(signal);
        onProgress(attempt ? 'repair' : 'generating', attempt ? { errors: validation?.errors, candidate: narration } : {});
        const proxyRequestType = attempt > 0 ? 'repair' : requestType === 'opening' ? 'world' : requestType;
        raw = await aiClient.narrate(settings, { requestType: proxyRequestType, transactionId: txId, messages, signal });
        throwIfCancelled(signal);
        onProgress('validating');
        try {
          narration = narrationFrom(raw, requestType);
          validation = validateAiWorldTurn(state, contract, narration, recentTurns, { narrativePerspective: profile.perspective });
          // Optional bookkeeping must not trigger another generation when the
          // story itself is valid. Never invent substitute text or facts, and
          // never suppress discovery, agency, state, or progression errors.
          if (!validation.ok && validation.errors.length && validation.errors.every(error =>
            /^世界记忆事实 world:.+ 缺少本回合可见正文的直接证据。$/u.test(error))) {
            const visible = storyVisibleTextFor(narration);
            const grounded = { ...narration, memory: { ...narration.memory,
              facts: narration.memory.facts.filter(fact => !fact.subjectId.startsWith('world:') || hasVisibleFactEvidence(fact, visible)) } };
            const checked = validateAiWorldTurn(state, contract, grounded, recentTurns, { narrativePerspective: profile.perspective });
            if (checked.ok) { narration = grounded; validation = checked; }
          }
        } catch (error) {
          narration = { blocks: [], raw: cleanText(raw, 12_000) };
          validation = { ok: false, errors: [error.message], fingerprint: '' };
        }
        if (validation.ok) break;
        if (attempt < maxAttempts - 1) {
          messages = [
            ...messages,
            ...buildRepairMessages(contract, narration, validation.errors)
          ];
        }
      }
      if (!validation?.ok) throw Object.assign(new Error(`AI 剧情未通过因果校验（不是网络限流）：${validation?.errors?.join('；') || '未知结构错误'}`), { code: 'AI_NARRATIVE_INVALID' });
      throwIfCancelled(signal);
      onProgress('saving');

      let committed = commitValidatedWorldTurn(state, contract, narration, { narrativePerspective: profile.perspective });
      const visibleText = storyVisibleTextFor(narration);
      const visibleEntityIds = (narration.memory?.entities || [])
        .filter((entity) => visibleText.includes(String(entity?.name || '').trim()))
        .map((entity) => entity.id);
      committed = registerEntityCandidates(committed, narration.memory?.entities || [], txId, { visibleEntityIds });
      committed = applyMemoryCandidates(committed, narration.memory?.facts || [], txId, {
        visibleText,
        visibleSubjectIds: visibleEntityIds,
        movedLocationIds: committed.story.location === state.story.location ? [] : [LOCATIONS[committed.story.location]?.id],
        positiveItems: Object.entries(validation.normalizedEffects?.addItems || {})
          .filter(([, amount]) => Number(amount) > 0).map(([name]) => name),
        acceptedQuestIds: validation.normalizedEffects?.addQuests || []
      });
      committed = applyCommittedDiscoveries(committed, narration);
      committed = updateChapterSummary(committed, contract.chapter.id, chapterSummaryFromVisibleBlocks(narration));

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
    async runOpening({ state, settings = {}, transactionId, signal, onProgress } = {}) {
      return executeWorld({
        state,
        input: '生成旅程开篇：主角刚在赵府柴房醒来，等待玩家作出第一个行动。',
        settings,
        transactionId, signal, onProgress
      }, 'opening');
    },
    async runWorld({ state, input, settings = {}, transactionId, signal, onProgress } = {}) {
      if (!cleanText(input)) return failure('请输入行动。', '', cleanText(transactionId || idFactory(), 100), undefined);
      return executeWorld({ state, input, settings, transactionId, signal, onProgress }, 'world');
    },
    async runSystem({ state, input, settings = {}, transactionId, signal } = {}) {
      const txId = cleanText(transactionId || idFactory(), 100);
      const cleanInput = cleanText(input, 2_000);
      try {
        throwIfCancelled(signal);
        migrateGameState(state, state.mode);
        let answer = answerSystemQuery(state, cleanInput);
        if (!answer.handled) {
          const raw = await aiClient.narrate(settings, {
            requestType: 'system', transactionId: txId, signal,
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
        throwIfCancelled(signal);
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

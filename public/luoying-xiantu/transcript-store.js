const DATABASE_NAME = 'luoying-xiantu-v3';
const DATABASE_VERSION = 1;
const STORE_NAME = 'turns';
const MAX_TURN_BYTES = 100_000;
const MAX_IMPORT_BYTES = 4_000_000;

const cleanText = (value, max) => String(value ?? '').replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const cleanId = (value, max = 100) => cleanText(value, max).replace(/[^\p{L}\p{N}_.:/\-]/gu, '');

function jsonSize(value) {
  const raw = JSON.stringify(value);
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(raw).length : raw.length;
}

function sanitizeBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const type = ['narr', 'dlg', 'sys'].includes(block.type) ? block.type : null;
  const text = cleanText(block.text, 12_000);
  if (!type || !text) return null;
  if (type === 'dlg') return { type, name: cleanText(block.name, 40) || '无名之人', text };
  return { type, text };
}

function sanitizeTurn(turn) {
  if (!turn || typeof turn !== 'object') throw new Error('记录格式无效。');
  if (jsonSize(turn) > MAX_TURN_BYTES) throw new Error('单回合记录过大。');
  const id = cleanId(turn.id);
  if (!id) throw new Error('记录缺少回合编号。');
  const blocks = Array.isArray(turn.blocks) ? turn.blocks.map(sanitizeBlock).filter(Boolean).slice(0, 100) : [];
  if (!blocks.length) throw new Error('记录缺少有效内容。');
  const output = {
    id,
    kind: ['world', 'system'].includes(turn.kind) ? turn.kind : 'world',
    blocks
  };
  const userText = cleanText(turn.userText ?? turn.input, 2_000);
  const provider = cleanText(turn.provider, 40);
  const model = cleanText(turn.model, 100);
  const createdAt = cleanText(turn.createdAt, 40);
  if (userText) output.userText = userText;
  if (provider) output.provider = provider;
  if (model) output.model = model;
  if (createdAt) output.createdAt = createdAt;
  if (Array.isArray(turn.suggestions)) output.suggestions = turn.suggestions.map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 8);
  if (jsonSize(output) > MAX_TURN_BYTES) throw new Error('单回合记录过大。');
  return output;
}

function sanitizeImport(turns) {
  if (!Array.isArray(turns)) throw new Error('记录档案格式无效。');
  if (jsonSize(turns) > MAX_IMPORT_BYTES) throw new Error('记录档案过大。');
  return turns.map(sanitizeTurn);
}

function publicTurn(record) {
  const { key: _key, journeyId: _journeyId, order: _order, ...turn } = record;
  return structuredClone(turn);
}

function createMemoryAdapter(memory) {
  let order = 0;
  return {
    async appendTurn(journeyId, turn) {
      const cleanJourneyId = cleanId(journeyId);
      if (!cleanJourneyId) throw new Error('旅程编号无效。');
      const clean = sanitizeTurn(turn);
      const key = `${cleanJourneyId}:${clean.id}`;
      memory.set(key, { key, journeyId: cleanJourneyId, order: ++order, ...clean });
      return publicTurn(memory.get(key));
    },
    async recentTurns(journeyId, limit = 12) {
      const all = await this.allTurns(journeyId);
      return all.slice(-Math.max(0, Math.min(100, Number(limit) || 0)));
    },
    async allTurns(journeyId) {
      const cleanJourneyId = cleanId(journeyId);
      return [...memory.values()]
        .filter((record) => record.journeyId === cleanJourneyId)
        .sort((left, right) => left.order - right.order)
        .map(publicTurn);
    },
    async importTurns(journeyId, turns) {
      const cleanJourneyId = cleanId(journeyId);
      if (!cleanJourneyId) throw new Error('旅程编号无效。');
      const cleanTurns = sanitizeImport(turns);
      for (const turn of cleanTurns) {
        const key = `${cleanJourneyId}:${turn.id}`;
        memory.set(key, { key, journeyId: cleanJourneyId, order: ++order, ...turn });
      }
      return cleanTurns.length;
    },
    async deleteJourney(journeyId) {
      const cleanJourneyId = cleanId(journeyId);
      for (const [key, record] of memory.entries()) if (record.journeyId === cleanJourneyId) memory.delete(key);
    }
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败。'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败。'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务已取消。'));
  });
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      if (!store.indexNames.contains('journeyId')) store.createIndex('journeyId', 'journeyId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开游戏记录数据库。'));
  });
}

function createIndexedDbAdapter(indexedDB) {
  let sequence = 0;
  const nextOrder = () => Date.now() * 1000 + (++sequence % 1000);
  const recordsForJourney = async (journeyId) => {
    const database = await openDatabase(indexedDB);
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index('journeyId').getAll(cleanId(journeyId));
    const records = await requestResult(request);
    await transactionDone(transaction);
    database.close();
    return records.sort((left, right) => left.order - right.order);
  };
  return {
    async appendTurn(journeyId, turn) {
      const cleanJourneyId = cleanId(journeyId);
      if (!cleanJourneyId) throw new Error('旅程编号无效。');
      const clean = sanitizeTurn(turn);
      const record = { key: `${cleanJourneyId}:${clean.id}`, journeyId: cleanJourneyId, order: nextOrder(), ...clean };
      const database = await openDatabase(indexedDB);
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      await transactionDone(transaction);
      database.close();
      return publicTurn(record);
    },
    async recentTurns(journeyId, limit = 12) {
      const all = await this.allTurns(journeyId);
      return all.slice(-Math.max(0, Math.min(100, Number(limit) || 0)));
    },
    async allTurns(journeyId) {
      return (await recordsForJourney(journeyId)).map(publicTurn);
    },
    async importTurns(journeyId, turns) {
      const cleanJourneyId = cleanId(journeyId);
      if (!cleanJourneyId) throw new Error('旅程编号无效。');
      const cleanTurns = sanitizeImport(turns);
      const database = await openDatabase(indexedDB);
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const turn of cleanTurns) {
        store.put({ key: `${cleanJourneyId}:${turn.id}`, journeyId: cleanJourneyId, order: nextOrder(), ...turn });
      }
      await transactionDone(transaction);
      database.close();
      return cleanTurns.length;
    },
    async deleteJourney(journeyId) {
      const records = await recordsForJourney(journeyId);
      if (!records.length) return;
      const database = await openDatabase(indexedDB);
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const record of records) store.delete(record.key);
      await transactionDone(transaction);
      database.close();
    }
  };
}

export function createTranscriptStore(options = {}) {
  if (options.memory instanceof Map) return createMemoryAdapter(options.memory);
  const indexedDB = options.indexedDB ?? globalThis.indexedDB;
  if (indexedDB) return createIndexedDbAdapter(indexedDB);
  return createMemoryAdapter(new Map());
}

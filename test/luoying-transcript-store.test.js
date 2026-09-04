import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptStore } from '../public/luoying-xiantu/transcript-store.js';

test('transcripts are isolated by journey id and retain exact blocks', async () => {
  const store = createTranscriptStore({ memory: new Map() });
  await store.appendTurn('ai-one', { id: 't1', kind: 'world', blocks: [{ type: 'dlg', name: '林小满', text: '走。' }] });
  await store.appendTurn('ai-two', { id: 't2', kind: 'world', blocks: [{ type: 'narr', text: '风起。' }] });
  assert.equal((await store.allTurns('ai-one')).length, 1);
  assert.equal((await store.allTurns('ai-one'))[0].blocks[0].name, '林小满');
});

test('recent turns preserve append order and duplicate ids replace in place', async () => {
  const store = createTranscriptStore({ memory: new Map() });
  await store.appendTurn('journey', { id: 't1', kind: 'world', blocks: [{ type: 'narr', text: '一' }] });
  await store.appendTurn('journey', { id: 't2', kind: 'system', blocks: [{ type: 'sys', text: '二' }] });
  await store.appendTurn('journey', { id: 't1', kind: 'world', blocks: [{ type: 'narr', text: '一（修订）' }] });
  const turns = await store.recentTurns('journey', 2);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].id, 't2');
  assert.equal(turns[1].blocks[0].text, '一（修订）');
});

test('imports validate every turn before changing an archive', async () => {
  const store = createTranscriptStore({ memory: new Map() });
  await store.appendTurn('journey', { id: 'safe', kind: 'world', blocks: [{ type: 'narr', text: '原文' }] });
  await assert.rejects(
    store.importTurns('journey', [{ id: 'huge', kind: 'world', blocks: [{ type: 'narr', text: 'x'.repeat(101_000) }] }]),
    /过大/
  );
  assert.equal((await store.allTurns('journey'))[0].id, 'safe');
});

test('deleteJourney removes only the selected archive', async () => {
  const store = createTranscriptStore({ memory: new Map() });
  await store.appendTurn('one', { id: 't1', kind: 'world', blocks: [{ type: 'narr', text: '一' }] });
  await store.appendTurn('two', { id: 't2', kind: 'world', blocks: [{ type: 'narr', text: '二' }] });
  await store.deleteJourney('one');
  assert.deepEqual(await store.allTurns('one'), []);
  assert.equal((await store.allTurns('two')).length, 1);
});

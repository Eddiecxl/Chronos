import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Chronos game host loads the same-origin cultivation game', async () => {
  const source = await readFile(new URL('../src/ChronosRiftGame.jsx', import.meta.url), 'utf8');
  assert.match(source, /src="\/luoying-xiantu\/index\.html"/);
  assert.match(source, /title="落樱仙途"/);
  assert.doesNotMatch(source, /requestAnimationFrame|Chronos Rift/);
});

test('game host grants no extra browser permissions', async () => {
  const source = await readFile(new URL('../src/ChronosRiftGame.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\ballow=/);
  assert.match(source, /referrerPolicy="same-origin"/);
});

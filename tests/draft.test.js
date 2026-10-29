import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDraft, addRequirement, addCompetency, addQuestion,
  serialiseDraft, parseDraft, saveToStorage, loadFromStorage, SCHEMA_VERSION,
} from '../src/lib/draft.js';

function fullDraft() {
  let draft = createDraft();
  draft.title = 'Represent drone flight logs';
  draft.background.need = 'Drone flight logs';
  draft = addRequirement(draft, 'Represent a flight log');
  draft = addCompetency(draft, 'A drone was seized');
  draft = addQuestion(draft, draft.competencies[0].id, 'Where did it fly?', 'Over the park.');
  draft.related = [{ iri: 'x:1', compactIri: 'uco-observable:Device', label: 'Device', group: 'UCO', tier: 'core', type: 'class' }];
  draft.destination = 'casework/CASE';
  return draft;
}

test('saving and loading a draft gives an equal object', () => {
  const draft = fullDraft();
  const result = parseDraft(serialiseDraft(draft));
  assert.equal(result.ok, true);
  assert.deepEqual(result.draft, draft);
});

test('invalid JSON is rejected with a message', () => {
  const result = parseDraft('{not json');
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/i);
});

test('a file without schemaVersion is rejected', () => {
  const { schemaVersion, ...rest } = fullDraft();
  const result = parseDraft(JSON.stringify(rest));
  assert.equal(result.ok, false);
  assert.match(result.error, /schemaVersion/);
});

test('a newer schemaVersion is rejected', () => {
  const result = parseDraft(JSON.stringify({ ...fullDraft(), schemaVersion: SCHEMA_VERSION + 1 }));
  assert.equal(result.ok, false);
});

test('wrong field types are rejected, naming the field', () => {
  const result = parseDraft(JSON.stringify({ ...fullDraft(), requirements: 'not a list' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /requirements/);
});

test('an unknown destination is rejected', () => {
  const result = parseDraft(JSON.stringify({ ...fullDraft(), destination: 'someone/else' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /destination/);
});

test('missing optional fields are filled with defaults', () => {
  const result = parseDraft(JSON.stringify({ schemaVersion: SCHEMA_VERSION, title: 'Only a title' }));
  assert.equal(result.ok, true);
  assert.equal(result.draft.title, 'Only a title');
  assert.deepEqual(result.draft.requirements, []);
  assert.equal(result.draft.destination, 'ucoProject/UCO');
});

test('autosave round-trips through storage', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const draft = fullDraft();
  assert.equal(saveToStorage(storage, draft), true);
  assert.deepEqual(loadFromStorage(storage), draft);
});

test('storage that throws does not break saving or loading', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(saveToStorage(storage, fullDraft()), false);
  assert.equal(loadFromStorage(storage), null);
  assert.equal(loadFromStorage(undefined), null);
});

test('a corrupt autosave is ignored', () => {
  const storage = { getItem: () => '{broken', setItem() {} };
  assert.equal(loadFromStorage(storage), null);
});

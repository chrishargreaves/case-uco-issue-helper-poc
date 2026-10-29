import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestDestination, REPOSITORIES } from '../src/lib/destination.js';

const concept = (repo, n) => ({ iri: `x:${repo}${n}`, compactIri: `x:${n}`, tier: 'core', repo });
const uco = n => concept('ucoProject/UCO', n);
const caseC = n => concept('casework/CASE', n);
const extension = n => ({ iri: `x:ext${n}`, compactIri: `x:ext${n}`, tier: 'extension', group: 'CAC' });

test('with nothing marked and no results, UCO is suggested by default', () => {
  const s = suggestDestination({ marked: [], results: [] });
  assert.equal(s.repo, 'ucoProject/UCO');
  assert.equal(s.basis, 'default');
  assert.ok(s.reason.length > 0);
});

test('mostly CASE marked concepts suggest CASE', () => {
  const s = suggestDestination({ marked: [caseC(1), caseC(2), caseC(3), uco(1)], results: [] });
  assert.equal(s.repo, 'casework/CASE');
  assert.equal(s.basis, 'marked');
  assert.match(s.reason, /3 of 4/);
});

test('an even split stays with UCO', () => {
  const s = suggestDestination({ marked: [caseC(1), caseC(2), uco(1), uco(2)], results: [] });
  assert.equal(s.repo, 'ucoProject/UCO');
});

test('extension concepts alone do not change the destination', () => {
  const s = suggestDestination({ marked: [extension(1), extension(2)], results: [] });
  assert.equal(s.repo, 'ucoProject/UCO');
  assert.equal(s.basis, 'default');
});

test('with nothing marked, the top five core search results decide', () => {
  const results = [caseC(1), caseC(2), caseC(3), uco(1), uco(2), uco(3), uco(4)];
  const s = suggestDestination({ marked: [], results });
  assert.equal(s.repo, 'casework/CASE');
  assert.equal(s.basis, 'results');
});

test('both repositories have a plain-language description', () => {
  for (const repo of ['ucoProject/UCO', 'casework/CASE']) {
    assert.ok(REPOSITORIES[repo].name);
    assert.ok(REPOSITORIES[repo].covers.length > 20);
  }
});

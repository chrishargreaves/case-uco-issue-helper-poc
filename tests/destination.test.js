import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestDestination, describeDestination, REPOSITORIES } from '../src/lib/destination.js';

const concept = (repo, n) => ({ iri: `x:${repo}${n}`, compactIri: `x:${n}`, tier: 'core', repo });
const uco = n => concept('ucoProject/UCO', n);
const caseC = n => concept('casework/CASE', n);
const extension = n => ({ iri: `x:ext${n}`, compactIri: `x:ext${n}`, tier: 'extension', group: 'CAC' });

test('with nothing marked and no results, UCO is suggested by default', () => {
  const s = suggestDestination({ marked: [], results: [] });
  assert.equal(s.repo, 'ucoProject/UCO');
  assert.equal(s.basis, 'default');
  assert.equal(s.reason, 'the default for new concepts');
});

test('mostly CASE marked concepts suggest CASE', () => {
  const s = suggestDestination({ marked: [caseC(1), caseC(2), caseC(3), uco(1)], results: [] });
  assert.equal(s.repo, 'casework/CASE');
  assert.equal(s.basis, 'marked');
  assert.equal(s.reason, 'because 3 of the 4 concepts you marked are in CASE');
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
  assert.equal(s.reason, 'because 3 of your top 5 search results are in CASE');
});

test('one marked concept, two, and more than two are each worded naturally', () => {
  assert.equal(suggestDestination({ marked: [uco(1)] }).reason, 'because the concept you marked is in UCO');
  assert.equal(suggestDestination({ marked: [caseC(1), caseC(2)] }).reason, 'because both concepts you marked are in CASE');
  assert.equal(suggestDestination({ marked: [caseC(1), caseC(2), caseC(3)] }).reason, 'because all 3 concepts you marked are in CASE');
  assert.equal(suggestDestination({ results: [uco(1)] }).reason, 'because your top search result is in UCO');
});

test('following the suggestion gives one sentence and where it will be filed', () => {
  const suggestion = suggestDestination({ marked: [uco(1)] });
  assert.equal(
    describeDestination('ucoProject/UCO', suggestion),
    'Suggested: UCO, because the concept you marked is in UCO. It will be filed in ucoProject/UCO on GitHub.',
  );
});

test('choosing against the suggestion says so before giving the suggestion', () => {
  const suggestion = suggestDestination({ marked: [uco(1)] });
  assert.equal(
    describeDestination('casework/CASE', suggestion),
    'You chose CASE. The suggestion was UCO, because the concept you marked is in UCO. It will be filed in casework/CASE on GitHub.',
  );
});

test('both repositories have a short name and a plain-language description', () => {
  for (const repo of ['ucoProject/UCO', 'casework/CASE']) {
    assert.ok(REPOSITORIES[repo].short);
    assert.ok(REPOSITORIES[repo].name);
    assert.ok(REPOSITORIES[repo].covers.length > 20);
  }
});

test('when extension concepts are also marked, the reason says only CASE/UCO ones counted', () => {
  const s = suggestDestination({ marked: [uco(1), extension(1), extension(2)] });
  assert.equal(s.reason, 'because the CASE/UCO concept you marked is in UCO');
});

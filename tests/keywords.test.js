import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseKeywords, searchText, issueSearchTerms } from '../src/lib/keywords.js';

test('keywords are split on commas, semicolons and new lines, and trimmed', () => {
  assert.deepEqual(parseKeywords(' drone, UAV;flight log\nflight path '), ['drone', 'UAV', 'flight log', 'flight path']);
});

test('empty entries and repeats (ignoring case) are dropped, keeping the first spelling', () => {
  assert.deepEqual(parseKeywords('drone,, Drone , ,UAV,uav'), ['drone', 'UAV']);
});

test('no keywords gives an empty list', () => {
  assert.deepEqual(parseKeywords(''), []);
  assert.deepEqual(parseKeywords(undefined), []);
  assert.deepEqual(parseKeywords(' , ; '), []);
});

test('the search text is the title followed by the keywords', () => {
  assert.equal(searchText({ title: 'Represent drone flight logs', keywords: 'UAV, flight path' }), 'Represent drone flight logs UAV flight path');
});

test('the search text works with only a title or only keywords', () => {
  assert.equal(searchText({ title: 'Drone logs', keywords: '' }), 'Drone logs');
  assert.equal(searchText({ title: '  ', keywords: 'UAV' }), 'UAV');
});

test('issue searches use the title words in any order, and each keyword as a phrase', () => {
  assert.deepEqual(issueSearchTerms({ title: 'Represent drone flight logs', keywords: 'UAV, flight path' }), [
    { term: 'drone flight logs', exact: false },
    { term: 'UAV', exact: true },
    { term: 'flight path', exact: true },
  ]);
});

test('a title of only request words gives no title search', () => {
  assert.deepEqual(issueSearchTerms({ title: 'Add new concept', keywords: '' }), []);
});

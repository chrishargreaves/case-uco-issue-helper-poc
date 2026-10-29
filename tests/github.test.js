import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newIssueUrl, issueHandOff, issueSearchUrl, MAX_URL_LENGTH } from '../src/lib/github.js';

test('title and body with reserved and non-ASCII characters survive encoding', () => {
  const title = 'Represent drone logs & flight paths? #1';
  const body = '# Background\n\nCafé owner’s drone — 50% of cases & more?\n\nLine two';
  const url = new URL(newIssueUrl('ucoProject/UCO', { title, body }));
  assert.equal(url.searchParams.get('title'), title);
  assert.equal(url.searchParams.get('body'), body);
});

test('the URL targets the chosen repository and carries the change request label', () => {
  const url = new URL(newIssueUrl('casework/CASE', { title: 'T', body: 'B' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/casework/CASE/issues/new');
  assert.equal(url.searchParams.get('labels'), 'change request');
});

test('an unknown repository is rejected', () => {
  assert.throws(() => newIssueUrl('someone/else', { title: 'T', body: 'B' }));
});

test('a short draft is handed off with its body in the URL', () => {
  const handOff = issueHandOff('ucoProject/UCO', { title: 'T', body: 'Short body' });
  assert.equal(handOff.tooLong, false);
  assert.equal(new URL(handOff.url).searchParams.get('body'), 'Short body');
});

test('a body that makes the URL too long falls back to a title-only URL', () => {
  const body = 'x '.repeat(MAX_URL_LENGTH);
  const handOff = issueHandOff('ucoProject/UCO', { title: 'Long one', body });
  assert.equal(handOff.tooLong, true);
  const url = new URL(handOff.url);
  assert.equal(url.searchParams.get('title'), 'Long one');
  assert.equal(url.searchParams.get('body'), null);
  assert.ok(handOff.url.length <= MAX_URL_LENGTH);
});

test('an issue search URL searches open and closed issues in one repository', () => {
  const url = new URL(issueSearchUrl('ucoProject/UCO', 'MobileDevice'));
  assert.equal(url.origin + url.pathname, 'https://github.com/ucoProject/UCO/issues');
  assert.equal(url.searchParams.get('q'), 'is:issue MobileDevice');
});

test('an issue search term with spaces is quoted', () => {
  const url = new URL(issueSearchUrl('casework/CASE', 'drone flight log'));
  assert.equal(url.searchParams.get('q'), 'is:issue "drone flight log"');
});

test('a search that is not exact leaves the words unquoted', () => {
  const url = new URL(issueSearchUrl('casework/CASE', 'drone flight logs', { exact: false }));
  assert.equal(url.searchParams.get('q'), 'is:issue drone flight logs');
});

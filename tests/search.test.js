import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareIndex, search } from '../src/lib/search.js';

const entry = (localName, extra = {}) => ({
  iri: `https://example.org/${localName}`,
  localName,
  compactIri: `ex:${localName}`,
  type: 'class',
  group: 'UCO',
  tier: 'core',
  label: localName,
  comment: null,
  ...extra,
});

const INDEX = prepareIndex([
  entry('ArchiveFile', { comment: 'A file that contains other files.' }),
  entry('FileFacet'),
  entry('Image', { comment: 'An image, often stored in a file.' }),
  entry('DroneFlightLog', { group: 'CAC', tier: 'extension', comment: 'A log of drone flights.' }),
  entry('EventLog', { comment: 'A log of events.' }),
  entry('MobileDevice', { comment: 'A portable computing device.' }),
  entry('Grooming', { group: 'CAC', tier: 'extension' }),
]);

const names = list => list.map(e => e.localName);

test('a name that starts with the query ranks above a comment-only match', () => {
  const { core } = search(INDEX, 'file');
  assert.equal(core[0].localName, 'FileFacet');
  assert.ok(core.findIndex(e => e.localName === 'FileFacet') < core.findIndex(e => e.localName === 'Image'));
});

test('words inside a camel-case name are matched', () => {
  const { core } = search(INDEX, 'device');
  assert.deepEqual(names(core), ['MobileDevice']);
});

test('an entry matching every word ranks above one matching only some', () => {
  const { core, extension } = search(INDEX, 'drone flight log');
  assert.equal(extension[0].localName, 'DroneFlightLog');
  assert.ok(names(core).includes('EventLog'));
});

test('plural query words match singular names', () => {
  const { core } = search(INDEX, 'logs');
  assert.ok(names(core).includes('EventLog'));
});

test('matching is case-insensitive', () => {
  assert.deepEqual(names(search(INDEX, 'MOBILE').core), ['MobileDevice']);
});

test('an empty, whitespace-only or stop-word-only query returns nothing', () => {
  for (const q of ['', '   ', 'the of a']) {
    const result = search(INDEX, q);
    assert.deepEqual(result, { core: [], extension: [] });
  }
});

test('results are split by tier', () => {
  const { core, extension } = search(INDEX, 'grooming');
  assert.deepEqual(core, []);
  assert.deepEqual(names(extension), ['Grooming']);
});

test('each tier is capped at the limit', () => {
  const many = prepareIndex(Array.from({ length: 50 }, (_, i) => entry(`Thing${i}`)));
  assert.equal(search(many, 'thing', { limit: 20 }).core.length, 20);
});

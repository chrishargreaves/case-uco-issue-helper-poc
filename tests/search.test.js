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

test('a rare word outranks a common one when both entries match one word', () => {
  const entries = [
    ...Array.from({ length: 10 }, (_, i) => entry(`Common${i}`, { label: `common thing ${i}` })),
    entry('Rare'),
  ];
  const { core } = search(prepareIndex(entries), 'common rare');
  assert.equal(core[0].localName, 'Rare');
});

test('request words such as "represent" are ignored', () => {
  const index = prepareIndex([entry('representsAgency'), entry('Drone')]);
  const { core } = search(index, 'Represent drone flight logs');
  assert.deepEqual(names(core), ['Drone']);
});

test('a quoted phrase matches its words joined in a name, or the phrase in a label or comment', () => {
  const index = prepareIndex([
    entry('FlightPathFacet'),
    entry('Route', { comment: 'The flight path of an aircraft.' }),
    entry('Track', { label: 'flight path record' }),
    entry('filePath'),
    entry('FlightLog'),
  ]);
  const { core } = search(index, '"flight path"');
  assert.deepEqual(names(core).sort(), ['FlightPathFacet', 'Route', 'Track']);
});

test('a phrase in the plural matches a singular name', () => {
  const index = prepareIndex([entry('FlightPath')]);
  assert.deepEqual(names(search(index, '"flight paths"').core), ['FlightPath']);
});

test('a phrase counts as one matched term alongside ordinary words', () => {
  const index = prepareIndex([
    entry('DroneFlightPath'),
    entry('Drone'),
    entry('FlightPath'),
  ]);
  const { core } = search(index, 'drone "flight path"');
  assert.equal(core[0].localName, 'DroneFlightPath');
});

test('an unclosed quote does not break the search', () => {
  const index = prepareIndex([entry('FlightPath')]);
  assert.doesNotThrow(() => search(index, '"flight path'));
});

test('a phrase and its joined form count as one term', () => {
  // Each entry matches one term. If "flight path" and flightpath counted
  // separately, FlightPath would match two and rank first.
  const index = prepareIndex([entry('FlightPath'), entry('DroneThing')]);
  const { core } = search(index, 'drone "flight path" flightpath');
  assert.equal(core[0].localName, 'DroneThing');
});

test('a phrase also matches its joined form written in a label or comment', () => {
  const index = prepareIndex([entry('Route', { comment: 'Stores the flightpath as points.' }), entry('Other')]);
  assert.deepEqual(names(search(index, '"flight path"').core), ['Route']);
});

test('each result lists the terms it matched, and whether in the name or the description', () => {
  const index = prepareIndex([entry('DroneThing', { comment: 'Records the flight path.' })]);
  const [result] = search(index, 'drone "flight path" banana').core;
  assert.deepEqual(result.matches, [
    { term: 'drone', where: 'name' },
    { term: 'flight path', where: 'description' },
  ]);
});

test('search results are copies, so the index entries are not changed', () => {
  const entries = [entry('Drone')];
  search(prepareIndex(entries), 'drone');
  assert.equal(entries[0].matches, undefined);
});

test('matched terms are shown as typed, not in their internal lower-case singular form', () => {
  const index = prepareIndex([entry('EventLog', { comment: 'An unmanned UAV log.' })]);
  const [result] = search(index, 'UAV Logs').core;
  assert.deepEqual(result.matches.map(m => m.term), ['UAV', 'Logs']);
});

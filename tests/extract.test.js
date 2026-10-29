import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseTurtle } from '../scripts/lib/parse.js';
import { extractEntries, extractParentLinks, buildIndex, extractDeclaredVersion } from '../scripts/lib/extract.js';
import { SOURCES, assertAllowedUrl } from '../scripts/lib/sources.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

async function parsed(name, source) {
  const { store } = await parseTurtle(fixture(name), `https://example.org/${name}`);
  return { source, store };
}

const UCO_SOURCE = { id: 'uco-observable', group: 'UCO', tier: 'core', repo: 'ucoProject/UCO' };
const UCO_SOURCE_2 = { id: 'uco-other', group: 'UCO', tier: 'core', repo: 'ucoProject/UCO' };
const KB_SOURCE = { id: 'solveit-kb', group: 'SOLVE-IT', tier: 'extension', kind: 'solveit-kb' };
const CAC_SOURCE = { id: 'cac-bridge-uco', group: 'CAC', tier: 'extension' };

test('a class with label and comment becomes one class entry with tier and repo', async () => {
  const { store } = await parsed('core.ttl');
  const entries = extractEntries(store, UCO_SOURCE);
  const device = entries.find(e => e.localName === 'MobileDevice');
  assert.equal(device.type, 'class');
  assert.equal(device.label, 'MobileDevice');
  assert.equal(device.comment, 'A mobile device is a portable computing device.');
  assert.equal(device.compactIri, 'uco-observable:MobileDevice');
  assert.equal(device.tier, 'core');
  assert.equal(device.repo, 'ucoProject/UCO');
  assert.equal(device.group, 'UCO');
});

test('object and datatype properties become property entries', async () => {
  const { store } = await parsed('core.ttl');
  const props = extractEntries(store, UCO_SOURCE).filter(e => e.type === 'property');
  assert.deepEqual(props.map(p => p.localName).sort(), ['deviceName', 'hasDevice']);
});

test('blank-node subjects are ignored', async () => {
  const { store } = await parsed('core.ttl');
  const entries = extractEntries(store, UCO_SOURCE);
  assert.ok(!entries.some(e => e.label === 'Anonymous'));
});

test('the SOLVE-IT knowledge base yields techniques only, with description and CASE classes', async () => {
  const { store } = await parsed('solveit-kb.ttl');
  const entries = extractEntries(store, KB_SOURCE);
  assert.equal(entries.length, 1);
  const [technique] = entries;
  assert.equal(technique.type, 'technique');
  assert.equal(technique.label, 'DFT-1001: Triage devices or media');
  assert.equal(technique.comment, 'Digital forensic triage is a partial forensic examination.');
  assert.deepEqual(technique.caseClasses.sort(), [
    'solveit-observable:DeviceSet',
    'solveit-observable:PrioritizedDeviceSet',
  ]);
  assert.equal(technique.repo, undefined);
  assert.equal(technique.compactIri, 'DFT-1001');
});

test('subclass and equivalence links are collected per class', async () => {
  const { store } = await parsed('cac-bridge.ttl');
  const links = extractParentLinks(store);
  assert.deepEqual(links.get('https://cacontology.projectvic.org#Offender').sort(), [
    'https://cacontology.projectvic.org#Person',
    'https://ontology.unifiedcyberontology.org/uco/core/UcoObject',
  ]);
  assert.deepEqual(links.get('https://cacontology.projectvic.org#CACInvestigation'), [
    'https://ontology.caseontology.org/case/investigation/Investigation',
  ]);
});

test('buildIndex keeps the first declaration of an IRI and attaches core mappings', async () => {
  const index = buildIndex([
    await parsed('core.ttl', UCO_SOURCE),
    await parsed('core-duplicate.ttl', UCO_SOURCE_2),
    await parsed('cac-bridge.ttl', CAC_SOURCE),
  ]);
  const devices = index.filter(e => e.localName === 'MobileDevice');
  assert.equal(devices.length, 1);
  assert.equal(devices[0].sourceId, 'uco-observable');

  const offender = index.find(e => e.localName === 'Offender');
  assert.deepEqual(offender.mapsTo, ['uco-core:UcoObject']);
  const person = index.find(e => e.localName === 'Person');
  assert.equal(person.mapsTo, undefined);

  const investigation = index.find(e => e.localName === 'CACInvestigation');
  assert.deepEqual(investigation.mapsTo, ['case-investigation:Investigation']);
});

test('core mappings are inherited through extension parents, and cycles terminate', async () => {
  const index = buildIndex([await parsed('cac-bridge.ttl', CAC_SOURCE)]);
  const suspect = index.find(e => e.localName === 'Suspect');
  assert.deepEqual(suspect.mapsTo, ['uco-core:UcoObject']);
  const loop = index.find(e => e.localName === 'LoopA');
  assert.equal(loop.mapsTo, undefined);
});

test('declared version is read from the versionIRI tail', async () => {
  const { store } = await parsed('core.ttl');
  assert.equal(extractDeclaredVersion(store), '1.5.0');
});

test('the source list never includes example graphs or shapes files', () => {
  for (const source of SOURCES) {
    assert.doesNotThrow(() => assertAllowedUrl(source.url), source.url);
  }
  assert.ok(SOURCES.some(s => s.group === 'UCO'));
  assert.ok(SOURCES.some(s => s.group === 'CASE'));
  assert.ok(SOURCES.some(s => s.group === 'SOLVE-IT'));
  assert.ok(SOURCES.some(s => s.group === 'CAC'));
});

test('disallowed URLs are rejected', () => {
  for (const url of [
    'https://raw.githubusercontent.com/Project-VIC-International/CAC-Ontology/main/examples_knowledge_graphs/x.ttl',
    'https://raw.githubusercontent.com/Project-VIC-International/CAC-Ontology/main/analytics_demonstration/a/skeleton.ttl',
    'https://raw.githubusercontent.com/Project-VIC-International/CAC-Ontology/main/ontology/cacontology-core-shapes.ttl',
  ]) {
    assert.throws(() => assertAllowedUrl(url));
  }
});

test('a core mapping implied by a more specific core mapping is dropped', async () => {
  const CASE_SOURCE = { id: 'case-investigation', group: 'CASE', tier: 'core', repo: 'casework/CASE' };
  const index = buildIndex([
    await parsed('core-hierarchy.ttl', CASE_SOURCE),
    await parsed('cac-bridge.ttl', CAC_SOURCE),
    await parsed('cac-extra.ttl', CAC_SOURCE),
  ]);
  // CACInvestigation is equivalent to Investigation, which is itself a UcoObject.
  const investigation = index.find(e => e.localName === 'CACInvestigation');
  assert.deepEqual(investigation.mapsTo, ['case-investigation:Investigation']);
});

test('a label or comment missing from the first declaration is filled in from a later one', async () => {
  const index = buildIndex([
    await parsed('core-bare.ttl', { id: 'uco-core', group: 'UCO', tier: 'core', repo: 'ucoProject/UCO' }),
    await parsed('core-full.ttl', { id: 'uco-action', group: 'UCO', tier: 'core', repo: 'ucoProject/UCO' }),
  ]);
  const action = index.find(e => e.localName === 'Action');
  assert.equal(action.label, 'Action');
  assert.equal(action.comment, 'An action is something that may be done or performed.');
});

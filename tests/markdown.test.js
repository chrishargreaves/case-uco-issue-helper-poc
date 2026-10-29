import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDraft, addRequirement, removeItem, addCompetency, addQuestion } from '../src/lib/draft.js';
import { renderIssueBody, NO_KNOWN_RISKS, TRANSCRIPTION_PERMISSION } from '../src/lib/markdown.js';

function headings(markdown) {
  return markdown.split('\n').filter(line => /^#{1,4} /.test(line));
}

test('top-level template sections always appear, in template order', () => {
  const body = renderIssueBody(createDraft());
  assert.deepEqual(headings(body).filter(h => h.startsWith('# ')), [
    '# Background',
    '# Requirements',
    '# Risk / Benefit analysis',
    '# Competencies demonstrated',
    '# Solution suggestion',
  ]);
  assert.ok(body.includes('## Benefits'));
  assert.ok(body.includes('## Risks'));
});

test('background fields render as labelled lines, skipping blanks', () => {
  const draft = createDraft();
  draft.background.need = 'A way to represent drone flight logs.';
  draft.background.importance = 'Drone cases are increasing.';
  const body = renderIssueBody(draft);
  assert.ok(body.includes('**What is needed:** A way to represent drone flight logs.'));
  assert.ok(body.includes('**Why it matters:** Drone cases are increasing.'));
  assert.ok(!body.includes('**Who needs it:**'));
});

test('requirements are numbered in order, and removing one renumbers the rest', () => {
  let draft = createDraft();
  draft = addRequirement(draft, 'First');
  draft = addRequirement(draft, 'Second');
  let body = renderIssueBody(draft);
  assert.ok(body.indexOf('## Requirement 1\n\nFirst') < body.indexOf('## Requirement 2\n\nSecond'));

  draft = removeItem(draft, 'requirements', draft.requirements[0].id);
  body = renderIssueBody(draft);
  assert.ok(body.includes('## Requirement 1\n\nSecond'));
  assert.ok(!body.includes('## Requirement 2'));
});

test('blank requirements are skipped and do not take a number', () => {
  let draft = createDraft();
  draft = addRequirement(draft, '   ');
  draft = addRequirement(draft, 'Real one');
  const body = renderIssueBody(draft);
  assert.ok(body.includes('## Requirement 1\n\nReal one'));
  assert.ok(!body.includes('## Requirement 2'));
});

test('competency questions are numbered within their competency', () => {
  let draft = createDraft();
  draft = addCompetency(draft, 'Scenario one');
  draft = addCompetency(draft, 'Scenario two');
  const second = draft.competencies[1].id;
  draft = addQuestion(draft, second, 'Which pictures were taken from the evidence?', 'Those from the kiosk.');
  draft = addQuestion(draft, second, 'Which were taken of it?', 'Those from the camera.');
  const body = renderIssueBody(draft);
  const h = headings(body);
  const start = h.indexOf('## Competency 2');
  assert.deepEqual(h.slice(start, start + 5), [
    '## Competency 2',
    '### Competency Question 2.1',
    '#### Result 2.1',
    '### Competency Question 2.2',
    '#### Result 2.2',
  ]);
  assert.ok(body.includes('Scenario two'));
});

test('a question with neither question nor result text is skipped', () => {
  let draft = createDraft();
  draft = addCompetency(draft, 'Scenario');
  const id = draft.competencies[0].id;
  draft = addQuestion(draft, id, '', '');
  draft = addQuestion(draft, id, 'Real question?', '');
  const body = renderIssueBody(draft);
  assert.ok(body.includes('### Competency Question 1.1\n\nReal question?'));
  assert.ok(!body.includes('1.2'));
});

test('the no-known-risks flag inserts the template sentence only when risks are empty', () => {
  const draft = createDraft();
  draft.noKnownRisks = true;
  assert.ok(renderIssueBody(draft).includes(`## Risks\n\n${NO_KNOWN_RISKS}`));
  draft.risks = 'It may overlap with an existing facet.';
  const body = renderIssueBody(draft);
  assert.ok(body.includes('## Risks\n\nIt may overlap with an existing facet.'));
  assert.ok(!body.includes(NO_KNOWN_RISKS));
});

test('the transcription permission sentence appears only when the flag is set', () => {
  const draft = createDraft();
  assert.ok(!renderIssueBody(draft).includes(TRANSCRIPTION_PERMISSION));
  draft.allowTranscription = true;
  assert.ok(renderIssueBody(draft).includes(TRANSCRIPTION_PERMISSION));
});

test('related concepts render CASE/UCO first, then extensions, with mappings', () => {
  const draft = createDraft();
  draft.related = [
    { iri: 'x:1', compactIri: 'cacontology:Offender', label: 'Offender', group: 'CAC', tier: 'extension', type: 'class', mapsTo: ['uco-identity:Person'] },
    { iri: 'x:2', compactIri: 'uco-observable:MobileDevice', label: 'MobileDevice', group: 'UCO', tier: 'core', type: 'class' },
  ];
  const body = renderIssueBody(draft);
  const core = body.indexOf('uco-observable:MobileDevice');
  const ext = body.indexOf('cacontology:Offender');
  assert.ok(body.includes('# Related existing concepts'));
  assert.ok(core > 0 && ext > core);
  assert.ok(body.includes('specialises `uco-identity:Person`'));
});

test('no related concepts means no related section', () => {
  assert.ok(!renderIssueBody(createDraft()).includes('# Related existing concepts'));
});

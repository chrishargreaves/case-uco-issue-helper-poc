// Turns a draft into the issue body, following the heading structure of the
// UCO change-request template (.github/ISSUE_TEMPLATE/change-request.md).
// Top-level template sections are always present; blank entries inside them
// are skipped so they do not take a number.

export const NO_KNOWN_RISKS = 'The submitter is unaware of risks associated with this change.';
export const TRANSCRIPTION_PERMISSION = 'I am fine with my examples being transcribed and credited.';
const NOT_PROVIDED = '_Not provided._';

const filled = text => typeof text === 'string' && text.trim() !== '';
const block = text => (filled(text) ? text.trim() : NOT_PROVIDED);

function background(draft) {
  const { need, audience, importance, details } = draft.background;
  const lines = [
    ['What is needed', need],
    ['Who needs it', audience],
    ['Why it matters', importance],
  ].filter(([, value]) => filled(value)).map(([label, value]) => `**${label}:** ${value.trim()}`);
  const parts = [lines.join('\n\n'), filled(details) ? details.trim() : ''].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : NOT_PROVIDED;
}

function requirements(draft) {
  const items = draft.requirements.filter(r => filled(r.text));
  if (items.length === 0) return [NOT_PROVIDED];
  return items.map((r, i) => `## Requirement ${i + 1}\n\n${r.text.trim()}`);
}

function competencies(draft) {
  const items = draft.competencies.filter(c => filled(c.scenario) || c.questions.some(q => filled(q.question) || filled(q.result)));
  if (items.length === 0) return [NOT_PROVIDED];
  return items.map((c, i) => {
    const n = i + 1;
    const parts = [`## Competency ${n}`];
    if (filled(c.scenario)) parts.push(c.scenario.trim());
    c.questions
      .filter(q => filled(q.question) || filled(q.result))
      .forEach((q, j) => {
        parts.push(`### Competency Question ${n}.${j + 1}`, block(q.question));
        parts.push(`#### Result ${n}.${j + 1}`, block(q.result));
      });
    return parts.join('\n\n');
  });
}

function risks(draft) {
  if (filled(draft.risks)) return draft.risks.trim();
  return draft.noKnownRisks ? NO_KNOWN_RISKS : NOT_PROVIDED;
}

function relatedLine(concept) {
  const label = concept.label && concept.label !== concept.compactIri ? `${concept.label}, ` : '';
  let line = `- \`${concept.compactIri}\` (${label}${concept.group})`;
  if (concept.mapsTo?.length) line += `, which specialises ${concept.mapsTo.map(m => `\`${m}\``).join(', ')}`;
  return line;
}

function related(draft) {
  if (draft.related.length === 0) return [];
  const core = draft.related.filter(c => c.tier === 'core');
  const extension = draft.related.filter(c => c.tier !== 'core');
  const parts = [
    '# Related existing concepts',
    'The submitter identified these existing concepts as related to this request.',
  ];
  if (core.length) parts.push('**Already in CASE/UCO**', core.map(relatedLine).join('\n'));
  if (extension.length) parts.push('**In extensions (SOLVE-IT, CAC)**', extension.map(relatedLine).join('\n'));
  return parts;
}

export function renderIssueBody(draft) {
  const solution = [block(draft.solution)];
  if (draft.allowTranscription) solution.push(TRANSCRIPTION_PERMISSION);

  return [
    '# Background', background(draft),
    '# Requirements', ...requirements(draft),
    '# Risk / Benefit analysis',
    '## Benefits', block(draft.benefits),
    '## Risks', risks(draft),
    '# Competencies demonstrated', ...competencies(draft),
    '# Solution suggestion', ...solution,
    ...related(draft),
  ].join('\n\n') + '\n';
}

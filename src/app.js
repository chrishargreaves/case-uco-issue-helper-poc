// DOM wiring for the page. The logic lives in src/lib/ and is tested there;
// this file builds the form from src/content/guidance.js, keeps the draft in
// step with the inputs, and updates the preview, search and output.

import { GUIDANCE as G } from './content/guidance.js';
import {
  createDraft, addRequirement, addCompetency, addQuestion, removeItem, removeQuestion,
  serialiseDraft, parseDraft, saveToStorage, loadFromStorage, DESTINATIONS,
} from './lib/draft.js';
import { renderIssueBody } from './lib/markdown.js';
import { prepareIndex, search } from './lib/search.js';
import { suggestDestination, describeDestination, REPOSITORIES } from './lib/destination.js';
import { issueHandOff, issueSearchUrl } from './lib/github.js';

const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();

const state = {
  draft: loadFromStorage(storage) || createDraft(),
  index: null,
  indexError: null,
  query: '',
  // The search follows the title until the submitter types their own search.
  queryEdited: false,
  results: { core: [], extension: [] },
  expanded: { core: false, extension: false },
  // Until the submitter picks a destination, it follows the suggestion.
  destinationChosen: false,
  undo: null,
};
state.query = state.draft.title;

// ── Small helpers ──

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const $ = id => document.getElementById(id);

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** The words to search GitHub issues for, for one index entry. */
function issueTerm(entry) {
  if (entry.type === 'technique' && entry.label) return entry.label.replace(/^[A-Z]+-\d+:\s*/, '');
  return entry.localName;
}

// ── Form ──

function step(n, id, guidance, ...content) {
  return h('section', { class: 'step', 'aria-labelledby': `${id}-heading` },
    h('h2', { id: `${id}-heading` }, h('span', { class: 'step-number', 'aria-hidden': 'true' }, n), guidance.heading),
    guidance.prompt && h('p', { class: 'prompt' }, guidance.prompt),
    ...content);
}

/** A labelled text box. `before` is placed between the label and the box. */
/** A folded "Example" control shown above a text box. */
function example(text) {
  return text && h('details', { class: 'field-example' }, h('summary', {}, 'Example'), h('p', {}, text));
}

/** A labelled text box. `before` is placed between the label and the example. */
function textField(path, label, exampleText, { multiline = true, before = [] } = {}) {
  const id = `f-${path.replace(/\./g, '-')}`;
  const control = multiline
    ? h('textarea', { id, 'data-path': path, rows: 3 })
    : h('input', { id, type: 'text', 'data-path': path });
  control.value = getPath(state.draft, path) || '';
  return h('div', { class: 'field' }, h('label', { for: id }, label), before, example(exampleText), control);
}

function checkField(path, label) {
  const id = `f-${path}`;
  return h('label', { class: 'check', for: id },
    h('input', { id, type: 'checkbox', 'data-path': path, checked: getPath(state.draft, path) }),
    h('span', {}, label));
}

function renderRequirements() {
  const list = $('requirements-list');
  list.replaceChildren(...state.draft.requirements.map((r, i) =>
    h('div', { class: 'item' },
      h('div', { class: 'item-head' },
        h('h3', { id: `req-${r.id}` }, `Requirement ${i + 1}`),
        h('button', { type: 'button', class: 'button danger small', onclick: () => update(d => removeItem(d, 'requirements', r.id), renderRequirements), 'aria-label': `Remove requirement ${i + 1}` }, 'Remove')),
      example(G.requirements.example),
      h('textarea', { 'aria-labelledby': `req-${r.id}`, 'data-list': 'requirements', 'data-id': r.id, 'data-key': 'text', rows: 2, value: r.text }))));
}

function renderCompetencies() {
  const g = G.competencies;
  const list = $('competencies-list');
  list.replaceChildren(...state.draft.competencies.map((c, i) => {
    const n = i + 1;
    return h('div', { class: 'item' },
      h('div', { class: 'item-head' },
        h('h3', { id: `sc-h-${c.id}` }, `${g.itemLabel} ${n}`),
        h('button', { type: 'button', class: 'button danger small', onclick: () => update(d => removeItem(d, 'competencies', c.id), renderCompetencies), 'aria-label': `Remove situation ${n}` }, 'Remove')),
      h('div', { class: 'field' },
        example(g.scenarioExample),
        h('textarea', { 'aria-labelledby': `sc-h-${c.id}`, 'data-competency': c.id, 'data-key': 'scenario', rows: 3, value: c.scenario })),
      c.questions.map((q, j) => h('div', { class: 'question' },
        h('div', { class: 'item-head' },
          h('h4', { id: `q-h-${q.id}` }, `${g.questionLabel} ${j + 1}`),
          h('button', { type: 'button', class: 'button danger small', onclick: () => update(d => removeQuestion(d, c.id, q.id), renderCompetencies), 'aria-label': `Remove question ${j + 1} of situation ${n}` }, 'Remove')),
        h('div', { class: 'field' },
          example(g.questionExample),
          h('textarea', { 'aria-labelledby': `q-h-${q.id}`, 'data-competency': c.id, 'data-question': q.id, 'data-key': 'question', rows: 2, value: q.question })),
        h('div', { class: 'field' },
          h('label', { for: `r-${q.id}` }, g.resultLabel),
          example(g.resultExample),
          h('textarea', { id: `r-${q.id}`, 'data-competency': c.id, 'data-question': q.id, 'data-key': 'result', rows: 2, value: q.result })))),
      h('button', { type: 'button', class: 'button quiet small', onclick: () => update(d => addQuestion(d, c.id), renderCompetencies, () => focusLast(`[data-competency="${c.id}"][data-key="question"]`)) }, `+ ${g.addQuestion}`));
  }));
}

function focusLast(selector) {
  const all = document.querySelectorAll(selector);
  all[all.length - 1]?.focus();
}

function renderForm() {
  const g = G;
  const form = $('form');
  form.replaceChildren(
    step(1, 'title', g.title, textField('title', 'Title', g.title.example, { multiline: false })),

    step(2, 'search', g.search, h('div', { id: 'search-step' })),

    step(3, 'background', g.background,
      Object.entries(g.background.fields).map(([key, f]) => textField(`background.${key}`, f.label, f.example))),

    step(4, 'requirements', g.requirements,
      h('div', { id: 'requirements-list' }),
      h('button', { type: 'button', class: 'button quiet', onclick: () => update(d => addRequirement(d), renderRequirements, () => focusLast('[data-list="requirements"]')) }, `+ ${g.requirements.add}`)),

    step(5, 'benefits-risks', { heading: 'Benefits and risks' },
      textField('benefits', g.benefits.heading, g.benefits.example, {
        before: h('p', { class: 'why' }, g.benefits.prompt),
      }),
      textField('risks', g.risks.heading, g.risks.example, {
        before: [h('p', { class: 'why' }, g.risks.prompt), checkField('noKnownRisks', g.risks.noneLabel)],
      })),

    step(6, 'competencies', g.competencies,
      h('div', { id: 'competencies-list' }),
      h('button', { type: 'button', class: 'button quiet', onclick: () => update(d => { const n = addCompetency(d); return addQuestion(n, n.competencies.at(-1).id); }, renderCompetencies, () => focusLast('[data-key="scenario"]')) }, `+ ${g.competencies.add}`)),

    step(7, 'solution', g.solution,
      textField('solution', 'Suggested change', g.solution.example),
      h('div', { class: 'example-actions' },
        h('button', { type: 'button', class: 'button quiet small', id: 'mention-related', onclick: mentionRelated }, g.solution.mentionRelated)),
      checkField('allowTranscription', g.solution.transcriptionLabel)),

    step(8, 'destination', g.destination,
      h('div', { class: 'destinations', role: 'radiogroup', 'aria-labelledby': 'destination-heading' },
        DESTINATIONS.map(repo => h('label', { class: 'destination' },
          h('input', { type: 'radio', name: 'destination', value: repo, checked: state.draft.destination === repo, onchange: chooseDestination }),
          h('div', {}, h('strong', {}, REPOSITORIES[repo].name), h('span', {}, `Covers ${REPOSITORIES[repo].covers}`))))),
      h('p', { class: 'suggestion', id: 'suggestion', 'aria-live': 'polite' }),
      h('p', { class: 'prompt' }, g.destination.duplicates),
      h('ul', { class: 'issue-links', id: 'issue-links' }),
      h('div', { class: 'output' },
        h('div', { class: 'output-actions' },
          h('button', { type: 'button', class: 'button quiet', onclick: showPreview }, 'Preview issue text'),
          h('button', { type: 'button', class: 'button quiet copy-body' }, 'Copy issue text'),
          h('a', { class: 'button open-github', target: '_blank', rel: 'noopener noreferrer' }, 'Open on GitHub')),
        h('p', { class: 'warning output-warning', hidden: true }),
        h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }))),
  );
  renderRequirements();
  renderCompetencies();
}

// ── Keeping the draft in step ──

function onInput(event) {
  const t = event.target;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  const d = state.draft;
  if (t.dataset.path) {
    setPath(d, t.dataset.path, value);
    if (t.dataset.path === 'title' && !state.queryEdited) searchFromTitle();
  } else if (t.dataset.list) {
    const item = d[t.dataset.list].find(x => x.id === t.dataset.id);
    if (item) item[t.dataset.key] = value;
  } else if (t.dataset.competency) {
    const c = d.competencies.find(x => x.id === t.dataset.competency);
    if (!c) return;
    if (t.dataset.question) {
      const q = c.questions.find(x => x.id === t.dataset.question);
      if (q) q[t.dataset.key] = value;
    } else {
      c[t.dataset.key] = value;
    }
  } else {
    return;
  }
  changed();
}

/** Apply a draft change, re-render what it affects, then run `after`. */
function update(fn, render, after) {
  state.draft = fn(state.draft);
  render?.();
  changed();
  after?.();
}

const persist = debounce(() => saveToStorage(storage, state.draft), 300);

function changed() {
  for (const status of document.querySelectorAll('.output .status')) status.textContent = '';
  renderPreview();
  renderDestination();
  renderOutput();
  persist();
}

// ── Preview ──

function renderPreview() {
  $('preview').textContent = renderIssueBody(state.draft);
}

// ── Search step ──

function renderSearchStep() {
  const g = G.search;
  const input = h('input', {
    type: 'search', id: 'search-input', value: state.query,
    'aria-label': 'Search existing concepts', 'aria-controls': 'search-results',
    oninput: e => { state.queryEdited = true; searchSoon(e.target.value); },
  });
  $('search-step').replaceChildren(
    h('div', { class: 'search-row' }, input,
      h('button', { type: 'button', class: 'button quiet small', onclick: () => { state.queryEdited = false; input.value = state.draft.title; runSearch(state.draft.title); } }, g.useTitle)),
    h('div', { id: 'marked' }),
    h('div', { id: 'search-results', 'aria-live': 'polite' }));
  renderMarked();
  renderResults();
}

const searchSoon = debounce(query => runSearch(query), 150);

function searchFromTitle() {
  const input = $('search-input');
  if (input) input.value = state.draft.title;
  searchSoon(state.draft.title);
}

function runSearch(query) {
  state.query = query;
  state.expanded = { core: false, extension: false };
  state.results = state.index ? search(state.index, query) : { core: [], extension: [] };
  renderResults();
  renderDestination();
}

const isMarked = entry => state.draft.related.some(r => r.iri === entry.iri);

function toggleMarked(entry) {
  if (isMarked(entry)) {
    state.draft.related = state.draft.related.filter(r => r.iri !== entry.iri);
  } else {
    const { iri, compactIri, label, group, tier, type, repo, mapsTo } = entry;
    state.draft.related = [...state.draft.related, { iri, compactIri, label, group, tier, type, repo, mapsTo }];
  }
  renderMarked();
  renderResults();
  changed();
}

function renderMarked() {
  const related = state.draft.related;
  $('mention-related') && ($('mention-related').disabled = related.length === 0);
  $('marked').replaceChildren(related.length === 0 ? '' : h('div', { class: 'marked' },
    h('h3', {}, `Marked as related (${related.length})`),
    h('ul', {}, related.map(r => h('li', {},
      h('code', {}, r.compactIri), ` (${r.group})`,
      h('button', { type: 'button', class: 'link-button', onclick: () => toggleMarked(r), 'aria-label': `Remove ${r.compactIri} from related concepts` }, 'remove'))))));
}

function resultItem(entry) {
  const g = G.search;
  const marked = isMarked(entry);
  const repo = entry.tier === 'core' ? entry.repo : state.draft.destination;
  const label = entry.label && entry.label !== entry.localName && entry.label !== entry.compactIri ? entry.label : null;
  return h('li', { class: 'result', 'data-group': entry.group },
    h('div', { class: 'result-title' },
      h('code', {}, entry.compactIri),
      h('span', { class: 'badge' }, entry.group),
      h('span', { class: 'badge' }, entry.type)),
    label && h('div', { class: 'result-label' }, label),
    entry.comment && h('p', { class: 'result-comment' }, entry.comment),
    entry.mapsTo?.length && h('p', { class: 'result-meta' }, 'Specialises ', entry.mapsTo.map((m, i) => [i ? ', ' : '', h('code', {}, m)])),
    entry.caseClasses?.length && h('p', { class: 'result-meta' }, 'Works with ', entry.caseClasses.map((m, i) => [i ? ', ' : '', h('code', {}, m)])),
    h('div', { class: 'result-actions' },
      h('button', { type: 'button', class: 'button quiet small', 'aria-pressed': String(marked), onclick: () => toggleMarked(entry) }, marked ? `✓ ${g.unmark}` : g.mark),
      h('a', { href: issueSearchUrl(repo, issueTerm(entry)), target: '_blank', rel: 'noopener noreferrer' }, `${g.searchIssues} (${repo.split('/')[1]})`)),
    marked && entry.tier === 'core' && h('p', { class: 'nearly-fits' }, g.nearlyFits));
}

function renderResults() {
  const g = G.search;
  const container = $('search-results');
  if (state.indexError) {
    container.replaceChildren(h('p', { class: 'warning' }, `The concept search could not be loaded (${state.indexError}). You can still write and file the request.`));
    return;
  }
  if (!state.index) {
    container.replaceChildren(h('p', { class: 'hint' }, 'Loading the concept index…'));
    return;
  }
  if (!state.query.trim()) {
    container.replaceChildren();
    return;
  }
  const { core, extension } = state.results;
  if (core.length === 0 && extension.length === 0) {
    container.replaceChildren(h('p', { class: 'hint' }, g.empty));
    return;
  }
  container.replaceChildren(
    resultsGroup('core', g.coreHeading, null, core, 'No matches in CASE/UCO.'),
    resultsGroup('extension', g.extensionHeading, g.extensionNote, extension, 'No matches in the extensions.'));
}

const SHOWN_AT_FIRST = 5;

function resultsGroup(tier, heading, note, entries, empty) {
  const shown = state.expanded[tier] ? entries : entries.slice(0, SHOWN_AT_FIRST);
  const hidden = entries.length - shown.length;
  return h('div', { class: 'results-group' },
    h('h3', {}, `${heading} (${entries.length})`),
    note && h('p', { class: 'note' }, note),
    entries.length ? h('ul', { class: 'results' }, shown.map(resultItem)) : h('p', { class: 'note' }, empty),
    hidden > 0 && h('button', {
      type: 'button', class: 'button quiet small',
      onclick: () => { state.expanded[tier] = true; renderResults(); },
    }, `Show all ${entries.length}`));
}

// ── Destination and output ──

function chooseDestination(event) {
  state.destinationChosen = true;
  state.draft.destination = event.target.value;
  renderResults();
  changed();
}

function renderDestination() {
  const suggestion = suggestDestination({ marked: state.draft.related, results: state.results.core });
  if (!state.destinationChosen && state.draft.destination !== suggestion.repo) {
    state.draft.destination = suggestion.repo;
    for (const radio of document.querySelectorAll('input[name="destination"]')) radio.checked = radio.value === suggestion.repo;
  }
  $('suggestion').textContent = describeDestination(state.draft.destination, suggestion);

  const term = state.draft.title.trim();
  $('issue-links').replaceChildren(...(term
    ? DESTINATIONS.map(repo => h('li', {}, h('a', { href: issueSearchUrl(repo, term), target: '_blank', rel: 'noopener noreferrer' }, `Search ${repo} issues for “${term}”`)))
    : [h('li', {}, 'Add a title to search existing issues for it.')]));
}

/** Update every "Open on GitHub" link and its warning (in the last step and in the preview). */
function renderOutput() {
  const title = state.draft.title.trim();
  let href = null;
  let label = 'Open on GitHub';
  let warning = 'Add a title (step 1) before opening the issue on GitHub.';
  if (title) {
    const { url, tooLong } = issueHandOff(state.draft.destination, { title, body: renderIssueBody(state.draft) });
    href = url;
    label = tooLong ? 'Open on GitHub (title only)' : `Open on GitHub (${REPOSITORIES[state.draft.destination].short})`;
    warning = tooLong
      ? 'This request is too long to pass to GitHub in a link. Copy the issue text first, then open GitHub and paste it into the description box.'
      : '';
  }
  for (const link of document.querySelectorAll('.open-github')) {
    if (href) {
      link.href = href;
      link.removeAttribute('aria-disabled');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    }
    link.textContent = label;
  }
  for (const p of document.querySelectorAll('.output-warning')) {
    p.hidden = !warning;
    p.textContent = warning;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

async function copyBody(event) {
  const status = event.target.closest('.output').querySelector('.status');
  const ok = await copyText(renderIssueBody(state.draft));
  status.textContent = ok
    ? 'Issue text copied. Paste it into the description box on GitHub.'
    : 'Copying failed. Open the preview and copy the text from there.';
}

function mentionRelated() {
  const names = state.draft.related.map(r => `\`${r.compactIri}\``);
  if (names.length === 0) return;
  const sentence = `This could build on the existing concepts ${names.join(', ')}.`;
  const current = state.draft.solution.trim();
  if (current.includes(sentence)) return;
  state.draft.solution = current ? `${current}\n\n${sentence}` : sentence;
  $('f-solution').value = state.draft.solution;
  changed();
}

// ── Drafts ──

function setStatus(message, undoable) {
  const status = $('draft-status');
  status.replaceChildren(message);
  if (undoable) {
    status.append(h('button', { type: 'button', class: 'link-button', onclick: undo }, 'Undo'));
  }
}

function replaceDraft(draft, { chosen }) {
  state.undo = { draft: state.draft, chosen: state.destinationChosen };
  state.draft = draft;
  state.destinationChosen = chosen;
  rerenderAll();
}

function undo() {
  if (!state.undo) return;
  const { draft, chosen } = state.undo;
  state.undo = null;
  state.draft = draft;
  state.destinationChosen = chosen;
  rerenderAll();
  setStatus('Restored your previous draft.');
}

function rerenderAll() {
  if (!state.queryEdited) state.query = state.draft.title;
  renderForm();
  renderSearchStep();
  runSearch(state.query);
  changed();
}

function saveDraftFile() {
  const blob = new Blob([serialiseDraft(state.draft)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${slug(state.draft.title) || 'change-request'}-draft.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus('Draft saved as a file. Load it here later to carry on.');
}

async function loadDraftFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const result = parseDraft(await file.text());
  if (!result.ok) {
    setStatus(`Could not load ${file.name}: ${result.error}`);
    return;
  }
  replaceDraft(result.draft, { chosen: true });
  setStatus(`Loaded ${file.name}. It replaced the draft you had open.`, true);
}

function newDraft() {
  replaceDraft(createDraft(), { chosen: false });
  setStatus('Started a new draft.', true);
}

// ── Preview ──

function showPreview() {
  renderPreview();
  $('preview-dialog').showModal();
  $('preview').focus();
}

function setupPreview() {
  const dialog = $('preview-dialog');
  $('close-preview').addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}

// ── Index ──

async function loadIndex() {
  try {
    const response = await fetch('data/index.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.index = prepareIndex(data.entries);
    $('index-versions').textContent = `${data.versions.UCO}`;
    $('index-built').textContent = `Index built ${new Date(data.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  } catch (error) {
    state.indexError = error.message;
  }
  runSearch(state.query);
}

// ── Start ──

renderForm();
renderSearchStep();
setupPreview();
document.addEventListener('click', e => { if (e.target.closest('.copy-body')) copyBody(e); });
$('form').addEventListener('input', onInput);
$('form').addEventListener('submit', e => e.preventDefault());
$('save-draft').addEventListener('click', saveDraftFile);
$('load-draft').addEventListener('change', loadDraftFile);
$('new-draft').addEventListener('click', newDraft);
changed();
loadIndex();

// DOM wiring for the page. The logic lives in src/lib/ and is tested there;
// this file builds the form from src/content/guidance.js, keeps the draft in
// step with the inputs, and updates the search, destination and output.
//
// Typed text and simple flags are written straight into state.draft; adding
// and removing items goes through the functions in src/lib/draft.js, which
// return a new draft. Re-rendering replaces DOM nodes, so any control that can
// be re-rendered while focused carries a data-focus key, and keepFocus() moves
// focus to its replacement.

import { GUIDANCE as G } from './content/guidance.js';
import {
  createDraft, addRequirement, addCompetency, addQuestion, removeItem, removeQuestion,
  serialiseDraft, parseDraft, saveToStorage, loadFromStorage, DESTINATIONS,
} from './lib/draft.js';
import { renderIssueBody } from './lib/markdown.js';
import { prepareIndex, search } from './lib/search.js';
import { suggestDestination, describeDestination, REPOSITORIES } from './lib/destination.js';
import { issueHandOff, issueSearchUrl } from './lib/github.js';
import { searchText, issueSearchTerms } from './lib/keywords.js';

const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
const MAX_DRAFT_FILE_BYTES = 1_000_000;
const SHOWN_AT_FIRST = 8;

const state = {
  draft: loadFromStorage(storage) || createDraft(),
  index: null,
  indexError: null,
  query: '',
  // The search follows the title and keywords until the submitter types their own search.
  queryEdited: false,
  results: { core: [], extension: [] },
  // Groups showing all their results, open groups, and rows showing details.
  // Extensions start folded: they are secondary, and their matches are looser.
  expanded: { core: false, extension: false },
  groupOpen: { core: true, extension: false },
  openResults: new Set(),
  // The draft before the last load, new draft or removal, until the next edit.
  undo: null,
  autosaveWarned: false,
};
state.query = searchText(state.draft);

// ── Small helpers ──

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = Boolean(value);
    // Set through the CSSOM: a style attribute would be blocked by the page's CSP.
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const $ = id => document.getElementById(id);
const hidden = text => h('span', { class: 'visually-hidden' }, text);

/** A debounced function, with cancel() and flush() for pending calls. */
function debounce(fn, ms) {
  let timer = null;
  let pending = null;
  const debounced = (...args) => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(debounced.flush, ms);
  };
  debounced.cancel = () => { clearTimeout(timer); pending = null; };
  debounced.flush = () => {
    clearTimeout(timer);
    if (pending) { const args = pending; pending = null; fn(...args); }
  };
  return debounced;
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

/** Run a re-render, then return focus to the replacement of the focused control. */
function keepFocus(render, fallback) {
  const key = document.activeElement?.dataset?.focus;
  render();
  if (!key) return;
  const target = document.querySelector(`[data-focus="${CSS.escape(key)}"]`) || (fallback && $(fallback));
  target?.focus();
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// ── Form ──

function step(n, id, guidance, ...content) {
  return h('section', { class: 'step', 'aria-labelledby': `${id}-heading` },
    h('h2', { id: `${id}-heading` }, h('span', { class: 'step-number', 'aria-hidden': 'true' }, n), guidance.heading),
    guidance.prompt && h('p', { class: 'prompt' }, guidance.prompt),
    guidance.hint && h('p', { class: 'why' }, guidance.hint),
    ...content);
}

/** A folded "Example" control shown above a text box. */
function example(text, forLabel) {
  return text && h('details', { class: 'field-example' },
    h('summary', {}, 'Example', forLabel && hidden(` for ${forLabel}`)),
    h('p', {}, text));
}

/**
 * A labelled text box. `hint` is a sentence under the label, linked to the box
 * with aria-describedby; `extra` (such as a checkbox) follows the hint.
 */
function textField(path, label, exampleText, { multiline = true, hint, extra } = {}) {
  const id = `f-${path.replace(/\./g, '-')}`;
  const describedBy = hint ? `${id}-hint` : undefined;
  const control = multiline
    ? h('textarea', { id, 'data-path': path, rows: 3, 'aria-describedby': describedBy })
    : h('input', { id, type: 'text', 'data-path': path, 'aria-describedby': describedBy });
  control.value = getPath(state.draft, path) || '';
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    hint && h('p', { class: 'why', id: describedBy }, hint),
    extra,
    example(exampleText, label),
    control);
}

function checkField(path, label) {
  const id = `f-${path}`;
  return h('label', { class: 'check', for: id },
    h('input', { id, type: 'checkbox', 'data-path': path, checked: getPath(state.draft, path) }),
    h('span', {}, label));
}

/** Remove an item, offer Undo, and move focus to the list's Add button. */
function removeWithUndo(fn, render, message, addButtonId) {
  const before = state.draft;
  update(fn, render);
  state.undo = before;
  setStatus(message, true);
  $(addButtonId)?.focus();
}

function renderRequirements() {
  const g = G.requirements;
  const list = $('requirements-list');
  if (state.draft.requirements.length === 0) {
    list.replaceChildren(h('p', { class: 'empty' }, g.empty));
    return;
  }
  list.replaceChildren(...state.draft.requirements.map((r, i) => {
    const n = i + 1;
    const remove = () => removeWithUndo(d => removeItem(d, 'requirements', r.id), renderRequirements, `Removed requirement ${n}.`, 'add-requirement');
    return h('div', { class: 'item' },
      h('div', { class: 'item-head' },
        h('h3', { id: `req-${r.id}` }, `${g.itemLabel} ${n}`),
        h('button', { type: 'button', class: 'button danger small', onclick: remove, 'aria-label': `Remove requirement ${n}` }, 'Remove')),
      example(g.example, `requirement ${n}`),
      h('textarea', { 'aria-labelledby': `req-${r.id}`, 'data-list': 'requirements', 'data-id': r.id, 'data-key': 'text', rows: 2, value: r.text }));
  }));
}

function renderCompetencies() {
  const g = G.competencies;
  const list = $('competencies-list');
  if (state.draft.competencies.length === 0) {
    list.replaceChildren(h('p', { class: 'empty' }, g.empty));
    return;
  }
  list.replaceChildren(...state.draft.competencies.map((c, i) => {
    const n = i + 1;
    const situation = `${g.itemLabel.toLowerCase()} ${n}`;
    const questionCount = c.questions.length;
    const removeSituation = () => removeWithUndo(
      d => removeItem(d, 'competencies', c.id), renderCompetencies,
      `Removed ${situation}${questionCount ? ` and its ${questionCount === 1 ? 'question' : `${questionCount} questions`}` : ''}.`,
      'add-situation');
    const addAnother = () => update(d => addQuestion(d, c.id), renderCompetencies,
      () => focusLast(`[data-competency="${CSS.escape(c.id)}"][data-key="question"]`));
    return h('div', { class: 'item' },
      h('div', { class: 'item-head' },
        h('h3', { id: `sc-h-${c.id}` }, `${g.itemLabel} ${n}`),
        h('button', { type: 'button', class: 'button danger small', onclick: removeSituation, 'aria-label': `Remove ${situation}` }, 'Remove')),
      h('div', { class: 'field' },
        example(g.scenarioExample, situation),
        h('textarea', { 'aria-labelledby': `sc-h-${c.id}`, 'data-competency': c.id, 'data-key': 'scenario', rows: 3, value: c.scenario })),
      c.questions.map((q, j) => {
        const question = `${g.questionLabel.toLowerCase()} ${j + 1} of ${situation}`;
        const removeOne = () => removeWithUndo(d => removeQuestion(d, c.id, q.id), renderCompetencies, `Removed ${question}.`, `add-question-${c.id}`);
        return h('div', { class: 'question' },
          h('div', { class: 'item-head' },
            h('h4', { id: `q-h-${q.id}` }, `${g.questionLabel} ${j + 1}`),
            h('button', { type: 'button', class: 'button danger small', onclick: removeOne, 'aria-label': `Remove ${question}` }, 'Remove')),
          h('div', { class: 'field' },
            example(g.questionExample, question),
            h('textarea', { 'aria-labelledby': `q-h-${q.id} sc-h-${c.id}`, 'data-competency': c.id, 'data-question': q.id, 'data-key': 'question', rows: 2, value: q.question })),
          h('div', { class: 'field' },
            h('label', { for: `r-${q.id}` }, g.resultLabel, hidden(` for ${question}`)),
            example(g.resultExample, `the answer to ${question}`),
            h('textarea', { id: `r-${q.id}`, 'data-competency': c.id, 'data-question': q.id, 'data-key': 'result', rows: 2, value: q.result })));
      }),
      h('button', { type: 'button', class: 'button quiet small', id: `add-question-${c.id}`, onclick: addAnother }, `+ ${g.addQuestion}`));
  }));
}

function focusLast(selector) {
  const all = document.querySelectorAll(selector);
  all[all.length - 1]?.focus();
}

function renderForm() {
  const g = G;
  const addRequirementClick = () => update(d => addRequirement(d), renderRequirements, () => focusLast('[data-list="requirements"]'));
  const addSituationClick = () => update(d => { const n = addCompetency(d); return addQuestion(n, n.competencies.at(-1).id); },
    renderCompetencies, () => focusLast('[data-key="scenario"]'));
  $('form').replaceChildren(
    step(1, 'title', g.title,
      textField('title', 'Title', g.title.example, { multiline: false }),
      textField('keywords', g.keywords.label, g.keywords.example, { multiline: false, hint: g.keywords.prompt })),

    step(2, 'search', g.search, h('div', { id: 'search-step' })),

    step(3, 'background', g.background,
      Object.entries(g.background.fields).map(([key, f]) => textField(`background.${key}`, f.label, f.example))),

    step(4, 'requirements', g.requirements,
      h('div', { id: 'requirements-list' }),
      h('button', { type: 'button', class: 'button quiet', id: 'add-requirement', onclick: addRequirementClick }, `+ ${g.requirements.add}`)),

    step(5, 'benefits-risks', { heading: 'Benefits and risks' },
      textField('benefits', g.benefits.heading, g.benefits.example, { hint: g.benefits.prompt }),
      textField('risks', g.risks.heading, g.risks.example, { hint: g.risks.prompt, extra: checkField('noKnownRisks', g.risks.noneLabel) })),

    step(6, 'competencies', g.competencies,
      h('div', { id: 'competencies-list' }),
      h('button', { type: 'button', class: 'button quiet', id: 'add-situation', onclick: addSituationClick }, `+ ${g.competencies.add}`)),

    step(7, 'solution', g.solution,
      textField('solution', 'Suggested change', g.solution.example),
      h('div', { class: 'example-actions' },
        h('button', { type: 'button', class: 'button quiet small', id: 'mention-related', onclick: mentionRelated }, g.solution.mentionRelated)),
      checkField('allowTranscription', g.solution.transcriptionLabel)),

    step(8, 'destination', g.destination,
      h('fieldset', { class: 'destinations' },
        h('legend', { class: 'visually-hidden' }, 'Repository'),
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
        h('p', { class: 'warning output-warning', id: 'output-warning-form', hidden: true }),
        h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }))),
  );
  renderRequirements();
  renderCompetencies();
}

// ── Keeping the draft in step ──

/** An edit after a load, new draft or removal ends the chance to undo it. */
function clearUndo() {
  if (!state.undo) return;
  state.undo = null;
  $('draft-status').replaceChildren();
}

function onInput(event) {
  const t = event.target;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  const d = state.draft;
  if (t.dataset.path) {
    setPath(d, t.dataset.path, value);
    if ((t.dataset.path === 'title' || t.dataset.path === 'keywords') && !state.queryEdited) searchFromDraft();
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
  clearUndo();
  changed();
}

/** Apply a draft change, re-render what it affects, then run `after`. */
function update(fn, render, after) {
  clearUndo();
  state.draft = fn(state.draft);
  render?.();
  changed();
  after?.();
}

const persist = debounce(() => {
  if (saveToStorage(storage, state.draft) || state.autosaveWarned) return;
  state.autosaveWarned = true;
  setStatus('This browser is not keeping an automatic copy of the draft. Use "Save draft to a file" to keep your work.');
}, 300);

/** Re-render everything that depends on the draft, and schedule an autosave. */
function changed() {
  for (const status of document.querySelectorAll('.output .status')) status.textContent = '';
  const body = renderIssueBody(state.draft);
  if ($('preview-dialog').open) $('preview').textContent = body;
  renderDestination();
  renderOutput(body);
  persist();
}

// ── Search step ──

function renderSearchStep() {
  const g = G.search;
  const input = h('input', {
    type: 'search', id: 'search-input', value: state.query,
    'aria-label': 'Search existing concepts', 'aria-controls': 'search-results',
    oninput: e => { state.queryEdited = true; searchSoon(e.target.value); },
  });
  const useTitle = () => { state.queryEdited = false; input.value = searchText(state.draft); runSearch(input.value); };
  $('search-step').replaceChildren(
    h('div', { class: 'search-row' }, input,
      h('button', { type: 'button', class: 'button quiet small', onclick: useTitle }, g.useTitle)),
    h('p', { class: 'visually-hidden', id: 'search-count', role: 'status' }),
    h('div', { id: 'marked' }),
    h('div', { id: 'search-results' }));
  renderMarked();
  renderResults();
}

const searchSoon = debounce(query => runSearch(query), 150);

function searchFromDraft() {
  const text = searchText(state.draft);
  const input = $('search-input');
  if (input) input.value = text;
  searchSoon(text);
}

function runSearch(query) {
  searchSoon.cancel();
  state.query = query;
  state.expanded = { core: false, extension: false };
  state.openResults = new Set();
  state.results = state.index ? search(state.index, query) : { core: [], extension: [] };
  // The results can change the suggested destination, and so the GitHub link.
  changed();
  renderResults();
  const { core, extension } = state.results;
  setText($('search-count'), state.index && query.trim()
    ? `${core.length} matches in CASE/UCO, ${extension.length} in extensions.`
    : '');
}

const isMarked = entry => state.draft.related.some(r => r.iri === entry.iri);

function toggleMarked(entry) {
  clearUndo();
  if (isMarked(entry)) {
    state.draft.related = state.draft.related.filter(r => r.iri !== entry.iri);
  } else {
    const { iri, compactIri, label, group, tier, type, repo, mapsTo } = entry;
    state.draft.related = [...state.draft.related, { iri, compactIri, label, group, tier, type, repo, mapsTo }];
  }
  keepFocus(() => { renderMarked(); renderResults(); }, 'search-input');
  changed();
}

function renderMarked() {
  const related = state.draft.related;
  const mention = $('mention-related');
  if (mention) mention.disabled = related.length === 0;
  $('marked').replaceChildren(related.length === 0 ? '' : h('div', { class: 'marked' },
    h('h3', {}, `Marked as related (${related.length})`),
    h('ul', {}, related.map(r => h('li', {},
      h('code', {}, r.compactIri), ` (${r.group}) `,
      h('button', {
        type: 'button', class: 'link-button', 'data-focus': `unmark:${r.iri}`,
        onclick: () => toggleMarked(r), 'aria-label': `Remove ${r.compactIri} from related concepts`,
      }, 'Remove'))))));
}

/** One compact result row; clicking the row shows its description and links. */
function resultItem(entry, i, tier) {
  const g = G.search;
  const marked = isMarked(entry);
  const open = state.openResults.has(entry.iri);
  const repo = entry.tier === 'core' ? entry.repo : state.draft.destination;
  const label = entry.label && entry.label !== entry.localName && entry.label !== entry.compactIri ? entry.label : null;
  const detailsId = `result-${tier}-${i}`;
  const toggle = () => {
    if (open) state.openResults.delete(entry.iri);
    else state.openResults.add(entry.iri);
    keepFocus(renderResults);
  };
  const inName = entry.matches?.filter(m => m.where === 'name').map(m => m.term) ?? [];
  const inDescription = entry.matches?.filter(m => m.where === 'description').map(m => m.term) ?? [];
  return h('li', { class: 'result', 'data-group': entry.group, 'data-row': i },
    h('div', { class: 'result-row' },
      h('button', {
        type: 'button', class: 'result-toggle', title: entry.compactIri, 'data-focus': `row:${entry.iri}`,
        'aria-expanded': String(open), 'aria-controls': detailsId, onclick: toggle,
      },
        h('span', { class: 'chevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
        h('code', {}, entry.compactIri),
        h('span', { class: 'badge' }, entry.group),
        h('span', { class: 'badge' }, entry.type),
        label && h('span', { class: 'result-label' }, label),
        inName.length > 0 && hidden(`. Matched in name: ${inName.join(', ')}`),
        inDescription.length > 0 && hidden(`. Matched in description: ${inDescription.join(', ')}`)),
      entry.matches?.length > 0 && h('span', { class: 'match-tags', 'aria-hidden': 'true' },
        entry.matches.map(m => h('span', {
          class: `match-tag${m.where === 'description' ? ' in-description' : ''}`,
          title: m.where === 'description' ? `“${m.term}” was found in the description` : `“${m.term}” was found in the name`,
        }, m.term))),
      h('button', {
        type: 'button', class: 'button quiet small', 'aria-pressed': String(marked), 'data-focus': `mark:${entry.iri}`,
        'aria-label': `${g.mark}: ${entry.compactIri}`, onclick: () => toggleMarked(entry),
      }, marked ? `✓ ${g.unmarkShort}` : g.markShort)),
    open && h('div', { class: 'result-details', id: detailsId },
      entry.comment && h('p', { class: 'result-comment' }, entry.comment),
      entry.mapsTo?.length > 0 && h('p', { class: 'result-meta' }, 'Specialises ', entry.mapsTo.map((m, k) => [k ? ', ' : '', h('code', {}, m)])),
      entry.caseClasses?.length > 0 && h('p', { class: 'result-meta' }, 'Works with ', entry.caseClasses.map((m, k) => [k ? ', ' : '', h('code', {}, m)])),
      h('a', { href: issueSearchUrl(repo, issueTerm(entry)), target: '_blank', rel: 'noopener noreferrer' }, `${g.searchIssues} (${REPOSITORIES[repo].short})`)),
    marked && entry.tier === 'core' && h('p', { class: 'nearly-fits' }, g.nearlyFits));
}

function renderResults() {
  const g = G.search;
  const container = $('search-results');
  if (state.indexError) {
    container.replaceChildren(h('p', { class: 'warning' }, `${g.indexError} (${state.indexError})`));
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

function resultsGroup(tier, heading, note, entries, empty) {
  const open = state.groupOpen[tier];
  const shown = state.expanded[tier] ? entries : entries.slice(0, SHOWN_AT_FIRST);
  const notShown = entries.length - shown.length;
  const listId = `results-${tier}`;
  const toggleGroup = () => { state.groupOpen[tier] = !open; keepFocus(renderResults); };
  const showAll = () => {
    state.expanded[tier] = true;
    renderResults();
    // Move to the first row that was not shown before.
    $(listId)?.querySelector(`[data-row="${SHOWN_AT_FIRST}"] .result-toggle`)?.focus();
  };
  return h('div', { class: 'results-group' },
    h('h3', {},
      h('button', {
        type: 'button', class: 'group-toggle', 'data-focus': `group:${tier}`,
        'aria-expanded': String(open), 'aria-controls': listId, onclick: toggleGroup,
      }, h('span', { class: 'chevron', 'aria-hidden': 'true' }, open ? '▾' : '▸'), `${heading} (${entries.length})`)),
    open && h('div', { id: listId },
      note && h('p', { class: 'note' }, note),
      entries.length > 0 ? h('ul', { class: 'results' }, shown.map((e, i) => resultItem(e, i, tier))) : h('p', { class: 'note' }, empty),
      notShown > 0 && h('button', { type: 'button', class: 'button quiet small', onclick: showAll }, `Show all ${entries.length}`)));
}

// ── Destination and output ──

function chooseDestination(event) {
  clearUndo();
  state.draft.destinationChosen = true;
  state.draft.destination = event.target.value;
  renderResults();
  changed();
}

function renderDestination() {
  const suggestion = suggestDestination({ marked: state.draft.related, results: state.results.core });
  if (!state.draft.destinationChosen && state.draft.destination !== suggestion.repo) {
    state.draft.destination = suggestion.repo;
    for (const radio of document.querySelectorAll('input[name="destination"]')) radio.checked = radio.value === suggestion.repo;
  }
  setText($('suggestion'), describeDestination(state.draft.destination, suggestion));

  // One search per term: the title words, then each keyword.
  const terms = issueSearchTerms(state.draft);
  $('issue-links').replaceChildren(...(terms.length
    ? DESTINATIONS.map(repo => h('li', {},
      `${REPOSITORIES[repo].short} issues: `,
      terms.map((t, i) => [i ? ' · ' : '', h('a', { href: issueSearchUrl(repo, t.term, { exact: t.exact }), target: '_blank', rel: 'noopener noreferrer' }, t.exact ? `“${t.term}”` : t.term)])))
    : [h('li', {}, 'Add a title or keywords (step 1) to search existing issues.')]));
}

/** Update every "Open on GitHub" link and its warning (in the last step and in the preview). */
function renderOutput(body) {
  const title = state.draft.title.trim();
  let href = null;
  let label = 'Open on GitHub';
  let warning = 'Add a title (step 1) before opening the issue on GitHub.';
  if (title) {
    const { url, tooLong } = issueHandOff(state.draft.destination, { title, body });
    href = url;
    label = tooLong ? 'Open on GitHub (title only)' : `Open on GitHub (${REPOSITORIES[state.draft.destination].short})`;
    warning = tooLong
      ? 'This request is too long to pass to GitHub in a link. Copy the issue text first, then open GitHub and paste it into the description box.'
      : '';
  }
  for (const output of document.querySelectorAll('.output')) {
    const link = output.querySelector('.open-github');
    const note = output.querySelector('.output-warning');
    if (href) {
      link.href = href;
      for (const attr of ['aria-disabled', 'role', 'tabindex']) link.removeAttribute(attr);
    } else {
      // A link without href cannot be focused, so give it a role and tabindex
      // to keep it, and the reason it is unavailable, reachable by keyboard.
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('role', 'link');
      link.setAttribute('tabindex', '0');
    }
    if (warning) link.setAttribute('aria-describedby', note.id);
    else link.removeAttribute('aria-describedby');
    setText(link, label);
    note.hidden = !warning;
    setText(note, warning);
  }
}

async function copyText(text, near) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older route. The textarea goes next to the button, because the rest of
    // the page is inert while the preview dialog is open.
    const area = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    near.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

async function copyBody(event) {
  const output = event.target.closest('.output');
  const ok = await copyText(renderIssueBody(state.draft), output);
  output.querySelector('.status').textContent = ok
    ? 'Issue text copied. Paste it into the description box on GitHub.'
    : 'Copying failed. Open the preview and copy the text from there.';
}

function mentionRelated() {
  const names = state.draft.related.map(r => `\`${r.compactIri}\``);
  if (names.length === 0) return;
  const sentence = `This could build on the existing concepts ${names.join(', ')}.`;
  const current = state.draft.solution.trim();
  if (current.includes(sentence)) return;
  clearUndo();
  state.draft.solution = current ? `${current}\n\n${sentence}` : sentence;
  $('f-solution').value = state.draft.solution;
  changed();
}

// ── Drafts ──

/** Show a message in the status bar, optionally with an Undo button. */
function setStatus(message, undoable) {
  const status = $('draft-status');
  status.replaceChildren(message);
  if (undoable) {
    status.append(' ', h('button', { type: 'button', class: 'link-button', onclick: undo }, 'Undo'));
  }
}

function replaceDraft(draft) {
  const before = state.draft;
  state.draft = draft;
  state.queryEdited = false;
  rerenderAll();
  state.undo = before;
}

function undo() {
  if (!state.undo) return;
  const draft = state.undo;
  state.undo = null;
  state.draft = draft;
  rerenderAll();
  setStatus('Restored your previous draft.');
}

function rerenderAll() {
  if (!state.queryEdited) state.query = searchText(state.draft);
  renderForm();
  renderSearchStep();
  runSearch(state.query);
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
  if (file.size > MAX_DRAFT_FILE_BYTES) {
    setStatus(`Could not load ${file.name}: it is larger than a saved draft would be.`);
    return;
  }
  const result = parseDraft(await file.text());
  if (!result.ok) {
    setStatus(`Could not load ${file.name}: ${result.error}`);
    return;
  }
  replaceDraft(result.draft);
  setStatus(`Loaded ${file.name}. It replaced the draft you had open.`, true);
}

function newDraft() {
  replaceDraft(createDraft());
  setStatus('Started a new draft.', true);
}

// ── Preview ──

function showPreview() {
  $('preview').textContent = renderIssueBody(state.draft);
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
    // Revalidate on each visit, so a rebuilt index is picked up straight away.
    const response = await fetch('data/index.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.index = prepareIndex(data.entries);
    const { UCO, CASE } = data.versions;
    $('index-versions').textContent = UCO === CASE ? `UCO and CASE ${UCO}` : `UCO ${UCO} and CASE ${CASE}`;
    $('index-built').textContent = `Index built ${new Date(data.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  } catch (error) {
    state.indexError = error.message;
  }
  runSearch(state.query);
}

// ── Start ──

function start() {
  renderForm();
  renderSearchStep();
  changed();
}

try {
  start();
} catch (error) {
  // An autosaved draft the page cannot display should not stop the page working.
  console.error('Could not display the saved draft; starting a new one.', error);
  state.draft = createDraft();
  state.query = '';
  start();
}
setupPreview();
document.addEventListener('click', e => {
  if (e.target.closest('.copy-body')) copyBody(e);
  // A disabled "Open on GitHub" link has no href, so this only stops keyboard activation.
  if (e.target.closest('.open-github[aria-disabled="true"]')) e.preventDefault();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('.open-github[aria-disabled="true"]')) e.preventDefault();
});
// Save the last keystrokes when the tab is closed or hidden.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist.flush(); });
window.addEventListener('pagehide', () => persist.flush());
$('form').addEventListener('input', onInput);
$('form').addEventListener('submit', e => e.preventDefault());
$('save-draft').addEventListener('click', saveDraftFile);
$('load-draft').addEventListener('change', loadDraftFile);
$('new-draft').addEventListener('click', newDraft);
loadIndex();

// The draft is one plain object. Functions here return new objects rather
// than changing the one passed in, so the page can re-render from state.

export const SCHEMA_VERSION = 1;
export const DESTINATIONS = ['ucoProject/UCO', 'casework/CASE'];
const STORAGE_KEY = 'case-change-request-draft';

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createDraft() {
  return {
    schemaVersion: SCHEMA_VERSION,
    title: '',
    keywords: '',
    background: { need: '', audience: '', importance: '', details: '' },
    requirements: [],
    benefits: '',
    risks: '',
    noKnownRisks: false,
    competencies: [],
    solution: '',
    allowTranscription: false,
    related: [],
    destination: DESTINATIONS[0],
  };
}

export function addRequirement(draft, text = '') {
  return { ...draft, requirements: [...draft.requirements, { id: newId(), text }] };
}

export function addCompetency(draft, scenario = '') {
  return { ...draft, competencies: [...draft.competencies, { id: newId(), scenario, questions: [] }] };
}

export function addQuestion(draft, competencyId, question = '', result = '') {
  return {
    ...draft,
    competencies: draft.competencies.map(c =>
      c.id === competencyId ? { ...c, questions: [...c.questions, { id: newId(), question, result }] } : c),
  };
}

/** Remove an item by id from a top-level list (`requirements`, `competencies`). */
export function removeItem(draft, list, id) {
  return { ...draft, [list]: draft[list].filter(item => item.id !== id) };
}

export function removeQuestion(draft, competencyId, questionId) {
  return {
    ...draft,
    competencies: draft.competencies.map(c =>
      c.id === competencyId ? { ...c, questions: c.questions.filter(q => q.id !== questionId) } : c),
  };
}

export function serialiseDraft(draft) {
  return JSON.stringify(draft, null, 2);
}

// ── Loading ──

const isString = v => typeof v === 'string';
const isBoolean = v => typeof v === 'boolean';
const isList = check => v => Array.isArray(v) && v.every(check);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const isRequirement = v => isObject(v) && isString(v.id) && isString(v.text);
const isQuestion = v => isObject(v) && isString(v.id) && isString(v.question) && isString(v.result);
const isCompetency = v => isObject(v) && isString(v.id) && isString(v.scenario) && isList(isQuestion)(v.questions);
const isRelated = v => isObject(v) && isString(v.iri) && isString(v.compactIri) && isString(v.tier) && isString(v.group);
const isBackground = v => isObject(v) && ['need', 'audience', 'importance', 'details'].every(k => v[k] === undefined || isString(v[k]));

const FIELD_CHECKS = {
  title: isString,
  keywords: isString,
  background: isBackground,
  requirements: isList(isRequirement),
  benefits: isString,
  risks: isString,
  noKnownRisks: isBoolean,
  competencies: isList(isCompetency),
  solution: isString,
  allowTranscription: isBoolean,
  related: isList(isRelated),
  destination: v => DESTINATIONS.includes(v),
};

/**
 * Parse a saved draft. Returns { ok: true, draft } or { ok: false, error }.
 * Missing fields take their defaults; present fields must have the right type.
 */
export function parseDraft(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON, so it cannot be a saved draft.' };
  }
  if (!isObject(data)) return { ok: false, error: 'The file does not contain a draft.' };
  if (data.schemaVersion === undefined) {
    return { ok: false, error: 'The file has no schemaVersion, so it was not saved by this tool.' };
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `The file uses draft format ${data.schemaVersion}; this page reads format ${SCHEMA_VERSION}.` };
  }

  const draft = createDraft();
  const bad = [];
  for (const [field, check] of Object.entries(FIELD_CHECKS)) {
    if (data[field] === undefined) continue;
    if (!check(data[field])) bad.push(field);
    else draft[field] = field === 'background' ? { ...draft.background, ...data.background } : data[field];
  }
  if (bad.length > 0) {
    return { ok: false, error: `These fields could not be read: ${bad.join(', ')}.` };
  }
  return { ok: true, draft };
}

// ── Autosave (a convenience only: storage may be missing or blocked) ──

export function saveToStorage(storage, draft) {
  try {
    storage.setItem(STORAGE_KEY, serialiseDraft(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(storage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return null;
    const result = parseDraft(text);
    return result.ok ? result.draft : null;
  } catch {
    return null;
  }
}

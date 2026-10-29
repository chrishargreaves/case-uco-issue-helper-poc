// Keyword search over the index. Based on FOCAL's searchEntities
// (src/utils/search.js), which matches the whole query as one string; here the
// query is split into words so that "drone flight log" finds DroneFlightLog.
// A quoted phrase such as "flight path" is kept together: it matches its words
// joined in a name (FlightPath), or the phrase in a label or comment, but not
// either word alone. Entries are ranked by how many terms they match, then by
// how rare the matched words are across the index.

export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'or', 'with', 'is', 'by', 'from',
  // Words common in change-request titles that say nothing about the concept.
  'represent', 'representing', 'representation', 'new', 'add', 'adding', 'support', 'allow', 'need', 'concept',
]);

/** Crude singular form, so "logs" matches "Log". */
function singular(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function words(text) {
  if (!text) return [];
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);
}

/**
 * The search terms in a query: single words (without stop words) and quoted
 * phrases. An unclosed quote runs to the end of the query.
 */
export function parseQuery(query) {
  const terms = new Map();
  const add = (ws, phrase) => {
    const key = ws.join(' ');
    if (!terms.has(key)) terms.set(key, { words: ws, phrase, text: key, joined: ws.join('') });
  };
  for (const [, quoted, plain] of (query || '').matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const ws = words(quoted ?? plain);
    if (quoted !== undefined && ws.length > 1) add(ws, true);
    else for (const w of ws) if (!STOP_WORDS.has(w)) add([w], false);
  }
  return [...terms.values()];
}

/**
 * Precompute the searchable forms of each entry once, after loading. The
 * result also carries how many entries use each name word, so that rare
 * words count for more than common ones when ranking.
 */
export function prepareIndex(entries) {
  const prepared = entries.map(entry => ({
    entry,
    nameWords: new Set([...words(entry.localName), ...words(entry.label)]),
    nameText: `${entry.localName} ${entry.label || ''}`.toLowerCase(),
    commentWords: new Set(words(entry.comment)),
    // Forms used to match quoted phrases.
    nameJoined: words(entry.localName).join(''),
    labelPhrase: ` ${words(entry.label).join(' ')} `,
    commentPhrase: ` ${words(entry.comment).join(' ')} `,
  }));
  const frequency = new Map();
  for (const p of prepared) {
    for (const w of p.nameWords) frequency.set(w, (frequency.get(w) || 0) + 1);
  }
  prepared.weight = w => Math.log((prepared.length + 1) / ((frequency.get(w) || 0) + 1)) + 1;
  return prepared;
}

function termScore(prepared, term) {
  if (term.phrase) {
    if (prepared.nameJoined.includes(term.joined) || prepared.labelPhrase.includes(` ${term.text} `)) return 3;
    return prepared.commentPhrase.includes(` ${term.text} `) ? 1 : 0;
  }
  const w = term.text;
  if (prepared.nameWords.has(w)) return 3;
  if (prepared.nameText.includes(w)) return 2;
  return prepared.commentWords.has(w) ? 1 : 0;
}

function score(prepared, terms, weight) {
  let matched = 0;
  let total = 0;
  for (const term of terms) {
    const s = termScore(prepared, term);
    if (s > 0) matched += 1;
    // A phrase is as rare as its rarest word.
    total += s * Math.max(...term.words.map(weight));
  }
  return { matched, total };
}

/**
 * Search the prepared index. Returns { core, extension }, each ranked and
 * capped at `limit`: CASE/UCO entries in `core`, SOLVE-IT and CAC in `extension`.
 */
export function search(prepared, query, { limit = 20 } = {}) {
  const q = parseQuery(query);
  if (q.length === 0) return { core: [], extension: [] };

  const weight = prepared.weight || (() => 1);
  const hits = [];
  for (const p of prepared) {
    const { matched, total } = score(p, q, weight);
    if (matched === 0) continue;
    hits.push({ p, matched, total, startsWith: p.nameJoined.startsWith(q[0].joined) ? 1 : 0 });
  }

  hits.sort((a, b) =>
    b.matched - a.matched ||
    b.total - a.total ||
    b.startsWith - a.startsWith ||
    a.p.entry.localName.length - b.p.entry.localName.length ||
    a.p.entry.localName.localeCompare(b.p.entry.localName));

  const core = [];
  const extension = [];
  for (const { p } of hits) {
    const list = p.entry.tier === 'core' ? core : extension;
    if (list.length < limit) list.push(p.entry);
    if (core.length >= limit && extension.length >= limit) break;
  }
  return { core, extension };
}

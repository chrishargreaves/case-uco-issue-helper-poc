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
 * phrases. An unclosed quote runs to the end of the query. A word that is a
 * phrase's words joined ("flightpath" beside "flight path") is the same term,
 * so it is not counted twice.
 */
export function parseQuery(query) {
  const terms = new Map();
  // `label` is the term as typed, for showing to the user.
  const add = (ws, phrase, label) => {
    const joined = ws.join('');
    const existing = terms.get(joined);
    if (existing && (existing.phrase || !phrase)) return;
    terms.set(joined, { words: ws, phrase, text: ws.join(' '), joined, label });
  };
  for (const [, quoted, plain] of (query || '').matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const typed = (quoted ?? plain).trim().replace(/\s+/g, ' ');
    const ws = words(typed);
    if (quoted !== undefined && ws.length > 1) {
      add(ws, true, typed);
    } else {
      // A token that is one word keeps its typed form; one that splits into
      // several (camelCase, hyphens) shows each word.
      const single = ws.length === 1 ? typed.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') : null;
      for (const w of ws) if (!STOP_WORDS.has(w)) add([w], false, single ?? w);
    }
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
    const inText = text => text.includes(` ${term.text} `) || text.includes(` ${term.joined} `);
    if (prepared.nameJoined.includes(term.joined) || inText(prepared.labelPhrase)) return 3;
    return inText(prepared.commentPhrase) ? 1 : 0;
  }
  const w = term.text;
  if (prepared.nameWords.has(w)) return 3;
  if (prepared.nameText.includes(w)) return 2;
  return prepared.commentWords.has(w) ? 1 : 0;
}

function score(prepared, terms, weight) {
  const matches = [];
  let total = 0;
  for (const term of terms) {
    const s = termScore(prepared, term);
    // A score of 1 means the term was found only in the description.
    if (s > 0) matches.push({ term: term.label, where: s === 1 ? 'description' : 'name' });
    // A phrase is as rare as its rarest word.
    total += s * Math.max(...term.words.map(weight));
  }
  return { matches, matched: matches.length, total };
}

/**
 * Search the prepared index. Returns { core, extension }, each ranked and
 * capped at `limit`: CASE/UCO entries in `core`, SOLVE-IT and CAC in `extension`.
 * Each result is a copy of its index entry with `matches`: the terms it
 * matched, and whether each was found in the name or only the description.
 */
export function search(prepared, query, { limit = 20 } = {}) {
  const q = parseQuery(query);
  if (q.length === 0) return { core: [], extension: [] };

  const weight = prepared.weight || (() => 1);
  const hits = [];
  for (const p of prepared) {
    const { matches, matched, total } = score(p, q, weight);
    if (matched === 0) continue;
    hits.push({ p, matches, matched, total, startsWith: p.nameJoined.startsWith(q[0].joined) ? 1 : 0 });
  }

  hits.sort((a, b) =>
    b.matched - a.matched ||
    b.total - a.total ||
    b.startsWith - a.startsWith ||
    a.p.entry.localName.length - b.p.entry.localName.length ||
    a.p.entry.localName.localeCompare(b.p.entry.localName));

  const core = [];
  const extension = [];
  for (const { p, matches } of hits) {
    const list = p.entry.tier === 'core' ? core : extension;
    if (list.length < limit) list.push({ ...p.entry, matches });
    if (core.length >= limit && extension.length >= limit) break;
  }
  return { core, extension };
}

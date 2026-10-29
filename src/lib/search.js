// Keyword search over the index. Based on FOCAL's searchEntities
// (src/utils/search.js), which matches the whole query as one string; here the
// query is split into words so phrases such as "drone flight log" find
// DroneFlightLog, and entries are ranked by how many words they match.

const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'or', 'with', 'is', 'by', 'from']);

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

export function queryWords(query) {
  return [...new Set(words(query).filter(w => !STOP_WORDS.has(w)))];
}

/** Precompute the searchable forms of each entry once, after loading. */
export function prepareIndex(entries) {
  return entries.map(entry => ({
    entry,
    nameWords: new Set([...words(entry.localName), ...words(entry.label)]),
    nameText: `${entry.localName} ${entry.label || ''}`.toLowerCase(),
    commentWords: new Set(words(entry.comment)),
    localNameLower: entry.localName.toLowerCase(),
  }));
}

function score(prepared, query) {
  let matched = 0;
  let total = 0;
  for (const w of query) {
    let s = 0;
    if (prepared.nameWords.has(w)) s = 3;
    else if (prepared.nameText.includes(w)) s = 2;
    else if (prepared.commentWords.has(w)) s = 1;
    if (s > 0) matched += 1;
    total += s;
  }
  return { matched, total };
}

/**
 * Search the prepared index. Returns { core, extension }, each ranked and
 * capped at `limit`: CASE/UCO entries in `core`, SOLVE-IT and CAC in `extension`.
 */
export function search(prepared, query, { limit = 20 } = {}) {
  const q = queryWords(query);
  if (q.length === 0) return { core: [], extension: [] };

  const hits = [];
  for (const p of prepared) {
    const { matched, total } = score(p, q);
    if (matched === 0) continue;
    hits.push({ p, matched, total, startsWith: p.localNameLower.startsWith(q[0]) ? 1 : 0 });
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

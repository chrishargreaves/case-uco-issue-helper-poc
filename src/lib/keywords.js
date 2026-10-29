import { STOP_WORDS } from './search.js';

// Keywords are other words for the concept, typed as one comma-separated
// line. They widen the concept search and the GitHub issue searches; they are
// not part of the filed issue, because the template has no place for them.

/** The keyword list: split on commas, semicolons or new lines, without blanks or repeats. */
export function parseKeywords(text) {
  const seen = new Set();
  const keywords = [];
  for (const part of (text || '').split(/[,;\n]/)) {
    const keyword = part.replace(/"/g, '').trim();
    if (!keyword || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    keywords.push(keyword);
  }
  return keywords;
}

/**
 * The text the concept search starts from: the title, then the keywords. A
 * keyword of several words is quoted, so the search keeps it together.
 */
export function searchText(draft) {
  const keywords = parseKeywords(draft.keywords).map(k => (/\s/.test(k) ? `"${k}"` : k));
  return [draft.title.trim(), ...keywords].filter(Boolean).join(' ');
}

/**
 * The GitHub issue searches to offer. The title is searched as its words in
 * any order, without request words such as "represent", because an existing
 * issue is unlikely to use the same title word for word. Each keyword is
 * searched as a phrase.
 */
export function issueSearchTerms(draft) {
  const titleWords = draft.title.trim().split(/\s+/).filter(w => w && !STOP_WORDS.has(w.toLowerCase()));
  const terms = [];
  if (titleWords.length > 0) {
    terms.push({ term: titleWords.join(' '), exact: false });
  }
  for (const keyword of parseKeywords(draft.keywords)) terms.push({ term: keyword, exact: true });
  return terms;
}

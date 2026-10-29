// Builds data/index.json from the upstream ontologies listed in lib/sources.js.
// Run with `npm run build-index`. An extension source (SOLVE-IT, CAC) that
// fails is reported and skipped. If any CASE/UCO source fails, no index is
// written, because a partial CASE/UCO index would hide existing concepts.
import { writeFileSync, mkdirSync } from 'node:fs';
import { SOURCES, VERSIONS, assertAllowedUrl } from './lib/sources.js';
import { fetchText, parseTurtle } from './lib/parse.js';
import { buildIndex, extractDeclaredVersion, extractEntries } from './lib/extract.js';

const OUTPUT = new URL('../data/index.json', import.meta.url);
const CONCURRENCY = 6;

// Long comments are trimmed: the index is for finding candidates, and the
// full text is one click away in the ontology itself.
const MAX_COMMENT = 400;

async function load(source) {
  assertAllowedUrl(source.url);
  const text = await fetchText(source.url);
  const { store } = await parseTurtle(text, source.url);
  return { source, store, extracted: extractEntries(store, source) };
}

async function loadAll(sources) {
  const results = new Array(sources.length);
  let next = 0;
  async function worker() {
    while (next < sources.length) {
      const i = next++;
      try {
        results[i] = { ok: true, ...(await load(sources[i])) };
      } catch (error) {
        results[i] = { ok: false, source: sources[i], error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function trim(text) {
  if (!text || text.length <= MAX_COMMENT) return text;
  return text.slice(0, MAX_COMMENT).replace(/\s+\S*$/, '') + '…';
}

const results = await loadAll(SOURCES);
const loaded = results.filter(r => r.ok);

const report = results.map(r => ({
  id: r.source.id,
  group: r.source.group,
  tier: r.source.tier,
  url: r.source.url,
  status: r.ok ? 'ok' : 'failed',
  ...(r.ok
    ? { entries: r.extracted.length, version: extractDeclaredVersion(r.store) }
    : { error: r.error }),
}));

for (const row of report) {
  const detail = row.status === 'ok' ? `${row.entries} entries${row.version ? `, v${row.version}` : ''}` : `FAILED: ${row.error}`;
  console.log(`${row.status === 'ok' ? '  ' : '! '}${row.id.padEnd(36)} ${detail}`);
}

if (results.some(r => !r.ok && r.source.tier === 'core')) {
  console.error('A CASE/UCO source could not be read; index not written.');
  process.exit(1);
}

const entries = buildIndex(loaded).map(e => ({ ...e, comment: trim(e.comment) }));

const index = {
  builtAt: new Date().toISOString(),
  versions: VERSIONS,
  sources: report,
  entries,
};

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(index));

const byGroup = Object.groupBy(entries, e => e.group);
console.log(`\nWrote ${entries.length} entries: ${Object.entries(byGroup).map(([g, list]) => `${g} ${list.length}`).join(', ')}`);
const failed = report.filter(r => r.status !== 'ok');
if (failed.length > 0) console.log(`${failed.length} source(s) failed; see above.`);

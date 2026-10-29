// Adapted from FOCAL (rebuildEntityIndex in src/store/ontologyStore.js and
// src/utils/ontologyVersion.js). Differences: entries carry a tier and the
// repository a change request would go to, SOLVE-IT techniques are indexed
// from the knowledge base, and extension classes record the nearest CASE/UCO
// classes they specialise.
import { DataFactory } from 'n3';
import { WELL_KNOWN_PREFIXES, compactIri, extractLocalName } from './prefixes.js';

const { namedNode } = DataFactory;

const RDF = WELL_KNOWN_PREFIXES.rdf;
const RDFS = WELL_KNOWN_PREFIXES.rdfs;
const OWL = WELL_KNOWN_PREFIXES.owl;
const SOLVEIT_CORE = WELL_KNOWN_PREFIXES['solveit-core'];

const RDF_TYPE = namedNode(RDF + 'type');
const RDFS_LABEL = namedNode(RDFS + 'label');
const RDFS_COMMENT = namedNode(RDFS + 'comment');
const RDFS_SUBCLASS_OF = namedNode(RDFS + 'subClassOf');
const OWL_EQUIVALENT_CLASS = namedNode(OWL + 'equivalentClass');
const OWL_ONTOLOGY = namedNode(OWL + 'Ontology');
const OWL_VERSION_INFO = namedNode(OWL + 'versionInfo');
const OWL_VERSION_IRI = namedNode(OWL + 'versionIRI');

const SOLVEIT_TECHNIQUE = SOLVEIT_CORE + 'Technique';
const TECHNIQUE_ID = namedNode(SOLVEIT_CORE + 'techniqueID');
const TECHNIQUE_DESCRIPTION = namedNode(SOLVEIT_CORE + 'techniqueDescription');
const CASE_CLASS_LINKS = [
  namedNode(SOLVEIT_CORE + 'hasCASEInputClass'),
  namedNode(SOLVEIT_CORE + 'hasCASEOutputClass'),
];

const ENTRY_TYPES = {
  [OWL + 'Class']: 'class',
  [RDFS + 'Class']: 'class',
  [OWL + 'ObjectProperty']: 'property',
  [OWL + 'DatatypeProperty']: 'property',
  [OWL + 'AnnotationProperty']: 'property',
  [OWL + 'NamedIndividual']: 'individual',
};

const CORE_NAMESPACES = [
  'https://ontology.unifiedcyberontology.org/',
  'https://ontology.caseontology.org/',
];

export function isCoreIri(iri) {
  return CORE_NAMESPACES.some(ns => iri.startsWith(ns));
}

/** Prefer an English or untagged literal; fall back to the first one. */
function literal(store, subject, predicate) {
  const values = store.getObjects(subject, predicate, null).filter(o => o.termType === 'Literal');
  if (values.length === 0) return null;
  const preferred = values.find(v => v.language === 'en') || values.find(v => !v.language) || values[0];
  return preferred.value.trim();
}

function baseEntry(iri, type, source) {
  const entry = {
    iri,
    localName: extractLocalName(iri),
    compactIri: compactIri(iri),
    type,
    group: source.group,
    tier: source.tier,
    sourceId: source.id,
  };
  if (source.repo) entry.repo = source.repo;
  return entry;
}

function techniqueEntries(store, source) {
  const entries = [];
  for (const subject of store.getSubjects(RDF_TYPE, namedNode(SOLVEIT_TECHNIQUE), null)) {
    if (subject.termType !== 'NamedNode') continue;
    const entry = baseEntry(subject.value, 'technique', source);
    // Techniques are known by their ID (DFT-1001), not by a prefixed IRI.
    const id = literal(store, subject, TECHNIQUE_ID);
    if (id) entry.compactIri = id;
    entry.label = literal(store, subject, RDFS_LABEL);
    entry.comment = literal(store, subject, TECHNIQUE_DESCRIPTION);
    const caseClasses = CASE_CLASS_LINKS
      .flatMap(p => store.getObjects(subject, p, null))
      .filter(o => o.termType === 'NamedNode')
      .map(o => compactIri(o.value));
    if (caseClasses.length > 0) entry.caseClasses = [...new Set(caseClasses)];
    entries.push(entry);
  }
  return entries;
}

/**
 * Index entries for one parsed source. The SOLVE-IT knowledge base
 * contributes techniques only; every other source contributes its classes,
 * properties and named individuals.
 */
export function extractEntries(store, source) {
  if (source.kind === 'solveit-kb') return techniqueEntries(store, source);

  const byIri = new Map();
  for (const quad of store.getQuads(null, RDF_TYPE, null, null)) {
    if (quad.subject.termType !== 'NamedNode') continue;
    const type = ENTRY_TYPES[quad.object.value];
    if (!type) continue;
    const iri = quad.subject.value;
    // A class declaration outranks any other declaration of the same IRI.
    const existing = byIri.get(iri);
    if (existing && (existing.type === 'class' || existing.type === type)) continue;
    const entry = baseEntry(iri, type, source);
    entry.label = literal(store, quad.subject, RDFS_LABEL);
    entry.comment = literal(store, quad.subject, RDFS_COMMENT);
    byIri.set(iri, entry);
  }
  return [...byIri.values()];
}

/** Named parents of each class, from rdfs:subClassOf and owl:equivalentClass. */
export function extractParentLinks(store) {
  const links = new Map();
  for (const predicate of [RDFS_SUBCLASS_OF, OWL_EQUIVALENT_CLASS]) {
    for (const quad of store.getQuads(null, predicate, null, null)) {
      if (quad.subject.termType !== 'NamedNode' || quad.object.termType !== 'NamedNode') continue;
      const parents = links.get(quad.subject.value) || [];
      if (!parents.includes(quad.object.value)) parents.push(quad.object.value);
      links.set(quad.subject.value, parents);
    }
  }
  return links;
}

/** Every class reachable upwards from `iri`, not including `iri` itself. */
function ancestors(iri, links) {
  const seen = new Set();
  const queue = [...(links.get(iri) || [])];
  while (queue.length > 0) {
    const parent = queue.shift();
    if (seen.has(parent) || parent === iri) continue;
    seen.add(parent);
    queue.push(...(links.get(parent) || []));
  }
  return seen;
}

/**
 * The most specific CASE/UCO classes reachable upwards from an extension
 * class. The search stops at the first core class on each path, and a core
 * class that is itself an ancestor of another one found is dropped, so a
 * class equivalent to case-investigation:Investigation is not also reported
 * as a uco-core:UcoObject.
 */
function nearestCoreAncestors(iri, links) {
  const found = new Set();
  const seen = new Set([iri]);
  const queue = [...(links.get(iri) || [])];
  while (queue.length > 0) {
    const parent = queue.shift();
    if (seen.has(parent)) continue;
    seen.add(parent);
    if (isCoreIri(parent)) {
      found.add(parent);
      continue;
    }
    queue.push(...(links.get(parent) || []));
  }
  const implied = new Set([...found].flatMap(core => [...ancestors(core, links)]));
  return [...found].filter(core => !implied.has(core));
}

/**
 * Merge parsed sources into one entry list. The first source to declare an
 * IRI wins, so source order matters: CASE/UCO come first. A later declaration
 * only fills in a missing label or comment. Each item may carry `extracted`,
 * the entries already taken from that source, to avoid extracting twice.
 */
export function buildIndex(parsedSources) {
  const entries = new Map();
  const links = new Map();

  for (const { source, store, extracted } of parsedSources) {
    for (const entry of extracted ?? extractEntries(store, source)) {
      const existing = entries.get(entry.iri);
      if (!existing) {
        entries.set(entry.iri, entry);
      } else {
        // UCO core.ttl names some classes (uco-action:Action) with no label or
        // comment; the defining module, read later, supplies them.
        existing.label ??= entry.label;
        existing.comment ??= entry.comment;
      }
    }
    for (const [child, parents] of extractParentLinks(store)) {
      const merged = links.get(child) || [];
      for (const p of parents) if (!merged.includes(p)) merged.push(p);
      links.set(child, merged);
    }
  }

  for (const entry of entries.values()) {
    if (entry.tier !== 'extension' || entry.type !== 'class') continue;
    const ancestors = nearestCoreAncestors(entry.iri, links);
    if (ancestors.length > 0) entry.mapsTo = ancestors.map(compactIri).sort();
  }

  return [...entries.values()];
}

// ── Declared versions (from FOCAL src/utils/ontologyVersion.js) ──

const VERSION_PATTERN = /^v?\d+(\.\d+)*$/;

function versionFromIri(iri) {
  const segment = iri.replace(/[/#]+$/, '').split(/[/#]/).pop() || '';
  return VERSION_PATTERN.test(segment) ? segment.replace(/^v/, '') : null;
}

/** The version an ontology declares about itself, or null. */
export function extractDeclaredVersion(store) {
  for (const subject of store.getSubjects(RDF_TYPE, OWL_ONTOLOGY, null)) {
    if (subject.termType !== 'NamedNode') continue;
    const info = store.getObjects(subject, OWL_VERSION_INFO, null)
      .find(o => o.termType === 'Literal' && VERSION_PATTERN.test(o.value.trim()));
    if (info) return info.value.trim().replace(/^v/, '');
    const versionIri = store.getObjects(subject, OWL_VERSION_IRI, null).find(o => o.termType === 'NamedNode');
    const derived = versionIri ? versionFromIri(versionIri.value) : null;
    if (derived) return derived;
  }
  return null;
}

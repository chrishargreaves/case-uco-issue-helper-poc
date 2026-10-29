// Adapted from FOCAL (src/store/config.js), pinned to UCO and CASE 1.5.0.
// Left out compared with FOCAL: the UCO/CASE master files (imports only),
// CASE facet cardinalities, the AI-generated UCO/CASE extensions, and every
// SHACL shapes file. CAC example knowledge graphs are never fetched: several
// appear to be based on real cases.

const UCO_REF = '1.5.0';
const CASE_REF = '1.5.0';

const UCO_BASE = `https://raw.githubusercontent.com/ucoProject/UCO/${UCO_REF}/ontology`;
const CASE_BASE = `https://raw.githubusercontent.com/casework/CASE/${CASE_REF}/ontology`;
const SOLVEIT_BASE = 'https://raw.githubusercontent.com/SOLVE-IT-DF/solve-it-ontology/main';
const CAC_BASE = 'https://raw.githubusercontent.com/Project-VIC-International/CAC-Ontology/main/ontology';

export const VERSIONS = { UCO: UCO_REF, CASE: CASE_REF };

const uco = (id, path) => ({
  id: `uco-${id}`, name: `UCO ${id}`, url: `${UCO_BASE}/${path}`,
  group: 'UCO', tier: 'core', repo: 'ucoProject/UCO',
});
const caseOnt = (id, path) => ({
  id: `case-${id}`, name: `CASE ${id}`, url: `${CASE_BASE}/${path}`,
  group: 'CASE', tier: 'core', repo: 'casework/CASE',
});
const solveit = (id, path, kind) => ({
  id: `solveit-${id}`, name: `SOLVE-IT ${id}`, url: `${SOLVEIT_BASE}/${path}`,
  group: 'SOLVE-IT', tier: 'extension', ...(kind ? { kind } : {}),
});
const cac = id => ({
  id: `cac-${id}`, name: `CAC ${id}`, url: `${CAC_BASE}/cacontology-${id}.ttl`,
  group: 'CAC', tier: 'extension',
});

const UCO_SOURCES = [
  uco('core', 'uco/core/core.ttl'),
  uco('observable', 'uco/observable/observable.ttl'),
  uco('action', 'uco/action/action.ttl'),
  uco('analysis', 'uco/analysis/analysis.ttl'),
  uco('configuration', 'uco/configuration/configuration.ttl'),
  uco('identity', 'uco/identity/identity.ttl'),
  uco('location', 'uco/location/location.ttl'),
  uco('marking', 'uco/marking/marking.ttl'),
  uco('pattern', 'uco/pattern/pattern.ttl'),
  uco('role', 'uco/role/role.ttl'),
  uco('time', 'uco/time/time.ttl'),
  uco('tool', 'uco/tool/tool.ttl'),
  uco('types', 'uco/types/types.ttl'),
  uco('victim', 'uco/victim/victim.ttl'),
  uco('vocabulary', 'uco/vocabulary/vocabulary.ttl'),
  uco('co', 'co/co.ttl'),
  uco('owl', 'owl/owl.ttl'),
];

const CASE_SOURCES = [
  caseOnt('investigation', 'investigation/investigation.ttl'),
  caseOnt('vocabulary', 'vocabulary/vocabulary.ttl'),
];

const SOLVEIT_SOURCES = [
  solveit('core', 'solve_it_core.ttl'),
  solveit('analysis', 'solve_it_analysis.ttl'),
  solveit('observable', 'solve_it_observable.ttl'),
  solveit('observable-acquisition', 'solve_it_observable_acquisition.ttl'),
  solveit('observable-search', 'solve_it_observable_search.ttl'),
  solveit('observable-timeline', 'solve_it_observable_timeline.ttl'),
  solveit('sqlite', 'solve_it_sqlite.ttl'),
  solveit('tool-profile', 'solve_it_tool_profile.ttl'),
  solveit('weakness-assessment', 'solve_it_weakness_assessment.ttl'),
  solveit('kb', 'docs/data/solve-it-kb.ttl', 'solveit-kb'),
];

const CAC_SOURCES = [
  'core', 'core-spine', 'ai-csam', 'analyst-wellbeing', 'asset-forfeiture',
  'athletic-exploitation', 'bridge-case', 'bridge-gufo', 'bridge-uco',
  'case-management', 'custodial', 'detection', 'educational-exploitation',
  'extremist-enterprises', 'forensics', 'grooming', 'integration-patterns',
  'hotlines', 'institutional-exploitation', 'international',
  'investigation-coordination', 'law-enforcement-corruption',
  'legal-harmonization', 'multi-jurisdiction', 'partnerships',
  'physical-evidence', 'platform-infrastructure', 'platforms', 'prevention',
  'production', 'recantation', 'recruitment-networks', 'legal-outcomes',
  'sex-offender-registry', 'sex-trafficking', 'sextortion',
  'sadistic-online-exploitation', 'specialized-units', 'stranger-abduction',
  'street-recruitment', 'synthesis', 'tactical', 'taskforce', 'temporal',
  'training', 'undercover', 'us-ncmec', 'usa-federal-law', 'usa-legislative',
  'victim-impact',
].map(cac);

// Order matters: the first source to declare an IRI wins, so CASE/UCO come first.
export const SOURCES = [...UCO_SOURCES, ...CASE_SOURCES, ...SOLVEIT_SOURCES, ...CAC_SOURCES];

const DISALLOWED = [/examples_knowledge_graphs\//, /analytics_demonstration\//, /-shapes\.ttl$/];

/** Throws if a URL points at example graphs or a shapes file. */
export function assertAllowedUrl(url) {
  const match = DISALLOWED.find(pattern => pattern.test(url));
  if (match) throw new Error(`Refusing to fetch ${url} (matches ${match})`);
}

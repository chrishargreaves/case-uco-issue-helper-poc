// Chooses which repository a change request should go to. UCO is the default;
// CASE is suggested when most of the related CASE/UCO concepts are in CASE.
// Extension concepts (SOLVE-IT, CAC) never change the destination, because
// neither project takes CASE/UCO change requests.

export const REPOSITORIES = {
  'ucoProject/UCO': {
    name: 'UCO (Unified Cyber Ontology)',
    covers: 'general concepts for the cyber domain: devices, files, accounts, messages, network traffic, tools, identities, locations and the actions performed on them.',
  },
  'casework/CASE': {
    name: 'CASE (Cyber-investigation Analysis Standard Expression)',
    covers: 'concepts specific to investigations: investigative actions, examiners and investigators, authorisations, provenance records and the chain of evidence.',
  },
};

const DEFAULT_REPO = 'ucoProject/UCO';
const TOP_RESULTS = 5;

export function suggestDestination({ marked = [], results = [] }) {
  const markedCore = marked.filter(c => c.tier === 'core');
  const basis = markedCore.length > 0 ? 'marked' : 'results';
  const considered = markedCore.length > 0 ? markedCore : results.filter(c => c.tier === 'core').slice(0, TOP_RESULTS);

  if (considered.length === 0) {
    return {
      repo: DEFAULT_REPO,
      basis: 'default',
      reason: 'No related CASE/UCO concepts have been found yet, so UCO is suggested. Most new concepts are general cyber-domain concepts, which belong in UCO.',
    };
  }

  const inCase = considered.filter(c => c.repo === 'casework/CASE').length;
  const inUco = considered.length - inCase;
  const what = basis === 'marked'
    ? ['CASE/UCO concept you marked as related', 'CASE/UCO concepts you marked as related']
    : ['closest CASE/UCO search result', 'closest CASE/UCO search results'];
  const share = (count, repo) => {
    if (considered.length === 1) return `The only ${what[0]} is in ${repo}`;
    if (count === considered.length) return `All ${count} ${what[1]} are in ${repo}`;
    return `${count} of the ${considered.length} ${what[1]} are in ${repo}`;
  };

  if (inCase > inUco) {
    return {
      repo: 'casework/CASE',
      basis,
      reason: `${share(inCase, 'CASE')}, so this request is probably about investigations rather than general cyber-domain concepts.`,
    };
  }
  return { repo: DEFAULT_REPO, basis, reason: `${share(inUco, 'UCO')}.` };
}

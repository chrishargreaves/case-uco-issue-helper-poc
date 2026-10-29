// Chooses which repository a change request should go to. UCO is the default;
// CASE is suggested when most of the related CASE/UCO concepts are in CASE.
// Extension concepts (SOLVE-IT, CAC) never change the destination, because
// neither project takes CASE/UCO change requests.

export const REPOSITORIES = {
  'ucoProject/UCO': {
    short: 'UCO',
    name: 'UCO (Unified Cyber Ontology)',
    covers: 'general concepts for the cyber domain: devices, files, accounts, messages, network traffic, tools, identities, locations and the actions performed on them.',
  },
  'casework/CASE': {
    short: 'CASE',
    name: 'CASE (Cyber-investigation Analysis Standard Expression)',
    covers: 'concepts specific to investigations: investigative actions, examiners and investigators, authorisations, provenance records and the chain of evidence.',
  },
};

const DEFAULT_REPO = 'ucoProject/UCO';
const TOP_RESULTS = 5;

/** "because …" for the concepts counted, worded for one, two or more. */
function because(count, total, repo, { marked, onlyCore }) {
  if (!marked) {
    if (total === 1) return `because your top search result is in ${repo}`;
    if (count === total) return `because all your top ${total} search results are in ${repo}`;
    return `because ${count} of your top ${total} search results are in ${repo}`;
  }
  const noun = onlyCore ? 'concept' : 'CASE/UCO concept';
  if (total === 1) return `because the ${noun} you marked is in ${repo}`;
  if (count === total) return `because ${total === 2 ? 'both' : `all ${total}`} ${noun}s you marked are in ${repo}`;
  return `because ${count} of the ${total} ${noun}s you marked are in ${repo}`;
}

/**
 * The suggested repository. `reason` is a clause that follows the repository
 * name, e.g. "UCO, because the concept you marked is in UCO".
 */
export function suggestDestination({ marked = [], results = [] }) {
  const markedCore = marked.filter(c => c.tier === 'core');
  const usesMarked = markedCore.length > 0;
  const considered = usesMarked ? markedCore : results.filter(c => c.tier === 'core').slice(0, TOP_RESULTS);

  if (considered.length === 0) {
    return { repo: DEFAULT_REPO, basis: 'default', reason: 'the default for new concepts' };
  }

  const inCase = considered.filter(c => c.repo === 'casework/CASE').length;
  const inUco = considered.length - inCase;
  const repo = inCase > inUco ? 'casework/CASE' : DEFAULT_REPO;
  const count = repo === DEFAULT_REPO ? inUco : inCase;
  return {
    repo,
    basis: usesMarked ? 'marked' : 'results',
    reason: because(count, considered.length, REPOSITORIES[repo].short, {
      marked: usesMarked,
      onlyCore: markedCore.length === marked.length,
    }),
  };
}

/** The sentence shown under the choice of repository. */
export function describeDestination(chosen, suggestion) {
  const suggested = `${REPOSITORIES[suggestion.repo].short}, ${suggestion.reason}`;
  const filed = `It will be filed in ${chosen} on GitHub.`;
  if (chosen === suggestion.repo) return `Suggested: ${suggested}. ${filed}`;
  return `You chose ${REPOSITORIES[chosen].short}. The suggestion was ${suggested}. ${filed}`;
}

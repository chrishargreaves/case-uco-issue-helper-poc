// Builds GitHub links. The issue is filed by the submitter on GitHub's own
// new-issue page, so this tool needs no sign-in and never posts anything.

import { DESTINATIONS } from './draft.js';

// GitHub rejects very long URLs and does not document the limit. Tested on
// 2026-10-29 while signed out: 6,000 characters redirected to sign-in
// normally, 7,000-8,000 gave server errors, 9,000 and above gave 414. Above
// this threshold the clipboard is the fallback.
export const MAX_URL_LENGTH = 6000;

const LABEL = 'change request';

function assertKnownRepo(repo) {
  if (!DESTINATIONS.includes(repo)) throw new Error(`Unknown repository: ${repo}`);
}

export function newIssueUrl(repo, { title, body }) {
  assertKnownRepo(repo);
  const params = new URLSearchParams();
  params.set('title', title);
  if (body !== undefined) params.set('body', body);
  params.set('labels', LABEL);
  return `https://github.com/${repo}/issues/new?${params}`;
}

/**
 * The URL to open, and whether the body had to be left out because the URL
 * would be too long. When it is too long, the submitter pastes the body from
 * the clipboard instead.
 */
export function issueHandOff(repo, { title, body }) {
  const full = newIssueUrl(repo, { title, body });
  if (full.length <= MAX_URL_LENGTH) return { url: full, tooLong: false };
  return { url: newIssueUrl(repo, { title }), tooLong: true };
}

/** Search a repository's issues, open and closed, for a term. */
export function issueSearchUrl(repo, term) {
  assertKnownRepo(repo);
  const trimmed = term.trim();
  const quoted = /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
  const params = new URLSearchParams({ q: `is:issue ${quoted}` });
  return `https://github.com/${repo}/issues?${params}`;
}

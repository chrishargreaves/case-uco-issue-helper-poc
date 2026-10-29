// Adapted from FOCAL (src/utils/rdfParser.js): the sessionStorage cache is
// dropped because the build runs once under Node, and fetching is separated
// from parsing so tests can parse fixtures without a network.
import { Parser, Store } from 'n3';
import { registerPrefixes } from './prefixes.js';

export async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

export function parseTurtle(ttlText, baseIRI) {
  const store = new Store();
  return new Promise((resolve, reject) => {
    const parser = new Parser({ baseIRI });
    parser.parse(ttlText, (error, quad, prefixes) => {
      if (error) {
        reject(error);
        return;
      }
      if (quad) {
        store.addQuad(quad);
      } else {
        if (prefixes) registerPrefixes(prefixes);
        resolve({ store, prefixes: prefixes || {} });
      }
    });
  });
}

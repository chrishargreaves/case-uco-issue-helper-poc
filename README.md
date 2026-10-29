⚠️ **Note this is an AI generated application.** See credits and disclaimer below.

# CASE/UCO change request helper

This **prototype** is a single static web page for requesting a new concept in CASE or UCO. It asks for each part of the [UCO change request template](https://github.com/ucoProject/UCO/blob/master/.github/ISSUE_TEMPLATE/change-request.md) in plain language, with worked examples, and builds the issue text as it is filled in. A search over the existing ontologies shows whether the concept already exists, either in CASE/UCO or in an extension (SOLVE-IT, or the Crimes Against Children ontology from Project VIC). The finished request is filed by the submitter on GitHub's own new-issue page, so the page needs no sign-in and sends nothing itself.

The prototype covers requests for an entirely new concept. Requests to correct or extend an existing class or property start from the existing concept, and are not yet guided.

## Running it locally

The page uses JavaScript modules and loads the search index with `fetch`, and browsers block both for pages opened directly from disk. It therefore needs to be served, for example:

```
npm run serve
```

and then opened at <http://localhost:8000/>. Any static web server will do; `npm run serve` uses Python's built-in `http.server`.

## Rebuilding the search index

The search index (`data/index.json`) is built ahead of time and committed, so the page itself needs no RDF library. To rebuild it from the upstream ontologies:

```
npm install
npm run build-index
```

The script reports each source and the number of entries taken from it. A source that cannot be fetched or parsed is reported and skipped. If no CASE/UCO source can be read, no index is written.

The sources are listed in `scripts/lib/sources.js`:

- UCO and CASE, pinned to release 1.5.0. The master files (imports only) are left out.
- The SOLVE-IT ontology modules, and the techniques from the SOLVE-IT knowledge base. Weaknesses, mitigations, citations and objectives are not indexed.
- The Crimes Against Children (CAC) ontology modules (`ontology/cacontology-*.ttl`, Apache 2.0). Its SHACL shapes files are not indexed, and its example knowledge graphs are never fetched, because several appear to be based on real cases. `assertAllowedUrl` refuses any such URL.

For extension classes, the index records the most specific CASE/UCO classes they specialise, following `rdfs:subClassOf` and `owl:equivalentClass` upwards through the extension's own classes. The search results and the filed request show these as "specialises".

## Tests

```
npm test
```

The tests use Node's built-in test runner and cover the index extraction, the draft format, the issue text, search, the UCO/CASE suggestion and the GitHub links. The page's DOM wiring (`src/app.js`) has no automated tests and was checked by hand in a browser.

## What is known about GitHub's behaviour

The page opens `https://github.com/<repo>/issues/new` with `title`, `body` and `labels=change+request` in the URL.

- **URL length.** GitHub does not document a limit. Tested on 2026-10-29 while signed out: a URL of approximately 6,000 characters was redirected to the sign-in page normally, 7,000 to 8,000 characters gave server errors, and 9,000 or more gave `414 URI Too Long`. The page therefore leaves the body out of URLs longer than 6,000 characters and asks the submitter to paste it from the clipboard. The limit for a signed-in user may be higher; this has not been tested.
- **Body and label.** When signed out, GitHub's sign-in redirect keeps the parameters in `return_to`. Whether the body and label are then applied, and whether `labels` is applied for submitters without triage rights on the repository, has not been checked, because the test browser was not signed in to GitHub.
- **Template.** The page does not pass `template=change-request.md`, so it cannot interfere with the body. Whether passing both would keep the body has not been tested.

## Layout

| Path | Contents |
|---|---|
| `index.html`, `assets/styles.css` | The page and its styles |
| `src/app.js` | DOM wiring only |
| `src/lib/` | Draft format, issue text, search, destination suggestion and GitHub links |
| `src/content/guidance.js` | The prompts, explanations and worked examples shown on the page |
| `scripts/` | The index build script and its source list |
| `data/index.json` | The generated search index |
| `docs/plans/` | The plan the prototype was built from |

Parts of the index build are adapted from [FOCAL](https://github.com/chrishargreaves/FOCAL) (source list, Turtle parsing, entity indexing, prefix handling and version detection). They are copied rather than imported, so changes to FOCAL do not affect this project.

# Credits and disclaimer

- software conceptualisation, design and architecture - Chris Hargreaves
- code - Claude Opus 5.5

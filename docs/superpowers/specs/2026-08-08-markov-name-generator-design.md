# Markov-Chain Name Generator — Design

## Summary

Replace the current name-generation logic in `js/name-gen.js` (curated-list
lookup with "don't repeat" tracking, falling back to a syllable
prefix/middle/suffix generator) with the Markov-chain (character n-gram)
generator prototyped in `raw-names.js` at the repo root. Every generated
name is now produced fresh by the n-gram model — there is no curated list
and no repeat-avoidance.

## Data (`data/names.json`)

Replace the file's contents entirely with the training corpus currently
hardcoded as `raw-names.js`'s `txtToArray` string, converted to a flat JSON
array of ~283 strings:

```json
{ "corpus": ["Gatsi", "pahinaga", "Chikan", "Na", "Chimiin", "..."] }
```

The old `lists` and `syllables` keys are removed — nothing in the app reads
them once this change lands.

## `js/name-gen.js`

- `loadNameData()`: fetches `data/names.json` as today, caches the parsed
  result. On first load, also builds the n-gram model from `corpus` via a
  new `buildModel(corpus)` function (ported from `raw-names.js` lines
  4–20): a `ngrams` map from each order-2 character gram to the array of
  characters observed following it in the corpus, and a `beginnings` array
  of each corpus entry's first 2 characters. The model is memoized on the
  same cached object returned by `loadNameData()` — computed once per
  session, not on every generate click.
- `generateName(data)`: ports `kagChahiNames()` from `raw-names.js` lines
  26–43 verbatim in algorithm — `order = 2`, pick a random beginning gram,
  then append 4–12 more n-gram-predicted characters (`randomInRange(4,12)`
  iterations) — but reads `data.ngrams` / `data.beginnings` instead of
  module-level globals. Reuses `capitalize_Words()` unchanged (handles
  multi-word corpus entries like "Choona Wanaka" by capitalizing each
  word).
- Deleted: the curated-list lookup, `data._used` repeat-avoidance
  tracking, and the `_procedural(syllables)` fallback. Every call to
  `generateName()` produces a new name via the n-gram model; there is no
  "run out of names" case to fall back from.
- `init(container)`: unchanged UI and behavior — "Generate Name" button,
  result display with a Copy button, a running history of the last 5
  generated names, and the existing offline-error fallback
  (`<p class="error">Data unavailable — please reload while online once to
  enable offline use.</p>`) if the initial fetch fails.

## Out of scope

- `raw-names.js` at the repo root is left in place, untracked, as a
  reference/scratch file — not deleted, not imported by the app.
- No UI changes beyond what falls out of removing the now-unused
  category-list concept (the Names tab never exposed category selection to
  begin with, so there's no visible UI change at all).
- No change to the n-gram order (stays 2) or the generated-name length
  bounds (stays a 2-character seed + 4–12 more characters).

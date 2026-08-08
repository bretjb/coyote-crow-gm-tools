# Quick Reference / Full Rules Tabs — Design

## Summary

Split the current "Rules" tab (with its Quick Ref / Full Digest sub-tab
buttons) into two top-level nav tabs: **Quick Reference** and **Full
Rules**. The Quick Reference tab renders the real quick-reference content
(currently only in `data/rules/quick-ref-raw.md`) and breaks its `##`
top-level headings out into their own sub-tabs. The Full Rules tab keeps
rendering the existing placeholder content unchanged, just relocated.

## Nav & Tabs (`index.html`, `js/app.js`)

- Replace the single `rules` tab button/panel with two top-level tabs:
  - `data-tab="quickref"` → label "Quick Reference", panel `#tab-quickref`
  - `data-tab="fullrules"` → label "Full Rules", panel `#tab-fullrules`
- Split `js/rules.js` into two modules: `js/quick-ref.js` and
  `js/full-rules.js`. Wire both into `app.js`'s `tabInits` map in place of
  the old `rules: initRules` entry.

## `js/full-rules.js`

Thin module: loads marked (via shared helper below), fetches
`data/rules/full-digest.md`, renders into a `.rules-body` div. No sub-tabs.
Same offline-error fallback as today's `loadMd`.

## `js/quick-ref.js`

- Fetches `data/rules/quick-ref.md` once on init.
- Parses the raw markdown text by splitting on lines starting with `## `
  (top-level section headings), producing an ordered list of
  `{ title, bodyMarkdown }`. The leading `# ` H1 title line is not a
  section.
- Renders one sub-tab button per section (label = heading text, e.g.
  "1. The D12 System — Making a Check"), plus a content div. First section
  is active by default. Clicking a sub-tab re-renders `marked.parse()` on
  that section's already-fetched markdown (no re-fetch).
- Same active/secondary button-class toggling pattern as today's Rules
  sub-tabs; same `.rules-body` styling.

## Shared marked-loading helper

Extract the "inject `js/lib/md.js` once, resolve when `window.marked` is
set" logic from `js/rules.js` into a small shared helper (e.g.
`js/lib/load-marked.js`) so both new modules can call it without
duplicating the script-injection promise. First module to load it wins;
whichever loads second reuses the already-set `window.marked`.

## Data files

- `data/rules/quick-ref.md`: replace its contents with
  `quick-ref-raw.md`'s content, minus section 6 ("Suggestions for Things
  to Add to a Running GM Reference") and its trailing `---`. This becomes
  the file the app actually fetches and renders.
- `data/rules/quick-ref-raw.md`: left in place as-is (source/reference
  copy), not deleted.
- `data/rules/full-digest.md`: untouched, stays a placeholder stub.

## Out of scope

- Real Full Rules content (still a placeholder).
- Styling changes beyond reusing `.rules-body` and the existing sub-tab
  button classes.
- The other loose `*.md`/`*.pdf` files currently untracked in the repo
  root (adanadi.md, character.md, encounters.md, etc.) — unrelated to this
  task.

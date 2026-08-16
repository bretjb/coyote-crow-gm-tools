# NPC Tab: Printable Character Sheet PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export PDF" button to the Full NPC card that overlays the NPC's data onto the official `CoyoteCrowCharacterSheet-v1.01.pdf` template (page 1 only) and downloads the filled PDF.

**Architecture:** A new, dependency-free module `js/npc-pdf-export.js` exports `buildNpcSheetPdf(npc, allSkills)`, which fetches the template bytes, loads them with `pdf-lib`, draws text at fixed coordinates for every in-scope field, and returns the filled PDF's bytes (`Promise<Uint8Array>`). `js/npc-gen.js` imports this function and wires a new `appendExportPdfBtn(card, npc, allSkills)` helper into `renderFullCard`, following the existing `Blob`/`createObjectURL`/synthetic-`<a>`-click download pattern already used by `Export All`. `pdf-lib`'s browser ESM build is vendored locally at `js/lib/pdf-lib.esm.min.js` (same pattern as `js/lib/load-marked.js`) so it works offline and needs no build step.

**Tech Stack:** Vanilla JS (ES modules, no build step), vendored `pdf-lib` v1.17.1 ESM build, `sw.js` cache-first service worker, `pdftoppm`/`pdfinfo` (Poppler) for coordinate calibration during implementation.

## Implementation Notes

- **pdf-lib vendoring (researched live):** `pdf-lib`'s own published npm package ships a bundler-free browser ESM build at `dist/pdf-lib.esm.min.js`. It is reachable, unbundled, with **zero bare `import` statements** (verified by downloading and grepping the file — it's a single self-contained ~511 KB minified ES module), from both unpkg (`https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js`, unpkg resolved the unpinned URL to this exact version at research time) and jsDelivr (`https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js`). It exports `PDFDocument`, `StandardFonts`, `rgb`, and everything else pdf-lib exposes, confirmed via `grep -o 'as PDFDocument\|as StandardFonts\|as rgb'` on the downloaded file. No bundler, no `fontkit`, no build step needed — this can be vendored exactly like `js/lib/load-marked.js` already is. Task 1 pins this exact version.
- **Baseline assumption:** Per the calling instructions, this plan is written as if "Group B" (`docs/superpowers/plans/2026-08-16-full-npc-card-view-edit.md`) has already been fully implemented and committed. Concretely: `js/npc-gen.js`'s `renderFullCard(npc, ctx, savedEntry, mode = 'view')` has the view/edit scaffold, `appendSaveControls` returns `{ getSavedId }`, and `sw.js` is already at `CACHE = 'cc-gm-v9'` with `./data/stat-skill-glossary.json` present in `ASSETS` (Group B Task 1). This plan's `sw.js` diff (Task 1) is written against that state, not the literal pre-Group-B file on disk today. If Group B has *not* actually landed by the time this plan executes, adjust the `sw.js` step 2 diff to bump `v8 → v9` instead of `v9 → v10`, and insert the two new `ASSETS` lines directly after `'./data/archetypes.json',` instead of after the glossary line — the rest of this plan (all of `js/npc-gen.js`'s edits) is unaffected either way, since none of it touches the view/edit mode machinery.
- **No circular imports:** `js/npc-pdf-export.js` does not import anything from `js/npc-gen.js` (only `js/npc-gen.js` imports from it). It has a small local `gbLabel()` and `skillPool()` — intentional 5-10 line duplicates of logic already in `js/npc-gen.js` (`gbLabel`, and the rank/pool math inside `generalSkillRow`) — rather than exporting/importing across modules, to keep the dependency graph one-directional and each module's public surface small.
- **Coordinate estimates are grounded, not guessed, but not pixel-perfect.** Every (x, y) below was derived by rendering the actual template to a 150-DPI PNG (`pdftoppm -png -r 150 CoyoteCrowCharacterSheet-v1.01.pdf`), overlaying a 50px pixel grid (and, for a couple of tight spots, a further zoomed-in 10px grid), reading off pixel positions of each label/line/cell by eye against the grid, and converting px → pt via `pt = px * (72/150) = px * 0.48`, with `pdf_y = 792.24 - (pixel_y_from_top * 0.48)` (page height 792.24pt, PDF origin bottom-left). **Solid measurement:** the header fields (Name/Age/Archetype/Path/Motivation — each verified against its own blank line's start position), the General Skills table's 14.4pt row pitch (measured across 11 consecutive row intervals, not just two points), and the 28-skill-name order match against `data/skills.json`. **Genuinely inferred, not measured, and most likely to need adjustment during Task 2's calibration:** (1) the stat-grid badges have no printed value line inside them — where exactly to vertically place the number within each badge (`STAT_ROW_Y`) is inferred from the badge's box geometry, not measured against a printed mark; (2) `STAT_COL_X` values are the *centers* of each stat abbreviation, used with a new center-aligned draw helper (see Task 2) rather than left-alignment, but that centering was eyeballed, not measured from box edges; (3) the Specialized Skills column's row pitch is assumed identical to the General Skills table's measured 14.4pt (it's visually the same table), but was not independently pixel-verified. Task 2's calibration loop (render output → inspect → adjust → repeat) exists specifically to correct these three against the real thing.
- **Skill names are not drawn for the General Skills table** — both columns' skill names are already printed on the template in a fixed order matching `data/skills.json` exactly (verified by rendering the template and comparing row-by-row: Art, Athletics, Ceremony*, Charm, Coercion, Computers, Cooking, Crafting, Cybernetics*, Deception, Farming, Herbalism*, Husbandry, Investigation in the left column; Knowledge, Language*, Medicine*, Melee Weapons, Music, Performance, Piloting, Ranged Weapons, Science*, Skulduggery, Stealth, Survival, Tracking, Unarmed Combat in the right column — an exact match to `data/skills.json`'s 28 entries in order, split at index 14). Only each row's Rank and Total values get drawn. The Specialized Skills column has no pre-printed names, so specialized entries get their name drawn too, filled sequentially from the top row (not aligned to their parent general skill's row).
- **Calibration is done with a small temporary Node script, not `playwright-cli`.** `pdf-lib` runs fine outside a browser (it only needs `fetch` and typed arrays, both available in modern Node), and Node's `import()` resolves the vendored module's own relative import of `pdf-lib.esm.min.js` correctly since that's a same-directory file path, not an HTTP request. This gives a fast, deterministic calibrate → render → inspect → adjust loop without depending on `playwright-cli`'s (unconfirmed) file-download-capture behavior. `playwright-cli` is still used in Task 3 to confirm the UI wiring (button placement, Quick-NPC exclusion, no console errors), and the spec's full field-by-field visual check is done via the same Node-script-plus-`pdftoppm` technique against a realistic fixture NPC with a specialized skill and a gift/burden, exactly as the spec's Testing section describes.

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x =`) anywhere new — all new styling goes in `css/style.css`. (Pre-existing inline styles already in `js/npc-gen.js`, e.g. in `appendSaveControls`/`renderSavedList`, are out of scope for this plan.)
- No emoji anywhere, including UI copy.
- Any new static asset fetched at runtime (the vendored `pdf-lib` build, the template PDF) must be added to `sw.js`'s `ASSETS` array, and `sw.js`'s `CACHE` version string must be bumped whenever `ASSETS` or any cached file's contents change.
- Escape all dynamic text inserted via `innerHTML` using the existing `esc()` helper in `js/npc-gen.js` — never interpolate raw NPC/user data into `innerHTML`. (`js/npc-pdf-export.js` builds a PDF via `pdf-lib`'s `drawText`, not `innerHTML`, so this constraint doesn't apply inside it — but any new DOM the button itself needs in `js/npc-gen.js` must still follow it.)
- No JS unit test suite exists in this project (no `package.json`, no test runner). Verify by serving the app locally and driving it with `playwright-cli`, per `CLAUDE.md`, plus (for PDF content correctness specifically) the Node-script-plus-`pdftoppm` technique described above. Unregister the service worker before each browser verification run.
- Export PDF is a **Full NPC card feature only** — no button on Quick NPC cards (`renderQuickCard` is untouched by this plan).

---

## Task 1: Vendor pdf-lib and register the template PDF for offline use

**Files:**
- Create: `js/lib/pdf-lib.esm.min.js`
- Modify: `sw.js`

**Interfaces:**
- Produces: `js/lib/pdf-lib.esm.min.js`, an ES module importable as `import { PDFDocument, StandardFonts, rgb } from './lib/pdf-lib.esm.min.js';` (relative to `js/*.js` callers).

- [ ] **Step 1: Download the pinned pdf-lib ESM build**

```bash
curl -sL https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js -o /Users/bretjb/dev/coyote-crow/js/lib/pdf-lib.esm.min.js
```

- [ ] **Step 2: Verify the downloaded file is self-contained (no bare imports) and exports what's needed**

```bash
ls -la /Users/bretjb/dev/coyote-crow/js/lib/pdf-lib.esm.min.js
grep -c '^import ' /Users/bretjb/dev/coyote-crow/js/lib/pdf-lib.esm.min.js
grep -o 'as PDFDocument\|as StandardFonts\|as rgb' /Users/bretjb/dev/coyote-crow/js/lib/pdf-lib.esm.min.js
```

Expected: file exists and is roughly 500-550 KB; `grep -c '^import '` prints `0` (no bare module imports at the top level — the whole thing is one self-contained file); the `as PDFDocument`/`as StandardFonts`/`as rgb` matches are all found (confirms the named exports this plan relies on actually exist in this build).

- [ ] **Step 3: Confirm the template PDF exists at the repo root (added during this spec's brainstorming, per the spec doc)**

```bash
ls -la /Users/bretjb/dev/coyote-crow/CoyoteCrowCharacterSheet-v1.01.pdf
pdfinfo /Users/bretjb/dev/coyote-crow/CoyoteCrowCharacterSheet-v1.01.pdf | grep "Page size"
```

Expected: file exists; `Page size: 615.6 x 792.24 pts`. If the file is missing, stop and flag this — it is a prerequisite this plan does not create.

- [ ] **Step 4: Register both new assets in the service worker and bump the cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v9';
```
to:
```js
const CACHE = 'cc-gm-v10';
```

And in the `ASSETS` array, add two new lines. If `'./data/stat-skill-glossary.json',` is already present (Group B landed), add after it:

```js
  './data/stat-skill-glossary.json',
  './CoyoteCrowCharacterSheet-v1.01.pdf',
  './js/lib/pdf-lib.esm.min.js',
```

If it is not present (Group B has not landed — see Implementation Notes), add after `'./data/archetypes.json',` instead, and bump `CACHE` from whatever version is currently there to the next integer rather than literally `v10`.

- [ ] **Step 5: Verify offline-fetchability of both new assets**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
curl -sfI http://localhost:8934/CoyoteCrowCharacterSheet-v1.01.pdf | head -1
curl -sfI http://localhost:8934/js/lib/pdf-lib.esm.min.js | head -1
kill %1
```

Expected: both `curl -sfI` calls print `HTTP/1.0 200 OK` (confirms both files are servable at the paths `sw.js` and the app code will fetch them from).

- [ ] **Step 6: Commit**

```bash
git add js/lib/pdf-lib.esm.min.js sw.js
git commit -m "feat: vendor pdf-lib and register the character sheet template for offline PDF export"
```

---

## Task 2: `buildNpcSheetPdf` field-mapping module, with coordinate calibration

**Files:**
- Create: `js/npc-pdf-export.js`

**Interfaces:**
- Consumes: `js/lib/pdf-lib.esm.min.js` (Task 1); an `npc` object shaped per `js/npc-character-gen.js`'s output (`stats`, `skills`, `derived`, `current`, `giftsAndBurdens`, `path: { name, statBonuses }`, `motivation: { name, description }`, `ability: { name, description, diceCheck }`, plus `name`, `age`, `archetype`); `allSkills` (the parsed contents of `data/skills.json` — an ordered array of `{ name, requiresRank, diceCheck, specialized }`, 28 entries).
- Produces: `export async function buildNpcSheetPdf(npc, allSkills): Promise<Uint8Array>` — fetches `CoyoteCrowCharacterSheet-v1.01.pdf` (relative to the app's document root, matching how `js/npc-gen.js` already does `fetch('data/...')`), draws every in-scope field from the spec's field-mapping table onto page 1, and returns the resulting PDF's bytes.

- [ ] **Step 1: Write the module**

```js
// js/npc-pdf-export.js
import { PDFDocument, StandardFonts, rgb } from './lib/pdf-lib.esm.min.js';

// --- Coordinates below are in PDF point space (origin bottom-left, y up). ---
// Derived from a 150-DPI render of CoyoteCrowCharacterSheet-v1.01.pdf
// (page size 615.6 x 792.24 pt) measured against a pixel grid; see the plan's
// Implementation Notes for the px -> pt conversion and confidence notes.

const NAME_X = 120, NAME_Y = 698.64;
const AGE_X = 367.2, AGE_Y = 698.64;
const ARCHETYPE_X = 121.44, ARCHETYPE_Y = 674.64;
const PATH_X = 277.44, PATH_Y = 674.64;
const MOTIVATION_X = 447.84, MOTIVATION_Y = 674.64;

const GB_X = 144, GB_Y_LINE1 = 580.56, GB_Y_LINE2 = 556.56, GB_MAX_WIDTH = 400;

// Each stat row: [statA, statB, statC, derivedDefenceKey, derivedBodyKey]
const STAT_ROWS = [
  ['Strength', 'Agility', 'Endurance', 'Physical Defence', 'Body'],
  ['Intelligence', 'Perception', 'Wisdom', 'Mental Defence', 'Mind'],
  ['Spirit', 'Charisma', 'Will', 'Mystical Defence', 'Soul'],
];
const STAT_ROW_Y = [396.24, 360.24, 324.24];
// Column x per row: [statA, statB, statC, defence, derivedBody, currentBody]
const STAT_COL_X = [81.6, 134.4, 187.2, 235.2, 283.2, 333.6];

const INITIATIVE_X = 554.4, INITIATIVE_Y = 441.84;

const ABILITY_NAME_X = 374.4, ABILITY_NAME_Y = 415.44;
const ABILITY_DESC_X = 314.4;
const ABILITY_DESC_Y = [389.04, 362.64];
const ABILITY_DESC_MAX_WIDTH = 240;

// General Skills: rows are shared between the left (skills.json index 0-13)
// and right (index 14-27) columns, 14 rows each, 14.4pt apart. Skill NAMES
// are already printed on the template — only Rank and Total are drawn.
const GENERAL_ROW_Y = i => 252.24 - 14.4 * i;
const GENERAL_LEFT_RANK_X = 175.2, GENERAL_LEFT_TOTAL_X = 199.2;
const GENERAL_RIGHT_RANK_X = 350.4, GENERAL_RIGHT_TOTAL_X = 379.2;

// Specialized Skills: no pre-printed names, filled sequentially from row 0
// using the same row pitch as the General Skills table.
const SPEC_NAME_X = 408, SPEC_RANK_X = 535.2, SPEC_TOTAL_X = 564;

function gbLabel(g) {
  const lvl = Math.abs(g.magnitude);
  const levelWord = lvl === 1 ? 'trivial' : lvl === 2 ? 'serious' : 'critical';
  const type = g.magnitude > 0 ? 'Gift' : 'Burden';
  return `${g.name} ${g.magnitude > 0 ? '+' : ''}${g.magnitude} ${type} (${levelWord})`;
}

function skillPool(skillDef, npc) {
  const acquired = npc.skills[skillDef.name];
  const rank = acquired ? acquired.general : 0;
  const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  const pool = rank >= 1 ? higher + rank : lower;
  return { rank, pool };
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildNpcSheetPdf(npc, allSkills) {
  const res = await fetch('CoyoteCrowCharacterSheet-v1.01.pdf');
  if (!res.ok) throw new Error('Failed to load character sheet template');
  const templateBytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];
  const black = rgb(0, 0, 0);

  function draw(text, x, y, size) {
    const s = text === null || text === undefined ? '' : String(text);
    if (!s) return;
    page.drawText(s, { x, y, size, font, color: black });
  }

  // STAT_COL_X values are measured as horizontal centers of each stat-grid
  // cell, not left edges — center the text on them rather than left-aligning,
  // so single-digit stats and two-digit derived values (e.g. Body "12") both
  // land visually centered in their cell.
  function drawCentered(text, cx, y, size) {
    const s = text === null || text === undefined ? '' : String(text);
    if (!s) return;
    const x = cx - font.widthOfTextAtSize(s, size) / 2;
    page.drawText(s, { x, y, size, font, color: black });
  }

  draw(npc.name, NAME_X, NAME_Y, 11);
  draw(npc.age, AGE_X, AGE_Y, 10);
  draw(npc.archetype, ARCHETYPE_X, ARCHETYPE_Y, 10);

  const PATH_PREFIX = 'Path of the ';
  const pathName = npc.path.name.startsWith(PATH_PREFIX)
    ? npc.path.name.slice(PATH_PREFIX.length)
    : npc.path.name;
  draw(pathName, PATH_X, PATH_Y, 10);

  draw(npc.motivation.name, MOTIVATION_X, MOTIVATION_Y, 10);

  const gbText = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';
  const gbLines = wrapText(gbText, font, 9, GB_MAX_WIDTH).slice(0, 2);
  draw(gbLines[0], GB_X, GB_Y_LINE1, 9);
  draw(gbLines[1], GB_X, GB_Y_LINE2, 9);

  for (let r = 0; r < STAT_ROWS.length; r++) {
    const [s1, s2, s3, defKey, bodyKey] = STAT_ROWS[r];
    const y = STAT_ROW_Y[r];
    drawCentered(npc.stats[s1], STAT_COL_X[0], y, 10);
    drawCentered(npc.stats[s2], STAT_COL_X[1], y, 10);
    drawCentered(npc.stats[s3], STAT_COL_X[2], y, 10);
    drawCentered(npc.derived[defKey], STAT_COL_X[3], y, 10);
    drawCentered(npc.derived[bodyKey], STAT_COL_X[4], y, 10);
    const current = npc.current ? npc.current[bodyKey] : npc.derived[bodyKey];
    drawCentered(current, STAT_COL_X[5], y, 10);
  }

  draw(npc.derived.Initiative, INITIATIVE_X, INITIATIVE_Y, 10);

  const abilityHeader = npc.ability.diceCheck && npc.ability.diceCheck.length
    ? `${npc.ability.name} [${npc.ability.diceCheck.join(' + ')}]`
    : npc.ability.name;
  draw(abilityHeader, ABILITY_NAME_X, ABILITY_NAME_Y, 10);
  const abilityDescLines = wrapText(npc.ability.description, font, 8, ABILITY_DESC_MAX_WIDTH).slice(0, 2);
  draw(abilityDescLines[0], ABILITY_DESC_X, ABILITY_DESC_Y[0], 8);
  draw(abilityDescLines[1], ABILITY_DESC_X, ABILITY_DESC_Y[1], 8);

  const half = Math.ceil(allSkills.length / 2);
  allSkills.forEach((skillDef, i) => {
    // Draw every one of the 28 rows, ranked or not — unranked skills still
    // have a real (lower-stat) dice pool, matching the on-screen table's
    // `generalSkillRow`, which renders all rows and only dims unranked ones
    // visually (a CSS-only distinction with no PDF equivalent needed here).
    const { rank, pool } = skillPool(skillDef, npc);
    const rowIndex = i < half ? i : i - half;
    const y = GENERAL_ROW_Y(rowIndex);
    const rankX = i < half ? GENERAL_LEFT_RANK_X : GENERAL_RIGHT_RANK_X;
    const totalX = i < half ? GENERAL_LEFT_TOTAL_X : GENERAL_RIGHT_TOTAL_X;
    draw(rank, rankX, y, 9);
    draw(pool, totalX, y, 9);
  });

  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  specEntries.forEach((entry, i) => {
    const skillDef = allSkills.find(s => s.name === entry.generalName);
    if (!skillDef) return;
    const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
    const higher = Math.max(...vals);
    const pool = higher + entry.rank;
    const y = GENERAL_ROW_Y(i);
    draw(entry.name, SPEC_NAME_X, y, 8);
    draw(entry.rank, SPEC_RANK_X, y, 9);
    draw(pool, SPEC_TOTAL_X, y, 9);
  });

  return pdfDoc.save();
}
```

- [ ] **Step 2: Write a temporary calibration script (not committed)**

Create `/tmp/calibrate-pdf.mjs` with this content:

```js
// Temporary calibration harness. Run from the repo root with:
//   node /tmp/calibrate-pdf.mjs
// (with `python3 -m http.server 8934` already running in another terminal
// from the repo root, since the module fetches the template relative to
// that server's document root).
import { writeFile } from 'node:fs/promises';

const ORIGIN = 'http://localhost:8934/';
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => originalFetch(new URL(url, ORIGIN), opts);

const { buildNpcSheetPdf } = await import('/Users/bretjb/dev/coyote-crow/js/npc-pdf-export.js');

const fixtureSkills = await (await originalFetch(new URL('data/skills.json', ORIGIN))).json();

const fixtureNpc = {
  name: 'Calibration Test',
  age: 'Adult',
  archetype: 'Warrior',
  path: { name: 'Path of the Eagle', statBonuses: ['Strength', 'Endurance'] },
  motivation: { name: 'Protect My Family', description: 'placeholder' },
  giftsAndBurdens: [
    { name: 'Family', magnitude: 2, description: 'x' },
    { name: 'Notoriety', magnitude: -1, description: 'x' },
  ],
  stats: {
    Strength: 5, Agility: 3, Endurance: 4,
    Intelligence: 2, Perception: 3, Wisdom: 2,
    Spirit: 3, Charisma: 2, Will: 3,
  },
  skills: {
    Athletics: { general: 4, specialized: { name: 'Climbing', rank: 2 } },
    'Melee Weapons': { general: 3 },
    Survival: { general: 2 },
    Stealth: { general: 1 },
    'Unarmed Combat': { general: 6, specialized: { name: 'Wrestling', rank: 3 } },
  },
  ability: {
    name: 'Iron Skin',
    description: 'Reduce incoming physical damage by one whenever struck in melee combat.',
    diceCheck: ['Endurance', 'Will'],
  },
  derived: {
    Initiative: 8, 'Physical Defence': 7, 'Mental Defence': 5,
    'Mystical Defence': 5, Body: 12, Mind: 7, Soul: 8,
  },
  current: { Body: 10, Mind: 7, Soul: 8 },
};

const bytes = await buildNpcSheetPdf(fixtureNpc, fixtureSkills);
await writeFile('/tmp/calibration-output.pdf', bytes);
console.log('wrote /tmp/calibration-output.pdf', bytes.length, 'bytes');
```

- [ ] **Step 3: Run the calibration loop and visually inspect**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
node /tmp/calibrate-pdf.mjs
kill %1
pdftoppm -png -r 150 /tmp/calibration-output.pdf /tmp/calibration-check
```

Then view `/tmp/calibration-check-1.png` (use the Read tool, or any image viewer) and visually check every field against the template:
- Name, Age, Archetype, Path ("Eagle", not "Path of the Eagle"), Motivation all sit on their respective lines, not overlapping the printed labels or floating above/below the line.
- "Family +2 Gift (serious), Notoriety -1 Burden (trivial)" appears on the two Gifts & Burdens lines, not overlapping "Short Term Goals" below.
- All nine stat values, PD/MD/SD, Body/Mind/Soul, and Body/Mind/Soul (current) sit inside their correct cells across all three rows.
- Initiative Score shows `8` on its line.
- "Iron Skin [Endurance + Will]" appears after "Abilities:", and its description wraps onto the two lines below without running past the right edge of the page.
- Athletics shows Rank 4 / Total in the left General Skills column at the correct row (4th row: Art, Athletics, ...); Unarmed Combat shows Rank 6 in the right column at its correct row (last row).
- "Climbing" and "Wrestling" both appear in the Specialized Skills column with their ranks and totals, on the first two rows of that column.

If any field is off (wrong cell, overlapping a printed line, misaligned between the two General Skills columns, etc.), adjust the corresponding constant(s) at the top of `js/npc-pdf-export.js`, then repeat this step (re-run the harness, re-render, re-inspect) until every field above visually lands correctly. This is expected to take more than one iteration — do not proceed to Step 4 until the checklist above passes.

- [ ] **Step 4: Clean up the temporary calibration files**

```bash
rm -f /tmp/calibrate-pdf.mjs /tmp/calibration-output.pdf /tmp/calibration-check-1.png
```

- [ ] **Step 5: Commit**

```bash
git add js/npc-pdf-export.js
git commit -m "feat: add buildNpcSheetPdf to overlay NPC data onto the character sheet template"
```

---

## Task 3: Wire the Export PDF button into the Full NPC card

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `buildNpcSheetPdf(npc, allSkills)` (Task 2); `renderFullCard(npc, ctx, savedEntry, mode = 'view')`, `appendCopyBtn`, `appendInitiativeBtn`, `appendSaveControls` (all pre-existing, per this plan's Implementation Notes baseline); `ctx.allSkills` (already loaded in `init()`).
- Produces: `appendExportPdfBtn(card, npc, allSkills)` and `slugify(name)`, both new helpers in `js/npc-gen.js`, called once from `renderFullCard` between the `appendInitiativeBtn` call and the `appendSaveControls` call.

- [ ] **Step 1: Import `buildNpcSheetPdf`**

In `js/npc-gen.js`, add to the top import block (alongside the existing imports):

```js
import { buildNpcSheetPdf } from './npc-pdf-export.js';
```

- [ ] **Step 2: Add `slugify` and `appendExportPdfBtn` helpers**

Add these two functions immediately after `appendInitiativeBtn` (which ends with `card.appendChild(wrap); }` per the Group B baseline):

```js
function slugify(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'npc';
}

function appendExportPdfBtn(card, npc, allSkills) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-actions';

  const btn = document.createElement('button');
  btn.textContent = 'Export PDF';
  btn.className = 'secondary mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Exporting...';
    try {
      const pdfBytes = await buildNpcSheetPdf(npc, allSkills);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(npc.name)}-character-sheet.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      status.textContent = 'PDF downloaded';
    } catch {
      status.textContent = 'Export failed — please try again';
    } finally {
      btn.disabled = false;
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}
```

- [ ] **Step 3: Call it from `renderFullCard`**

In `renderFullCard`, change:

```js
  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)));
  saveControls = appendSaveControls(card, 'full', npc, savedEntry);
  return card;
```
to:
```js
  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)));
  appendExportPdfBtn(card, npc, ctx.allSkills);
  saveControls = appendSaveControls(card, 'full', npc, savedEntry);
  return card;
```

(If Group B has not landed and `renderFullCard` doesn't yet have a `saveControls =` assignment or `mode` parameter, apply the equivalent change to whatever the current last three lines of `renderFullCard` are — insert the `appendExportPdfBtn` call between the `appendInitiativeBtn` call and the `appendSaveControls` call either way.)

- [ ] **Step 4: Verify the button appears only on Full NPC cards, and doesn't error**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "Export PDF"
```

Expected: `Export PDF` found on the Full NPC card.

```bash
playwright-cli click "text=Quick NPC"
playwright-cli find "Export PDF"
```

Expected: not found — Quick NPC cards get no Export PDF button.

```bash
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Export PDF']"
playwright-cli find "PDF downloaded"
playwright-cli console error
playwright-cli close
kill %1
```

Expected: `PDF downloaded` status text appears after the click; `playwright-cli console error` prints no errors (confirms `buildNpcSheetPdf` ran without throwing against a real, randomly-generated NPC — not just the Task 2 fixture).

- [ ] **Step 5: Full field-by-field visual verification, per the spec's Testing section**

Reuse the Task 2 calibration technique one more time, but this time save the output where it can be inspected as the final acceptance check (this also doubles as a regression check that Task 3's wiring didn't change anything about `buildNpcSheetPdf`'s output):

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
cat > /tmp/final-check.mjs << 'EOF'
import { writeFile } from 'node:fs/promises';
const ORIGIN = 'http://localhost:8934/';
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => originalFetch(new URL(url, ORIGIN), opts);
const { buildNpcSheetPdf } = await import('/Users/bretjb/dev/coyote-crow/js/npc-pdf-export.js');
const fixtureSkills = await (await originalFetch(new URL('data/skills.json', ORIGIN))).json();
const fixtureNpc = {
  name: 'Final Check NPC', age: 'Elder', archetype: 'Healer',
  path: { name: 'Path of the Bear', statBonuses: ['Wisdom', 'Spirit'] },
  motivation: { name: 'Preserve the Old Ways', description: 'x' },
  giftsAndBurdens: [{ name: 'Spirit World Connection', magnitude: 3, description: 'x' }],
  stats: { Strength: 2, Agility: 2, Endurance: 3, Intelligence: 4, Perception: 4, Wisdom: 5, Spirit: 4, Charisma: 3, Will: 4 },
  skills: { Herbalism: { general: 5, specialized: { name: 'Poisons', rank: 3 } }, Medicine: { general: 4 } },
  ability: { name: 'Spirit Sight', description: 'See through the veil between worlds at will.', diceCheck: ['Wisdom', 'Spirit'] },
  derived: { Initiative: 9, 'Physical Defence': 5, 'Mental Defence': 8, 'Mystical Defence': 7, Body: 7, Mind: 13, Soul: 11 },
  current: { Body: 7, Mind: 13, Soul: 11 },
};
const bytes = await buildNpcSheetPdf(fixtureNpc, fixtureSkills);
await writeFile('/tmp/final-check.pdf', bytes);
console.log('wrote /tmp/final-check.pdf');
EOF
node /tmp/final-check.mjs
kill %1
pdftoppm -png -r 150 /tmp/final-check.pdf /tmp/final-check
```

View `/tmp/final-check-1.png` (Read tool) and confirm every field from the spec's field-mapping table is present and legible: Name(s), Age, Archetype, Path of The (reads "Bear", not "Path of the Bear"), Motivation, Gifts & Burdens ("Spirit World Connection +3 Gift (critical)"), all nine stats, PD/MD/SD, Body/Mind/Soul, Body/Mind/Soul (current), Initiative Score, Ability name + dice check + description, Herbalism's Rank 5 / Total in the General Skills table, Medicine's Rank 4 / Total, and "Poisons" with its rank/total in the Specialized Skills column. Confirm nothing from the out-of-scope list (Other Identifiers, Background, Short/Long Term Goals, Legendary Ranks, States & Effects, page 2) has anything drawn on it.

```bash
rm -f /tmp/final-check.mjs /tmp/final-check.pdf /tmp/final-check-1.png
```

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: add Export PDF button to the Full NPC card"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Every field in the spec's mapping table has a corresponding constant and `draw()` call in Task 2 (Name, Age, Archetype, Path with prefix-stripping, Motivation, Gifts & Burdens via `gbLabel`, all 9 stats, all 3 derived-stat triples including current, Initiative Score, Ability name+diceCheck+description, all 28 general skills' Rank/Total via the shared `skillPool` helper, and specialized skills' name/Rank/Total). Out-of-scope fields (Other Identifiers, Background, Short/Long Term Goals, Legendary Ranks, States & Effects, page 2) have no code path that draws anything to them. Scope restriction (Full NPC only, no Quick NPC button) is enforced simply by only calling `appendExportPdfBtn` from `renderFullCard`, never `renderQuickCard`. Download filename/pattern (Task 3) matches the spec's `Blob`/`createObjectURL`/synthetic-`<a>`-click pattern and slugification rule exactly.
- **Placeholder scan:** No task defers real code to "later" — Task 2's coordinate constants are literal numbers (grounded in a real pixel-grid measurement, documented in Implementation Notes with an honest confidence caveat), and the calibration step is a concrete, runnable loop (not "adjust as needed" hand-waving) with an explicit checklist and an explicit "don't proceed until it passes" instruction.
- **Type/signature consistency:** `buildNpcSheetPdf(npc, allSkills)` is defined once in Task 2 and called with the same two-argument shape everywhere it's used (Task 2's and Task 3's calibration scripts, and Task 3's `appendExportPdfBtn`). `appendExportPdfBtn(card, npc, allSkills)` is defined and called with matching arity in Task 3. No function is renamed or re-signatured between tasks.

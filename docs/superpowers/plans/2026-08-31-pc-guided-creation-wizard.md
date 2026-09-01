# PC Guided Creation Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a step-by-step "Guided Creation" wizard to the PC tab that walks a player through Archetype → Path → Gifts/Burdens → Stats → Skills using Coyote & Crow's real point-buy math, then hands off a pre-filled draft into the existing PC card editor.

**Architecture:** New module `js/pc-wizard.js` owns all wizard state as a single plain object mutated in place, re-rendering the whole step area on every change (the same pattern `pc-gen.js`/`npc-gen.js` already use). Completed steps collapse into a one-line summary; only the active step (and everything before it) renders. Two cost-table constants move from private to exported in `js/npc-character-gen.js` so the wizard's math and the existing random-generation math share one source of truth. No new persistence — the wizard hands a finished draft to the existing `renderPcCard`/`pc-storage.js` flow unchanged.

**Tech Stack:** Vanilla JS (ES modules, no build step), plain DOM APIs, existing `css/style.css` design tokens.

**Spec:** `docs/superpowers/specs/2026-08-31-pc-guided-creation-wizard-design.md`

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x =`) anywhere — all CSS goes in `css/style.css`.
- No emoji anywhere, including UI copy.
- No JS unit test suite exists in this project — verify every task manually in a browser (via `playwright-cli`), not with test files.
- Every new/changed JS asset must be listed in `sw.js`'s `ASSETS` array, and `sw.js`'s `CACHE` version string must be bumped whenever a listed asset's content changes, or the service worker will keep serving the stale cached version during manual verification.
- Stat cost table: `[0, 3, 6, 10, 15]` = total points to reach purchased value `1..5`. Skill cost table: `[0, 1, 3, 6, 10, 15, 21]` = total points to reach rank `0..6`. Both already exist in `js/npc-character-gen.js` — reuse them, don't redefine.
- Archetype/Path stat bonuses and the archetype's free skill rank are free (no point cost) and apply on top of purchased values; the purchase floor for a bonused stat/skill is the *purchased* value (1 for stats, 0 or 1 for the free-rank skill), never the bonus-inflated displayed value.
- Gifts step: remaining points must be `>= 0` to advance (hard gate); everything else in the wizard is freely navigable with no forced-spending gate.
- Local dev server: `python3 -m http.server 8934` from the repo root, then `http://localhost:8934`. Unregister the service worker / clear cache in the browser between verification runs so edits aren't hidden by stale cache.

---

## Task 1: Export the stat/skill cost tables

**Files:**
- Modify: `js/npc-character-gen.js:3` and `js/npc-character-gen.js:8`

**Interfaces:**
- Produces: `export const STAT_COSTS` (`[0, 3, 6, 10, 15]`), `export const SKILL_COSTS` (`[0, 1, 3, 6, 10, 15, 21]`) — consumed by `js/pc-wizard.js` starting in Task 2.

- [ ] **Step 1: Export both constants**

In `js/npc-character-gen.js`, change:

```js
const STAT_COSTS = [0, 3, 6, 10, 15];
```
to:
```js
export const STAT_COSTS = [0, 3, 6, 10, 15];
```

and change:

```js
const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];
```
to:
```js
export const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];
```

No other lines in the file change — `allocateStats`/`allocateSkills` keep using the same names, now just exported.

- [ ] **Step 2: Verify nothing else broke**

Run: `grep -rn "STAT_COSTS\|SKILL_COSTS" js/` — confirm the only definitions are these two `export const` lines and all other references are reads inside `npc-character-gen.js` itself (unchanged).

Using `playwright-cli`: serve the app (`python3 -m http.server 8934`), open `http://localhost:8934`, go to the NPCs tab, generate a Full NPC, and confirm it still renders stats/skills normally (this exercises `allocateStats`/`allocateSkills`, proving the export didn't break anything).

- [ ] **Step 3: Commit**

```bash
git add js/npc-character-gen.js
git commit -m "Export stat/skill cost tables for reuse by the PC wizard"
```

---

## Task 2: Wizard scaffold + Archetype and Path steps

**Files:**
- Create: `js/pc-wizard.js`
- Modify: `js/pc-gen.js` (add "Guided Creation" button and wiring)
- Modify: `sw.js` (register the new file, bump `CACHE`)
- Modify: `css/style.css` (wizard shell, option-grid, summary-line styles)

**Interfaces:**
- Consumes: `esc` from `js/character-card.js`; `ctx = { motivations, paths, allSkills, abilities, archetypes, glossary }` (already built by `pc-gen.js`'s `init()`).
- Produces: `export function init(container, ctx, onFinish)` in `js/pc-wizard.js` — the only export other tasks/`pc-gen.js` call. Internal (not exported) helpers this task defines, reused by later tasks: `STAT_NAMES`, `blankWizardState()`, `archetypeObj(state, ctx)`, `pathObj(state, ctx)`, `render()` closure inside `init`, `buildStepNav({ onBack, onNext, nextLabel, nextDisabled })`, `STEP_COUNT` (module-level `let`, starts at `2`).

- [ ] **Step 1: Write `js/pc-wizard.js`**

```js
// js/pc-wizard.js
import { esc } from './character-card.js';

export const STAT_NAMES = [
  'Strength', 'Agility', 'Endurance', 'Intelligence',
  'Perception', 'Wisdom', 'Spirit', 'Charisma', 'Will',
];

// Bumped by later tasks as more steps are implemented (2 -> 3 -> 4 -> 5).
let STEP_COUNT = 2;

function blankWizardState() {
  return {
    step: 0,
    archetype: '',
    path: '',
    giftsAndBurdens: '',
    gbEntries: [],
    gbApplyTo: 'stats',
    stats: Object.fromEntries(STAT_NAMES.map(s => [s, 1])),
    skills: {},
    archetypeFreeSkill: '',
  };
}

function archetypeObj(state, ctx) {
  return ctx.archetypes.find(a => a.name === state.archetype) || null;
}

function pathObj(state, ctx) {
  return ctx.paths.find(p => p.name === state.path) || null;
}

function buildStepNav({ onBack, onNext, nextLabel = 'Next', nextDisabled = false }) {
  const nav = document.createElement('div');
  nav.className = 'row-flex-wrap wizard-step-nav';
  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'secondary';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', onBack);
    nav.appendChild(backBtn);
  }
  if (onNext) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = nextLabel;
    nextBtn.disabled = nextDisabled;
    nextBtn.addEventListener('click', onNext);
    nav.appendChild(nextBtn);
  }
  return nav;
}

function buildOptionGrid(options, selectedName, formatSubtext, onSelect) {
  const grid = document.createElement('div');
  grid.className = 'wizard-option-grid';
  options.forEach(opt => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wizard-option-card';
    card.classList.toggle('selected', opt.name === selectedName);
    card.innerHTML = `<strong>${esc(opt.name)}</strong><span class="text-muted-sm">${esc(formatSubtext(opt))}</span>`;
    card.addEventListener('click', () => onSelect(opt.name));
    grid.appendChild(card);
  });
  return grid;
}

function buildArchetypeStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Choose an Archetype';
  wrap.appendChild(heading);
  wrap.appendChild(buildOptionGrid(
    ctx.archetypes,
    state.archetype,
    a => `+1 ${a.statBonus}`,
    name => { state.archetype = name; rerender(); }
  ));
  wrap.appendChild(buildStepNav({
    onNext: () => { state.step = 1; rerender(); },
    nextDisabled: !state.archetype,
  }));
  return wrap;
}

function buildPathStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Choose a Path';
  wrap.appendChild(heading);
  wrap.appendChild(buildOptionGrid(
    ctx.paths,
    state.path,
    p => `+1 ${p.statBonuses.join(', +1 ')}`,
    name => { state.path = name; rerender(); }
  ));
  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 0; rerender(); },
    onNext: () => { state.step = 2; rerender(); },
    nextDisabled: !state.path,
  }));
  return wrap;
}

function summaryText(i, state, ctx) {
  if (i === 0) {
    const arch = archetypeObj(state, ctx);
    return `Archetype: ${state.archetype}${arch ? ` (+1 ${arch.statBonus})` : ''}`;
  }
  if (i === 1) {
    const path = pathObj(state, ctx);
    return `Path: ${state.path}${path ? ` (+1 ${path.statBonuses.join(', +1 ')})` : ''}`;
  }
  return '';
}

function buildSummaryLine(i, state, ctx, rerender) {
  const line = document.createElement('div');
  line.className = 'row-flex-wrap wizard-summary-line';
  const text = document.createElement('span');
  text.className = 'flex-1';
  text.textContent = summaryText(i, state, ctx);
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => { state.step = i; rerender(); });
  line.appendChild(text);
  line.appendChild(editBtn);
  return line;
}

function buildStepBody(i, state, ctx, rerender) {
  if (i === 0) return buildArchetypeStep(state, ctx, rerender);
  if (i === 1) return buildPathStep(state, ctx, rerender);
  const empty = document.createElement('div');
  return empty;
}

export function init(container, ctx, onFinish) {
  const state = blankWizardState();

  function render() {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wizard';
    for (let i = 0; i <= state.step && i < STEP_COUNT; i++) {
      wrap.appendChild(
        i < state.step
          ? buildSummaryLine(i, state, ctx, render)
          : buildStepBody(i, state, ctx, render)
      );
    }
    container.appendChild(wrap);
  }

  render();
}
```

- [ ] **Step 2: Wire "Guided Creation" into `js/pc-gen.js`**

In `js/pc-gen.js`, add the import near the top (after the existing imports):

```js
import { init as initPcWizard } from './pc-wizard.js';
```

Then in the toolbar markup (inside `init(container)`'s template string), change:

```js
    <div class="row-flex-wrap mb-1-5">
      <button id="btn-new-pc">New PC</button>
    </div>
```
to:
```js
    <div class="row-flex-wrap mb-1-5">
      <button id="btn-new-pc">New PC</button>
      <button id="btn-guided-pc" class="secondary">Guided Creation</button>
    </div>
```

And after the existing `#btn-new-pc` click listener (right after its closing `});`), add:

```js
  container.querySelector('#btn-guided-pc').addEventListener('click', () => {
    output.innerHTML = '';
    initPcWizard(output, ctx, pc => {
      output.innerHTML = '';
      output.appendChild(renderPcCard(pc, ctx, undefined, 'edit'));
    });
  });
```

(`ctx` and `output` are already in scope at that point in `init()` — this task only exercises the `initPcWizard` call itself; the `onFinish` callback becomes reachable once Task 6 adds the Finish button.)

- [ ] **Step 3: Register the new file in `sw.js` and bump the cache**

In `sw.js`, change:
```js
const CACHE = 'cc-gm-v35';
```
to:
```js
const CACHE = 'cc-gm-v36';
```

And in `ASSETS`, add a new line right after `'./js/pc-gen.js',`:
```js
  './js/pc-gen.js',
  './js/pc-wizard.js',
```

- [ ] **Step 4: Add wizard shell CSS**

Append to `css/style.css`:

```css
.wizard { display: flex; flex-direction: column; gap: 0.75rem; }

.wizard-summary-line {
  padding: 0.5rem 0.75rem;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.wizard-option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.wizard-option-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  padding: 0.6rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  cursor: pointer;
}

.wizard-option-card:hover { background: var(--surface-raised); }

.wizard-option-card.selected {
  border-color: var(--accent-copper);
  background: var(--surface-raised);
}

.wizard-step-nav { margin-top: 0.5rem; }
```

- [ ] **Step 5: Verify manually with `playwright-cli`**

Serve the app (`python3 -m http.server 8934`), open `http://localhost:8934` in a fresh/cleared-cache browser context. Navigate to the PCs tab, confirm a "Guided Creation" button appears next to "New PC". Click it: confirm the Archetype step renders 6 option cards, "Next" is disabled until one is selected, clicking a card selects it (visibly highlighted) and enables "Next". Click "Next": confirm the Archetype step collapses to a one-line summary (e.g. `Archetype: Warrior (+1 Strength)`) and the Path step appears with 15 option cards, "Back" returns to the Archetype step (re-expanded, selection preserved), and clicking "Edit" on the collapsed Archetype summary re-expands it and hides the Path step again.

- [ ] **Step 6: Commit**

```bash
git add js/pc-wizard.js js/pc-gen.js sw.js css/style.css
git commit -m "Add PC guided-creation wizard scaffold with Archetype and Path steps"
```

---

## Task 3: Gifts/Burdens step

**Files:**
- Modify: `js/pc-wizard.js`
- Modify: `sw.js` (bump `CACHE`)
- Modify: `css/style.css` (gifts/burdens entry list, magnitude buttons, points badge)

**Interfaces:**
- Consumes: `state.giftsAndBurdens`, `state.gbEntries`, `state.gbApplyTo` (already in `blankWizardState()` from Task 2); `buildStepNav`, `buildSummaryLine`/`summaryText` dispatch, `STEP_COUNT`.
- Produces: `gbPointsRemaining(state)`, `gbLeftover(state)` — both consumed by the Stats step (Task 4) and Skills step (Task 5) budget calculations, and by the Finish handoff (Task 6).

- [ ] **Step 1: Add the Gifts/Burdens math helpers and step builder**

In `js/pc-wizard.js`, add (near the top, after `pathObj`):

```js
function gbPointsRemaining(state) {
  return state.gbEntries.reduce((sum, e) => sum - e.magnitude, 5);
}

function gbLeftover(state) {
  return Math.max(0, gbPointsRemaining(state));
}
```

Add the step builder (after `buildPathStep`):

```js
const GB_MAGNITUDES = [3, 2, 1, -1, -2, -3];

function buildGiftsBurdensStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Gifts and Burdens';
  wrap.appendChild(heading);

  const textLabel = document.createElement('label');
  textLabel.className = 'field-label';
  textLabel.textContent = 'Describe your Gifts and Burdens';
  const textarea = document.createElement('textarea');
  textarea.className = 'textarea-full mb-0-75';
  textarea.rows = 3;
  textarea.value = state.giftsAndBurdens;
  textarea.addEventListener('change', () => { state.giftsAndBurdens = textarea.value.trim(); });
  wrap.appendChild(textLabel);
  wrap.appendChild(textarea);

  const addRow = document.createElement('div');
  addRow.className = 'row-flex-wrap mb-0-75';
  const addLabel = document.createElement('span');
  addLabel.className = 'field-label';
  addLabel.textContent = 'Add an entry:';
  addRow.appendChild(addLabel);
  GB_MAGNITUDES.forEach(mag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = mag > 0 ? `+${mag}` : `${mag}`;
    btn.addEventListener('click', () => {
      state.gbEntries.push({ magnitude: mag });
      rerender();
    });
    addRow.appendChild(btn);
  });
  wrap.appendChild(addRow);

  if (state.gbEntries.length > 0) {
    const list = document.createElement('div');
    list.className = 'mb-0-75';
    state.gbEntries.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'row-flex-wrap wizard-gb-entry';
      const label = document.createElement('span');
      label.className = 'flex-1';
      label.textContent = entry.magnitude > 0
        ? `Gift, level ${entry.magnitude} (costs ${entry.magnitude})`
        : `Burden, level ${-entry.magnitude} (grants ${-entry.magnitude})`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'secondary';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        state.gbEntries.splice(idx, 1);
        rerender();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  const remaining = gbPointsRemaining(state);
  const statusRow = document.createElement('div');
  statusRow.className = 'row-flex-wrap mb-0-75';
  const badge = document.createElement('span');
  badge.className = `wizard-points-badge${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `${remaining} pt${remaining === 1 ? '' : 's'} remaining`;
  statusRow.appendChild(badge);

  const applyLabel = document.createElement('label');
  applyLabel.className = 'field-label';
  applyLabel.textContent = 'Leftover points apply to:';
  const applySelect = document.createElement('select');
  ['stats', 'skills'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === 'stats' ? 'Stats' : 'Skills';
    opt.selected = state.gbApplyTo === v;
    applySelect.appendChild(opt);
  });
  applySelect.addEventListener('change', () => { state.gbApplyTo = applySelect.value; rerender(); });
  statusRow.appendChild(applyLabel);
  statusRow.appendChild(applySelect);
  wrap.appendChild(statusRow);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 1; rerender(); },
    onNext: () => { state.step = 3; rerender(); },
    nextDisabled: remaining < 0,
  }));
  return wrap;
}
```

- [ ] **Step 2: Wire the step into the dispatch functions and bump `STEP_COUNT`**

In `js/pc-wizard.js`, change:
```js
let STEP_COUNT = 2;
```
to:
```js
let STEP_COUNT = 3;
```

In `summaryText`, add a new branch right before the final `return '';`:
```js
  if (i === 2) {
    const remaining = gbPointsRemaining(state);
    return `Gifts/Burdens: ${state.gbEntries.length} entr${state.gbEntries.length === 1 ? 'y' : 'ies'}, ${remaining} pt${remaining === 1 ? '' : 's'} remaining -> ${state.gbApplyTo === 'stats' ? 'Stats' : 'Skills'}`;
  }
```

In `buildStepBody`, add a branch before the `empty` fallback:
```js
  if (i === 2) return buildGiftsBurdensStep(state, ctx, rerender);
```

- [ ] **Step 3: Bump `sw.js` cache**

Change `CACHE` from `'cc-gm-v36'` to `'cc-gm-v37'` in `sw.js`.

- [ ] **Step 4: Add CSS**

Append to `css/style.css`:

```css
.wizard-gb-entry {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}

.wizard-points-badge {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.wizard-points-badge.negative { border-color: var(--danger); color: var(--danger); }
```

- [ ] **Step 5: Verify manually with `playwright-cli`**

Serve the app, clear the cached service worker, navigate to PCs → Guided Creation, pick an archetype and path to reach the Gifts/Burdens step. Confirm: clicking `+2` and `-1` adds two entries and the remaining badge reads `4 pts remaining` (5 − 2 + 1 = 4); clicking enough Gift buttons to push remaining negative disables "Next" and turns the badge red; removing an entry brings remaining back to ≥ 0 and re-enables "Next"; the Stats/Skills dropdown toggles between "Stats" and "Skills"; "Back" returns to the Path step with the Path selection preserved; "Next" collapses this step into a summary line matching the current entry count/remaining/apply-to text.

- [ ] **Step 6: Commit**

```bash
git add js/pc-wizard.js sw.js css/style.css
git commit -m "Add Gifts/Burdens step to the PC guided-creation wizard"
```

---

## Task 4: Stats point-buy step

**Files:**
- Modify: `js/pc-wizard.js`
- Modify: `sw.js` (bump `CACHE`)
- Modify: `css/style.css` (stat grid, stepper buttons)

**Interfaces:**
- Consumes: `STAT_NAMES`, `gbLeftover(state)` from Task 3, `js/npc-character-gen.js`'s exported `STAT_COSTS` (Task 1).
- Produces: `archetypeStatBonus(name, state, ctx)`, `pathStatBonus(name, state, ctx)`, `statBonus(name, state, ctx)`, `displayedStat(name, state, ctx)` (consumed by Task 6's handoff), `statBudget(state)`, `totalStatSpent(state)`, `statPointsRemaining(state)`, `reconcileStatBudget(state)` (called from `render()` from this task onward).

- [ ] **Step 1: Import `STAT_COSTS` and add stat math helpers**

In `js/pc-wizard.js`, change the top import line:
```js
import { esc } from './character-card.js';
```
to:
```js
import { esc } from './character-card.js';
import { STAT_COSTS } from './npc-character-gen.js';
```

Add (after `gbLeftover`):

```js
function archetypeStatBonus(name, state, ctx) {
  const arch = archetypeObj(state, ctx);
  return arch && arch.statBonus === name ? 1 : 0;
}

function pathStatBonus(name, state, ctx) {
  const path = pathObj(state, ctx);
  return path && path.statBonuses.includes(name) ? 1 : 0;
}

function statBonus(name, state, ctx) {
  return archetypeStatBonus(name, state, ctx) + pathStatBonus(name, state, ctx);
}

function displayedStat(name, state, ctx) {
  return state.stats[name] + statBonus(name, state, ctx);
}

function statStepCost(purchasedValue) {
  if (purchasedValue >= 5) return null;
  return STAT_COSTS[purchasedValue] - STAT_COSTS[purchasedValue - 1];
}

function statBudget(state) {
  return 42 + (state.gbApplyTo === 'stats' ? gbLeftover(state) : 0);
}

function totalStatSpent(state) {
  return STAT_NAMES.reduce((sum, name) => sum + STAT_COSTS[state.stats[name] - 1], 0);
}

function statPointsRemaining(state) {
  return statBudget(state) - totalStatSpent(state);
}

function reconcileStatBudget(state) {
  let guard = 0;
  while (statPointsRemaining(state) < 0 && guard < 100) {
    let target = null;
    let bestCost = -1;
    STAT_NAMES.forEach(name => {
      const v = state.stats[name];
      if (v <= 1) return;
      const cost = STAT_COSTS[v - 1] - STAT_COSTS[v - 2];
      if (cost > bestCost) { bestCost = cost; target = name; }
    });
    if (!target) break;
    state.stats[target] -= 1;
    guard++;
  }
}
```

- [ ] **Step 2: Add the Stats step builder**

Add (after `buildGiftsBurdensStep`):

```js
function buildStatsStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Allocate Stats';
  wrap.appendChild(heading);

  const remaining = statPointsRemaining(state);
  const badge = document.createElement('div');
  badge.className = `wizard-points-badge mb-0-75${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `Stat points remaining: ${remaining} / ${statBudget(state)}`;
  wrap.appendChild(badge);

  const grid = document.createElement('div');
  grid.className = 'wizard-stat-grid';
  STAT_NAMES.forEach(name => {
    const purchased = state.stats[name];
    const bonus = statBonus(name, state, ctx);
    const displayed = purchased + bonus;
    const nextCost = statStepCost(purchased);

    const cell = document.createElement('div');
    cell.className = 'wizard-stat-cell';
    cell.innerHTML = `
      <span class="wizard-stat-name">${esc(name)}</span>
      <span class="wizard-stat-value">${displayed}</span>
      <span class="text-muted-sm">${purchased} purchased${bonus ? ` + ${bonus} bonus` : ''}</span>
    `;

    const stepper = document.createElement('div');
    stepper.className = 'wizard-stepper';
    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'secondary';
    decBtn.textContent = '−';
    decBtn.disabled = purchased <= 1;
    decBtn.addEventListener('click', () => { state.stats[name] -= 1; rerender(); });
    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'secondary';
    incBtn.textContent = '+';
    incBtn.disabled = nextCost === null || nextCost > remaining;
    incBtn.addEventListener('click', () => { state.stats[name] += 1; rerender(); });
    stepper.appendChild(decBtn);
    stepper.appendChild(incBtn);
    cell.appendChild(stepper);

    grid.appendChild(cell);
  });
  wrap.appendChild(grid);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 2; rerender(); },
    onNext: () => { state.step = 4; rerender(); },
  }));
  return wrap;
}
```

- [ ] **Step 3: Wire the step in, reconcile on render, bump `STEP_COUNT`**

Change:
```js
let STEP_COUNT = 3;
```
to:
```js
let STEP_COUNT = 4;
```

In `summaryText`, add before the final `return '';`:
```js
  if (i === 3) {
    return `Stats: ${totalStatSpent(state)}/${statBudget(state)} points spent`;
  }
```

In `buildStepBody`, add before the `empty` fallback:
```js
  if (i === 3) return buildStatsStep(state, ctx, rerender);
```

In `init`'s `render()` function, call the reconciler before building the DOM tree:
```js
  function render() {
    reconcileStatBudget(state);
    container.innerHTML = '';
```

- [ ] **Step 4: Bump `sw.js` cache**

Change `CACHE` from `'cc-gm-v37'` to `'cc-gm-v38'` in `sw.js`.

- [ ] **Step 5: Add CSS**

Append to `css/style.css`:

```css
.wizard-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.wizard-stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.6rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: center;
}

.wizard-stat-name { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.wizard-stat-value { font-family: var(--font-display); font-size: 1.6rem; color: var(--text); }

.wizard-stepper { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
.wizard-stepper button { min-width: 2.2rem; }
```

- [ ] **Step 6: Verify manually with `playwright-cli`**

Serve the app, clear cache, navigate to Guided Creation, pick an archetype (e.g. Warrior, +1 Strength) and a path whose bonuses include Strength (e.g. Path of the Eagle, +1 Strength/Wisdom), reach the Stats step. Confirm: Strength displays `3` (1 purchased + 1 archetype + 1 path) with its `−` disabled (purchased floor is 1) since it hasn't been purchased above 1 yet; clicking `+` on Strength increases purchased to 2, displayed to 4, and spends 3 points (remaining drops from 42 to 39); clicking `+` repeatedly until remaining hits 0 disables every stat's `+` button; go back to Gifts/Burdens, add a Burden (e.g. `-2`), confirm remaining points on the Stats step increase by 2 when `gbApplyTo` is "Stats" (default); switch `gbApplyTo` to "Skills" on the Gifts/Burdens step and confirm the Stats budget drops back down (and, if it had been spent into the leftover, confirm a purchased stat gets automatically reduced rather than remaining going negative).

- [ ] **Step 7: Commit**

```bash
git add js/pc-wizard.js sw.js css/style.css
git commit -m "Add Stats point-buy step to the PC guided-creation wizard"
```

---

## Task 5: Skills point-buy step

**Files:**
- Modify: `js/pc-wizard.js`
- Modify: `sw.js` (bump `CACHE`)
- Modify: `css/style.css` (skill stepper column, spec row)

**Interfaces:**
- Consumes: `STEP_COUNT`, `gbLeftover(state)`, `js/npc-character-gen.js`'s exported `SKILL_COSTS` and existing `clampSpecRank`; `ctx.allSkills` (array of `{ name, requiresRank, diceCheck, specialized }`).
- Produces: `skillFloor(name, state, ctx)`, `skillBudget(state)`, `totalSkillSpent(state, ctx)`, `skillPointsRemaining(state, ctx)`, `reconcileSkillBudget(state, ctx)` (called from `render()` from this task onward). `state.skills` populated in the shape `{ [skillName]: { general, specialized?: { name, rank } } }`, matching what `renderPcCard`/`character-card.js` already expect — consumed as-is by Task 6's handoff.

- [ ] **Step 1: Import `SKILL_COSTS`/`clampSpecRank` and add skill math helpers**

Change the import line:
```js
import { STAT_COSTS } from './npc-character-gen.js';
```
to:
```js
import { STAT_COSTS, SKILL_COSTS, clampSpecRank } from './npc-character-gen.js';
```

Add (after `reconcileStatBudget`):

```js
function skillFloor(name, state) {
  return name === state.archetypeFreeSkill ? 1 : 0;
}

function skillGeneralRank(name, state) {
  return state.skills[name]?.general || 0;
}

function skillGeneralCost(name, state) {
  const rank = skillGeneralRank(name, state);
  return SKILL_COSTS[rank] - SKILL_COSTS[skillFloor(name, state)];
}

function skillSpecCost(name, state) {
  const spec = state.skills[name]?.specialized;
  return spec ? SKILL_COSTS[spec.rank] : 0;
}

function skillBudget(state) {
  return 42 + (state.gbApplyTo === 'skills' ? gbLeftover(state) : 0);
}

function totalSkillSpent(state, ctx) {
  return ctx.allSkills.reduce((sum, s) => sum + skillGeneralCost(s.name, state) + skillSpecCost(s.name, state), 0);
}

function skillPointsRemaining(state, ctx) {
  return skillBudget(state) - totalSkillSpent(state, ctx);
}

function setSkillGeneral(name, state, rank) {
  if (rank <= 0) {
    delete state.skills[name];
    return;
  }
  const existing = state.skills[name] || {};
  const maxSpecRank = Math.max(0, rank - 1);
  if (existing.specialized && existing.specialized.rank > maxSpecRank) {
    existing.specialized = maxSpecRank > 0 ? { ...existing.specialized, rank: maxSpecRank } : undefined;
  }
  state.skills[name] = { ...existing, general: rank };
}

function reconcileSkillBudget(state, ctx) {
  let guard = 0;
  while (skillPointsRemaining(state, ctx) < 0 && guard < 200) {
    // Drop the priciest specialization first (bonus content, not core rank).
    let specTarget = null, specBest = -1;
    ctx.allSkills.forEach(s => {
      const cost = skillSpecCost(s.name, state);
      if (cost > specBest) { specBest = cost; specTarget = s.name; }
    });
    if (specTarget && specBest > 0) {
      delete state.skills[specTarget].specialized;
      guard++;
      continue;
    }
    // Then reduce the priciest general rank above its floor.
    let genTarget = null, genBest = -1;
    ctx.allSkills.forEach(s => {
      const rank = skillGeneralRank(s.name, state);
      const floor = skillFloor(s.name, state);
      if (rank <= floor) return;
      const cost = SKILL_COSTS[rank] - SKILL_COSTS[rank - 1];
      if (cost > genBest) { genBest = cost; genTarget = s.name; }
    });
    if (!genTarget) break;
    setSkillGeneral(genTarget, state, skillGeneralRank(genTarget, state) - 1);
    guard++;
  }
}
```

- [ ] **Step 2: Add the Skills step builder**

Add (after `buildStatsStep`):

```js
function buildSkillRow(skillDef, state, ctx, remaining, rerender) {
  const floor = skillFloor(skillDef.name, state);
  const rank = skillGeneralRank(skillDef.name, state);
  const nextCost = rank < 6 ? SKILL_COSTS[rank + 1] - SKILL_COSTS[rank] : null;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${esc(skillDef.name)}</td>
    <td class="text-muted-sm">${skillDef.diceCheck.join(' / ')}</td>
    <td>${rank}</td>
  `;

  const stepperTd = document.createElement('td');
  const stepper = document.createElement('div');
  stepper.className = 'wizard-stepper';
  const decBtn = document.createElement('button');
  decBtn.type = 'button';
  decBtn.className = 'secondary';
  decBtn.textContent = '−';
  decBtn.disabled = rank <= floor;
  decBtn.addEventListener('click', () => { setSkillGeneral(skillDef.name, state, rank - 1); rerender(); });
  const incBtn = document.createElement('button');
  incBtn.type = 'button';
  incBtn.className = 'secondary';
  incBtn.textContent = '+';
  incBtn.disabled = nextCost === null || nextCost > remaining;
  incBtn.addEventListener('click', () => { setSkillGeneral(skillDef.name, state, rank + 1); rerender(); });
  stepper.appendChild(decBtn);
  stepper.appendChild(incBtn);
  stepperTd.appendChild(stepper);
  tr.appendChild(stepperTd);

  if (skillDef.specialized?.length && rank >= 2) {
    const specTd = document.createElement('td');
    const current = state.skills[skillDef.name]?.specialized;
    const select = document.createElement('select');
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'No specialization';
    noneOpt.selected = !current;
    select.appendChild(noneOpt);
    skillDef.specialized.forEach(specName => {
      const opt = document.createElement('option');
      opt.value = specName;
      opt.textContent = specName;
      opt.selected = current?.name === specName;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      const entry = state.skills[skillDef.name] || { general: rank };
      entry.specialized = select.value ? { name: select.value, rank: 1 } : undefined;
      state.skills[skillDef.name] = entry;
      rerender();
    });
    specTd.appendChild(select);

    if (current) {
      const maxSpecRank = Math.max(0, rank - 1);
      const specNextCost = current.rank < maxSpecRank ? SKILL_COSTS[current.rank + 1] - SKILL_COSTS[current.rank] : null;
      const specStepper = document.createElement('div');
      specStepper.className = 'wizard-stepper';
      const specDec = document.createElement('button');
      specDec.type = 'button';
      specDec.className = 'secondary';
      specDec.textContent = '−';
      specDec.disabled = current.rank <= 0;
      specDec.addEventListener('click', () => {
        current.rank = clampSpecRank(current.rank - 1, rank);
        rerender();
      });
      const specInc = document.createElement('button');
      specInc.type = 'button';
      specInc.className = 'secondary';
      specInc.textContent = '+';
      specInc.disabled = specNextCost === null || specNextCost > remaining;
      specInc.addEventListener('click', () => {
        current.rank = clampSpecRank(current.rank + 1, rank);
        rerender();
      });
      specStepper.appendChild(specDec);
      specStepper.appendChild(specInc);
      specTd.appendChild(specStepper);
    }
    tr.appendChild(specTd);
  } else {
    tr.appendChild(document.createElement('td'));
  }

  return tr;
}

function buildSkillsStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Allocate Skills';
  wrap.appendChild(heading);

  const arch = archetypeObj(state, ctx);
  if (arch && arch.freeSkillOptions?.length) {
    const freeRow = document.createElement('div');
    freeRow.className = 'row-flex-wrap mb-0-75';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Free Archetype skill rank:';
    const select = document.createElement('select');
    arch.freeSkillOptions.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      opt.selected = state.archetypeFreeSkill === name;
      select.appendChild(opt);
    });
    if (!state.archetypeFreeSkill) {
      state.archetypeFreeSkill = arch.freeSkillOptions[0];
      select.value = state.archetypeFreeSkill;
    }
    select.addEventListener('change', () => {
      const prev = state.archetypeFreeSkill;
      state.archetypeFreeSkill = select.value;
      if (prev && skillGeneralRank(prev, state) === 1) delete state.skills[prev];
      rerender();
    });
    freeRow.appendChild(label);
    freeRow.appendChild(select);
    wrap.appendChild(freeRow);
    if (!state.skills[state.archetypeFreeSkill]) {
      state.skills[state.archetypeFreeSkill] = { general: 1 };
    }
  }

  const remaining = skillPointsRemaining(state, ctx);
  const badge = document.createElement('div');
  badge.className = `wizard-points-badge mb-0-75${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `Skill points remaining: ${remaining} / ${skillBudget(state)}`;
  wrap.appendChild(badge);

  const half = Math.ceil(ctx.allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  [ctx.allSkills.slice(0, half), ctx.allSkills.slice(half)].forEach(subset => {
    const table = document.createElement('table');
    table.className = 'skill-table';
    table.innerHTML = '<thead><tr><th>Skill</th><th>Stats</th><th>Rank</th><th></th><th>Specialization</th></tr></thead>';
    const tbody = document.createElement('tbody');
    subset.forEach(skillDef => tbody.appendChild(buildSkillRow(skillDef, state, ctx, remaining, rerender)));
    table.appendChild(tbody);
    const skillWrap = document.createElement('div');
    skillWrap.className = 'skill-table-wrap';
    skillWrap.appendChild(table);
    pair.appendChild(skillWrap);
  });
  wrap.appendChild(pair);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 3; rerender(); },
  }));
  return wrap;
}
```

- [ ] **Step 3: Wire the step in, reconcile on render, bump `STEP_COUNT`**

Change:
```js
let STEP_COUNT = 4;
```
to:
```js
let STEP_COUNT = 5;
```

In `buildStepBody`, add before the `empty` fallback:
```js
  if (i === 4) return buildSkillsStep(state, ctx, rerender);
```

In `init`'s `render()`, add the second reconciler call:
```js
  function render() {
    reconcileStatBudget(state);
    reconcileSkillBudget(state, ctx);
    container.innerHTML = '';
```

- [ ] **Step 4: Bump `sw.js` cache**

Change `CACHE` from `'cc-gm-v38'` to `'cc-gm-v39'` in `sw.js`.

- [ ] **Step 5: Add CSS**

Append to `css/style.css`:

```css
.wizard .skill-table th:nth-child(4),
.wizard .skill-table td:nth-child(4) { width: 5rem; }
.wizard .skill-table th:nth-child(5),
.wizard .skill-table td:nth-child(5) { width: 9rem; }
```

- [ ] **Step 6: Verify manually with `playwright-cli`**

Serve the app, clear cache, navigate to Guided Creation, pick an archetype with `freeSkillOptions` (e.g. Warrior → Melee Weapons/Unarmed Combat), go through to the Skills step. Confirm: the free-skill dropdown defaults to the first option and that skill shows rank 1 with `−` disabled (floor 1) at no point cost (remaining still `42/42`); switching the dropdown to the other free-skill option moves the free rank there and the first skill's rank drops to 0; buying general ranks on other skills spends points correctly per `SKILL_COSTS`; a skill reaching general rank 2 reveals a specialization dropdown, selecting one adds a rank-1 specialization costing 1 point, and its own `+`/`−` steppers respect the `general − 1` cap; confirm remaining hits 0 and further `+` buttons disable across the board.

- [ ] **Step 7: Commit**

```bash
git add js/pc-wizard.js sw.js css/style.css
git commit -m "Add Skills point-buy step to the PC guided-creation wizard"
```

---

## Task 6: Finish handoff and full walkthrough

**Files:**
- Modify: `js/pc-wizard.js` (Finish footer + `buildFinishedPc`)
- Modify: `sw.js` (bump `CACHE`)
- Modify: `css/style.css` (Finish footer spacing, if needed)

**Interfaces:**
- Consumes: `calcDerivedStats` from `js/npc-character-gen.js`; `displayedStat`, `STAT_NAMES`, `gbPointsRemaining`, `state.giftsAndBurdens`, `state.skills`; the `onFinish` callback passed into `init` by `js/pc-gen.js` (already wired in Task 2).
- Produces: nothing further downstream — this is the terminal task. `onFinish(pc)` receives a `pc` object shaped exactly like `pc-gen.js`'s `blankPc()`.

- [ ] **Step 1: Import `calcDerivedStats` and add the handoff builder**

Change the import line:
```js
import { STAT_COSTS, SKILL_COSTS, clampSpecRank } from './npc-character-gen.js';
```
to:
```js
import { STAT_COSTS, SKILL_COSTS, clampSpecRank, calcDerivedStats } from './npc-character-gen.js';
```

Add (after `buildSkillsStep`):

```js
function buildFinishedPc(state, ctx) {
  const stats = {};
  STAT_NAMES.forEach(name => { stats[name] = displayedStat(name, state, ctx); });
  const derived = calcDerivedStats(stats);
  return {
    name: '', age: '', gender: '', sexuality: '',
    archetype: state.archetype,
    path: { name: state.path },
    motivation: { name: '', description: '' },
    giftsAndBurdens: state.giftsAndBurdens,
    stats,
    skills: JSON.parse(JSON.stringify(state.skills)),
    ability: { name: '', description: '', diceCheck: [] },
    derived,
    current: { Body: derived.Body, Mind: derived.Mind, Soul: derived.Soul },
  };
}

function isWizardComplete(state) {
  return Boolean(state.archetype) && Boolean(state.path) && gbPointsRemaining(state) >= 0;
}
```

- [ ] **Step 2: Add the Finish footer to `render()`**

In `init`'s `render()` function, after the `for` loop that appends step bodies/summaries and before `container.appendChild(wrap);`, add:

```js
    if (isWizardComplete(state)) {
      const finishRow = document.createElement('div');
      finishRow.className = 'row-flex-wrap wizard-finish-row';
      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.textContent = 'Finish';
      finishBtn.addEventListener('click', () => onFinish(buildFinishedPc(state, ctx)));
      finishRow.appendChild(finishBtn);
      wrap.appendChild(finishRow);
    }
```

The full `render()` function now reads:

```js
  function render() {
    reconcileStatBudget(state);
    reconcileSkillBudget(state, ctx);
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wizard';
    for (let i = 0; i <= state.step && i < STEP_COUNT; i++) {
      wrap.appendChild(
        i < state.step
          ? buildSummaryLine(i, state, ctx, render)
          : buildStepBody(i, state, ctx, render)
      );
    }
    if (isWizardComplete(state)) {
      const finishRow = document.createElement('div');
      finishRow.className = 'row-flex-wrap wizard-finish-row';
      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.textContent = 'Finish';
      finishBtn.addEventListener('click', () => onFinish(buildFinishedPc(state, ctx)));
      finishRow.appendChild(finishBtn);
      wrap.appendChild(finishRow);
    }
    container.appendChild(wrap);
  }
```

- [ ] **Step 3: Bump `sw.js` cache**

Change `CACHE` from `'cc-gm-v39'` to `'cc-gm-v40'` in `sw.js`.

- [ ] **Step 4: Add CSS (only if the default `row-flex-wrap` spacing looks cramped against the last step)**

Append to `css/style.css`:

```css
.wizard-finish-row { margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 5: Full end-to-end verification with `playwright-cli`**

Serve the app, clear the service worker cache, navigate to PCs → Guided Creation and walk the entire flow:

1. Pick Warrior (archetype), Path of the Eagle (path), add one `+1` Gift and one `-2` Burden (remaining should read `5 − 1 + 2 = 6`, apply-to left on "Stats").
2. On Stats, confirm Strength shows `3` displayed (1 purchased + 1 archetype + 1 path) and the points-remaining badge reads `48` (42 + 6 leftover). Spend a few points on different stats.
3. On Skills, confirm the free-skill dropdown defaults to Warrior's first `freeSkillOptions` entry at rank 1 for free, buy a couple of general ranks and one specialization.
4. Re-open the Archetype summary line via "Edit", switch to a different archetype, confirm the Stats/Skills steps' bonuses and free-skill dropdown recompute correctly when you return to them, and remaining totals stay consistent (no negative badges).
5. Click "Finish". Confirm the PC tab now shows the existing card in edit mode, pre-filled with the chosen archetype/path/gifts-burdens text and the correct stats/skills/derived values, with name/motivation/ability blank.
6. Fill in a name, click Save, confirm it appears in the Saved PCs list and reopens correctly (view mode shows the same stats/skills).
7. Reload the page (with the service worker now caching `v40`) and confirm the Guided Creation button and full flow still work offline-cached (open DevTools → Network → offline, reload, repeat step 1 once more to sanity-check no network fetch is required).

- [ ] **Step 6: Commit**

```bash
git add js/pc-wizard.js sw.js css/style.css
git commit -m "Add Finish handoff to the PC guided-creation wizard"
```

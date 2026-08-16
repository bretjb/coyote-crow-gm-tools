# Encounter Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Encounter" tab where a GM checks off saved Full NPCs and PCs from two searchable lists and, on one click, replaces the Initiative Tracker's contents with those combatants (clamped to their Initiative-Score slot) and switches to the Initiative tab.

**Architecture:** A new `js/encounter.js` module (`init(container)`, registered as `tabInits['encounter']` in `js/app.js`) renders two independent checkbox-list pickers — one sourced from `npc-storage.js`'s `getAll()` filtered to `kind: 'full'`, one from `pc-storage.js`'s `getAll()` — each with its own live search box and its own `Set` of checked ids that survives re-filtering. Neither picker owns any new persisted state; checked-id membership is a plain in-memory `Set` per tab visit. "Generate Encounter" reads both `Set`s, calls `clearAll()` then `addCombatant(name, slot, { kind, id })` once per checked entry from `initiative-state.js`, then clicks the Initiative tab button to switch views through the app shell's existing (unexported, DOM-click-driven) tab-activation path.

**Tech Stack:** Vanilla JS (ES modules, no build step), `css/style.css` for all styling (no inline styles), `sw.js` cache-first service worker.

## Baseline

This plan is written against the **combined end state of four prerequisite plans**, none yet executed on disk. Every "Find" snippet below quoting `js/npc-storage.js`, `js/pc-storage.js`, `js/app.js`, `index.html`, or `sw.js` reflects that combined end state, not what exists in the repo today. Do not start this plan until all four are merged, in this order:

1. `docs/superpowers/plans/2026-08-16-full-npc-card-view-edit.md` ("Group B") — view/edit mode, tooltips, `sw.js` at `CACHE = 'cc-gm-v9'`.
2. `docs/superpowers/plans/2026-08-16-pc-tab.md` ("PC tab") — extracts `js/character-card.js`, adds `js/pc-storage.js` (`getAll()`, `savePc`, `updatePc`, `removePc`, `undoRemove`, `exportAll`, `importMerge`, `subscribe`; entries shaped `{ id, data, note, savedAt, deleted }`, **no `kind`, no `tags`**) and `js/pc-gen.js`, wires the `pc` tab into `index.html`/`js/app.js`, ends at `sw.js` `CACHE = 'cc-gm-v12'`.
3. `docs/superpowers/plans/2026-08-16-npc-data-content.md` ("NPC data & content") — adds `tags: string[]` to every `npc-storage.js` entry (`saveNpc`/`updateNpc`/`importMerge` all normalize it via a shared `normalizeTags()`; `getAll()` always includes `tags`), and adds a live search box to the Saved NPCs list in `js/npc-gen.js` filtering by this exact predicate (`renderSavedList`, reproduced verbatim below since this plan's picker reuses it), ends at `sw.js` `CACHE = 'cc-gm-v15'`.
4. `docs/superpowers/plans/2026-08-16-initiative-tracker-updates.md` ("Initiative tracker updates") — grows `addCombatant(name, slot)` to `addCombatant(name, slot, source)` where `source` is `{ kind: 'npc' | 'pc', id: string }` or omitted/`null`; adds `getById(id)` to both storage modules (not used by this plan, `getAll()` is enough); adds `round`, `undoClearAll()`, and `clearAll()` (unchanged call signature, now also resets `round` and stashes prior state for undo) to `initiative-state.js`; ends at `sw.js` `CACHE = 'cc-gm-v18'`.

**The exact search predicate this plan reuses** (from the NPC data & content plan's `renderSavedList`, `js/npc-gen.js`):

```js
function renderSavedList(listEl, output, ctx, query = '') {
  const allEntries = getAll();
  const entries = query
    ? allEntries.filter(entry => {
        const name = (entry.data?.name || '').toLowerCase();
        const tags = (entry.tags || []).map(t => t.toLowerCase());
        return name.includes(query) || tags.some(t => t.includes(query));
      })
    : allEntries;
  ...
```

The query is lowercased once, at the input's `input` listener, before being stored and passed in (`searchQuery = searchInput.value.trim().toLowerCase()`). This plan's `matchesQuery()` helper (Task 1) copies this predicate exactly. Since PC entries have no `tags` field at all, `(entry.tags || [])` naturally evaluates to `[]` for them and the `.some(...)` is always `false` — so reusing the *identical* function for the PC list, unmodified, correctly degrades to a name-only match with zero special-casing. This was verified by reading the PC tab plan's `pc-storage.js` in full: no task in any of the four prerequisite plans ever adds `tags` to PC entries.

**Important detail verified by reading the real, current `js/npc-storage.js` on disk (unaffected by this specific point in any of the four plans):** `getAll()` does **not** filter out soft-deleted entries — only `load()` does, and only across a page reload. `removeNpc(id)`/`removePc(id)` just flip `entry.deleted = true` on the in-memory array (so `undoRemove`/`undoRemove` can restore them within the same session) and `notify()`; the entry stays in `state.npcs`/`state.pcs` until the next reload. This means **this plan's picker must explicitly filter `!entry.deleted` itself** — `getAll()` alone is not enough — exactly mirroring how `renderSavedList`/`renderSavedPcList` do it in their own `else`-branch checks.

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x = ...`) anywhere in new code — all styling via `css/style.css` classes.
- No emoji anywhere, including UI copy.
- Any new `js/*.js` module fetched/imported at runtime must be added to `sw.js`'s `ASSETS` array, and `sw.js`'s `CACHE` version string must be bumped whenever `ASSETS` or any cached file's contents change, or the service worker will keep serving stale files. This plan starts from `CACHE = 'cc-gm-v18'` (the end state of the fourth prerequisite plan) and ends at `v19`.
- No JS unit test suite exists in this project (no `package.json`, no test runner). Verify every task by serving the app locally (`python3 -m http.server 8934`) and driving it with `playwright-cli`. Unregister the service worker before each verification run: `playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"` then `playwright-cli reload`.
- The picker is read-only against `npc-storage.js`/`pc-storage.js` (only `getAll()`/`subscribe()` are called) and write-only against `initiative-state.js` (only `clearAll()`/`addCombatant()`). No new storage module, no new persisted "encounter" entity.
- Scope is Full NPCs and PCs only. Quick NPCs (`kind: 'quick'`) must never appear in the picker — they have no `derived.Initiative` to suggest a slot with.

---

## Task 1: Encounter tab shell, picker UI, and search/filter

**Files:**
- Create: `js/encounter.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `getAll`, `subscribe` from `js/npc-storage.js` and `js/pc-storage.js` (both per the PC tab / NPC data & content plans' end state).
- Produces: `js/encounter.js` exporting `init(container)`. Internal helpers `matchesQuery(entry, query)` and `renderPickerList(listEl, entries, checkedIds, query, extraLineFn)` are private to this module (not exported) — Task 2 adds to this same file and calls them directly, no import needed.

- [ ] **Step 1: Create `js/encounter.js` with the two-list picker (no Generate behavior yet)**

```js
// js/encounter.js
import { getAll as getAllNpcs, subscribe as subscribeNpcs } from './npc-storage.js';
import { getAll as getAllPcs, subscribe as subscribePcs } from './pc-storage.js';

function matchesQuery(entry, query) {
  if (!query) return true;
  const name = (entry.data?.name || '').toLowerCase();
  const tags = (entry.tags || []).map(t => t.toLowerCase());
  return name.includes(query) || tags.some(t => t.includes(query));
}

function renderPickerList(listEl, entries, checkedIds, query, extraLineFn, onToggle) {
  const filtered = entries.filter(entry => matchesQuery(entry, query));
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="text-muted-sm">No entries match.</p>';
    return;
  }
  filtered.forEach(entry => {
    const row = document.createElement('label');
    row.className = 'encounter-picker-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checkedIds.has(entry.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) checkedIds.add(entry.id);
      else checkedIds.delete(entry.id);
      onToggle();
    });

    const text = document.createElement('span');
    const extra = extraLineFn ? extraLineFn(entry) : '';
    text.textContent = extra ? `${entry.data?.name || '(unnamed)'} — ${extra}` : (entry.data?.name || '(unnamed)');

    row.appendChild(checkbox);
    row.appendChild(text);
    listEl.appendChild(row);
  });
}

export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Encounter Generator</h2>
    <div class="row-flex-wrap mb-1-5">
      <div class="flex-1">
        <h3 class="mb-0-5">NPCs</h3>
        <input id="enc-npc-search" type="text" class="search-input mb-0-75" placeholder="Search by name or tag...">
        <div id="enc-npc-list" class="encounter-picker-list"></div>
      </div>
      <div class="flex-1">
        <h3 class="mb-0-5">PCs</h3>
        <input id="enc-pc-search" type="text" class="search-input mb-0-75" placeholder="Search by name...">
        <div id="enc-pc-list" class="encounter-picker-list"></div>
      </div>
    </div>
    <button id="enc-generate" disabled>Generate Encounter</button>
  `;

  const npcListEl = container.querySelector('#enc-npc-list');
  const pcListEl = container.querySelector('#enc-pc-list');
  const npcSearchInput = container.querySelector('#enc-npc-search');
  const pcSearchInput = container.querySelector('#enc-pc-search');
  const generateBtn = container.querySelector('#enc-generate');

  const checkedNpcIds = new Set();
  const checkedPcIds = new Set();
  let npcQuery = '';
  let pcQuery = '';

  function updateGenerateBtn() {
    generateBtn.disabled = checkedNpcIds.size === 0 && checkedPcIds.size === 0;
  }

  function getFullNpcEntries() {
    return getAllNpcs().filter(entry => !entry.deleted && entry.kind === 'full');
  }

  function getPcEntries() {
    return getAllPcs().filter(entry => !entry.deleted);
  }

  function refreshNpcList() {
    renderPickerList(npcListEl, getFullNpcEntries(), checkedNpcIds, npcQuery, entry => entry.data?.archetype || '', updateGenerateBtn);
  }

  function refreshPcList() {
    renderPickerList(pcListEl, getPcEntries(), checkedPcIds, pcQuery, null, updateGenerateBtn);
  }

  refreshNpcList();
  refreshPcList();
  updateGenerateBtn();

  subscribeNpcs(refreshNpcList);
  subscribePcs(refreshPcList);

  npcSearchInput.addEventListener('input', () => {
    npcQuery = npcSearchInput.value.trim().toLowerCase();
    refreshNpcList();
  });
  pcSearchInput.addEventListener('input', () => {
    pcQuery = pcSearchInput.value.trim().toLowerCase();
    refreshPcList();
  });
}
```

Note: `subscribeNpcs`/`subscribePcs` keep the picker in sync if the GM saves a new NPC/PC (e.g. via another browser tab, or — more realistically — if this tab is left open while the NPC/PC tabs also run in the same page across a future multi-panel layout) while the Encounter tab is mounted. This mirrors the subscribe/notify pattern every other feature module already follows against these same stores (`CLAUDE.md`'s "Session stores" section) rather than introducing a one-off exception.

- [ ] **Step 2: Add picker CSS**

At the end of `css/style.css`, add:

```css
.encounter-picker-list { max-height: 18rem; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; }
.encounter-picker-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; cursor: pointer; }
```

- [ ] **Step 3: Wire the new tab into `index.html`**

Find:
```html
    <button class="tab-btn" data-tab="pc"><span class="tab-label">PCs</span></button>
    <button class="tab-btn" data-tab="dice"><span class="tab-label">Dice</span></button>
```
Replace with:
```html
    <button class="tab-btn" data-tab="pc"><span class="tab-label">PCs</span></button>
    <button class="tab-btn" data-tab="encounter"><span class="tab-label">Encounter</span></button>
    <button class="tab-btn" data-tab="dice"><span class="tab-label">Dice</span></button>
```

Find:
```html
    <div id="tab-pc" class="tab-panel hidden"></div>
    <div id="tab-dice" class="tab-panel hidden"></div>
```
Replace with:
```html
    <div id="tab-pc" class="tab-panel hidden"></div>
    <div id="tab-encounter" class="tab-panel hidden"></div>
    <div id="tab-dice" class="tab-panel hidden"></div>
```

(Tab order is not specified by the spec; this plan places Encounter right after PCs and before Dice, matching the GM workflow of building NPCs/PCs, then generating an encounter from them, then running it in Initiative.)

- [ ] **Step 4: Register the tab in `js/app.js`**

Find:
```js
import { init as initNames } from './name-gen.js';
import { init as initNpcs } from './npc-gen.js';
import { init as initPc } from './pc-gen.js';
import { init as initDice } from './dice-roller.js';
import { init as initInitiative } from './initiative.js';
import { init as initRules } from './rules.js';

const tabInits = { names: initNames, npcs: initNpcs, pc: initPc, dice: initDice, initiative: initInitiative, rules: initRules };
```
Replace with:
```js
import { init as initNames } from './name-gen.js';
import { init as initNpcs } from './npc-gen.js';
import { init as initPc } from './pc-gen.js';
import { init as initEncounter } from './encounter.js';
import { init as initDice } from './dice-roller.js';
import { init as initInitiative } from './initiative.js';
import { init as initRules } from './rules.js';

const tabInits = { names: initNames, npcs: initNpcs, pc: initPc, encounter: initEncounter, dice: initDice, initiative: initInitiative, rules: initRules };
```

- [ ] **Step 5: Register `js/encounter.js` in `sw.js` and bump the cache version**

In `sw.js`, change:
```js
const CACHE = 'cc-gm-v18';
```
to:
```js
const CACHE = 'cc-gm-v19';
```
In `ASSETS`, add after `'./js/pc-storage.js',`:
```js
  './js/pc-storage.js',
  './js/encounter.js',
```

- [ ] **Step 6: Verify in browser — picker lists Full NPCs and PCs, excludes Quick NPCs, search filters live**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=NPCs"
playwright-cli click "text=Quick NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=PCs"
playwright-cli click "role=button[name='New PC']"
playwright-cli fill "css=#pc-name-section input" "Test PC One"
playwright-cli press "Tab"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Save"
```

```bash
playwright-cli click "text=Encounter"
playwright-cli eval "document.querySelectorAll('#enc-npc-list .encounter-picker-row').length"
```
Expected: `2` — the two saved Full NPCs, and only them (the saved Quick NPC is absent).

```bash
playwright-cli eval "document.querySelectorAll('#enc-pc-list .encounter-picker-row').length"
```
Expected: `1` — the saved PC.

```bash
playwright-cli eval "document.querySelector('#enc-generate').disabled"
```
Expected: `true` — nothing checked yet.

```bash
playwright-cli fill "#enc-npc-search" "zzz-no-such-npc-zzz"
playwright-cli eval "document.querySelector('#enc-npc-list').textContent"
playwright-cli fill "#enc-npc-search" ""
playwright-cli eval "document.querySelectorAll('#enc-npc-list .encounter-picker-row').length"
```
Expected: nonsense query shows "No entries match."; clearing it restores `2` rows.

```bash
playwright-cli close
kill %1
```

- [ ] **Step 7: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/encounter.js index.html js/app.js css/style.css sw.js
git commit -m "feat: add Encounter tab shell with searchable Full NPC and PC pickers"
```

---

## Task 2: Generate Encounter behavior (clear, populate, switch tabs)

**Files:**
- Modify: `js/encounter.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `clearAll`, `addCombatant` from `js/initiative-state.js` (`addCombatant(name, slot, source)`, per the Initiative tracker updates plan).
- Produces: the `#enc-generate` button's click handler — no new exports.

- [ ] **Step 1: Import the initiative-state writes and enable the Generate button's behavior**

In `js/encounter.js`, add the import at the top — find:
```js
import { getAll as getAllNpcs, subscribe as subscribeNpcs } from './npc-storage.js';
import { getAll as getAllPcs, subscribe as subscribePcs } from './pc-storage.js';
```
replace with:
```js
import { getAll as getAllNpcs, subscribe as subscribeNpcs } from './npc-storage.js';
import { getAll as getAllPcs, subscribe as subscribePcs } from './pc-storage.js';
import { clearAll, addCombatant } from './initiative-state.js';
```

At the end of `init()` (right after the `pcSearchInput.addEventListener(...)` block, before the closing `}`), add:

```js
  function suggestedSlot(entry) {
    return Math.min(12, Math.max(1, entry.data.derived.Initiative));
  }

  generateBtn.addEventListener('click', () => {
    clearAll();

    for (const entry of getFullNpcEntries()) {
      if (!checkedNpcIds.has(entry.id)) continue;
      addCombatant(entry.data.name, suggestedSlot(entry), { kind: 'npc', id: entry.id });
    }

    for (const entry of getPcEntries()) {
      if (!checkedPcIds.has(entry.id)) continue;
      addCombatant(entry.data.name, suggestedSlot(entry), { kind: 'pc', id: entry.id });
    }

    document.querySelector('[data-tab="initiative"]').click();
  });
```

This filters `getFullNpcEntries()`/`getPcEntries()` (already deleted-filtered, defined in Task 1) down to the checked ids at generate-time — re-reading storage rather than trusting any stale entry object — so an entry deleted from the library between being checked and clicking Generate is silently skipped instead of added.

**Why the tab-switch click works:** `js/app.js`'s `activateTab(name)` function is not exported and there is no tab-switching API — the only way to trigger it from another module is exactly what the spec proposes: dispatch a real click on the target tab button, which the existing listener (`document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)))`) picks up. This was confirmed by reading the current `js/app.js` directly. `activateTab` toggles the `.active`/`.hidden` classes *synchronously* before `await`-ing `tabInits[name](panel)`, so the visible tab switch happens immediately regardless of whether Initiative has been visited before; if it's the first visit, `initiative.js`'s `init()` then runs and calls `render()`, which reads `getState()` fresh — by which point `clearAll()`/`addCombatant()` above have already run and been persisted via `notify()`, so the rendered slots are correct regardless of visit order.

- [ ] **Step 2: Bump the service worker cache version**

In `sw.js`, change:
```js
const CACHE = 'cc-gm-v19';
```
to:
```js
const CACHE = 'cc-gm-v20';
```

- [ ] **Step 3: Verify in browser — full generate flow, clamped slots, tab switch, Undo, Quick NPCs absent**

Set up: two Full NPCs, one PC, plus an unrelated manual combatant already in the tracker.

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli eval "localStorage.clear()"
playwright-cli reload
playwright-cli click "text=NPCs"
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=PCs"
playwright-cli click "role=button[name='New PC']"
playwright-cli fill "css=#pc-name-section input" "Encounter Test PC"
playwright-cli press "Tab"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Save"
```

```bash
playwright-cli click "text=Initiative"
playwright-cli fill "#init-name" "Unrelated Manual Combatant"
playwright-cli fill "#init-slot" "8"
playwright-cli click "text=Add"
playwright-cli eval "document.querySelectorAll('.init-chip').length"
```
Expected: `1` — the manual combatant is in the tracker before generating anything.

```bash
playwright-cli click "text=Encounter"
playwright-cli eval "document.querySelectorAll('#enc-npc-list .encounter-picker-row').length"
```
Expected: `2`.

```bash
playwright-cli eval "document.querySelectorAll('#enc-npc-list input[type=checkbox]')[0].click()"
playwright-cli eval "document.querySelectorAll('#enc-pc-list input[type=checkbox]')[0].click()"
playwright-cli eval "document.querySelector('#enc-generate').disabled"
```
Expected: `false` — button enabled once at least one checkbox is checked.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => JSON.stringify(Object.entries(m.getState().slots).flatMap(([slot, cs]) => cs.map(c => ({slot, name: c.data ? c.data.name : c.name})))))"
```
(Sanity check before clicking Generate — not required, informational.)

```bash
playwright-cli click "role=button[name='Generate Encounter']"
playwright-cli find "role=heading[name='Initiative Tracker']"
```
Expected: tab switched to Initiative automatically.

```bash
playwright-cli eval "document.querySelectorAll('.init-chip').length"
playwright-cli find "Unrelated Manual Combatant"
```
Expected: `2` chips total (the checked NPC + the checked PC); `Unrelated Manual Combatant` is NOT found — the tracker was cleared before repopulating.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); const found = Object.entries(s.slots).flatMap(([slot, cs]) => cs.map(c => ({slot: Number(slot), sourceKind: c.sourceKind}))); return JSON.stringify(found); })"
```
Expected: two entries, one with `sourceKind: "npc"`, one with `sourceKind: "pc"`, each `slot` between `1` and `12` inclusive (the clamped Initiative Score).

```bash
playwright-cli click "role=button[name='Undo']"
playwright-cli eval "document.querySelectorAll('.init-chip').length"
playwright-cli find "Unrelated Manual Combatant"
```
Expected: `1` chip, and it is `Unrelated Manual Combatant` — Undo (from the Initiative Tracker Updates plan's `undoClearAll()`, wired to the "Undo" button shown after any `clearAll()`, including the one Generate Encounter triggers) restores the exact pre-generation tracker state.

```bash
playwright-cli click "text=NPCs"
playwright-cli click "text=Quick NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli click "text=Encounter"
playwright-cli eval "document.querySelectorAll('#enc-npc-list .encounter-picker-row').length"
```
Expected: still `2` — saving a Quick NPC does not add a row to the NPC picker (confirms the `kind === 'full'` filter, exercised fresh here since Task 1's Step 6 already covered the base case).

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli eval "localStorage.clear()"
playwright-cli close
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/encounter.js sw.js
git commit -m "feat: generate encounters into the Initiative Tracker from the Encounter tab"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Scope restricted to Full NPCs (`kind: 'full'`) and PCs, Quick NPCs excluded (Task 1 `getFullNpcEntries()` filter, verified in both tasks' browser checks) — spec's "Scope" section. Two checkbox lists with independent live search reusing the Saved NPCs list's exact filter predicate, PC list degrading to name-only via the same shared `matchesQuery()` (Task 1) — spec's "Picker UI" section. Row text: name + archetype for NPCs, name only for PCs (Task 1's `extraLineFn`) — spec's "Picker UI" section. Generate button disabled until >=1 checked (Task 1 `updateGenerateBtn`) — spec's "Picker UI" section. Generate order — `clearAll()`, then `addCombatant(name, slot, source)` per checked entry with `Math.min(12, Math.max(1, entry.data.derived.Initiative))`, then tab-switch via `[data-tab="initiative"]` click — Task 2, matching spec's "Generate Behavior" section exactly, including the mechanism-verification note the task brief asked for. No append mode, no quantity spinner, replace-and-switch only — satisfied structurally (Generate always starts with `clearAll()`, no "add without clearing" path exists anywhere in the module). No new storage module; reads via `getAll()`, writes via `initiative-state.js` only — spec's "Data Flow" section. `sw.js` registration + cache bump — Task 1 Step 5, Task 2 Step 2.
- **Reconciling the four prerequisite plans — points that required judgment or cross-checking, called out explicitly per the task brief:**
  1. **Tab-switch mechanism.** `js/app.js`'s `activateTab` is not exported and there's no tab-switching API surface — confirmed by reading the real `js/app.js` on disk (unaffected by any of the four prerequisite plans, none of which touch it beyond adding entries to `tabInits`). The spec's proposed `document.querySelector('[data-tab="initiative"]').click()` is therefore not just viable but the *only* mechanism available, and it works correctly regardless of whether Initiative has been visited yet, because `activateTab` toggles visibility classes synchronously before its `await tabInits[name](panel)` — documented inline in Task 2 Step 1.
  2. **PC search has no tags to filter by.** Verified by reading the PC tab plan's `js/pc-storage.js` in full (`savePc`/`updatePc`/entry shape) and confirming no later prerequisite plan (including NPC data & content, which explicitly states "Do not touch `js/pc-gen.js`, `js/pc-storage.js`") ever adds a `tags` field to PC entries. Rather than writing a second, PC-specific predicate, this plan reuses the identical `matchesQuery()` for both lists — `(entry.tags || [])` on a tag-less PC entry evaluates to `[]`, so the `.some(...)` branch is always `false` and the function degrades to name-only matching for free, with no branching code needed.
  3. **`getAll()` does not filter deleted entries — this is not explicitly stated in the spec.** Confirmed by reading the real, current `js/npc-storage.js` (`getAll()` maps over `state.npcs` with no `deleted` filter; only `load()`, run once at module load / page load, drops them) and cross-checked against the PC tab plan's `pc-storage.js`, which follows the identical pattern. Both `getFullNpcEntries()`/`getPcEntries()` (Task 1) therefore filter `!entry.deleted` explicitly — without this, an NPC or PC removed-then-not-yet-reloaded would still show up (and be selectable) in the picker, contradicting the spec's "Soft-deleted entries... are excluded, same as the main Saved NPCs/PCs lists already do visually."
  4. **Tab placement in the nav** (`index.html`) is not specified anywhere in the spec. Placed directly after "PCs" and before "Dice" — a judgment call, not load-bearing to any behavior; flagged for review, easy to reorder by moving one `<button>`/`<div>` pair if a different position is preferred.
  5. **Subscribing the picker to `npc-storage.js`/`pc-storage.js` changes** (Task 1's `subscribeNpcs`/`subscribePcs` calls) is not explicitly requested by the spec, which only says the picker "reads `npc-storage.js`'s `getAll()` and `pc-storage.js`'s `getAll()` directly." Added anyway, matching `CLAUDE.md`'s stated pattern for consuming these stores ("a `Set` of subscriber callbacks... Follow this same pattern if you add another persisted feature") — a minor, low-risk addition in the same spirit as the NPC data & content plan's own deliberate minor additions (e.g. its tag-input blur-commit), not a scope deviation.
- **Placeholder scan:** every step has literal, complete code or a literal, runnable `playwright-cli`/`git`/`bash` command; no "TODO", "similar to Task N", or unstated logic.
- **Type/signature consistency:** `addCombatant(name, slot, source)` is called with the exact `{ kind: 'npc' | 'pc', id: string }` shape `initiative-state.js`'s `addCombatant` (per the Initiative tracker updates plan) expects, matching its own internal validation (`source.kind === 'npc' || source.kind === 'pc'`, `typeof source.id === 'string'`). `matchesQuery(entry, query)` and `renderPickerList(...)` are defined once in Task 1 and called identically by both the NPC and PC refresh functions, and again unchanged by Task 2 (which only adds new code, touching neither function). `getFullNpcEntries()`/`getPcEntries()` are defined once in Task 1's `init()` closure and reused as-is by Task 2's Generate handler — no duplicate deleted/kind-filtering logic exists anywhere in the file.

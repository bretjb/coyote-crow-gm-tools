# Initiative Tracker Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four features to the 12-slot initiative tracker: a live-linked current-character quick-lookup card, a round counter, single-use undo after Clear All, and NPC/PC color coding on chips.

**Architecture:** Combatants in `js/initiative-state.js` gain `sourceKind`/`sourceId` fields pointing at an entry in `npc-storage.js` or `pc-storage.js`; `addCombatant` gains an optional third `source` parameter. `npc-storage.js` and `pc-storage.js` each gain a `getById(id)` deep-copy accessor. `js/character-card.js`'s `appendSaveControls` gains an `ensureSaved()` method (auto-save-if-needed, reusing the Save button's own save path) and `appendInitiativeBtn` grows two trailing parameters (`sourceKind`, `ensureSaved`) so every card-originated initiative entry is live-linked. `js/initiative.js` renders a round counter, a session-only Undo button after Clear All, chip border colors keyed to `sourceKind`, and a new quick-lookup panel above the slot grid showing a live-editable mini stat card for every combatant in the current step's slot(s).

**Tech Stack:** Vanilla JS (ES modules, no build step), `css/style.css` for all styling (no inline styles in new code), `sw.js` cache-first service worker.

## Baseline

This plan is written against the **end state** of two prerequisite plans, neither yet executed on disk:

1. `docs/superpowers/plans/2026-08-16-full-npc-card-view-edit.md` ("Group B") — view/edit mode, tooltips, `sw.js` at `CACHE = 'cc-gm-v9'`.
2. `docs/superpowers/plans/2026-08-16-pc-tab.md` ("PC tab") — extracts `js/character-card.js` (with `appendSaveControls(card, data, savedEntry, storage)` returning `{ getSavedId }`, and `appendInitiativeBtn(card, getName, getSuggestedSlot)`), adds `js/pc-storage.js` (mirrors `npc-storage.js`, key `cc-pc-library`, entries `{ id, data, note, savedAt, deleted }`, no `kind` field) and `js/pc-gen.js`, renames `js/npc-tooltip.js` to `js/tooltip.js`, and leaves `sw.js` at `CACHE = 'cc-gm-v12'`.

Do not start this plan until both are merged. Every "Find" snippet below quoting `js/npc-gen.js`, `js/character-card.js`, or `js/pc-gen.js` reflects that combined end state, not what exists on disk today.

**Files this plan does not touch:** `js/encounter.js` or anything Encounter-Generator-related (a separate, later spec/plan).

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x = ...`) anywhere in code this plan writes — all styling via `css/style.css` classes. (`js/initiative.js`'s existing drag-and-drop inline styles are the codebase's one sanctioned exception, already in place, and untouched by this plan.)
- No emoji anywhere, including UI copy.
- `sw.js`'s `CACHE` version string must be bumped whenever any cached file's contents change, or the service worker will keep serving stale files. This plan introduces no new files, so no `ASSETS` entries are added — only version bumps.
- Escape all dynamic text inserted via `innerHTML` using the shared `esc()` helper from `js/character-card.js` — never interpolate raw NPC/PC/user data into `innerHTML`. (Pre-existing unescaped chip-name interpolation in `js/initiative.js`'s `render()` is out of scope for this plan — see Plan Self-Review Notes.)
- No JS unit test suite exists in this project (no `package.json`, no test runner). Verify every task by serving the app locally (`python3 -m http.server 8934`) and driving it with `playwright-cli`. Unregister the service worker before each verification run: `playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"` then `playwright-cli reload`.
- `localStorage`-backed state uses `getAll()`/deep-copy accessors and the subscribe/notify pattern established by `npc-storage.js` — `getById` on both storage modules must follow that same deep-copy discipline.

---

## Task 1: Combatant source linkage and storage `getById` accessors

**Files:**
- Modify: `js/initiative-state.js`
- Modify: `js/npc-storage.js`
- Modify: `js/pc-storage.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `addCombatant(name, slot, source)` where `source` is `{ kind: 'npc' | 'pc', id: string }` or omitted/`null`; combatants now shaped `{ id, name, sourceKind: 'npc' | 'pc' | null, sourceId: string | null }`. `getById(id)` exported from both `js/npc-storage.js` and `js/pc-storage.js`, returning a deep-copied entry (`{ id, data, note, savedAt, deleted }` shape, `kind` also present for NPCs) or `null`. Later tasks (4, 6) rely on all of these.

- [ ] **Step 1: Add `getById` to `js/npc-storage.js`**

In `js/npc-storage.js`, add immediately after `getAll()` (after line 37):

```js
export function getById(id) {
  const entry = state.npcs.find(n => n.id === id);
  return entry ? { ...entry, data: JSON.parse(JSON.stringify(entry.data)) } : null;
}
```

- [ ] **Step 2: Add `getById` to `js/pc-storage.js`**

In `js/pc-storage.js`, add immediately after `getAll()`:

```js
export function getById(id) {
  const entry = state.pcs.find(p => p.id === id);
  return entry ? { ...entry, data: JSON.parse(JSON.stringify(entry.data)) } : null;
}
```

- [ ] **Step 3: Give combatants a source reference**

In `js/initiative-state.js`, replace `addCombatant` (lines 55-60):

```js
export function addCombatant(name, slot) {
  const clamped = clampSlot(slot);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.slots[clamped].push({ id, name });
  notify();
}
```

with:

```js
export function addCombatant(name, slot, source) {
  const clamped = clampSlot(slot);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceKind = source && (source.kind === 'npc' || source.kind === 'pc') ? source.kind : null;
  const sourceId = sourceKind && typeof source.id === 'string' ? source.id : null;
  state.slots[clamped].push({ id, name, sourceKind, sourceId });
  notify();
}
```

- [ ] **Step 4: Defensively reconstruct `sourceKind`/`sourceId` when loading persisted state**

In `js/initiative-state.js`, replace `load()` (lines 19-33):

```js
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
    const parsed = JSON.parse(raw);
    const slots = emptySlots();
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (Array.isArray(parsed.slots?.[i])) slots[i] = parsed.slots[i];
    }
    const currentStep = clampSlot(parsed.currentStep, SLOT_COUNT);
    return { slots, currentStep };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT };
  }
}
```

with:

```js
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
    const parsed = JSON.parse(raw);
    const slots = emptySlots();
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (Array.isArray(parsed.slots?.[i])) {
        slots[i] = parsed.slots[i].map(c => ({
          id: c.id,
          name: c.name,
          sourceKind: c.sourceKind === 'npc' || c.sourceKind === 'pc' ? c.sourceKind : null,
          sourceId: typeof c.sourceId === 'string' ? c.sourceId : null,
        }));
      }
    }
    const currentStep = clampSlot(parsed.currentStep, SLOT_COUNT);
    return { slots, currentStep };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT };
  }
}
```

(Note: `getState()`'s existing `slots[i].map(c => ({ ...c }))` already shallow-copies whatever fields are on each combatant, so it needs no change — `sourceKind`/`sourceId` ride along automatically.)

- [ ] **Step 5: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v12';
```

to:

```js
const CACHE = 'cc-gm-v13';
```

- [ ] **Step 6: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli eval "import('/js/initiative-state.js').then(async m => { m.addCombatant('Test Manual', 3); m.addCombatant('Test Linked', 4, { kind: 'npc', id: 'abc123' }); const s = m.getState(); return JSON.stringify([s.slots[3][0], s.slots[4][0]]); })"
```

Expected: JSON showing the first combatant as `{"id":"...","name":"Test Manual","sourceKind":null,"sourceId":null}` and the second as `{"id":"...","name":"Test Linked","sourceKind":"npc","sourceId":"abc123"}`.

```bash
playwright-cli eval "import('/js/npc-storage.js').then(m => { const id = m.saveNpc({ kind: 'quick', data: { name: 'Getby Test' }, note: '' }); const found = m.getById(id); const missing = m.getById('nonexistent'); return JSON.stringify({ found, missing }); })"
```

Expected: `found` has `data.name === "Getby Test"`, `missing` is `null`.

```bash
playwright-cli eval "import('/js/pc-storage.js').then(m => { const id = m.savePc({ data: { name: 'PC Getby Test' }, note: '' }); const found = m.getById(id); const missing = m.getById('nonexistent'); return JSON.stringify({ found, missing }); })"
```

Expected: same shape, confirming `pc-storage.js`'s `getById` works identically.

```bash
playwright-cli eval "localStorage.clear()"
playwright-cli close
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add js/initiative-state.js js/npc-storage.js js/pc-storage.js sw.js
git commit -m "feat: link initiative combatants to their NPC/PC source entries"
```

---

## Task 2: Round counter

**Files:**
- Modify: `js/initiative-state.js`
- Modify: `js/initiative.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `round` field in `getState()`'s return value, starting at `1`. `nextStep()` increments it when it wraps from slot 1 back to slot 12; `prevStep()` decrements it (floored at 1) on the mirror wrap. `clearAll()` resets it to `1`.

- [ ] **Step 1: Add `round` to state shape and persistence**

In `js/initiative-state.js`, replace `load()` (as it stands after Task 1) — the two `return` statements and the `currentStep` line — find:

```js
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
```

replace with:

```js
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT, round: 1 };
```

find:

```js
    const currentStep = clampSlot(parsed.currentStep, SLOT_COUNT);
    return { slots, currentStep };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT };
  }
}
```

replace with:

```js
    const currentStep = clampSlot(parsed.currentStep, SLOT_COUNT);
    const round = Number.isInteger(parsed.round) && parsed.round >= 1 ? parsed.round : 1;
    return { slots, currentStep, round };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT, round: 1 };
  }
}
```

- [ ] **Step 2: Expose `round` from `getState()`**

Replace:

```js
export function getState() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) {
    slots[i] = state.slots[i].map(c => ({ ...c }));
  }
  return { slots, currentStep: state.currentStep };
}
```

with:

```js
export function getState() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) {
    slots[i] = state.slots[i].map(c => ({ ...c }));
  }
  return { slots, currentStep: state.currentStep, round: state.round };
}
```

- [ ] **Step 3: Increment/decrement `round` at the wrap boundary**

Replace `nextStep()`:

```js
export function nextStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    step = step === 1 ? SLOT_COUNT : step - 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}
```

with:

```js
export function nextStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (step === 1) state.round += 1;
    step = step === 1 ? SLOT_COUNT : step - 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}
```

Replace `prevStep()`:

```js
export function prevStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    step = step === SLOT_COUNT ? 1 : step + 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}
```

with:

```js
export function prevStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (step === SLOT_COUNT) state.round = Math.max(1, state.round - 1);
    step = step === SLOT_COUNT ? 1 : step + 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}
```

- [ ] **Step 4: Reset `round` in `clearAll()`**

Replace:

```js
export function clearAll() {
  state = { slots: emptySlots(), currentStep: SLOT_COUNT };
  notify();
}
```

with:

```js
export function clearAll() {
  state = { slots: emptySlots(), currentStep: SLOT_COUNT, round: 1 };
  notify();
}
```

- [ ] **Step 5: Display the round counter in `js/initiative.js`**

Replace the `init()` template's actions bar — find:

```js
    <div id="init-slots"></div>
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');
  let dragHighlightRow = null;

  function render() {
    const { slots, currentStep } = getState();
```

with:

```js
    <div id="init-slots"></div>
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <span id="init-round" class="init-round"></span>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  let dragHighlightRow = null;

  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
```

- [ ] **Step 6: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v13';
```

to:

```js
const CACHE = 'cc-gm-v14';
```

- [ ] **Step 7: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Initiative"
playwright-cli find "Round 1"
```

Expected: `Round 1` shown with no combatants yet (default state).

```bash
playwright-cli fill "#init-name" "Fighter A"
playwright-cli fill "#init-slot" "1"
playwright-cli click "text=Add"
playwright-cli fill "#init-name" "Fighter B"
playwright-cli fill "#init-slot" "12"
playwright-cli click "text=Add"
playwright-cli click "role=button[name='Next Step']"
playwright-cli find "Round 1"
playwright-cli click "role=button[name='Next Step']"
playwright-cli find "Round 2"
```

Expected: after the first Next Step (moving onto slot 1, no wrap yet since default `currentStep` is 12), round stays `1`; the second Next Step wraps from slot 1 to slot 12 and round becomes `2`.

```bash
playwright-cli click "role=button[name='Prev Step']"
playwright-cli find "Round 1"
playwright-cli click "role=button[name='Prev Step']"
playwright-cli find "Round 1"
```

Expected: first Prev Step undoes the wrap (12 -> 1 direction reversed) and round drops back to `1`; second Prev Step (moving from slot 12 to slot 1, no further wrap) leaves it at `1`, never going below `1`.

```bash
playwright-cli click "role=button[name='Clear All']"
playwright-cli find "Round 1"
playwright-cli close
kill %1
```

Expected: Clear All resets to `Round 1`.

- [ ] **Step 8: Commit**

```bash
git add js/initiative-state.js js/initiative.js sw.js
git commit -m "feat: add round counter to the initiative tracker"
```

---

## Task 3: Undo after Clear All

**Files:**
- Modify: `js/initiative-state.js`
- Modify: `js/initiative.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `undoClearAll()` exported from `js/initiative-state.js`, restoring the `{ slots, currentStep, round }` stashed immediately before the most recent `clearAll()` call. Single-use: a second call (with no intervening `clearAll()`) is a no-op. An "Undo" button in `js/initiative.js` appears only immediately after Clear All and disappears on any other state-changing action.

- [ ] **Step 1: Stash prior state before clearing, and add `undoClearAll()`**

In `js/initiative-state.js`, add a module-level stash variable next to `state` — find:

```js
let state = load();
const listeners = new Set();
```

replace with:

```js
let state = load();
let clearStash = null;
const listeners = new Set();
```

Replace `clearAll()`:

```js
export function clearAll() {
  state = { slots: emptySlots(), currentStep: SLOT_COUNT, round: 1 };
  notify();
}
```

with:

```js
export function clearAll() {
  clearStash = { slots: state.slots, currentStep: state.currentStep, round: state.round };
  state = { slots: emptySlots(), currentStep: SLOT_COUNT, round: 1 };
  notify();
}

export function undoClearAll() {
  if (!clearStash) return;
  state = clearStash;
  clearStash = null;
  notify();
}
```

(`clearStash` is a plain module-level variable, never written to `localStorage` — it does not appear in `save()`, `load()`, or anywhere `STORAGE_KEY` is used, so it is session-only by construction and resets to `null` on every page load.)

- [ ] **Step 2: Add the Undo button and session-only visibility tracking to `js/initiative.js`**

Replace the actions bar template (as it stands after Task 2) — find:

```js
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <span id="init-round" class="init-round"></span>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
```

with:

```js
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <span id="init-round" class="init-round"></span>
      <button id="init-clear" class="secondary">Clear All</button>
      <button id="init-undo" class="secondary hidden">Undo</button>
    </div>
```

Update the import line at the top of the file — find:

```js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, subscribe } from './initiative-state.js';
```

replace with:

```js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, undoClearAll, subscribe } from './initiative-state.js';
```

Add a `showUndo` flag and cache the undo button, next to `roundEl` — find:

```js
  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  let dragHighlightRow = null;
```

replace with:

```js
  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  const undoBtn = container.querySelector('#init-undo');
  let dragHighlightRow = null;
  let showUndo = false;
```

Update `render()` to reflect `showUndo` — find:

```js
  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
```

replace with:

```js
  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
    undoBtn.classList.toggle('hidden', !showUndo);
```

Set `showUndo = false` at the top of every other state-changing handler. Find the form submit handler:

```js
  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const slot = parseInt(container.querySelector('#init-slot').value, 10);
    if (!name || isNaN(slot) || slot < 1 || slot > 12) return;
    addCombatant(name, slot);
    e.target.reset();
  });
```

replace with:

```js
  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const slot = parseInt(container.querySelector('#init-slot').value, 10);
    if (!name || isNaN(slot) || slot < 1 || slot > 12) return;
    showUndo = false;
    addCombatant(name, slot);
    e.target.reset();
  });
```

Find the remove-chip click handler:

```js
  slotsEl.addEventListener('click', e => {
    const removeBtn = e.target.closest('.init-remove');
    if (!removeBtn) return;
    const chip = removeBtn.closest('.init-chip');
    removeCombatant(chip.dataset.id);
  });
```

replace with:

```js
  slotsEl.addEventListener('click', e => {
    const removeBtn = e.target.closest('.init-remove');
    if (!removeBtn) return;
    const chip = removeBtn.closest('.init-chip');
    showUndo = false;
    removeCombatant(chip.dataset.id);
  });
```

Find the move-input change handler:

```js
  slotsEl.addEventListener('change', e => {
    const moveInput = e.target.closest('.init-move');
    if (!moveInput) return;
    const newSlot = parseInt(moveInput.value, 10);
    if (isNaN(newSlot) || newSlot < 1 || newSlot > 12) return;
    const chip = moveInput.closest('.init-chip');
    moveCombatant(chip.dataset.id, newSlot);
  });
```

replace with:

```js
  slotsEl.addEventListener('change', e => {
    const moveInput = e.target.closest('.init-move');
    if (!moveInput) return;
    const newSlot = parseInt(moveInput.value, 10);
    if (isNaN(newSlot) || newSlot < 1 || newSlot > 12) return;
    const chip = moveInput.closest('.init-chip');
    showUndo = false;
    moveCombatant(chip.dataset.id, newSlot);
  });
```

Find the drag-drop commit inside `onUp`:

```js
      if (row) {
        const newSlot = parseInt(row.dataset.slot, 10);
        moveCombatant(chipId, newSlot);
```

replace with:

```js
      if (row) {
        const newSlot = parseInt(row.dataset.slot, 10);
        showUndo = false;
        moveCombatant(chipId, newSlot);
```

Find the Next/Prev/Clear button wiring:

```js
  container.querySelector('#init-next').addEventListener('click', () => nextStep());
  container.querySelector('#init-prev').addEventListener('click', () => prevStep());
  container.querySelector('#init-clear').addEventListener('click', () => clearAll());
```

replace with:

```js
  container.querySelector('#init-next').addEventListener('click', () => { showUndo = false; nextStep(); });
  container.querySelector('#init-prev').addEventListener('click', () => { showUndo = false; prevStep(); });
  container.querySelector('#init-clear').addEventListener('click', () => { showUndo = true; clearAll(); });
  container.querySelector('#init-undo').addEventListener('click', () => { showUndo = false; undoClearAll(); });
```

(`showUndo = true` is set *before* `clearAll()` runs so the `notify()` -> `render()` triggered synchronously inside `clearAll()` already sees the flag flipped.)

- [ ] **Step 3: No new CSS needed** — `#init-undo` reuses the existing `.secondary` button class and the existing `.hidden` utility class (`display: none !important`), both already defined in `css/style.css`.

- [ ] **Step 4: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v14';
```

to:

```js
const CACHE = 'cc-gm-v15';
```

- [ ] **Step 5: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Initiative"
playwright-cli fill "#init-name" "Rogue"
playwright-cli fill "#init-slot" "7"
playwright-cli click "text=Add"
playwright-cli find "role=button[name='Undo']"
```

Expected: not found (button hidden) — no clear has happened yet.

```bash
playwright-cli click "role=button[name='Clear All']"
playwright-cli eval "document.querySelector('#init-undo').classList.contains('hidden')"
```

Expected: `false` — Undo button now visible.

```bash
playwright-cli eval "document.querySelectorAll('.init-chip').length"
```

Expected: `0` — Rogue was cleared.

```bash
playwright-cli click "role=button[name='Undo']"
playwright-cli eval "document.querySelectorAll('.init-chip').length"
playwright-cli find "Rogue"
playwright-cli eval "document.querySelector('#init-undo').classList.contains('hidden')"
```

Expected: `1` chip restored, "Rogue" found, Undo button hidden again after the single use.

```bash
playwright-cli click "role=button[name='Clear All']"
playwright-cli click "role=button[name='Next Step']"
playwright-cli eval "document.querySelector('#init-undo').classList.contains('hidden')"
```

Expected: `true` — a state-changing action (Next Step, a no-op here since there are no combatants but the handler still runs and clears the flag) after a clear hides Undo even without clicking it.

```bash
playwright-cli close
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add js/initiative-state.js js/initiative.js sw.js
git commit -m "feat: add single-use undo after Clear All in the initiative tracker"
```

---

## Task 4: Auto-save-first when adding an unsaved NPC/PC to initiative

**Files:**
- Modify: `js/character-card.js`
- Modify: `js/npc-gen.js`
- Modify: `js/pc-gen.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `addCombatant(name, slot, source)` from Task 1.
- Produces: `appendSaveControls(...)`'s returned object grows to `{ getSavedId, ensureSaved }`, where `ensureSaved()` returns the current saved id, saving first (via the same path the Save button uses) if not yet saved. `appendInitiativeBtn(card, getName, getSuggestedSlot, sourceKind, ensureSaved)` — two new trailing parameters; on Confirm it calls `ensureSaved()` to get a guaranteed id, then passes `{ kind: sourceKind, id }` as `addCombatant`'s third argument.

- [ ] **Step 1: Add `ensureSaved()` to `appendSaveControls`**

In `js/character-card.js`, replace `appendSaveControls` in full:

```js
export function appendSaveControls(card, data, savedEntry, storage) {
  const wrap = document.createElement('div');
  wrap.className = 'save-controls-wrap';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.className = 'field-label';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.className = 'textarea-full';
  textarea.value = savedEntry ? savedEntry.note : '';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary mt-0-5';

  let savedId = savedEntry ? savedEntry.id : null;
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      storage.update(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      storage.update(savedId, { data, note: textarea.value });
    } else {
      savedId = storage.save(data, textarea.value);
      saveBtn.textContent = 'Saved ✓';
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return { getSavedId: () => savedId };
}
```

with:

```js
export function appendSaveControls(card, data, savedEntry, storage) {
  const wrap = document.createElement('div');
  wrap.className = 'save-controls-wrap';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.className = 'field-label';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.className = 'textarea-full';
  textarea.value = savedEntry ? savedEntry.note : '';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary mt-0-5';

  let savedId = savedEntry ? savedEntry.id : null;
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  function doSave() {
    savedId = storage.save(data, textarea.value);
    saveBtn.textContent = 'Saved ✓';
    return savedId;
  }

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      storage.update(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      storage.update(savedId, { data, note: textarea.value });
    } else {
      doSave();
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return {
    getSavedId: () => savedId,
    ensureSaved: () => (savedId ? savedId : doSave()),
  };
}
```

- [ ] **Step 2: Grow `appendInitiativeBtn`'s signature**

Replace `appendInitiativeBtn` in full:

```js
export function appendInitiativeBtn(card, getName, getSuggestedSlot) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-actions';

  const btn = document.createElement('button');
  btn.textContent = 'Add to Initiative';
  btn.className = 'secondary mt-0-5';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.className = 'input-narrow hidden';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'hidden mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', () => {
    const suggestedSlot = typeof getSuggestedSlot === 'function' ? getSuggestedSlot() : getSuggestedSlot;
    if (suggestedSlot != null) input.value = String(suggestedSlot);
    btn.classList.add('hidden');
    input.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    input.focus();
  });

  confirmBtn.addEventListener('click', () => {
    const slot = parseInt(input.value, 10);
    if (isNaN(slot) || slot < 1 || slot > 12) {
      status.textContent = 'Enter a slot 1-12';
      return;
    }
    addCombatant(getName(), slot);
    input.classList.add('hidden');
    confirmBtn.classList.add('hidden');
    status.textContent = `Added to Initiative slot ${slot}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}
```

with:

```js
export function appendInitiativeBtn(card, getName, getSuggestedSlot, sourceKind, ensureSaved) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-actions';

  const btn = document.createElement('button');
  btn.textContent = 'Add to Initiative';
  btn.className = 'secondary mt-0-5';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.className = 'input-narrow hidden';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'hidden mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', () => {
    const suggestedSlot = typeof getSuggestedSlot === 'function' ? getSuggestedSlot() : getSuggestedSlot;
    if (suggestedSlot != null) input.value = String(suggestedSlot);
    btn.classList.add('hidden');
    input.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    input.focus();
  });

  confirmBtn.addEventListener('click', () => {
    const slot = parseInt(input.value, 10);
    if (isNaN(slot) || slot < 1 || slot > 12) {
      status.textContent = 'Enter a slot 1-12';
      return;
    }
    const id = typeof ensureSaved === 'function' ? ensureSaved() : null;
    const source = sourceKind && id ? { kind: sourceKind, id } : null;
    addCombatant(getName(), slot, source);
    input.classList.add('hidden');
    confirmBtn.classList.add('hidden');
    status.textContent = `Added to Initiative slot ${slot}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}
```

- [ ] **Step 3: Update `renderQuickCard`'s call sites in `js/npc-gen.js`**

Find:

```js
  appendCopyBtn(card, () => `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, () => npc.name, null);
  const npcStorage = { save: (data, note) => saveNpc({ kind: 'quick', data, note }), update: (id, patch) => updateNpc(id, patch) };
  appendSaveControls(card, npc, savedEntry, npcStorage);
  return card;
}
```

replace with:

```js
  appendCopyBtn(card, () => `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  const npcStorage = { save: (data, note) => saveNpc({ kind: 'quick', data, note }), update: (id, patch) => updateNpc(id, patch) };
  const quickSaveControls = appendSaveControls(card, npc, savedEntry, npcStorage);
  appendInitiativeBtn(card, () => npc.name, null, 'npc', quickSaveControls.ensureSaved);
  return card;
}
```

- [ ] **Step 4: Update `renderFullCard`'s call sites in `js/npc-gen.js`**

Find:

```js
  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)));
  const npcStorage = { save: (data, note) => saveNpc({ kind: 'full', data, note }), update: (id, patch) => updateNpc(id, patch) };
  saveControls = appendSaveControls(card, npc, savedEntry, npcStorage);
  return card;
}
```

replace with:

```js
  appendCopyBtn(card, () => npcToText(npc));
  const npcStorage = { save: (data, note) => saveNpc({ kind: 'full', data, note }), update: (id, patch) => updateNpc(id, patch) };
  saveControls = appendSaveControls(card, npc, savedEntry, npcStorage);
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)), 'npc', saveControls.ensureSaved);
  return card;
}
```

- [ ] **Step 5: Update `renderPcCard`'s call sites in `js/pc-gen.js`**

Find:

```js
  appendCopyBtn(card, () => pcToText(pc));
  appendInitiativeBtn(card, () => pc.name || '(unnamed)', () => Math.min(12, Math.max(1, pc.derived.Initiative)));
  const pcStorage = { save: (data, note) => savePc({ data, note }), update: (id, patch) => updatePc(id, patch) };
  saveControls = appendSaveControls(card, pc, savedEntry, pcStorage);
  return card;
}
```

replace with:

```js
  appendCopyBtn(card, () => pcToText(pc));
  const pcStorage = { save: (data, note) => savePc({ data, note }), update: (id, patch) => updatePc(id, patch) };
  saveControls = appendSaveControls(card, pc, savedEntry, pcStorage);
  appendInitiativeBtn(card, () => pc.name || '(unnamed)', () => Math.min(12, Math.max(1, pc.derived.Initiative)), 'pc', saveControls.ensureSaved);
  return card;
}
```

- [ ] **Step 6: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v15';
```

to:

```js
const CACHE = 'cc-gm-v16';
```

- [ ] **Step 7: Verify in browser — unsaved Quick NPC auto-saves on Add to Initiative**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=NPCs"
playwright-cli click "text=Quick NPC"
playwright-cli find "role=button[name='Save']"
```

Expected: Save button shows "Save" (not "Saved") — card not yet saved.

```bash
playwright-cli click "role=button[name='Add to Initiative']"
playwright-cli fill "css=.inline-actions input.input-narrow" "5"
playwright-cli click "role=button[name='Confirm']"
playwright-cli find "Added to Initiative slot 5"
playwright-cli find "role=button[name='Saved ✓']"
```

Expected: initiative confirmation text found, and the card's own Save button now reads "Saved" — confirms the auto-save-first path ran.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); return JSON.stringify(s.slots[5][0]); })"
```

Expected: JSON with `sourceKind: "npc"` and a non-null `sourceId`.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli close
kill %1
```

- [ ] **Step 8: Verify in browser — unsaved PC auto-saves on Add to Initiative**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=PCs"
playwright-cli click "role=button[name='New PC']"
playwright-cli fill "css=#pc-name-section input" "Auto Save PC"
playwright-cli press "Tab"
```

Note: the PC card starts in edit mode with a "Save" mode-toggle button (per the PC tab plan) — "Add to Initiative" is appended regardless of mode, so it is present here too.

```bash
playwright-cli click "role=button[name='Add to Initiative']"
playwright-cli fill "css=.inline-actions input.input-narrow" "6"
playwright-cli click "role=button[name='Confirm']"
playwright-cli find "Added to Initiative slot 6"
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); return JSON.stringify(s.slots[6][0]); })"
```

Expected: JSON with `sourceKind: "pc"` and a non-null `sourceId`; `import('/js/pc-storage.js').then(m => m.getAll())` (run as a follow-up eval, see below) shows the auto-saved PC.

```bash
playwright-cli eval "import('/js/pc-storage.js').then(m => JSON.stringify(m.getAll().map(p => p.data.name)))"
```

Expected: includes `"Auto Save PC"`.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli close
kill %1
```

- [ ] **Step 9: Commit**

```bash
git add js/character-card.js js/npc-gen.js js/pc-gen.js sw.js
git commit -m "feat: auto-save unsaved NPC/PC cards when added to initiative"
```

---

## Task 5: NPC/PC color coding on chips

**Files:**
- Modify: `js/initiative.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `sourceKind` on combatants (Task 1), real NPC/PC-linked combatants producible via Task 4's Add-to-Initiative flow.
- Produces: `.init-chip` elements carry one of `source-npc` / `source-pc` / `source-none` based on the combatant's `sourceKind`.

- [ ] **Step 1: Add a `source-*` class to each chip**

In `js/initiative.js`, replace the chip-building line inside `render()`:

```js
      const chips = combatants.map(c => `
        <span class="init-chip" data-id="${c.id}">
          <span class="init-drag-handle">⠿</span>
          <span>${c.name}</span>
          <input type="number" class="init-move init-move-input" min="1" max="12" placeholder="→">
          <button type="button" class="init-remove secondary">×</button>
        </span>
      `).join('');
```

with:

```js
      const chips = combatants.map(c => {
        const sourceClass = c.sourceKind === 'npc' ? 'source-npc' : c.sourceKind === 'pc' ? 'source-pc' : 'source-none';
        return `
        <span class="init-chip ${sourceClass}" data-id="${c.id}">
          <span class="init-drag-handle">⠿</span>
          <span>${c.name}</span>
          <input type="number" class="init-move init-move-input" min="1" max="12" placeholder="→">
          <button type="button" class="init-remove secondary">×</button>
        </span>
      `;
      }).join('');
```

- [ ] **Step 2: Add the color-coding CSS**

In `css/style.css`, add immediately after `.init-remove { padding: 0.1rem 0.4rem; }` (line 313):

```css
.init-chip.source-npc { border-color: var(--accent-copper); }
.init-chip.source-pc { border-color: var(--accent-purple); }
.init-chip.source-none { border-color: var(--muted); }
```

- [ ] **Step 3: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v16';
```

to:

```js
const CACHE = 'cc-gm-v17';
```

- [ ] **Step 4: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Initiative"
playwright-cli fill "#init-name" "Manual Guy"
playwright-cli fill "#init-slot" "2"
playwright-cli click "text=Add"
playwright-cli eval "document.querySelector('.init-chip').classList.contains('source-none')"
```

Expected: `true` — a manually-typed combatant gets `source-none`.

```bash
playwright-cli click "text=NPCs"
playwright-cli click "text=Quick NPC"
playwright-cli click "role=button[name='Add to Initiative']"
playwright-cli fill "css=.inline-actions input.input-narrow" "3"
playwright-cli click "role=button[name='Confirm']"
playwright-cli click "text=PCs"
playwright-cli click "role=button[name='New PC']"
playwright-cli fill "css=#pc-name-section input" "Color Coded PC"
playwright-cli press "Tab"
playwright-cli click "role=button[name='Add to Initiative']"
playwright-cli fill "css=.inline-actions input.input-narrow" "4"
playwright-cli click "role=button[name='Confirm']"
playwright-cli click "text=Initiative"
playwright-cli eval "document.querySelector('.init-slot-row[data-slot=\"3\"] .init-chip').classList.contains('source-npc')"
playwright-cli eval "document.querySelector('.init-slot-row[data-slot=\"4\"] .init-chip').classList.contains('source-pc')"
```

Expected: both `true`.

```bash
playwright-cli eval "getComputedStyle(document.querySelector('.init-slot-row[data-slot=\"3\"] .init-chip')).borderColor"
playwright-cli eval "getComputedStyle(document.querySelector('.init-slot-row[data-slot=\"4\"] .init-chip')).borderColor"
```

Expected: two different `rgb(...)` values (copper vs. purple).

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli close
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add js/initiative.js css/style.css sw.js
git commit -m "feat: color-code initiative chips by NPC/PC/manual source"
```

---

## Task 6: Current-character quick-lookup card

**Files:**
- Modify: `js/initiative.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `getById` from `js/npc-storage.js`/`js/pc-storage.js` (Task 1), `esc` from `js/character-card.js`, `data/skills.json` (fetched directly, mirroring the pattern in `js/npc-gen.js`'s `loadJson`).
- Produces: a `#init-current-wrap` panel above the slot grid, rebuilt on every `render()`, showing one mini-card per combatant in `slots[currentStep]`.

- [ ] **Step 1: Import what the quick-lookup card needs**

In `js/initiative.js`, replace the top-of-file import line:

```js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, undoClearAll, subscribe } from './initiative-state.js';
```

with:

```js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, undoClearAll, subscribe } from './initiative-state.js';
import { esc } from './character-card.js';
import { getById as getNpcById, updateNpc } from './npc-storage.js';
import { getById as getPcById, updatePc } from './pc-storage.js';

async function loadSkillDefs() {
  const res = await fetch('data/skills.json');
  if (!res.ok) throw new Error('Failed to load skills.json');
  return res.json();
}

function rankedSkillList(data, skillDefsByName) {
  const entries = [];
  for (const [name, acquired] of Object.entries(data.skills || {})) {
    const def = skillDefsByName.get(name);
    if (!def) continue;
    const vals = def.diceCheck.map(s => data.stats[s] || 0);
    const higher = Math.max(...vals);
    if ((acquired.general || 0) >= 1) {
      entries.push({ name, total: higher + acquired.general });
    }
    if (acquired.specialized) {
      entries.push({ name: `${acquired.specialized.name} (${name})`, total: higher + acquired.specialized.rank });
    }
  }
  entries.sort((a, b) => b.total - a.total);
  return entries;
}

function buildCombatantMiniCard(combatant, skillDefsByName) {
  const wrap = document.createElement('div');
  wrap.className = 'card init-mini-card';

  const nameEl = document.createElement('p');
  nameEl.className = 'input-name mb-0-5';
  nameEl.textContent = combatant.name;
  wrap.appendChild(nameEl);

  if (!combatant.sourceKind || !combatant.sourceId) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'No linked character data';
    wrap.appendChild(note);
    return wrap;
  }

  const getEntry = combatant.sourceKind === 'npc' ? getNpcById : getPcById;
  const updateEntry = combatant.sourceKind === 'npc' ? updateNpc : updatePc;
  const entry = getEntry(combatant.sourceId);
  if (!entry) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'Source not found';
    wrap.appendChild(note);
    return wrap;
  }

  const data = entry.data;
  if (!data.stats || !data.derived || !data.current) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'No stat block available for this character';
    wrap.appendChild(note);
    return wrap;
  }

  const statRow = document.createElement('div');
  statRow.className = 'row-flex-wrap mb-0-5';
  for (const key of ['Body', 'Mind', 'Soul']) {
    const field = document.createElement('span');
    field.className = 'init-mini-stat';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'stat-cell-label';
    labelSpan.textContent = key;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'stat-input init-mini-stat-input';
    input.value = data.current[key];
    const max = document.createElement('span');
    max.className = 'text-muted-sm';
    max.textContent = ` / ${data.derived[key]}`;
    input.addEventListener('change', () => {
      const clamped = Math.min(data.derived[key], Math.max(0, Math.round(Number(input.value)) || 0));
      input.value = clamped;
      data.current[key] = clamped;
      updateEntry(combatant.sourceId, { data });
    });
    field.appendChild(labelSpan);
    field.appendChild(document.createElement('br'));
    field.appendChild(input);
    field.appendChild(max);
    statRow.appendChild(field);
  }
  wrap.appendChild(statRow);

  const skillsList = document.createElement('ul');
  skillsList.className = 'init-mini-skills';
  const ranked = rankedSkillList(data, skillDefsByName);
  if (ranked.length === 0) {
    const li = document.createElement('li');
    li.className = 'text-muted-sm';
    li.textContent = 'No ranked skills';
    skillsList.appendChild(li);
  } else {
    for (const { name, total } of ranked) {
      const li = document.createElement('li');
      li.textContent = `${name}: ${total}`;
      skillsList.appendChild(li);
    }
  }
  wrap.appendChild(skillsList);

  const abilityEl = document.createElement('p');
  abilityEl.className = 'mt-0-5';
  const abilityName = data.ability?.name || 'None';
  const abilityDesc = data.ability?.description;
  abilityEl.innerHTML = `<strong>${esc(abilityName)}</strong>${abilityDesc ? ` — ${esc(abilityDesc)}` : ''}`;
  wrap.appendChild(abilityEl);

  return wrap;
}
```

- [ ] **Step 2: Add the panel to the tab template and load `skills.json` in `init()`**

Replace the top of the `init()` template:

```js
export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Initiative Tracker</h2>
    <form id="init-form" class="init-form">
      <input id="init-name" type="text" placeholder="Name" required class="init-name-input">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required class="init-slot-input">
      <button type="submit">Add</button>
    </form>
    <div id="init-slots"></div>
```

with:

```js
export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Initiative Tracker</h2>
    <form id="init-form" class="init-form">
      <input id="init-name" type="text" placeholder="Name" required class="init-name-input">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required class="init-slot-input">
      <button type="submit">Add</button>
    </form>
    <div id="init-current-wrap" class="init-current-wrap"></div>
    <div id="init-slots"></div>
```

Right after `const slotsEl = ...` / `const roundEl = ...` / `const undoBtn = ...` cache lines, add the current-panel element and a `skillDefsByName` load — find:

```js
  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  const undoBtn = container.querySelector('#init-undo');
  let dragHighlightRow = null;
  let showUndo = false;
```

replace with:

```js
  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  const undoBtn = container.querySelector('#init-undo');
  const currentWrapEl = container.querySelector('#init-current-wrap');
  let dragHighlightRow = null;
  let showUndo = false;

  let skillDefsByName = new Map();
  try {
    const skillDefs = await loadSkillDefs();
    skillDefsByName = new Map(skillDefs.map(s => [s.name, s]));
  } catch {
    // Quick-lookup skill totals degrade to "No ranked skills" if skills.json
    // can't be fetched; the rest of the tracker (slots, drag/drop, round,
    // undo) doesn't depend on this data and stays fully functional.
  }
```

- [ ] **Step 3: Render the panel from `render()`**

Replace:

```js
  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
    undoBtn.classList.toggle('hidden', !showUndo);
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
```

with:

```js
  function renderCurrentCard(combatants) {
    currentWrapEl.innerHTML = '';
    if (!combatants || combatants.length === 0) return;
    const heading = document.createElement('h3');
    heading.className = 'h3-section';
    heading.textContent = 'Current';
    currentWrapEl.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'init-current-grid';
    for (const c of combatants) {
      grid.appendChild(buildCombatantMiniCard(c, skillDefsByName));
    }
    currentWrapEl.appendChild(grid);
  }

  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
    undoBtn.classList.toggle('hidden', !showUndo);
    renderCurrentCard(slots[currentStep]);
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
```

- [ ] **Step 4: Add the quick-lookup CSS**

In `css/style.css`, add immediately after the `.init-chip.source-none { border-color: var(--muted); }` rule added in Task 5:

```css
.init-current-wrap { margin-bottom: 1rem; }
.init-current-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.init-mini-card { flex: 1 1 16rem; max-width: 22rem; }
.init-mini-stat { display: inline-block; margin-right: 0.75rem; text-align: center; }
.init-mini-stat-input { width: 3.5rem; }
.init-mini-skills { list-style: none; padding: 0; margin: 0.5rem 0; font-size: 0.85rem; }
.init-mini-skills li { padding: 0.1rem 0; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 5: Bump the service worker cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v17';
```

to:

```js
const CACHE = 'cc-gm-v18';
```

- [ ] **Step 6: Verify in browser — manual combatant shows "No linked character data"**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Initiative"
playwright-cli fill "#init-name" "Solo Manual"
playwright-cli fill "#init-slot" "9"
playwright-cli click "text=Add"
playwright-cli eval "import('/js/initiative-state.js').then(m => { m.moveCombatant(document.querySelector('.init-chip').dataset.id, 9); })"
playwright-cli click "role=button[name='Next Step']"
playwright-cli find "No linked character data"
playwright-cli close
kill %1
```

Expected: quick-lookup panel shows "Solo Manual" with "No linked character data" once the tracker steps onto slot 9.

- [ ] **Step 7: Verify in browser — linked NPC shows live stats and writes back**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=NPCs"
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Add to Initiative']"
playwright-cli fill "css=.inline-actions input.input-narrow" "1"
playwright-cli click "role=button[name='Confirm']"
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); return s.currentStep; })"
```

Note: default `currentStep` is `12`; the Full NPC card's suggested slot may or may not be `1` — use whatever `currentStep` reports, or force it directly:

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); const slot = Object.keys(s.slots).find(k => s.slots[k].length > 0); m.moveCombatant(s.slots[slot][0].id, Number(s.currentStep)); })"
playwright-cli click "text=Initiative"
playwright-cli find "role=heading[name='Current']"
playwright-cli eval "document.querySelector('.init-mini-card input.init-mini-stat-input') !== null"
```

Expected: `Current` heading found, at least one live stat input present in the mini-card.

```bash
playwright-cli eval "document.querySelector('.init-mini-card input.init-mini-stat-input').value"
playwright-cli fill "css=.init-mini-card input.init-mini-stat-input >> nth=0" "1"
playwright-cli press "Tab"
playwright-cli click "text=NPCs"
playwright-cli click "text=Full NPC"
playwright-cli eval "document.querySelector('.stat-table td:nth-child(6) input.stat-input')?.value ?? document.querySelector('.stat-table .stat-cell-value')?.textContent"
```

Expected: after editing the mini-card's first Current stat input to `1` and tabbing away, reopening the same NPC's Full card (either via the still-open card or the saved list) reflects the updated Current value — confirms the write-back reaches the same `npc-storage.js` entry.

```bash
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli close
kill %1
```

- [ ] **Step 8: Verify in browser — multiple combatants in one slot each get a mini-card**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Initiative"
playwright-cli fill "#init-name" "Tie A"
playwright-cli fill "#init-slot" "5"
playwright-cli click "text=Add"
playwright-cli fill "#init-name" "Tie B"
playwright-cli fill "#init-slot" "5"
playwright-cli click "text=Add"
playwright-cli eval "import('/js/initiative-state.js').then(m => { const s = m.getState(); m.moveCombatant(s.slots[5][0].id, 5); })"
playwright-cli click "role=button[name='Next Step']"
playwright-cli eval "document.querySelectorAll('.init-mini-card').length"
```

Expected: `2` — both tied combatants in slot 5 each get their own mini-card, none hidden.

```bash
playwright-cli find "Tie A"
playwright-cli find "Tie B"
playwright-cli eval "import('/js/initiative-state.js').then(m => m.clearAll())"
playwright-cli close
kill %1
```

- [ ] **Step 9: Commit**

```bash
git add js/initiative.js css/style.css sw.js
git commit -m "feat: add current-character quick-lookup card to the initiative tracker"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Data linkage (`sourceKind`/`sourceId`, `addCombatant`'s third param, `getById` on both storage modules) — Task 1. Auto-save-first on unsaved Add to Initiative (`ensureSaved()`, grown `appendInitiativeBtn` signature, all three card call sites) — Task 4. Deleted-source handling ("Source not found" vs. "No linked character data") — Task 6 Step 1 (`buildCombatantMiniCard`'s two distinct fallback branches). Quick-lookup card (name, live Body/Mind/Soul with write-back, ranked skills, ability) — Task 6. Round counter (increment/decrement at the wrap boundary, `clearAll()` reset, display) — Task 2. Undo after Clear All (session-only stash, single-use, button visibility) — Task 3. NPC/PC color coding (`--accent-copper`/`--accent-purple`/`--muted`, no new colors) — Task 5.
- **Judgment calls made, not fully spelled out in the spec or either prerequisite plan:**
  1. **Quick NPCs (no stat block) as a linked source.** The spec's "Data Linkage" section only distinguishes "no source link" from "source doesn't resolve at all" — it doesn't address a source that resolves but lacks `stats`/`derived`/`current` (true of the app's existing "Quick NPC" sketch, which has no mechanical stat block at all, unlike "Full NPC"). Task 6 Step 1 adds a third fallback branch — "No stat block available for this character" — rather than crashing or silently rendering `undefined`. This is a defensive addition beyond the spec's literal two cases.
  2. **Call-site reordering for `appendSaveControls`/`appendInitiativeBtn`.** The PC tab plan's baseline calls `appendInitiativeBtn` *before* `appendSaveControls` in all three card renderers. Since `ensureSaved` only exists on `appendSaveControls`'s return value, Task 4 reorders all three call sites (save controls first, then the initiative button) — a change not mentioned in either prerequisite plan or the spec itself, but structurally required by the dependency the spec describes.
  3. **`showUndo` visibility tracked in `js/initiative.js`, not `initiative-state.js`.** The spec says the Undo button "disappears on the next state-changing action or page reload," but leaves whether that's UI-only or affects `undoClearAll()`'s own availability unspecified. This plan keeps `clearStash` valid in the state layer until actually consumed or overwritten by a new `clearAll()` (matching "single-use... second undo click after that does nothing... stash also cleared if `clearAll()` is called again"), and tracks the *button's visibility* separately as a UI-only flag in `js/initiative.js`, reset on every other handler. This satisfies the spec's UI behavior without over-constraining the state module.
  4. **No new `getById`-style accessor already existed.** Verified directly against the real, current `js/npc-storage.js` on disk (only `getAll` exists) and against both prerequisite plans' full text (PC tab plan's `js/pc-storage.js` Task 3 Step 1 has no `getById`) — no conflict or duplicate-task risk.
- **Placeholder scan:** every step has literal, complete code or a literal, runnable `playwright-cli`/`git`/`bash` command; no "TODO", "similar to Task N", or unstated logic.
- **Type/signature consistency:** `addCombatant(name, slot, source)` used identically in Task 1 (state layer) and Task 4 (`appendInitiativeBtn`'s confirm handler). `appendSaveControls(card, data, savedEntry, storage)` and its `{ getSavedId, ensureSaved }` return shape, and `appendInitiativeBtn(card, getName, getSuggestedSlot, sourceKind, ensureSaved)`, are each defined once (Task 4) and then consumed identically at all three call sites (Task 4 Steps 3-5). `getById(id)` has the same signature and deep-copy return shape in both `npc-storage.js` and `pc-storage.js` (Task 1).
- **Pre-existing unescaped chip name left alone deliberately:** `js/initiative.js`'s existing `<span>${c.name}</span>` in the chip template (present before this plan) is not escaped via `esc()`. Fixing it is out of scope for this plan (matches the PC tab plan's own precedent of not drive-by-fixing pre-existing issues in touched files) — flagged here rather than silently left inconsistent with the Global Constraints' `esc()` rule, since Task 6 does correctly `esc()` all *new* dynamic `innerHTML` (the ability name/description line).

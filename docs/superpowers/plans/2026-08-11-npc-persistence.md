# NPC Persistence, Active-Tab Highlight, Notes, Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the NPC tab's Quick/Full button highlight, and let users save Quick/Full NPCs to `localStorage` with editable notes, view/remove them (with undo-until-refresh), and export/import the saved library as JSON.

**Architecture:** A new state module `js/npc-storage.js` (mirroring the existing pattern in `js/initiative-state.js`) owns all persistence: in-memory state hydrated from `localStorage` at load, mutated via exported functions, persisted on every change, with a pub/sub `subscribe()` for UI updates. `js/npc-gen.js` is extended to wire card-level Save/Notes controls and a new Saved NPCs list section into that module. No other files change except `sw.js` (cache manifest) and `docs/superpowers/specs/2026-08-11-npc-persistence-design.md` (already committed, no changes needed).

**Tech Stack:** Vanilla JS (ES modules), `localStorage`, no build step, no test framework.

## Global Constraints

- No JS unit tests in this project — every verification step is a manual browser check via `python3 -m http.server`, not an automated test.
- Follow the existing state-module pattern from `js/initiative-state.js` (load/save/notify/subscribe) — don't introduce a different persistence style.
- Quick/Full toggle: exactly one of `#btn-quick`/`#btn-full` has the `secondary` CSS class at a time (the other is filled/active) — no new CSS.
- Saved NPCs list shows **name only** per entry — no type badge, no date.
- Delete is immediate (no confirm dialog) with an inline "Deleted — Undo" row; actual purge from storage only happens on next page load.
- Notes are editable at any time, on any rendered card (freshly generated or loaded from the saved list).
- Export produces one JSON file for the whole library; import merges and skips exact `kind`+`data`+`note` duplicates.

---

### Task 1: Create `js/npc-storage.js` — core persistence module

**Files:**
- Create: `js/npc-storage.js`

**Interfaces:**
- Produces: `getAll(): Array<{id, kind, data, note, savedAt, deleted}>`, `saveNpc({kind, data, note}): id`, `updateNpc(id, {data, note}): void`, `removeNpc(id): void`, `undoRemove(id): void`, `exportAll(): string`, `importMerge(jsonString): number` (count of entries added), `subscribe(fn): unsubscribeFn`.

- [ ] **Step 1: Create the module**

Write `js/npc-storage.js`:

```js
// js/npc-storage.js
const STORAGE_KEY = 'cc-npc-library';

// Drops soft-deleted entries permanently — this is the only purge point,
// so deleted entries stay recoverable (via undoRemove) for the rest of
// the session and only disappear for good on the next page load.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { npcs: [] };
    const parsed = JSON.parse(raw);
    const npcs = Array.isArray(parsed.npcs) ? parsed.npcs.filter(n => n && !n.deleted) : [];
    return { npcs };
  } catch {
    return { npcs: [] };
  }
}

let state = load();
const listeners = new Set();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notify() {
  save();
  listeners.forEach(fn => fn());
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAll() {
  return state.npcs.map(n => ({ ...n }));
}

export function saveNpc({ kind, data, note }) {
  const id = generateId();
  state.npcs.push({ id, kind, data, note: note || '', savedAt: Date.now(), deleted: false });
  notify();
  return id;
}

export function updateNpc(id, { data, note } = {}) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = data;
  if (note !== undefined) entry.note = note;
  notify();
}

export function removeNpc(id) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  entry.deleted = true;
  notify();
}

export function undoRemove(id) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  entry.deleted = false;
  notify();
}

export function exportAll() {
  return JSON.stringify(state.npcs.filter(n => !n.deleted), null, 2);
}

export function importMerge(jsonString) {
  let imported;
  try {
    imported = JSON.parse(jsonString);
  } catch {
    return 0;
  }
  if (!Array.isArray(imported)) return 0;

  let added = 0;
  for (const item of imported) {
    if (!item || typeof item !== 'object') continue;
    const { kind, data } = item;
    const note = item.note || '';
    if (kind !== 'quick' && kind !== 'full') continue;
    const isDuplicate = state.npcs.some(n =>
      !n.deleted &&
      n.kind === kind &&
      n.note === note &&
      JSON.stringify(n.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.npcs.push({ id: generateId(), kind, data, note, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

- [ ] **Step 2: Manually verify in browser console**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765` in a browser, open DevTools console, and run:

```js
const m = await import('./js/npc-storage.js');
m.getAll()                                              // []
const id = m.saveNpc({ kind: 'quick', data: { name: 'Test NPC' }, note: 'hi' });
m.getAll()                                               // [{ id, kind: 'quick', data: {name:'Test NPC'}, note: 'hi', savedAt, deleted: false }]
m.updateNpc(id, { note: 'updated' });
m.getAll()[0].note                                       // 'updated'
m.removeNpc(id);
m.getAll()[0].deleted                                    // true
m.undoRemove(id);
m.getAll()[0].deleted                                    // false
m.exportAll()                                             // JSON string containing the one entry
m.importMerge(m.exportAll())                              // 0 (exact duplicate, skipped)
JSON.parse(localStorage.getItem('cc-npc-library')).npcs.length  // 1
```

Expected: each line's output matches the comment. Then reload the page and run `m2 = await import('./js/npc-storage.js'); m2.getAll()` again — the one entry should still be there (not deleted). Then in console run `m2.removeNpc(m2.getAll()[0].id)` and reload the page again — `m2.getAll()` should now be `[]` (soft-delete purged on load).

- [ ] **Step 3: Commit**

```bash
git add js/npc-storage.js
git commit -m "feat: add npc-storage.js persistence module"
```

---

### Task 2: Register `npc-storage.js` with the service worker cache

**Files:**
- Modify: `sw.js`

**Interfaces:** None.

- [ ] **Step 1: Add the new file to the cache manifest and bump the cache version**

In `sw.js`, find:

```js
const CACHE = 'cc-gm-v5';
```

Replace with:

```js
const CACHE = 'cc-gm-v6';
```

Then find:

```js
  './js/npc-gen.js',
  './js/npc-character-gen.js',
```

Replace with:

```js
  './js/npc-gen.js',
  './js/npc-character-gen.js',
  './js/npc-storage.js',
```

- [ ] **Step 2: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, open DevTools → Application → Service Workers, confirm the worker updates (or manually click "Update"/"skipWaiting" if prompted). Then open Application → Cache Storage → `cc-gm-v6` and confirm `./js/npc-storage.js` is listed among the cached entries, and that the old `cc-gm-v5` cache is gone (deleted by the `activate` handler) after a reload.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore: cache npc-storage.js and bump service worker version"
```

---

### Task 3: Fix Quick/Full active-button highlight

**Files:**
- Modify: `js/npc-gen.js:16-62`

**Interfaces:** None — internal to `init()`.

- [ ] **Step 1: Add a `setActiveMode` helper and call it from both click handlers**

In `js/npc-gen.js`, find:

```js
export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>
  `;
```

Replace with:

```js
export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>
  `;

  const btnQuick = container.querySelector('#btn-quick');
  const btnFull = container.querySelector('#btn-full');
  function setActiveMode(mode) {
    btnQuick.classList.toggle('secondary', mode !== 'quick');
    btnFull.classList.toggle('secondary', mode !== 'full');
  }
```

Then find:

```js
  container.querySelector('#btn-quick').addEventListener('click', () => {
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    output.innerHTML = '';
    output.appendChild(renderQuickCard(npc));
  });

  container.querySelector('#btn-full').addEventListener('click', () => {
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, allSkills));
  });
```

Replace with:

```js
  btnQuick.addEventListener('click', () => {
    setActiveMode('quick');
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    output.innerHTML = '';
    output.appendChild(renderQuickCard(npc));
  });

  btnFull.addEventListener('click', () => {
    setActiveMode('full');
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, allSkills));
  });
```

- [ ] **Step 2: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, click the **NPCs** tab.

Checklist:
- On load, "Quick NPC" is filled (accent background) and "Full NPC" is outlined.
- Click "Full NPC" — it becomes filled, "Quick NPC" becomes outlined.
- Click "Quick NPC" — it becomes filled again, "Full NPC" becomes outlined.
- Alternate a few more times — exactly one button is filled at all times.

Expected: all four checklist items behave as described.

- [ ] **Step 3: Commit**

```bash
git add js/npc-gen.js
git commit -m "fix: highlight the active Quick/Full NPC button"
```

---

### Task 4: Add Notes + Save controls to NPC cards

**Files:**
- Modify: `js/npc-gen.js:1-4` (imports), `js/npc-gen.js:105-195` (`renderQuickCard`, `renderFullCard`), `js/npc-gen.js:259-266` region (add new helper near `appendCopyBtn`)

**Interfaces:**
- Consumes: `saveNpc({kind, data, note}): id`, `updateNpc(id, {data, note}): void` from `js/npc-storage.js` (Task 1).
- Produces: `renderQuickCard(npc, savedEntry)`, `renderFullCard(npc, allSkills, savedEntry)` — both now accept an optional third/second-to-last arg `savedEntry: {id, note} | null | undefined`. Later tasks (5) rely on this signature to re-render saved entries.

- [ ] **Step 1: Import the storage functions**

In `js/npc-gen.js`, find:

```js
import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { addCombatant } from './initiative-state.js';
```

Replace with:

```js
import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { addCombatant } from './initiative-state.js';
import { saveNpc, updateNpc } from './npc-storage.js';
```

- [ ] **Step 2: Add the `appendSaveControls` helper**

In `js/npc-gen.js`, find:

```js
function appendCopyBtn(card, text) {
```

Insert immediately before it:

```js
function appendSaveControls(card, kind, npc, savedEntry) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '0.75rem';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.style.display = 'block';
  label.style.color = 'var(--muted)';
  label.style.fontSize = '0.8rem';
  label.style.marginBottom = '0.25rem';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.style.width = '100%';
  textarea.style.resize = 'vertical';
  textarea.value = savedEntry ? savedEntry.note : '';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.style.marginTop = '0.5rem';

  let savedId = savedEntry ? savedEntry.id : null;
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateNpc(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      updateNpc(savedId, { data: npc, note: textarea.value });
    } else {
      savedId = saveNpc({ kind, data: npc, note: textarea.value });
      saveBtn.textContent = 'Saved ✓';
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
}

```

- [ ] **Step 3: Wire it into `renderQuickCard` and `renderFullCard`**

In `js/npc-gen.js`, find:

```js
function renderQuickCard(npc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, npc.name, null);
  return card;
}
```

Replace with:

```js
function renderQuickCard(npc, savedEntry) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, npc.name, null);
  appendSaveControls(card, 'quick', npc, savedEntry);
  return card;
}
```

Then find (near the end of `renderFullCard`):

```js
  appendCopyBtn(card, npcToText(npc));
  appendInitiativeBtn(card, npc.name, Math.min(12, Math.max(1, npc.derived.Initiative)));
  return card;
}
```

Replace with:

```js
  appendCopyBtn(card, npcToText(npc));
  appendInitiativeBtn(card, npc.name, Math.min(12, Math.max(1, npc.derived.Initiative)));
  appendSaveControls(card, 'full', npc, savedEntry);
  return card;
}
```

And find the `renderFullCard` function signature:

```js
function renderFullCard(npc, allSkills) {
```

Replace with:

```js
function renderFullCard(npc, allSkills, savedEntry) {
```

- [ ] **Step 4: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, click the **NPCs** tab.

Checklist:
- Click "Quick NPC" — the card shows a "Notes" textarea and a "Save" button.
- Type a note, click "Save" — the button changes to "Saved ✓".
- Edit the note text again (without clicking Save) — open DevTools console and run `JSON.parse(localStorage.getItem('cc-npc-library')).npcs` after ~1 second; the entry's `note` field reflects the latest edit (auto-persisted via debounce).
- Click "Full NPC", repeat the same Save + edit checks — a `kind: 'full'` entry appears in `localStorage`.
- Refresh the page, click NPCs tab, click Quick NPC again — this generates a *new* npc, unrelated to storage (expected — nothing loads automatically yet; that's Task 5).

Expected: all checklist items behave as described.

- [ ] **Step 5: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: add notes and save controls to NPC cards"
```

---

### Task 5: Add the Saved NPCs list section

**Files:**
- Modify: `js/npc-gen.js:1-4` (imports), `js/npc-gen.js:16-24` (template), `js/npc-gen.js:16-62` region (wire-up in `init()`), append new `renderSavedList` function near the bottom of the file.

**Interfaces:**
- Consumes: `getAll()`, `removeNpc(id)`, `undoRemove(id)`, `subscribe(fn)` from `js/npc-storage.js` (Task 1); `renderQuickCard(npc, savedEntry)`, `renderFullCard(npc, allSkills, savedEntry)` from Task 4.
- Produces: `renderSavedList(listEl, output, allSkills)` — re-renders the saved-list DOM from current storage state; called directly and on every `subscribe` notification.

- [ ] **Step 1: Import the remaining storage functions**

In `js/npc-gen.js`, find:

```js
import { saveNpc, updateNpc } from './npc-storage.js';
```

Replace with:

```js
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe } from './npc-storage.js';
```

- [ ] **Step 2: Add the Saved NPCs markup**

In `js/npc-gen.js`, find:

```js
    <div id="npc-output"></div>
  `;
```

Replace with:

```js
    <div id="npc-output"></div>

    <div class="card" style="margin-top:1.5rem;">
      <h3 style="margin-bottom:0.5rem;">Saved NPCs</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
        <button id="npc-export-all" class="secondary">Export All</button>
        <button id="npc-import" class="secondary">Import</button>
        <input id="npc-import-file" type="file" accept="application/json" style="display:none;">
      </div>
      <div id="npc-saved-list"></div>
    </div>
  `;
```

- [ ] **Step 3: Add the `renderSavedList` function**

In `js/npc-gen.js`, find:

```js
function gbLabel(g) {
```

Insert immediately before it:

```js
function renderSavedList(listEl, output, allSkills) {
  const entries = getAll();
  listEl.innerHTML = '';
  if (entries.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No saved NPCs yet.</p>';
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';
    row.style.padding = '0.25rem 0';

    if (entry.deleted) {
      row.style.opacity = '0.6';
      const span = document.createElement('span');
      span.textContent = `Deleted — ${entry.data.name}`;
      span.style.flex = '1';
      const undoBtn = document.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.className = 'secondary';
      undoBtn.addEventListener('click', () => undoRemove(entry.id));
      row.appendChild(span);
      row.appendChild(undoBtn);
    } else {
      const nameBtn = document.createElement('button');
      nameBtn.textContent = entry.data.name;
      nameBtn.className = 'secondary';
      nameBtn.style.flex = '1';
      nameBtn.style.textAlign = 'left';
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, allSkills, { id: entry.id, note: entry.note })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note });
        output.appendChild(card);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'secondary';
      removeBtn.addEventListener('click', () => removeNpc(entry.id));

      row.appendChild(nameBtn);
      row.appendChild(removeBtn);
    }
    listEl.appendChild(row);
  });
}

```

- [ ] **Step 4: Wire the list into `init()`**

In `js/npc-gen.js`, find:

```js
  const output = container.querySelector('#npc-output');
```

Replace with:

```js
  const output = container.querySelector('#npc-output');
  const savedListEl = container.querySelector('#npc-saved-list');
  renderSavedList(savedListEl, output, allSkills);
  subscribe(() => renderSavedList(savedListEl, output, allSkills));
```

- [ ] **Step 5: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, click the **NPCs** tab. If leftover data exists from Task 4's manual testing, that's fine — it should already appear in the list.

Checklist:
- The "Saved NPCs" section shows each saved entry by name.
- Generate and Save a new Quick NPC — it appears in the list immediately (no refresh needed).
- Click its name in the list — the card re-renders in the output area above, with the note pre-filled, and the Save button already shows "Saved ✓".
- Click the **×** next to an entry — the row is replaced with a dimmed "Deleted — <name>" row and an "Undo" button; the entry disappears from being clickable.
- Click "Undo" — the row reverts to the normal clickable entry.
- Click **×** again, then refresh the page — the entry is now gone entirely (purged on load), not just hidden.
- With zero saved entries, the section shows "No saved NPCs yet."

Expected: all checklist items behave as described.

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: add saved NPCs list with load, remove, and undo"
```

---

### Task 6: Add Export All / Import buttons

**Files:**
- Modify: `js/npc-gen.js:1-4` (imports), `js/npc-gen.js` (wire-up in `init()`, after the saved-list wiring from Task 5).

**Interfaces:**
- Consumes: `exportAll(): string`, `importMerge(jsonString): number` from `js/npc-storage.js` (Task 1).

- [ ] **Step 1: Import `exportAll` and `importMerge`**

In `js/npc-gen.js`, find:

```js
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe } from './npc-storage.js';
```

Replace with:

```js
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe, exportAll, importMerge } from './npc-storage.js';
```

- [ ] **Step 2: Wire up the Export All and Import buttons**

In `js/npc-gen.js`, find:

```js
  const savedListEl = container.querySelector('#npc-saved-list');
  renderSavedList(savedListEl, output, allSkills);
  subscribe(() => renderSavedList(savedListEl, output, allSkills));
```

Replace with:

```js
  const savedListEl = container.querySelector('#npc-saved-list');
  renderSavedList(savedListEl, output, allSkills);
  subscribe(() => renderSavedList(savedListEl, output, allSkills));

  container.querySelector('#npc-export-all').addEventListener('click', () => {
    const json = exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `npc-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = container.querySelector('#npc-import-file');
  container.querySelector('#npc-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    const text = await file.text();
    importMerge(text);
    importInput.value = '';
  });
```

- [ ] **Step 3: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, click the **NPCs** tab. Ensure at least one NPC is saved (generate + Save if needed).

Checklist:
- Click "Export All" — a `.json` file downloads (e.g. `npc-library-2026-08-11.json`); open it and confirm it's a JSON array of your saved entries (with `id`, `kind`, `data`, `note`, `savedAt`, `deleted: false`).
- In DevTools console, run `localStorage.removeItem('cc-npc-library')` and reload — the Saved NPCs list is now empty.
- Click "Import" and select the file you just exported — the list repopulates with the same entries.
- Click "Import" again and select the same file a second time — the list does not gain duplicates (all entries were exact matches and skipped).
- Edit a `note` field by hand in a copy of the exported JSON file, then import that modified copy — the list gains one new additional entry (not a duplicate, since the note differs), alongside the originals.

Expected: all checklist items behave as described.

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: add export/import for saved NPC library"
```

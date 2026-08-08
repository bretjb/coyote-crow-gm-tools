# Initiative Tracker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-form sorted-list Initiative Tracker with a 12-fixed-slot tracker matching Coyote & Crow's actual initiative rules (slots 1-12, turn order runs 12→1), supporting add/move/remove of combatants, a current-step pointer, and one-click addition of generated NPCs from the NPC Generator tab.

**Architecture:** A new state module (`js/initiative-state.js`) owns all tracker data (12 slots + current step) and persists it to `localStorage`, independent of whether the Initiative tab UI has been initialized. The Initiative tab UI (`js/initiative.js`) is rewritten to render 12 static rows and subscribes to state changes. `js/npc-gen.js` is modified to add an "Add to Initiative" button to both NPC card types, calling into the state module directly.

**Tech Stack:** Vanilla JS (ES modules), no build step, no test framework in this project — verification is manual in-browser (see project memory: no JS unit tests, manual browser verification only).

## Global Constraints

- No JS unit tests — every verification step in this plan is a manual browser check, not an automated test.
- 12 static slots, numbered 1 (top) to 12 (bottom) in the UI.
- Multiple combatants can occupy the same slot.
- Turn order advances from slot 12 down to slot 1, wrapping 1→12; `nextStep`/`prevStep` skip empty slots and no-op if the tracker is entirely empty.
- Combatant records store only `{ id, name }` — no notes/HP/conditions.
- State persists to `localStorage` across reloads and tab switches.
- Follow existing code conventions: inline styles matching `css/style.css` variables (`--accent`, `--muted`, `--border`, `--bg`), `.card` / `.secondary` classes, template-literal `innerHTML` rendering pattern used by `js/initiative.js`, `js/npc-gen.js`.

---

### Task 1: Initiative state module

**Files:**
- Create: `js/initiative-state.js`

**Interfaces:**
- Produces (used by Task 2 and Task 3):
  - `getState(): { slots: { [1-12]: Array<{id: string, name: string}> }, currentStep: number }`
  - `addCombatant(name: string, slot: number): void`
  - `removeCombatant(id: string): void`
  - `moveCombatant(id: string, newSlot: number): void`
  - `nextStep(): void`
  - `prevStep(): void`
  - `clearAll(): void`
  - `subscribe(fn: () => void): () => void` (returns an unsubscribe function)

- [ ] **Step 1: Write the module**

```js
// js/initiative-state.js
const STORAGE_KEY = 'cc-initiative-state';
const SLOT_COUNT = 12;

function emptySlots() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) slots[i] = [];
  return slots;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
    const parsed = JSON.parse(raw);
    const slots = emptySlots();
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (Array.isArray(parsed.slots?.[i])) slots[i] = parsed.slots[i];
    }
    const currentStep = Number.isInteger(parsed.currentStep) ? parsed.currentStep : SLOT_COUNT;
    return { slots, currentStep };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT };
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

export function getState() {
  return state;
}

export function addCombatant(name, slot) {
  const clamped = Math.min(SLOT_COUNT, Math.max(1, slot));
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.slots[clamped].push({ id, name });
  notify();
}

export function removeCombatant(id) {
  for (let i = 1; i <= SLOT_COUNT; i++) {
    state.slots[i] = state.slots[i].filter(c => c.id !== id);
  }
  notify();
}

export function moveCombatant(id, newSlot) {
  const clamped = Math.min(SLOT_COUNT, Math.max(1, newSlot));
  let found = null;
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const idx = state.slots[i].findIndex(c => c.id === id);
    if (idx !== -1) {
      found = state.slots[i][idx];
      state.slots[i].splice(idx, 1);
      break;
    }
  }
  if (found) {
    state.slots[clamped].push(found);
    notify();
  }
}

function hasAnyCombatants() {
  return Object.values(state.slots).some(list => list.length > 0);
}

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

export function clearAll() {
  state = { slots: emptySlots(), currentStep: SLOT_COUNT };
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

- [ ] **Step 2: Manually verify in browser console**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`
Open `http://localhost:8765` in a browser, open DevTools console, and run:

```js
const m = await import('./js/initiative-state.js');
m.addCombatant('Alice', 12);
m.addCombatant('Bob', 6);
m.addCombatant('Carol', 12);
console.log(JSON.stringify(m.getState()));
// Expected: slots[12] has Alice+Carol, slots[6] has Bob, currentStep 12
m.nextStep();
console.log(m.getState().currentStep); // Expected: 6 (skips empty 11..7)
m.nextStep();
console.log(m.getState().currentStep); // Expected: 12 (wraps 5..1 empty, back to 12)
m.moveCombatant(m.getState().slots[12][0].id, 3);
console.log(JSON.stringify(m.getState().slots[3])); // Expected: contains moved combatant
m.removeCombatant(m.getState().slots[6][0].id);
console.log(m.getState().slots[6].length); // Expected: 0
localStorage.getItem('cc-initiative-state'); // Expected: non-null JSON string
```

Expected: each `console.log` matches the comment. Reload the page and re-run `m.getState()` (fresh import) to confirm persistence survives reload.

- [ ] **Step 3: Commit**

```bash
git add js/initiative-state.js
git commit -m "feat: add initiative tracker state module"
```

---

### Task 2: Initiative tab UI rewrite

**Files:**
- Modify: `js/initiative.js` (full rewrite, replacing all existing content)

**Interfaces:**
- Consumes from Task 1 (`js/initiative-state.js`): `getState()`, `addCombatant(name, slot)`, `removeCombatant(id)`, `moveCombatant(id, newSlot)`, `nextStep()`, `prevStep()`, `clearAll()`, `subscribe(fn)`
- Produces: `init(container: HTMLElement): Promise<void>` (same signature `js/app.js` already imports and calls)

- [ ] **Step 1: Write the new UI module**

```js
// js/initiative.js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, subscribe } from './initiative-state.js';

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Initiative Tracker</h2>
    <form id="init-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input id="init-name" type="text" placeholder="Name" required style="flex:1;min-width:8rem;">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" required style="width:5rem;">
      <button type="submit">Add</button>
    </form>
    <div id="init-slots"></div>
    <div style="display:flex;gap:0.5rem;margin-top:1rem;">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');

  function render() {
    const { slots, currentStep } = getState();
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
      const combatants = slots[slotNum];
      const isCurrent = slotNum === currentStep;
      const chips = combatants.map(c => `
        <span class="init-chip" data-id="${c.id}" style="display:inline-flex;align-items:center;gap:0.3rem;
            background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:0.2rem 0.4rem;margin:0.15rem;">
          <span>${c.name}</span>
          <input type="number" class="init-move" min="1" max="12" placeholder="→" style="width:3rem;">
          <button type="button" class="init-remove secondary" style="padding:0.1rem 0.4rem;">×</button>
        </span>
      `).join('');
      return `
        <div class="card" style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;
            ${isCurrent ? 'border-color:var(--accent);' : ''}">
          <span style="min-width:2rem;font-size:1.1rem;color:var(--accent);">${isCurrent ? '▶ ' : ''}${slotNum}</span>
          <div style="flex:1;display:flex;flex-wrap:wrap;">${chips}</div>
        </div>
      `;
    }).join('');
  }

  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const slot = parseInt(container.querySelector('#init-slot').value, 10);
    if (!name || isNaN(slot) || slot < 1 || slot > 12) return;
    addCombatant(name, slot);
    e.target.reset();
  });

  slotsEl.addEventListener('click', e => {
    const removeBtn = e.target.closest('.init-remove');
    if (!removeBtn) return;
    const chip = removeBtn.closest('.init-chip');
    removeCombatant(chip.dataset.id);
  });

  slotsEl.addEventListener('change', e => {
    const moveInput = e.target.closest('.init-move');
    if (!moveInput) return;
    const newSlot = parseInt(moveInput.value, 10);
    if (isNaN(newSlot) || newSlot < 1 || newSlot > 12) return;
    const chip = moveInput.closest('.init-chip');
    moveCombatant(chip.dataset.id, newSlot);
  });

  container.querySelector('#init-next').addEventListener('click', () => nextStep());
  container.querySelector('#init-prev').addEventListener('click', () => prevStep());
  container.querySelector('#init-clear').addEventListener('click', () => clearAll());

  subscribe(render);
  render();
}
```

- [ ] **Step 2: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765` (skip if already running from Task 1), open `http://localhost:8765`, click the **Initiative** tab.

Checklist:
- 12 rows visible, numbered 1 (top) through 12 (bottom).
- Add "Alice" to slot 12, "Bob" to slot 6 — both appear as chips in their rows.
- Slot 12's row is highlighted (border/accent, ▶ prefix) since `currentStep` starts at 12.
- Click **Next Step** — highlight jumps to slot 6 (skipping empty 11-7).
- Click **Next Step** again — highlight wraps back to slot 12 (skipping empty 5-1).
- Click **Prev Step** — highlight goes back to slot 6.
- On Bob's chip, set the move input to `3` and blur/press Enter — Bob's chip moves to row 3.
- Click the `×` on Alice's chip — Alice disappears from slot 12.
- Click **Clear All** — all chips gone, highlight back on slot 12.
- Reload the page, click Initiative tab again — state is empty (since Clear All was last action); add a combatant, reload again, confirm it's still there.

Expected: every item in the checklist behaves as described, with no console errors.

- [ ] **Step 3: Commit**

```bash
git add js/initiative.js
git commit -m "feat: rebuild initiative tracker UI around 12 fixed slots"
```

---

### Task 3: "Add to Initiative" on NPC Generator cards

**Files:**
- Modify: `js/npc-gen.js:104-192` (`renderQuickCard`, `renderFullCard`)

**Interfaces:**
- Consumes from Task 1 (`js/initiative-state.js`): `addCombatant(name: string, slot: number): void`

- [ ] **Step 1: Add the import**

In `js/npc-gen.js`, add to the top of the file (after existing imports):

```js
import { addCombatant } from './initiative-state.js';
```

- [ ] **Step 2: Add a shared helper for the Add-to-Initiative control**

Add this function near `appendCopyBtn` (after it, around line 263 in the current file):

```js
function appendInitiativeBtn(card, name, suggestedSlot) {
  const wrap = document.createElement('span');
  wrap.style.marginLeft = '0.5rem';
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '0.3rem';

  const btn = document.createElement('button');
  btn.textContent = 'Add to Initiative';
  btn.className = 'secondary';
  btn.style.marginTop = '0.5rem';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.style.width = '4rem';
  input.style.display = 'none';
  if (suggestedSlot != null) input.value = String(suggestedSlot);

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.style.display = 'none';
  confirmBtn.style.marginTop = '0.5rem';

  const status = document.createElement('span');
  status.style.color = 'var(--muted)';
  status.style.fontSize = '0.85rem';

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    input.style.display = '';
    confirmBtn.style.display = '';
    input.focus();
  });

  confirmBtn.addEventListener('click', () => {
    const slot = parseInt(input.value, 10);
    if (isNaN(slot) || slot < 1 || slot > 12) return;
    addCombatant(name, slot);
    input.style.display = 'none';
    confirmBtn.style.display = 'none';
    status.textContent = `Added to Initiative slot ${slot}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}
```

- [ ] **Step 3: Wire it into `renderQuickCard`**

In `renderQuickCard` (around line 104-115), change the end of the function from:

```js
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  return card;
}
```

to:

```js
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, npc.name, null);
  return card;
}
```

- [ ] **Step 4: Wire it into `renderFullCard`**

In `renderFullCard`, find this line near the end of the function (around line 190):

```js
  appendCopyBtn(card, npcToText(npc));
  return card;
}
```

Replace with:

```js
  appendCopyBtn(card, npcToText(npc));
  appendInitiativeBtn(card, npc.name, Math.min(12, npc.derived.Initiative));
  return card;
}
```

- [ ] **Step 5: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765` (skip if already running), open `http://localhost:8765`, click the **NPCs** tab.

Checklist:
- Click **Quick NPC** — card shows Copy and "Add to Initiative" buttons.
- Click "Add to Initiative" — a slot input (blank) and Confirm button appear.
- Type `7`, click Confirm — status text reads "Added to Initiative slot 7".
- Switch to the **Initiative** tab — the generated NPC's name appears in slot 7.
- Switch back to **NPCs**, click **Full NPC** — card shows "Add to Initiative"; click it, the slot input is pre-filled with `min(derived Initiative, 12)`.
- Change the value, click Confirm, switch to **Initiative** tab, confirm the NPC lands in the slot you typed (not the pre-filled one).
- Reload the page, go directly to **Initiative** tab (without visiting NPCs first) — both previously added NPCs are still present (confirms state module works independent of tab init order).

Expected: every item in the checklist behaves as described, with no console errors.

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: add Add-to-Initiative button to NPC generator cards"
```

---

## Self-Review Notes

- **Spec coverage:** 12 static slots (Task 2), add-to-slot (Task 2 form), current-step tracking with skip-empty/wrap (Task 1 `nextStep`/`prevStep`, verified Task 2), move (Task 2 chip move input → `moveCombatant`), remove (Task 2 chip × → `removeCombatant`), add generated NPC (Task 3). All spec sections have a covering task.
- **No placeholders:** all steps contain full code or fully-specified manual verification checklists.
- **Type consistency:** `addCombatant(name, slot)`, `removeCombatant(id)`, `moveCombatant(id, newSlot)`, `nextStep()`, `prevStep()`, `clearAll()`, `subscribe(fn)`, `getState()` are defined once in Task 1 and used with identical names/arities in Tasks 2 and 3.

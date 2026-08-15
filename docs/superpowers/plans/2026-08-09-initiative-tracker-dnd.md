# Initiative Tracker: Default Slot + Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default the Initiative Tracker's Add-form slot input to 1, and let combatant chips be dragged between slot rows via a pointer-events-based drag handle (touch- and mouse-compatible), alongside the existing inline move-slot-number input.

**Architecture:** Both changes live entirely in `js/initiative.js`. The default value is a one-attribute HTML change. Drag-and-drop is a small pointer-event controller attached via event delegation on `#init-slots`, calling the existing `moveCombatant(id, newSlot)` from `js/initiative-state.js` on a successful drop — no state-module changes needed.

**Tech Stack:** Vanilla JS (ES modules), Pointer Events API (not native HTML5 drag-and-drop, since most mobile browsers don't support HTML5 DnD for touch input), no build step, no test framework.

## Global Constraints

- Add-form slot input defaults to `1` (was blank) — user can still override before submitting.
- Drag-and-drop uses the Pointer Events API (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`), not native HTML5 `draggable`/`dragstart` — this must work for touch input, not just mouse.
- Each chip gets a dedicated drag handle (⠿ icon); the whole chip is not draggable, so drags don't conflict with tapping the existing `×` remove button or the move-slot number input.
- The existing inline move-slot-number input on each chip is kept, unchanged — drag-and-drop supplements it, does not replace it.
- Dropping is valid anywhere within a target slot row, including on top of existing chips in that row.
- The drag-over row gets a dashed `var(--accent)` outline, visually distinct from the solid `border-color: var(--accent)` already used for the current-step row.
- No changes to `js/initiative-state.js` or `js/npc-gen.js`.
- No reordering of chips within the same slot.
- No JS unit tests in this project — every verification step is a manual/Playwright browser check, not an automated test.

---

### Task 1: Default the Add-form slot input to 1

**Files:**
- Modify: `js/initiative.js:9`

**Interfaces:** None — this is a template-string attribute change with no new functions.

- [ ] **Step 1: Change the slot input's default value**

In `js/initiative.js`, find this line (currently line 9):

```html
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" required style="width:5rem;">
```

Replace it with:

```html
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required style="width:5rem;">
```

This is the only change for this task. The existing submit handler already does `parseInt(container.querySelector('#init-slot').value, 10)` and validates 1-12, so no JS logic changes are needed — and `e.target.reset()` (already called after every successful add) resets form fields to their HTML `value` attribute, so the field will show `1` again after each add, not go blank.

- [ ] **Step 2: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765`, open `http://localhost:8765`, click the **Initiative** tab.

Checklist:
- The slot input in the Add form already shows `1` before you type anything (was blank before this change).
- Type a name, leave the slot field at `1`, click Add — the combatant appears in slot 1's row.
- Add another combatant, this time changing the slot field to `7` before clicking Add — it appears in slot 7's row.
- After each Add, the slot field resets back to showing `1` (not blank).

Expected: all four checklist items behave as described.

- [ ] **Step 3: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/initiative.js
git commit -m "feat: default initiative Add-form slot input to 1"
```

---

### Task 2: Drag-and-drop combatant chips between slots

**Files:**
- Modify: `js/initiative.js` (full rewrite of the module, building on Task 1's change)

**Interfaces:**
- Consumes from `js/initiative-state.js` (already committed, unchanged): `getState()`, `addCombatant(name, slot)`, `removeCombatant(id)`, `moveCombatant(id, newSlot)`, `nextStep()`, `prevStep()`, `clearAll()`, `subscribe(fn)`.
- Produces: `init(container)` — same signature `js/app.js` already imports and calls; no change to that contract.

- [ ] **Step 1: Replace `js/initiative.js` with the drag-and-drop-enabled version**

Replace the entire contents of `js/initiative.js` with:

```js
// js/initiative.js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, subscribe } from './initiative-state.js';

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Initiative Tracker</h2>
    <form id="init-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input id="init-name" type="text" placeholder="Name" required style="flex:1;min-width:8rem;">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required style="width:5rem;">
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
  let dragHighlightRow = null;

  function render() {
    const { slots, currentStep } = getState();
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
      const combatants = slots[slotNum];
      const isCurrent = slotNum === currentStep;
      const chips = combatants.map(c => `
        <span class="init-chip" data-id="${c.id}" style="display:inline-flex;align-items:center;gap:0.3rem;
            background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:0.2rem 0.4rem;margin:0.15rem;">
          <span class="init-drag-handle" style="cursor:grab;touch-action:none;color:var(--muted);">⠿</span>
          <span>${c.name}</span>
          <input type="number" class="init-move" min="1" max="12" placeholder="→" style="width:3rem;">
          <button type="button" class="init-remove secondary" style="padding:0.1rem 0.4rem;">×</button>
        </span>
      `).join('');
      return `
        <div class="card init-slot-row" data-slot="${slotNum}" style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;
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

  function clearDragHighlight() {
    if (dragHighlightRow) {
      dragHighlightRow.style.outline = '';
      dragHighlightRow.style.outlineOffset = '';
      dragHighlightRow = null;
    }
  }

  function resetChipDragStyles(chip) {
    chip.style.position = '';
    chip.style.left = '';
    chip.style.top = '';
    chip.style.width = '';
    chip.style.zIndex = '';
    chip.style.opacity = '';
    chip.style.pointerEvents = '';
  }

  slotsEl.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.init-drag-handle');
    if (!handle) return;
    const chip = handle.closest('.init-chip');
    const chipId = chip.dataset.id;
    const rect = chip.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    handle.setPointerCapture(e.pointerId);

    chip.style.position = 'fixed';
    chip.style.left = `${rect.left}px`;
    chip.style.top = `${rect.top}px`;
    chip.style.width = `${rect.width}px`;
    chip.style.zIndex = '1000';
    chip.style.opacity = '0.85';
    chip.style.pointerEvents = 'none';

    function onMove(moveEvent) {
      chip.style.left = `${moveEvent.clientX - offsetX}px`;
      chip.style.top = `${moveEvent.clientY - offsetY}px`;

      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const row = under?.closest('.init-slot-row') ?? null;
      if (row !== dragHighlightRow) {
        clearDragHighlight();
        if (row) {
          row.style.outline = '2px dashed var(--accent)';
          row.style.outlineOffset = '-2px';
          dragHighlightRow = row;
        }
      }
    }

    function onUp(upEvent) {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);

      const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const row = under?.closest('.init-slot-row') ?? null;
      clearDragHighlight();

      if (row) {
        const newSlot = parseInt(row.dataset.slot, 10);
        moveCombatant(chipId, newSlot);
        // moveCombatant's state change triggers render(), which replaces
        // #init-slots' contents wholesale — the dragged chip node (and its
        // inline drag styles) is discarded along with it, so no manual
        // style reset is needed on this path.
      } else {
        resetChipDragStyles(chip);
      }
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });

  container.querySelector('#init-next').addEventListener('click', () => nextStep());
  container.querySelector('#init-prev').addEventListener('click', () => prevStep());
  container.querySelector('#init-clear').addEventListener('click', () => clearAll());

  subscribe(render);
  render();
}
```

- [ ] **Step 2: Manually verify in browser**

Run: `cd /Users/bretjb/dev/coyote-crow && python3 -m http.server 8765` (skip if already running), open `http://localhost:8765`, click the **Initiative** tab.

Since this needs to check pointer-drag behavior precisely (down/move/up sequences, highlight state, final slot), use Playwright rather than manual clicking alone. From a scratch directory (e.g. `/tmp`) that has `playwright` installed (`npm install playwright` if not already done in this environment; the Chromium binary may already be cached under `~/Library/Caches/ms-playwright` from prior verification work in this project — check there before reinstalling), write and run a script that:

1. Navigates to `http://localhost:8765`, clicks the Initiative tab.
2. Adds three combatants via the form: "Alice" to slot 1 (the new default — just click Add without changing the slot field), "Bob" to slot 5, "Carol" to slot 5 (same slot as Bob, to test dropping onto a row that already has a chip).
3. Locates Alice's chip's `.init-drag-handle` element and its bounding box.
4. Uses `page.mouse.move(handleCenterX, handleCenterY)`, `page.mouse.down()`, then several `page.mouse.move(...)` calls stepping toward the center of slot 5's row (`.init-slot-row[data-slot="5"]`), then `page.mouse.up()`.
5. Asserts: Alice's chip is now inside slot 5's row (alongside Bob and Carol), slot 1's row has no chips, and no `pageerror`/console-error events fired during the drag.
6. Repeats the drag but this time releases the mouse over empty space outside any `.init-slot-row` (e.g. far below the last row) — asserts the dragged chip's slot is unchanged from before that drag (cancelled-drop case), and that the chip no longer has inline `position: fixed` styling (confirms `resetChipDragStyles` ran).
7. During a drag (mouse down, moved over a row, before mouse up), asserts the hovered `.init-slot-row` has a non-empty inline `outline` style, and a row not being hovered does not.
8. Confirms the existing move-slot-number input and remove (`×`) button on a chip still work after the drag-and-drop code has been exercised (i.e. the event delegation for `click`/`change` on `#init-slots` wasn't broken by adding the `pointerdown` listener).

Run the script and report the actual output for each assertion — do not claim a check passed without having actually run it and read the result.

Expected: every assertion in the script passes, with zero console/page errors throughout.

- [ ] **Step 3: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/initiative.js
git commit -m "feat: add pointer-based drag-and-drop for initiative chips"
```

---

## Self-Review Notes

- **Spec coverage:** default slot value (Task 1), Pointer Events-based drag with a dedicated handle (Task 2 Step 1), move-input kept alongside drag (Task 2 Step 1 — `.init-move` unchanged), drop-anywhere-in-row including on other chips (Task 2 Step 1 — `elementFromPoint` + `.closest('.init-slot-row')`, no child-specific target check), dashed-outline drag-over highlight distinct from solid current-step border (Task 2 Step 1 — `outline` vs `border-color`), no `initiative-state.js`/`npc-gen.js` changes (neither file appears in either task's Files section), no same-slot reordering (not implemented — dropping in the same slot just re-appends via `moveCombatant`, no visible reordering behavior is added). All spec sections have a covering task.
- **No placeholders:** both tasks contain full code and fully-specified verification procedures.
- **Type consistency:** `init(container)` signature unchanged from the previously-shipped version; `moveCombatant(id, newSlot)` called with the same argument order/types as `js/initiative-state.js` already defines and as the existing `.init-move` change handler already uses.

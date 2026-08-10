# Initiative Tracker: Default Slot + Drag-and-Drop

## Problem

Two usability gaps in the recently-shipped 12-slot Initiative Tracker (`js/initiative.js`, `js/initiative-state.js`):

1. The "Add" form's slot input starts blank, forcing a slot number to be typed for every combatant even though slot 1 is a reasonable default.
2. Moving a combatant between slots only works via a small inline number input on each chip — there's no way to drag a combatant to a new slot, which is the faster, more natural interaction, especially on the touchscreen this app is used on during sessions.

## Default Slot Value

The Add form's slot `<input>` in `js/initiative.js` gets `value="1"` (was blank). This only changes the initial form value; the existing 1-12 validation and manual override are unchanged.

## Drag-and-Drop

**Why Pointer Events instead of native HTML5 drag-and-drop:** this app runs on a touchscreen during sessions, and most mobile browsers don't support native HTML5 DnD for touch input. The Pointer Events API (`pointerdown`/`pointermove`/`pointerup`) unifies mouse and touch handling in one code path, so this is implemented as a small custom drag controller inside `js/initiative.js`. No changes to `js/initiative-state.js` are needed — `moveCombatant(id, newSlot)` already does exactly what a drop needs to call.

- Each chip gets a small drag-handle icon (`⠿`) rather than making the whole chip draggable. This avoids accidental drags when tapping the existing `×` remove button or the move-slot number input, which both remain on the chip (drag-and-drop supplements, not replaces, the existing move input — useful as a precise/keyboard-accessible fallback).
- `pointerdown` on the handle starts a drag: `setPointerCapture` on the handle's pointer id, then switch the chip to `position: fixed` and track it under the pointer via `pointermove` (the chip itself visually "lifts" and follows the pointer/finger — no separate ghost/clone element).
- On each `pointermove`, `document.elementFromPoint(x, y)` (temporarily hiding the dragged chip from hit-testing via `pointer-events: none` on itself during the drag) locates the slot row underneath the pointer. That row gets a distinct highlight — a dashed `var(--accent)` border — visually different from the solid-border highlight already used for the current-step row, so the two don't get confused.
- On `pointerup`, the same `elementFromPoint` lookup determines the drop target:
  - If it resolves to a valid slot row (dropping anywhere within the row counts, including on top of existing chips in that row), call `moveCombatant(id, slot)`.
  - If it resolves to nothing (released outside any row), the drag is cancelled — no state change.
- After drop or cancel: clear the drop-target row highlight, reset the dragged chip's inline positioning styles, and release pointer capture. `render()` is already subscribed to state changes (`subscribe(render)` from Task 2 of the original tracker build) and redraws every row from the updated state, so no manual DOM patchup is needed for the successful-drop case — only the cancelled-drag case needs the chip's temporary fixed-position styles reset manually, since no state change means no re-render will happen to clear them.

## Out of scope

- No reordering combatants within the same slot (order doesn't affect gameplay — turn order is by slot, not by position within a slot's chip list).
- No animation/transition polish beyond the drop-target highlight; this is a functional improvement, not a visual redesign.
- No changes to `js/initiative-state.js` or `js/npc-gen.js`.

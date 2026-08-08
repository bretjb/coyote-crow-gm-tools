# Initiative Tracker Redesign

## Problem

The current Initiative Tracker (`js/initiative.js`) is a free-form sorted list: combatants are added with an arbitrary numeric score, sorted descending, and stepped through in that order. Coyote & Crow's actual initiative system doesn't work this way — combatants pick a fixed slot number from 1-12 (capped by their Initiative Score), and turn order runs from slot 12 down to slot 1. The tracker needs to model these fixed slots directly, support moving/removing combatants mid-encounter, and let NPCs be added straight from the NPC Generator tab.

## Data Model & Persistence

A new module, `js/initiative-state.js`, owns the tracker's state as the single source of truth, independent of whether the Initiative tab has been opened yet (the NPC Generator tab must be able to add combatants even if Initiative hasn't been initialized).

```js
{
  slots: { 1: [...], 2: [...], ..., 12: [...] }, // each value: array of { id, name }
  currentStep: 12
}
```

- Persisted to `localStorage` on every mutation; loaded once on module import.
- Public API:
  - `getState()` — returns current `{ slots, currentStep }`
  - `addCombatant(name, slot)` — pushes `{ id, name }` onto `slots[slot]`
  - `removeCombatant(id)` — removes a combatant from whichever slot holds it
  - `moveCombatant(id, newSlot)` — removes from old slot, pushes onto `newSlot`
  - `nextStep()` / `prevStep()` — advances/reverses `currentStep`, skipping empty slots, wrapping 12→1 and 1→12. No-op if all slots are empty.
  - `clearAll()` — empties all slots, resets `currentStep` to 12
  - `subscribe(fn)` — registers a listener called after any mutation, so the tab UI can re-render even when state changes from elsewhere (e.g. NPC tab adds a combatant while Initiative tab is inactive but already initialized)

## Initiative Tab UI (`js/initiative.js`)

- Renders 12 static rows, slot 1 at top through slot 12 at bottom.
- Each row shows its slot number and the combatants currently in it as chips. Each chip has:
  - a small `×` button to remove that combatant (`removeCombatant`)
  - a small slot-number input to move that combatant to a different slot (`moveCombatant`)
- An "Add" form (name + slot number 1-12) at the top adds a new combatant to the chosen slot (`addCombatant`).
- The row matching `currentStep` is visually highlighted (border/accent color), consistent with the old tracker's active-row treatment.
- **Prev Step** / **Next Step** buttons call `prevStep()` / `nextStep()`. Since `nextStep()` wraps from 1 back to 12, no separate "reset round" control is needed.
- **Clear All** button calls `clearAll()`.
- The module calls `subscribe()` on init so external mutations (from the NPC tab) trigger a re-render.

## NPC Generator Integration (`js/npc-gen.js`)

- Both `renderQuickCard` and `renderFullCard` gain an **"Add to Initiative"** button alongside the existing Copy button.
- Clicking it reveals an inline slot-number input (not a browser `prompt()`) with a Confirm control:
  - Full NPC cards pre-fill the input with `min(npc.derived.Initiative, 12)`, editable before confirming.
  - Quick NPC cards leave the input blank (Quick NPCs have no stats to derive a suggestion from).
- Confirming calls `addCombatant(npc.name, slot)` from `initiative-state.js` and shows a brief inline confirmation message (e.g. "Added to Initiative slot 9") near the button.

## Out of scope

- No initiative-score calculation or validation against a combatant's actual Score (the rulebook's "slot ≤ Score" constraint is a player-facing choice, not something this tool enforces).
- No round counter beyond the 12→1 wrap; multi-round history isn't tracked.
- No notes/HP/condition tracking on combatants — name and slot only.

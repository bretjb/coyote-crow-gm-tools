# Initiative Tracker Updates

## Context

Four additions to the existing 12-slot drag-and-drop initiative tracker (`js/initiative.js` / `js/initiative-state.js`): a current-character quick-lookup card, a round counter, undo after Clear All, and NPC/PC color coding on chips.

**Depends on the PC tab spec** (`docs/superpowers/specs/2026-08-16-pc-tab-design.md`) having landed, since the quick-lookup card and color coding need to distinguish PCs from NPCs, which requires `js/pc-storage.js` to exist.

Today a combatant is just `{ id, name }` — no stats, no HP, no link to where it came from. This spec changes that.

## Data Linkage: Live Link to the Source Library Entry

Combatants gain a source reference instead of a data snapshot:

```js
{ id, name, sourceKind: 'npc' | 'pc' | null, sourceId: string | null }
```

`sourceKind`/`sourceId` point at an entry in `npc-storage.js` or `pc-storage.js`. Manually-typed combatants (added via the tracker's own name+slot form) have `sourceKind: null, sourceId: null`. `name` is still captured on the combatant itself at add-time (so chips always have something to render even if the source is later deleted), but the quick-lookup card always reads fresh data from the source store when one is linked.

**`addCombatant(name, slot, source)`** gains a third, optional parameter: `source` is `{ kind: 'npc' | 'pc', id: string }` or omitted/`null` for manual adds.

**Both `npc-storage.js` and `pc-storage.js` gain a `getById(id)`** export (neither has one today — `getAll()` is the only read accessor), returning a single deep-copied entry or `null`:

```js
export function getById(id) {
  const entry = state.npcs.find(n => n.id === id); // pc-storage.js: state.pcs
  return entry ? { ...entry, data: JSON.parse(JSON.stringify(entry.data)) } : null;
}
```

### Adding an unsaved NPC/PC to initiative

"Add to Initiative" (`appendInitiativeBtn`, called from both the NPC and PC cards) can be clicked before the card has ever been saved to its library — there's no id yet to link to. In that case, **it auto-saves first**: `appendSaveControls`'s returned object (already `{ getSavedId }` per the Group B plan) gains an `ensureSaved()` method that returns the current saved id, saving the card first (via the same path the Save button already uses) if it hasn't been saved yet. `appendInitiativeBtn` calls `ensureSaved()` to get a guaranteed id before calling `addCombatant(name, slot, { kind, id })`, so every card-originated initiative entry ends up live-linked. `appendInitiativeBtn`'s signature grows to `appendInitiativeBtn(card, getName, getSuggestedSlot, sourceKind, ensureSaved)`.

### Deleted source handling

Soft-deleting an NPC/PC (`removeNpc`/`removePc`) doesn't remove it from `getById` — it's still recoverable via the existing undo-remove flow, so the initiative link still resolves. If a combatant's `sourceId` doesn't resolve at all (entry hard-gone, e.g. imported state referencing an id from a different library export), the quick-lookup card shows "Source not found" instead of a stat panel; the chip itself is unaffected and keeps showing its captured `name`.

## Current-Character Quick-Lookup Card

A new panel above (or beside) the slot grid shows a compact stat card for **every combatant in the current slot** (a slot can hold multiple combatants on a tie — each gets its own stacked mini-card, none hidden). For each:

- Name (from the source if linked and resolvable, else the combatant's captured `name`)
- Current / max Body, Mind, Soul (`derived` + `current` from the source), with the Current values live-editable right there — same "always editable" pattern as the Full NPC/PC card's Current-HP fields (Group B). Editing here writes back to the source via `updateNpc(sourceId, { data: { ...sourceData, current: newCurrent } })` (or `updatePc`), so it's the same live number whether viewed from Initiative or from the NPC/PC tab.
- A compact list of ranked skills as `Name: Total` (not the full multi-column NPC/PC-tab skill table — this is a quick reference, not an editor; skill ranks aren't editable from here)
- Ability name + description

If the combatant has no source link (manual add) or the source can't be resolved, the card shows just the name and a "No linked character data" note — no stat panel.

## Round Counter

New `round` field in initiative state, starting at `1`, persisted like everything else. `nextStep()` steps backward through slots (12 → 11 → ... → 1 → 12, per the existing wrap logic) — a full round completes each time it wraps from slot 1 back to slot 12, at which point `round` increments. `prevStep()` is the mirror: wrapping from 12 back to 1 (undoing a round boundary) decrements `round`, floored at `1` (never goes below 1). Displayed next to the Prev/Next Step buttons, e.g. "Round 3". `clearAll()` resets `round` to `1` along with everything else.

## Undo After Clear All

Session-only (per the original request — no need to persist across reloads): immediately before `clearAll()` wipes state, the prior `{ slots, currentStep, round }` is stashed in a module-level variable in `initiative-state.js` (not written to `localStorage`). A new `undoClearAll()` restores it and clears the stash (single-use — a second undo click after that does nothing, and the stash is also cleared if `clearAll()` is called again before an undo). An "Undo" button appears next to "Clear All" only immediately after a clear, and disappears on the next state-changing action or page reload.

## NPC/PC Color Coding

Chips get one of three visual treatments based on `sourceKind`: NPC (reuses the existing `--accent-copper` token, already used for NPC stat/derived-value emphasis on the NPC card), PC (reuses `--accent-purple`, already used as the app's focus/accent color), or neutral/unclassified for manual adds with no source link (`--muted` border, no fill) — no new colors introduced, and no way to force a manual entry into the NPC or PC color, since it has no linked source to classify it.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser: add an NPC and a PC to initiative both before and after saving them (confirming the auto-save-first path works), confirm chip colors differ for NPC vs PC vs a manually-typed combatant, step through Next/Prev and confirm the round counter increments/decrements correctly at the slot-1/slot-12 wrap boundary, confirm the quick-lookup card shows correct live stats for the current slot's combatant(s) and that editing Current Body/Mind/Soul there is reflected back on the source NPC/PC card, put two combatants in the same slot and confirm both get quick-lookup cards, and confirm Clear All shows an Undo option that restores the exact prior state once.

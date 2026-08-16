# Encounter Generator

## Context

A new "Encounter" tab that lets the GM pick from the saved NPC and PC libraries and generate a fresh encounter directly into the existing Initiative Tracker — not a separate persistent roster view. The Initiative Tracker's live state *is* the encounter's state, same as it already is today; this tab is purely a faster way to populate it than adding combatants one at a time.

**Depends on** the PC tab spec (`pc-storage.js` must exist) and the Initiative Tracker Updates spec (`docs/superpowers/specs/2026-08-16-initiative-tracker-updates-design.md`) — this feature is built entirely on top of the source-linking (`addCombatant(name, slot, source)`) and clear/undo mechanics that spec introduces.

## Scope: Full NPCs and PCs Only

Quick NPCs have no `derived` stats at all (no Initiative Score to auto-slot by), so they can't be meaningfully picked here. The picker lists only Full NPC entries (`kind: 'full'` in `npc-storage.js`) and PC entries (`pc-storage.js`, which has only one shape). Soft-deleted entries (`deleted: true`) are excluded, same as the main Saved NPCs/PCs lists already do visually.

## Picker UI

Two checkbox lists (NPCs, PCs), each with a search box above it filtering live by name or tag substring — same filter predicate as the Saved NPCs list's search (Group A spec), reused for both lists here. Each row shows the entry's name plus a short identifying line (archetype for NPCs, nothing extra needed for PCs since they're already named individuals) so the GM can tell entries apart at a glance. A "Generate Encounter" button at the bottom is disabled until at least one entry is checked.

## Generate Behavior

On click:

1. `clearAll()` (from `initiative-state.js`) — a fresh encounter always starts from an empty tracker. This reuses the same clear the Initiative Tracker's own "Clear All" button triggers, so the Undo-after-Clear-All from that spec still covers this — if the GM generates the wrong encounter, Undo restores whatever was in the tracker before.
2. For each checked entry, `addCombatant(entry.data.name, suggestedSlot, { kind, id: entry.id })`, where `suggestedSlot = Math.min(12, Math.max(1, entry.data.derived.Initiative))` — the same clamped-Initiative-Score suggestion already used by the single-card "Add to Initiative" flow (`appendInitiativeBtn`'s `getSuggestedSlot`). No quantity support — each saved entry can be picked once per generation; multiple identical enemies means saving/generating that NPC more than once in the library ahead of time.
3. Switch to the Initiative tab: `document.querySelector('[data-tab="initiative"]').click()`. This goes through the app shell's existing `activateTab` click handler in `js/app.js`, which lazily initializes the Initiative tab if it hasn't been visited yet — no new tab-switching API needed. Because `initiative-state.js` is a module-level singleton store independent of whether `js/initiative.js`'s `init()` has run, steps 1-2 are safe to run before the tab has ever been opened; its `render()` reads current state on first init regardless of ordering.

No append mode, no quantity spinner — replace-and-switch is the only flow, per explicit descoping during brainstorming.

## Data Flow

No new storage module. `encounter.js` reads `npc-storage.js`'s `getAll()` and `pc-storage.js`'s `getAll()` directly (read-only) and writes only through `initiative-state.js`'s existing `clearAll()`/`addCombatant()`. Nothing about an "encounter" is persisted as its own entity — once generated, it's just whatever's in the Initiative Tracker, exactly like manually-built combat setups already are.

## UI Wiring

- New `<div id="tab-encounter">` panel in `index.html`, new tab button.
- New `js/encounter.js`, exporting `init(container)`, registered in `js/app.js`'s `tabInits` map as `'encounter'`.
- `sw.js`: register `js/encounter.js` in `ASSETS`; bump `CACHE`.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser: save at least two Full NPCs and one PC, add some unrelated combatant to the Initiative Tracker manually first, open the Encounter tab, search/filter down to specific entries, check a few, click Generate Encounter, and confirm: the tracker was cleared of the manual combatant, the checked entries appear in slots matching their Initiative Score (clamped 1-12), the app switched to the Initiative tab automatically, Undo (from the tracker) restores the pre-generation state, and Quick NPCs never appear in the picker.

# NPC persistence, active-tab highlight, notes, import/export

## Problem

The NPC Generator tab has two issues:

1. The Quick/Full NPC toggle buttons don't reflect which mode is active — `btn-quick` renders as the filled/accent button and `btn-full` is hardcoded to the outlined `secondary` style, regardless of which was last clicked.
2. Generated NPCs are ephemeral — there's no way to keep one around, add notes to it, or share it with another device/session.

## Goals

- Fix the Quick/Full button highlight so the active mode is visually obvious.
- Let the user save Quick and Full NPCs to `localStorage`.
- Let the user attach a free-text note to any NPC, editable at any time.
- Let the user view and remove saved NPCs, with an undo-until-refresh safety net.
- Let the user export the saved library to a JSON file and import a JSON file back in, merging with what's already saved.

## Non-goals

- No sync across devices/browsers — `localStorage` only.
- No automated tests (project convention: manual browser verification only).
- No editing of NPC stats/fields themselves after generation — only the note is editable.

## Active-button highlight

`btn-quick` and `btn-full` already use the `button` (filled) vs `button.secondary` (outlined) CSS classes to look "primary" vs "not primary." Track which mode was last clicked and toggle the `secondary` class between the two buttons so exactly one is filled at a time. No new CSS.

## Data model & storage (`js/npc-storage.js`)

New state module, following the existing pattern in `js/initiative-state.js` (in-memory state hydrated from `localStorage`, mutated via exported functions, persisted on every change, pub/sub for UI updates).

```js
STORAGE_KEY = 'cc-npc-library'

// Persisted shape:
{
  npcs: [
    {
      id,          // string, generated on save
      kind,        // 'quick' | 'full'
      data,        // the npc object as produced by npc-gen.js
      note,        // string, user-authored
      savedAt,     // timestamp
      deleted,     // bool, soft-delete flag
    },
    ...
  ]
}
```

**Purge-on-refresh semantics**: `load()` runs once, at module init (i.e. on page load/refresh). It drops any entry with `deleted: true` before hydrating in-memory state. Nothing else purges deleted entries — they remain visible (dimmed, with Undo) for the rest of the session until the user reloads the page.

### API

- `getAll()` — returns all entries, including soft-deleted ones (UI decides how to render each).
- `saveNpc({ kind, data, note })` — creates a new entry with a fresh id, persists, returns the id.
- `updateNpc(id, { data, note })` — updates an existing entry's data/note in place, persists.
- `removeNpc(id)` — sets `deleted: true` on the entry, persists immediately.
- `undoRemove(id)` — clears `deleted`, persists.
- `exportAll()` — returns a JSON string of all non-deleted entries.
- `importMerge(jsonString)` — parses an array of entries. For each, if an existing non-deleted entry has the same `kind` + deep-equal `data` + equal `note`, skip it; otherwise append it as a new entry with a freshly generated id (ignoring the imported `id`/`savedAt`).
- `subscribe(fn)` — same pub/sub pattern as `initiative-state.js`; returns an unsubscribe function.

Malformed/corrupt `localStorage` content or malformed import JSON is handled the same way `initiative-state.js` handles it: caught and treated as empty/no-op, never thrown to the UI.

## UI changes (`js/npc-gen.js`)

### Card controls

Both `renderQuickCard` and `renderFullCard` gain, alongside the existing Copy / Add to Initiative controls:

- **Notes textarea** — always present and editable, whether the card was just generated or loaded from the saved list. Typing updates a local variable immediately; if the card is already associated with a saved entry (has an id), input is also debounced (~500ms) into `updateNpc()` so edits persist live without an explicit save step.
- **Save button** — on first click for a freshly generated card, calls `saveNpc({ kind, data: npc, note })` and captures the returned id on the card's closure; the button then relabels (e.g. "Saved ✓") since further note edits already auto-persist via the textarea's debounce. If the card was opened from the saved list (already has an id), the button is not needed for notes, but remains available to explicitly commit if the underlying npc data ever needs re-saving.

### Saved NPCs section

A new section rendered below the generator output, on the same NPC tab (not a new top-level tab):

- Lists all non-deleted saved entries by **name only** (one row per entry).
- Each row has a **×** remove button. Clicking it calls `removeNpc(id)`; the row is replaced in place with a dimmed "Deleted — Undo" row. Clicking Undo calls `undoRemove(id)` and restores the normal row. No confirmation dialog.
- Clicking a name (not the × or Undo) re-renders that entry as a full card in the `#npc-output` area, via the existing `renderQuickCard`/`renderFullCard`, pre-populated with its saved `note` and wired to the entry's `id` so the notes textarea auto-persists and Save behaves as described above.
- **Export All** button — builds a Blob from `exportAll()` and triggers a download (e.g. `npc-library-<date>.json`).
- **Import** button — triggers a hidden `<input type="file" accept="application/json">`, reads the selected file's text, and calls `importMerge()`. Malformed files fail silently per the storage module's error handling (no crash, list re-renders showing whatever did merge).

The section re-renders whenever `npc-storage.js` notifies subscribers (save, remove, undo, import), keeping it in sync with the generator's Save actions.

## Error handling

- Corrupt/missing `localStorage` data: treated as an empty library (same pattern as `initiative-state.js`).
- Malformed import JSON (not valid JSON, or not an array of expected shape): import is a no-op; nothing is added, nothing crashes.
- Full/Quick data payloads are plain JSON-serializable objects already (no functions, no circular refs), so `JSON.stringify`/`parse` round-trips safely for both storage and export/import.

## Testing

Per project convention, no automated JS unit tests — manual verification in the browser:

- Toggle Quick/Full repeatedly, confirm exactly one button is highlighted at a time.
- Generate and save a Quick NPC and a Full NPC; confirm both show up in the Saved NPCs list.
- Edit notes on a freshly generated (unsaved) card, then Save — confirm the note persists.
- Edit notes on a loaded saved card — confirm it persists without clicking Save.
- Remove a saved NPC, click Undo before refreshing — confirm it's restored.
- Remove a saved NPC, refresh the page — confirm it's gone for good.
- Export the library, clear `localStorage`, import the exported file back — confirm the library is restored.
- Import a file containing some NPCs already in the library — confirm duplicates are skipped and new ones are added.

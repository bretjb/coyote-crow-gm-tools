# Full NPC Card: View/Edit Mode, Tooltips, and Table Redesign

## Context

The Full NPC card (`js/npc-gen.js`) currently renders every field — name, archetype, path, motivation, ability, age/gender/sexuality, stats, and skills — as a live `<input>` or `<select>` at all times. There is no read-only state. This is the "Card interaction/UX" group from the broader `features.md` NPC-tab work (grouped separately from data/content additions and PDF export, which get their own specs).

This spec covers:
- An explicit view/edit toggle on the Full NPC card
- Larger form fields while editing, for readability
- Hover/tap tooltips explaining stats, skills, and abilities
- A visual redesign of the stat/skill tables for stronger contrast and visual weight

Out of scope: Quick NPC card (no editable fields today, unaffected), PC tab (separate spec, will follow this pattern once settled), avatars/voice/quirks/tagging (separate "data & content" spec), PDF export (separate spec).

## Edit/Save Mode

Each rendered Full NPC card has a `mode` of `'view'` (default) or `'edit'`. This is transient UI state, held in the closure/state of the currently rendered card — not persisted to `localStorage`, not remembered across re-renders. Switching to a different NPC, or reloading, always starts back in `'view'` mode.

- **View mode**: all fields render as plain text/labels (e.g. "Archetype: Trickster"), not inputs or selects. This applies to name, archetype, path, motivation, ability, demographics, stats, and skills (including specializations).
- **Edit mode**: renders the current input/select-based fields exactly as they work today (dropdown + custom-value pattern, number inputs for stats/ranks, etc.), plus the enlarged-field styling below.
- **Toggle controls**: an "Edit" button in the card header switches to edit mode and re-renders the card body. A "Save" button switches back to view mode, re-renders, and persists via the existing `updateNpc`/`notify` flow in `npc-storage.js` (same persistence path already used for every field today — this only changes when re-render/persist is triggered, not how it's stored).
- **Exception — Current Body/Mind/Soul**: these number inputs (`currentCell`) remain live and editable in both view and edit mode, since damage is applied continuously during play and shouldn't require entering edit mode each time.

### Implementation shape

The existing field-builder functions (`statCell`, `readOnlyCell`, `generalSkillRow`, `buildAddSpecControl`, `buildSpecTable`, `buildSelectCustomField`, `buildNamedDescField`) each need a read-only rendering branch alongside their existing interactive one, selected by the card's current mode. `readOnlyCell` already does what a read-only branch needs to look like for derived stats (label + value) — the other builders extend that pattern for their own field type instead of introducing a new one.

## Larger Fields in Edit Mode

A CSS modifier class (e.g. `.card.is-editing`) scopes increased font-size and padding onto inputs/selects while a card is in edit mode. Applies on all devices, not just touch — this is a general readability fix, not a touch-target fix.

## Stat/Skill/Ability Tooltips

- New data file `data/stat-skill-glossary.json`: a flat list of `{ name, description }` entries for the 9 stats and 27 skills, hand-curated from the existing one-line descriptions already in `data/rules/quick-ref.md`'s Stats and Skills sections. This is a manual sync point (same maintenance model as every other `data/*.json` table in this app) — no runtime markdown parsing.
- Abilities need no new data — `data/abilities.json` entries already have a `description` field.
- A small reusable tooltip helper attaches to: each stat label in the stat table, each skill name in the general/specialized skill tables, and the ability name field. Trigger is hover on pointer-capable devices, tap on touch devices. Works identically in both view and edit mode.
- Follows the existing `esc()` escaping convention for any dynamic text inserted into the DOM.

## Table Visual Redesign

Read-only mode removes the density constraint that dense input cells currently impose, creating room to address the "tables feel indistinct" feedback: stronger borders, header shading, row spacing/contrast. The specific visual treatment (colors, spacing values) is deferred to implementation time, where the `frontend-design` skill will be invoked to make those calls against the app's existing design tokens in `css/style.css` — this spec establishes the requirement (visual weight/contrast, not layout/density) and scope (stat table, general skill table, specialized skill table), not the literal CSS.

## Testing

No JS unit test suite exists in this project (see architecture notes in `CLAUDE.md`). Verify by exercising the app in a browser per the project's standard workflow — generate a Full NPC, confirm view mode renders plain text, Edit reveals the current input/select controls at larger size, Save persists and returns to view mode, Current Body/Mind/Soul stay editable throughout, and tooltips appear on hover/tap for stats, skills, and abilities.

# PC Tab

## Context

New top-level tab for tracking player characters, mirroring the NPC tab's Full NPC card — stats, skills, view/edit mode, tooltips — but for PCs, whose numbers come from the actual player's finished character rather than random generation.

**Depends on Group B** (`docs/superpowers/specs/2026-08-16-full-npc-card-view-edit-design.md`) having landed, since this spec reuses its view/edit mode and tooltip infrastructure. As part of *this* work, the reusable card-building primitives currently private to `js/npc-gen.js` (stat table, skill table, tooltip wiring, read-only field helpers, `buildSelectCustomField`/`buildNamedDescField`) get extracted into a new shared module, `js/character-card.js`, imported by both `js/npc-gen.js` and the new `js/pc-gen.js` — this is a necessary refactor, not scope creep: without it, PC support means duplicating several hundred lines of stat/skill-table logic. `js/npc-tooltip.js` is renamed to `js/tooltip.js` at the same time, since it's already generic (no NPC-specific logic) and PCs depend on it too.

Out of scope, per explicit descoping during brainstorming: avatars, voice mechanics, quirks, tagging/search, and PDF export are **NPC-only** — PCs don't get those. View/edit mode and stat/skill tooltips **are** in scope (they read as core card UX, not "extras").

## Creation Flow

A "New PC" button (parallel to the NPC tab's "Quick NPC"/"Full NPC" buttons) creates a **blank card**, opened directly in edit mode, for the GM to fill in from the player's actual character sheet. No random generation — this is manual entry, not a generator.

## Field Behavior Differences from Full NPC

The Full NPC card's Archetype/Path controls apply automatic stat math (swapping a +1 stat bonus when you change the selection) and Ability/Gifts & Burdens are randomly rolled at generation. None of that fits a PC, whose stats are the player's real, already-finalized numbers — the GM shouldn't have the app silently nudge a stat by typing in a label. So on the PC card:

| Field | Full NPC behavior | PC behavior |
|---|---|---|
| Name | text input, has "Regenerate Name" | text input, no regenerate button |
| Age / Gender / Sexuality | dropdown of archetype-specific values + custom | plain free-text inputs (no archetype to source curated options from) |
| Archetype | dropdown; changing it swaps a +1 stat bonus and a free skill rank | dropdown (same options list, for typo-avoidance) + custom, via the existing mode-aware `buildSelectCustomField` helper — record-keeping only, no stat/skill side effects |
| Path | dropdown; changing it swaps stat bonuses | dropdown (same options list) + custom via `buildSelectCustomField` — record-keeping only, no stat side effects |
| Motivation | dropdown of named options + description, via `buildNamedDescField` | same — reused as-is |
| Ability | randomly selected at generation; dropdown + custom via `buildNamedDescField` | same rendering, but starts blank/custom (empty `{name: '', description: '', diceCheck: []}`) rather than randomly picked |
| Gifts & Burdens | randomly selected at generation, rendered as read-only joined text, no editor exists | a single free-text field (like a notes field) rather than the structured `{name, magnitude}` list NPCs use — GM types in the player's actual gifts/burdens as prose. (Building a structured picker was considered and explicitly descoped as unnecessary complexity for this spec.) |
| Stats | randomly allocated, editable via `statCell` | same `statCell`/`buildStatSection` (extracted into `character-card.js`), starting at the minimum (1) in every stat until the GM enters real values |
| Skills (general + specialized) | randomly allocated | same `generalSkillRow`/`buildSpecTable` (extracted into `character-card.js`), starting empty (rank 0 everywhere) until the GM enters real values |
| Derived stats / Current Body-Mind-Soul | computed via `calcDerivedStats`, `current` tracked same as NPC | identical — reuses `calcDerivedStats` from `npc-character-gen.js` unchanged, and the same always-editable Current-HP exception from Group B |
| View/edit mode toggle | Group B behavior | identical, reused via `character-card.js` |
| Stat/skill tooltips | Group B behavior, sourced from `data/stat-skill-glossary.json` | identical — same glossary file, same `tooltip.js` module |

## Data Model

New `js/pc-storage.js`, following the exact same pattern as `npc-storage.js` (module-level singleton state, `Set` of subscriber callbacks, `notify()` persisting to `localStorage` and calling subscribers, deep-copy `getAll()`/accessors, soft-delete + `undoRemove`, `exportAll()`/`importMerge()`), under its own `localStorage` key (`cc-pc-library`) so PCs and NPCs never collide. Entries have no `kind` field (NPCs distinguish `quick`/`full`; there's only one PC card shape):

```js
{ id, data, note, savedAt, deleted }
```

`data` shape:

```js
{
  name: '', age: '', gender: '', sexuality: '',
  archetype: '', // plain string, not tied to an archetype object
  path: { name: '' }, // plain string wrapper, matching npc.path's shape so shared rendering code doesn't need a branch
  motivation: { name: '', description: '' },
  giftsAndBurdens: '', // free text, not the NPC array-of-objects shape
  stats: { Strength: 1, Agility: 1, Endurance: 1, Intelligence: 1, Perception: 1, Wisdom: 1, Spirit: 1, Charisma: 1, Will: 1 },
  skills: {}, // same shape as npc.skills: { [skillName]: { general, specialized? } }
  ability: { name: '', description: '', diceCheck: [] },
  derived: calcDerivedStats(stats),
  current: { Body: derived.Body, Mind: derived.Mind, Soul: derived.Soul },
}
```

## UI Wiring

- New `<div id="tab-pc">` panel in `index.html`, new tab button in the tab bar.
- New `js/pc-gen.js`, exporting `init(container)`, registered in `js/app.js`'s `tabInits` map as `'pc'`.
- `js/pc-gen.js` mirrors `js/npc-gen.js`'s top-level structure: a "New PC" button, an output area for the currently-open card, a Saved PCs list section with the same Export All / Import / per-entry remove-with-undo controls as the NPC tab (reusing the same UX pattern, backed by `pc-storage.js` instead of `npc-storage.js`).
- `sw.js`: register `js/pc-gen.js`, `js/pc-storage.js`, `js/character-card.js`, and the renamed `js/tooltip.js` in `ASSETS`; bump `CACHE`.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser: open the new PC tab, click New PC, confirm a blank card opens in edit mode with all fields empty/at minimum, fill in a name/stats/skills/archetype/path/ability/gifts-burdens text, confirm Archetype/Path changes do *not* alter any stat, Save and confirm it persists and reopens correctly from the Saved PCs list, and confirm stat/skill tooltips and the view/edit toggle behave identically to a Full NPC card.

# Editable Full NPC Card

## Problem

Full NPC cards (`js/npc-gen.js`) are rendered once from a generated (or loaded) `npc` object and are read-only afterward. GMs need to hand-tune a generated NPC — rename it, adjust stats, swap its archetype/path/motivation/ability, change demographics, bump skill ranks, add a specialization, and track combat damage — without regenerating from scratch. The stat display also needs restructuring into a compact table, and the 28-row skill table needs splitting for readability.

This applies to **Full NPC cards only**. Quick NPC cards (name/role/personality/motivation sketch) are out of scope — no stats, no editing.

## Data model changes

`npc.current = { Body: n, Mind: n, Soul: n }` is a new field.

- Generated at creation time: initialized to the derived max (`npc.derived.Body/Mind/Soul`).
- **Old saved/imported NPCs** (saved before this feature, no `current` field): never migrated in storage. At render time, if `npc.current` is missing, treat current as equal to derived max for display and as the starting point for edits. Saving afterward persists whatever `npc.current` ends up being.
- Once the GM edits a Current value, it's independent of Max (see "Current vs Max sync" below).

Fields that can become **custom** values (Motivation, Path, Ability, Age, Gender, Sexuality) change shape when "Custom..." is chosen:
- Age/Gender/Sexuality: become a plain string (already the runtime shape — the data-driven versions are also plain strings picked from a weighted list, so there's no shape change here, just a free-text source instead of a dropdown pick).
- Motivation/Ability: become `{ name: <text>, description: '' }` — matches the fields the renderer/`npcToText` actually reads (`.name`, `.description` for Motivation; `.name`, `.description`, `.diceCheck` for Ability — custom Ability gets `diceCheck: []`, meaning its dice-check note renders empty).
- Path: becomes `{ name: <text>, statBonuses: [] }` — custom path grants no automatic stat bonus (the GM can hand-edit stats directly if they want one).
- Archetype is **not** freely custom-textable — it stays a dropdown strictly over the existing `archetypes.json` list, because swapping it drives the stat-bonus/free-skill re-roll logic below and a free-text archetype has no mechanical meaning to re-roll against.

## Recalculation logic

New pure helpers added to `npc-character-gen.js` (co-located with the existing `calcDerivedStats`, `allocateStats`, etc.):

```js
export function clampStat(v)                       // 1..5
export function clampSkillRank(v)                   // 0..6
export function clampSpecRank(v, generalRank)        // 0..max(0, generalRank - 1)
```

`calcDerivedStats` is reused unchanged.

**Base stat edit**: write the clamped value into `npc.stats[STAT]`, recompute `npc.derived = calcDerivedStats(npc.stats)`, re-render the derived-stat cells and rebuild both skill tables (pool totals depend on stats). Apply the Current-vs-Max sync rule for whichever of Body/Mind/Soul changed.

**Current vs Max sync rule** (applies whenever a stat/archetype/path edit changes a derived max): if the *old* Current value equalled the *old* Max, Current follows the new Max (still "unhurt/undamaged"). If Current was already lower than Max (GM had tracked damage), it's left untouched.

**Skill general-rank edit**: clamp 0-6. If the skill has no entry yet and rank > 0, create `npc.skills[name] = { general: rank }`. If rank drops to 0 and there's no specialization, delete the entry. Re-render that row's pool. If a specialization exists on that skill, re-clamp its rank against the new general (spec rank ceiling is `general - 1`) and re-render that row too.

**Specialization rank edit**: clamp against `general - 1` for that skill. Writes to `npc.skills[name].specialized.rank`.

**Add specialization** (general rank ≥ 2, no existing specialization): inline control on the general-skill row shows a dropdown of `skillDef.specialized` names + a rank input (1..general-1); confirming sets `npc.skills[name].specialized = { name, rank }` and the skill moves into the Specialized Skills table on next render. Skills with an empty `specialized` list in the data (no valid options) never show this control.

**Archetype change**: given `newArchetype` selected from `archetypes.json`:
1. `npc.stats[npc.archetypeStatBonus] = clampStat(npc.stats[npc.archetypeStatBonus] - 1)`
2. `npc.archetypeStatBonus = newArchetype.statBonus`
3. `npc.stats[npc.archetypeStatBonus] = clampStat(npc.stats[npc.archetypeStatBonus] + 1)`
4. Recompute derived, apply Current-vs-Max sync.
5. Free skill re-roll: decrement old `npc.freeSkill`'s general rank by 1 (delete entry if it hits 0 and has no spec), pick `newFreeSkill = pick(newArchetype.freeSkillOptions)`, increment its general rank by 1 (create entry if needed, clamp to 6), set `npc.freeSkill = newFreeSkill`.
6. `npc.archetype = newArchetype.name`.
7. Age/Gender/Sexuality dropdowns re-populate their option lists from `newArchetype.demographics`, but the currently-selected value is left as-is (demographics are flavor, not mechanically tied to archetype) unless the GM changes them afterward.

**Path change**: given `newPath` selected from `paths.json`:
1. For each stat in `npc.path.statBonuses`: `npc.stats[stat] = clampStat(npc.stats[stat] - 1)`.
2. For each stat in `newPath.statBonuses`: `npc.stats[stat] = clampStat(npc.stats[stat] + 1)`.
3. Recompute derived, apply Current-vs-Max sync.
4. `npc.path = newPath`.

Both archetype and path swaps rebuild the full card body (stat table + both skill tables + header meta line) after mutation, since so much depends on them; simpler than fine-grained patching and generation-time cost is negligible.

## UI structure

**Stat table** — single `<table class="stat-table">`, 3 rows × 6 cols, matching the approved layout:

| STR | AGI | END | PD | Body | Body (Current) |
|-----|-----|-----|----|----|-----------------|
| INT | PER | WIS | MD | Mind | Mind (Current) |
| SPI | CHA | WILL | SD | Soul | Soul (Current) |

Each cell is label-over-value. STR/AGI/END/INT/PER/WIS/SPI/CHA/WILL and the three Current cells are `<input type="number">`. PD/MD/SD/Body/Mind/Soul are read-only derived text.

**Skill tables** — two `<table class="skill-table">` elements in a flex wrapper with no gap between them: left = Art→Investigation, right = Knowledge→Unarmed Combat (both halves of the existing alphabetical `allSkills` list, split at the midpoint). Each keeps its own `overflow-x: auto` scroll wrapper for narrow screens; the pair stacks vertically below the existing mobile breakpoint (matching how other flex-wrap groups in this app behave) since flex-wrap main-axis space runs out before the wrapper's `overflow-x` kicks in.

General-skill rows gain a rank `<input type="number" min=0 max=6>` in place of the static rank text. Rows for skills with `general >= 2`, a non-empty `specialized` option list, and no current specialization show a compact "+ spec" control (a `<select>` of names + rank input + confirm) inline.

Specialized-skill rows gain a rank `<input type="number">` clamped to `0..general-1`.

**Dropdown + custom fields** (Motivation, Path, Archetype, Ability, Age, Gender, Sexuality): each renders as a `<select>` populated from the relevant data list plus a trailing "Custom..." option. Selecting "Custom..." reveals a text `<input>` (toggled via `.hidden`, consistent with existing show/hide conventions in this file) that becomes the field's value on input. Archetype has no "Custom..." entry (see Data model changes).

**Name**: existing text stays as an `<input>` pre-filled with `npc.name`, always editable directly, plus a "Regenerate Name" button that overwrites the input's value by calling `generateName(nameData)`.

## Persistence

Explicit-save only, matching current behavior — edits mutate the in-memory `npc` object (already what `appendSaveControls` closes over), and are only written to `localStorage` when the GM clicks the existing Save button. No new autosave path.

## Non-goals

- No editing on Quick NPC cards.
- No point-buy budget/cost enforcement on edits — only range clamping (stat 1-5, skill rank 0-6, spec rank ≤ general-1).
- No UI for removing an existing specialization once added (only rank edits and one-time addition).
- No retroactive stat-bonus math for Motivation/Ability/Gifts&Burdens swaps — those fields carry no mechanical stat bonus today, so swapping them is metadata-only.

## Testing

No JS unit test suite exists in this project (manual browser verification only, per project convention). Verification plan: serve locally, generate a Full NPC, and manually exercise each editable field — confirm derived stats/skill pools update live, confirm clamping at range boundaries, confirm archetype/path swap adjusts stats and free skill correctly, confirm Current-vs-Max sync behavior in both the "untouched" and "already damaged" cases, confirm add-specialization flow, confirm Save persists edits and reload reflects them, confirm an old saved NPC without `current` renders with Current = Max. Unregister/clear the service worker between reloads per this repo's caching caveat.

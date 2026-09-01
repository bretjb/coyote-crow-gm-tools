# PC Guided Creation Wizard

## Context

`js/pc-gen.js` (PC tab) already provides a free-form PC editor — a "New PC" button opens a blank card in edit mode, and the player/GM types in every field including stats and skills with no validation against Coyote & Crow's point-buy rules. This spec adds a second, guided path: a step-by-step wizard that walks a new player through Archetype → Path → Gifts/Burdens → Stats → Skills, enforcing the actual character-creation math from `docs/game/character.md`, then hands off a pre-filled draft into the existing card editor to finish (name, motivation, ability) and save.

No new math is being invented — `js/npc-character-gen.js` already implements the point-buy tables (`STAT_COSTS = [0,3,6,10,15]`, `SKILL_COSTS = [0,1,3,6,10,15,21]`, `calcDerivedStats`) matching character.md exactly; this wizard is new UI and validation state built on top of existing constants and existing storage (`pc-storage.js`), reused unchanged.

## Goals / Non-Goals

**In scope:** archetype selection, path selection, gifts/burdens entry with point math, stat point-buy, skill point-buy (general ranks + specializations), a collapsed/accordion summary of completed steps, handoff into the existing PC card editor.

**Out of scope:** name/age/gender/sexuality, motivation, ability selection — these stay in the existing card editor, unchanged, filled in after the wizard finishes. No new storage format. No changes to the free-form "New PC" flow, which remains available alongside the wizard.

## Entry Point

`js/pc-gen.js`'s toolbar gets a second button, "Guided Creation", next to the existing "New PC". Clicking it mounts the wizard into `#pc-output` (same slot "New PC" uses for the blank card), replacing whatever was there.

## Wizard State

New file `js/pc-wizard.js`, exporting `init(container, ctx, onFinish)`, where `ctx` is the same `{ motivations, paths, allSkills, abilities, archetypes, glossary }` object `pc-gen.js` already builds from its `Promise.all` data load, and `onFinish(pc)` is called once with a finished draft PC object (see "Handoff" below).

Wizard state is a single plain object, held in a closure and mutated in place (same "rebuild the subtree on change" pattern already used throughout `pc-gen.js`/`npc-gen.js` — no new state library):

```js
{
  step: 0,                 // 0-4, which step is currently expanded
  archetype: '',           // name from archetypes.json, or ''
  path: '',                // name from paths.json, or ''
  giftsAndBurdens: '',     // free text, same field the existing card uses
  gbEntries: [],           // [{ magnitude: -3..-1 | 1..3 }], point math only
  gbApplyTo: 'stats',       // 'stats' | 'skills'
  stats: {                 // purchased base values, 1 = unspent floor
    Strength: 1, Agility: 1, Endurance: 1, Intelligence: 1,
    Perception: 1, Wisdom: 1, Spirit: 1, Charisma: 1, Will: 1,
  },
  skills: {},               // { [skillName]: { general, specialized? } }, same shape pc.skills already uses
  archetypeFreeSkill: '',   // which of archetype.freeSkillOptions got the free +1 rank
}
```

Two constants currently private to `js/npc-character-gen.js` — `STAT_COSTS` and `SKILL_COSTS` — get exported from that file so the wizard imports the real cost tables instead of duplicating them; this keeps the point-buy math defined in exactly one place.

## Step 1 — Archetype

A single-select grid of cards, one per `archetypes.json` entry: name + one-line description. Selecting one sets `state.archetype` and determines two free bonuses applied later, at no point cost:

- `+1` to `archetype.statBonus` (applied in the Stats step)
- a free `+1` general rank to one skill from `archetype.freeSkillOptions` (chosen in the Skills step)

## Step 2 — Path

Same card-grid pattern, sourced from `paths.json`. Selecting a path sets `state.path` and grants free `+1`s to both of `path.statBonuses` (applied in the Stats step, alongside the archetype bonus — a stat can receive bonuses from both archetype and path simultaneously).

## Step 3 — Gifts/Burdens

A free-text field (same `giftsAndBurdens` string the existing card already stores) plus a way to record magnitudes for point math: each time the player adds an entry, they pick a magnitude button from `+1 +2 +3 −1 −2 −3` (no `0`, per game rules — every Gift/Burden has a nonzero level) which pushes `{ magnitude }` onto `state.gbEntries`. The step shows:

```
points remaining = 5
  - sum of positive magnitudes (Gifts cost 1 point per level)
  + sum of |negative magnitudes| (Burdens grant 1 point per level)
```

The only hard gate on this step: **remaining must be ≥ 0** to advance — matches character.md's "you must have at minimum zero points remaining... cannot have negative points at the end of this step." There's no requirement to spend anything; 0 gifts/burdens is valid (remaining stays 5, all 5 are simply lost — "unspent points are lost," per the rulebook).

A `gbApplyTo` dropdown (`Stats` / `Skills`) next to the total controls which pool absorbs leftover positive `remaining` points. This dropdown stays visible and editable for the rest of the wizard (collapsed-summary line included), and changing it live-recomputes whichever of the Stats/Skills steps is affected.

Gift/Burden *mechanical effects* (what a specific Notoriety level actually does in play) aren't modeled anywhere in this codebase today — the existing card stores `giftsAndBurdens` as free text for the GM to read. The wizard does the same; `gbEntries` exists purely to compute the point total, and is discarded (not persisted) once the wizard hands off — only the text and the resulting point transfer matter downstream.

## Step 4 — Stats

A 3×3 grid of stat cards (Strength/Agility/Endurance/Intelligence/Perception/Wisdom/Spirit/Charisma/Will), styled as cards rather than the existing card's table rows (this is a selection UI, not a record display). Each cell shows:

- **Displayed value** = `state.stats[name]` (purchased, starts at 1) + `1` if `name === archetype.statBonus` + `1` if `name` is in `path.statBonuses`.
- `−`/`+` steppers that only move the **purchased** value; bonuses are computed and shown but never directly edited.
- Floor: purchased value can never go below `1` (the `−` button disables at that floor) — this is the "can never go below starting value" rule, correctly keyed to the purchased scale rather than the bonus-inflated displayed number.
- Cost of the next `+`: `STAT_COSTS[purchased] - STAT_COSTS[purchased - 1]` (1-indexed against the existing table — `STAT_COSTS[0]=0` for value 1, `STAT_COSTS[1]=3` for value 2, etc.), same table `allocateStats` in `npc-character-gen.js` already uses. The `+` disables once its cost would exceed points remaining, and purchased value can't exceed 5 (existing `clampStat` ceiling).

A header shows **Stat points remaining**: `42 + (gbApplyTo === 'stats' ? leftoverGB : 0) − totalSpent`, recomputed on every stepper click and on `gbApplyTo` changes.

## Step 5 — Skills

Two side-by-side tables, mirroring `buildGeneralSkillTable`'s layout (skill name / stat / rank / total) but with `−`/`+` steppers instead of a free-typed number input. A header shows **Skill points remaining**: `42 + (gbApplyTo === 'skills' ? leftoverGB : 0) − totalSpent`, using `SKILL_COSTS` the same way `allocateSkills` already does.

- A dropdown at the top lists `archetype.freeSkillOptions`; the selected skill gets a free `+1` general rank (`state.archetypeFreeSkill`), shown as that skill's floor (stepper `−` disables at 1 instead of 0 for that one skill) and costs nothing.
- Ranks cap at 6 (existing `clampSkillRank` ceiling), each `+` costing `SKILL_COSTS[rank+1] - SKILL_COSTS[rank]`.
- Once a skill's general rank reaches 2+, an expandable row offers its `specialized` options (from `skills.json`) with its own `−`/`+` stepper, capped at `general − 1` (existing `clampSpecRank` rule), costing from the same `SKILL_COSTS` table.

## Collapsed Summary (Accordion)

As each step is completed, it collapses into a single summary line stacked above the active step, e.g.:

```
Archetype: Warrior (+1 Strength, free skill: Melee Weapons)
Path: Path of the Buffalo (+1 Strength, +1 Will)
Gifts/Burdens: 2 entries, 1 pt remaining → Stats
```

Clicking a collapsed line re-expands it in place and re-collapses every step after it — changing an upstream choice (e.g. swapping Archetype) immediately recomputes downstream bonuses live, since `state` is the single source of truth and every step step re-renders from it, not from a snapshot.

## Handoff

Once Archetype and Path are both selected and the Gifts/Burdens step is non-negative, a "Finish" button becomes available (Stats/Skills have no forced-completion gate — a player can finish with unspent points, which are simply lost, matching the rulebook). Clicking it builds a `pc` object shaped exactly like `pc-gen.js`'s `blankPc()` output:

- `stats`: displayed values (purchased + archetype/path bonuses)
- `skills`: `state.skills`, already in the `{ general, specialized? }` shape the card expects, with the archetype free rank folded in
- `archetype`: `state.archetype`
- `path`: `{ name: state.path }`
- `giftsAndBurdens`: `state.giftsAndBurdens` (text only — `gbEntries` is discarded)
- `derived` / `current`: computed via the existing unchanged `calcDerivedStats`
- `name`, `age`, `gender`, `sexuality`, `motivation`, `ability`: blank, same defaults as `blankPc()`

`onFinish(pc)` is called with this object; `pc-gen.js` mounts it via the existing `renderPcCard(pc, ctx, undefined, 'edit')` — identical to what "New PC" already does, just pre-filled. No new persistence code: the draft isn't saved until the player uses the existing Save button on the card.

## Edge Cases

- **Switching Archetype/Path after Stats are partly spent:** only the *bonus* stat(s) change; purchased values and their cost are untouched, so `totalSpent` stays correct even though displayed values shift immediately.
- **Switching `gbApplyTo` after the *other* pool has already spent into the leftover:** if this would drive that pool's remaining negative, purchased values in that pool are reduced (highest-cost stepper first) until remaining is ≥ 0 again — the same defensive "reconstruct valid state" approach `npc-storage.js`/`initiative-state.js` already use for untrusted persisted state, applied here to a live invariant instead.
- No new data fetches: `archetypes.json`, `paths.json`, `skills.json` are already loaded by `pc-gen.js`'s `init()` and passed through as `ctx`.

## UI Wiring

- New `js/pc-wizard.js`, registered in `sw.js`'s `ASSETS` array (`CACHE` version bumped).
- `js/pc-gen.js`: add "Guided Creation" button next to "New PC"; on click, `import('./pc-wizard.js')`-style static import at module top (consistent with existing module imports, not lazy), call `init(output, ctx, pc => { output.innerHTML = ''; output.appendChild(renderPcCard(pc, ctx, undefined, 'edit')); })`.
- Styling additions to `css/style.css` only (repo convention — no inline styles): archetype/path card-grid, stepper buttons (reusing `.secondary` styling), points-remaining badge (extending `.text-muted-sm`-style treatment), collapsed-summary accordion rows. Implemented using the frontend-design skill to keep it consistent with the app's existing card/table visual language rather than generic wizard chrome.

## Testing

No JS unit test suite exists in this project (established convention — see memory). Verify manually in-browser: click through each archetype and path and confirm bonuses land on the right stats/skill options; enter gifts and burdens and confirm the zero-floor gate blocks "Next" only when negative; spend stat and skill points up to and past the cap, confirming steppers disable correctly at both the purchase floor and the budget ceiling; toggle `gbApplyTo` mid-flow after spending into both pools and confirm the defensive clamp keeps both pools non-negative; re-expand a collapsed step and change it, confirming downstream bonuses recompute; Finish and confirm the resulting card opens in edit mode with correct stats, skills, and derived values, and saves/reopens correctly from the Saved PCs list.

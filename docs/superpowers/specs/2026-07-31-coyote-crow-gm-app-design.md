# Coyote and Crow GM Companion App — Design Spec

**Date:** 2026-07-31

## Overview

An offline-first PWA to help run sessions of the Coyote and Crow TTRPG. Built with vanilla JS and no framework. Five features: Name Generator, NPC Generator, Initiative Tracker, Dice Roller, and Rule Summary. All content is session-only; nothing persists between sessions.

## File Structure

```
coyote-crow/
├── index.html                  # Shell: tab nav, loads modules
├── manifest.json               # PWA manifest (name, icons, theme color)
├── sw.js                       # Service worker: cache-first for all assets
├── css/
│   └── style.css
├── js/
│   ├── app.js                  # Tab routing, shared init
│   ├── name-gen.js             # Name generator feature
│   ├── npc-gen.js              # NPC generator feature
│   ├── npc-character-gen.js    # Full character generation logic
│   ├── initiative.js           # Initiative tracker feature
│   ├── dice-roller.js          # Dice roller feature
│   ├── rules.js                # Rules display feature
│   ├── dice.js                 # Shared dice roll utility (pool of d12s, count successes)
│   └── lib/
│       └── md.js               # Bundled lightweight markdown parser
└── data/
    ├── names.json              # Curated C&C name lists + syllable bank
    ├── npc-components.json     # Quick NPC building blocks
    ├── archetypes.json         # Archetype definitions with stat/skill/ability weights
    ├── motivations.json        # Pre-defined motivation list
    ├── paths.json              # Pre-defined path list
    ├── gifts-burdens.json      # Pre-defined gifts and burdens list
    ├── skills.json             # General and specialized skill definitions
    ├── abilities.json          # Ability definitions (tied to stats)
    └── rules/
        ├── quick-ref.md        # Core mechanics quick reference
        └── full-digest.md      # Full rules digest
```

## Architecture

Each JS module exports a single `init(container)` function. `app.js` handles tab switching and calls the appropriate `init()` with a `<div>` container when a tab is activated. Modules are self-contained with no shared state.

JSON data files are fetched once on module init and held in memory for the session. No writes back to JSON — all session state lives in JS variables. `npc-gen.js` and `npc-character-gen.js` both import the name generation *function* from `name-gen.js` (not any session state). `dice-roller.js` and `npc-gen.js` both import the roll utility from `dice.js`.

## Features

### Name Generator

- "Generate Name" button draws randomly from curated lists in `names.json`, organized by nation/group.
- When the curated list is exhausted, falls back to syllable-combination from a syllable bank in the same file.
- Displays the result with a "Copy" button.
- Shows a history of the last 5 generated names for the session.

### NPC Generator

Two modes: **Quick NPC** and **Full NPC**.

#### Quick NPC

One button generates a quick NPC sketch:
- Name (via name generator)
- Role/occupation
- Personality trait
- Motivation

All fields drawn randomly from `npc-components.json`. Result displays in a card with a "Copy" button.

#### Full NPC (Character Generation)

Generates a mechanically complete NPC by following the C&C character creation pipeline in order. All steps are resolved automatically using archetype-weighted randomization to ensure the result is internally coherent.

**Pipeline steps:**

1. **Motivation** — random pick from `motivations.json`

2. **Archetype** — random pick from `archetypes.json`. The chosen archetype carries a stat priority list and preferred skill list that *bias* (not restrict) subsequent random choices. Any NPC can end up with any stat distribution or skill; the archetype just makes certain outcomes more likely.

3. **Demographic** — weighted random picks:
   - Age, Gender, Sexuality each drawn from weighted option tables in `archetypes.json` (e.g., 33% Young, 50% Adult, 17% Elder)

4. **Path** — random pick from `paths.json`

5. **Gifts and Burdens** — each drawn from `gifts-burdens.json`:
   - Magnitude weighted toward ±1 (most common), with ±2 and ±3 rare; 0 (none) is a valid outcome
   - Positive values are Gifts, negative values are Burdens

6. **Stats** — 9 stats: Strength, Agility, Endurance, Intelligence, Perception, Wisdom, Spirit, Charisma, Will
   - 42 points to allocate using the following cost table:

   | Stat value | Point cost |
   |-----------|------------|
   | 1         | 0          |
   | 2         | 3          |
   | 3         | 6          |
   | 4         | 10         |
   | 5         | 15         |

   - All 9 stats are available to every NPC. Allocation is random but archetype-weighted: the archetype's priority stats receive more points on average. All 9 stats start at 1 (0 cost). Remaining points are distributed randomly with weight skewed toward priority stats until the 42-point budget is spent.

7. **Skills** — 42 points to spend from `skills.json`. Skills have general ranks and optional specialized ranks.

   | General rank | General cost | Specialized rank | Specialized cost |
   |-------------|-------------|-----------------|-----------------|
   | 1           | 1           | —               | cannot buy      |
   | 2           | 3           | 1               | 1               |
   | 3           | 6           | 2               | 3               |
   | 4           | 10          | 3               | 6               |
   | 5           | 15          | 4               | 10              |
   | 6           | 21          | 5               | 15              |

   - Specialized skill rank must always be higher than the associated general skill rank.
   - All skills are available to every NPC. Skills are selected from the full list in `skills.json`, weighted so the archetype's preferred skills are purchased first. Points are spent greedily until the 42-point budget is exhausted.

8. **Ability** — one ability selected from all abilities in `abilities.json`, weighted toward those whose `diceCheck` stats overlap with the archetype's stat priorities. Any ability can be selected; the weighting just makes thematically fitting abilities more likely.

9. **Derived stats** — calculated automatically from final stat values:

   | Derived stat     | Formula                              |
   |-----------------|--------------------------------------|
   | Initiative       | Agility + Perception + Charisma      |
   | Physical Defence | Agility + Endurance                  |
   | Mental Defence   | Perception + Wisdom                  |
   | Mystical Defence | Charisma + Will                      |
   | Body             | Strength + Agility + Endurance       |
   | Mind             | Intelligence + Perception + Wisdom   |
   | Soul             | Spirit + Charisma + Will             |

Result displays as a full character sheet card with a "Copy" button. Each skill on the card is a clickable button: clicking it sums the skill's `diceCheck` stat values from the NPC's generated stat block to determine the dice pool size, then triggers a roll using the shared dice roller logic and displays the result inline below the skill.

### Dice Roller

A standalone tab for ad-hoc rolls.

- Number input: how many d12s to roll (minimum 1)
- Target number input: the success threshold (default 8, editable)
- "Roll" button: rolls the pool, displays each die result as an individual die face, highlights dice that meet or exceed the target in a success color
- Shows a summary: e.g., "3 successes out of 5 dice"
- "Clear" button: resets the display
- The core roll logic lives in a shared utility function imported by both `dice-roller.js` and `npc-gen.js` so NPC skill rolls and standalone rolls use identical behavior

### Initiative Tracker

- Form to add a combatant: name field + initiative score field + "Add" button.
- List auto-sorts descending by score.
- "Active" highlight marks the current turn; "Next Turn" button steps through the order.
- "Clear All" button resets the encounter.
- Session-only — resets on page reload.

### Rule Summary

- Two sub-tabs: "Quick Ref" and "Full Digest".
- Each loads its respective `.md` file from `data/rules/`, renders it as HTML using `js/lib/md.js` (a bundled single-file markdown parser with no CDN dependency), and displays it read-only.
- Content is maintained by editing the markdown files directly.

## PWA & Offline

- Service worker uses cache-first strategy: pre-caches all assets on install (HTML, CSS, JS, JSON, markdown files).
- On fetch, serves from cache; falls back to network only if asset is not cached.
- App is fully functional offline after any single online load.
- `manifest.json` provides app name, theme color, and icons for install on mobile and desktop.

## Error Handling

- If a JSON or markdown fetch fails before the cache is populated: display "Data unavailable — please reload while online once to enable offline use."
- If curated name lists are empty: fall back to procedural generation silently, no user-visible error.
- No other realistic failure modes in a static local app.

## Data File Structures

### `names.json`
```json
{
  "lists": { "nation-name": ["Name1", "Name2"] },
  "syllables": { "prefix": [], "middle": [], "suffix": [] }
}
```

### `npc-components.json` (Quick NPC only)
```json
{
  "roles": [],
  "personalities": [],
  "motivations": []
}
```

### `archetypes.json`
```json
[
  {
    "name": "Warrior",
    "statPriorities": ["Strength", "Agility", "Endurance"],
    "preferredSkills": ["Melee Combat", "Athletics", "Intimidation"],
    "demographics": {
      "age": [
        { "value": "Young", "weight": 33 },
        { "value": "Adult", "weight": 50 },
        { "value": "Elder", "weight": 17 }
      ],
      "gender": [],
      "sexuality": []
    }
  }
]
```

`statPriorities` and `preferredSkills` are weighting hints only — any stat or skill can appear on any NPC. The generator gives preferred items higher selection probability but draws from the full lists in `skills.json` and the 9 core stats.

### `skills.json`
```json
[
  {
    "name": "Tracking",
    "diceCheck": ["Perception", "Wisdom"],
    "specialized": ["Urban Tracking", "Wilderness Tracking"]
  }
]
```

### `abilities.json`
```json
[
  {
    "id": "ability-id-1",
    "name": "Ancestor's Storm",
    "diceCheck": ["Spirit", "Charisma"],
    "description": "..."
  }
]
```

### `gifts-burdens.json`
```json
[
  { "name": "Fleet-Footed", "magnitude": 1, "description": "..." },
  { "name": "Slow Reflexes", "magnitude": -1, "description": "..." }
]
```

## Testing

Manual verification:
1. Load in browser — all four tabs render correctly.
2. Quick NPC generates a coherent one-card sketch.
3. Full NPC generates a valid character: stat costs sum to ≤42, skill costs sum to ≤42, specialized ranks exceed general ranks, derived stats match formulas.
4. Initiative tracker sorts correctly and steps through turns.
5. Dice Roller: rolling N dice shows N individual results, successes (≥ target) are highlighted, summary count is correct, Clear resets display.
6. Full NPC skill click: rolls correct pool size (sum of linked stats), result appears inline.
7. Rule Summary renders both sub-tabs from markdown.
8. Install as PWA from browser.
9. Disconnect network — verify all features still work offline.

# Coyote and Crow GM Companion App — Design Spec

**Date:** 2026-07-31

## Overview

An offline-first PWA to help run sessions of the Coyote and Crow TTRPG. Built with vanilla JS and no framework. Four features: Name Generator, NPC Generator, Initiative Tracker, and Rule Summary. All content is session-only; nothing persists between sessions.

## File Structure

```
coyote-crow/
├── index.html              # Shell: tab nav, loads modules
├── manifest.json           # PWA manifest (name, icons, theme color)
├── sw.js                   # Service worker: cache-first for all assets
├── css/
│   └── style.css
├── js/
│   ├── app.js              # Tab routing, shared init
│   ├── name-gen.js         # Name generator feature
│   ├── npc-gen.js          # NPC generator feature
│   ├── initiative.js       # Initiative tracker feature
│   └── rules.js            # Rules display feature
└── data/
    ├── names.json          # Curated C&C name lists + syllable bank
    ├── npc-components.json # Roles, personalities, motivations, stat ranges
    └── rules/
        ├── quick-ref.md    # Core mechanics quick reference
        └── full-digest.md  # Full rules digest
```

## Architecture

Each JS module exports a single `init(container)` function. `app.js` handles tab switching and calls the appropriate `init()` with a `<div>` container when a tab is activated. Modules are self-contained with no shared state.

JSON data files are fetched once on module init and held in memory for the session. No writes back to JSON — all session state lives in JS variables. Modules share no runtime state; `npc-gen.js` imports the name generation *function* from `name-gen.js` directly (not any session state).

## Features

### Name Generator

- "Generate Name" button draws randomly from curated lists in `names.json`, organized by nation/group.
- When the curated list is exhausted, falls back to syllable-combination from a syllable bank in the same file.
- Displays the result with a "Copy" button.
- Shows a history of the last 5 generated names for the session.

### NPC Generator

- Two buttons: "Quick NPC" and "Full NPC".
- Both use the name generator internally to produce a name.
- **Quick NPC:** name + role/occupation + personality trait + motivation — all drawn randomly from `npc-components.json`.
- **Full NPC:** everything in Quick, plus game stats (skills, attributes) drawn from stat ranges in `npc-components.json`.
- Result displays in a card with a "Copy" button.

### Initiative Tracker

- Form to add a combatant: name field + initiative score field + "Add" button.
- List auto-sorts descending by score.
- "Active" highlight marks the current turn; "Next Turn" button steps through the order.
- "Clear All" button resets the encounter.
- Session-only — resets on page reload.

### Rule Summary

- Two sub-tabs: "Quick Ref" and "Full Digest".
- Each loads its respective `.md` file from `data/rules/`, renders it as HTML using a bundled lightweight markdown parser (`js/lib/md.js` — a small single-file parser with no CDN dependency), and displays it read-only.
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

## Data Files

### `names.json` structure
```json
{
  "lists": {
    "nation-name": ["Name1", "Name2", "..."]
  },
  "syllables": {
    "prefix": ["..."],
    "middle": ["..."],
    "suffix": ["..."]
  }
}
```

### `npc-components.json` structure
```json
{
  "roles": ["..."],
  "personalities": ["..."],
  "motivations": ["..."],
  "stats": {
    "skills": { "min": 1, "max": 5 },
    "attributes": { "min": 1, "max": 5 }
  }
}
```

## Testing

Manual verification:
1. Load in browser — all four tabs render correctly.
2. Each feature works as expected with generated data.
3. Install as PWA from browser.
4. Disconnect network — verify all features still work offline.

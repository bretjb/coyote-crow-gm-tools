# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline-first PWA that helps a GM run tabletop sessions of the Coyote & Crow TTRPG on a laptop or phone: name generator, NPC generator (quick sketch + full mechanical character), dice roller, initiative tracker, and a Rules tab (Quick Reference / Full Rules toggle).

Vanilla JS, no framework, no build step, no bundler, no `package.json`. Everything runs as static files loaded directly by the browser via ES module `<script type="module">`.

## Running locally

There is no dev server or build command baked into the repo. Serve the directory with any static file server and open it, e.g.:

```bash
python3 -m http.server 8934
```

Then visit `http://localhost:8934`. No install step, no lint command, no test suite exists in this project — verify changes by exercising the app in a browser (see the "Service worker caching" note below, since a stale cache can hide your changes).

## Architecture

**Tab shell**: `index.html` declares the tab nav and one empty `<div id="tab-*">` panel per tab. `js/app.js` maps each `data-tab` name to a module's `init(container)` function (`tabInits` in `js/app.js`), lazily calling `init()` the first time a tab is activated and caching that it ran in an `initialized` Set. Each feature module owns its panel's entire DOM — it renders its UI via `innerHTML` template strings and wires up its own event listeners. Modules don't share DOM or state with each other, except via the shared stores described below.

**Feature modules** (`js/*.js`, each exports `init(container)`):
- `name-gen.js` — Markov-chain name generator built from a corpus in `data/names.json`; also exports `loadNameData()`/`generateName()`, which `npc-gen.js` imports directly (not through any shared session state — just the pure generation functions).
- `npc-gen.js` (largest module) — Quick NPC (random sketch from `data/npc-components.json`) and Full NPC (mechanical character via `npc-character-gen.js`, following the C&C character-creation pipeline: motivation → archetype-weighted stats/skills → path → gifts/burdens → ability). Full NPC cards render an interactive skill table (click a row to roll that skill) and "Add to Initiative" / save-to-library controls.
- `npc-character-gen.js` — the character-creation math (stat allocation, skill allocation, derived stats) used by `npc-gen.js`.
- `npc-storage.js` — persistence layer for the saved-NPC library (see "Session stores" below).
- `dice-roller.js` / `dice.js` — `dice.js` is the shared dice-pool utility (`rollDice`, `countSuccesses`) used by both the standalone Dice tab and the NPC skill-roll feature.
- `initiative.js` — 12-slot initiative tracker with pointer-based drag-and-drop to reorder combatants between slots; state lives in `initiative-state.js`.
- `initiative-state.js` — persistence layer for initiative state (see "Session stores" below).
- `rules.js` — merged Rules tab: mounts Quick Reference (split into sections by `## ` headings in `data/rules/quick-ref.md`) by default, and lazily fetches/parses `data/rules/full-digest.md` only on first switch to Full Rules, caching the parsed HTML in a closure so re-toggling doesn't re-fetch.
- `lib/load-marked.js` / `lib/md.js` — lazy-loads the bundled markdown parser (`window.marked`) on first use by the Rules tab.

**Session stores** (`npc-storage.js`, `initiative-state.js`): both follow the same pattern — module-level singleton state, a `Set` of subscriber callbacks (`subscribe(fn)`), a `notify()` that persists to `localStorage` and calls every subscriber, and a `load()` that defensively reconstructs state from `localStorage` (swallowing parse errors, clamping/validating values) since it's untrusted persisted JSON. `getState()`/`getAll()` always return deep-ish copies, never the live internal state, so callers can't mutate storage by reference. Follow this same pattern if you add another persisted feature.

**Data files** (`data/*.json`, `data/rules/*.md`): fetched once per module on `init()` and held in memory; nothing is written back to these files at runtime. Session data the user creates (saved NPCs, initiative state) goes to `localStorage` instead, via the stores above.

**Styling**: all styles live in `css/style.css` — no inline `style="..."` attributes and no `<style>` blocks in HTML/JS. Design tokens (colors, fonts) are CSS custom properties on `:root`; two self-hosted variable fonts (Fraunces for display/prose, Manrope for UI) are loaded via `@font-face` from `assets/fonts/`. Utility classes (`.mb-1`, `.text-muted`, `.row-flex-wrap`, etc.) are used instead of one-off inline styles — extend that set rather than reintroducing `style="..."`. The one sanctioned exception is `initiative.js`'s drag-and-drop, which sets `left`/`top`/`zIndex`/`opacity` imperatively because those are genuinely per-frame runtime values, not static styling.

The layout is responsive: `.tab-bar` sits at the top on laptop widths and becomes a fixed bottom bar on phone widths (`@media (max-width: 767.98px)` in `style.css`); `main` gets bottom padding on mobile so content doesn't sit behind the fixed bar.

Because `.hidden { display: none !important; }` is a utility class, prefer `classList.toggle('hidden', ...)` over ad hoc inline-style show/hide when writing new show/hide logic — a plain (non-`!important`) utility class here would lose to same-specificity layout classes like `.row-flex-wrap` based on source order.

**Service worker / offline caching** (`sw.js`): cache-first strategy — on `fetch`, it returns whatever's in the cache before ever hitting the network. `index.html` registers `sw.js` on every load. This means **editing any asset (CSS, JS, fonts, data) has no visible effect in a browser that already has the service worker installed** until you bump the `CACHE` version string in `sw.js` (which forces a fresh install) and/or clear the old cache — otherwise you'll be testing stale cached files. Every asset the app fetches at runtime (all JS modules, both font files, all `data/*` files, `index.html`, `manifest.json`) must be listed in `sw.js`'s `ASSETS` array or it silently won't work offline.

**Theme color** is duplicated in three places that must be kept in sync: `css/style.css` (`:root` custom properties), `index.html`'s `<meta name="theme-color">`, and `manifest.json`'s `theme_color`/`background_color`.

## Rules for agents working in this repo

- Never use emoji, including in UI copy, tab labels, or code comments.
- Never use inline styles (`style="..."` attributes or `.style.x = ...` in JS). All styling goes in `css/style.css`. The one exception is per-frame runtime values that can't be expressed as a static class — see `initiative.js`'s drag-and-drop — and even then, prefer toggling a class over setting a style property when the value isn't continuously variable.
- Use `playwright-cli` for browser testing (see "Running locally" for how to serve the app first). Remember the service-worker caveat above: unregister the service worker and clear caches between test runs if your edits aren't showing up.

## Content vs. app code

The repo root also contains the TTRPG's source rulebook material (`adanadi.md`, `character.md`, `encounters.md`, `healing.md`, `society.md`, `system.md`, `technology.md`, `world.md`, and matching `.pdf`s). These are reference/lore documents, not part of the running app — only `data/rules/quick-ref.md` and `data/rules/full-digest.md` (under `data/`) are actually fetched and rendered by `rules.js`.

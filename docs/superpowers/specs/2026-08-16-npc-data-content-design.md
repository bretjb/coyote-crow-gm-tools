# NPC Tab: Data & Content (Avatars, Voice, Quirks, Tagging/Search)

## Context

This is the "Group A" spec from the broader `features.md` NPC-tab decomposition (see `docs/superpowers/specs/2026-08-16-full-npc-card-view-edit-design.md` for Group B, the card interaction/UX spec, which lands first). It covers four additions:

- Deterministic seeded avatars via DiceBear
- Voice mechanics as discrete fields
- Quirks/mannerisms as a data-backed field
- Tagging and search/filter over the saved NPC library

Out of scope: PDF export, PC tab, Initiative tracker, Encounter Generator, final UI/UX pass — each is its own spec.

**Dependency on Group B:** two of these fields (Voice, Quirk) render through helpers Group B already made mode-aware (`buildSelectCustomField`, `buildNamedDescField`) — this spec assumes Group B has landed, so those helpers already accept a `mode` option and need no further changes for view/edit support.

## Avatars

DiceBear normally runs as an npm package or a hosted API — this app has no build step, no bundler, and a cache-first service worker that must be able to serve everything offline. DiceBear's packages are pure ESM, so the fix is to vendor the built ESM files directly (same pattern already used for `lib/load-marked.js`'s bundled markdown parser):

- Download `@dicebear/core`'s ESM build and the `adventurer` style from `@dicebear/collection`'s ESM build (via jsDelivr's ESM output) into `js/lib/dicebear/core.js` and `js/lib/dicebear/adventurer.js`.
- Rewrite any bare-specifier imports inside those files (`@dicebear/core`) to relative paths (`./core.js`) so the browser can resolve them without an import map.
- Register both vendored files in `sw.js`'s `ASSETS` array and bump `CACHE`, same as any other new asset.
- Illustrated-character style chosen (not abstract/geometric) — closest to an actual "who is this person" portrait for at-table recognition.

**Data model:** a new `avatarSeed` field on Full NPC data (`npc.avatarSeed`), a random string generated once at NPC creation (same `generateId()`-style random-string pattern already used in `npc-storage.js`). The avatar SVG is generated client-side from this seed at render time — never stored as an image, only the seed is persisted. Same seed always produces the same avatar; there is no other input (name changes don't affect the avatar).

**UI:**
- Full NPC card: avatar renders next to the name at the top of the card, in both view and edit mode.
- "Regenerate Avatar" button, edit-mode only (next to the existing "Regenerate Name" button, which is also edit-mode only per Group B) — picks a new random seed and re-renders the avatar. Whichever seed is showing when "Save" is clicked is what gets persisted.
- Saved NPCs list: a small avatar thumbnail renders next to each Full NPC entry's name button, for quick visual scanning of the library.
- Quick NPCs get no avatar — they have no stat/skill data at all, and this stays a Full-NPC-card feature like the rest of Group B.

## Voice Mechanics

Four new fields on Full NPC data, each a small fixed enumeration plus custom-value support, rendered via the existing `buildSelectCustomField` helper (already mode-aware after Group B — no new plumbing needed for view/edit toggling):

- **Pace**: Fast / Measured / Slow
- **Volume**: Loud / Normal / Quiet
- **Pitch**: High / Mid / Low
- **Formality**: Formal / Casual / Blunt

These are universal (not archetype-dependent, unlike Age/Gender/Sexuality), so the option lists are defined as plain JS constants in `npc-gen.js` rather than a new `data/*.json` file — four arrays of three strings each don't warrant a fetched table.

**Data model:** `npc.voice = { pace, volume, pitch, formality }`, each a string, defaulted via a uniform random pick (`pick()`, the same helper already used for Motivation) at generation time.

**UI:** a new "Voice" section on the Full NPC card, below Demographics and above Motivation, rendering the four fields via `buildSelectCustomField` in a `row-flex-wrap` group like Age/Gender/Sexuality already are.

## Quirks/Mannerisms

One quirk per NPC, auto-picked uniformly (`pick()`) at generation time from a new `data/quirks.json` table — same `{ name, description }` shape as `data/motivations.json`, which means it renders through the existing `buildNamedDescField` helper (already mode-aware after Group B) with zero new rendering code, exactly like Motivation and Ability already do.

**Data model:** `npc.quirk = { name, description }`.

**Curated content** for `data/quirks.json` (24 entries spanning mannerism, speech, appearance, and belief, per the pattern noted in `new-features.md`'s research):

```json
[
  { "name": "Taps rhythm", "description": "Constantly taps fingers or a foot to some internal rhythm, faster when anxious." },
  { "name": "Never blinks first", "description": "Holds eye contact a beat too long in every conversation, unnerving strangers." },
  { "name": "Collects small objects", "description": "Pockets buttons, stones, or bottlecaps compulsively; always has a few on hand." },
  { "name": "Speaks in threes", "description": "Repeats key phrases exactly three times when making a point." },
  { "name": "Avoids direct answers", "description": "Answers questions with questions, or a story that circles the point." },
  { "name": "Loud laugh, no warning", "description": "Laughs suddenly and loudly at things others don't find funny." },
  { "name": "Counts under their breath", "description": "Mutters numbers while thinking, waiting, or nervous." },
  { "name": "Names inanimate objects", "description": "Refers to tools, vehicles, or weapons by a given name, as if they were alive." },
  { "name": "Distrusts technology", "description": "Refuses to use niisi/computers unless absolutely necessary, does things the old way." },
  { "name": "Overly formal with strangers", "description": "Uses titles and full names even in casual settings, softens only with familiarity." },
  { "name": "Chews on something", "description": "Always has a twig, straw, or similar between their teeth." },
  { "name": "Finishes others' sentences", "description": "Interrupts to complete what they assume you're about to say — often wrong." },
  { "name": "Keeps a running tally", "description": "Mentally tracks favors owed and owed to them, mentions it more than people'd like." },
  { "name": "Superstitious about left hands", "description": "Won't shake, sign, or eat with the left hand; considers it bad luck." },
  { "name": "Hums when working", "description": "Hums tunelessly while focused on a task, stops abruptly if interrupted." },
  { "name": "Flinches at loud noises", "description": "A visible startle response to sudden sound, then tries to play it off." },
  { "name": "Never sits with their back to a door", "description": "Rearranges seating or stands rather than have their back exposed." },
  { "name": "Speaks of themselves in third person when angry", "description": "Drops into referring to themselves by name during confrontation." },
  { "name": "Compulsive straightener", "description": "Can't leave a crooked object alone — picture frames, place settings, tools." },
  { "name": "Trails off mid-sentence", "description": "Loses the thread of what they're saying when distracted, rarely finishes the thought." },
  { "name": "Always cold", "description": "Wears layers regardless of weather, comments on the temperature often." },
  { "name": "Whittles or fidgets with a blade", "description": "Keeps a small knife moving in their hands when idle, never aimed at anyone." },
  { "name": "Quotes an absent mentor", "description": "Prefaces advice with \"[someone] used to say...\", regardless of relevance." },
  { "name": "Can't whisper", "description": "Every attempt at a quiet aside is audible several feet away." }
]
```

## Tagging + Search

Tags describe the *saved library entry*, not the NPC's character data, and apply to both Quick and Full NPCs alike (this is a library-navigation feature, not a character-sheet field). They live at the entry level in `npc-storage.js`, alongside the existing `note` field:

```js
{ id, kind, data, note, tags: string[], savedAt, deleted }
```

- `saveNpc({ kind, data, note, tags })` and `updateNpc(id, { data, note, tags })` both gain a `tags` parameter (array of trimmed, non-empty strings, defaulting to `[]`).
- `exportAll()`/`importMerge()` carry `tags` through like they already do `note`; the existing duplicate-detection in `importMerge` (kind + note + JSON-equal data) is extended to also compare tags, so importing the same NPC with different tags is treated as a distinct, non-duplicate entry.
- **Tag input**: free-text, type-as-you-go, placed near the existing Notes/Save controls on each card (`appendSaveControls`'s area). Enter or comma commits the current text as a new tag chip; each chip has a small remove control. No predefined tag list, no autocomplete — matches the "tag as you type" pattern called out in `new-features.md`'s research as the right UX target.
- **Search bar**: a single text input above the Saved NPCs list (`renderSavedList`'s container). Filters the list live (on `input`, no submit button) by case-insensitive substring match against the entry's NPC name or any of its tags. Empty search shows the full list, unchanged from today.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser per the project's standard workflow: generate a Full NPC, confirm an avatar renders and "Regenerate Avatar" (edit mode only) cycles it before Save persists the shown one; confirm Voice fields and Quirk render and edit like Motivation/Ability already do; confirm tags can be added/removed on both a Quick and a Full NPC and that the search box filters the Saved NPCs list by name and by tag.

# NPC Tab: Printable Character Sheet PDF Export

## Context

This is the "Group C" spec from the `features.md` NPC-tab decomposition (Group B: card interaction/UX, Group A: avatars/voice/quirks/tagging — both already speced). It covers exporting a Full NPC to the official Coyote & Crow character sheet as a filled-in, printable PDF.

The template is `CoyoteCrowCharacterSheet-v1.01.pdf` (added to the repo root during this spec's brainstorming). It's a **static, two-page PDF with no AcroForm fields** (`Form: none` per `pdfinfo`) — it's a graphical layout, not a fillable form. So "export" means overlaying text onto this exact template at the right coordinates and producing a new PDF, not filling form fields.

Out of scope: PC tab, Initiative tracker, Encounter Generator, final UI/UX pass. Quick NPCs (no export control — see Scope below).

## Approach: Overlay via `pdf-lib`

Like DiceBear (Group A spec), this needs a client-side library with no build step, fully cacheable offline. [`pdf-lib`](https://pdf-lib.js.org/) is pure JS, runs in the browser, and can load an existing PDF's bytes, draw text at given coordinates on top of its pages, and produce a new PDF blob — exactly what's needed here, without regenerating the visual design.

- Vendor `pdf-lib`'s browser ESM/UMD build into `js/lib/pdf-lib.js` (same local-vendoring pattern as DiceBear and `lib/load-marked.js`), registered in `sw.js`'s `ASSETS` array with a `CACHE` bump.
- `CoyoteCrowCharacterSheet-v1.01.pdf` itself is fetched at export time (lazily, only when the user clicks Export — no need to hold it in memory otherwise) and must also be added to `sw.js`'s `ASSETS` array so it's available offline.
- Text is drawn using `pdf-lib`'s built-in standard font (Helvetica via `StandardFonts.Helvetica`) — no custom font embedding needed (that would require `fontkit`, an extra dependency this doesn't warrant since the overlay text doesn't need to match the sheet's stylized display font, only be legible).
- Exact draw coordinates (x/y per field, in PDF point space, remembering PDF origin is bottom-left) are calibrated during implementation by loading the template into `pdf-lib`, drawing test text, and visually checking against the rendered PDF — this spec fixes *what* gets drawn *where relative to which labeled field*, not literal point values.

## Field Mapping

Page 1 fields, matched against the sheet's labels (see layout below) and existing NPC data:

| Sheet field | Source |
|---|---|
| Name(s) | `npc.name` |
| Age | `npc.age` |
| Archetype | `npc.archetype` |
| Path of The: | `npc.path.name` with a leading `"Path of the "` prefix stripped (e.g. `"Path of the Eagle"` → `"Eagle"`), so it reads naturally after the sheet's own "Path of The:" label. If the path name doesn't start with that prefix (a custom path), use it as-is. |
| Motivation | `npc.motivation.name` |
| Gifts & Burdens | `npc.giftsAndBurdens`, formatted with the existing `gbLabel()` helper (already used for Copy-to-text and the on-card display), joined with commas |
| Stats grid (STR/AGI/END/INT/PER/WIS/SPI/CHA/WLL) | `npc.stats`, one cell per stat — the sheet's abbreviations already match this app's own `STAT_ABBR` constants exactly |
| Derived Stats (PD/MD/SD, Body/Mind/Soul, Body/Mind/Soul (current)) | `npc.derived` and `npc.current` — the sheet's PD/MD/SD abbreviations already match this app's own `DEFENSE_ABBR` constants exactly |
| Initiative Score | `npc.derived.Initiative` |
| Abilities | `npc.ability.name` + `npc.ability.description` |
| General Skills table (both columns) + Specialized Skills table | `npc.skills` — the sheet's two General Skills columns list the same 28 skill names, in the same order, as `data/skills.json`, so each row maps to a fixed position; Rank and Total columns come from the same per-skill computation already used to render the on-screen skill table (`generalSkillRow`'s pool/rank logic) |

**Left blank** (no equivalent app data, and out of scope to add new NPC fields just for this export): Other Identifiers, Background, Short Term Goals, Long Term Goal, Legendary Ranks, States & Effects, and all of page 2 (Belongings, Character Notes, Character Sketch — including the Character Sketch box, which stays empty rather than receiving the Group A avatar, to keep this feature independent of that one).

## Scope

Export is a **Full NPC card feature only** — a new "Export PDF" button next to Copy/Add to Initiative/Save (`appendCopyBtn`/`appendInitiativeBtn`/`appendSaveControls`'s area). Quick NPCs get no such button: they carry none of the stat/skill/derived data the sheet needs, and would render an almost entirely blank export.

## Download Behavior

Same pattern already used for "Export All" (NPC library JSON export) in `npc-gen.js`: generate the filled PDF as a `Blob`, create an object URL, trigger a download via a synthetic `<a>` click, then revoke the URL. Filename: a slugified NPC name, e.g. `${npc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-character-sheet.pdf`.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser: generate/save a Full NPC with at least one specialized skill and at least one gift/burden, click Export PDF, open the downloaded file, and visually confirm each mapped field (name, age, archetype, path, motivation, gifts/burdens, all nine stats, all three derived-stat triples, initiative score, ability, every ranked general skill, the specialized skill) lands in the correct location on the actual template and is legible.

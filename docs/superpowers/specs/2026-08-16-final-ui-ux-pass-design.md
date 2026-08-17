# Final UI/UX Pass

## Context

The original `features.md` line for this work: "when all finished a UI/UX pass to ensure usability, readability, and a beautiful application." This was deliberately deferred until all six NPC/PC/Initiative/Encounter sub-projects were implemented, so it could be assessed against the real, finished app rather than speculated about in advance.

Surveyed the running app (all seven tabs, view + edit modes, desktop and 390px-wide mobile viewport) and found four concrete, evidenced issues — not a general "make it prettier" pass:

1. The NPC/PC card's identity-fields section (everything between the avatar and the Stats table) is a loose stack of `row-flex-wrap` lines that reads as cramped and hard to scan, especially on mobile where wrapping is inconsistent line to line.
2. On-screen Path display reads "Path: Path of the Owl" — a redundant repetition of "Path" not present in the PDF export, which already strips this.
3. The mobile bottom tab bar was designed and styled for 5 tabs; with PCs and Encounter added, it now overflows a 390px-wide viewport and clips "Rules" with no visible affordance that more tabs exist.
4. There is no `button:disabled` rule anywhere in `css/style.css`. The Encounter tab's "Generate Encounter" button is genuinely disabled (confirmed via the DOM) when nothing is checked, but looks pixel-identical to its enabled state — a real usability gap, not specific to that one button, since it's a base style gap that would affect any future disabled button too.

## 1. NPC/PC Card Identity-Fields Grid

**Scope:** Archetype, Age, Gender, Sexuality, and — NPC cards only — the four Voice fields (Pace, Volume, Pitch, Formality) move from individual `row-flex-wrap` divs into one compact, bordered grid, styled consistently with the existing Stats table (header shading, cell borders, tabular alignment). Name (+ avatar) stays as its own header above the grid, unchanged. Motivation, Quirk, and Gifts & Burdens stay as prose blocks below the grid, unchanged in structure — they carry multi-line descriptions that don't fit a compact grid cell.

- NPC card grid: 8 cells (Archetype, Age, Gender, Sexuality, Pace, Volume, Pitch, Formality).
- PC card grid: 4 cells (Archetype, Age, Gender, Sexuality) — no Voice section on PCs.
- Both view and edit mode render inside the same grid structure. In view mode, each cell shows a label + value (same content `readOnlyField` already produces, restyled to sit in a grid cell rather than a flex row). In edit mode, each cell contains the same dropdown/custom-value control `buildSelectCustomField` already renders — no change to that function's logic or return shape (`{ el, setOptions }`), only to the CSS class(es) applied to its container so it presents as a grid cell instead of a flex row. This mirrors how `statCell` already renders either a value or an input inside the same `<td>` depending on mode — same pattern, applied one level up at the grid-cell wrapper instead of a table cell.
- Archetype's existing "+1 X, free rank: Y" note and Path's existing "+1 X" note continue to render as small subtext, now under their respective grid cell (Path itself is not part of this grid — see below — but follows the same subtext convention already established).
- Exact grid proportions (column count on desktop vs. mobile, cell padding, border weight) are **not** specified here — invoke the `frontend-design` skill at implementation time to make those calls against the existing Stats-table styling and design tokens in `css/style.css`, same as the earlier table-redesign work. This spec fixes the structure (what groups together, what stays separate) and the requirement (scannable, consistent with the Stats table), not literal CSS values.

## 2. Path Display Wording

Both the on-screen Path view-mode display and the edit-mode dropdown's "+1 X" subtext currently show the full stored path name (e.g. "Path of the Owl") after a "Path:" label, reading redundantly. Apply the same prefix-stripping already used by `js/npc-pdf-export.js` (strip a leading `"Path of the "` if present, else use the name as-is — covers custom/renamed paths too) to the on-screen display in both `js/npc-gen.js` and `js/pc-gen.js`, so it reads "Path: Owl" consistently between the app and the exported PDF.

## 3. Mobile Tab Bar Overflow

`.tab-bar`'s phone-width rule (`@media (max-width: 767.98px)` in `css/style.css`) gains horizontal scrolling (`overflow-x: auto`, tabs kept `nowrap` rather than wrapping to a second line) instead of clipping. Pure CSS, no JS changes. All seven tabs stay full-size and reachable by swiping; no tab is hidden behind a menu.

## 4. Disabled-Button Styling

Add a `button:disabled` rule to `css/style.css` (reduced opacity, `cursor: not-allowed`) alongside the existing base `button`/`button.secondary` rules. This is a base style, not scoped to the Encounter tab — it fixes the gap everywhere a disabled button appears now or in the future.

## Testing

No JS unit test suite exists in this project. Verify by exercising the app in a browser: generate/save a Full NPC and a PC, confirm the identity-fields grid renders correctly in both view and edit mode, confirm editing a grid field (e.g. Age) still updates the underlying data correctly, confirm Path displays without the redundant prefix on-screen and still strips correctly in the PDF export, resize to a 390px-wide viewport and confirm all seven tabs are reachable via horizontal scroll with no clipping, and confirm the Encounter tab's Generate button visibly looks disabled when nothing is checked and visibly changes when enabled.

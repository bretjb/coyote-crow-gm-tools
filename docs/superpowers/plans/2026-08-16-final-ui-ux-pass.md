# Final UI/UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four concrete UI/UX issues found by surveying the finished app: a cramped NPC/PC card identity-fields layout, redundant "Path: Path of the X" wording, a mobile tab bar that overflows with 7 tabs, and missing disabled-button styling.

**Architecture:** All changes are additive edits to existing files (`js/character-card.js`, `js/npc-gen.js`, `js/pc-gen.js`, `css/style.css`) — no new files, no new modules. The identity-fields grid reuses the existing field-builder functions (`buildSelectCustomField`, `readOnlyField`, `buildTextField`) unchanged; only their container markup changes from stacked flex rows to one shared CSS grid, styled via a child-combinator selector so no field-builder function needs a new parameter.

**Tech Stack:** Vanilla JS (ES modules, no build step), `css/style.css` for all styling (no inline styles), `sw.js` cache-first service worker.

## Global Constraints

- No inline styles anywhere — all styling via `css/style.css` classes.
- No emoji anywhere, including UI copy.
- Escape all dynamic text inserted via `innerHTML` using the existing `esc()` helper (from `js/character-card.js`) — never interpolate raw NPC/PC/user data into `innerHTML`.
- No JS unit test suite exists in this project. Verify every task by serving the app locally (`python3 -m http.server 8934`) and driving it with `playwright-cli` (unregister the service worker and reload before verifying any edit — `sw.js` is cache-first). If `playwright-cli open <url>` fails because Chrome isn't installed, retry with `--browser=webkit`.
- `sw.js`'s `CACHE` version string must be bumped whenever any cached file's contents change, even if `ASSETS` itself doesn't gain a new entry — this plan only edits already-registered files, but the cache-first strategy still means a version bump is required per task that changes `css/style.css`, `js/character-card.js`, `js/npc-gen.js`, or `js/pc-gen.js`. Current value on disk is `'cc-gm-v29'` — bump to the next unused version for each task that needs it (v30, v31, ...), not a hardcoded literal if the actual on-disk value has drifted by execution time.

---

## Task 1: Fix redundant "Path: Path of the X" wording

**Files:**
- Modify: `js/character-card.js`
- Modify: `js/npc-gen.js`
- Modify: `js/pc-gen.js`
- Modify: `sw.js`

**Interfaces:**
- Produces: `stripPathPrefix(name: string): string`, exported from `js/character-card.js` — strips a leading `"Path of the "` if present, else returns the name unchanged. Used by both `npc-gen.js` and `pc-gen.js`.

- [ ] **Step 1: Add the shared helper to `character-card.js`**

Add this function near the top of `js/character-card.js`, after the existing `esc` export:

```js
export function stripPathPrefix(name) {
  const PATH_PREFIX = 'Path of the ';
  return name.startsWith(PATH_PREFIX) ? name.slice(PATH_PREFIX.length) : name;
}
```

- [ ] **Step 2: Apply it to the NPC card's view-mode Path display**

In `js/npc-gen.js`, add `stripPathPrefix` to the existing `character-card.js` import line (find the line starting `import { esc, ensureCurrent, ...` — it's near the top of the file — and add `stripPathPrefix` to the destructured names).

Then find, inside `renderFullCard`'s Path section (`mode === 'view'` branch):

```js
    p.textContent = `Path: ${npc.path.name}`;
```

Replace with:

```js
    p.textContent = `Path: ${stripPathPrefix(npc.path.name)}`;
```

- [ ] **Step 3: Apply it to the PC card's Path field**

In `js/pc-gen.js`, add `stripPathPrefix` to the existing `character-card.js` import line at the top of the file.

Find, inside `renderPcCard`:

```js
  const pathSectionEl = card.querySelector('#pc-path-section');
  pathSectionEl.appendChild(
    buildSelectCustomField({
      label: 'Path', value: pc.path.name, options: ctx.paths.map(p => p.name),
      onChange: v => { pc.path.name = v; }, mode,
    }).el
  );
```

Replace with (view mode displays the stripped name; edit mode still needs the full stored name so the `<select>` correctly matches the current option and `onChange` still writes back the real name):

```js
  const pathSectionEl = card.querySelector('#pc-path-section');
  pathSectionEl.appendChild(
    buildSelectCustomField({
      label: 'Path',
      value: mode === 'view' ? stripPathPrefix(pc.path.name) : pc.path.name,
      options: ctx.paths.map(p => p.name),
      onChange: v => { pc.path.name = v; }, mode,
    }).el
  );
```

- [ ] **Step 4: Bump the service worker cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v29';` to `const CACHE = 'cc-gm-v30';` (verify `v29` is still the real current value on disk first — if not, bump from whatever the real value is).

- [ ] **Step 5: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli click "role=button[name='NPCs']"
playwright-cli click "role=button[name='Full NPC']"
playwright-cli find "Path: Path of the"
```
Expected: no match (the old redundant string is gone). Then:
```bash
playwright-cli find "Path:"
```
Expected: a match showing "Path: <animal name>" without "Path of the" repeated.

```bash
playwright-cli click "role=button[name='PCs']"
playwright-cli click "role=button[name='New PC']"
playwright-cli find "Path of the"
```
Expected: no match on the blank PC card (empty path name, nothing to strip, no crash). Then select a real path from the Path dropdown, switch to view mode (click Edit's sibling Save-mode toggle is not present on a never-saved card — instead just check the dropdown itself shows full names, which is expected and unchanged):
```bash
playwright-cli close
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add js/character-card.js js/npc-gen.js js/pc-gen.js sw.js
git commit -m "fix: strip redundant \"Path of the \" prefix from on-screen Path display"
```

---

## Task 2: Add disabled-button styling

**Files:**
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- None — pure CSS addition, no JS/HTML changes.

- [ ] **Step 1: Add the rule**

In `css/style.css`, find the existing button rules:

```css
button:hover { opacity: 0.85; }
button:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}
```

Add a `button:disabled` rule immediately after `button:focus-visible`'s closing brace:

```css
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Bump the service worker cache version**

In `sw.js`, bump `CACHE` to the next unused version (e.g. `'cc-gm-v31'` if Task 1 used `v30`).

- [ ] **Step 3: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli click "role=button[name='Encounter']"
playwright-cli run-code "async (page) => { const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('#enc-generate')).opacity); return opacity; }"
```
Expected: `"0.45"` (the disabled Generate Encounter button now visibly dims). Then check a normal enabled button isn't affected:
```bash
playwright-cli run-code "async (page) => { const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('.tab-btn.active')).opacity); return opacity; }"
```
Expected: `"1"` (unaffected — tab buttons aren't `<button disabled>`, and even active `<button>` elements without the `disabled` attribute keep full opacity).

```bash
playwright-cli close
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add css/style.css sw.js
git commit -m "fix: add button:disabled styling so disabled buttons are visually distinct"
```

---

## Task 3: Fix mobile tab bar overflow

**Files:**
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- None — pure CSS change scoped to the existing `@media (max-width: 767.98px)` block.

- [ ] **Step 1: Make the tab bar horizontally scrollable on phone widths**

In `css/style.css`, find the mobile media query block:

```css
@media (max-width: 767.98px) {
  main { padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom)); }

  .tab-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--nav-height);
    padding-bottom: env(safe-area-inset-bottom);
    border-bottom: none;
    border-top: 2px solid var(--border);
    z-index: 10;
  }

  .tab-btn {
    padding: 0.4rem 0.2rem;
    font-size: 0.72rem;
    border-bottom: none;
    border-top: 3px solid transparent;
  }
```

Replace with (adds horizontal scrolling to the bar and stops `.tab-btn` from being forced to shrink below its content width, which is what was causing tabs past the 5th to overflow off-screen with no way to reach them):

```css
@media (max-width: 767.98px) {
  main { padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom)); }

  .tab-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--nav-height);
    padding-bottom: env(safe-area-inset-bottom);
    border-bottom: none;
    border-top: 2px solid var(--border);
    z-index: 10;
    overflow-x: auto;
    flex-wrap: nowrap;
  }

  .tab-btn {
    flex: 0 0 auto;
    padding: 0.4rem 0.75rem;
    font-size: 0.72rem;
    border-bottom: none;
    border-top: 3px solid transparent;
  }
```

(Only `.tab-bar` gains `overflow-x: auto; flex-wrap: nowrap;` and `.tab-btn` gains `flex: 0 0 auto;` with slightly wider horizontal padding to stay comfortably tappable now that it's not forced to compress — everything else in the block is unchanged.)

- [ ] **Step 2: Bump the service worker cache version**

In `sw.js`, bump `CACHE` to the next unused version.

- [ ] **Step 3: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli resize 390 844
playwright-cli run-code "async (page) => { const r = await page.evaluate(() => { const bar = document.querySelector('.tab-bar'); return { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, overflowX: getComputedStyle(bar).overflowX }; }); return JSON.stringify(r); }"
```
Expected: `overflowX` is `"auto"`, and `scrollWidth` is greater than `clientWidth` (confirming there's scrollable overflow rather than clipped content). Then confirm the last tab is actually reachable by scrolling:
```bash
playwright-cli run-code "async (page) => { await page.evaluate(() => { document.querySelector('.tab-bar').scrollLeft = 9999; }); const visible = await page.evaluate(() => { const btn = [...document.querySelectorAll('.tab-btn')].find(b => b.textContent.includes('Rules')); const r = btn.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }); return visible; }"
```
Expected: `true` (the Rules tab is fully within the viewport after scrolling the bar to its end).

```bash
playwright-cli close
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add css/style.css sw.js
git commit -m "fix: make the mobile tab bar horizontally scrollable instead of overflowing"
```

---

## Task 4: NPC card identity-fields grid

**Files:**
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `buildSelectCustomField`, `readOnlyField` (unchanged, from `js/character-card.js`) — no signature changes to either function in this task.
- Produces: a new `.identity-grid` CSS class (also consumed by Task 5's PC card grid).

- [ ] **Step 1: Merge the three separate container `<div>`s into one grid container**

In `js/npc-gen.js`, inside `renderFullCard`'s `card.innerHTML` template, find:

```js
    <div id="archetype-section" class="mb-0-5"></div>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
    <h3 class="h3-section">Voice</h3>
    <div id="voice-section" class="row-flex-wrap mb-0-5"></div>
```

Replace with:

```js
    <div id="identity-grid" class="identity-grid mb-0-75"></div>
```

- [ ] **Step 2: Rewire the Archetype, demographics, and Voice field code to append into the single grid container**

Find the block starting with `const archetypeSectionEl = card.querySelector('#archetype-section');` and ending right before `function archetypeDemographics(key) {`. Replace the first line:

```js
  const archetypeSectionEl = card.querySelector('#archetype-section');
```

with:

```js
  const identityGridEl = card.querySelector('#identity-grid');
  const archetypeCell = document.createElement('div');
```

Then, within that same block, replace every remaining `archetypeSectionEl` reference with `archetypeCell` (there are four: two `.appendChild` calls in the `mode === 'view'` branch, and two in the `else` branch). For example:

```js
    archetypeSectionEl.appendChild(p);
    archetypeSectionEl.appendChild(note);
```
becomes
```js
    archetypeCell.appendChild(p);
    archetypeCell.appendChild(note);
```
and
```js
    archetypeSectionEl.appendChild(archetypeSelect);
    archetypeSectionEl.appendChild(archetypeNote);
```
becomes
```js
    archetypeCell.appendChild(archetypeSelect);
    archetypeCell.appendChild(archetypeNote);
```

After that `if/else` block closes (right before `function archetypeDemographics(key) {`), add:

```js
  identityGridEl.appendChild(archetypeCell);
```

Next, find:

```js
  const demoSectionEl = card.querySelector('#demographics-section');
  const ageField = buildSelectCustomField({
    label: 'Age', value: npc.age, options: archetypeDemographics('age'),
    onChange: v => { npc.age = v; }, mode,
  });
  const genderField = buildSelectCustomField({
    label: 'Gender', value: npc.gender, options: archetypeDemographics('gender'),
    onChange: v => { npc.gender = v; }, mode,
  });
  const sexualityField = buildSelectCustomField({
    label: 'Sexuality', value: npc.sexuality, options: archetypeDemographics('sexuality'),
    onChange: v => { npc.sexuality = v; }, mode,
  });
  demoSectionEl.appendChild(ageField.el);
  demoSectionEl.appendChild(genderField.el);
  demoSectionEl.appendChild(sexualityField.el);

  const voiceSectionEl = card.querySelector('#voice-section');
  const paceField = buildSelectCustomField({
    label: 'Pace', value: npc.voice.pace, options: VOICE_PACE,
    onChange: v => { npc.voice.pace = v; }, mode,
  });
  const volumeField = buildSelectCustomField({
    label: 'Volume', value: npc.voice.volume, options: VOICE_VOLUME,
    onChange: v => { npc.voice.volume = v; }, mode,
  });
  const pitchField = buildSelectCustomField({
    label: 'Pitch', value: npc.voice.pitch, options: VOICE_PITCH,
    onChange: v => { npc.voice.pitch = v; }, mode,
  });
  const formalityField = buildSelectCustomField({
    label: 'Formality', value: npc.voice.formality, options: VOICE_FORMALITY,
    onChange: v => { npc.voice.formality = v; }, mode,
  });
  voiceSectionEl.appendChild(paceField.el);
  voiceSectionEl.appendChild(volumeField.el);
  voiceSectionEl.appendChild(pitchField.el);
  voiceSectionEl.appendChild(formalityField.el);
```

Replace with (same field construction, all appended into the one shared grid instead of two separate containers, `archetypeDemographics` calls unchanged):

```js
  const ageField = buildSelectCustomField({
    label: 'Age', value: npc.age, options: archetypeDemographics('age'),
    onChange: v => { npc.age = v; }, mode,
  });
  const genderField = buildSelectCustomField({
    label: 'Gender', value: npc.gender, options: archetypeDemographics('gender'),
    onChange: v => { npc.gender = v; }, mode,
  });
  const sexualityField = buildSelectCustomField({
    label: 'Sexuality', value: npc.sexuality, options: archetypeDemographics('sexuality'),
    onChange: v => { npc.sexuality = v; }, mode,
  });
  identityGridEl.appendChild(ageField.el);
  identityGridEl.appendChild(genderField.el);
  identityGridEl.appendChild(sexualityField.el);

  const paceField = buildSelectCustomField({
    label: 'Pace', value: npc.voice.pace, options: VOICE_PACE,
    onChange: v => { npc.voice.pace = v; }, mode,
  });
  const volumeField = buildSelectCustomField({
    label: 'Volume', value: npc.voice.volume, options: VOICE_VOLUME,
    onChange: v => { npc.voice.volume = v; }, mode,
  });
  const pitchField = buildSelectCustomField({
    label: 'Pitch', value: npc.voice.pitch, options: VOICE_PITCH,
    onChange: v => { npc.voice.pitch = v; }, mode,
  });
  const formalityField = buildSelectCustomField({
    label: 'Formality', value: npc.voice.formality, options: VOICE_FORMALITY,
    onChange: v => { npc.voice.formality = v; }, mode,
  });
  identityGridEl.appendChild(paceField.el);
  identityGridEl.appendChild(volumeField.el);
  identityGridEl.appendChild(pitchField.el);
  identityGridEl.appendChild(formalityField.el);
```

Note the `archetypeSelect.addEventListener('change', ...)` handler (defined earlier, inside the archetype `if/else` block) calls `ageField.setOptions(...)`, `genderField.setOptions(...)`, `sexualityField.setOptions(...)` — these three `const` declarations must still exist by the time that handler can fire (it only fires on user interaction, well after all of the above has run), so moving their declarations after the archetype block (as shown above, unchanged from today's ordering) is safe — this matches the existing code's ordering already, just with different append targets.

- [ ] **Step 3: Add the grid CSS**

In `css/style.css`, add this block near the existing `.stat-table` rules (after the `.stat-table-wrap`/`.stat-table` block, so related layout rules stay grouped):

```css
.identity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.identity-grid > * {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
}
```

(This is a functional baseline, not a final visual pass — Task 6 invokes the `frontend-design` skill to refine exact spacing/proportions against the app's design tokens.)

- [ ] **Step 4: Bump the service worker cache version**

In `sw.js`, bump `CACHE` to the next unused version.

- [ ] **Step 5: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli click "role=button[name='NPCs']"
playwright-cli click "role=button[name='Full NPC']"
playwright-cli run-code "async (page) => { const n = await page.evaluate(() => document.querySelectorAll('#identity-grid, .identity-grid > *').length); return n; }"
```
Expected: at least `9` (the grid container itself plus 8 cells: Archetype, Age, Gender, Sexuality, Pace, Volume, Pitch, Formality).

```bash
playwright-cli click "role=button[name='Edit']"
playwright-cli run-code "async (page) => { const n = await page.evaluate(() => document.querySelectorAll('.identity-grid select').length); return n; }"
```
Expected: `8` (Archetype + Age + Gender + Sexuality + Pace + Volume + Pitch + Formality all render as selects in edit mode, inside the grid).

Change the Age dropdown to a different value, click Save, and confirm it persisted:
```bash
playwright-cli find "Age"
```
(Manually verify via the snapshot output that the Age field is present and its selected value reflects the change — adapt the exact selector to whatever the snapshot shows, since option text varies by the randomly generated NPC's archetype.)

Also confirm changing Archetype still triggers its existing side effects (stat bonus swap, demographics options refresh) — this logic wasn't touched, only where its DOM output gets appended, but verify empirically:
```bash
playwright-cli run-code "async (page) => { const before = await page.evaluate(() => document.querySelector('.identity-grid select').value); return before; }"
```
Change the Archetype select to a different option, then:
```bash
playwright-cli run-code "async (page) => { const text = await page.evaluate(() => document.querySelector('.npc-meta-sm')?.textContent); return text; }"
```
Expected: the archetype note text (e.g. "+1 X · free rank: Y") updated to reflect the new archetype, confirming `swapArchetype`'s side effects still fire correctly through the new grid wiring.

```bash
playwright-cli close
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js css/style.css sw.js
git commit -m "feat: group NPC card identity fields into a compact grid"
```

---

## Task 5: PC card identity-fields grid

**Files:**
- Modify: `js/pc-gen.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `.identity-grid` CSS class (from Task 4, already in `css/style.css` by the time this task runs).

- [ ] **Step 1: Merge the two separate container `<div>`s into one grid container**

In `js/pc-gen.js`, inside `renderPcCard`'s `card.innerHTML` template, find:

```js
    <div id="pc-archetype-section" class="mb-0-5"></div>
    <div id="pc-demographics-section" class="row-flex-wrap mb-0-5"></div>
```

Replace with:

```js
    <div id="pc-identity-grid" class="identity-grid mb-0-75"></div>
```

- [ ] **Step 2: Rewire the Archetype and demographics field code to append into the single grid container**

Find:

```js
  const archetypeSectionEl = card.querySelector('#pc-archetype-section');
  archetypeSectionEl.appendChild(
    buildSelectCustomField({
      label: 'Archetype', value: pc.archetype, options: ctx.archetypes.map(a => a.name),
      onChange: v => { pc.archetype = v; }, mode,
    }).el
  );

  const demoSectionEl = card.querySelector('#pc-demographics-section');
  demoSectionEl.appendChild(buildTextField({ label: 'Age', value: pc.age, onChange: v => { pc.age = v; }, mode }).el);
  demoSectionEl.appendChild(buildTextField({ label: 'Gender', value: pc.gender, onChange: v => { pc.gender = v; }, mode }).el);
  demoSectionEl.appendChild(buildTextField({ label: 'Sexuality', value: pc.sexuality, onChange: v => { pc.sexuality = v; }, mode }).el);
```

Replace with:

```js
  const identityGridEl = card.querySelector('#pc-identity-grid');
  identityGridEl.appendChild(
    buildSelectCustomField({
      label: 'Archetype', value: pc.archetype, options: ctx.archetypes.map(a => a.name),
      onChange: v => { pc.archetype = v; }, mode,
    }).el
  );
  identityGridEl.appendChild(buildTextField({ label: 'Age', value: pc.age, onChange: v => { pc.age = v; }, mode }).el);
  identityGridEl.appendChild(buildTextField({ label: 'Gender', value: pc.gender, onChange: v => { pc.gender = v; }, mode }).el);
  identityGridEl.appendChild(buildTextField({ label: 'Sexuality', value: pc.sexuality, onChange: v => { pc.sexuality = v; }, mode }).el);
```

- [ ] **Step 3: Bump the service worker cache version**

In `sw.js`, bump `CACHE` to the next unused version.

- [ ] **Step 4: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli click "role=button[name='PCs']"
playwright-cli click "role=button[name='New PC']"
playwright-cli run-code "async (page) => { const n = await page.evaluate(() => document.querySelectorAll('#pc-identity-grid > *').length); return n; }"
```
Expected: `4` (Archetype, Age, Gender, Sexuality — a New PC opens directly in edit mode, so these render as inputs/selects inside the grid).

Fill in the Age field, then:
```bash
playwright-cli fill "role=textbox[name='Age']" "34"
playwright-cli click "role=button[name='Save']"
playwright-cli find "34"
```
Expected: a match — confirms the field's `onChange` still fires correctly and the value persists through the new grid wiring, and that saving switches to view mode showing the grid's read-only rendering.

```bash
playwright-cli close
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add js/pc-gen.js sw.js
git commit -m "feat: group PC card identity fields into a compact grid, matching the NPC card"
```

---

## Task 6: Frontend-design pass on the identity grid

**Files:**
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `.identity-grid` and its child cells (from Tasks 4-5).

Task 4's Step 3 added a functional but visually unrefined baseline for `.identity-grid`. This task invokes the `frontend-design` skill to make the actual visual calls (column count/breakpoints, cell padding, border treatment, how it reads next to the Stats table below it) against the app's existing design tokens in `css/style.css`, on both the NPC and PC cards, in both view and edit mode.

- [ ] **Step 1: Invoke the `frontend-design` skill and apply its recommended CSS changes to `.identity-grid` and `.identity-grid > *` in `css/style.css`.**

**Acceptance criteria** (not literal CSS):
- The grid reads as a distinct, bounded section — consistent visual weight with the Stats table below it, not a jarring style mismatch.
- Scannable: label/value pairs are easy to distinguish at a glance, in both view mode (plain text) and edit mode (dropdowns).
- Responsive: doesn't overflow or become unreadable at the 390px mobile width used elsewhere in this app's testing.
- No inline styles introduced; no new colors outside the existing `--*` custom properties already defined in `css/style.css`.

- [ ] **Step 2: Bump the service worker cache version**

In `sw.js`, bump `CACHE` to the next unused version.

- [ ] **Step 3: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934 --browser=webkit
playwright-cli run-code "async (page) => { await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))); }"
playwright-cli reload
playwright-cli click "role=button[name='NPCs']"
playwright-cli click "role=button[name='Full NPC']"
playwright-cli screenshot
playwright-cli click "role=button[name='Edit']"
playwright-cli screenshot
playwright-cli resize 390 844
playwright-cli screenshot
```
Expected: all three screenshots show the identity grid meeting the acceptance criteria above. Manually review the screenshots before committing.

```bash
playwright-cli click "role=button[name='PCs']"
playwright-cli click "role=button[name='New PC']"
playwright-cli screenshot
playwright-cli close
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add css/style.css sw.js
git commit -m "style: refine identity-grid visual treatment on the NPC and PC cards"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Identity-fields grid (Tasks 4-6, both NPC and PC cards), Path wording fix (Task 1, both cards), mobile tab bar overflow (Task 3), disabled-button styling (Task 2). All four spec items covered.
- **Type/signature consistency:** `stripPathPrefix(name)` introduced once in Task 1 and used identically in both call sites. `buildSelectCustomField`/`readOnlyField`/`buildTextField` signatures are never changed — only their call sites' container target changes (Tasks 4-5), which is why no other file that imports these functions is affected.
- **No placeholders:** every step has literal code or a literal, runnable verification command; Task 6 intentionally defers only the specific CSS *values* to the frontend-design skill, per the design spec's own explicit deferral — the acceptance criteria constrain what "done" means so this isn't open-ended.

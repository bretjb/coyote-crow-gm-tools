# NPC Tab: Data & Content (Avatars, Voice, Quirks, Tagging/Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic seeded avatars, four Voice fields, a data-backed Quirk field, and library-level tagging/search to the Full and Quick NPC cards and the Saved NPCs list in `js/npc-gen.js`.

**Architecture:** This plan builds on top of the "Group B" plan (`docs/superpowers/plans/2026-08-16-full-npc-card-view-edit.md`), which is assumed fully landed before this plan starts: `renderFullCard(npc, ctx, savedEntry, mode = 'view')` with view/edit branching, mode-aware `buildSelectCustomField`/`buildNamedDescField`, `js/npc-tooltip.js`, `ctx.glossary`, and `appendSaveControls` returning `{ getSavedId }`. Avatars are vendored DiceBear ESM files rendered client-side from a persisted `npc.avatarSeed` (never stored as an image). Voice is four small enum fields reusing `buildSelectCustomField`. Quirk is a `{name, description}` field from a new data file, reusing `buildNamedDescField` with zero new rendering code. Tags live on the saved-library entry (not on NPC character data) in `npc-storage.js`, alongside `note`, with a type-as-you-go chip UI and a live search box filtering the saved list.

**Tech Stack:** Vanilla JS (ES modules, no build step), `css/style.css` for all styling (no inline styles), `data/*.json` static tables, `sw.js` cache-first service worker, vendored DiceBear v9 ESM builds (no CDN calls at runtime).

## Implementation Notes (deviations from the spec, read before starting)

- **Package names:** the spec says "vendor `@dicebear/core`'s ESM build and the `adventurer` style from `@dicebear/collection`'s ESM build." Real research (live `curl` against jsDelivr + the npm registry, done during planning) found:
  - `@dicebear/collection` bundles *all* ~25 illustrated/abstract styles into one file and jsDelivr's `+esm` output for it `modulepreload`-links every individual per-style package — it is not a lean way to get just `adventurer`.
  - `@dicebear/adventurer` exists as its own standalone npm package (latest `9.4.2`) with a single peer dependency `@dicebear/core: ^9.0.0`, and jsDelivr can build its ESM output directly. This is smaller and cleaner than pulling in `@dicebear/collection`, so **Task 1 vendors `@dicebear/adventurer` directly instead of `@dicebear/collection`.** Functionally this is exactly the "adventurer style" the spec asks for; only the vendoring source package differs.
  - `@dicebear/core`'s npm `latest` tag has moved to a `10.x` major that `adventurer` does not yet support — Task 1 pins `@dicebear/core@9.4.3` (the newest `9.x`, matching adventurer's `^9.0.0` peer range), not `@dicebear/core@latest`.
- **Import rewrite is a single string replace, not a graph problem.** jsDelivr's `+esm` builds are already flattened/bundled per package — `adventurer.js`'s only external reference is one line, `import{escape as l}from"/npm/@dicebear/core@9.4.1/+esm"` (an absolute jsDelivr path, not a bare specifier — jsDelivr resolves bare specifiers for you). `core.js` has zero imports. Task 1's rewrite step replaces that one line with `from"./core.js"` via a regex substitution (the embedded version string in the URL can drift slightly with jsDelivr's caching, so the regex matches any version number rather than a literal string) and also strips the trailing `//# sourceMappingURL=/sm/...map` comment from both files (a jsDelivr-hosted sourcemap path that won't resolve offline and isn't needed).
- **File size:** `core.js` is ~7.6 KB. `adventurer.js` is ~277 KB uncompressed (~270 KB of that is inlined SVG path data for the style's ~20+ base/hair/eyes/mouth/feature variants — this is normal for an illustrated DiceBear style, not a mistake in the vendoring). Combined, this is a ~285 KB addition to the service worker's precached asset list — noticeably larger than any other single asset in `sw.js.ASSETS` today (the two variable-font files are the next largest). Not a hard blocker, but worth knowing: the first install (or next cache-bump reinstall) downloads an extra ~285 KB before the app is usable offline.
- **Inherited from Group B, not introduced here:** for a freshly-generated (never-saved) NPC, `savedEntry` is `undefined`, and Group B's `rerender(newMode)` closure re-passes that same `undefined` on every mode toggle. So Save (mode stays edit's sibling view) → Edit → Save again creates a *second* library entry rather than updating the first, for `note` as much as for the new `tags` field this plan adds. This plan does not fix that pre-existing behavior (it's Group B's card-lifecycle code, out of this plan's scope) — flagging it here so it isn't mistaken for a bug newly introduced by Task 5.
- **`appendSaveControls`'s tag input commits on blur as well as Enter/comma.** The spec only specifies "Enter or comma commits the current text as a new tag chip." Task 5 additionally commits on blur (clicking or tabbing away from the tag input) so that text typed but not explicitly committed isn't silently discarded when the user clicks Save — otherwise a user who types a tag and immediately clicks Save without pressing Enter would lose it. This is a deliberate, minor addition beyond the spec's literal wording, not an oversight; drop the `blur` listener in Task 5 Step 3 if strict spec-literalism is wanted instead.

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x =`) anywhere in new code — all styling via `css/style.css` classes. (Pre-existing `style="..."` attributes already in `js/npc-gen.js`, e.g. in `init()`'s template and `renderSavedList`, are out of scope for this plan; do not introduce new ones, but do not feel obligated to clean up old ones either.)
- No emoji anywhere, including UI copy.
- Any new `data/*.json` file fetched at runtime must be added to `sw.js`'s `ASSETS` array, and `sw.js`'s `CACHE` version string must be bumped whenever `ASSETS` or any cached file's contents change, or the service worker will keep serving stale files. This plan starts from `CACHE = 'cc-gm-v9'` (the end state of the Group B plan) and bumps once per task that touches a cached file, ending at `v15`.
- Escape all dynamic text inserted via `innerHTML` using the existing `esc()` helper (already defined at the top of `js/npc-gen.js`) — never interpolate raw NPC/user data into `innerHTML`. Exception: SVG markup returned by DiceBear's `createAvatar(...).toString()` is generated entirely by the vendored library from internal path tables and a `seed`/`size` pair we control — it is not user-authored text, so it does not go through `esc()`, consistent with how this codebase already treats other trusted, library-generated markup (e.g. `marked`'s output in `rules.js`).
- No JS unit test suite exists in this project (no `package.json`, no test runner). Verify every task by serving the app locally and driving it with `playwright-cli`, per `CLAUDE.md`. Unregister the service worker before each verification run so edits aren't hidden behind a stale cache-first response.
- Do not touch `js/pc-gen.js`, `js/pc-storage.js`, or anything PC-tab-related — that's a separate spec/plan.
- `localStorage`-backed state (the saved-NPC library) already uses `getState()`/`getAll()` deep-copy accessors in `npc-storage.js` pattern — new fields added to persisted entries (`tags`) must follow that same defensive-read / deep-copy convention.

---

## Task 1: Vendor DiceBear core + adventurer ESM builds

**Files:**
- Create: `js/lib/dicebear/core.js`
- Create: `js/lib/dicebear/adventurer.js`
- Modify: `sw.js`

**Interfaces:**
- Produces: `js/lib/dicebear/core.js` exporting `createAvatar(style, options)` (named export `createAvatar`), consumed by Task 2. `js/lib/dicebear/adventurer.js` exporting `create`, `meta`, `schema` (the shape `createAvatar` expects as its `style` argument — `import * as adventurer from './lib/dicebear/adventurer.js'` gives an object with exactly those three named properties), consumed by Task 2.

- [ ] **Step 1: Download the pinned jsDelivr ESM builds**

```bash
mkdir -p /Users/bretjb/dev/coyote-crow/js/lib/dicebear
curl -sf https://cdn.jsdelivr.net/npm/@dicebear/core@9.4.3/+esm -o /Users/bretjb/dev/coyote-crow/js/lib/dicebear/core.js
curl -sf https://cdn.jsdelivr.net/npm/@dicebear/adventurer@9.4.2/+esm -o /Users/bretjb/dev/coyote-crow/js/lib/dicebear/adventurer.js
wc -c /Users/bretjb/dev/coyote-crow/js/lib/dicebear/core.js /Users/bretjb/dev/coyote-crow/js/lib/dicebear/adventurer.js
```

Expected: `core.js` around 7,600-7,700 bytes; `adventurer.js` around 276,000-277,000 bytes. If either `curl` fails (network unavailable), stop and retry later rather than committing a partial/empty vendored file.

- [ ] **Step 2: Rewrite the cross-package import to a relative path and strip the unresolvable sourcemap comments**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 - <<'EOF'
import re, pathlib

core_path = pathlib.Path('js/lib/dicebear/core.js')
adv_path = pathlib.Path('js/lib/dicebear/adventurer.js')

for path in (core_path, adv_path):
    text = path.read_text()
    text = re.sub(r'\n//# sourceMappingURL=.*\n?$', '\n', text)
    path.write_text(text)

adv_text = adv_path.read_text()
adv_text, n = re.subn(r'from"/npm/@dicebear/core@[0-9.]+/\+esm"', 'from"./core.js"', adv_text)
assert n == 1, f'expected exactly 1 import rewrite in adventurer.js, got {n}'
adv_path.write_text(adv_text)
print('rewrite OK, replaced', n, 'import(s)')
EOF
```

Expected output: `rewrite OK, replaced 1 import(s)`.

- [ ] **Step 3: Verify no remaining jsDelivr references and confirm the expected exports are present**

```bash
cd /Users/bretjb/dev/coyote-crow
grep -c '/npm/@dicebear' js/lib/dicebear/adventurer.js
grep -c 'sourceMappingURL' js/lib/dicebear/core.js js/lib/dicebear/adventurer.js
grep -o 'export{[^}]*}' js/lib/dicebear/core.js
grep -o 'export{[^}]*}' js/lib/dicebear/adventurer.js
```

Expected: first command outputs `0` (no jsDelivr absolute paths left); second command outputs `0` for both files; the two `export{...}` lines each contain `createAvatar` (core) and `create`, `meta`, `schema` (adventurer) as the exported names (the minified local variable names before `as` will vary — only the names after `as` matter).

- [ ] **Step 4: Register both files in the service worker and bump the cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v9';
```
to:
```js
const CACHE = 'cc-gm-v10';
```

And in the `ASSETS` array, add two lines right after `'./js/lib/load-marked.js',`:

```js
  './js/lib/load-marked.js',
  './js/lib/dicebear/core.js',
  './js/lib/dicebear/adventurer.js',
```

- [ ] **Step 5: Verify both files are served correctly as valid ES modules**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
curl -sf http://localhost:8934/js/lib/dicebear/core.js | tail -c 200
curl -sf http://localhost:8934/js/lib/dicebear/adventurer.js | tail -c 200
kill %1
```

Expected: both `curl` commands end in `export{...}` (not a truncated/error page) — this confirms both files are served with real content, byte-identical to what's on disk.

This project has no Node toolchain by design (no `package.json`, no build step, per `CLAUDE.md`) — do not assume `node` is installed. If it happens to be available, this optional smoke test proves `createAvatar` produces real SVG markup end-to-end before any browser-side work happens in Task 2:

```bash
cd /Users/bretjb/dev/coyote-crow
if command -v node >/dev/null 2>&1; then
  node --input-type=module -e "
import { createAvatar } from './js/lib/dicebear/core.js';
import * as adventurer from './js/lib/dicebear/adventurer.js';
const avatar = createAvatar(adventurer, { seed: 'test-seed-1', size: 64 });
const svg = avatar.toString();
if (!svg.startsWith('<svg') || svg.length < 500) throw new Error('unexpected output: ' + svg.slice(0, 100));
console.log('createAvatar OK, svg length', svg.length);
"
else
  echo "node not available — skipping this optional check; Task 2 Step 9's browser-based verification covers the same ground"
fi
```

Expected: either `createAvatar OK, svg length <some number>` with no thrown error, or the skip message — a missing `node` is not a vendoring failure, since Task 2's `playwright-cli` verification exercises the exact same `createAvatar(adventurer, ...)` call inside the real browser.

- [ ] **Step 6: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/lib/dicebear/core.js js/lib/dicebear/adventurer.js sw.js
git commit -m "feat: vendor DiceBear core + adventurer ESM builds for offline avatar generation"
```

---

## Task 2: Avatar data model, card rendering, regenerate control, and saved-list thumbnail

**Files:**
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `createAvatar` from `js/lib/dicebear/core.js`, `adventurer` style module from `js/lib/dicebear/adventurer.js` (Task 1).
- Produces: `npc.avatarSeed: string` on Full NPC data. `generateAvatarSeed(): string` and `renderAvatarSvg(seed, size): string` helpers in `js/npc-gen.js`, used by Task 2's own card/list rendering only (no other task consumes them directly).

- [ ] **Step 1: Import DiceBear and add the seed/render helpers**

At the top of `js/npc-gen.js`, add these imports after the existing `npc-storage.js` import:

```js
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe, exportAll, importMerge } from './npc-storage.js';
import { createAvatar } from './lib/dicebear/core.js';
import * as adventurer from './lib/dicebear/adventurer.js';
```

Add these two functions after the existing `esc()` helper (near the top of the file, before `init()`):

```js
function generateAvatarSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderAvatarSvg(seed, size) {
  return createAvatar(adventurer, { seed, size }).toString();
}
```

- [ ] **Step 2: Generate the seed at NPC creation**

In `generateFullNpc` (unchanged by Group B, so this is the version currently on disk), add `avatarSeed` to the returned object, right after `name`:

```js
  return {
    name: generateName(nameData),
    avatarSeed: generateAvatarSeed(),
    motivation: pick(motivations),
    archetype: archetype.name,
```

- [ ] **Step 3: Add a defensive backfill for pre-existing saved NPCs that predate this field**

Immediately after the `ensureCurrent` function (unchanged by Group B), add:

```js
function ensureAvatarSeed(npc) {
  if (!npc.avatarSeed) {
    npc.avatarSeed = generateAvatarSeed();
  }
}
```

- [ ] **Step 4: Wire the avatar into `renderFullCard`'s layout**

`renderFullCard` (as it stands post-Group-B) starts like this:

```js
function renderFullCard(npc, ctx, savedEntry, mode = 'view') {
  ensureCurrent(npc);
  const card = document.createElement('div');
  card.className = 'card';
  card.classList.toggle('is-editing', mode === 'edit');

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <div id="edit-toggle" class="row-flex-wrap mb-0-5"></div>
    <div id="name-section" class="row-flex-wrap mb-0-5"></div>
    <div id="archetype-section" class="mb-0-5"></div>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
    <div id="motivation-section" class="mb-0-75"></div>
    <div id="path-section" class="mb-0-5"></div>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
  `;
```

Replace the first six lines (`ensureCurrent(npc);` through the `card.classList.toggle` line) and the `card.innerHTML` assignment with:

```js
function renderFullCard(npc, ctx, savedEntry, mode = 'view') {
  ensureCurrent(npc);
  ensureAvatarSeed(npc);
  const card = document.createElement('div');
  card.className = 'card';
  card.classList.toggle('is-editing', mode === 'edit');

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <div id="edit-toggle" class="row-flex-wrap mb-0-5"></div>
    <div class="row-flex-wrap mb-0-5">
      <div id="avatar-section" class="npc-avatar"></div>
      <div id="name-section" class="row-flex-wrap flex-1"></div>
    </div>
    <div id="archetype-section" class="mb-0-5"></div>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
    <div id="motivation-section" class="mb-0-75"></div>
    <div id="path-section" class="mb-0-5"></div>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
  `;
```

(Everything from `function rerender(newMode) {` onward is unchanged by this step — Task 2's Step 5 edits the name-section block specifically.)

- [ ] **Step 5: Render the avatar and add the "Regenerate Avatar" edit-mode control**

`renderFullCard`'s name-section block (post-Group-B) reads:

```js
  const nameSectionEl = card.querySelector('#name-section');
  if (mode === 'view') {
    const nameDisplay = document.createElement('span');
    nameDisplay.className = 'input-name';
    nameDisplay.textContent = npc.name;
    nameSectionEl.appendChild(nameDisplay);
  } else {
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-name';
    nameInput.value = npc.name;
    nameInput.addEventListener('change', () => {
      const v = nameInput.value.trim();
      npc.name = v || npc.name;
      nameInput.value = npc.name;
    });
    const regenBtn = document.createElement('button');
    regenBtn.textContent = 'Regenerate Name';
    regenBtn.className = 'secondary';
    regenBtn.addEventListener('click', () => {
      npc.name = generateName(ctx.nameData);
      nameInput.value = npc.name;
    });
    nameSectionEl.appendChild(nameInput);
    nameSectionEl.appendChild(regenBtn);
  }
```

Replace it with:

```js
  const avatarSectionEl = card.querySelector('#avatar-section');
  avatarSectionEl.innerHTML = renderAvatarSvg(npc.avatarSeed, 64);

  const nameSectionEl = card.querySelector('#name-section');
  if (mode === 'view') {
    const nameDisplay = document.createElement('span');
    nameDisplay.className = 'input-name';
    nameDisplay.textContent = npc.name;
    nameSectionEl.appendChild(nameDisplay);
  } else {
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-name';
    nameInput.value = npc.name;
    nameInput.addEventListener('change', () => {
      const v = nameInput.value.trim();
      npc.name = v || npc.name;
      nameInput.value = npc.name;
    });
    const regenBtn = document.createElement('button');
    regenBtn.textContent = 'Regenerate Name';
    regenBtn.className = 'secondary';
    regenBtn.addEventListener('click', () => {
      npc.name = generateName(ctx.nameData);
      nameInput.value = npc.name;
    });
    const regenAvatarBtn = document.createElement('button');
    regenAvatarBtn.textContent = 'Regenerate Avatar';
    regenAvatarBtn.className = 'secondary';
    regenAvatarBtn.addEventListener('click', () => {
      npc.avatarSeed = generateAvatarSeed();
      avatarSectionEl.innerHTML = renderAvatarSvg(npc.avatarSeed, 64);
    });
    nameSectionEl.appendChild(nameInput);
    nameSectionEl.appendChild(regenBtn);
    nameSectionEl.appendChild(regenAvatarBtn);
  }
```

- [ ] **Step 6: Add a small avatar thumbnail to each Full NPC entry in the Saved NPCs list**

`renderSavedList` (unchanged by Group B, so this is the version currently on disk) has this block inside the `else` branch (non-deleted entries):

```js
    } else {
      const nameBtn = document.createElement('button');
      nameBtn.textContent = entry.data?.name || '(unnamed)';
      nameBtn.className = 'secondary';
      nameBtn.style.flex = '1';
      nameBtn.style.textAlign = 'left';
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note });
        output.appendChild(card);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'secondary';
      removeBtn.addEventListener('click', () => removeNpc(entry.id));

      row.appendChild(nameBtn);
      row.appendChild(removeBtn);
    }
```

Replace it with:

```js
    } else {
      if (entry.kind === 'full') {
        const thumbSeed = entry.data?.avatarSeed || entry.id;
        const thumb = document.createElement('span');
        thumb.className = 'npc-avatar-thumb';
        thumb.innerHTML = renderAvatarSvg(thumbSeed, 28);
        row.appendChild(thumb);
      }

      const nameBtn = document.createElement('button');
      nameBtn.textContent = entry.data?.name || '(unnamed)';
      nameBtn.className = 'secondary';
      nameBtn.style.flex = '1';
      nameBtn.style.textAlign = 'left';
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note });
        output.appendChild(card);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'secondary';
      removeBtn.addEventListener('click', () => removeNpc(entry.id));

      row.appendChild(nameBtn);
      row.appendChild(removeBtn);
    }
```

(For Full NPC entries saved before this feature existed, `entry.data.avatarSeed` is `undefined` and the fallback uses the stable per-entry `entry.id` as the seed instead — deterministic for that entry going forward, and once the card is opened, edited, and saved again, `ensureAvatarSeed` will backfill a real `avatarSeed` onto the data itself.)

- [ ] **Step 7: Add avatar CSS**

At the end of `css/style.css`, add:

```css
.npc-avatar svg { display: block; width: 3.5rem; height: 3.5rem; border-radius: 50%; border: 1px solid var(--border); background: var(--surface-raised); }
.npc-avatar-thumb svg { display: block; width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 1px solid var(--border); background: var(--surface-raised); }
```

- [ ] **Step 8: Bump the cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v10';` to `const CACHE = 'cc-gm-v11';` (the contents of `js/npc-gen.js` and `css/style.css`, both already in `ASSETS`, have changed).

- [ ] **Step 9: Verify in browser**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli eval "document.querySelector('.npc-avatar svg') ? document.querySelector('.npc-avatar svg').getAttribute('viewBox') : 'MISSING'"
```
Expected: not `MISSING` — an SVG `viewBox` string like `0 0 762 762`.

```bash
playwright-cli click "role=button[name='Edit']"
playwright-cli find "Regenerate Avatar"
playwright-cli eval "document.querySelector('.npc-avatar svg').outerHTML.length"
playwright-cli click "role=button[name='Regenerate Avatar']"
playwright-cli eval "document.querySelector('.npc-avatar svg').outerHTML.length"
```
Expected: `Regenerate Avatar` found in edit mode; clicking it changes the SVG markup (the two `outerHTML.length` reads are not required to differ in value, but visually re-run this a couple of times if they happen to match by coincidence — the important check is no error is thrown and a `<svg>` is still present after the click).

Note: while in edit mode there are two buttons both labeled exactly `Save` — the mode-toggle Save at the top of the card (from Group B, returns to view mode) and `appendSaveControls`' library Save (persists to the saved list) — so `role=button[name='Save']` is ambiguous here. Return to view mode first (making the toggle button read `Edit` again and leaving only one `Save` button on the page), then use the now-unambiguous library Save:

```bash
playwright-cli click "css=#edit-toggle button"
playwright-cli find "Edit"
playwright-cli click "role=button[name='Save']"
playwright-cli eval "document.querySelectorAll('#npc-saved-list .npc-avatar-thumb svg').length"
playwright-cli close
kill %1
```
Expected: `Edit` found after the toggle click (confirms we're back in view mode); after clicking the library Save, at least `1` (a thumbnail renders next to the saved entry in the list).

- [ ] **Step 10: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/npc-gen.js css/style.css sw.js
git commit -m "feat: render deterministic seeded avatars on the Full NPC card and saved list"
```

---

## Task 3: Voice mechanics (Pace, Volume, Pitch, Formality)

**Files:**
- Modify: `js/npc-gen.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `buildSelectCustomField` (mode-aware, from Group B), `mode` from `renderFullCard`.
- Produces: `npc.voice = { pace, volume, pitch, formality }` on Full NPC data.

- [ ] **Step 1: Add the four option constants**

Near the top of `js/npc-gen.js`, after the `STAT_ABBR`/`DEFENSE_ABBR` constants (unchanged by Group B), add:

```js
const VOICE_PACE = ['Fast', 'Measured', 'Slow'];
const VOICE_VOLUME = ['Loud', 'Normal', 'Quiet'];
const VOICE_PITCH = ['High', 'Mid', 'Low'];
const VOICE_FORMALITY = ['Formal', 'Casual', 'Blunt'];
```

- [ ] **Step 2: Generate voice at NPC creation**

In `generateFullNpc`, add a `voice` object to the returned NPC, right after `avatarSeed` (added in Task 2):

```js
  return {
    name: generateName(nameData),
    avatarSeed: generateAvatarSeed(),
    voice: {
      pace: pick(VOICE_PACE),
      volume: pick(VOICE_VOLUME),
      pitch: pick(VOICE_PITCH),
      formality: pick(VOICE_FORMALITY),
    },
    motivation: pick(motivations),
    archetype: archetype.name,
```

- [ ] **Step 3: Add a defensive backfill for pre-existing saved NPCs**

Immediately after `ensureAvatarSeed` (added in Task 2), add:

```js
function ensureVoice(npc) {
  if (!npc.voice) {
    npc.voice = {
      pace: pick(VOICE_PACE),
      volume: pick(VOICE_VOLUME),
      pitch: pick(VOICE_PITCH),
      formality: pick(VOICE_FORMALITY),
    };
  }
}
```

- [ ] **Step 4: Call the backfill and add the Voice section to the card template**

In `renderFullCard`, in the setup block edited by Task 2 Step 4, add the `ensureVoice(npc);` call and the new template markup. The block should now read:

```js
function renderFullCard(npc, ctx, savedEntry, mode = 'view') {
  ensureCurrent(npc);
  ensureAvatarSeed(npc);
  ensureVoice(npc);
  const card = document.createElement('div');
  card.className = 'card';
  card.classList.toggle('is-editing', mode === 'edit');

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <div id="edit-toggle" class="row-flex-wrap mb-0-5"></div>
    <div class="row-flex-wrap mb-0-5">
      <div id="avatar-section" class="npc-avatar"></div>
      <div id="name-section" class="row-flex-wrap flex-1"></div>
    </div>
    <div id="archetype-section" class="mb-0-5"></div>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
    <h3 class="h3-section">Voice</h3>
    <div id="voice-section" class="row-flex-wrap mb-0-5"></div>
    <div id="motivation-section" class="mb-0-75"></div>
    <div id="path-section" class="mb-0-5"></div>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
  `;
```

- [ ] **Step 5: Build the four Voice fields**

In `renderFullCard`, right after the demographics fields block (`demoSectionEl.appendChild(sexualityField.el);`), add:

```js
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

- [ ] **Step 6: Include Voice in the copy-to-text output**

`npcToText` (unchanged by Group B) currently returns a template string ending in `...Ability: ${npc.ability.name} — ${npc.ability.description}`. Change the return statement from:

```js
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\nMotivation: ${npc.motivation.name}\n${pathLine}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
```

to:

```js
  const voiceLine = npc.voice
    ? `Voice: ${npc.voice.pace}, ${npc.voice.volume}, ${npc.voice.pitch} pitch, ${npc.voice.formality}\n`
    : '';
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\n${voiceLine}Motivation: ${npc.motivation.name}\n${pathLine}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
```

- [ ] **Step 7: Bump the cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v11';` to `const CACHE = 'cc-gm-v12';`.

- [ ] **Step 8: Verify in browser**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "Pace"
playwright-cli find "Volume"
playwright-cli find "Pitch"
playwright-cli find "Formality"
playwright-cli click "role=button[name='Edit']"
playwright-cli eval "document.querySelectorAll('#voice-section select').length"
playwright-cli close
kill %1
```
Expected: `Pace`, `Volume`, `Pitch`, `Formality` labels all found in view mode; `4` selects present in edit mode.

- [ ] **Step 9: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/npc-gen.js sw.js
git commit -m "feat: add Voice fields (Pace, Volume, Pitch, Formality) to Full NPC card"
```

---

## Task 4: Quirks/mannerisms data file and field

**Files:**
- Create: `data/quirks.json`
- Modify: `js/npc-gen.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `buildNamedDescField` (mode-aware, from Group B).
- Produces: `data/quirks.json` (array of `{name, description}`, 24 entries), fetched into `ctx.quirks` in `init()`. `npc.quirk = { name, description }` on Full NPC data.

- [ ] **Step 1: Create the quirks data file**

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

- [ ] **Step 2: Register the file in the service worker and bump the cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v12';` to `const CACHE = 'cc-gm-v13';`, and in `ASSETS`, add a line after `'./data/archetypes.json',` (or after `'./data/stat-skill-glossary.json',` if Group B's Task 1 line is present):

```js
  './data/quirks.json',
```

- [ ] **Step 3: Verify the file is valid JSON with 24 entries**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -c "import json; d = json.load(open('data/quirks.json')); assert len(d) == 24, len(d); assert all('name' in e and 'description' in e for e in d); print('OK', len(d))"
```
Expected: `OK 24`.

- [ ] **Step 4: Load quirks in `init()` and thread it through `ctx` and `generateFullNpc`**

`init()`'s data-loading block (post-Group-B, per Task 2 Step 3 of the Group B plan) reads:

```js
  let nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossaryList;
  try {
    [nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossaryList] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
      loadJson('data/motivations.json'),
      loadJson('data/paths.json'),
      loadJson('data/gifts-burdens.json'),
      loadJson('data/skills.json'),
      loadJson('data/abilities.json'),
      loadJson('data/archetypes.json'),
      loadGlossary(),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const output = container.querySelector('#npc-output');
  const savedListEl = container.querySelector('#npc-saved-list');
  const glossary = new Map(glossaryList.map(g => [g.name, g.description]));
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossary };
```

Replace it with:

```js
  let nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossaryList, quirks;
  try {
    [nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossaryList, quirks] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
      loadJson('data/motivations.json'),
      loadJson('data/paths.json'),
      loadJson('data/gifts-burdens.json'),
      loadJson('data/skills.json'),
      loadJson('data/abilities.json'),
      loadJson('data/archetypes.json'),
      loadGlossary(),
      loadJson('data/quirks.json'),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const output = container.querySelector('#npc-output');
  const savedListEl = container.querySelector('#npc-saved-list');
  const glossary = new Map(glossaryList.map(g => [g.name, g.description]));
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossary, quirks };
```

- [ ] **Step 5: Pass `quirks` into `generateFullNpc` at the Full NPC button call site**

In `init()`, the `btnFull` click handler currently reads:

```js
  btnFull.addEventListener('click', () => {
    setActiveMode('full');
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, ctx, undefined));
  });
```

Change the `generateFullNpc(...)` call to:

```js
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype, quirks });
```

- [ ] **Step 6: Generate a quirk at NPC creation**

In `generateFullNpc`'s signature and body, add `quirks` to the destructured parameters and `quirk` to the returned object:

```js
function generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype, quirks }) {
```

```js
  return {
    name: generateName(nameData),
    avatarSeed: generateAvatarSeed(),
    voice: {
      pace: pick(VOICE_PACE),
      volume: pick(VOICE_VOLUME),
      pitch: pick(VOICE_PITCH),
      formality: pick(VOICE_FORMALITY),
    },
    motivation: pick(motivations),
    quirk: pick(quirks),
    archetype: archetype.name,
```

- [ ] **Step 7: Add a defensive backfill for pre-existing saved NPCs**

Immediately after `ensureVoice` (added in Task 3), add:

```js
function ensureQuirk(npc, quirks) {
  if (!npc.quirk) {
    npc.quirk = pick(quirks);
  }
}
```

- [ ] **Step 8: Call the backfill and add the Quirk section to the card**

In `renderFullCard`'s setup block, add the `ensureQuirk(npc, ctx.quirks);` call and the `#quirk-section` div. The block (as modified by Task 3 Step 4) should now read:

```js
function renderFullCard(npc, ctx, savedEntry, mode = 'view') {
  ensureCurrent(npc);
  ensureAvatarSeed(npc);
  ensureVoice(npc);
  ensureQuirk(npc, ctx.quirks);
  const card = document.createElement('div');
  card.className = 'card';
  card.classList.toggle('is-editing', mode === 'edit');

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <div id="edit-toggle" class="row-flex-wrap mb-0-5"></div>
    <div class="row-flex-wrap mb-0-5">
      <div id="avatar-section" class="npc-avatar"></div>
      <div id="name-section" class="row-flex-wrap flex-1"></div>
    </div>
    <div id="archetype-section" class="mb-0-5"></div>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
    <h3 class="h3-section">Voice</h3>
    <div id="voice-section" class="row-flex-wrap mb-0-5"></div>
    <div id="motivation-section" class="mb-0-75"></div>
    <div id="quirk-section" class="mb-0-75"></div>
    <div id="path-section" class="mb-0-5"></div>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
  `;
```

- [ ] **Step 9: Render the Quirk field**

Right after the Motivation field block (`card.querySelector('#motivation-section').appendChild(...)`), add:

```js
  card.querySelector('#quirk-section').appendChild(
    buildNamedDescField({
      label: 'Quirk',
      current: npc.quirk,
      options: ctx.quirks,
      onChange: v => { npc.quirk = v; },
      mode,
    }).el
  );
```

- [ ] **Step 10: Include Quirk in the copy-to-text output**

In `npcToText` (already modified by Task 3 Step 6 to add `voiceLine`), add a `quirkLine` right after it and splice it into the returned template:

```js
  const voiceLine = npc.voice
    ? `Voice: ${npc.voice.pace}, ${npc.voice.volume}, ${npc.voice.pitch} pitch, ${npc.voice.formality}\n`
    : '';
  const quirkLine = npc.quirk
    ? `Quirk: ${npc.quirk.name} — ${npc.quirk.description}\n`
    : '';
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\n${voiceLine}${quirkLine}Motivation: ${npc.motivation.name}\n${pathLine}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
```

- [ ] **Step 11: Verify in browser**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "Quirk"
playwright-cli click "role=button[name='Edit']"
playwright-cli eval "!!document.querySelector('#quirk-section select')"
playwright-cli close
kill %1
```
Expected: `Quirk` label found in view mode; `true` for the select-present check in edit mode.

- [ ] **Step 12: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add data/quirks.json js/npc-gen.js sw.js
git commit -m "feat: add curated Quirk field to Full NPC card"
```

---

## Task 5: Tagging (data layer + chip UI on both card kinds)

**Files:**
- Modify: `js/npc-storage.js`
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Produces: `saveNpc({ kind, data, note, tags })` and `updateNpc(id, { data, note, tags })` in `js/npc-storage.js`, both accepting an optional `tags: string[]` (trimmed, non-empty strings, defaulting to `[]`). `getAll()` entries now always include a `tags: string[]` array. `exportAll()`/`importMerge()` carry `tags` through, and `importMerge`'s duplicate check now also compares tags. `appendSaveControls` (unchanged signature/return from Group B: `appendSaveControls(card, kind, npc, savedEntry)` returning `{ getSavedId }`) now also renders a tag-chip input and persists tag changes. `renderSavedList`'s two `savedEntry` object literals (passed into `renderFullCard`/`renderQuickCard` when reopening a saved entry) gain a `tags` property — **this is required**, not cosmetic: `appendSaveControls` reads `savedEntry.tags` to seed its chip UI, and without this fix, reopening any saved NPC and clicking Save would silently overwrite its stored tags with `[]`.

- [ ] **Step 1: Add tag defaulting/validation to `npc-storage.js`'s `load()`, `saveNpc()`, `updateNpc()`, `getAll()`**

Replace the whole file's relevant functions. `load()` currently reads:

```js
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { npcs: [] };
    const parsed = JSON.parse(raw);
    const npcs = Array.isArray(parsed.npcs) ? parsed.npcs.filter(n => n && !n.deleted) : [];
    return { npcs };
  } catch {
    return { npcs: [] };
  }
}
```

Replace with:

```js
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { npcs: [] };
    const parsed = JSON.parse(raw);
    const npcs = Array.isArray(parsed.npcs)
      ? parsed.npcs
          .filter(n => n && !n.deleted)
          .map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags.filter(t => typeof t === 'string') : [] }))
      : [];
    return { npcs };
  } catch {
    return { npcs: [] };
  }
}
```

`getAll()` currently reads:

```js
export function getAll() {
  return state.npcs.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)) }));
}
```

Replace with:

```js
export function getAll() {
  return state.npcs.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)), tags: [...(n.tags || [])] }));
}
```

`saveNpc` currently reads:

```js
export function saveNpc({ kind, data, note }) {
  const id = generateId();
  state.npcs.push({ id, kind, data: JSON.parse(JSON.stringify(data)), note: note || '', savedAt: Date.now(), deleted: false });
  notify();
  return id;
}
```

Replace with:

```js
function normalizeTags(tags) {
  return Array.isArray(tags) ? [...new Set(tags.map(t => String(t).trim()).filter(Boolean))] : [];
}

export function saveNpc({ kind, data, note, tags }) {
  const id = generateId();
  state.npcs.push({
    id,
    kind,
    data: JSON.parse(JSON.stringify(data)),
    note: note || '',
    tags: normalizeTags(tags),
    savedAt: Date.now(),
    deleted: false,
  });
  notify();
  return id;
}
```

`updateNpc` currently reads:

```js
export function updateNpc(id, { data, note } = {}) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = JSON.parse(JSON.stringify(data));
  if (note !== undefined) entry.note = note;
  notify();
}
```

Replace with:

```js
export function updateNpc(id, { data, note, tags } = {}) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = JSON.parse(JSON.stringify(data));
  if (note !== undefined) entry.note = note;
  if (tags !== undefined) entry.tags = normalizeTags(tags);
  notify();
}
```

- [ ] **Step 2: Extend `importMerge`'s duplicate check to include tags**

`importMerge` currently reads:

```js
export function importMerge(jsonString) {
  let imported;
  try {
    imported = JSON.parse(jsonString);
  } catch {
    return 0;
  }
  if (!Array.isArray(imported)) return 0;

  let added = 0;
  for (const item of imported) {
    if (!item || typeof item !== 'object') continue;
    const { kind, data } = item;
    const note = item.note || '';
    if (kind !== 'quick' && kind !== 'full') continue;
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') continue;
    const isDuplicate = state.npcs.some(n =>
      !n.deleted &&
      n.kind === kind &&
      n.note === note &&
      JSON.stringify(n.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.npcs.push({ id: generateId(), kind, data, note, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}
```

Replace with:

```js
export function importMerge(jsonString) {
  let imported;
  try {
    imported = JSON.parse(jsonString);
  } catch {
    return 0;
  }
  if (!Array.isArray(imported)) return 0;

  let added = 0;
  for (const item of imported) {
    if (!item || typeof item !== 'object') continue;
    const { kind, data } = item;
    const note = item.note || '';
    const tags = normalizeTags(item.tags);
    if (kind !== 'quick' && kind !== 'full') continue;
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') continue;
    const isDuplicate = state.npcs.some(n =>
      !n.deleted &&
      n.kind === kind &&
      n.note === note &&
      JSON.stringify([...(n.tags || [])].sort()) === JSON.stringify([...tags].sort()) &&
      JSON.stringify(n.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.npcs.push({ id: generateId(), kind, data, note, tags, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}
```

(`exportAll()` needs no code change — it already serializes each full entry object via `JSON.stringify(state.npcs.filter(n => !n.deleted), null, 2)`, and `tags` is now always present on every entry, so it's carried through automatically.)

- [ ] **Step 3: Add the tag-chip UI to `appendSaveControls`**

`appendSaveControls` (post-Group-B, per Task 3 Step 4 of the Group B plan, which added the `return { getSavedId: () => savedId };` at the end) currently reads:

```js
function appendSaveControls(card, kind, npc, savedEntry) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '0.75rem';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.style.display = 'block';
  label.style.color = 'var(--muted)';
  label.style.fontSize = '0.8rem';
  label.style.marginBottom = '0.25rem';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.style.width = '100%';
  textarea.style.resize = 'vertical';
  textarea.value = savedEntry ? savedEntry.note : '';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.style.marginTop = '0.5rem';

  let savedId = savedEntry ? savedEntry.id : null;
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateNpc(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      updateNpc(savedId, { data: npc, note: textarea.value });
    } else {
      savedId = saveNpc({ kind, data: npc, note: textarea.value });
      saveBtn.textContent = 'Saved ✓';
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return { getSavedId: () => savedId };
}
```

Replace the whole function with:

```js
function appendSaveControls(card, kind, npc, savedEntry) {
  const wrap = document.createElement('div');
  wrap.className = 'save-controls-wrap';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.className = 'field-label';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.className = 'textarea-full';
  textarea.value = savedEntry ? savedEntry.note : '';

  let savedId = savedEntry ? savedEntry.id : null;
  let tags = savedEntry && Array.isArray(savedEntry.tags) ? [...savedEntry.tags] : [];

  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags';
  tagsLabel.className = 'field-label mt-0-5';

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'tag-chips-wrap';

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'tag-input mt-0-5';
  tagInput.placeholder = 'Add tag, press Enter';

  function renderChips() {
    chipsWrap.innerHTML = '';
    tags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      const text = document.createElement('span');
      text.textContent = tag;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.className = 'tag-chip-remove';
      removeBtn.addEventListener('click', () => {
        tags.splice(i, 1);
        renderChips();
        if (savedId) updateNpc(savedId, { tags });
      });
      chip.appendChild(text);
      chip.appendChild(removeBtn);
      chipsWrap.appendChild(chip);
    });
  }
  renderChips();

  function commitTag() {
    const v = tagInput.value.trim();
    tagInput.value = '';
    if (!v || tags.includes(v)) return;
    tags.push(v);
    renderChips();
    if (savedId) updateNpc(savedId, { tags });
  }

  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    }
  });
  tagInput.addEventListener('blur', () => commitTag());

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary mt-0-5';
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateNpc(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      updateNpc(savedId, { data: npc, note: textarea.value, tags });
    } else {
      savedId = saveNpc({ kind, data: npc, note: textarea.value, tags });
      saveBtn.textContent = 'Saved ✓';
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(tagsLabel);
  wrap.appendChild(chipsWrap);
  wrap.appendChild(tagInput);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return { getSavedId: () => savedId };
}
```

(This function is shared by both `renderQuickCard` and `renderFullCard` already — no call-site changes are needed, so tags work identically on both Quick and Full NPCs, per the spec.)

- [ ] **Step 4: Pass `tags` into the `savedEntry` objects `renderSavedList` builds when reopening a saved NPC**

`appendSaveControls` (Step 3, above) reads `savedEntry.tags` to seed its chip UI when a saved NPC is reopened from the library. Without this step, `renderSavedList`'s `savedEntry` object literals still only carry `id` and `note` (as re-quoted verbatim in Task 2 Step 6, since Task 2 predates tags entirely), so reopening any saved NPC would show it with zero tags regardless of what's actually stored — and clicking Save on that reopened card would call `updateNpc(savedId, { data, note, tags: [] })`, silently erasing the entry's real tags. Fix the object literals themselves.

`renderSavedList` (as modified by Task 2 Step 6) has this block inside the `else` branch (non-deleted entries):

```js
    } else {
      if (entry.kind === 'full') {
        const thumbSeed = entry.data?.avatarSeed || entry.id;
        const thumb = document.createElement('span');
        thumb.className = 'npc-avatar-thumb';
        thumb.innerHTML = renderAvatarSvg(thumbSeed, 28);
        row.appendChild(thumb);
      }

      const nameBtn = document.createElement('button');
      nameBtn.textContent = entry.data?.name || '(unnamed)';
      nameBtn.className = 'secondary';
      nameBtn.style.flex = '1';
      nameBtn.style.textAlign = 'left';
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note });
        output.appendChild(card);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'secondary';
      removeBtn.addEventListener('click', () => removeNpc(entry.id));

      row.appendChild(nameBtn);
      row.appendChild(removeBtn);
    }
```

Change only the two `savedEntry` object literals passed into `renderFullCard`/`renderQuickCard`:

```js
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note, tags: entry.tags })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note, tags: entry.tags });
        output.appendChild(card);
      });
```

- [ ] **Step 5: Add tag chip CSS**

At the end of `css/style.css`, add:

```css
.tag-chips-wrap { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.15rem 0.3rem 0.15rem 0.6rem;
  font-size: 0.8rem;
}
.tag-chip-remove {
  background: none;
  border: none;
  color: var(--muted);
  padding: 0 0.2rem;
  font-size: 0.9rem;
  line-height: 1;
}
.tag-chip-remove:hover { color: var(--danger); opacity: 1; }
.tag-input { width: 100%; }
```

- [ ] **Step 6: Bump the cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v13';` to `const CACHE = 'cc-gm-v14';`.

- [ ] **Step 7: Verify in browser**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Quick NPC"
playwright-cli fill "css=.tag-input" "friendly"
playwright-cli press "Enter"
playwright-cli find "friendly"
playwright-cli fill "css=.tag-input" "merchant"
playwright-cli press "Enter"
playwright-cli eval "document.querySelectorAll('.tag-chip').length"
```
Expected: `friendly` found after Enter; `2` chips present after adding a second tag.

```bash
playwright-cli click "role=button[name='Save']"
playwright-cli eval "document.querySelectorAll('.tag-chip').length"
```
Expected: still `2` chips immediately after the first Save.

Now verify the bug fixed by Step 4 above — that reopening this saved NPC from the library still shows both tags, and re-saving does not wipe them:

```bash
playwright-cli click "css=#npc-saved-list button.secondary >> nth=0"
playwright-cli eval "document.querySelectorAll('.tag-chip').length"
playwright-cli click "role=button[name='Save']"
playwright-cli click "css=#npc-saved-list button.secondary >> nth=0"
playwright-cli eval "document.querySelectorAll('.tag-chip').length"
```
Expected: `2` both times — reopening the saved entry from the list shows its two existing tags (not `0`), and clicking Save again does not lose them.

```bash
playwright-cli click "css=.tag-chip-remove"
playwright-cli eval "document.querySelectorAll('.tag-chip').length"
playwright-cli close
kill %1
```
Expected: removing one chip drops the count to `1` and (since the entry is now saved) persists immediately without needing another Save click.

- [ ] **Step 8: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/npc-storage.js js/npc-gen.js css/style.css sw.js
git commit -m "feat: add tag chips to Quick and Full NPC cards, persisted on the saved-library entry"
```

---

## Task 6: Search bar over the Saved NPCs list

**Files:**
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `entry.tags` (Task 5) and `entry.data.name` from `getAll()`.
- Produces: `renderSavedList(listEl, output, ctx, query = '')` — gains a fourth parameter. No other function's signature changes.

- [ ] **Step 1: Add the search input to the panel template**

In `init()`, the container template currently has this "Saved NPCs" card block:

```html
    <div class="card" style="margin-top:1.5rem;">
      <h3 style="margin-bottom:0.5rem;">Saved NPCs</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
        <button id="npc-export-all" class="secondary">Export All</button>
        <button id="npc-import" class="secondary">Import</button>
        <input id="npc-import-file" type="file" accept="application/json" style="display:none;">
        <span id="npc-import-status" style="color:var(--muted);font-size:0.85rem;"></span>
      </div>
      <div id="npc-saved-list"></div>
    </div>
```

Add a search input between the export/import row and the list container:

```html
    <div class="card" style="margin-top:1.5rem;">
      <h3 style="margin-bottom:0.5rem;">Saved NPCs</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
        <button id="npc-export-all" class="secondary">Export All</button>
        <button id="npc-import" class="secondary">Import</button>
        <input id="npc-import-file" type="file" accept="application/json" style="display:none;">
        <span id="npc-import-status" style="color:var(--muted);font-size:0.85rem;"></span>
      </div>
      <input id="npc-search" type="text" class="search-input mb-0-75" placeholder="Search by name or tag...">
      <div id="npc-saved-list"></div>
    </div>
```

- [ ] **Step 2: Wire the search input, and pass the live query into every `renderSavedList` call site**

`init()` currently has:

```js
  const output = container.querySelector('#npc-output');
  const savedListEl = container.querySelector('#npc-saved-list');
  const glossary = new Map(glossaryList.map(g => [g.name, g.description]));
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossary, quirks };
  renderSavedList(savedListEl, output, ctx);
  subscribe(() => renderSavedList(savedListEl, output, ctx));
```

Replace it with:

```js
  const output = container.querySelector('#npc-output');
  const savedListEl = container.querySelector('#npc-saved-list');
  const searchInput = container.querySelector('#npc-search');
  const glossary = new Map(glossaryList.map(g => [g.name, g.description]));
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes, glossary, quirks };

  let searchQuery = '';
  renderSavedList(savedListEl, output, ctx, searchQuery);
  subscribe(() => renderSavedList(savedListEl, output, ctx, searchQuery));
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderSavedList(savedListEl, output, ctx, searchQuery);
  });
```

- [ ] **Step 3: Filter entries in `renderSavedList`**

`renderSavedList` currently starts:

```js
function renderSavedList(listEl, output, ctx) {
  const entries = getAll();
  listEl.innerHTML = '';
  if (entries.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No saved NPCs yet.</p>';
    return;
  }
  entries.forEach(entry => {
```

Replace the signature and the empty-state check with:

```js
function renderSavedList(listEl, output, ctx, query = '') {
  const allEntries = getAll();
  const entries = query
    ? allEntries.filter(entry => {
        const name = (entry.data?.name || '').toLowerCase();
        const tags = (entry.tags || []).map(t => t.toLowerCase());
        return name.includes(query) || tags.some(t => t.includes(query));
      })
    : allEntries;
  listEl.innerHTML = '';
  if (entries.length === 0) {
    listEl.innerHTML = query
      ? '<p style="color:var(--muted);font-size:0.85rem;">No saved NPCs match your search.</p>'
      : '<p style="color:var(--muted);font-size:0.85rem;">No saved NPCs yet.</p>';
    return;
  }
  entries.forEach(entry => {
```

(The rest of `renderSavedList`'s body — the `forEach` loop over `entries`, including Task 2's avatar-thumbnail addition — is unchanged.)

- [ ] **Step 4: Add search input CSS**

At the end of `css/style.css`, add:

```css
.search-input { display: block; width: 100%; }
```

- [ ] **Step 5: Bump the cache version**

In `sw.js`, change `const CACHE = 'cc-gm-v14';` to `const CACHE = 'cc-gm-v15';`.

- [ ] **Step 6: Verify in browser**

```bash
cd /Users/bretjb/dev/coyote-crow
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Quick NPC"
playwright-cli click "role=button[name='Save']"
playwright-cli eval "document.querySelectorAll('#npc-saved-list button.secondary').length"
```
Expected: at least `1` (the newly saved entry's name button, plus a remove button per entry).

```bash
playwright-cli fill "#npc-search" "zzz-no-such-npc-zzz"
playwright-cli find "No saved NPCs match your search"
playwright-cli fill "#npc-search" ""
playwright-cli find "No saved NPCs match your search"
playwright-cli close
kill %1
```
Expected: the no-match message appears for a nonsense query, and is gone again once the search box is cleared.

- [ ] **Step 7: Commit**

```bash
cd /Users/bretjb/dev/coyote-crow
git add js/npc-gen.js css/style.css sw.js
git commit -m "feat: add live search over the Saved NPCs list by name and tag"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Avatars — vendoring (Task 1), data model + card rendering + regenerate control + saved-list thumbnail (Task 2). Voice mechanics — four fields via `buildSelectCustomField` (Task 3). Quirks — curated 24-entry data file rendered via `buildNamedDescField` (Task 4). Tagging + search — entry-level `tags` field with validation/defensive-read/import-dedup extension (Task 5, `npc-storage.js`), chip UI shared by both Quick and Full cards via `appendSaveControls` (Task 5, `npc-gen.js`), live search box filtering by name or tag (Task 6). Quick NPCs correctly get no avatar/voice/quirk (those only touch `renderFullCard`/`generateFullNpc`) but do get tags (via the shared `appendSaveControls`), matching the spec's "tags apply to both Quick and Full NPCs alike" and "Quick NPCs get no avatar" requirements exactly.
- **Type/signature consistency:** `generateFullNpc`'s parameter object gains `quirks` (Task 4) alongside the pre-existing `archetype`; its return object gains `avatarSeed` (Task 2), `voice` (Task 3), `quirk` (Task 4) in that order, and each later task's diff includes the full surrounding object literal so insertion points never conflict. `renderFullCard`'s setup block (`ensureCurrent`/`ensureAvatarSeed`/`ensureVoice`/`ensureQuirk` calls plus the `card.innerHTML` template) is re-quoted in full at each task that touches it (Tasks 2, 3, 4) so a reviewer applying tasks in order always sees the exact preceding state. `saveNpc`/`updateNpc`/`importMerge` all use the same `normalizeTags()` helper (Task 5) so tag validation can't drift between the three entry points. `renderSavedList` goes from a 3-arg to a 4-arg function once, in Task 6, with a default (`query = ''`) so the two existing call sites from Task 2/5 (written against the 3-arg version, since they predate Task 6) don't need retroactive edits — Task 6 Step 2 is itself the only place the call sites get the new argument.
- **No placeholders:** every step has literal code, a literal curl/python/bash command, or a literal `playwright-cli` verification sequence with a stated expected result. Task 1's DiceBear vendoring is grounded in commands actually run during planning (not assumed) — exact URLs, exact byte counts, exact export names, and a `node`-based smoke test of `createAvatar` before any browser code depends on it.
- **Cache versioning:** every task that changes a cached file's contents or the `ASSETS` array bumps `CACHE`, once per task, in strict sequence from the Group B baseline of `cc-gm-v9` up through `cc-gm-v15`.

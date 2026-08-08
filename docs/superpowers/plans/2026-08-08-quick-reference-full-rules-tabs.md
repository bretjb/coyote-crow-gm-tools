# Quick Reference / Full Rules Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current single "Rules" tab (Quick Ref / Full Digest sub-tabs) into two top-level nav tabs — "Quick Reference" and "Full Rules" — and make the Quick Reference tab render real content from `data/rules/quick-ref.md`, broken into sub-tabs by its `##` headings.

**Architecture:** Two new ES modules (`js/quick-ref.js`, `js/full-rules.js`) replace `js/rules.js`, wired into `app.js`'s `tabInits` map under two new top-level tab buttons/panels in `index.html`. Both modules share a small helper for lazily loading the vendored `marked` library. `quick-ref.js` fetches `data/rules/quick-ref.md` once, splits the markdown text on `## ` headings client-side, and renders dynamically-built sub-tab buttons. `full-rules.js` is a thin fetch-and-render of `data/rules/full-digest.md` with no sub-tabs.

**Tech Stack:** Vanilla JS (ES modules), vendored `marked` v9.1.6 (`js/lib/md.js`), no build step, no test framework (this project uses manual browser verification only — no JS unit tests).

## Global Constraints

- No JS unit test files — every task's "test" step is manual verification by loading `index.html` in a browser and inspecting behavior/console, per project convention.
- `data/rules/quick-ref-raw.md` must NOT be deleted — it stays in place as the reference source copy.
- `data/rules/full-digest.md` is untouched — Full Rules keeps showing its existing placeholder stub content.
- Follow the existing sub-tab visual pattern exactly: active button = default button style (no extra class, or a no-op class like today's `active-sub`), inactive button = class `secondary`.

---

### Task 1: Populate `data/rules/quick-ref.md` from the raw source

**Files:**
- Modify: `data/rules/quick-ref.md` (currently 141 lines: real intro + placeholder note + leftover garbage data — replace entirely)
- Read only: `data/rules/quick-ref-raw.md` (296 lines, untouched)

**Interfaces:**
- Produces: `data/rules/quick-ref.md` containing sections 1–5 of the quick reference (everything `quick-ref.js` in Task 3 will fetch and parse), with section 6 ("Suggestions for Things to Add to a Running GM Reference") and the `---` separator before it removed.

- [ ] **Step 1: Replace quick-ref.md contents with lines 1–279 of quick-ref-raw.md**

Lines 1–279 of `quick-ref-raw.md` contain the H1 title plus sections 1 ("The D12 System") through 5 ("Damage, States & Healing"), ending with the Fortitude TODO line. Line 280 is blank, line 281 is a `---` separator, and line 283 starts section 6, which must be dropped.

Run:
```bash
sed -n '1,279p' data/rules/quick-ref-raw.md > data/rules/quick-ref.md
```

- [ ] **Step 2: Verify the output**

Run:
```bash
tail -5 data/rules/quick-ref.md
wc -l data/rules/quick-ref.md
```
Expected: last line is the Fortitude TODO line (`- **TODO: pull the full core Fortitude rule...`), no `## 6.` heading anywhere, and line count is 279.

```bash
grep -c '^## ' data/rules/quick-ref.md
```
Expected: `5` (one `## ` heading per section 1–5).

- [ ] **Step 3: Confirm quick-ref-raw.md is untouched**

Run:
```bash
git diff --stat data/rules/quick-ref-raw.md
```
Expected: no output (file unchanged).

- [ ] **Step 4: Commit**

```bash
git add data/rules/quick-ref.md
git commit -m "data: populate quick-ref.md with real GM quick-reference content"
```

---

### Task 2: Shared marked-loading helper

**Files:**
- Create: `js/lib/load-marked.js`
- Read only: `js/rules.js:1-9` (source of the logic being extracted), `js/lib/md.js` (vendored marked UMD build — sets `window.marked`, not modified)

**Interfaces:**
- Produces: `js/lib/load-marked.js` exporting `async function loadMarked()` — injects `js/lib/md.js` as a `<script>` tag the first time it's called and resolves once `window.marked` is set; on subsequent calls (from either consuming module) it resolves immediately without re-injecting the script.

- [ ] **Step 1: Write the helper**

```javascript
let loadPromise = null;

export function loadMarked() {
  if (window.marked) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/lib/md.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loadPromise;
}
```

- [ ] **Step 2: Manual verification (no automated tests in this project)**

This module has no consumers yet, so it can't be exercised in the browser until Task 3/4 wire it up. Just confirm the file has no syntax errors:

Run:
```bash
node --check js/lib/load-marked.js
```
Expected: no output (exits 0).

- [ ] **Step 3: Commit**

```bash
git add js/lib/load-marked.js
git commit -m "feat: extract shared marked-loading helper"
```

---

### Task 3: `js/full-rules.js` module

**Files:**
- Create: `js/full-rules.js`
- Read only: `js/rules.js:22-31` (existing `loadMd` logic being adapted), `data/rules/full-digest.md` (unchanged placeholder content)

**Interfaces:**
- Consumes: `loadMarked()` from `js/lib/load-marked.js` (Task 2).
- Produces: `export async function init(container)` — same signature as every other tab module in `js/app.js`'s `tabInits` map (see `js/app.js:16`, `await tabInits[name](panel)`).

- [ ] **Step 1: Write the module**

```javascript
import { loadMarked } from './lib/load-marked.js';

export async function init(container) {
  await loadMarked();

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Full Rules</h2>
    <div class="rules-body"></div>
  `;

  const contentEl = container.querySelector('.rules-body');

  try {
    const res = await fetch('data/rules/full-digest.md');
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    contentEl.innerHTML = window.marked.parse(text);
  } catch {
    contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
  }
}
```

- [ ] **Step 2: Manual verification**

Run:
```bash
node --check js/full-rules.js
```
Expected: no output (exits 0). Full browser wiring happens in Task 5; this module isn't reachable from the UI until then.

- [ ] **Step 3: Commit**

```bash
git add js/full-rules.js
git commit -m "feat: add full-rules tab module"
```

---

### Task 4: `js/quick-ref.js` module with dynamic section sub-tabs

**Files:**
- Create: `js/quick-ref.js`
- Read only: `js/rules.js` (existing patterns being adapted), `data/rules/quick-ref.md` (Task 1 output — 5 `## ` sections)

**Interfaces:**
- Consumes: `loadMarked()` from `js/lib/load-marked.js` (Task 2); `data/rules/quick-ref.md` produced by Task 1 (must contain exactly 5 `## `-prefixed section headings for this task's parsing to yield 5 sub-tabs).
- Produces: `export async function init(container)` — same signature as other tab modules.

- [ ] **Step 1: Write the section-splitting function**

Splits raw markdown into sections on lines starting with `## `. The leading H1 (`# ...`) and any text before the first `## ` is discarded (in `quick-ref.md` this is just the title line, which is redundant with the tab's own heading).

```javascript
function splitSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map(s => ({ title: s.title, markdown: s.body.join('\n').trim() }));
}
```

- [ ] **Step 2: Write the module using splitSections**

```javascript
import { loadMarked } from './lib/load-marked.js';

function splitSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map(s => ({ title: s.title, markdown: s.body.join('\n').trim() }));
}

export async function init(container) {
  await loadMarked();

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Quick Reference</h2>
    <div id="qr-subtabs" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;"></div>
    <div id="qr-content" class="rules-body"></div>
  `;

  const subtabsEl = container.querySelector('#qr-subtabs');
  const contentEl = container.querySelector('#qr-content');

  let sections;
  try {
    const res = await fetch('data/rules/quick-ref.md');
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    sections = splitSections(text);
  } catch {
    contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const buttons = sections.map((section, i) => {
    const btn = document.createElement('button');
    btn.textContent = section.title;
    if (i !== 0) btn.classList.add('secondary');
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.add('secondary'));
      btn.classList.remove('secondary');
      contentEl.innerHTML = window.marked.parse(section.markdown);
    });
    subtabsEl.appendChild(btn);
    return btn;
  });

  if (sections.length > 0) {
    contentEl.innerHTML = window.marked.parse(sections[0].markdown);
  }
}
```

- [ ] **Step 3: Manual verification**

Run:
```bash
node --check js/quick-ref.js
```
Expected: no output (exits 0).

Confirm the splitter will produce exactly 5 sections against the real data file:

```bash
node -e "
const fs = require('fs');
const text = fs.readFileSync('data/rules/quick-ref.md', 'utf8');
const lines = text.split('\n');
const titles = lines.filter(l => l.startsWith('## ')).map(l => l.slice(3).trim());
console.log(titles.length, titles);
"
```
Expected: `5 [ '1. The D12 System — Making a Check', '2. Stats (9 total, scale 1–5 typically; 5 draws attention; 6+ requires Notoriety Gift)', '3. Skills (27 General Skills; \`*\` = cannot use at Rank 0)', '4. Encounters', '5. Damage, States & Healing' ]`

- [ ] **Step 4: Commit**

```bash
git add js/quick-ref.js
git commit -m "feat: add quick-reference tab module with dynamic section sub-tabs"
```

---

### Task 5: Wire new tabs into `index.html` and `js/app.js`; remove old Rules tab

**Files:**
- Modify: `index.html:17` (tab button), `index.html:24` (tab panel)
- Modify: `js/app.js:5` (import), `js/app.js:7` (tabInits map)
- Modify: `sw.js:15` (cached asset list — swap `js/rules.js` for the two new modules)
- Delete: `js/rules.js` (fully superseded by `js/quick-ref.js` + `js/full-rules.js`)

**Interfaces:**
- Consumes: `init` exports from `js/quick-ref.js` (Task 4) and `js/full-rules.js` (Task 3), matching the `async function init(container)` signature `activateTab()` in `js/app.js:16` already expects.

- [ ] **Step 1: Update index.html nav and panels**

In `index.html`, replace line 17:
```html
    <button class="tab-btn" data-tab="rules">Rules</button>
```
with:
```html
    <button class="tab-btn" data-tab="quickref">Quick Reference</button>
    <button class="tab-btn" data-tab="fullrules">Full Rules</button>
```

Replace line 24:
```html
    <div id="tab-rules" class="tab-panel hidden"></div>
```
with:
```html
    <div id="tab-quickref" class="tab-panel hidden"></div>
    <div id="tab-fullrules" class="tab-panel hidden"></div>
```

- [ ] **Step 2: Update app.js imports and tabInits map**

Replace `js/app.js:5`:
```javascript
import { init as initRules } from './rules.js';
```
with:
```javascript
import { init as initQuickRef } from './quick-ref.js';
import { init as initFullRules } from './full-rules.js';
```

Replace `js/app.js:7`:
```javascript
const tabInits = { names: initNames, npcs: initNpcs, dice: initDice, initiative: initInitiative, rules: initRules };
```
with:
```javascript
const tabInits = { names: initNames, npcs: initNpcs, dice: initDice, initiative: initInitiative, quickref: initQuickRef, fullrules: initFullRules };
```

- [ ] **Step 3: Update sw.js's cached asset list and bump the cache version**

`sw.js:15` currently lists `'./js/rules.js'` in `ASSETS`. Replace it with the two new module paths, and bump `CACHE` on line 1 so returning users pick up the new asset list instead of a stale cache:

Replace `sw.js:1`:
```javascript
const CACHE = 'cc-gm-v1';
```
with:
```javascript
const CACHE = 'cc-gm-v2';
```

Replace `sw.js:15`:
```javascript
  './js/rules.js',
```
with:
```javascript
  './js/quick-ref.js',
  './js/full-rules.js',
```

- [ ] **Step 4: Delete the superseded module**

```bash
git rm js/rules.js
```

- [ ] **Step 5: Manual verification in browser**

Serve the app locally and check it in a browser (this project has no JS test suite — verify by hand):

```bash
python3 -m http.server 8000 --directory /Users/bretjb/dev/coyote-crow
```

Open `http://localhost:8000` and verify:
1. Nav bar shows "Quick Reference" and "Full Rules" tabs (no "Rules" tab).
2. Clicking "Quick Reference" shows 5 sub-tab buttons (one per section: D12 System, Stats, Skills, Encounters, Damage/States/Healing), with the first one active and its content rendered below.
3. Clicking each sub-tab button switches the active button styling (active = default button color, others = `secondary` gray) and swaps the rendered content without a network re-fetch (check the Network tab — only one `quick-ref.md` request total).
4. Clicking "Full Rules" shows the existing placeholder content from `full-digest.md`.
5. Open browser devtools console — no errors on load or on any tab/sub-tab click.
6. Reload the page, then unregister the old service worker in devtools (Application → Service Workers → Unregister) and hard-reload once to pick up the new `cc-gm-v2` cache. Then enable devtools "Offline" and reload again — both tabs should still render from cache without errors.

Stop the server with Ctrl+C when done.

- [ ] **Step 6: Commit**

```bash
git add index.html js/app.js sw.js
git commit -m "feat: replace Rules tab with separate Quick Reference and Full Rules tabs"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the Data section (populate quick-ref.md, leave quick-ref-raw.md untouched). Task 2 covers the shared marked-loading helper. Task 3 covers `js/full-rules.js`. Task 4 covers `js/quick-ref.js` with dynamic section parsing. Task 5 covers nav/app.js wiring and removal of the old `js/rules.js`. All spec sections are addressed.
- **Service worker caching:** confirmed `sw.js:15` lists `'./js/rules.js'` in its `ASSETS` cache manifest (the `data/rules/quick-ref.md` and `full-digest.md` paths are already listed separately and need no change). Task 5 Step 3 updates the manifest to the two new module paths and bumps `CACHE` from `cc-gm-v1` to `cc-gm-v2` so the new asset list actually takes effect for returning users instead of being masked by the old cache.
- **Type/signature consistency:** All three tab modules (`quick-ref.js`, `full-rules.js`, and existing modules) export `async function init(container)`, matching `js/app.js:16`'s `await tabInits[name](panel)` call. `loadMarked()` takes no arguments and returns a Promise in both consumers.

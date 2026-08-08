# Markov-Chain Name Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the curated-list + syllable-fallback name generator in `js/name-gen.js` with the Markov-chain (character n-gram) generator prototyped in `raw-names.js`, trained on the corpus of ~285 Adanadi name fragments.

**Architecture:** `data/names.json` is replaced with a flat JSON array of the training corpus. `js/name-gen.js` builds an order-2 n-gram model (a map from each 2-character gram to observed following characters, plus a list of word-beginning grams) once per session from that corpus, then generates each name by a random walk through the model, exactly matching `raw-names.js`'s `kagChahiNames()` algorithm. The Names tab UI (`init(container)`) is unchanged.

**Tech Stack:** Vanilla JS (ES modules), no build step, no JS test framework — this project uses manual browser verification only.

## Global Constraints

- No JS unit test files — verification is via `node --check`, `node -e` scripts, and (for the final task) a manual browser check.
- `raw-names.js` at the repo root stays in place, untracked, as a reference file — do not delete it, do not import it from the app.
- The n-gram order stays 2 and the generated-name length stays a 2-character seed plus 4–12 more predicted characters (`randomInRange(4, 12)`), matching `raw-names.js` exactly — no tuning.
- The curated-list lookup, `data._used` repeat-avoidance tracking, and the `_procedural(syllables)` fallback are deleted entirely — every generated name comes from the n-gram model.

---

### Task 1: Replace `data/names.json` with the training corpus

**Files:**
- Modify: `data/names.json` (currently 476 bytes: `{"lists": {...}, "syllables": {...}}` — replace entirely)
- Read only: `raw-names.js` (untouched; source of the corpus string)

**Interfaces:**
- Produces: `data/names.json` containing `{ "corpus": [...285 strings...] }` — the exact array Task 2's `buildModel()` will fetch and consume.

- [ ] **Step 1: Extract the corpus from raw-names.js into data/names.json**

`raw-names.js` line 1 defines `var txtToArray = "Gatsi,pahinaga,Chikan,...";` — one long comma-separated string of 285 name fragments (no escaped commas or quotes inside it). Extract it programmatically rather than hand-transcribing, to avoid transcription errors:

Run:
```bash
node -e "
const fs = require('fs');
const raw = fs.readFileSync('raw-names.js', 'utf8');
const match = raw.match(/var txtToArray = \"(.*)\";/);
if (!match) throw new Error('txtToArray pattern not found in raw-names.js');
const corpus = match[1].split(',');
fs.writeFileSync('data/names.json', JSON.stringify({ corpus }, null, 2) + '\n');
console.log('wrote', corpus.length, 'entries');
"
```
Expected output: `wrote 285 entries`

- [ ] **Step 2: Verify the output**

Run:
```bash
node -e "
const data = require('./data/names.json');
console.log(Array.isArray(data.corpus), data.corpus.length);
console.log(JSON.stringify(data.corpus.slice(0, 5)));
console.log(JSON.stringify(data.corpus.slice(-5)));
console.log('lists' in data, 'syllables' in data);
"
```
Expected output:
```
true 285
["Gatsi","pahinaga","Chikan","Na","Chimiin"]
["Thati","nipawaka","Chana","yaku","haa"]
false false
```
(the last line confirms the old `lists`/`syllables` keys are gone)

- [ ] **Step 3: Confirm raw-names.js is untouched**

Run:
```bash
git diff --stat raw-names.js
```
Expected: no output — `raw-names.js` is untracked in this repo, so `git diff --stat` on it produces nothing either way; instead confirm its content is unchanged by checking its line count:
```bash
wc -l raw-names.js
```
Expected: `43 raw-names.js` (unchanged from before this task)

- [ ] **Step 4: Commit**

```bash
git add data/names.json
git commit -m "data: replace names.json with Markov-chain training corpus"
```

---

### Task 2: Rewrite `js/name-gen.js` to generate names via the n-gram model

**Files:**
- Modify: `js/name-gen.js` (currently 74 lines: curated-list lookup + syllable fallback — replace the generation logic, keep `init()`'s UI structure)
- Read only: `data/names.json` (Task 1 output — `{ "corpus": [...285 strings...] }`), `raw-names.js` (reference for the ported algorithm)

**Interfaces:**
- Produces: `export async function loadNameData()` returning `{ corpus: string[], ngrams: Record<string, string[]>, beginnings: string[] }` (same export name as before, changed return shape).
- Produces: `export function generateName(data)` taking the object `loadNameData()` returns and returning a single generated name string (same export name and call signature as before — `js/name-gen.js`'s own `init()` is the only caller, so this is self-contained).
- Produces: `export async function init(container)` — unchanged signature, still the function `js/app.js`'s `tabInits.names` wires up.

- [ ] **Step 1: Write the new js/name-gen.js**

Replace the entire file with:

```javascript
let cachedData = null;

function buildModel(corpus) {
  const order = 2;
  const ngrams = {};
  const beginnings = [];

  for (let j = 0; j < corpus.length; j++) {
    const txt = corpus[j];
    for (let i = 0; i <= txt.length - order; i++) {
      const gram = txt.substring(i, i + order);
      if (i === 0) {
        beginnings.push(gram);
      }
      if (!ngrams[gram]) {
        ngrams[gram] = [];
      }
      ngrams[gram].push(txt.charAt(i + order));
    }
  }

  return { ngrams, beginnings };
}

export async function loadNameData() {
  if (cachedData) return cachedData;
  const res = await fetch('data/names.json');
  if (!res.ok) throw new Error('offline');
  const json = await res.json();
  const { ngrams, beginnings } = buildModel(json.corpus);
  cachedData = { corpus: json.corpus, ngrams, beginnings };
  return cachedData;
}

function capitalizeWords(str) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function randomInRange(min, max) {
  return Math.floor((Math.random() * (max - min)) + min);
}

export function generateName(data) {
  const order = 2;
  const randomBeginning = Math.floor(Math.random() * data.beginnings.length);
  let currentGram = data.beginnings[randomBeginning];
  let newName = currentGram;
  const randomNumberInRange = randomInRange(4, 12);

  for (let i = 0; i < randomNumberInRange; i++) {
    const possibilities = data.ngrams[currentGram];
    const randPossibility = Math.floor(Math.random() * possibilities.length);
    const next = possibilities[randPossibility];
    newName += next;
    const len = newName.length;
    currentGram = newName.substring(len - order, len);
  }

  return capitalizeWords(newName);
}

const history = [];

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Name Generator</h2>
    <button id="gen-name-btn">Generate Name</button>
    <div id="name-result" style="margin:1rem 0;font-size:1.4rem;"></div>
    <div id="name-history" style="color:var(--muted);"></div>
  `;

  let data;
  try {
    data = await loadNameData();
  } catch {
    container.querySelector('#name-result').className = 'error';
    container.querySelector('#name-result').textContent = 'Data unavailable — please reload while online once to enable offline use.';
    return;
  }

  container.querySelector('#gen-name-btn').addEventListener('click', () => {
    const name = generateName(data);
    const resultEl = container.querySelector('#name-result');
    resultEl.innerHTML = '';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name + ' ';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'secondary';
    copyBtn.style.fontSize = '0.75rem';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(name));
    resultEl.appendChild(nameSpan);
    resultEl.appendChild(copyBtn);

    history.unshift(name);
    if (history.length > 5) history.pop();
    const histEl = container.querySelector('#name-history');
    histEl.innerHTML = '<p style="font-size:0.8rem;margin-bottom:0.25rem;">Recent:</p>' +
      history.map(n => `<div>${n}</div>`).join('');
  });
}
```

Note: `init()`'s body is byte-for-byte identical to the current file — only the generation logic above it changed. This preserves the existing Names tab UI/UX exactly.

- [ ] **Step 2: Syntax-check the file**

Run:
```bash
node --check js/name-gen.js
```
Expected: no output (exits 0)

- [ ] **Step 3: Verify the model builds correctly against the real corpus**

Run:
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('js/name-gen.js', 'utf8');
const buildModelSrc = src.match(/function buildModel[\s\S]*?\n}\n/)[0];
eval(buildModelSrc);
const data = JSON.parse(fs.readFileSync('data/names.json', 'utf8'));
const { ngrams, beginnings } = buildModel(data.corpus);
console.log('beginnings:', beginnings.length);
console.log('unique grams:', Object.keys(ngrams).length);
console.log('sample beginnings:', JSON.stringify(beginnings.slice(0, 5)));
"
```
Expected: `beginnings: 285`, `unique grams:` some positive number less than or equal to a few hundred (order-2 grams over a small alphabet repeat often), and 5 sample beginnings matching the first 5 corpus entries' first two characters (`Ga`, `pa`, `Ch`, `Na`, `Ch`).

- [ ] **Step 4: Verify name generation runs without errors and produces plausible output**

Run:
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('js/name-gen.js', 'utf8');
const buildModelSrc = src.match(/function buildModel[\s\S]*?\n}\n/)[0];
const capitalizeSrc = src.match(/function capitalizeWords[\s\S]*?\n}\n/)[0];
const randomInRangeSrc = src.match(/function randomInRange[\s\S]*?\n}\n/)[0];
const generateNameSrc = src.match(/export function generateName([\s\S]*?)\n}\n/)[0].replace('export function generateName', 'function generateName');
eval(buildModelSrc);
eval(capitalizeSrc);
eval(randomInRangeSrc);
eval(generateNameSrc);
const data = JSON.parse(fs.readFileSync('data/names.json', 'utf8'));
const model = buildModel(data.corpus);
const fullData = { corpus: data.corpus, ngrams: model.ngrams, beginnings: model.beginnings };
let errors = 0;
const samples = [];
for (let i = 0; i < 5000; i++) {
  try {
    const name = generateName(fullData);
    if (i < 10) samples.push(name);
  } catch (e) {
    errors++;
  }
}
console.log('errors:', errors, 'out of 5000');
console.log('samples:', JSON.stringify(samples));
"
```
Expected: `errors: 0 out of 5000`, and 10 sample names that look like capitalized word-fragments (e.g. `Gatsika`, `Panitoo`, ...) — exact values are random, but every sample should be a non-empty string starting with an uppercase letter and containing no `undefined`/`NaN`.

- [ ] **Step 5: Commit**

```bash
git add js/name-gen.js
git commit -m "feat: generate names via Markov-chain n-gram model"
```

---

### Task 3: Manual browser verification

**Files:**
- None modified — this task only verifies Tasks 1–2's combined result in a real browser, since this project has no JS test framework and the Names tab's actual click-to-generate behavior can't be confirmed by `node` scripts alone.

**Interfaces:**
- Consumes: the full working app (`index.html`, `js/app.js`'s existing `names: initNames` wiring — unchanged by this plan — `js/name-gen.js` and `data/names.json` from Tasks 1–2).

- [ ] **Step 1: Serve the app locally**

```bash
python3 -m http.server 8000 --directory /Users/bretjb/dev/coyote-crow
```

- [ ] **Step 2: Verify in a browser**

Open `http://localhost:8000` (Names tab is the default active tab) and check:
1. Click "Generate Name" — a capitalized, plausible-looking name appears (e.g. two or more syllable-like chunks, sometimes multi-word if the walk crosses a space from a multi-word corpus entry like "Choona Wanaka").
2. Click "Generate Name" repeatedly (10+ times) — names vary each time, no two consecutive clicks produce an obviously broken result (empty string, `undefined`, unclosed capitalization).
3. Click "Copy" next to a generated name, then paste somewhere — the copied text matches the displayed name exactly (no trailing space beyond what's visually shown).
4. The "Recent:" history list below shows up to the last 5 generated names, most recent first.
5. Open browser devtools console — no errors on load or on any click.
6. Reload the page — the Names tab still works identically (model rebuilds from the cached/fetched `data/names.json` on each fresh page load, since `cachedData` is a module-level variable that resets on reload).

Stop the server with Ctrl+C when done.

- [ ] **Step 3: Report result**

If all checks pass, this task is complete — no commit needed (no files changed). If something looks wrong, note exactly what and treat it as a finding for the task review / fix loop rather than silently patching it here.

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the Data section (corpus moved into `data/names.json`, old `lists`/`syllables` keys removed). Task 2 covers the `js/name-gen.js` rewrite (model building, `generateName` port, deletion of curated-list/used-tracking/syllable-fallback logic, unchanged `init()` UI). Task 3 covers the spec's implicit requirement that the Names tab still works end-to-end in a browser, which no `node`-based check in Task 2 can confirm. `raw-names.js` staying untouched is called out as a Global Constraint and verified in Task 1 Step 3.
- **Type/signature consistency:** `loadNameData()` still returns one object; `generateName(data)` still takes that object and returns a string; `init(container)` signature is unchanged — all three names and call shapes match what `js/app.js`'s existing `tabInits.names` wiring already expects, so no changes to `js/app.js` or `index.html` are needed anywhere in this plan.
- **Placeholder scan:** no TBD/TODO markers; every step has an exact command and exact expected output (or, for Task 3's inherently-visual checks, an exact enumerated checklist).

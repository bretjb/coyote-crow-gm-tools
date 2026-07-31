# Coyote & Crow GM Companion App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first PWA with vanilla JS that gives a GM five tools: Name Generator, NPC Generator (quick and full), Dice Roller, Initiative Tracker, and Rule Summary.

**Architecture:** Single `index.html` shell with tab navigation. Each feature is a JS module that exports `init(container)`. Shared utilities (`dice.js`) are imported directly. All state is session-only (JS variables); no localStorage writes.

**Tech Stack:** Vanilla JS ES modules, no bundler, no framework. CSS custom properties. Service worker for PWA caching. `marked.min.js` (UMD, local file) for markdown rendering.

## Global Constraints

- No npm, no bundler, no framework — vanilla JS ES modules only
- ES modules require a local server; develop with `python3 -m http.server 8080` from the project root
- No CDN fetches at runtime — all assets must be bundled locally
- All state is session-only — no localStorage reads or writes
- Seed data (names, archetypes, skills, abilities, etc.) is placeholder content; the user will fill in real C&C data
- Gift/burden distribution weights: 30% none, 50% one item, 20% two items
- Gift/burden magnitude weights: ±1 most common (35% each), ±2 rare (7% each), ±3 very rare (1% each) — tunable in the data file
- Stat priority weight multiplier: 3× (preferred stats get 3× selection probability vs 1× for others)
- Skill priority weight multiplier: 3× (same pattern)
- Ability weight: +2 per overlapping diceCheck stat with archetype priorities (base weight 1)
- Specialized skill rank must be ≤ general rank − 1 (e.g., general rank 3 allows spec rank 1 or 2)

---

### Task 1: Project Scaffold

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`

**Interfaces:**
- Produces: `window` has tab switching working; clicking any tab button toggles panels and calls the module's `init(container)` once on first activation

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p css js/lib data/rules
```

- [ ] **Step 2: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#c8860a">
  <title>Coyote &amp; Crow GM</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <nav class="tab-bar">
    <button class="tab-btn active" data-tab="names">Names</button>
    <button class="tab-btn" data-tab="npcs">NPCs</button>
    <button class="tab-btn" data-tab="dice">Dice</button>
    <button class="tab-btn" data-tab="initiative">Initiative</button>
    <button class="tab-btn" data-tab="rules">Rules</button>
  </nav>
  <main>
    <div id="tab-names" class="tab-panel active"></div>
    <div id="tab-npcs" class="tab-panel hidden"></div>
    <div id="tab-dice" class="tab-panel hidden"></div>
    <div id="tab-initiative" class="tab-panel hidden"></div>
    <div id="tab-rules" class="tab-panel hidden"></div>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `css/style.css`**

```css
:root {
  --bg: #1a0f00;
  --surface: #2d1b00;
  --border: #5a3a10;
  --accent: #c8860a;
  --text: #e8d5b0;
  --muted: #a08060;
  --success: #4caf50;
  --fail: #666;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: Georgia, serif;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.tab-bar {
  display: flex;
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem 0.5rem;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.9rem;
  font-family: inherit;
  border-bottom: 3px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

main { flex: 1; overflow: auto; }

.tab-panel { padding: 1rem; }
.tab-panel.hidden { display: none; }

button {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  border-radius: 3px;
}

button:hover { opacity: 0.85; }

button.secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}

input, select {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  font-size: 0.9rem;
  border-radius: 3px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.card h2 { color: var(--accent); margin-bottom: 0.5rem; }
.card h3 { color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }

.error { color: #e57373; font-style: italic; }

.die {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 4px;
  font-size: 1.1rem;
  font-weight: bold;
  margin: 0.2rem;
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--fail);
}

.die.success {
  border-color: var(--success);
  color: var(--success);
}
```

- [ ] **Step 4: Write `js/app.js`**

```javascript
import { init as initNames } from './name-gen.js';
import { init as initNpcs } from './npc-gen.js';
import { init as initDice } from './dice-roller.js';
import { init as initInitiative } from './initiative.js';
import { init as initRules } from './rules.js';

const tabInits = { names: initNames, npcs: initNpcs, dice: initDice, initiative: initInitiative, rules: initRules };
const initialized = new Set();

function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${name}`));
  if (!initialized.has(name)) {
    tabInits[name](document.getElementById(`tab-${name}`));
    initialized.add(name);
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

activateTab('names');
```

- [ ] **Step 5: Create stub modules so the app loads without errors**

Create each of these files with identical content (just exports the empty init):

`js/name-gen.js`, `js/npc-gen.js`, `js/dice-roller.js`, `js/initiative.js`, `js/rules.js`:

```javascript
export function init(container) {
  container.textContent = 'Coming soon';
}
```

- [ ] **Step 6: Verify in browser**

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Five tabs appear, clicking each switches panels without errors.

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/app.js js/name-gen.js js/npc-gen.js js/dice-roller.js js/initiative.js js/rules.js
git commit -m "feat: app scaffold with tab routing and stub modules"
```

---

### Task 2: Shared Dice Utility

**Files:**
- Create: `js/dice.js`

**Interfaces:**
- Produces:
  - `rollDice(count: number): number[]` — returns array of `count` d12 results (1–12)
  - `countSuccesses(results: number[], target: number): number` — count elements ≥ target
  - `roll(count: number, target?: number): { results: number[], successes: number, target: number }` — convenience wrapper, default target 8

- [ ] **Step 1: Write `js/dice.js`**

```javascript
export function rollDice(count) {
  return Array.from({ length: count }, () => Math.ceil(Math.random() * 12));
}

export function countSuccesses(results, target) {
  return results.filter(r => r >= target).length;
}

export function roll(count, target = 8) {
  const results = rollDice(count);
  return { results, successes: countSuccesses(results, target), target };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/dice.js
git commit -m "feat: shared dice utility with rollDice, countSuccesses, roll"
```

---

### Task 3: Dice Roller Tab

**Files:**
- Modify: `js/dice-roller.js`

**Interfaces:**
- Consumes: `rollDice(count)` and `countSuccesses(results, target)` from `js/dice.js`

- [ ] **Step 1: Write `js/dice-roller.js`**

```javascript
import { rollDice, countSuccesses } from './dice.js';

export function init(container) {
  container.innerHTML = `
    <div class="dice-roller">
      <h2>Dice Roller</h2>
      <div class="dice-inputs" style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">
        <label>Dice: <input id="dice-count" type="number" value="3" min="1" max="30" style="width:4rem;"></label>
        <label>Target: <input id="dice-target" type="number" value="8" min="1" max="12" style="width:4rem;"></label>
        <button id="dice-roll">Roll</button>
        <button id="dice-clear" class="secondary">Clear</button>
      </div>
      <div id="dice-faces" style="margin-bottom:0.75rem;"></div>
      <div id="dice-summary" style="font-size:1.1rem;color:var(--accent);"></div>
    </div>
  `;

  const countInput = container.querySelector('#dice-count');
  const targetInput = container.querySelector('#dice-target');
  const facesEl = container.querySelector('#dice-faces');
  const summaryEl = container.querySelector('#dice-summary');

  container.querySelector('#dice-roll').addEventListener('click', () => {
    const count = Math.max(1, parseInt(countInput.value, 10) || 1);
    const target = Math.max(1, Math.min(12, parseInt(targetInput.value, 10) || 8));
    const results = rollDice(count);
    const successes = countSuccesses(results, target);

    facesEl.innerHTML = results
      .map(r => `<span class="die${r >= target ? ' success' : ''}">${r}</span>`)
      .join('');
    summaryEl.textContent = `${successes} success${successes !== 1 ? 'es' : ''} out of ${count} ${count === 1 ? 'die' : 'dice'} (target ${target}+)`;
  });

  container.querySelector('#dice-clear').addEventListener('click', () => {
    facesEl.innerHTML = '';
    summaryEl.textContent = '';
  });
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:8080`, click the Dice tab. Enter 5 dice, target 8, click Roll. Five die faces appear. Successes (≥8) are green. Summary reads correctly. Clear wipes the display.

- [ ] **Step 3: Commit**

```bash
git add js/dice-roller.js
git commit -m "feat: dice roller tab with d12 pool and success counting"
```

---

### Task 4: Name Generator

**Files:**
- Create: `data/names.json`
- Modify: `js/name-gen.js`

**Interfaces:**
- Produces:
  - `loadNameData(): Promise<NameData>` — fetches and caches `data/names.json`
  - `generateName(data: NameData): string` — picks a random name, falls back to procedural

- [ ] **Step 1: Create `data/names.json` with seed data**

```json
{
  "lists": {
    "placeholder": [
      "Ahanu", "Ayasha", "Chayton", "Chenoa", "Dakota",
      "Istas", "Kaya", "Lenora", "Mika", "Nizhoni",
      "Rowtag", "Shilah", "Takoda", "Winona", "Yuma"
    ]
  },
  "syllables": {
    "prefix": ["Ah", "Ay", "Ch", "Da", "Is", "Ka", "Le", "Mi", "Ni", "Ro", "Sh", "Ta", "Wi", "Yu"],
    "middle": ["an", "ay", "ot", "en", "ta", "ya", "no", "ka", "zh", "wt"],
    "suffix": ["u", "a", "on", "ah", "ota", "sha", "ni", "ka", "ra"]
  }
}
```

- [ ] **Step 2: Write `js/name-gen.js`**

```javascript
let cachedData = null;

export async function loadNameData() {
  if (cachedData) return cachedData;
  const res = await fetch('data/names.json');
  if (!res.ok) throw new Error('offline');
  cachedData = await res.json();
  cachedData._used = {};
  return cachedData;
}

export function generateName(data) {
  const keys = Object.keys(data.lists);
  if (keys.length > 0) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    const all = data.lists[key];
    if (!data._used[key]) data._used[key] = [];
    const unused = all.filter(n => !data._used[key].includes(n));
    if (unused.length > 0) {
      const name = unused[Math.floor(Math.random() * unused.length)];
      data._used[key].push(name);
      return name;
    }
  }
  return _procedural(data.syllables);
}

function _procedural(syl) {
  const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  return [pick(syl.prefix), pick(syl.middle), pick(syl.suffix)].join('');
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

- [ ] **Step 3: Verify in browser**

Click Names tab. Click "Generate Name" multiple times. Names appear, history list shows last 5. Copy button works.

- [ ] **Step 4: Commit**

```bash
git add data/names.json js/name-gen.js
git commit -m "feat: name generator with curated lists and procedural fallback"
```

---

### Task 5: Initiative Tracker

**Files:**
- Modify: `js/initiative.js`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (self-contained UI)

- [ ] **Step 1: Write `js/initiative.js`**

```javascript
export function init(container) {
  let combatants = [];
  let activeIndex = 0;

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Initiative Tracker</h2>
    <form id="init-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input id="init-name" type="text" placeholder="Name" required style="flex:1;min-width:8rem;">
      <input id="init-score" type="number" placeholder="Initiative" required style="width:6rem;">
      <button type="submit">Add</button>
    </form>
    <ul id="init-list" style="list-style:none;margin-bottom:1rem;"></ul>
    <div style="display:flex;gap:0.5rem;">
      <button id="init-next">Next Turn</button>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  function render() {
    container.querySelector('#init-list').innerHTML = combatants.map((c, i) => `
      <li class="card" style="display:flex;justify-content:space-between;align-items:center;
          ${i === activeIndex ? 'border-color:var(--accent);' : ''}">
        <span>${i === activeIndex ? '▶ ' : ''}${c.name}</span>
        <span style="color:var(--accent);font-size:1.1rem;">${c.score}</span>
      </li>
    `).join('');
  }

  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const score = parseInt(container.querySelector('#init-score').value, 10);
    if (!name || isNaN(score)) return;
    combatants.push({ name, score });
    combatants.sort((a, b) => b.score - a.score);
    activeIndex = 0;
    e.target.reset();
    render();
  });

  container.querySelector('#init-next').addEventListener('click', () => {
    if (combatants.length === 0) return;
    activeIndex = (activeIndex + 1) % combatants.length;
    render();
  });

  container.querySelector('#init-clear').addEventListener('click', () => {
    combatants = [];
    activeIndex = 0;
    render();
  });

  render();
}
```

- [ ] **Step 2: Verify in browser**

Click Initiative tab. Add three combatants with different scores. List auto-sorts descending. Active marker advances with Next Turn and wraps. Clear All empties the list.

- [ ] **Step 3: Commit**

```bash
git add js/initiative.js
git commit -m "feat: initiative tracker with auto-sort and turn stepping"
```

---

### Task 6: Markdown Parser + Rule Summary

**Files:**
- Create: `js/lib/md.js` (download)
- Modify: `js/rules.js`
- Create: `data/rules/quick-ref.md`
- Create: `data/rules/full-digest.md`

**Interfaces:**
- Consumes: `window.marked` (set by `js/lib/md.js` UMD build)

- [ ] **Step 1: Download marked.min.js as a local file**

```bash
curl -L -o js/lib/md.js "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"
```

Verify the file exists and is non-empty:

```bash
wc -c js/lib/md.js
```

Expected: > 50000 bytes.

- [ ] **Step 2: Create placeholder markdown files**

`data/rules/quick-ref.md`:
```markdown
# Quick Reference

## Core Mechanic

Roll a pool of d12s and count results **8 or higher** as successes.

## Difficulty

| Difficulty | Successes Needed |
|-----------|-----------------|
| Simple    | 1               |
| Standard  | 2               |
| Hard      | 3               |
| Daunting  | 4               |

*Replace this file with your actual rules content.*
```

`data/rules/full-digest.md`:
```markdown
# Full Rules Digest

## Character Stats

Nine stats: Strength, Agility, Endurance, Intelligence, Perception, Wisdom, Spirit, Charisma, Will.

*Replace this file with your actual rules content.*
```

- [ ] **Step 3: Write `js/rules.js`**

```javascript
export async function init(container) {
  // Load marked UMD build (sets window.marked)
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/lib/md.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Rules</h2>
    <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
      <button id="rules-quick" class="active-sub">Quick Ref</button>
      <button id="rules-full" class="secondary">Full Digest</button>
    </div>
    <div id="rules-content" class="rules-body"></div>
  `;

  const contentEl = container.querySelector('#rules-content');

  async function loadMd(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      contentEl.innerHTML = window.marked.parse(text);
    } catch {
      contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    }
  }

  const quickBtn = container.querySelector('#rules-quick');
  const fullBtn = container.querySelector('#rules-full');

  quickBtn.addEventListener('click', () => {
    quickBtn.classList.remove('secondary');
    fullBtn.classList.add('secondary');
    loadMd('data/rules/quick-ref.md');
  });

  fullBtn.addEventListener('click', () => {
    fullBtn.classList.remove('secondary');
    quickBtn.classList.add('secondary');
    loadMd('data/rules/full-digest.md');
  });

  // Load default sub-tab
  loadMd('data/rules/quick-ref.md');
}
```

Add to `css/style.css`:
```css
.rules-body {
  line-height: 1.7;
}
.rules-body h1, .rules-body h2, .rules-body h3 { color: var(--accent); margin: 1rem 0 0.5rem; }
.rules-body p { margin-bottom: 0.75rem; }
.rules-body ul, .rules-body ol { margin-left: 1.5rem; margin-bottom: 0.75rem; }
.rules-body table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; }
.rules-body th, .rules-body td { border: 1px solid var(--border); padding: 0.4rem 0.75rem; text-align: left; }
.rules-body th { background: var(--surface); color: var(--accent); }
```

- [ ] **Step 4: Verify in browser**

Click Rules tab. Quick Ref renders the table and headings. Switch to Full Digest — content changes. Both files display with correct styling.

- [ ] **Step 5: Commit**

```bash
git add js/lib/md.js js/rules.js data/rules/quick-ref.md data/rules/full-digest.md css/style.css
git commit -m "feat: rule summary tab with marked.js markdown rendering"
```

---

### Task 7: Seed Data Files (Full NPC)

**Files:**
- Create: `data/npc-components.json`
- Create: `data/motivations.json`
- Create: `data/paths.json`
- Create: `data/gifts-burdens.json`
- Create: `data/skills.json`
- Create: `data/abilities.json`
- Create: `data/archetypes.json`

These are seed files with placeholder content. Replace entries with real C&C data.

- [ ] **Step 1: Create `data/npc-components.json`**

```json
{
  "roles": [
    "Hunter", "Trader", "Elder", "Warrior", "Healer",
    "Scout", "Craftsperson", "Storyteller", "Guide", "Farmer"
  ],
  "personalities": [
    "Cautious", "Bold", "Curious", "Reserved", "Warm",
    "Stern", "Playful", "Melancholic", "Fierce", "Gentle"
  ],
  "motivations": [
    "Protect family", "Seek knowledge", "Gain honor", "Find belonging",
    "Avenge a wrong", "Restore balance", "Explore the unknown"
  ]
}
```

- [ ] **Step 2: Create `data/motivations.json`**

```json
[
  "Protect family",
  "Seek knowledge",
  "Gain honor",
  "Find belonging",
  "Avenge a wrong",
  "Restore balance",
  "Explore the unknown",
  "Accumulate wealth",
  "Serve the community",
  "Survive at any cost"
]
```

- [ ] **Step 3: Create `data/paths.json`**

```json
[
  "Path of the Hunter",
  "Path of the Warrior",
  "Path of the Healer",
  "Path of the Scholar",
  "Path of the Wanderer",
  "Path of the Artisan",
  "Path of the Speaker"
]
```

- [ ] **Step 4: Create `data/gifts-burdens.json`**

Items with `magnitude` > 0 are Gifts; < 0 are Burdens.

```json
[
  { "name": "Fleet-Footed", "magnitude": 1, "description": "Moves faster than most." },
  { "name": "Eagle Eyes", "magnitude": 1, "description": "Keen eyesight." },
  { "name": "Iron Will", "magnitude": 2, "description": "Resists mental pressure." },
  { "name": "Ancestor's Favor", "magnitude": 3, "description": "Blessed by the spirits." },
  { "name": "Slow Reflexes", "magnitude": -1, "description": "Reacts a half-step late." },
  { "name": "Haunted", "magnitude": -1, "description": "Troubled by dark memories." },
  { "name": "Frail", "magnitude": -2, "description": "Takes injury more easily." },
  { "name": "Cursed", "magnitude": -3, "description": "Misfortune follows close behind." }
]
```

- [ ] **Step 5: Create `data/skills.json`**

```json
[
  { "name": "Tracking", "diceCheck": ["Perception", "Wisdom"], "specialized": ["Wilderness Tracking", "Urban Tracking"] },
  { "name": "Melee Combat", "diceCheck": ["Strength", "Agility"], "specialized": ["Blades", "Clubs", "Unarmed"] },
  { "name": "Ranged Combat", "diceCheck": ["Agility", "Perception"], "specialized": ["Bows", "Thrown"] },
  { "name": "Stealth", "diceCheck": ["Agility", "Wisdom"], "specialized": ["Shadowing", "Hiding"] },
  { "name": "Athletics", "diceCheck": ["Strength", "Endurance"], "specialized": ["Climbing", "Swimming", "Running"] },
  { "name": "Healing", "diceCheck": ["Intelligence", "Wisdom"], "specialized": ["Herbalism", "Field Medicine"] },
  { "name": "Persuasion", "diceCheck": ["Charisma", "Wisdom"], "specialized": ["Negotiation", "Deception", "Inspiration"] },
  { "name": "Survival", "diceCheck": ["Endurance", "Wisdom"], "specialized": ["Foraging", "Navigation", "Shelter"] },
  { "name": "Lore", "diceCheck": ["Intelligence", "Wisdom"], "specialized": ["Ancestor Lore", "Spirit Lore", "History"] },
  { "name": "Intimidation", "diceCheck": ["Strength", "Charisma"], "specialized": [] },
  { "name": "Spirit Sense", "diceCheck": ["Spirit", "Perception"], "specialized": [] },
  { "name": "Crafting", "diceCheck": ["Intelligence", "Agility"], "specialized": ["Weapons", "Tools", "Textiles"] }
]
```

- [ ] **Step 6: Create `data/abilities.json`**

```json
[
  { "id": "ancestors-storm", "name": "Ancestor's Storm", "diceCheck": ["Spirit", "Charisma"], "description": "Call upon ancestral power to strike fear." },
  { "id": "iron-body", "name": "Iron Body", "diceCheck": ["Strength", "Endurance"], "description": "Harden the body against blows." },
  { "id": "shadow-step", "name": "Shadow Step", "diceCheck": ["Agility", "Spirit"], "description": "Move unseen even in plain sight." },
  { "id": "spirit-sight", "name": "Spirit Sight", "diceCheck": ["Spirit", "Perception"], "description": "See what others cannot." },
  { "id": "healing-touch", "name": "Healing Touch", "diceCheck": ["Spirit", "Wisdom"], "description": "Channel healing into another." },
  { "id": "battle-cry", "name": "Battle Cry", "diceCheck": ["Charisma", "Will"], "description": "Rally allies with a powerful shout." },
  { "id": "read-the-land", "name": "Read the Land", "diceCheck": ["Perception", "Wisdom"], "description": "Sense danger and opportunity from the environment." }
]
```

- [ ] **Step 7: Create `data/archetypes.json`**

```json
[
  {
    "name": "Warrior",
    "statPriorities": ["Strength", "Agility", "Endurance"],
    "preferredSkills": ["Melee Combat", "Athletics", "Intimidation"],
    "demographics": {
      "age": [
        { "value": "Young", "weight": 35 },
        { "value": "Adult", "weight": 50 },
        { "value": "Elder", "weight": 15 }
      ],
      "gender": [
        { "value": "Man", "weight": 40 },
        { "value": "Woman", "weight": 40 },
        { "value": "Two-Spirit", "weight": 20 }
      ],
      "sexuality": [
        { "value": "Heterosexual", "weight": 50 },
        { "value": "Homosexual", "weight": 20 },
        { "value": "Bisexual", "weight": 20 },
        { "value": "Asexual", "weight": 10 }
      ]
    }
  },
  {
    "name": "Scout",
    "statPriorities": ["Agility", "Perception", "Endurance"],
    "preferredSkills": ["Tracking", "Stealth", "Survival", "Ranged Combat"],
    "demographics": {
      "age": [
        { "value": "Young", "weight": 45 },
        { "value": "Adult", "weight": 45 },
        { "value": "Elder", "weight": 10 }
      ],
      "gender": [
        { "value": "Man", "weight": 35 },
        { "value": "Woman", "weight": 40 },
        { "value": "Two-Spirit", "weight": 25 }
      ],
      "sexuality": [
        { "value": "Heterosexual", "weight": 50 },
        { "value": "Homosexual", "weight": 20 },
        { "value": "Bisexual", "weight": 20 },
        { "value": "Asexual", "weight": 10 }
      ]
    }
  },
  {
    "name": "Healer",
    "statPriorities": ["Spirit", "Wisdom", "Intelligence"],
    "preferredSkills": ["Healing", "Lore", "Spirit Sense"],
    "demographics": {
      "age": [
        { "value": "Young", "weight": 15 },
        { "value": "Adult", "weight": 45 },
        { "value": "Elder", "weight": 40 }
      ],
      "gender": [
        { "value": "Man", "weight": 30 },
        { "value": "Woman", "weight": 45 },
        { "value": "Two-Spirit", "weight": 25 }
      ],
      "sexuality": [
        { "value": "Heterosexual", "weight": 50 },
        { "value": "Homosexual", "weight": 20 },
        { "value": "Bisexual", "weight": 20 },
        { "value": "Asexual", "weight": 10 }
      ]
    }
  },
  {
    "name": "Speaker",
    "statPriorities": ["Charisma", "Will", "Wisdom"],
    "preferredSkills": ["Persuasion", "Lore", "Intimidation"],
    "demographics": {
      "age": [
        { "value": "Young", "weight": 10 },
        { "value": "Adult", "weight": 50 },
        { "value": "Elder", "weight": 40 }
      ],
      "gender": [
        { "value": "Man", "weight": 35 },
        { "value": "Woman", "weight": 35 },
        { "value": "Two-Spirit", "weight": 30 }
      ],
      "sexuality": [
        { "value": "Heterosexual", "weight": 50 },
        { "value": "Homosexual", "weight": 20 },
        { "value": "Bisexual", "weight": 20 },
        { "value": "Asexual", "weight": 10 }
      ]
    }
  }
]
```

- [ ] **Step 8: Commit**

```bash
git add data/npc-components.json data/motivations.json data/paths.json data/gifts-burdens.json data/skills.json data/abilities.json data/archetypes.json
git commit -m "feat: seed data files for full NPC generation"
```

---

### Task 8: Quick NPC

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `loadNameData()` and `generateName(data)` from `js/name-gen.js`

- [ ] **Step 1: Write `js/npc-gen.js` with quick NPC only**

```javascript
import { loadNameData, generateName } from './name-gen.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>
  `;

  let nameData, components;
  try {
    [nameData, components] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  container.querySelector('#btn-quick').addEventListener('click', () => {
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    renderQuickNpc(container.querySelector('#npc-output'), npc);
  });

  container.querySelector('#btn-full').addEventListener('click', () => {
    container.querySelector('#npc-output').innerHTML = '<p style="color:var(--muted);">Full NPC coming in next task.</p>';
  });
}

function renderQuickNpc(output, npc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.className = 'secondary';
  copyBtn.style.marginTop = '0.5rem';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(`${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  });
  card.appendChild(copyBtn);
  output.innerHTML = '';
  output.appendChild(card);
}
```

- [ ] **Step 2: Verify in browser**

Click NPCs tab. Click "Quick NPC". Card appears with name, role, personality, and motivation. Copy button copies text to clipboard.

- [ ] **Step 3: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: quick NPC generator"
```

---

### Task 9: Full NPC — Stat Generation

**Files:**
- Create: `js/npc-character-gen.js`

**Interfaces:**
- Produces:
  - `weightedRandom(items: T[], weights: number[]): T`
  - `allocateStats(budget: number, priorities: string[]): Record<string, number>`
  - `calcDerivedStats(stats: Record<string, number>): Record<string, number>`

- [ ] **Step 1: Write stat functions in `js/npc-character-gen.js`**

```javascript
const STAT_NAMES = ['Strength','Agility','Endurance','Intelligence','Perception','Wisdom','Spirit','Charisma','Will'];
// STAT_COSTS[i] = total cost to reach stat value (i+1). e.g., STAT_COSTS[1]=3 means value 2 costs 3 total.
const STAT_COSTS = [0, 3, 6, 10, 15];
// STAT_INCREMENT[i] = cost to go from value (i+1) to (i+2)
const STAT_INCREMENT = [3, 3, 4, 5];

// SKILL_COSTS[rank] = total cost to reach that rank. rank 0 = unranked (cost 0).
const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];

export function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function allocateStats(budget, priorities) {
  const values = Object.fromEntries(STAT_NAMES.map(s => [s, 1]));
  let remaining = budget;

  while (remaining > 0) {
    const affordable = STAT_NAMES.filter(s => {
      const cur = values[s];
      return cur < 5 && STAT_INCREMENT[cur - 1] <= remaining;
    });
    if (affordable.length === 0) break;
    const weights = affordable.map(s => priorities.includes(s) ? 3 : 1);
    const chosen = weightedRandom(affordable, weights);
    remaining -= STAT_INCREMENT[values[chosen] - 1];
    values[chosen]++;
  }

  return values;
}

export function calcDerivedStats(s) {
  return {
    Initiative: s.Agility + s.Perception + s.Charisma,
    'Physical Defence': s.Agility + s.Endurance,
    'Mental Defence': s.Perception + s.Wisdom,
    'Mystical Defence': s.Charisma + s.Will,
    Body: s.Strength + s.Agility + s.Endurance,
    Mind: s.Intelligence + s.Perception + s.Wisdom,
    Soul: s.Spirit + s.Charisma + s.Will,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/npc-character-gen.js
git commit -m "feat: stat allocation and derived stat calculation"
```

---

### Task 10: Full NPC — Skill, Gift/Burden & Ability Generation

**Files:**
- Modify: `js/npc-character-gen.js`

**Interfaces:**
- Consumes: `weightedRandom` (already in this file)
- Produces:
  - `allocateSkills(budget: number, allSkills: Skill[], preferredNames: string[]): Record<string, {general: number, specialized?: {name:string, rank:number}}>`
  - `selectGiftsBurdens(pool: GiftBurden[]): GiftBurden[]` — returns 0–2 items
  - `selectAbility(abilities: Ability[], priorities: string[]): Ability`

The skill allocation algorithm buys general ranks first (weighted by preferred skills), then spends remaining budget on specializations. A skill is eligible for a specialization when its general rank ≥ 2. Specialization rank is capped at `general rank − 1`. Specialization has a 40% chance of being attempted per eligible skill.

- [ ] **Step 1: Add skill/gift/ability functions to `js/npc-character-gen.js`**

Append after `calcDerivedStats`:

```javascript
const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];

export function allocateSkills(budget, allSkills, preferredNames) {
  const acquired = {}; // name -> { general, specialized?: { name, rank } }
  let remaining = budget;

  // Phase 1: buy general ranks
  while (remaining > 0) {
    const affordable = allSkills.filter(skill => {
      const cur = (acquired[skill.name]?.general) || 0;
      if (cur >= 6) return false;
      return (SKILL_COSTS[cur + 1] - SKILL_COSTS[cur]) <= remaining;
    });
    if (affordable.length === 0) break;

    const weights = affordable.map(s => preferredNames.includes(s.name) ? 3 : 1);
    const chosen = weightedRandom(affordable, weights);
    const cur = (acquired[chosen.name]?.general) || 0;
    const cost = SKILL_COSTS[cur + 1] - SKILL_COSTS[cur];
    remaining -= cost;
    if (!acquired[chosen.name]) acquired[chosen.name] = { general: 0 };
    acquired[chosen.name].general = cur + 1;
  }

  // Phase 2: buy specializations for eligible skills (general >= 2, 40% chance each)
  for (const [name, data] of Object.entries(acquired)) {
    if (data.general < 2 || remaining <= 0) continue;
    if (Math.random() > 0.4) continue;
    const skill = allSkills.find(s => s.name === name);
    if (!skill || skill.specialized.length === 0) continue;

    // Max spec rank = general - 1
    const maxSpecRank = data.general - 1;
    // Find highest affordable spec rank
    let buyRank = 0;
    for (let r = 1; r <= maxSpecRank; r++) {
      if (SKILL_COSTS[r] <= remaining) buyRank = r;
    }
    if (buyRank === 0) continue;

    remaining -= SKILL_COSTS[buyRank];
    const specName = skill.specialized[Math.floor(Math.random() * skill.specialized.length)];
    data.specialized = { name: specName, rank: buyRank };
  }

  return acquired;
}

export function selectGiftsBurdens(pool) {
  // Count: 30% none, 50% one, 20% two
  const countWeights = [30, 50, 20];
  const count = weightedRandom([0, 1, 2], countWeights);
  if (count === 0 || pool.length === 0) return [];

  // Magnitude weights: ±1 = 35% each, ±2 = 7% each, ±3 = 1% each
  const magWeights = { 1: 35, '-1': 35, 2: 7, '-2': 7, 3: 1, '-3': 1 };
  const results = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    const magTotal = Object.values(magWeights).reduce((a, b) => a + b, 0);
    let r = Math.random() * magTotal;
    let chosenMag = 1;
    for (const [mag, w] of Object.entries(magWeights)) {
      r -= w;
      if (r <= 0) { chosenMag = parseInt(mag); break; }
    }
    const candidates = pool.filter(g => g.magnitude === chosenMag && !used.has(g.name));
    if (candidates.length === 0) continue;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    used.add(chosen.name);
    results.push(chosen);
  }

  return results;
}

export function selectAbility(abilities, priorities) {
  const weights = abilities.map(a => {
    const overlap = a.diceCheck.filter(s => priorities.includes(s)).length;
    return 1 + overlap * 2;
  });
  return weightedRandom(abilities, weights);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/npc-character-gen.js
git commit -m "feat: skill allocation, gift/burden selection, ability selection"
```

---

### Task 11: Full NPC — Assembly, Display & Skill Rolls

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes:
  - `generateName(data)` from `js/name-gen.js`
  - `allocateStats(budget, priorities)`, `calcDerivedStats(stats)`, `allocateSkills(budget, allSkills, preferred)`, `selectGiftsBurdens(pool)`, `selectAbility(abilities, priorities)` from `js/npc-character-gen.js`
  - `rollDice(count)`, `countSuccesses(results, target)` from `js/dice.js`

- [ ] **Step 1: Replace `js/npc-gen.js` with full version**

```javascript
import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>
  `;

  let nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes;
  try {
    [nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
      loadJson('data/motivations.json'),
      loadJson('data/paths.json'),
      loadJson('data/gifts-burdens.json'),
      loadJson('data/skills.json'),
      loadJson('data/abilities.json'),
      loadJson('data/archetypes.json'),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const output = container.querySelector('#npc-output');

  container.querySelector('#btn-quick').addEventListener('click', () => {
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    output.innerHTML = '';
    output.appendChild(renderQuickCard(npc));
  });

  container.querySelector('#btn-full').addEventListener('click', () => {
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc));
  });
}

function generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype }) {
  const stats = allocateStats(42, archetype.statPriorities);
  const skills = allocateSkills(42, allSkills, archetype.preferredSkills);
  return {
    name: generateName(nameData),
    motivation: pick(motivations),
    archetype: archetype.name,
    age: weightedPickDemographic(archetype.demographics.age),
    gender: weightedPickDemographic(archetype.demographics.gender),
    sexuality: weightedPickDemographic(archetype.demographics.sexuality),
    path: pick(paths),
    giftsAndBurdens: selectGiftsBurdens(giftsAndBurdens),
    stats,
    skills,
    ability: selectAbility(abilities, archetype.statPriorities),
    derived: calcDerivedStats(stats),
  };
}

function weightedPickDemographic(options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}

function renderQuickCard(npc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  return card;
}

function renderFullCard(npc) {
  const card = document.createElement('div');
  card.className = 'card';

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(g => `${g.name} (${g.magnitude > 0 ? '+' : ''}${g.magnitude})`).join(', ')
    : 'None';

  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p style="color:var(--muted);margin-bottom:0.75rem;">${npc.archetype} · ${npc.age} · ${npc.gender} · ${npc.sexuality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
    <p><strong>Path:</strong> ${npc.path}</p>
    <p style="margin-bottom:0.75rem;"><strong>Gifts/Burdens:</strong> ${gb}</p>

    <h3 style="margin-bottom:0.5rem;">Stats</h3>
    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;margin-bottom:0.75rem;">
      ${Object.entries(npc.stats).map(([k, v]) => `
        <div style="background:var(--bg);padding:0.3rem 0.5rem;border-radius:3px;border:1px solid var(--border);">
          <span style="color:var(--muted);font-size:0.75rem;">${k}</span><br>
          <span style="font-size:1.1rem;color:var(--accent);">${v}</span>
        </div>`).join('')}
    </div>

    <h3 style="margin-bottom:0.5rem;">Derived</h3>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.3rem;margin-bottom:0.75rem;font-size:0.85rem;">
      ${Object.entries(npc.derived).map(([k, v]) => `
        <div><span style="color:var(--muted);">${k}:</span> <strong>${v}</strong></div>`).join('')}
    </div>

    <h3 style="margin-bottom:0.5rem;">Skills <span style="color:var(--muted);font-size:0.75rem;">(click to roll)</span></h3>
    <div id="skill-list" style="margin-bottom:0.75rem;"></div>
    <div id="skill-roll-result" style="margin-bottom:0.75rem;"></div>

    <h3 style="margin-bottom:0.25rem;">Ability</h3>
    <p style="margin-bottom:0.75rem;"><strong>${npc.ability.name}</strong> — ${npc.ability.description}
      <span style="color:var(--muted);font-size:0.8rem;">[${npc.ability.diceCheck.join(' + ')}]</span>
    </p>
  `;

  // Render skill buttons
  const skillList = card.querySelector('#skill-list');
  const rollResult = card.querySelector('#skill-roll-result');
  for (const [skillName, data] of Object.entries(npc.skills)) {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.style.cssText = 'margin:0.2rem;font-size:0.8rem;padding:0.3rem 0.6rem;';
    const specLabel = data.specialized ? ` [${data.specialized.name} ${data.specialized.rank}]` : '';
    btn.textContent = `${skillName} ${data.general}${specLabel}`;

    btn.addEventListener('click', () => {
      // Find skill definition to get diceCheck stats
      const skillDef = null; // resolved at runtime from closure — handled below
      rollResult.textContent = 'Rolling...';
    });

    // We need allSkills in closure — attach to button as data
    btn.dataset.skillName = skillName;
    skillList.appendChild(btn);
  }

  // Wire skill roll clicks using allSkills from outer scope via event delegation
  skillList.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // allSkills available via closure in init(); pass stats through npc object
    // We'll use npc.stats and look up diceCheck from the skill definitions
    // Skills definitions are attached to the card via data attribute
  });

  appendCopyBtn(card, npcToText(npc));
  return card;
}

function appendCopyBtn(card, text) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary';
  btn.style.marginTop = '0.5rem';
  btn.addEventListener('click', () => navigator.clipboard.writeText(text));
  card.appendChild(btn);
}

function npcToText(npc) {
  const gb = npc.giftsAndBurdens.map(g => `${g.name} (${g.magnitude > 0 ? '+' : ''}${g.magnitude})`).join(', ') || 'None';
  const stats = Object.entries(npc.stats).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(npc.derived).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const skills = Object.entries(npc.skills).map(([k,d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  return `${npc.name}\n${npc.archetype} · ${npc.age} · ${npc.gender}\nMotivation: ${npc.motivation}\nPath: ${npc.path}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}
```

Notice the skill click handler above has a gap — the `allSkills` array is in the `init` closure. Refactor `renderFullCard` to accept `allSkills` and `npc.stats` and wire it properly:

Replace the `renderFullCard(npc)` call and definition with one that takes the needed data:

```javascript
// In init(), replace:
output.appendChild(renderFullCard(npc));
// With:
output.appendChild(renderFullCard(npc, allSkills));
```

```javascript
// Change function signature:
function renderFullCard(npc, allSkills) {
  // ... all previous code ...

  // Replace the skillList event delegation block with:
  skillList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-skill-name]');
    if (!btn) return;
    const skillName = btn.dataset.skillName;
    const skillDef = allSkills.find(s => s.name === skillName);
    if (!skillDef) return;
    const poolSize = skillDef.diceCheck.reduce((sum, stat) => sum + (npc.stats[stat] || 0), 0);
    const results = rollDice(poolSize);
    const successes = countSuccesses(results, 8);
    const faces = results.map(r => `<span class="die${r >= 8 ? ' success' : ''}">${r}</span>`).join('');
    rollResult.innerHTML = `<strong>${skillName}</strong> (${poolSize} dice): ${faces} — <strong>${successes} success${successes !== 1 ? 'es' : ''}</strong>`;
  });

  // ... rest of function unchanged
}
```

- [ ] **Step 2: Verify in browser**

Click NPCs → Full NPC. A complete character sheet renders with stats, derived stats, skills as clickable buttons, and an ability. Click a skill — dice roll result appears inline with success highlighting. Copy button copies full text representation.

- [ ] **Step 3: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: full NPC generator with stat/skill/ability generation and inline skill rolls"
```

---

### Task 12: PWA — Manifest & Service Worker

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Modify: `index.html` (register service worker)

- [ ] **Step 1: Create a placeholder icon**

Create a simple SVG icon at `icon.svg` (browsers can use SVG as a PWA icon in many cases; for maximum compatibility the user can convert it to PNG):

```bash
cat > icon.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#2d1b00"/>
  <text x="96" y="130" font-size="100" text-anchor="middle" fill="#c8860a">🐦</text>
</svg>
EOF
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "name": "Coyote & Crow GM",
  "short_name": "C&C GM",
  "description": "GM companion app for the Coyote and Crow TTRPG",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1a0f00",
  "theme_color": "#c8860a",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 3: Create `sw.js`**

```javascript
const CACHE = 'cc-gm-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/dice.js',
  './js/name-gen.js',
  './js/npc-gen.js',
  './js/npc-character-gen.js',
  './js/initiative.js',
  './js/dice-roller.js',
  './js/rules.js',
  './js/lib/md.js',
  './data/names.json',
  './data/npc-components.json',
  './data/motivations.json',
  './data/paths.json',
  './data/gifts-burdens.json',
  './data/skills.json',
  './data/abilities.json',
  './data/archetypes.json',
  './data/rules/quick-ref.md',
  './data/rules/full-digest.md',
  './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

- [ ] **Step 4: Register service worker in `index.html`**

Add before the closing `</body>` tag (after the existing `<script>` tag):

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

- [ ] **Step 5: Verify PWA in browser**

1. Open `http://localhost:8080` in Chrome or Edge
2. Open DevTools → Application → Service Workers — confirm the worker is registered and active
3. Application → Manifest — confirm name, theme color, icon appear
4. Open DevTools → Network → check "Offline", reload — app still works fully
5. Look for the install prompt in the address bar (or Application → Manifest → "Add to homescreen")

- [ ] **Step 6: Commit**

```bash
git add manifest.json sw.js icon.svg index.html
git commit -m "feat: PWA manifest and cache-first service worker"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Name Generator: curated lists + procedural fallback + 5-name history + copy
- ✅ NPC Generator quick: name + role + personality + motivation
- ✅ NPC Generator full: all 9 pipeline steps (motivation, archetype, demographics, path, gifts/burdens, stats, skills, ability, derived)
- ✅ Skill click → inline dice roll using diceCheck stats
- ✅ Dice Roller: pool input, target input (default 8), per-die display, success highlighting, summary, clear
- ✅ Initiative Tracker: add, auto-sort, active highlight, next turn, clear all
- ✅ Rule Summary: two sub-tabs, markdown rendered via marked.js local file
- ✅ Offline-first PWA: cache-first service worker, manifest, installable
- ✅ Error handling: fetch failures show "Data unavailable" message

**Clarifications noted in plan:**
- Seed data is placeholder — user fills in real C&C content by editing JSON/MD files
- Specialized skill rank = general rank − 1 interpretation used
- Gift/burden count: 0-2 per NPC (30/50/20 weight split)
- Magnitude weights: ±1 most common, tunable in npc-character-gen.js `magWeights` object
- Stat priority weight: 3× multiplier (tunable as a constant)

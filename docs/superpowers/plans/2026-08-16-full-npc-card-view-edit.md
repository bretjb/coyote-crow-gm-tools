# Full NPC Card: View/Edit Mode, Tooltips, and Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit view/edit toggle to the Full NPC card (default read-only, "Edit" reveals the existing input/select controls at larger size, "Save" persists and returns to read-only), add hover/tap tooltips explaining stats and skills, and redesign the stat/skill tables for stronger visual weight.

**Architecture:** `renderFullCard(npc, ctx, savedEntry, mode)` in `js/npc-gen.js` gains a `mode` parameter (`'view'` default or `'edit'`). Every field-builder helper it calls (`statCell`, `generalSkillRow`, `buildSpecTable`, `buildSelectCustomField`, `buildNamedDescField`, plus the name/archetype/path blocks built inline) gets a read-only rendering branch alongside its existing interactive one, selected by that same `mode`. Toggling mode does a full re-render of the card (`card.replaceWith(renderFullCard(npc, ctx, savedEntry, newMode))`) rather than threading live mode-switching into every nested closure — this app has no virtual DOM and a full rebuild of one card is cheap. Mode is transient: never written to `localStorage`, always starts at `'view'`. A new tiny module `js/npc-tooltip.js` provides a generic tooltip-on-hover/tap helper, fed by a new curated data file `data/stat-skill-glossary.json`.

**Tech Stack:** Vanilla JS (ES modules, no build step), `css/style.css` for all styling (no inline styles), `data/*.json` static tables, `sw.js` cache-first service worker.

## Global Constraints

- No inline styles (`style="..."` attributes or `.style.x =`) anywhere — all styling via `css/style.css` classes. (Existing `style="..."` attributes already in `js/npc-gen.js` are pre-existing and out of scope for this plan; do not introduce new ones.)
- No emoji anywhere, including UI copy.
- Any new `data/*.json` file fetched at runtime must be added to `sw.js`'s `ASSETS` array, and `sw.js`'s `CACHE` version string must be bumped whenever `ASSETS` or any cached file's contents change, or the service worker will keep serving stale files.
- Escape all dynamic text inserted via `innerHTML` using the existing `esc()` helper (already defined at the top of `js/npc-gen.js`) — never interpolate raw NPC/user data into `innerHTML`.
- No JS unit test suite exists in this project (no `package.json`, no test runner). Verify every task by serving the app locally and driving it with `playwright-cli`, per `CLAUDE.md`. Unregister the service worker before each verification run so edits aren't hidden behind a stale cache-first response.
- `localStorage`-backed state (the saved-NPC library) already uses `getState()`/`getAll()` deep-copy accessors in `npc-storage.js` — this plan does not change that persistence layer, only what triggers it.

---

## Task 1: Stat/skill glossary data file

**Files:**
- Create: `data/stat-skill-glossary.json`
- Modify: `sw.js`

**Interfaces:**
- Produces: a JSON array of `{ "name": string, "description": string }` objects, fetchable at `data/stat-skill-glossary.json`, one entry per stat (9) and per skill (28, matching the `name` fields in `data/skills.json` exactly).

- [ ] **Step 1: Create the glossary data file**

```json
[
  { "name": "Strength", "description": "Raw physical power/muscle." },
  { "name": "Agility", "description": "Accuracy of movement, coordination, dodging." },
  { "name": "Endurance", "description": "Physical resilience, stamina, recovery, resisting poison/illness." },
  { "name": "Intelligence", "description": "Raw processing/retention of information." },
  { "name": "Perception", "description": "Noticing and interpreting details (lies, fear, love)." },
  { "name": "Wisdom", "description": "Sustained focus, synthesizing info, seeing bigger truths." },
  { "name": "Spirit", "description": "Presence/force of personality, \"social gravity.\"" },
  { "name": "Charisma", "description": "Channeling Spirit to charm, manipulate, entertain, lie." },
  { "name": "Will", "description": "Determination, resistance to fear/temptation/coercion." },
  { "name": "Art", "description": "Understand art & history; Specialized Skill needed to actually create it." },
  { "name": "Athletics", "description": "Running, climbing, swimming, sports; helps defend vs. ranged (Acrobatics)." },
  { "name": "Ceremony", "description": "Spiritual/cultural rites; restores Mind/Soul to participants." },
  { "name": "Charm", "description": "Sway an NPC's disposition positively; never overrides consent." },
  { "name": "Coercion", "description": "Bend an NPC's will — interrogation, bargaining, intimidation." },
  { "name": "Computers", "description": "Use niisi/computers/AR; Hacking & Programming are specialized-only." },
  { "name": "Cooking", "description": "Prepare meals; Crit Success grants bonus Soul on next Rest." },
  { "name": "Crafting", "description": "Build/repair/invent items; complex items need a Specialized Skill." },
  { "name": "Cybernetics", "description": "Install/remove cybernetic implants." },
  { "name": "Deception", "description": "Convincing lies, disguises, sleight of hand, long cons." },
  { "name": "Farming", "description": "Growing food & gat base chemicals; machinery, crop cycles." },
  { "name": "Herbalism", "description": "Teas/smudges/poultices/poisons; can sub for Medicine (+1 SN)." },
  { "name": "Husbandry", "description": "Raise, train, and read animals." },
  { "name": "Investigation", "description": "Draw conclusions from physical evidence at a scene." },
  { "name": "Knowledge", "description": "Gateway skill (max Rank 1) unlocking Specialized subject knowledge." },
  { "name": "Language", "description": "Gateway skill (max Rank 1); Specialized Skills = actual languages." },
  { "name": "Medicine", "description": "Heal Body Damage; Specialized = treat Stat Damage (Phys/Mental/Spirit)." },
  { "name": "Melee Weapons", "description": "Simple handheld weapons; Specialized for complex ones." },
  { "name": "Music", "description": "Understand music/history; Specialized needed to actually play." },
  { "name": "Performance", "description": "Dance, oration, comedy, storytelling — mostly Narrative Play." },
  { "name": "Piloting", "description": "Operate vehicles; checks only needed for extreme maneuvers." },
  { "name": "Ranged Weapons", "description": "Bows, mag-slings, thrown weapons, other ranged attacks." },
  { "name": "Science", "description": "Apply scientific method, run experiments, research." },
  { "name": "Skulduggery", "description": "Lockpicking, scams, theft, poison administration." },
  { "name": "Stealth", "description": "Move unseen, avoid detection." },
  { "name": "Survival", "description": "Endure hostile environments; also covers First Aid." },
  { "name": "Tracking", "description": "Follow physical trails/signs of passage." },
  { "name": "Unarmed Combat", "description": "Fight bare-handed; Specialized: Martial Arts, Wrestling, Brawling." }
]
```

- [ ] **Step 2: Register the file in the service worker and bump the cache version**

In `sw.js`, change:

```js
const CACHE = 'cc-gm-v8';
```
to:
```js
const CACHE = 'cc-gm-v9';
```

And in the `ASSETS` array, add a new line after `'./data/archetypes.json',`:

```js
  './data/archetypes.json',
  './data/stat-skill-glossary.json',
```

- [ ] **Step 3: Verify the file is valid and served correctly**

```bash
python3 -c "import json; d = json.load(open('data/stat-skill-glossary.json')); assert len(d) == 37, len(d); assert {e['name'] for e in d} >= {'Strength','Unarmed Combat'}; print('OK', len(d))"
python3 -m http.server 8934 &
sleep 1
curl -sf http://localhost:8934/data/stat-skill-glossary.json | python3 -m json.tool > /dev/null && echo "fetch OK"
kill %1
```

Expected: `OK 37` and `fetch OK`.

- [ ] **Step 4: Commit**

```bash
git add data/stat-skill-glossary.json sw.js
git commit -m "feat: add stat/skill glossary data for NPC card tooltips"
```

---

## Task 2: Tooltip module and wiring into stat/skill tables

**Files:**
- Create: `js/npc-tooltip.js`
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `data/stat-skill-glossary.json` (Task 1).
- Produces: `loadGlossary(): Promise<Array<{name: string, description: string}>>` and `makeTooltip(labelText: string, description: string | undefined): HTMLSpanElement` from `js/npc-tooltip.js`. `makeTooltip` returns a `<span class="tooltip-trigger">` containing the label text and (if `description` is truthy) a `.tooltip-bubble` child shown on hover (pointer devices) or tap (toggles a `.tooltip-open` class, closed by clicking elsewhere). Later tasks (3, 4, 5) rely on `ctx.glossary` being a `Map<string, string>` available on the `ctx` object built in `init()`.

Note on scope: the Ability field's description is already always visible below the Ability selector (via `buildNamedDescField`'s `desc` paragraph, in both view and edit mode), so a tooltip there would just repeat visible text. This task only adds tooltips where space is tight and no description is otherwise shown: stat labels and skill names (general and specialized tables).

- [ ] **Step 1: Create the tooltip module**

```js
// js/npc-tooltip.js
let glossaryPromise = null;

export function loadGlossary() {
  if (!glossaryPromise) {
    glossaryPromise = fetch('data/stat-skill-glossary.json').then(res => {
      if (!res.ok) throw new Error('Failed to load stat-skill-glossary.json');
      return res.json();
    });
  }
  return glossaryPromise;
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

let openTrigger = null;
document.addEventListener('click', e => {
  if (openTrigger && !openTrigger.contains(e.target)) {
    openTrigger.classList.remove('tooltip-open');
    openTrigger = null;
  }
});

export function makeTooltip(labelText, description) {
  const trigger = document.createElement('span');
  trigger.className = 'tooltip-trigger';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = labelText;
  trigger.appendChild(labelSpan);

  if (description) {
    trigger.tabIndex = 0;
    const bubble = document.createElement('span');
    bubble.className = 'tooltip-bubble';
    bubble.innerHTML = esc(description);
    trigger.appendChild(bubble);

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = trigger.classList.contains('tooltip-open');
      if (openTrigger && openTrigger !== trigger) {
        openTrigger.classList.remove('tooltip-open');
      }
      trigger.classList.toggle('tooltip-open', !wasOpen);
      openTrigger = trigger.classList.contains('tooltip-open') ? trigger : null;
    });
  }

  return trigger;
}
```

- [ ] **Step 2: Add tooltip styles**

In `css/style.css`, add near the other utility/interaction classes (after `.field-label` at line 324):

```css
.tooltip-trigger { position: relative; display: inline-block; cursor: help; border-bottom: 1px dotted var(--muted); }
.tooltip-bubble {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 20;
  width: max-content;
  max-width: 16rem;
  margin-bottom: 0.35rem;
  padding: 0.4rem 0.6rem;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: normal;
  color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
@media (hover: hover) {
  .tooltip-trigger:hover .tooltip-bubble,
  .tooltip-trigger:focus-visible .tooltip-bubble { display: block; }
}
.tooltip-trigger.tooltip-open .tooltip-bubble { display: block; }
```

- [ ] **Step 3: Load the glossary in `init()` and expose it on `ctx`**

In `js/npc-gen.js`, add the import at the top (after the existing imports at line 5):

```js
import { loadGlossary, makeTooltip } from './npc-tooltip.js';
```

Replace the `init()` data-loading block:

```js
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
  const savedListEl = container.querySelector('#npc-saved-list');
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes };
```

with:

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

- [ ] **Step 4: Wire tooltips into stat labels**

Replace `statCell` (lines 232-252):

```js
function statCell(statName, npc, onChange, glossary) {
  const td = document.createElement('td');
  const label = makeTooltip(STAT_ABBR[statName], glossary.get(statName));
  label.classList.add('stat-cell-label');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '5';
  input.className = 'stat-input';
  input.value = npc.stats[statName];
  input.addEventListener('change', () => {
    npc.stats[statName] = clampStat(input.value);
    recalcDerivedAndSyncCurrent(npc);
    onChange();
  });
  td.appendChild(label);
  td.appendChild(document.createElement('br'));
  td.appendChild(input);
  return td;
}
```

Replace `buildStatSection` (lines 281-305) to thread `glossary` through:

```js
function buildStatSection(npc, onChange, glossary) {
  const wrap = document.createElement('div');
  wrap.className = 'stat-table-wrap';
  const table = document.createElement('table');
  table.className = 'stat-table';
  const tbody = document.createElement('tbody');
  const rows = [
    ['Strength', 'Agility', 'Endurance', 'Physical Defence', 'Body'],
    ['Intelligence', 'Perception', 'Wisdom', 'Mental Defence', 'Mind'],
    ['Spirit', 'Charisma', 'Will', 'Mystical Defence', 'Soul'],
  ];
  for (const [s1, s2, s3, defKey, bodyKey] of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(statCell(s1, npc, onChange, glossary));
    tr.appendChild(statCell(s2, npc, onChange, glossary));
    tr.appendChild(statCell(s3, npc, onChange, glossary));
    tr.appendChild(readOnlyCell(DEFENSE_ABBR[defKey], npc.derived[defKey]));
    tr.appendChild(readOnlyCell(bodyKey, npc.derived[bodyKey]));
    tr.appendChild(currentCell(bodyKey, npc));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
```

Update the one call site inside `renderFullCard`'s `rebuildBody` (around line 448):

```js
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody));
```
to:
```js
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody, ctx.glossary));
```

- [ ] **Step 5: Wire tooltips into general and specialized skill names**

Replace `generalSkillRow` (lines 663-710):

```js
function generalSkillRow(skillDef, npc, onChange, glossary) {
  const acquired = npc.skills[skillDef.name];
  const rank = acquired ? acquired.general : 0;
  const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  const usedVal = rank >= 1 ? higher : lower;
  const usedName = rank >= 1
    ? skillDef.diceCheck[vals.indexOf(higher)]
    : skillDef.diceCheck[vals.lastIndexOf(lower)];
  const pool = rank >= 1 ? higher + rank : lower;

  const tr = document.createElement('tr');
  if (rank === 0) tr.className = 'unranked';
  tr.dataset.pool = pool;
  tr.dataset.skillName = skillDef.name + (skillDef.requiresRank ? '*' : '');

  const nameTd = document.createElement('td');
  nameTd.appendChild(makeTooltip(skillDef.name + (skillDef.requiresRank ? '*' : ''), glossary.get(skillDef.name)));
  const statTd = document.createElement('td');
  statTd.textContent = `${usedName} ${usedVal}`;

  const rankTd = document.createElement('td');
  const rankInput = document.createElement('input');
  rankInput.type = 'number';
  rankInput.min = '0';
  rankInput.max = '6';
  rankInput.className = 'skill-rank-input';
  rankInput.value = rank;
  rankInput.addEventListener('click', e => e.stopPropagation());
  rankInput.addEventListener('change', () => {
    setGeneralRank(npc, skillDef.name, rankInput.value);
    onChange();
  });
  rankTd.appendChild(rankInput);
  if (skillDef.specialized?.length && rank >= 2 && !acquired?.specialized) {
    rankTd.appendChild(buildAddSpecControl(skillDef, npc, onChange));
  }

  const totalTd = document.createElement('td');
  totalTd.textContent = pool;

  tr.appendChild(nameTd);
  tr.appendChild(statTd);
  tr.appendChild(rankTd);
  tr.appendChild(totalTd);
  return tr;
}
```

Replace `buildGeneralSkillTable` (lines 785-798):

```js
function buildGeneralSkillTable(skillsSubset, npc, onChange, glossary) {
  const wrap = document.createElement('div');
  wrap.className = 'skill-table-wrap';
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const skillDef of skillsSubset) {
    tbody.appendChild(generalSkillRow(skillDef, npc, onChange, glossary));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
```

Replace `buildSkillSection` (lines 800-822):

```js
function buildSkillSection(npc, allSkills, onChange, glossary) {
  const wrap = document.createElement('div');
  const half = Math.ceil(allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(0, half), npc, onChange, glossary));
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(half), npc, onChange, glossary));
  wrap.appendChild(pair);

  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  if (specEntries.length > 0) {
    const sec = document.createElement('div');
    sec.innerHTML = '<h3 class="h3-section">Specialized Skills</h3>';
    const specWrap = document.createElement('div');
    specWrap.className = 'skill-table-wrap';
    specWrap.appendChild(buildSpecTable(allSkills, npc, specEntries, onChange, glossary));
    sec.appendChild(specWrap);
    wrap.appendChild(sec);
  }
  return wrap;
}
```

Replace `buildSpecTable` (lines 824-874):

```js
function buildSpecTable(allSkills, npc, specEntries, onChange, glossary) {
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const { generalName, name, rank } of specEntries) {
    const skillDef = allSkills.find(s => s.name === generalName);
    if (!skillDef) continue;
    const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
    const higher = Math.max(...vals);
    const higherName = skillDef.diceCheck[vals.indexOf(higher)];
    const pool = higher + rank;

    const tr = document.createElement('tr');
    tr.dataset.pool = pool;
    tr.dataset.skillName = `${name} (${generalName})`;

    const nameTd = document.createElement('td');
    const specLabel = document.createElement('span');
    specLabel.textContent = name + ' ';
    const genTooltip = makeTooltip(generalName, glossary.get(generalName));
    genTooltip.classList.add('text-muted-sm');
    nameTd.appendChild(specLabel);
    nameTd.appendChild(genTooltip);
    const statTd = document.createElement('td');
    statTd.textContent = `${higherName} ${higher}`;

    const generalRank = npc.skills[generalName].general;
    const rankTd = document.createElement('td');
    const rankInput = document.createElement('input');
    rankInput.type = 'number';
    rankInput.min = '0';
    rankInput.max = String(Math.max(0, generalRank - 1));
    rankInput.value = rank;
    rankInput.className = 'skill-rank-input';
    rankInput.addEventListener('click', e => e.stopPropagation());
    rankInput.addEventListener('change', () => {
      npc.skills[generalName].specialized.rank = clampSpecRank(rankInput.value, generalRank);
      onChange();
    });
    rankTd.appendChild(rankInput);

    const totalTd = document.createElement('td');
    totalTd.textContent = pool;

    tr.appendChild(nameTd);
    tr.appendChild(statTd);
    tr.appendChild(rankTd);
    tr.appendChild(totalTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}
```

Update the call site inside `rebuildBody` (around line 450):

```js
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody));
```
to:
```js
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody, ctx.glossary));
```

- [ ] **Step 6: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "STR"
playwright-cli hover "text=STR"
playwright-cli find "Raw physical power"
playwright-cli click "text=Athletics"
playwright-cli find "Running, climbing, swimming"
playwright-cli close
kill %1
```

Expected: `find "Raw physical power"` returns a match after hovering STR (desktop hover path), and clicking the "Athletics" skill name row's tooltip trigger reveals its description text via `find` (tap/click path) — note clicking the skill *name* tooltip trigger should not also trigger a dice roll (the roll handler listens for `tr[data-pool]` clicks, and `e.stopPropagation()` isn't called by the tooltip trigger, so this click will also roll dice — that's fine and expected, both behaviors are allowed to coexist).

- [ ] **Step 7: Commit**

```bash
git add js/npc-tooltip.js js/npc-gen.js css/style.css
git commit -m "feat: add hover/tap tooltips for stats and skills on the Full NPC card"
```

---

## Task 3: Card mode scaffold + view/edit for name, archetype, demographics, motivation, path, and ability

**Files:**
- Modify: `js/npc-gen.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `ctx.glossary` (Task 2), unchanged `npc-storage.js` exports (`saveNpc`, `updateNpc`).
- Produces: `renderFullCard(npc, ctx, savedEntry, mode = 'view')` — the `mode` parameter and full-card re-render pattern that Tasks 4 and 5 build on. `appendSaveControls(card, kind, npc, savedEntry)` now returns `{ getSavedId: () => string | null }`. New helpers `readOnlyField(label, value)` and `readOnlyNamedField(label, current, formatExtra)`. `buildSelectCustomField` and `buildNamedDescField` both gain a `mode` option; in `mode: 'view'` they return `{ el }` (and a no-op `setOptions` for `buildSelectCustomField`, matching its existing interface) rendering plain text instead of a select/input.

- [ ] **Step 1: Add read-only field helpers**

In `js/npc-gen.js`, add these two functions immediately after `readOnlyCell` (after line 258):

```js
function readOnlyField(label, value) {
  const el = document.createElement('div');
  el.className = 'row-flex-wrap mb-0-5';
  el.innerHTML = `<span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span>`;
  return el;
}

function readOnlyNamedField(label, current, formatExtra) {
  const el = document.createElement('div');
  el.className = 'mb-0-75';
  const row = document.createElement('div');
  row.className = 'row-flex-wrap';
  row.innerHTML = `<span class="field-label">${esc(label)}</span><span class="field-value">${esc(current.name)}</span>`;
  el.appendChild(row);
  const desc = document.createElement('p');
  desc.className = 'text-muted-sm';
  desc.textContent = (current.description || '') + (formatExtra ? formatExtra(current) : '');
  el.appendChild(desc);
  return el;
}
```

- [ ] **Step 2: Make `buildSelectCustomField` mode-aware**

Replace the function signature line and add a view branch at the top of `buildSelectCustomField` (line 533):

```js
function buildSelectCustomField({ label, value, options, onChange, mode }) {
  if (mode === 'view') {
    return { el: readOnlyField(label, value), setOptions: () => {} };
  }
  const el = document.createElement('div');
```

(Leave the rest of the function body — from `el.className = 'row-flex-wrap mb-0-5';` through the final `return { el, setOptions: ... };` — unchanged.)

- [ ] **Step 3: Make `buildNamedDescField` mode-aware**

Replace the function signature line and add a view branch at the top of `buildNamedDescField` (line 594):

```js
function buildNamedDescField({ label, current, options, onChange, customShape, formatExtra, mode }) {
  if (mode === 'view') {
    return { el: readOnlyNamedField(label, current, formatExtra) };
  }
  const el = document.createElement('div');
```

(Leave the rest of the function body unchanged.)

- [ ] **Step 4: Expose the saved-id getter from `appendSaveControls`**

In `appendSaveControls` (lines 876-922), add a return statement at the end of the function, right before the closing `}`:

```js
  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return { getSavedId: () => savedId };
}
```

- [ ] **Step 5: Rewrite `renderFullCard` with the mode scaffold**

Replace the entire `renderFullCard` function (lines 322-531) with:

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

  function rerender(newMode) {
    const newCard = renderFullCard(npc, ctx, savedEntry, newMode);
    card.replaceWith(newCard);
  }

  let saveControls;
  const toggleEl = card.querySelector('#edit-toggle');
  if (mode === 'view') {
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'secondary';
    editBtn.addEventListener('click', () => rerender('edit'));
    toggleEl.appendChild(editBtn);
  } else {
    const saveModeBtn = document.createElement('button');
    saveModeBtn.textContent = 'Save';
    saveModeBtn.addEventListener('click', () => {
      const id = saveControls ? saveControls.getSavedId() : null;
      if (id) updateNpc(id, { data: npc });
      rerender('view');
    });
    toggleEl.appendChild(saveModeBtn);
  }

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

  const archetypeSectionEl = card.querySelector('#archetype-section');
  function archetypeNoteText() {
    return `+1 ${npc.archetypeStatBonus} · free rank: ${npc.freeSkill}`;
  }
  if (mode === 'view') {
    const p = document.createElement('p');
    p.className = 'npc-meta';
    p.textContent = npc.archetype;
    const note = document.createElement('p');
    note.className = 'npc-meta-sm';
    note.textContent = archetypeNoteText();
    archetypeSectionEl.appendChild(p);
    archetypeSectionEl.appendChild(note);
  } else {
    const archetypeSelect = document.createElement('select');
    for (const a of ctx.archetypes) {
      const o = document.createElement('option');
      o.value = a.name;
      o.textContent = a.name;
      archetypeSelect.appendChild(o);
    }
    archetypeSelect.value = npc.archetype;

    const archetypeNote = document.createElement('p');
    archetypeNote.className = 'npc-meta-sm';
    archetypeNote.textContent = archetypeNoteText();

    archetypeSelect.addEventListener('change', () => {
      const newArchetype = ctx.archetypes.find(a => a.name === archetypeSelect.value);
      swapArchetype(npc, newArchetype);
      archetypeNote.textContent = archetypeNoteText();
      ageField.setOptions(archetypeDemographics('age'), npc.age);
      genderField.setOptions(archetypeDemographics('gender'), npc.gender);
      sexualityField.setOptions(archetypeDemographics('sexuality'), npc.sexuality);
      rebuildBody();
    });

    archetypeSectionEl.appendChild(archetypeSelect);
    archetypeSectionEl.appendChild(archetypeNote);
  }

  function archetypeDemographics(key) {
    const def = ctx.archetypes.find(a => a.name === npc.archetype);
    const list = def ? def.demographics[key].map(o => o.value) : [];
    return [...new Set(list)];
  }

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

  card.querySelector('#motivation-section').appendChild(
    buildNamedDescField({
      label: 'Motivation',
      current: npc.motivation,
      options: ctx.motivations,
      onChange: v => { npc.motivation = v; },
      mode,
    }).el
  );

  card.querySelector('#ability-section').appendChild(
    buildNamedDescField({
      label: 'Ability',
      current: npc.ability,
      options: ctx.abilities,
      onChange: v => { npc.ability = v; },
      customShape: () => ({ name: '', description: '', diceCheck: [] }),
      formatExtra: c => (c.diceCheck && c.diceCheck.length ? ` [${c.diceCheck.join(' + ')}]` : ''),
      mode,
    }).el
  );

  const statSectionEl = card.querySelector('#stat-section');
  const skillSectionEl = card.querySelector('#skill-section');
  const rollResult = card.querySelector('#skill-roll-result');

  function rebuildBody() {
    statSectionEl.innerHTML = '';
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody, ctx.glossary));
    skillSectionEl.innerHTML = '';
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody, ctx.glossary));
    rollResult.innerHTML = '';
  }
  rebuildBody();

  const pathSectionEl = card.querySelector('#path-section');
  if (mode === 'view') {
    const p = document.createElement('p');
    p.className = 'npc-meta';
    p.textContent = `Path: ${npc.path.name}`;
    pathSectionEl.appendChild(p);
    if (npc.path.statBonuses.length) {
      const note = document.createElement('p');
      note.className = 'text-muted-sm';
      note.textContent = `(+1 ${npc.path.statBonuses.join(', +1 ')})`;
      pathSectionEl.appendChild(note);
    }
  } else {
    const pathRow = document.createElement('div');
    pathRow.className = 'row-flex-wrap';
    const pathLabel = document.createElement('label');
    pathLabel.textContent = 'Path';
    pathLabel.className = 'field-label';
    const pathSelect = document.createElement('select');
    for (const p of ctx.paths) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      pathSelect.appendChild(o);
    }
    const pathCustomOpt = document.createElement('option');
    pathCustomOpt.value = '__custom__';
    pathCustomOpt.textContent = 'Custom...';
    pathSelect.appendChild(pathCustomOpt);

    const pathCustomInput = document.createElement('input');
    pathCustomInput.type = 'text';
    pathCustomInput.className = 'hidden mt-0-5';

    const pathNote = document.createElement('p');
    pathNote.className = 'text-muted-sm';
    function refreshPathNote() {
      pathNote.textContent = npc.path.statBonuses.length ? `(+1 ${npc.path.statBonuses.join(', +1 ')})` : '';
    }

    if (ctx.paths.some(p => p.name === npc.path.name)) {
      pathSelect.value = npc.path.name;
    } else {
      pathSelect.value = '__custom__';
      pathCustomInput.value = npc.path.name;
      pathCustomInput.classList.remove('hidden');
    }
    refreshPathNote();

    pathSelect.addEventListener('change', () => {
      if (pathSelect.value === '__custom__') {
        pathCustomInput.classList.remove('hidden');
        pathCustomInput.value = '';
        pathCustomInput.focus();
        swapPath(npc, { name: '', statBonuses: [] });
      } else {
        pathCustomInput.classList.add('hidden');
        swapPath(npc, ctx.paths.find(p => p.name === pathSelect.value));
      }
      refreshPathNote();
      rebuildBody();
    });

    pathCustomInput.addEventListener('change', () => {
      npc.path.name = pathCustomInput.value.trim();
    });

    pathRow.appendChild(pathLabel);
    pathRow.appendChild(pathSelect);
    pathSectionEl.appendChild(pathRow);
    pathSectionEl.appendChild(pathCustomInput);
    pathSectionEl.appendChild(pathNote);
  }

  card.addEventListener('click', e => {
    const row = e.target.closest('tr[data-pool]');
    if (!row) return;
    const pool = parseInt(row.dataset.pool, 10);
    const label = row.dataset.skillName;
    const results = rollDice(pool);
    const successes = countSuccesses(results, 8);
    const faces = results.map(r => `<span class="die${r >= 8 ? ' success' : ''}">${r}</span>`).join('');
    rollResult.innerHTML = `<strong>${esc(label)}</strong> (${pool} dice): ${faces} — <strong>${successes} success${successes !== 1 ? 'es' : ''}</strong>`;
  });

  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)));
  saveControls = appendSaveControls(card, 'full', npc, savedEntry);
  return card;
}
```

- [ ] **Step 6: Add the `.field-value` style used by the new read-only helpers**

In `css/style.css`, add after `.field-label` (line 324):

```css
.field-value { color: var(--text); font-weight: 500; }
```

- [ ] **Step 7: Verify in browser**

Note: at this point in the plan, `buildStatSection`/`buildSkillSection` still always render editable stat/skill tables regardless of `mode` (Tasks 4 and 5 add that) — that is expected and not a bug for this task's verification.

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "Edit"
playwright-cli find "Regenerate Name"
```
Expected: `Edit` button is present; `Regenerate Name` is NOT found (card starts in view mode — name has no regenerate button until Edit is clicked).

```bash
playwright-cli click "role=button[name='Edit']"
playwright-cli find "Regenerate Name"
playwright-cli find "role=combobox"
```
Expected: `Regenerate Name` now found, and archetype/path/age/gender/sexuality/motivation/ability all render as selects (comboboxes) — edit mode is active.

```bash
playwright-cli click "role=button[name='Save']"
playwright-cli find "Regenerate Name"
```
Expected: `Regenerate Name` not found again — card returned to view mode after Save.

```bash
playwright-cli close
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add js/npc-gen.js css/style.css
git commit -m "feat: add view/edit mode toggle to Full NPC card (name, archetype, demographics, motivation, path, ability)"
```

---

## Task 4: View/edit mode for the stat table

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `mode` and `ctx.glossary` from Task 3's `renderFullCard`.
- Produces: `statCell(statName, npc, onChange, glossary, mode)` and `buildStatSection(npc, onChange, glossary, mode)` — both now respect `mode`. `currentCell` (Current Body/Mind/Soul) is unchanged and stays editable in both modes, per spec.

- [ ] **Step 1: Make `statCell` mode-aware**

Replace `statCell` (as it stands after Task 2's edit):

```js
function statCell(statName, npc, onChange, glossary, mode) {
  const td = document.createElement('td');
  const label = makeTooltip(STAT_ABBR[statName], glossary.get(statName));
  label.classList.add('stat-cell-label');

  if (mode === 'view') {
    const value = document.createElement('span');
    value.className = 'stat-cell-value';
    value.textContent = npc.stats[statName];
    td.appendChild(label);
    td.appendChild(document.createElement('br'));
    td.appendChild(value);
    return td;
  }

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '5';
  input.className = 'stat-input';
  input.value = npc.stats[statName];
  input.addEventListener('change', () => {
    npc.stats[statName] = clampStat(input.value);
    recalcDerivedAndSyncCurrent(npc);
    onChange();
  });
  td.appendChild(label);
  td.appendChild(document.createElement('br'));
  td.appendChild(input);
  return td;
}
```

- [ ] **Step 2: Thread `mode` through `buildStatSection`**

```js
function buildStatSection(npc, onChange, glossary, mode) {
  const wrap = document.createElement('div');
  wrap.className = 'stat-table-wrap';
  const table = document.createElement('table');
  table.className = 'stat-table';
  const tbody = document.createElement('tbody');
  const rows = [
    ['Strength', 'Agility', 'Endurance', 'Physical Defence', 'Body'],
    ['Intelligence', 'Perception', 'Wisdom', 'Mental Defence', 'Mind'],
    ['Spirit', 'Charisma', 'Will', 'Mystical Defence', 'Soul'],
  ];
  for (const [s1, s2, s3, defKey, bodyKey] of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(statCell(s1, npc, onChange, glossary, mode));
    tr.appendChild(statCell(s2, npc, onChange, glossary, mode));
    tr.appendChild(statCell(s3, npc, onChange, glossary, mode));
    tr.appendChild(readOnlyCell(DEFENSE_ABBR[defKey], npc.derived[defKey]));
    tr.appendChild(readOnlyCell(bodyKey, npc.derived[bodyKey]));
    tr.appendChild(currentCell(bodyKey, npc));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
```

- [ ] **Step 3: Update the call site in `rebuildBody`**

In `renderFullCard`'s `rebuildBody` (added in Task 3), change:

```js
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody, ctx.glossary));
```
to:
```js
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody, ctx.glossary, mode));
```

- [ ] **Step 4: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli find "STR"
playwright-cli eval "document.querySelectorAll('.stat-table input.stat-input').length"
```
Expected: eval returns `0` — no stat number inputs in view mode (only the Current Body/Mind/Soul inputs, which use a different class and are unaffected).

```bash
playwright-cli click "role=button[name='Edit']"
playwright-cli eval "document.querySelectorAll('.stat-table input.stat-input').length"
```
Expected: `9` (one per stat).

```bash
playwright-cli fill "css=.stat-table input.stat-input >> nth=0" "5"
playwright-cli press "Tab"
playwright-cli click "role=button[name='Save']"
playwright-cli find "5"
playwright-cli close
kill %1
```
Expected: after Save, the first stat's read-only value shows `5`.

- [ ] **Step 5: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: respect view/edit mode in the Full NPC stat table"
```

---

## Task 5: View/edit mode for general and specialized skill tables

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `mode` and `ctx.glossary` from Task 3, the tooltip wiring from Task 2.
- Produces: `generalSkillRow(skillDef, npc, onChange, glossary, mode)`, `buildGeneralSkillTable(skillsSubset, npc, onChange, glossary, mode)`, `buildSkillSection(npc, allSkills, onChange, glossary, mode)`, `buildSpecTable(allSkills, npc, specEntries, onChange, glossary, mode)` — all now respect `mode`. In view mode, skill rank cells show plain numbers and the "+ spec" control (`buildAddSpecControl`) is not rendered, since adding a specialization is an edit action.

- [ ] **Step 1: Make `generalSkillRow` mode-aware**

```js
function generalSkillRow(skillDef, npc, onChange, glossary, mode) {
  const acquired = npc.skills[skillDef.name];
  const rank = acquired ? acquired.general : 0;
  const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  const usedVal = rank >= 1 ? higher : lower;
  const usedName = rank >= 1
    ? skillDef.diceCheck[vals.indexOf(higher)]
    : skillDef.diceCheck[vals.lastIndexOf(lower)];
  const pool = rank >= 1 ? higher + rank : lower;

  const tr = document.createElement('tr');
  if (rank === 0) tr.className = 'unranked';
  tr.dataset.pool = pool;
  tr.dataset.skillName = skillDef.name + (skillDef.requiresRank ? '*' : '');

  const nameTd = document.createElement('td');
  nameTd.appendChild(makeTooltip(skillDef.name + (skillDef.requiresRank ? '*' : ''), glossary.get(skillDef.name)));
  const statTd = document.createElement('td');
  statTd.textContent = `${usedName} ${usedVal}`;

  const rankTd = document.createElement('td');
  if (mode === 'view') {
    const rankValue = document.createElement('span');
    rankValue.textContent = rank;
    rankTd.appendChild(rankValue);
  } else {
    const rankInput = document.createElement('input');
    rankInput.type = 'number';
    rankInput.min = '0';
    rankInput.max = '6';
    rankInput.className = 'skill-rank-input';
    rankInput.value = rank;
    rankInput.addEventListener('click', e => e.stopPropagation());
    rankInput.addEventListener('change', () => {
      setGeneralRank(npc, skillDef.name, rankInput.value);
      onChange();
    });
    rankTd.appendChild(rankInput);
    if (skillDef.specialized?.length && rank >= 2 && !acquired?.specialized) {
      rankTd.appendChild(buildAddSpecControl(skillDef, npc, onChange));
    }
  }

  const totalTd = document.createElement('td');
  totalTd.textContent = pool;

  tr.appendChild(nameTd);
  tr.appendChild(statTd);
  tr.appendChild(rankTd);
  tr.appendChild(totalTd);
  return tr;
}
```

- [ ] **Step 2: Thread `mode` through the table/section builders**

```js
function buildGeneralSkillTable(skillsSubset, npc, onChange, glossary, mode) {
  const wrap = document.createElement('div');
  wrap.className = 'skill-table-wrap';
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const skillDef of skillsSubset) {
    tbody.appendChild(generalSkillRow(skillDef, npc, onChange, glossary, mode));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildSkillSection(npc, allSkills, onChange, glossary, mode) {
  const wrap = document.createElement('div');
  const half = Math.ceil(allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(0, half), npc, onChange, glossary, mode));
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(half), npc, onChange, glossary, mode));
  wrap.appendChild(pair);

  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  if (specEntries.length > 0) {
    const sec = document.createElement('div');
    sec.innerHTML = '<h3 class="h3-section">Specialized Skills</h3>';
    const specWrap = document.createElement('div');
    specWrap.className = 'skill-table-wrap';
    specWrap.appendChild(buildSpecTable(allSkills, npc, specEntries, onChange, glossary, mode));
    sec.appendChild(specWrap);
    wrap.appendChild(sec);
  }
  return wrap;
}
```

- [ ] **Step 3: Make `buildSpecTable` mode-aware**

```js
function buildSpecTable(allSkills, npc, specEntries, onChange, glossary, mode) {
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const { generalName, name, rank } of specEntries) {
    const skillDef = allSkills.find(s => s.name === generalName);
    if (!skillDef) continue;
    const vals = skillDef.diceCheck.map(s => npc.stats[s] || 0);
    const higher = Math.max(...vals);
    const higherName = skillDef.diceCheck[vals.indexOf(higher)];
    const pool = higher + rank;

    const tr = document.createElement('tr');
    tr.dataset.pool = pool;
    tr.dataset.skillName = `${name} (${generalName})`;

    const nameTd = document.createElement('td');
    const specLabel = document.createElement('span');
    specLabel.textContent = name + ' ';
    const genTooltip = makeTooltip(generalName, glossary.get(generalName));
    genTooltip.classList.add('text-muted-sm');
    nameTd.appendChild(specLabel);
    nameTd.appendChild(genTooltip);
    const statTd = document.createElement('td');
    statTd.textContent = `${higherName} ${higher}`;

    const generalRank = npc.skills[generalName].general;
    const rankTd = document.createElement('td');
    if (mode === 'view') {
      const rankValue = document.createElement('span');
      rankValue.textContent = rank;
      rankTd.appendChild(rankValue);
    } else {
      const rankInput = document.createElement('input');
      rankInput.type = 'number';
      rankInput.min = '0';
      rankInput.max = String(Math.max(0, generalRank - 1));
      rankInput.value = rank;
      rankInput.className = 'skill-rank-input';
      rankInput.addEventListener('click', e => e.stopPropagation());
      rankInput.addEventListener('change', () => {
        npc.skills[generalName].specialized.rank = clampSpecRank(rankInput.value, generalRank);
        onChange();
      });
      rankTd.appendChild(rankInput);
    }

    const totalTd = document.createElement('td');
    totalTd.textContent = pool;

    tr.appendChild(nameTd);
    tr.appendChild(statTd);
    tr.appendChild(rankTd);
    tr.appendChild(totalTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}
```

- [ ] **Step 4: Update the call site in `rebuildBody`**

```js
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody, ctx.glossary));
```
to:
```js
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody, ctx.glossary, mode));
```

- [ ] **Step 5: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli eval "document.querySelectorAll('.skill-table input.skill-rank-input').length"
```
Expected: `0` in view mode.

```bash
playwright-cli click "role=button[name='Edit']"
playwright-cli eval "document.querySelectorAll('.skill-table input.skill-rank-input').length"
```
Expected: greater than `0` (one per skill row, plus one per specialization if any exist).

```bash
playwright-cli find "+ spec"
```
Expected: found in edit mode wherever a skill has rank >= 2 and no specialization yet (depends on the randomly generated NPC — if none qualifies, this step may find nothing; that's acceptable, note it rather than treat as failure).

```bash
playwright-cli click "role=button[name='Save']"
playwright-cli find "+ spec"
```
Expected: not found in view mode (add-spec control is edit-only, per spec).

```bash
playwright-cli close
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: respect view/edit mode in the Full NPC general and specialized skill tables"
```

---

## Task 6: Larger fields while editing

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: the `.card.is-editing` class toggled by `renderFullCard` in Task 3.

- [ ] **Step 1: Add enlarged-field rules scoped to edit mode**

In `css/style.css`, add after the `.field-value` rule added in Task 3:

```css
.card.is-editing input,
.card.is-editing select {
  font-size: 1.05rem;
  padding: 0.6rem 0.85rem;
}

.card.is-editing .stat-input,
.card.is-editing .skill-rank-input {
  width: 3.75rem;
  font-size: 1.05rem;
  padding: 0.5rem 0.4rem;
}
```

- [ ] **Step 2: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli click "role=button[name='Edit']"
playwright-cli eval "getComputedStyle(document.querySelector('.stat-table input.stat-input')).fontSize"
playwright-cli close
kill %1
```
Expected: `16.8px` (1.05rem at the browser's default 16px root) — larger than the base `input, select` rule's implicit ~14.4px (0.9rem).

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: enlarge Full NPC card fields while in edit mode"
```

---

## Task 7: Stat/skill table visual redesign

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.stat-table`, `.skill-table` (and their `thead`/`tbody`/`tr`/`td` structure), already defined at `css/style.css:211-248`.

This task addresses the "tables feel indistinct" / visual-weight feedback from the design spec. Unlike the other tasks, the exact values (borders, header shading, row spacing) are intentionally not prescribed here — **invoke the `frontend-design` skill** before making changes, and have it choose specific colors/spacing against this app's existing CSS custom properties in `css/style.css`'s `:root` block (do not introduce new ad hoc colors outside those tokens).

**Acceptance criteria** (not literal CSS):
- `.stat-table` and `.skill-table` read as visually distinct, bounded sections against the surrounding card — stronger than the current 1px `var(--border)` cell borders alone.
- Table headers (`.skill-table th`) have enough visual weight (shading/weight/border) to be immediately scannable as headers, not just another row.
- Row spacing/contrast makes individual rows easy to track left-to-right without losing your place, especially in the two-column `.skill-table-pair` layout.
- Changes apply equally in both view and edit mode (the redesign is about table chrome, not about the mode-specific cell contents from Tasks 4-5).
- No inline styles introduced; no new colors outside the existing `--*` custom properties already defined in `css/style.css`.

- [ ] **Step 1: Invoke the frontend-design skill and apply its recommended CSS changes to `.stat-table`, `.skill-table`, and related selectors in `css/style.css`.**

- [ ] **Step 2: Verify in browser**

```bash
python3 -m http.server 8934 &
sleep 1
playwright-cli open http://localhost:8934
playwright-cli eval "navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))"
playwright-cli reload
playwright-cli click "text=Full NPC"
playwright-cli screenshot
playwright-cli click "role=button[name='Edit']"
playwright-cli screenshot
playwright-cli close
kill %1
```
Expected: both screenshots show visually distinct, well-bordered stat/skill tables per the acceptance criteria above. Manually review the screenshots against the criteria before committing.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: redesign Full NPC stat/skill tables for stronger visual weight"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Edit/Save toggle (Tasks 3-5), Current Body/Mind/Soul exception (Task 4, `currentCell` untouched), larger edit-mode fields (Task 6), stat/skill/ability tooltips (Task 2, with the ability-field redundancy called out explicitly), table visual redesign (Task 7). Quick NPC card is unaffected, as specified — no task touches `renderQuickCard`.
- **Type/signature consistency:** `statCell`, `buildStatSection`, `generalSkillRow`, `buildGeneralSkillTable`, `buildSkillSection`, `buildSpecTable` all gain `glossary` in Task 2 and `mode` in Tasks 4-5, in that consistent parameter order everywhere they're defined and called. `renderFullCard`'s `mode` parameter and `rerender()` closure are introduced once, in Task 3, and reused as-is by Tasks 4-5 without further signature changes to `renderFullCard` itself.
- **No placeholders:** every step has literal code or a literal, runnable verification command; Task 7 intentionally defers only the specific CSS *values* to the frontend-design skill, per the design spec's own explicit deferral — the acceptance criteria constrain what "done" means so this isn't open-ended.

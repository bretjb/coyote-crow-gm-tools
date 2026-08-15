# Editable Full NPC Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Full NPC card in `js/npc-gen.js` from a read-only display into a live-editable character sheet: editable name, base stats (with live derived recalculation), a redesigned 3-row×6-column stat table with Current-HP tracking, a two-column split General Skills table with editable ranks and inline specialization-adding, and dropdown+custom-value editing for Motivation/Path/Archetype/Ability/Age/Gender/Sexuality — with Archetype/Path swaps re-applying their stat bonuses and Archetype swaps re-rolling the free skill rank.

**Architecture:** `renderFullCard` becomes a stateful view over a mutable `npc` object held in a closure. Every editable control mutates `npc` in place and calls a shared `rebuildBody()` closure that fully re-renders the stat table and skill tables from current `npc` state (simpler and more reliable than fine-grained per-field patching, and cheap given the small table sizes). Metadata fields (name, motivation, path, archetype, ability, demographics) each own a small self-contained builder function that renders its own control and updates its own note/description text on change; archetype and path changes additionally trigger `rebuildBody()` since they alter `npc.stats`. No new files — all changes live in `js/npc-character-gen.js`, `js/npc-gen.js`, `css/style.css`, and a cache-version bump in `sw.js`.

**Tech Stack:** Vanilla JS (ES modules), no build step, no test framework — verify by exercising the app in a browser (`playwright-cli`, per this repo's testing convention) after serving with `python3 -m http.server 8934`, unregistering the service worker and clearing caches between runs so edits aren't masked by the cache-first `sw.js`.

## Global Constraints

- Never use emoji, including in UI copy or code comments.
- Never use inline styles (`style="..."` attributes or `.style.x = ...`). All styling goes in `css/style.css`.
- No JS unit test suite exists in this project — verify manually in a browser, not by writing test files.
- This applies to Full NPC cards only; Quick NPC cards are unaffected except for the shared `appendCopyBtn`/`appendInitiativeBtn` signature change in Task 4.
- Stat edits clamp to 1-5, skill ranks clamp to 0-6, specialization ranks clamp to `0..general-1` — no point-buy budget/cost enforcement.
- Editable-field edits persist only when the GM clicks the existing Save button (no autosave).
- Full spec: `docs/superpowers/specs/2026-08-15-editable-npc-card-design.md`.

---

### Task 1: Clamp helpers in `npc-character-gen.js`

**Files:**
- Modify: `js/npc-character-gen.js`

**Interfaces:**
- Produces: `clampStat(v): number` (1-5), `clampSkillRank(v): number` (0-6), `clampSpecRank(v, generalRank): number` (0..max(0, generalRank-1)) — all exported, all coerce non-numeric/NaN input to the range floor.

- [ ] **Step 1: Add the three clamp helpers**

Add to `js/npc-character-gen.js`, after the existing `weightedRandom` export (after line 18):

```js
export function clampStat(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

export function clampSkillRank(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 0;
  return Math.min(6, Math.max(0, n));
}

export function clampSpecRank(v, generalRank) {
  const max = Math.max(0, generalRank - 1);
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(0, n));
}
```

- [ ] **Step 2: Manually verify in the browser console**

Serve the app (`python3 -m http.server 8934` from the repo root if not already running), open `http://localhost:8934` in a browser, open devtools console, and run:

```js
import('./js/npc-character-gen.js').then(m => {
  console.log(m.clampStat(7), m.clampStat(0), m.clampStat('x'));       // 5 1 1
  console.log(m.clampSkillRank(9), m.clampSkillRank(-1));               // 6 0
  console.log(m.clampSpecRank(5, 2), m.clampSpecRank(-1, 3));           // 1 0
});
```

Confirm the logged values match the comments.

- [ ] **Step 3: Commit**

```bash
git add js/npc-character-gen.js
git commit -m "feat: add stat/skill-rank clamp helpers for editable NPC fields"
```

---

### Task 2: Editable stat table + split, editable General Skills tables

**Files:**
- Modify: `js/npc-gen.js` (imports, `generateFullNpc`, `renderFullCard`, `renderQuickCard` call site unaffected here, remove old `buildSkillTable`/`stat-grid` rendering)
- Modify: `css/style.css` (replace `.stat-grid`/`.stat-cell`/`.derived-grid` with `.stat-table` styles; add `.skill-table-pair`)

This is the core visual redesign: the old `stat-grid`/`derived-grid` divs and the single 28-row skill table are replaced with the new 3×6 stat table (editable stats + Current tracking) and two side-by-side General Skills tables (editable ranks), all driven by one `rebuildBody()` closure so editing a stat immediately updates derived values and every skill pool.

**Interfaces:**
- Consumes: `clampStat`, `clampSkillRank` from Task 1.
- Produces: `ensureCurrent(npc)`, `recalcDerivedAndSyncCurrent(npc)`, `buildStatSection(npc, onChange)`, `buildSkillSection(npc, allSkills, onChange)` — module-internal functions in `js/npc-gen.js`, reused by later tasks. `renderFullCard(npc, ctx, savedEntry)` — new signature (was `(npc, allSkills, savedEntry)`); `ctx = { allSkills, nameData, motivations, paths, archetypes, abilities }`.

- [ ] **Step 1: Update imports and add `npc.current` to generated NPCs**

In `js/npc-gen.js`, change the import line (line 2):

```js
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility, clampStat, clampSkillRank } from './npc-character-gen.js';
```

In `generateFullNpc` (around line 137-153), change the `return` to include `current`:

```js
  const derived = calcDerivedStats(stats);
  return {
    name: generateName(nameData),
    motivation: pick(motivations),
    archetype: archetype.name,
    archetypeStatBonus: archetype.statBonus,
    freeSkill,
    age: weightedPickDemographic(archetype.demographics.age),
    gender: weightedPickDemographic(archetype.demographics.gender),
    sexuality: weightedPickDemographic(archetype.demographics.sexuality),
    path,
    giftsAndBurdens: selectGiftsBurdens(giftsAndBurdens),
    stats,
    skills,
    ability: selectAbility(abilities, archetype.statPriorities),
    derived,
    current: { Body: derived.Body, Mind: derived.Mind, Soul: derived.Soul },
  };
```

- [ ] **Step 2: Add `ensureCurrent` and `recalcDerivedAndSyncCurrent`**

Add these module-level functions in `js/npc-gen.js` (near `weightedPickDemographic`):

```js
function ensureCurrent(npc) {
  if (!npc.current) {
    npc.current = { Body: npc.derived.Body, Mind: npc.derived.Mind, Soul: npc.derived.Soul };
  }
}

function recalcDerivedAndSyncCurrent(npc) {
  const prevDerived = npc.derived;
  const prevCurrent = npc.current;
  const newDerived = calcDerivedStats(npc.stats);
  const newCurrent = {};
  for (const key of ['Body', 'Mind', 'Soul']) {
    newCurrent[key] = prevCurrent[key] === prevDerived[key]
      ? newDerived[key]
      : Math.min(prevCurrent[key], newDerived[key]);
  }
  npc.derived = newDerived;
  npc.current = newCurrent;
}
```

`ensureCurrent` handles NPCs saved before this feature existed (no `current` field): it defaults Current to Max at render time, without writing anything to storage until the GM edits and saves. `recalcDerivedAndSyncCurrent` implements the "Current follows Max only if untouched" rule: if Current still equalled the old Max, it moves with the new Max; otherwise (GM tracked damage) it's clamped down only if the new Max is now lower than the tracked Current, and left alone otherwise.

- [ ] **Step 3: Add the stat table builder functions**

Add these module-level functions and constants in `js/npc-gen.js`:

```js
const STAT_ABBR = {
  Strength: 'STR', Agility: 'AGI', Endurance: 'END',
  Intelligence: 'INT', Perception: 'PER', Wisdom: 'WIS',
  Spirit: 'SPI', Charisma: 'CHA', Will: 'WILL',
};
const DEFENSE_ABBR = { 'Physical Defence': 'PD', 'Mental Defence': 'MD', 'Mystical Defence': 'SD' };

function statCell(statName, npc, onChange) {
  const td = document.createElement('td');
  const label = document.createElement('span');
  label.className = 'stat-cell-label';
  label.textContent = STAT_ABBR[statName];
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

function readOnlyCell(label, value) {
  const td = document.createElement('td');
  td.innerHTML = `<span class="stat-cell-label">${esc(label)}</span><br><span class="stat-cell-value">${esc(value)}</span>`;
  return td;
}

function currentCell(bodyKey, npc) {
  const td = document.createElement('td');
  const label = document.createElement('span');
  label.className = 'stat-cell-label';
  label.textContent = `${bodyKey} (Current)`;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'stat-input';
  input.value = npc.current[bodyKey];
  input.addEventListener('change', () => {
    const max = npc.derived[bodyKey];
    npc.current[bodyKey] = Math.min(max, Math.max(0, Math.round(Number(input.value)) || 0));
    input.value = npc.current[bodyKey];
  });
  td.appendChild(label);
  td.appendChild(document.createElement('br'));
  td.appendChild(input);
  return td;
}

function buildStatSection(npc, onChange) {
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
    tr.appendChild(statCell(s1, npc, onChange));
    tr.appendChild(statCell(s2, npc, onChange));
    tr.appendChild(statCell(s3, npc, onChange));
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

- [ ] **Step 4: Add the split General Skills table builder, replacing `buildSkillTable`**

Delete the existing `buildSkillTable` function (current lines 266-294) and replace it with:

```js
function generalSkillRow(skillDef, npc, onChange) {
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
  nameTd.textContent = skillDef.name + (skillDef.requiresRank ? '*' : '');
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

  const totalTd = document.createElement('td');
  totalTd.textContent = pool;

  tr.appendChild(nameTd);
  tr.appendChild(statTd);
  tr.appendChild(rankTd);
  tr.appendChild(totalTd);
  return tr;
}

function setGeneralRank(npc, name, rawValue) {
  const rank = clampSkillRank(rawValue);
  const existing = npc.skills[name];
  if (rank === 0) {
    if (existing?.specialized) {
      existing.general = 0;
    } else {
      delete npc.skills[name];
    }
    return;
  }
  if (!existing) {
    npc.skills[name] = { general: rank };
  } else {
    existing.general = rank;
  }
}

function buildGeneralSkillTable(skillsSubset, npc, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'skill-table-wrap';
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const skillDef of skillsSubset) {
    tbody.appendChild(generalSkillRow(skillDef, npc, onChange));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildSkillSection(npc, allSkills, onChange) {
  const wrap = document.createElement('div');
  const half = Math.ceil(allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(0, half), npc, onChange));
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(half), npc, onChange));
  wrap.appendChild(pair);

  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  if (specEntries.length > 0) {
    const sec = document.createElement('div');
    sec.innerHTML = '<h3 class="h3-section">Specialized Skills</h3>';
    const specWrap = document.createElement('div');
    specWrap.className = 'skill-table-wrap';
    specWrap.appendChild(buildSpecTable(allSkills, npc.stats, specEntries));
    sec.appendChild(specWrap);
    wrap.appendChild(sec);
  }
  return wrap;
}
```

Note: `buildSpecTable` (existing function, current lines 296-319) stays as-is for this task — its rank inputs and the "add a new specialization" flow are added in Task 3. Update its call site here to still work with `npc.stats` as before (signature unchanged in this task).

- [ ] **Step 5: Rewrite `renderFullCard`'s stat/skill markup to use the new builders**

Replace the body of `renderFullCard` (current lines 180-257). The header (name/meta/motivation/path/gifts-burdens text) and ability section stay as static HTML for now — they become editable in later tasks. Replace only the `<h3>Stats</h3>...<h3>Ability</h3>` portion of the template string and the code that populates it:

```js
function renderFullCard(npc, ctx, savedEntry) {
  ensureCurrent(npc);
  const card = document.createElement('div');
  card.className = 'card';

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <h2>${esc(npc.name)}</h2>
    <p class="npc-meta">${esc(npc.archetype)} · ${esc(npc.age)} · ${esc(npc.gender)} · ${esc(npc.sexuality)}</p>
    <p class="npc-meta-sm">+1 ${esc(npc.archetypeStatBonus)} · free rank: ${esc(npc.freeSkill)}</p>
    <p><strong>Motivation:</strong> ${esc(npc.motivation.name)}</p>
    <p><strong>Path:</strong> ${esc(npc.path.name)} <span class="text-muted-sm">(+1 ${esc(npc.path.statBonuses.join(', +1 '))})</span></p>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <p class="mb-0-75"><strong>${esc(npc.ability.name)}</strong> — ${esc(npc.ability.description)}
      <span class="text-muted-sm">[${esc(npc.ability.diceCheck.join(' + '))}]</span>
    </p>
  `;

  const statSectionEl = card.querySelector('#stat-section');
  const skillSectionEl = card.querySelector('#skill-section');
  const rollResult = card.querySelector('#skill-roll-result');

  function rebuildBody() {
    statSectionEl.innerHTML = '';
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody));
    skillSectionEl.innerHTML = '';
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody));
  }
  rebuildBody();

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

  appendCopyBtn(card, npcToText(npc));
  appendInitiativeBtn(card, npc.name, Math.min(12, Math.max(1, npc.derived.Initiative)));
  appendSaveControls(card, 'full', npc, savedEntry);
  return card;
}
```

(`appendCopyBtn`/`appendInitiativeBtn` keep their current static-value signatures in this task — they're upgraded to live getters in Task 4 when Name becomes editable.)

- [ ] **Step 6: Update `init()` to build `ctx` and pass it through**

In `init()` (current lines 115-121), replace the `btnFull` handler:

```js
  const ctx = { nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes };

  btnFull.addEventListener('click', () => {
    setActiveMode('full');
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, ctx, undefined));
  });
```

Move this `ctx` declaration up above the `renderSavedList`/`subscribe` calls (around current line 70), and update those two call sites too:

```js
  renderSavedList(savedListEl, output, ctx);
  subscribe(() => renderSavedList(savedListEl, output, ctx));
```

- [ ] **Step 7: Update `renderSavedList` to accept and forward `ctx`**

In `renderSavedList` (current lines 420-464), change the signature and the one call site that builds a full card:

```js
function renderSavedList(listEl, output, ctx) {
```

```js
        const card = entry.kind === 'full'
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note });
```

- [ ] **Step 8: Update CSS**

In `css/style.css`, delete the `.stat-grid` / `.stat-cell` / `.derived-grid` rules (current lines 300-305), keeping `.stat-cell-label` and `.stat-cell-value` if they're referenced elsewhere in those same lines — reproduce them standalone:

```css
.stat-cell-label { color: var(--muted); font-size: 0.75rem; }
.stat-cell-value { font-size: 1.1rem; color: var(--accent-copper); font-variant-numeric: tabular-nums; }

.stat-table-wrap { overflow-x: auto; margin-bottom: 0.75rem; }
.stat-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.stat-table td { padding: 0.35rem 0.5rem; border: 1px solid var(--border); text-align: center; vertical-align: top; }
.stat-input { width: 3rem; text-align: center; }

.skill-table-pair { display: flex; gap: 0; margin-bottom: 0.75rem; }
.skill-table-pair .skill-table-wrap { flex: 1 1 50%; margin-bottom: 0; }
.skill-rank-input { width: 3rem; text-align: center; }

@media (max-width: 767.98px) {
  .skill-table-pair { flex-direction: column; }
}
```

- [ ] **Step 9: Manually verify in the browser**

Serve the app, unregister any existing service worker and clear caches (devtools > Application), reload, go to the NPC tab, click Full NPC. Confirm:
- The stat area renders as one table, 3 rows × 6 columns, matching STR/AGI/END/PD/Body/Body(Current) per row.
- Editing a stat input (e.g. increase STR) and pressing Tab/Enter updates PD, Body, and Body (Current) if Current was at max; General Skills pool totals for skills using Strength also update.
- Lowering Body(Current) below max, then editing STR again, leaves Body(Current) untouched (still the lower value) rather than snapping back to the new max.
- General Skills renders as two side-by-side tables with no gap between them, first table ending at Investigation, second starting at Knowledge.
- Editing a skill's rank input updates its Total column live and reclassifies the row from muted/unranked styling once rank > 0.
- Clicking a skill row (not the input) still rolls dice as before.

- [ ] **Step 10: Commit**

```bash
git add js/npc-gen.js css/style.css
git commit -m "feat: redesign NPC stat table and split General Skills table, both editable"
```

---

### Task 3: Specialized skill rank editing + inline "add specialization"

**Files:**
- Modify: `js/npc-gen.js` (`buildSpecTable`, `generalSkillRow`/`setGeneralRank`, new `buildAddSpecControl`)
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `clampSpecRank` (Task 1), `buildSkillSection`/`generalSkillRow`/`setGeneralRank` (Task 2).
- Produces: `buildAddSpecControl(skillDef, npc, onChange): HTMLElement`, updated `buildSpecTable(allSkills, npc, specEntries, onChange)` (now takes `npc` instead of `npc.stats`, and `onChange`).

- [ ] **Step 1: Make `setGeneralRank` re-clamp an existing specialization's rank**

In `js/npc-gen.js`, update `setGeneralRank` (added in Task 2) so lowering the general rank also re-clamps any existing specialization:

```js
function setGeneralRank(npc, name, rawValue) {
  const rank = clampSkillRank(rawValue);
  const existing = npc.skills[name];
  if (rank === 0) {
    if (existing?.specialized) {
      existing.general = 0;
      existing.specialized.rank = clampSpecRank(existing.specialized.rank, 0);
    } else {
      delete npc.skills[name];
    }
    return;
  }
  if (!existing) {
    npc.skills[name] = { general: rank };
  } else {
    existing.general = rank;
    if (existing.specialized) {
      existing.specialized.rank = clampSpecRank(existing.specialized.rank, rank);
    }
  }
}
```

Update the import line to add `clampSpecRank`:

```js
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility, clampStat, clampSkillRank, clampSpecRank } from './npc-character-gen.js';
```

- [ ] **Step 2: Add the inline "add specialization" control and wire it into general skill rows**

Add to `js/npc-gen.js`:

```js
function buildAddSpecControl(skillDef, npc, onChange) {
  const wrap = document.createElement('span');
  wrap.className = 'add-spec-wrap';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ spec';
  addBtn.className = 'secondary add-spec-btn';

  const picker = document.createElement('span');
  picker.className = 'add-spec-picker hidden';

  const select = document.createElement('select');
  for (const name of skillDef.specialized) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  const generalRank = npc.skills[skillDef.name].general;
  const rankInput = document.createElement('input');
  rankInput.type = 'number';
  rankInput.min = '1';
  rankInput.max = String(Math.max(1, generalRank - 1));
  rankInput.value = '1';
  rankInput.className = 'skill-rank-input';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Add';
  confirmBtn.className = 'mt-0-5';

  addBtn.addEventListener('click', e => {
    e.stopPropagation();
    addBtn.classList.add('hidden');
    picker.classList.remove('hidden');
  });
  select.addEventListener('click', e => e.stopPropagation());
  rankInput.addEventListener('click', e => e.stopPropagation());
  confirmBtn.addEventListener('click', e => {
    e.stopPropagation();
    npc.skills[skillDef.name].specialized = { name: select.value, rank: clampSpecRank(rankInput.value, generalRank) || 1 };
    onChange();
  });

  picker.appendChild(select);
  picker.appendChild(rankInput);
  picker.appendChild(confirmBtn);
  wrap.appendChild(addBtn);
  wrap.appendChild(picker);
  return wrap;
}
```

In `generalSkillRow` (Task 2), after building `rankTd`'s rank input, add the eligibility check for showing the add-spec control:

```js
  rankTd.appendChild(rankInput);
  if (skillDef.specialized?.length && rank >= 2 && !acquired?.specialized) {
    rankTd.appendChild(buildAddSpecControl(skillDef, npc, onChange));
  }
```

- [ ] **Step 3: Make specialized-skill rows editable**

Replace `buildSpecTable` entirely:

```js
function buildSpecTable(allSkills, npc, specEntries, onChange) {
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
    nameTd.innerHTML = `${esc(name)} <span class="text-muted-sm">${esc(generalName)}</span>`;
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

Update its call site in `buildSkillSection` (Task 2):

```js
    specWrap.appendChild(buildSpecTable(allSkills, npc, specEntries, onChange));
```

- [ ] **Step 4: Add CSS for the add-spec control**

In `css/style.css`:

```css
.add-spec-wrap { display: inline-flex; align-items: center; gap: 0.3rem; margin-left: 0.3rem; }
.add-spec-picker { display: inline-flex; align-items: center; gap: 0.3rem; }
.add-spec-btn { font-size: 0.72rem; padding: 0.1rem 0.35rem; }
```

- [ ] **Step 5: Manually verify in the browser**

Generate a Full NPC, find a general skill with rank >= 2 and no current specialization (bump a skill's rank to 2 via its input if none qualifies naturally). Confirm a "+ spec" control appears, clicking it reveals a dropdown + rank input + Add button, and clicking Add moves it into a new "Specialized Skills" section below with an editable rank input clamped to `general - 1`. Confirm editing an existing specialization's rank updates its Total, and confirm lowering the parent general rank re-clamps the specialization rank down if needed (e.g. general rank 3 -> 1 should clamp any rank-2 specialization down to 0).

- [ ] **Step 6: Commit**

```bash
git add js/npc-gen.js css/style.css
git commit -m "feat: add inline specialization adding and editable specialization ranks"
```

---

### Task 4: Editable Name field, live Copy/Add-to-Initiative

**Files:**
- Modify: `js/npc-gen.js` (`appendCopyBtn`, `appendInitiativeBtn`, `renderFullCard`, `renderQuickCard`, `npcToText`)
- Modify: `css/style.css`

Name becomes editable, and because `appendCopyBtn`/`appendInitiativeBtn` currently close over a static snapshot of the NPC's text/name, they're upgraded to call a getter function so they always reflect the latest edits — otherwise the Copy button and "Add to Initiative" would silently use the NPC's original generated name after a rename.

**Interfaces:**
- Produces: updated `appendCopyBtn(card, getText)`, `appendInitiativeBtn(card, getName, suggestedSlot)` (both now take functions, not values) — used by both Quick and Full cards.

- [ ] **Step 1: Change `appendCopyBtn` and `appendInitiativeBtn` to take getters**

Replace both functions in `js/npc-gen.js`:

```js
function appendCopyBtn(card, getText) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary mt-0-5';
  btn.addEventListener('click', () => navigator.clipboard.writeText(getText()));
  card.appendChild(btn);
}
```

```js
function appendInitiativeBtn(card, getName, suggestedSlot) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-actions';

  const btn = document.createElement('button');
  btn.textContent = 'Add to Initiative';
  btn.className = 'secondary mt-0-5';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.className = 'input-narrow hidden';
  if (suggestedSlot != null) input.value = String(suggestedSlot);

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'hidden mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', () => {
    btn.classList.add('hidden');
    input.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    input.focus();
  });

  confirmBtn.addEventListener('click', () => {
    const slot = parseInt(input.value, 10);
    if (isNaN(slot) || slot < 1 || slot > 12) {
      status.textContent = 'Enter a slot 1-12';
      return;
    }
    addCombatant(getName(), slot);
    input.classList.add('hidden');
    confirmBtn.classList.add('hidden');
    status.textContent = `Added to Initiative slot ${slot}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}
```

- [ ] **Step 2: Update both call sites**

In `renderQuickCard`:

```js
  appendCopyBtn(card, () => `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, () => npc.name, null);
```

In `renderFullCard` (Task 2's version):

```js
  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, Math.min(12, Math.max(1, npc.derived.Initiative)));
```

- [ ] **Step 3: Make the name editable in `renderFullCard`**

In `renderFullCard`'s template string, replace the `<h2>${esc(npc.name)}</h2>` line with a placeholder div:

```html
    <div id="name-section" class="row-flex-wrap mb-0-5"></div>
```

After `card.innerHTML = ...`, before `rebuildBody()`, add:

```js
  const nameSectionEl = card.querySelector('#name-section');
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
```

- [ ] **Step 4: Add CSS for the name input**

In `css/style.css`:

```css
.input-name { flex: 1; min-width: 8rem; font-size: 1.3rem; font-family: var(--font-display); }
```

- [ ] **Step 5: Update `npcToText`**

`npcToText` still reads `npc.name` directly so it already reflects edits — no change needed there yet (it starts with `` `${npc.name}\n...` `` already). Confirm this by reading the current function; no edit required this step.

- [ ] **Step 6: Manually verify in the browser**

Generate a Full NPC. Confirm the name renders as a text input next to a "Regenerate Name" button. Type a new name, blur the field (Tab or click away), and confirm it sticks. Click Regenerate Name and confirm it replaces the input's value. Click Copy and confirm the clipboard text (paste it somewhere) starts with the current (possibly renamed) name. Click "Add to Initiative", confirm, and check the Initiative tab shows the current name, not the original generated one.

- [ ] **Step 7: Commit**

```bash
git add js/npc-gen.js css/style.css
git commit -m "feat: make NPC name editable, keep Copy/Add-to-Initiative in sync with edits"
```

---

### Task 5: Motivation and Ability — dropdown + custom value

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Produces: `buildNamedDescField({ label, current, options, onChange, customShape, formatExtra }): { el }` — shared builder for any `{name, description}`-shaped field with a fixed option list, reused for Motivation and Ability.

- [ ] **Step 1: Add the shared `buildNamedDescField` builder**

Add to `js/npc-gen.js`:

```js
function buildNamedDescField({ label, current, options, onChange, customShape, formatExtra }) {
  const el = document.createElement('div');
  el.className = 'mb-0-75';

  const row = document.createElement('div');
  row.className = 'row-flex-wrap';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.className = 'field-label';

  const select = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.name;
    opt.textContent = o.name;
    select.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Custom...';
  select.appendChild(customOpt);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'hidden mt-0-5';

  const desc = document.createElement('p');
  desc.className = 'text-muted-sm';

  function refreshDesc() {
    desc.textContent = (current.description || '') + (formatExtra ? formatExtra(current) : '');
  }

  const known = options.find(o => o.name === current.name);
  if (known) {
    select.value = known.name;
  } else {
    select.value = '__custom__';
    nameInput.value = current.name;
    nameInput.classList.remove('hidden');
  }
  refreshDesc();

  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      nameInput.classList.remove('hidden');
      nameInput.value = '';
      nameInput.focus();
      current = customShape ? customShape() : { name: '', description: '' };
    } else {
      nameInput.classList.add('hidden');
      current = options.find(o => o.name === select.value);
    }
    onChange(current);
    refreshDesc();
  });

  nameInput.addEventListener('change', () => {
    current.name = nameInput.value.trim();
  });

  row.appendChild(labelEl);
  row.appendChild(select);
  el.appendChild(row);
  el.appendChild(nameInput);
  el.appendChild(desc);
  return { el };
}
```

- [ ] **Step 2: Replace the static Motivation and Ability markup**

In `renderFullCard`'s template string, replace:

```html
    <p><strong>Motivation:</strong> ${esc(npc.motivation.name)}</p>
```

with:

```html
    <div id="motivation-section" class="mb-0-75"></div>
```

and replace:

```html
    <h3 class="mb-0-5">Ability</h3>
    <p class="mb-0-75"><strong>${esc(npc.ability.name)}</strong> — ${esc(npc.ability.description)}
      <span class="text-muted-sm">[${esc(npc.ability.diceCheck.join(' + '))}]</span>
    </p>
```

with:

```html
    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
```

After `card.innerHTML = ...`, wire both:

```js
  card.querySelector('#motivation-section').appendChild(
    buildNamedDescField({
      label: 'Motivation',
      current: npc.motivation,
      options: ctx.motivations,
      onChange: v => { npc.motivation = v; },
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
    }).el
  );
```

- [ ] **Step 3: Manually verify in the browser**

Generate a Full NPC. Confirm Motivation and Ability each render as a labeled dropdown with the description text below. Select a different option from each dropdown and confirm the description text updates. Select "Custom..." on Motivation, type a name, blur, and confirm it's accepted (description stays blank). Repeat for Ability and confirm no dice-check bracket shows for a custom ability. Click Copy and confirm the copied text reflects the custom Motivation name.

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: make Motivation and Ability editable via dropdown or custom value"
```

---

### Task 6: Age, Gender, Sexuality — dropdown + custom value

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Produces: `buildSelectCustomField({ label, value, options, onChange }): { el, setOptions(opts, currentValue) }` — reused in Task 7 to repopulate these three fields when Archetype changes.

- [ ] **Step 1: Add the shared `buildSelectCustomField` builder**

Add to `js/npc-gen.js`:

```js
function buildSelectCustomField({ label, value, options, onChange }) {
  const el = document.createElement('div');
  el.className = 'row-flex-wrap mb-0-5';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.className = 'field-label';

  const select = document.createElement('select');
  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.className = 'hidden mt-0-5';

  function populate(opts, currentValue) {
    select.innerHTML = '';
    for (const opt of opts) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Custom...';
    select.appendChild(customOpt);

    if (opts.includes(currentValue)) {
      select.value = currentValue;
      customInput.classList.add('hidden');
    } else {
      select.value = '__custom__';
      customInput.value = currentValue;
      customInput.classList.remove('hidden');
    }
  }

  populate(options, value);

  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      customInput.classList.remove('hidden');
      customInput.value = '';
      customInput.focus();
      onChange('');
    } else {
      customInput.classList.add('hidden');
      onChange(select.value);
    }
  });

  customInput.addEventListener('change', () => {
    onChange(customInput.value.trim());
  });

  el.appendChild(labelEl);
  el.appendChild(select);
  el.appendChild(customInput);

  return { el, setOptions: (opts, currentValue) => populate(opts, currentValue) };
}
```

- [ ] **Step 2: Replace the static demographics text with three editable fields**

In `renderFullCard`'s template string, the `npc-meta` line currently shows archetype/age/gender/sexuality together — split it. Replace:

```html
    <p class="npc-meta">${esc(npc.archetype)} · ${esc(npc.age)} · ${esc(npc.gender)} · ${esc(npc.sexuality)}</p>
```

with:

```html
    <p class="npc-meta" id="archetype-label"></p>
    <div id="demographics-section" class="row-flex-wrap mb-0-5"></div>
```

After `card.innerHTML = ...`, add (Archetype label wiring is finished in Task 8, so for now just render the static archetype name here — Task 8 replaces this with the live dropdown):

```js
  card.querySelector('#archetype-label').textContent = npc.archetype;

  function archetypeDemographics(key) {
    const def = ctx.archetypes.find(a => a.name === npc.archetype);
    const list = def ? def.demographics[key].map(o => o.value) : [];
    return [...new Set(list)];
  }

  const demoSectionEl = card.querySelector('#demographics-section');
  const ageField = buildSelectCustomField({
    label: 'Age', value: npc.age, options: archetypeDemographics('age'),
    onChange: v => { npc.age = v; },
  });
  const genderField = buildSelectCustomField({
    label: 'Gender', value: npc.gender, options: archetypeDemographics('gender'),
    onChange: v => { npc.gender = v; },
  });
  const sexualityField = buildSelectCustomField({
    label: 'Sexuality', value: npc.sexuality, options: archetypeDemographics('sexuality'),
    onChange: v => { npc.sexuality = v; },
  });
  demoSectionEl.appendChild(ageField.el);
  demoSectionEl.appendChild(genderField.el);
  demoSectionEl.appendChild(sexualityField.el);
```

- [ ] **Step 3: Manually verify in the browser**

Generate a Full NPC. Confirm Age/Gender/Sexuality each render as labeled dropdowns pre-selected to the generated value, sourced from that archetype's demographic option lists. Change one via dropdown and confirm it sticks. Select Custom on one, type a value, blur, and confirm it's accepted.

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: make Age, Gender, and Sexuality editable via dropdown or custom value"
```

---

### Task 7: Path — dropdown + custom value with stat-bonus swap

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `clampStat` (Task 1), `recalcDerivedAndSyncCurrent` (Task 2).
- Produces: `swapPath(npc, newPath)` — mutates `npc.stats`/`npc.path`/`npc.derived`/`npc.current` in place.

- [ ] **Step 1: Add `swapPath`**

Add to `js/npc-gen.js`:

```js
function swapPath(npc, newPath) {
  for (const stat of npc.path.statBonuses) {
    npc.stats[stat] = clampStat(npc.stats[stat] - 1);
  }
  for (const stat of newPath.statBonuses) {
    npc.stats[stat] = clampStat(npc.stats[stat] + 1);
  }
  npc.path = { name: newPath.name, statBonuses: [...newPath.statBonuses] };
  recalcDerivedAndSyncCurrent(npc);
}
```

- [ ] **Step 2: Replace the static Path markup with an editable field**

In `renderFullCard`'s template string, replace:

```html
    <p><strong>Path:</strong> ${esc(npc.path.name)} <span class="text-muted-sm">(+1 ${esc(npc.path.statBonuses.join(', +1 '))})</span></p>
```

with:

```html
    <div id="path-section" class="mb-0-5"></div>
```

After `card.innerHTML = ...` (this needs `rebuildBody` in scope, so add it after `rebuildBody` is declared but the wiring order doesn't matter since it's only invoked on user interaction — add it alongside the other field wiring, before `rebuildBody()` is called or after; either works since `rebuildBody` is a hoisted function declaration):

```js
  const pathSectionEl = card.querySelector('#path-section');
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
```

- [ ] **Step 3: Manually verify in the browser**

Generate a Full NPC, note its Path and the two stats it lists a "+1" bonus for, and note those stats' current values. Switch Path via the dropdown to a different one and confirm: the old bonus stats each drop by 1 (clamped at 1), the new path's bonus stats each rise by 1 (clamped at 5), the note text below updates to the new path's bonuses, and the stat table numbers reflect the change immediately. Select Custom, type a path name, and confirm the note text disappears (no bonuses) and no stats changed from that swap.

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: make Path editable with stat-bonus swap on change"
```

---

### Task 8: Archetype — dropdown with stat-bonus/free-skill swap and demographics refresh

**Files:**
- Modify: `js/npc-gen.js`

**Interfaces:**
- Consumes: `clampStat`, `clampSkillRank` (Task 1), `recalcDerivedAndSyncCurrent` (Task 2), `pick` (existing helper), `ageField`/`genderField`/`sexualityField.setOptions` (Task 6).
- Produces: `swapArchetype(npc, newArchetype)`.

- [ ] **Step 1: Add `swapArchetype`**

Add to `js/npc-gen.js`:

```js
function swapArchetype(npc, newArchetype) {
  npc.stats[npc.archetypeStatBonus] = clampStat(npc.stats[npc.archetypeStatBonus] - 1);
  npc.archetypeStatBonus = newArchetype.statBonus;
  npc.stats[npc.archetypeStatBonus] = clampStat(npc.stats[npc.archetypeStatBonus] + 1);

  const oldFreeSkill = npc.freeSkill;
  const oldEntry = npc.skills[oldFreeSkill];
  if (oldEntry) {
    oldEntry.general = clampSkillRank(oldEntry.general - 1);
    if (oldEntry.general === 0 && !oldEntry.specialized) {
      delete npc.skills[oldFreeSkill];
    }
  }

  const newFreeSkill = pick(newArchetype.freeSkillOptions);
  if (!npc.skills[newFreeSkill]) {
    npc.skills[newFreeSkill] = { general: 1 };
  } else {
    npc.skills[newFreeSkill].general = clampSkillRank(npc.skills[newFreeSkill].general + 1);
  }
  npc.freeSkill = newFreeSkill;
  npc.archetype = newArchetype.name;

  recalcDerivedAndSyncCurrent(npc);
}
```

- [ ] **Step 2: Replace the static Archetype label with a dropdown, wired to demographics and body rebuild**

Replace the `#archetype-label` wiring added in Task 6, Step 2 with a full dropdown. Replace:

```js
  card.querySelector('#archetype-label').textContent = npc.archetype;
```

with:

```js
  const archetypeLabelEl = card.querySelector('#archetype-label');
  const archetypeSelect = document.createElement('select');
  for (const a of ctx.archetypes) {
    const o = document.createElement('option');
    o.value = a.name;
    o.textContent = a.name;
    archetypeSelect.appendChild(o);
  }
  archetypeSelect.value = npc.archetype;
  archetypeLabelEl.replaceWith(archetypeSelect);

  const archetypeNote = document.createElement('p');
  archetypeNote.className = 'npc-meta-sm';
  archetypeSelect.insertAdjacentElement('afterend', archetypeNote);
  function refreshArchetypeNote() {
    archetypeNote.textContent = `+1 ${npc.archetypeStatBonus} · free rank: ${npc.freeSkill}`;
  }
  refreshArchetypeNote();

  archetypeSelect.addEventListener('change', () => {
    const newArchetype = ctx.archetypes.find(a => a.name === archetypeSelect.value);
    swapArchetype(npc, newArchetype);
    refreshArchetypeNote();
    ageField.setOptions(archetypeDemographics('age'), npc.age);
    genderField.setOptions(archetypeDemographics('gender'), npc.gender);
    sexualityField.setOptions(archetypeDemographics('sexuality'), npc.sexuality);
    rebuildBody();
  });
```

This removes the old static `<p class="npc-meta-sm">+1 ...</p>` line — delete it from the template string (it's now built here). In `renderFullCard`'s template string, delete:

```html
    <p class="npc-meta-sm">+1 ${esc(npc.archetypeStatBonus)} · free rank: ${esc(npc.freeSkill)}</p>
```

- [ ] **Step 3: Manually verify in the browser**

Generate a Full NPC, note its Archetype, stat bonus stat, free skill, and Age/Gender/Sexuality values. Switch Archetype via the dropdown to a different one and confirm: the old bonus stat drops by 1, the new archetype's bonus stat rises by 1, the "+1 X · free rank: Y" note updates, the old free skill's rank drops by 1 (or the skill disappears if it hits 0 with no specialization), a skill from the new archetype's free-skill options gains +1, the stat table and skill pools reflect all of this immediately, and the Age/Gender/Sexuality dropdowns repopulate with the new archetype's option lists (previous custom values, if any, are preserved as "Custom...").

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js
git commit -m "feat: make Archetype editable with stat-bonus, free-skill, and demographics swap"
```

---

### Task 9: Current-HP in copy text, cache bump, full QA pass

**Files:**
- Modify: `js/npc-gen.js` (`npcToText`)
- Modify: `sw.js`

**Interfaces:**
- None — final integration/polish task.

- [ ] **Step 1: Add Current values to `npcToText`**

In `js/npc-gen.js`, update `npcToText` to include a Current line after Derived:

```js
function npcToText(npc) {
  const gb = npc.giftsAndBurdens.map(gbLabel).join(', ') || 'None';
  const stats = Object.entries(npc.stats).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(npc.derived).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const current = npc.current
    ? `\n\nCurrent:\n  Body: ${npc.current.Body}\n  Mind: ${npc.current.Mind}\n  Soul: ${npc.current.Soul}`
    : '';
  const skills = Object.entries(npc.skills).map(([k, d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  const pathLine = npc.path.statBonuses.length
    ? `Path: ${npc.path.name} (+1 ${npc.path.statBonuses.join(', +1 ')})`
    : `Path: ${npc.path.name}`;
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\nMotivation: ${npc.motivation.name}\n${pathLine}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}
```

(The `pathLine` change avoids `join(', +1 ')` on an empty array producing an awkward `(+1 )` for a custom no-bonus Path.)

- [ ] **Step 2: Bump the service worker cache version**

In `sw.js`, line 1:

```js
const CACHE = 'cc-gm-v9';
```

- [ ] **Step 3: Full manual QA pass**

Serve the app, unregister the existing service worker and clear all caches (devtools > Application > Service Workers > Unregister, then Clear storage), hard-reload. Walk through the full checklist from the design spec's Testing section:

1. Generate a Full NPC. Edit each of the 9 base stats and confirm derived values (PD/MD/SD/Body/Mind/Soul) and all skill pool totals update after each edit.
2. Confirm clamping: try to push a stat above 5 or below 1 via the number input; confirm it clamps. Try a skill rank above 6 or below 0; confirm it clamps. Add a specialization and try to push its rank above `general - 1`; confirm it clamps.
3. Change Archetype and Path (in either order) and confirm stat bonuses swap correctly and don't double-apply or under-apply when done in sequence.
4. Confirm the free skill re-roll on Archetype change doesn't leave two "free" ranks floating if you switch Archetype twice in a row.
5. Lower Body (Current) below Max, then edit a stat that raises Body's Max — confirm Current stays put (doesn't jump). Then, on a fresh NPC, leave Current at Max and edit a stat that raises Max — confirm Current follows.
6. Add a specialization to an eligible skill; confirm it appears in the Specialized Skills table and its rank is editable.
7. Rename the NPC (both by typing and by Regenerate Name), click Copy, and paste the result somewhere to confirm the name, Current section, and all edited fields appear correctly in the copied text.
8. Click Save on the card, confirm it now says "Saved". Reload the page, open the saved NPC from the Saved NPCs list, and confirm all edits (stats, skills, dropdowns, name) were persisted.
9. In the browser console, find or construct a saved NPC entry from before this feature (no `current` field) via `localStorage` inspection, or simply confirm via reading `js/npc-storage.js` that `getAll()` returns entries as-is with no forced migration; load that entry's card and confirm Current renders equal to Max without errors.
10. Confirm Quick NPC cards still work unchanged (generate one, Copy, Add to Initiative).

- [ ] **Step 4: Commit**

```bash
git add js/npc-gen.js sw.js
git commit -m "chore: bump cache version, include Current HP in copied NPC text"
```

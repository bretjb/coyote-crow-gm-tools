import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility, clampStat, clampSkillRank, clampSpecRank } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { addCombatant } from './initiative-state.js';
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe, exportAll, importMerge } from './npc-storage.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>

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
  `;

  const btnQuick = container.querySelector('#btn-quick');
  const btnFull = container.querySelector('#btn-full');
  function setActiveMode(mode) {
    btnQuick.classList.toggle('secondary', mode !== 'quick');
    btnFull.classList.toggle('secondary', mode !== 'full');
  }

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
  renderSavedList(savedListEl, output, ctx);
  subscribe(() => renderSavedList(savedListEl, output, ctx));

  container.querySelector('#npc-export-all').addEventListener('click', () => {
    const json = exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `npc-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = container.querySelector('#npc-import-file');
  const importStatus = container.querySelector('#npc-import-status');
  container.querySelector('#npc-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const added = importMerge(text);
      importStatus.textContent = added > 0
        ? `Imported ${added} new NPC(s)`
        : 'No new NPCs (all duplicates or invalid file)';
    } catch {
      importStatus.textContent = 'Import failed — could not read file';
    } finally {
      importInput.value = '';
    }
  });

  btnQuick.addEventListener('click', () => {
    setActiveMode('quick');
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    output.innerHTML = '';
    output.appendChild(renderQuickCard(npc));
  });

  btnFull.addEventListener('click', () => {
    setActiveMode('full');
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, ctx, undefined));
  });
}

function generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype }) {
  const path = pick(paths);
  const stats = allocateStats(42, archetype.statPriorities);
  // Archetype grants +1 to its focus stat; path grants +1 to each of its two stats
  stats[archetype.statBonus]++;
  path.statBonuses.forEach(stat => { stats[stat]++; });

  const skills = allocateSkills(42, allSkills, archetype.preferredSkills);
  // Archetype grants a free rank in one of its two skill options
  const freeSkill = pick(archetype.freeSkillOptions);
  if (!skills[freeSkill]) skills[freeSkill] = { general: 1 };
  else skills[freeSkill].general++;

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

function renderQuickCard(npc, savedEntry) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${esc(npc.name)}</h2>
    <p><strong>Role:</strong> ${esc(npc.role)}</p>
    <p><strong>Personality:</strong> ${esc(npc.personality)}</p>
    <p><strong>Motivation:</strong> ${esc(npc.motivation)}</p>
  `;
  appendCopyBtn(card, () => `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  appendInitiativeBtn(card, () => npc.name, null);
  appendSaveControls(card, 'quick', npc, savedEntry);
  return card;
}

function renderFullCard(npc, ctx, savedEntry) {
  ensureCurrent(npc);
  const card = document.createElement('div');
  card.className = 'card';

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <div id="name-section" class="row-flex-wrap mb-0-5"></div>
    <p class="npc-meta">${esc(npc.archetype)} · ${esc(npc.age)} · ${esc(npc.gender)} · ${esc(npc.sexuality)}</p>
    <p class="npc-meta-sm">+1 ${esc(npc.archetypeStatBonus)} · free rank: ${esc(npc.freeSkill)}</p>
    <div id="motivation-section" class="mb-0-75"></div>
    <p><strong>Path:</strong> ${esc(npc.path.name)} <span class="text-muted-sm">(+1 ${esc(npc.path.statBonuses.join(', +1 '))})</span></p>
    <p class="mb-0-75"><strong>Gifts/Burdens:</strong> ${esc(gb)}</p>

    <h3 class="mb-0-5">Stats</h3>
    <div id="stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="skill-section"></div>
    <div id="skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="ability-section" class="mb-0-75"></div>
  `;

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

  appendCopyBtn(card, () => npcToText(npc));
  appendInitiativeBtn(card, () => npc.name, Math.min(12, Math.max(1, npc.derived.Initiative)));
  appendSaveControls(card, 'full', npc, savedEntry);
  return card;
}

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

function skillPool(skillDef, stats, rank) {
  const vals = skillDef.diceCheck.map(s => stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  return rank >= 1 ? higher + rank : lower;
}

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
    specWrap.appendChild(buildSpecTable(allSkills, npc, specEntries, onChange));
    sec.appendChild(specWrap);
    wrap.appendChild(sec);
  }
  return wrap;
}

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
}

function appendCopyBtn(card, getText) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary mt-0-5';
  btn.addEventListener('click', () => navigator.clipboard.writeText(getText()));
  card.appendChild(btn);
}

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

function renderSavedList(listEl, output, ctx) {
  const entries = getAll();
  listEl.innerHTML = '';
  if (entries.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No saved NPCs yet.</p>';
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';
    row.style.padding = '0.25rem 0';

    if (entry.deleted) {
      row.style.opacity = '0.6';
      const span = document.createElement('span');
      span.textContent = `Deleted — ${entry.data?.name || '(unnamed)'}`;
      span.style.flex = '1';
      const undoBtn = document.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.className = 'secondary';
      undoBtn.addEventListener('click', () => undoRemove(entry.id));
      row.appendChild(span);
      row.appendChild(undoBtn);
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
    listEl.appendChild(row);
  });
}

function gbLabel(g) {
  const lvl = Math.abs(g.magnitude);
  const levelWord = lvl === 1 ? 'trivial' : lvl === 2 ? 'serious' : 'critical';
  const type = g.magnitude > 0 ? 'Gift' : 'Burden';
  return `${g.name} ${g.magnitude > 0 ? '+' : ''}${g.magnitude} ${type} (${levelWord})`;
}

function npcToText(npc) {
  const gb = npc.giftsAndBurdens.map(gbLabel).join(', ') || 'None';
  const stats = Object.entries(npc.stats).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(npc.derived).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const skills = Object.entries(npc.skills).map(([k,d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\nMotivation: ${npc.motivation.name}\nPath: ${npc.path.name} (+1 ${npc.path.statBonuses.join(', +1 ')})\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}

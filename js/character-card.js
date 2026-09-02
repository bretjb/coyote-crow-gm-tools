// js/character-card.js
import { calcDerivedStats, clampStat, clampSkillRank, clampSpecRank } from './npc-character-gen.js';
import { makeTooltip } from './tooltip.js';
import { addCombatant } from './initiative-state.js';

export function esc(s) {
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

export function stripPathPrefix(name) {
  const PATH_PREFIX = 'Path of the ';
  return name.startsWith(PATH_PREFIX) ? name.slice(PATH_PREFIX.length) : name;
}

export function ensureCurrent(character) {
  if (!character.current) {
    character.current = { Body: character.derived.Body, Mind: character.derived.Mind, Soul: character.derived.Soul };
  }
}

export function recalcDerivedAndSyncCurrent(character) {
  const prevDerived = character.derived;
  const prevCurrent = character.current;
  const newDerived = calcDerivedStats(character.stats);
  const newCurrent = {};
  for (const key of ['Body', 'Mind', 'Soul']) {
    newCurrent[key] = prevCurrent[key] === prevDerived[key]
      ? newDerived[key]
      : Math.min(prevCurrent[key], newDerived[key]);
  }
  character.derived = newDerived;
  character.current = newCurrent;
}

export const STAT_ABBR = {
  Strength: 'STR', Agility: 'AGI', Endurance: 'END',
  Intelligence: 'INT', Perception: 'PER', Wisdom: 'WIS',
  Spirit: 'SPI', Charisma: 'CHA', Will: 'WILL',
};
export const DEFENSE_ABBR = { 'Physical Defence': 'PD', 'Mental Defence': 'MD', 'Mystical Defence': 'SD' };

export function statCell(statName, character, onChange, glossary, mode) {
  const td = document.createElement('td');
  const label = makeTooltip(STAT_ABBR[statName], glossary.get(statName));
  label.classList.add('stat-cell-label');

  if (mode === 'view') {
    const value = document.createElement('span');
    value.className = 'stat-cell-value';
    value.textContent = character.stats[statName];
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
  input.value = character.stats[statName];
  input.addEventListener('change', () => {
    character.stats[statName] = clampStat(input.value);
    recalcDerivedAndSyncCurrent(character);
    onChange();
  });
  td.appendChild(label);
  td.appendChild(document.createElement('br'));
  td.appendChild(input);
  return td;
}

export function readOnlyCell(label, value) {
  const td = document.createElement('td');
  td.innerHTML = `<span class="stat-cell-label">${esc(label)}</span><br><span class="stat-cell-value">${esc(value)}</span>`;
  return td;
}

export function currentCell(bodyKey, character) {
  const td = document.createElement('td');
  const label = document.createElement('span');
  label.className = 'stat-cell-label';
  label.textContent = `${bodyKey} (Current)`;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'stat-input current-score-input';
  input.value = character.current[bodyKey];
  input.addEventListener('change', () => {
    const max = character.derived[bodyKey];
    character.current[bodyKey] = Math.min(max, Math.max(0, Math.round(Number(input.value)) || 0));
    input.value = character.current[bodyKey];
  });
  td.appendChild(label);
  td.appendChild(document.createElement('br'));
  td.appendChild(input);
  return td;
}

export function buildStatSection(character, onChange, glossary, mode) {
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
    tr.appendChild(statCell(s1, character, onChange, glossary, mode));
    tr.appendChild(statCell(s2, character, onChange, glossary, mode));
    tr.appendChild(statCell(s3, character, onChange, glossary, mode));
    tr.appendChild(readOnlyCell(DEFENSE_ABBR[defKey], character.derived[defKey]));
    tr.appendChild(readOnlyCell(bodyKey, character.derived[bodyKey]));
    tr.appendChild(currentCell(bodyKey, character));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function readOnlyField(label, value) {
  const el = document.createElement('div');
  el.className = 'row-flex-wrap mb-0-5';
  el.innerHTML = `<span class="field-label">${esc(label)}</span><span class="field-value">${esc(value)}</span>`;
  return el;
}

export function readOnlyNamedField(label, current, formatExtra) {
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

export function buildSelectCustomField({ label, value, options, onChange, mode }) {
  if (mode === 'view') {
    return { el: readOnlyField(label, value), setOptions: () => {} };
  }
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

export function buildNamedDescField({ label, current, options, onChange, customShape, formatExtra, mode }) {
  if (mode === 'view') {
    return { el: readOnlyNamedField(label, current, formatExtra) };
  }
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

export function generalSkillRow(skillDef, character, onChange, glossary, mode) {
  const acquired = character.skills[skillDef.name];
  const rank = acquired ? acquired.general : 0;
  const vals = skillDef.diceCheck.map(s => character.stats[s] || 0);
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
      setGeneralRank(character, skillDef.name, rankInput.value);
      onChange();
    });
    rankTd.appendChild(rankInput);
    if (skillDef.specialized?.length && rank >= 1 && !acquired?.specialized) {
      rankTd.appendChild(buildAddSpecControl(skillDef, character, onChange));
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

export function buildAddSpecControl(skillDef, character, onChange) {
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

  const generalRank = character.skills[skillDef.name].general;
  const minSpecRank = Math.min(6, generalRank + 1);
  const rankInput = document.createElement('input');
  rankInput.type = 'number';
  rankInput.min = String(minSpecRank);
  rankInput.max = '6';
  rankInput.value = String(minSpecRank);
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
    character.skills[skillDef.name].specialized = { name: select.value, rank: clampSpecRank(rankInput.value, generalRank) };
    onChange();
  });

  picker.appendChild(select);
  picker.appendChild(rankInput);
  picker.appendChild(confirmBtn);
  wrap.appendChild(addBtn);
  wrap.appendChild(picker);
  return wrap;
}

export function setGeneralRank(character, name, rawValue) {
  const rank = clampSkillRank(rawValue);
  const existing = character.skills[name];
  if (rank === 0) {
    delete character.skills[name];
    return;
  }
  if (!existing) {
    character.skills[name] = { general: rank };
  } else {
    existing.general = rank;
    if (existing.specialized && existing.specialized.rank <= rank) {
      if (rank >= 6) {
        delete existing.specialized;
      } else {
        existing.specialized.rank = clampSpecRank(existing.specialized.rank, rank);
      }
    }
  }
}

export function buildGeneralSkillTable(skillsSubset, character, onChange, glossary, mode) {
  const wrap = document.createElement('div');
  wrap.className = 'skill-table-wrap';
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const skillDef of skillsSubset) {
    tbody.appendChild(generalSkillRow(skillDef, character, onChange, glossary, mode));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function buildSkillSection(character, allSkills, onChange, glossary, mode) {
  const wrap = document.createElement('div');
  const half = Math.ceil(allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(0, half), character, onChange, glossary, mode));
  pair.appendChild(buildGeneralSkillTable(allSkills.slice(half), character, onChange, glossary, mode));
  wrap.appendChild(pair);

  const specEntries = Object.entries(character.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  if (specEntries.length > 0) {
    const sec = document.createElement('div');
    sec.innerHTML = '<h3 class="h3-section">Specialized Skills</h3>';
    const specWrap = document.createElement('div');
    specWrap.className = 'skill-table-wrap';
    specWrap.appendChild(buildSpecTable(allSkills, character, specEntries, onChange, glossary, mode));
    sec.appendChild(specWrap);
    wrap.appendChild(sec);
  }
  return wrap;
}

export function buildSpecTable(allSkills, character, specEntries, onChange, glossary, mode) {
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const { generalName, name, rank } of specEntries) {
    const skillDef = allSkills.find(s => s.name === generalName);
    if (!skillDef) continue;
    const vals = skillDef.diceCheck.map(s => character.stats[s] || 0);
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

    const generalRank = character.skills[generalName].general;
    const rankTd = document.createElement('td');
    if (mode === 'view') {
      const rankValue = document.createElement('span');
      rankValue.textContent = rank;
      rankTd.appendChild(rankValue);
    } else {
      const rankInput = document.createElement('input');
      rankInput.type = 'number';
      rankInput.min = String(Math.min(6, generalRank + 1));
      rankInput.max = '6';
      rankInput.value = rank;
      rankInput.className = 'skill-rank-input';
      rankInput.addEventListener('click', e => e.stopPropagation());
      rankInput.addEventListener('change', () => {
        character.skills[generalName].specialized.rank = clampSpecRank(rankInput.value, generalRank);
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

export function appendCopyBtn(card, getText) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary mt-0-5';
  btn.addEventListener('click', () => navigator.clipboard.writeText(getText()));
  card.appendChild(btn);
}

export function appendInitiativeBtn(card, getName, getSuggestedSlot, sourceKind, ensureSaved) {
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

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.className = 'hidden mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', () => {
    const suggestedSlot = typeof getSuggestedSlot === 'function' ? getSuggestedSlot() : getSuggestedSlot;
    if (suggestedSlot != null) input.value = String(suggestedSlot);
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
    const id = typeof ensureSaved === 'function' ? ensureSaved() : null;
    const source = sourceKind && id ? { kind: sourceKind, id } : null;
    addCombatant(getName(), slot, source);
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

// Generic, tag-free save controls (Notes + persisted-id lifecycle + Save button).
// `storage` is `{ save: (data, note) => id, update: (id, patch) => void }`, injected by the
// caller so this module has no dependency on any particular storage backend (NPC vs PC).
// Callers that need to layer additional UI before the Save button (e.g. npc-gen.js's tag
// chips) can use the returned `wrap`/`saveBtn` DOM references as insertion anchors.
export function appendSaveControls(card, data, savedEntry, storage) {
  const wrap = document.createElement('div');
  wrap.className = 'save-controls-wrap';

  const label = document.createElement('label');
  label.textContent = 'Notes';
  label.className = 'field-label';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.className = 'textarea-full';
  textarea.value = savedEntry ? savedEntry.note : '';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary mt-0-5';

  let savedId = savedEntry ? savedEntry.id : null;
  saveBtn.textContent = savedId ? 'Saved ✓' : 'Save';

  function doSave() {
    savedId = storage.save(data, textarea.value);
    saveBtn.textContent = 'Saved ✓';
    return savedId;
  }

  let debounceTimer;
  textarea.addEventListener('input', () => {
    if (!savedId) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      storage.update(savedId, { note: textarea.value });
    }, 500);
  });

  saveBtn.addEventListener('click', () => {
    if (savedId) {
      storage.update(savedId, { data, note: textarea.value });
    } else {
      doSave();
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(textarea);
  wrap.appendChild(saveBtn);
  card.appendChild(wrap);
  return {
    getSavedId: () => savedId,
    getNote: () => textarea.value,
    ensureSaved: () => (savedId ? savedId : doSave()),
    wrap,
    saveBtn,
  };
}

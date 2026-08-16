// js/pc-gen.js
import {
  esc, ensureCurrent, buildStatSection, buildSkillSection,
  buildSelectCustomField, buildNamedDescField, readOnlyField,
  appendSaveControls, appendCopyBtn, appendInitiativeBtn,
} from './character-card.js';
import { loadGlossary } from './tooltip.js';
import { calcDerivedStats } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { savePc, updatePc, getAll, removePc, undoRemove, subscribe, exportAll, importMerge } from './pc-storage.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function blankPc() {
  const stats = {
    Strength: 1, Agility: 1, Endurance: 1, Intelligence: 1,
    Perception: 1, Wisdom: 1, Spirit: 1, Charisma: 1, Will: 1,
  };
  const derived = calcDerivedStats(stats);
  return {
    name: '', age: '', gender: '', sexuality: '',
    archetype: '',
    path: { name: '' },
    motivation: { name: '', description: '' },
    giftsAndBurdens: '',
    stats,
    skills: {},
    ability: { name: '', description: '', diceCheck: [] },
    derived,
    current: { Body: derived.Body, Mind: derived.Mind, Soul: derived.Soul },
  };
}

export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">PC Generator</h2>
    <div class="row-flex-wrap mb-1-5">
      <button id="btn-new-pc">New PC</button>
    </div>
    <div id="pc-output"></div>

    <div class="card mt-1-5">
      <h3 class="mb-0-5">Saved PCs</h3>
      <div class="row-flex-wrap mb-0-75">
        <button id="pc-export-all" class="secondary">Export All</button>
        <button id="pc-import" class="secondary">Import</button>
        <input id="pc-import-file" type="file" accept="application/json" class="hidden">
        <span id="pc-import-status" class="text-muted-sm"></span>
      </div>
      <div id="pc-saved-list"></div>
    </div>
  `;

  let motivations, paths, allSkills, abilities, archetypes, glossaryList;
  try {
    [motivations, paths, allSkills, abilities, archetypes, glossaryList] = await Promise.all([
      loadJson('data/motivations.json'),
      loadJson('data/paths.json'),
      loadJson('data/skills.json'),
      loadJson('data/abilities.json'),
      loadJson('data/archetypes.json'),
      loadGlossary(),
    ]);
  } catch {
    container.querySelector('#pc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const output = container.querySelector('#pc-output');
  const savedListEl = container.querySelector('#pc-saved-list');
  const glossary = new Map(glossaryList.map(g => [g.name, g.description]));
  const ctx = { motivations, paths, allSkills, abilities, archetypes, glossary };
  renderSavedPcList(savedListEl, output, ctx);
  subscribe(() => renderSavedPcList(savedListEl, output, ctx));

  container.querySelector('#pc-export-all').addEventListener('click', () => {
    const json = exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pc-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = container.querySelector('#pc-import-file');
  const importStatus = container.querySelector('#pc-import-status');
  container.querySelector('#pc-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const added = importMerge(text);
      importStatus.textContent = added > 0
        ? `Imported ${added} new PC(s)`
        : 'No new PCs (all duplicates or invalid file)';
    } catch {
      importStatus.textContent = 'Import failed — could not read file';
    } finally {
      importInput.value = '';
    }
  });

  container.querySelector('#btn-new-pc').addEventListener('click', () => {
    const pc = blankPc();
    output.innerHTML = '';
    output.appendChild(renderPcCard(pc, ctx, undefined, 'edit'));
  });
}

function buildTextField({ label, value, onChange, mode }) {
  if (mode === 'view') {
    return { el: readOnlyField(label, value) };
  }
  const el = document.createElement('div');
  el.className = 'row-flex-wrap mb-0-5';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.className = 'field-label';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value.trim()));
  el.appendChild(labelEl);
  el.appendChild(input);
  return { el };
}

function buildTextAreaField({ label, value, onChange, mode }) {
  if (mode === 'view') {
    const el = document.createElement('div');
    el.className = 'mb-0-75';
    el.innerHTML = `<span class="field-label">${esc(label)}</span><p class="field-value">${esc(value || 'None')}</p>`;
    return { el };
  }
  const el = document.createElement('div');
  el.className = 'mb-0-75';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.className = 'field-label';
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.className = 'textarea-full';
  textarea.value = value;
  textarea.addEventListener('change', () => onChange(textarea.value.trim()));
  el.appendChild(labelEl);
  el.appendChild(textarea);
  return { el };
}

function renderPcCard(pc, ctx, savedEntry, mode = 'view') {
  ensureCurrent(pc);
  const card = document.createElement('div');
  card.className = 'card';
  card.classList.toggle('is-editing', mode === 'edit');

  card.innerHTML = `
    <div id="pc-edit-toggle" class="row-flex-wrap mb-0-5"></div>
    <div id="pc-name-section" class="row-flex-wrap mb-0-5"></div>
    <div id="pc-archetype-section" class="mb-0-5"></div>
    <div id="pc-demographics-section" class="row-flex-wrap mb-0-5"></div>
    <div id="pc-motivation-section" class="mb-0-75"></div>
    <div id="pc-path-section" class="mb-0-5"></div>
    <div id="pc-gb-section" class="mb-0-75"></div>

    <h3 class="mb-0-5">Stats</h3>
    <div id="pc-stat-section"></div>

    <h3 class="h3-section">General Skills <span class="h3-note">(click to roll)</span></h3>
    <div id="pc-skill-section"></div>
    <div id="pc-skill-roll-result" class="skill-roll-result"></div>

    <h3 class="mb-0-5">Ability</h3>
    <div id="pc-ability-section" class="mb-0-75"></div>
  `;

  function rerender(newMode) {
    const newCard = renderPcCard(pc, ctx, savedEntry, newMode);
    card.replaceWith(newCard);
  }

  let saveControls;
  const toggleEl = card.querySelector('#pc-edit-toggle');
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
      if (id) updatePc(id, { data: pc });
      rerender('view');
    });
    toggleEl.appendChild(saveModeBtn);
  }

  const nameSectionEl = card.querySelector('#pc-name-section');
  if (mode === 'view') {
    const nameDisplay = document.createElement('span');
    nameDisplay.className = 'input-name';
    nameDisplay.textContent = pc.name || '(unnamed)';
    nameSectionEl.appendChild(nameDisplay);
  } else {
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-name';
    nameInput.value = pc.name;
    nameInput.addEventListener('change', () => {
      pc.name = nameInput.value.trim();
    });
    nameSectionEl.appendChild(nameInput);
  }

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

  card.querySelector('#pc-motivation-section').appendChild(
    buildNamedDescField({
      label: 'Motivation',
      current: pc.motivation,
      options: ctx.motivations,
      onChange: v => { pc.motivation = v; },
      mode,
    }).el
  );

  const pathSectionEl = card.querySelector('#pc-path-section');
  pathSectionEl.appendChild(
    buildSelectCustomField({
      label: 'Path', value: pc.path.name, options: ctx.paths.map(p => p.name),
      onChange: v => { pc.path.name = v; }, mode,
    }).el
  );

  card.querySelector('#pc-gb-section').appendChild(
    buildTextAreaField({ label: 'Gifts/Burdens', value: pc.giftsAndBurdens, onChange: v => { pc.giftsAndBurdens = v; }, mode }).el
  );

  card.querySelector('#pc-ability-section').appendChild(
    buildNamedDescField({
      label: 'Ability',
      current: pc.ability,
      options: ctx.abilities,
      onChange: v => { pc.ability = v; },
      customShape: () => ({ name: '', description: '', diceCheck: [] }),
      formatExtra: c => (c.diceCheck && c.diceCheck.length ? ` [${c.diceCheck.join(' + ')}]` : ''),
      mode,
    }).el
  );

  const statSectionEl = card.querySelector('#pc-stat-section');
  const skillSectionEl = card.querySelector('#pc-skill-section');
  const rollResult = card.querySelector('#pc-skill-roll-result');

  function rebuildBody() {
    statSectionEl.innerHTML = '';
    statSectionEl.appendChild(buildStatSection(pc, rebuildBody, ctx.glossary, mode));
    skillSectionEl.innerHTML = '';
    skillSectionEl.appendChild(buildSkillSection(pc, ctx.allSkills, rebuildBody, ctx.glossary, mode));
    rollResult.innerHTML = '';
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

  appendCopyBtn(card, () => pcToText(pc));
  appendInitiativeBtn(card, () => pc.name || '(unnamed)', () => Math.min(12, Math.max(1, pc.derived.Initiative)));
  const pcStorage = { save: (data, note) => savePc({ data, note }), update: (id, patch) => updatePc(id, patch) };
  saveControls = appendSaveControls(card, pc, savedEntry, pcStorage);
  return card;
}

function renderSavedPcList(listEl, output, ctx) {
  const entries = getAll();
  listEl.innerHTML = '';
  if (entries.length === 0) {
    listEl.innerHTML = '<p class="text-muted-sm">No saved PCs yet.</p>';
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'saved-npc-row';
    if (entry.deleted) row.classList.add('deleted');

    if (entry.deleted) {
      const span = document.createElement('span');
      span.textContent = `Deleted — ${entry.data?.name || '(unnamed)'}`;
      span.className = 'flex-1';
      const undoBtn = document.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.className = 'secondary';
      undoBtn.addEventListener('click', () => undoRemove(entry.id));
      row.appendChild(span);
      row.appendChild(undoBtn);
    } else {
      const nameBtn = document.createElement('button');
      nameBtn.textContent = entry.data?.name || '(unnamed)';
      nameBtn.className = 'secondary flex-1 text-left';
      nameBtn.addEventListener('click', () => {
        output.innerHTML = '';
        const card = renderPcCard(entry.data, ctx, { id: entry.id, note: entry.note }, 'view');
        output.appendChild(card);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'secondary';
      removeBtn.addEventListener('click', () => removePc(entry.id));

      row.appendChild(nameBtn);
      row.appendChild(removeBtn);
    }
    listEl.appendChild(row);
  });
}

function pcToText(pc) {
  const stats = Object.entries(pc.stats).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(pc.derived).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const current = pc.current
    ? `\n\nCurrent:\n  Body: ${pc.current.Body}\n  Mind: ${pc.current.Mind}\n  Soul: ${pc.current.Soul}`
    : '';
  const skills = Object.entries(pc.skills).map(([k, d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  return `${pc.name}\n${pc.archetype} · ${pc.age} · ${pc.gender} · ${pc.sexuality}\nMotivation: ${pc.motivation.name}\nPath: ${pc.path.name}\nGifts/Burdens: ${pc.giftsAndBurdens || 'None'}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${pc.ability.name} — ${pc.ability.description}`;
}

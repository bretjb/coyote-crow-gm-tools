import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility, clampStat, clampSkillRank } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { saveNpc, updateNpc, getAll, removeNpc, undoRemove, subscribe, exportAll, importMerge } from './npc-storage.js';
import { loadGlossary } from './tooltip.js';
import { createAvatar } from './lib/dicebear/core.js';
import * as adventurer from './lib/dicebear/adventurer.js';
import { buildNpcSheetPdf } from './npc-pdf-export.js';
import {
  esc, ensureCurrent, recalcDerivedAndSyncCurrent, stripPathPrefix,
  buildStatSection, buildSkillSection,
  buildSelectCustomField, buildNamedDescField,
  appendSaveControls, appendCopyBtn, appendInitiativeBtn,
} from './character-card.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAvatarSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderAvatarSvg(seed, size) {
  return createAvatar(adventurer, { seed, size }).toString();
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
      <input id="npc-search" type="text" class="search-input mb-0-75" placeholder="Search by name or tag...">
      <div id="npc-saved-list"></div>
    </div>
  `;

  const btnQuick = container.querySelector('#btn-quick');
  const btnFull = container.querySelector('#btn-full');
  function setActiveMode(mode) {
    btnQuick.classList.toggle('secondary', mode !== 'quick');
    btnFull.classList.toggle('secondary', mode !== 'full');
  }

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
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype, quirks });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, ctx, undefined));
  });
}

function generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype, quirks }) {
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

function ensureAvatarSeed(npc) {
  if (!npc.avatarSeed) {
    npc.avatarSeed = generateAvatarSeed();
  }
}

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

function ensureQuirk(npc, quirks) {
  if (!npc.quirk) {
    npc.quirk = pick(quirks);
  }
}

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

const VOICE_PACE = ['Fast', 'Measured', 'Slow'];
const VOICE_VOLUME = ['Loud', 'Normal', 'Quiet'];
const VOICE_PITCH = ['High', 'Mid', 'Low'];
const VOICE_FORMALITY = ['Formal', 'Casual', 'Blunt'];

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
  const quickSaveControls = appendNpcSaveControls(card, 'quick', npc, savedEntry);
  appendInitiativeBtn(card, () => npc.name, null, 'npc', quickSaveControls.ensureSaved);
  return card;
}

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
    <div id="identity-grid" class="identity-grid mb-0-75"></div>
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

  function rerender(newMode) {
    const id = saveControls ? saveControls.getSavedId() : null;
    const note = saveControls ? saveControls.getNote() : undefined;
    const tags = saveControls ? saveControls.getTags() : undefined;
    const entry = id ? { id, note, tags } : savedEntry;
    const newCard = renderFullCard(npc, ctx, entry, newMode);
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

  const identityGridEl = card.querySelector('#identity-grid');
  const archetypeCell = document.createElement('div');
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
    archetypeCell.appendChild(p);
    archetypeCell.appendChild(note);
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

    archetypeCell.appendChild(archetypeSelect);
    archetypeCell.appendChild(archetypeNote);
  }
  identityGridEl.appendChild(archetypeCell);

  function archetypeDemographics(key) {
    const def = ctx.archetypes.find(a => a.name === npc.archetype);
    const list = def ? def.demographics[key].map(o => o.value) : [];
    return [...new Set(list)];
  }

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

  card.querySelector('#motivation-section').appendChild(
    buildNamedDescField({
      label: 'Motivation',
      current: npc.motivation,
      options: ctx.motivations,
      onChange: v => { npc.motivation = v; },
      mode,
    }).el
  );

  card.querySelector('#quirk-section').appendChild(
    buildNamedDescField({
      label: 'Quirk',
      current: npc.quirk,
      options: ctx.quirks,
      onChange: v => { npc.quirk = v; },
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
    statSectionEl.appendChild(buildStatSection(npc, rebuildBody, ctx.glossary, mode));
    skillSectionEl.innerHTML = '';
    skillSectionEl.appendChild(buildSkillSection(npc, ctx.allSkills, rebuildBody, ctx.glossary, mode));
    rollResult.innerHTML = '';
  }
  rebuildBody();

  const pathSectionEl = card.querySelector('#path-section');
  if (mode === 'view') {
    const p = document.createElement('p');
    p.className = 'npc-meta';
    p.textContent = `Path: ${stripPathPrefix(npc.path.name)}`;
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
  appendExportPdfBtn(card, npc, ctx.allSkills);
  saveControls = appendNpcSaveControls(card, 'full', npc, savedEntry);
  appendInitiativeBtn(card, () => npc.name, () => Math.min(12, Math.max(1, npc.derived.Initiative)), 'npc', saveControls.ensureSaved);
  return card;
}

// Wraps the shared, storage-agnostic character-card.js `appendSaveControls` with NPC-only
// tag-chip UI (avatars/voice/quirks/tags/PDF-export are NPC-only per the PC tab spec, so
// this stays local rather than moving into character-card.js). The `tags` array is created
// up front and the `save`/`update` closures below capture it by reference, so a tag typed
// before the first Save is still present in the payload the initial save writes.
function appendNpcSaveControls(card, kind, npc, savedEntry) {
  let tags = savedEntry && Array.isArray(savedEntry.tags) ? [...savedEntry.tags] : [];

  const npcStorage = {
    save: (data, note) => saveNpc({ kind, data, note, tags }),
    update: (id, patch) => updateNpc(id, patch),
  };
  const controls = appendSaveControls(card, npc, savedEntry, npcStorage);

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
        const id = controls.getSavedId();
        if (id) updateNpc(id, { tags });
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
    const id = controls.getSavedId();
    if (id) updateNpc(id, { tags });
  }

  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    }
  });
  tagInput.addEventListener('blur', () => commitTag());

  // Preserve the original layout order: Notes label, textarea, Tags label, chips,
  // tag input, Save button — insert the tag UI ahead of the shared Save button.
  controls.wrap.insertBefore(tagsLabel, controls.saveBtn);
  controls.wrap.insertBefore(chipsWrap, controls.saveBtn);
  controls.wrap.insertBefore(tagInput, controls.saveBtn);

  return {
    getSavedId: controls.getSavedId,
    getNote: controls.getNote,
    getTags: () => [...tags],
    ensureSaved: controls.ensureSaved,
  };
}

function slugify(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'npc';
}

function appendExportPdfBtn(card, npc, allSkills) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-actions';

  const btn = document.createElement('button');
  btn.textContent = 'Export PDF';
  btn.className = 'secondary mt-0-5';

  const status = document.createElement('span');
  status.className = 'text-muted-sm';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Exporting...';
    try {
      const pdfBytes = await buildNpcSheetPdf(npc, allSkills);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(npc.name)}-character-sheet.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      status.textContent = 'PDF downloaded';
    } catch {
      status.textContent = 'Export failed — please try again';
    } finally {
      btn.disabled = false;
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}

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
          ? renderFullCard(entry.data, ctx, { id: entry.id, note: entry.note, tags: entry.tags })
          : renderQuickCard(entry.data, { id: entry.id, note: entry.note, tags: entry.tags });
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
  const current = npc.current
    ? `\n\nCurrent:\n  Body: ${npc.current.Body}\n  Mind: ${npc.current.Mind}\n  Soul: ${npc.current.Soul}`
    : '';
  const skills = Object.entries(npc.skills).map(([k,d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  const pathLine = npc.path.statBonuses.length
    ? `Path: ${npc.path.name} (+1 ${npc.path.statBonuses.join(', +1 ')})`
    : `Path: ${npc.path.name}`;
  const voiceLine = npc.voice
    ? `Voice: ${npc.voice.pace}, ${npc.voice.volume}, ${npc.voice.pitch} pitch, ${npc.voice.formality}\n`
    : '';
  const quirkLine = npc.quirk
    ? `Quirk: ${npc.quirk.name} — ${npc.quirk.description}\n`
    : '';
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\n${voiceLine}${quirkLine}Motivation: ${npc.motivation.name}\n${pathLine}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}${current}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}

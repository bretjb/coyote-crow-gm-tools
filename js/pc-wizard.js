// js/pc-wizard.js
import { esc } from './character-card.js';
import { STAT_COSTS, SKILL_COSTS, clampSpecRank, calcDerivedStats } from './npc-character-gen.js';

export const STAT_NAMES = [
  'Strength', 'Agility', 'Endurance', 'Intelligence',
  'Perception', 'Wisdom', 'Spirit', 'Charisma', 'Will',
];

const STEP_COUNT = 5;

function blankWizardState() {
  return {
    step: 0,
    archetype: '',
    path: '',
    giftsAndBurdens: '',
    gbEntries: [],
    gbApplyTo: 'stats',
    stats: Object.fromEntries(STAT_NAMES.map(s => [s, 1])),
    skills: {},
    archetypeFreeSkill: '',
  };
}

function archetypeObj(state, ctx) {
  return ctx.archetypes.find(a => a.name === state.archetype) || null;
}

function pathObj(state, ctx) {
  return ctx.paths.find(p => p.name === state.path) || null;
}

function gbPointsRemaining(state) {
  return state.gbEntries.reduce((sum, e) => sum - e.magnitude, 5);
}

function gbLeftover(state) {
  return Math.max(0, gbPointsRemaining(state));
}

function archetypeStatBonus(name, state, ctx) {
  const arch = archetypeObj(state, ctx);
  return arch && arch.statBonus === name ? 1 : 0;
}

function pathStatBonus(name, state, ctx) {
  const path = pathObj(state, ctx);
  return path && path.statBonuses.includes(name) ? 1 : 0;
}

function statBonus(name, state, ctx) {
  return archetypeStatBonus(name, state, ctx) + pathStatBonus(name, state, ctx);
}

function statBonusSources(name, state, ctx) {
  const sources = [];
  const arch = archetypeObj(state, ctx);
  if (arch && arch.statBonus === name) sources.push(arch.name);
  const path = pathObj(state, ctx);
  if (path && path.statBonuses.includes(name)) sources.push(path.name);
  return sources;
}

function displayedStat(name, state, ctx) {
  return state.stats[name] + statBonus(name, state, ctx);
}

function statStepCost(purchasedValue) {
  if (purchasedValue >= 5) return null;
  return STAT_COSTS[purchasedValue] - STAT_COSTS[purchasedValue - 1];
}

function statBudget(state) {
  return 42 + (state.gbApplyTo === 'stats' ? gbLeftover(state) : 0);
}

function totalStatSpent(state) {
  return STAT_NAMES.reduce((sum, name) => sum + STAT_COSTS[state.stats[name] - 1], 0);
}

function statPointsRemaining(state) {
  return statBudget(state) - totalStatSpent(state);
}

function reconcileStatBudget(state) {
  let guard = 0;
  while (statPointsRemaining(state) < 0 && guard < 100) {
    let target = null;
    let bestCost = -1;
    STAT_NAMES.forEach(name => {
      const v = state.stats[name];
      if (v <= 1) return;
      const cost = STAT_COSTS[v - 1] - STAT_COSTS[v - 2];
      if (cost > bestCost) { bestCost = cost; target = name; }
    });
    if (!target) break;
    state.stats[target] -= 1;
    guard++;
  }
}

function skillFloor(name, state) {
  return name === state.archetypeFreeSkill ? 1 : 0;
}

function skillGeneralRank(name, state) {
  return state.skills[name]?.general || 0;
}

function skillGeneralCost(name, state) {
  const rank = skillGeneralRank(name, state);
  return SKILL_COSTS[rank] - SKILL_COSTS[skillFloor(name, state)];
}

function skillSpecCost(name, state) {
  const spec = state.skills[name]?.specialized;
  return spec ? SKILL_COSTS[spec.rank] : 0;
}

function skillBudget(state) {
  return 42 + (state.gbApplyTo === 'skills' ? gbLeftover(state) : 0);
}

function totalSkillSpent(state, ctx) {
  return ctx.allSkills.reduce((sum, s) => sum + skillGeneralCost(s.name, state) + skillSpecCost(s.name, state), 0);
}

function skillPointsRemaining(state, ctx) {
  return skillBudget(state) - totalSkillSpent(state, ctx);
}

function setSkillGeneral(name, state, rank) {
  if (rank <= 0) {
    delete state.skills[name];
    return;
  }
  const existing = state.skills[name] || {};
  if (existing.specialized && existing.specialized.rank <= rank) {
    const minSpecRank = rank + 1;
    existing.specialized = minSpecRank <= 6 ? { ...existing.specialized, rank: minSpecRank } : undefined;
  }
  state.skills[name] = { ...existing, general: rank };
}

function reconcileSkillBudget(state, ctx) {
  let guard = 0;
  while (skillPointsRemaining(state, ctx) < 0 && guard < 200) {
    // Drop the priciest specialization step first (bonus content, not core rank),
    // one rank at a time so an unrelated large investment isn't wiped out in one go.
    // A specialization can't be reduced below one above its general rank, so once
    // it's at that floor the only remaining cut is to drop it entirely.
    let specTarget = null, specBest = -1, specAction = null;
    ctx.allSkills.forEach(s => {
      const spec = state.skills[s.name]?.specialized;
      if (!spec) return;
      const floor = skillGeneralRank(s.name, state) + 1;
      if (spec.rank > floor) {
        const cost = SKILL_COSTS[spec.rank] - SKILL_COSTS[spec.rank - 1];
        if (cost > specBest) { specBest = cost; specTarget = s.name; specAction = 'decrement'; }
      } else {
        const cost = SKILL_COSTS[spec.rank];
        if (cost > specBest) { specBest = cost; specTarget = s.name; specAction = 'delete'; }
      }
    });
    if (specTarget && specBest > 0) {
      if (specAction === 'decrement') {
        state.skills[specTarget].specialized.rank -= 1;
      } else {
        delete state.skills[specTarget].specialized;
      }
      guard++;
      continue;
    }
    // Then reduce the priciest general rank above its floor.
    let genTarget = null, genBest = -1;
    ctx.allSkills.forEach(s => {
      const rank = skillGeneralRank(s.name, state);
      const floor = skillFloor(s.name, state);
      if (rank <= floor) return;
      const cost = SKILL_COSTS[rank] - SKILL_COSTS[rank - 1];
      if (cost > genBest) { genBest = cost; genTarget = s.name; }
    });
    if (!genTarget) break;
    setSkillGeneral(genTarget, state, skillGeneralRank(genTarget, state) - 1);
    guard++;
  }
}

function buildStepNav({ onBack, onNext, nextLabel = 'Next', nextDisabled = false }) {
  const nav = document.createElement('div');
  nav.className = 'row-flex-wrap wizard-step-nav';
  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'secondary';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', onBack);
    nav.appendChild(backBtn);
  }
  if (onNext) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = nextLabel;
    nextBtn.disabled = nextDisabled;
    nextBtn.addEventListener('click', onNext);
    nav.appendChild(nextBtn);
  }
  return nav;
}

function buildOptionGrid(options, selectedName, formatSubtext, onSelect) {
  const grid = document.createElement('div');
  grid.className = 'wizard-option-grid';
  options.forEach(opt => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wizard-option-card';
    card.classList.toggle('selected', opt.name === selectedName);
    card.innerHTML = `<strong>${esc(opt.name)}</strong><span class="text-muted-sm">${esc(formatSubtext(opt))}</span>`;
    card.addEventListener('click', () => onSelect(opt.name));
    grid.appendChild(card);
  });
  return grid;
}

function buildArchetypeStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Choose an Archetype';
  wrap.appendChild(heading);
  wrap.appendChild(buildOptionGrid(
    ctx.archetypes,
    state.archetype,
    a => `+1 ${a.statBonus}`,
    name => { state.archetype = name; rerender(); }
  ));
  wrap.appendChild(buildStepNav({
    onNext: () => { state.step = 1; rerender(); },
    nextDisabled: !state.archetype,
  }));
  return wrap;
}

function buildPathStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Choose a Path';
  wrap.appendChild(heading);
  wrap.appendChild(buildOptionGrid(
    ctx.paths,
    state.path,
    p => `+1 ${p.statBonuses.join(', +1 ')}`,
    name => { state.path = name; rerender(); }
  ));
  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 0; rerender(); },
    onNext: () => { state.step = 2; rerender(); },
    nextDisabled: !state.path,
  }));
  return wrap;
}

const GB_MAGNITUDES = [3, 2, 1, -1, -2, -3];

function buildGiftsBurdensStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Gifts and Burdens';
  wrap.appendChild(heading);

  const textLabel = document.createElement('label');
  textLabel.className = 'field-label';
  textLabel.textContent = 'Describe your Gifts and Burdens';
  const textarea = document.createElement('textarea');
  textarea.className = 'textarea-full mb-0-75';
  textarea.rows = 3;
  textarea.value = state.giftsAndBurdens;
  textarea.addEventListener('change', () => { state.giftsAndBurdens = textarea.value.trim(); });
  wrap.appendChild(textLabel);
  wrap.appendChild(textarea);

  const addRow = document.createElement('div');
  addRow.className = 'row-flex-wrap mb-0-75';
  const addLabel = document.createElement('span');
  addLabel.className = 'field-label';
  addLabel.textContent = 'Add an entry:';
  addRow.appendChild(addLabel);
  GB_MAGNITUDES.forEach(mag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = mag > 0 ? `+${mag}` : `${mag}`;
    btn.addEventListener('click', () => {
      state.gbEntries.push({ magnitude: mag });
      rerender();
    });
    addRow.appendChild(btn);
  });
  wrap.appendChild(addRow);

  if (state.gbEntries.length > 0) {
    const list = document.createElement('div');
    list.className = 'mb-0-75';
    state.gbEntries.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'row-flex-wrap wizard-gb-entry';
      const label = document.createElement('span');
      label.className = 'flex-1';
      label.textContent = entry.magnitude > 0
        ? `Gift, level ${entry.magnitude} (costs ${entry.magnitude})`
        : `Burden, level ${-entry.magnitude} (grants ${-entry.magnitude})`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'secondary';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        state.gbEntries.splice(idx, 1);
        rerender();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  const remaining = gbPointsRemaining(state);
  const statusRow = document.createElement('div');
  statusRow.className = 'row-flex-wrap mb-0-75';
  const badge = document.createElement('span');
  badge.className = `wizard-points-badge${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `${remaining} pt${remaining === 1 ? '' : 's'} remaining`;
  statusRow.appendChild(badge);

  const applyLabel = document.createElement('label');
  applyLabel.className = 'field-label';
  applyLabel.textContent = 'Leftover points apply to:';
  const applySelect = document.createElement('select');
  ['stats', 'skills'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === 'stats' ? 'Stats' : 'Skills';
    opt.selected = state.gbApplyTo === v;
    applySelect.appendChild(opt);
  });
  applySelect.addEventListener('change', () => { state.gbApplyTo = applySelect.value; rerender(); });
  statusRow.appendChild(applyLabel);
  statusRow.appendChild(applySelect);
  wrap.appendChild(statusRow);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 1; rerender(); },
    onNext: () => { state.step = 3; rerender(); },
    nextDisabled: remaining < 0,
  }));
  return wrap;
}

function buildStatsStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Allocate Stats';
  wrap.appendChild(heading);

  const remaining = statPointsRemaining(state);
  const badge = document.createElement('div');
  badge.className = `wizard-points-badge mb-0-75${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `Stat points remaining: ${remaining} / ${statBudget(state)}`;
  wrap.appendChild(badge);

  const grid = document.createElement('div');
  grid.className = 'wizard-stat-grid';
  STAT_NAMES.forEach(name => {
    const purchased = state.stats[name];
    const bonus = statBonus(name, state, ctx);
    const nextCost = statStepCost(purchased);

    const cell = document.createElement('div');
    cell.className = 'wizard-stat-cell';
    cell.innerHTML = `
      <span class="wizard-stat-name">${esc(name)}</span>
      <span class="wizard-stat-value">${purchased}</span>
      <span class="text-muted-sm">${bonus ? `+${bonus} bonus (${statBonusSources(name, state, ctx).map(esc).join(', ')}) applied at Finish` : ' '}</span>
    `;

    const stepper = document.createElement('div');
    stepper.className = 'wizard-stepper';
    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'secondary';
    decBtn.textContent = '−';
    decBtn.disabled = purchased <= 1;
    decBtn.addEventListener('click', () => { state.stats[name] -= 1; rerender(); });
    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'secondary';
    incBtn.textContent = '+';
    incBtn.disabled = nextCost === null || nextCost > remaining;
    incBtn.addEventListener('click', () => { state.stats[name] += 1; rerender(); });
    stepper.appendChild(decBtn);
    stepper.appendChild(incBtn);
    cell.appendChild(stepper);

    grid.appendChild(cell);
  });
  wrap.appendChild(grid);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 2; rerender(); },
    onNext: () => { state.step = 4; rerender(); },
  }));
  return wrap;
}

function buildSkillRow(skillDef, state, ctx, remaining, rerender) {
  const floor = skillFloor(skillDef.name, state);
  const rank = skillGeneralRank(skillDef.name, state);
  const nextCost = rank < 6 ? SKILL_COSTS[rank + 1] - SKILL_COSTS[rank] : null;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${esc(skillDef.name)}</td>
    <td class="text-muted-sm">${esc(skillDef.diceCheck.join(' / '))}</td>
    <td>${rank}</td>
  `;

  const stepperTd = document.createElement('td');
  const stepper = document.createElement('div');
  stepper.className = 'wizard-stepper';
  const decBtn = document.createElement('button');
  decBtn.type = 'button';
  decBtn.className = 'secondary';
  decBtn.textContent = '−';
  decBtn.disabled = rank <= floor;
  decBtn.addEventListener('click', () => { setSkillGeneral(skillDef.name, state, rank - 1); rerender(); });
  const incBtn = document.createElement('button');
  incBtn.type = 'button';
  incBtn.className = 'secondary';
  incBtn.textContent = '+';
  incBtn.disabled = nextCost === null || nextCost > remaining;
  incBtn.addEventListener('click', () => { setSkillGeneral(skillDef.name, state, rank + 1); rerender(); });
  stepper.appendChild(decBtn);
  stepper.appendChild(incBtn);
  stepperTd.appendChild(stepper);
  tr.appendChild(stepperTd);

  if (skillDef.specialized?.length && rank >= 1 && rank < 6) {
    const specTd = document.createElement('td');
    const current = state.skills[skillDef.name]?.specialized;
    const minSpecRank = rank + 1;
    const select = document.createElement('select');
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'No specialization';
    noneOpt.selected = !current;
    select.appendChild(noneOpt);
    skillDef.specialized.forEach(specName => {
      const opt = document.createElement('option');
      opt.value = specName;
      opt.textContent = specName;
      opt.selected = current?.name === specName;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      if (select.value && SKILL_COSTS[minSpecRank] > remaining) {
        select.value = current?.name || '';
        return;
      }
      const entry = state.skills[skillDef.name] || { general: rank };
      entry.specialized = select.value ? { name: select.value, rank: minSpecRank } : undefined;
      state.skills[skillDef.name] = entry;
      rerender();
    });
    specTd.appendChild(select);

    if (current) {
      const rankLabel = document.createElement('span');
      rankLabel.className = 'text-muted-sm';
      rankLabel.textContent = `Rank ${current.rank}`;
      specTd.appendChild(rankLabel);

      const specNextCost = current.rank < 6 ? SKILL_COSTS[current.rank + 1] - SKILL_COSTS[current.rank] : null;
      const specStepper = document.createElement('div');
      specStepper.className = 'wizard-stepper';
      const specDec = document.createElement('button');
      specDec.type = 'button';
      specDec.className = 'secondary';
      specDec.textContent = '−';
      specDec.disabled = current.rank <= minSpecRank;
      specDec.addEventListener('click', () => {
        current.rank = clampSpecRank(current.rank - 1, rank);
        rerender();
      });
      const specInc = document.createElement('button');
      specInc.type = 'button';
      specInc.className = 'secondary';
      specInc.textContent = '+';
      specInc.disabled = specNextCost === null || specNextCost > remaining;
      specInc.addEventListener('click', () => {
        current.rank = clampSpecRank(current.rank + 1, rank);
        rerender();
      });
      specStepper.appendChild(specDec);
      specStepper.appendChild(specInc);
      specTd.appendChild(specStepper);
    }
    tr.appendChild(specTd);
  } else {
    tr.appendChild(document.createElement('td'));
  }

  return tr;
}

function buildSkillsStep(state, ctx, rerender) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.className = 'mb-0-5';
  heading.textContent = 'Allocate Skills';
  wrap.appendChild(heading);

  const arch = archetypeObj(state, ctx);
  if (arch && arch.freeSkillOptions?.length) {
    // Guard against a stale archetypeFreeSkill after the user Edits back to the
    // Archetype step and picks a different archetype: the previously-chosen free
    // skill may not be one of the new archetype's options, in which case its
    // floor/free-rank status has to move (or the select and state would desync).
    if (!arch.freeSkillOptions.includes(state.archetypeFreeSkill)) {
      const prev = state.archetypeFreeSkill;
      state.archetypeFreeSkill = arch.freeSkillOptions[0];
      if (prev && skillGeneralRank(prev, state) === 1) delete state.skills[prev];
    }
    const freeRow = document.createElement('div');
    freeRow.className = 'row-flex-wrap mb-0-75';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Free Archetype skill rank:';
    const select = document.createElement('select');
    arch.freeSkillOptions.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      opt.selected = state.archetypeFreeSkill === name;
      select.appendChild(opt);
    });
    if (!state.archetypeFreeSkill) {
      state.archetypeFreeSkill = arch.freeSkillOptions[0];
      select.value = state.archetypeFreeSkill;
    }
    select.addEventListener('change', () => {
      const prev = state.archetypeFreeSkill;
      state.archetypeFreeSkill = select.value;
      if (prev && skillGeneralRank(prev, state) === 1) delete state.skills[prev];
      rerender();
    });
    freeRow.appendChild(label);
    freeRow.appendChild(select);
    wrap.appendChild(freeRow);
    if (!state.skills[state.archetypeFreeSkill]) {
      state.skills[state.archetypeFreeSkill] = { general: 1 };
    }
  }

  const remaining = skillPointsRemaining(state, ctx);
  const badge = document.createElement('div');
  badge.className = `wizard-points-badge mb-0-75${remaining < 0 ? ' negative' : ''}`;
  badge.textContent = `Skill points remaining: ${remaining} / ${skillBudget(state)}`;
  wrap.appendChild(badge);

  const half = Math.ceil(ctx.allSkills.length / 2);
  const pair = document.createElement('div');
  pair.className = 'skill-table-pair';
  [ctx.allSkills.slice(0, half), ctx.allSkills.slice(half)].forEach(subset => {
    const table = document.createElement('table');
    table.className = 'skill-table';
    table.innerHTML = '<thead><tr><th>Skill</th><th>Stats</th><th>Rank</th><th></th><th>Specialization</th></tr></thead>';
    const tbody = document.createElement('tbody');
    subset.forEach(skillDef => tbody.appendChild(buildSkillRow(skillDef, state, ctx, remaining, rerender)));
    table.appendChild(tbody);
    const skillWrap = document.createElement('div');
    skillWrap.className = 'skill-table-wrap';
    skillWrap.appendChild(table);
    pair.appendChild(skillWrap);
  });
  wrap.appendChild(pair);

  wrap.appendChild(buildStepNav({
    onBack: () => { state.step = 3; rerender(); },
  }));
  return wrap;
}

function buildFinishedPc(state, ctx) {
  const stats = {};
  STAT_NAMES.forEach(name => { stats[name] = displayedStat(name, state, ctx); });
  const derived = calcDerivedStats(stats);
  return {
    name: '', age: '', gender: '', sexuality: '',
    archetype: state.archetype,
    path: { name: state.path },
    motivation: { name: '', description: '' },
    giftsAndBurdens: state.giftsAndBurdens,
    stats,
    skills: JSON.parse(JSON.stringify(state.skills)),
    ability: { name: '', description: '', diceCheck: [] },
    derived,
    current: { Body: derived.Body, Mind: derived.Mind, Soul: derived.Soul },
  };
}

function isWizardComplete(state) {
  return Boolean(state.archetype) && Boolean(state.path) && gbPointsRemaining(state) >= 0;
}

function summaryText(i, state, ctx) {
  if (i === 0) {
    const arch = archetypeObj(state, ctx);
    return `Archetype: ${state.archetype}${arch ? ` (+1 ${arch.statBonus})` : ''}`;
  }
  if (i === 1) {
    const path = pathObj(state, ctx);
    return `Path: ${state.path}${path ? ` (+1 ${path.statBonuses.join(', +1 ')})` : ''}`;
  }
  if (i === 2) {
    const remaining = gbPointsRemaining(state);
    return `Gifts/Burdens: ${state.gbEntries.length} entr${state.gbEntries.length === 1 ? 'y' : 'ies'}, ${remaining} pt${remaining === 1 ? '' : 's'} remaining -> ${state.gbApplyTo === 'stats' ? 'Stats' : 'Skills'}`;
  }
  if (i === 3) {
    return `Stats: ${totalStatSpent(state)}/${statBudget(state)} points spent`;
  }
  return '';
}

function buildSummaryLine(i, state, ctx, rerender) {
  const line = document.createElement('div');
  line.className = 'row-flex-wrap wizard-summary-line';
  const text = document.createElement('span');
  text.className = 'flex-1';
  text.textContent = summaryText(i, state, ctx);
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => { state.step = i; rerender(); });
  line.appendChild(text);
  line.appendChild(editBtn);
  return line;
}

function buildStepBody(i, state, ctx, rerender) {
  if (i === 0) return buildArchetypeStep(state, ctx, rerender);
  if (i === 1) return buildPathStep(state, ctx, rerender);
  if (i === 2) return buildGiftsBurdensStep(state, ctx, rerender);
  if (i === 3) return buildStatsStep(state, ctx, rerender);
  if (i === 4) return buildSkillsStep(state, ctx, rerender);
  const empty = document.createElement('div');
  return empty;
}

export function init(container, ctx, onFinish) {
  const state = blankWizardState();

  function render() {
    reconcileStatBudget(state);
    reconcileSkillBudget(state, ctx);
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wizard';
    for (let i = 0; i <= state.step && i < STEP_COUNT; i++) {
      wrap.appendChild(
        i < state.step
          ? buildSummaryLine(i, state, ctx, render)
          : buildStepBody(i, state, ctx, render)
      );
    }
    if (isWizardComplete(state)) {
      const finishRow = document.createElement('div');
      finishRow.className = 'row-flex-wrap wizard-finish-row';
      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.textContent = 'Finish';
      finishBtn.addEventListener('click', () => onFinish(buildFinishedPc(state, ctx)));
      finishRow.appendChild(finishBtn);
      wrap.appendChild(finishRow);
    }
    container.appendChild(wrap);
  }

  render();
}

// js/pc-wizard.js
import { esc } from './character-card.js';
import { STAT_COSTS } from './npc-character-gen.js';

export const STAT_NAMES = [
  'Strength', 'Agility', 'Endurance', 'Intelligence',
  'Perception', 'Wisdom', 'Spirit', 'Charisma', 'Will',
];

// Bumped by later tasks as more steps are implemented (2 -> 3 -> 4 -> 5).
let STEP_COUNT = 4;

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
    const displayed = purchased + bonus;
    const nextCost = statStepCost(purchased);

    const cell = document.createElement('div');
    cell.className = 'wizard-stat-cell';
    cell.innerHTML = `
      <span class="wizard-stat-name">${esc(name)}</span>
      <span class="wizard-stat-value">${displayed}</span>
      <span class="text-muted-sm">${purchased} purchased${bonus ? ` + ${bonus} bonus` : ''}</span>
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
  const empty = document.createElement('div');
  return empty;
}

export function init(container, ctx, onFinish) {
  const state = blankWizardState();

  function render() {
    reconcileStatBudget(state);
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
    container.appendChild(wrap);
  }

  render();
}

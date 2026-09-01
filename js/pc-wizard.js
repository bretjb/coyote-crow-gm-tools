// js/pc-wizard.js
import { esc } from './character-card.js';

export const STAT_NAMES = [
  'Strength', 'Agility', 'Endurance', 'Intelligence',
  'Perception', 'Wisdom', 'Spirit', 'Charisma', 'Will',
];

// Bumped by later tasks as more steps are implemented (2 -> 3 -> 4 -> 5).
let STEP_COUNT = 2;

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

function summaryText(i, state, ctx) {
  if (i === 0) {
    const arch = archetypeObj(state, ctx);
    return `Archetype: ${state.archetype}${arch ? ` (+1 ${arch.statBonus})` : ''}`;
  }
  if (i === 1) {
    const path = pathObj(state, ctx);
    return `Path: ${state.path}${path ? ` (+1 ${path.statBonuses.join(', +1 ')})` : ''}`;
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
  const empty = document.createElement('div');
  return empty;
}

export function init(container, ctx, onFinish) {
  const state = blankWizardState();

  function render() {
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

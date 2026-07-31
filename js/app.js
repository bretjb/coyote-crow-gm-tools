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

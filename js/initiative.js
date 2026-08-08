// js/initiative.js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, subscribe } from './initiative-state.js';

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Initiative Tracker</h2>
    <form id="init-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input id="init-name" type="text" placeholder="Name" required style="flex:1;min-width:8rem;">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" required style="width:5rem;">
      <button type="submit">Add</button>
    </form>
    <div id="init-slots"></div>
    <div style="display:flex;gap:0.5rem;margin-top:1rem;">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');

  function render() {
    const { slots, currentStep } = getState();
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
      const combatants = slots[slotNum];
      const isCurrent = slotNum === currentStep;
      const chips = combatants.map(c => `
        <span class="init-chip" data-id="${c.id}" style="display:inline-flex;align-items:center;gap:0.3rem;
            background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:0.2rem 0.4rem;margin:0.15rem;">
          <span>${c.name}</span>
          <input type="number" class="init-move" min="1" max="12" placeholder="→" style="width:3rem;">
          <button type="button" class="init-remove secondary" style="padding:0.1rem 0.4rem;">×</button>
        </span>
      `).join('');
      return `
        <div class="card" style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;
            ${isCurrent ? 'border-color:var(--accent);' : ''}">
          <span style="min-width:2rem;font-size:1.1rem;color:var(--accent);">${isCurrent ? '▶ ' : ''}${slotNum}</span>
          <div style="flex:1;display:flex;flex-wrap:wrap;">${chips}</div>
        </div>
      `;
    }).join('');
  }

  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const slot = parseInt(container.querySelector('#init-slot').value, 10);
    if (!name || isNaN(slot) || slot < 1 || slot > 12) return;
    addCombatant(name, slot);
    e.target.reset();
  });

  slotsEl.addEventListener('click', e => {
    const removeBtn = e.target.closest('.init-remove');
    if (!removeBtn) return;
    const chip = removeBtn.closest('.init-chip');
    removeCombatant(chip.dataset.id);
  });

  slotsEl.addEventListener('change', e => {
    const moveInput = e.target.closest('.init-move');
    if (!moveInput) return;
    const newSlot = parseInt(moveInput.value, 10);
    if (isNaN(newSlot) || newSlot < 1 || newSlot > 12) return;
    const chip = moveInput.closest('.init-chip');
    moveCombatant(chip.dataset.id, newSlot);
  });

  container.querySelector('#init-next').addEventListener('click', () => nextStep());
  container.querySelector('#init-prev').addEventListener('click', () => prevStep());
  container.querySelector('#init-clear').addEventListener('click', () => clearAll());

  subscribe(render);
  render();
}

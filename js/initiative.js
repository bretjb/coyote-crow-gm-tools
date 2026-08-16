// js/initiative.js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, subscribe } from './initiative-state.js';

export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Initiative Tracker</h2>
    <form id="init-form" class="init-form">
      <input id="init-name" type="text" placeholder="Name" required class="init-name-input">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required class="init-slot-input">
      <button type="submit">Add</button>
    </form>
    <div id="init-slots"></div>
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <span id="init-round" class="init-round"></span>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  let dragHighlightRow = null;

  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
      const combatants = slots[slotNum];
      const isCurrent = slotNum === currentStep;
      const chips = combatants.map(c => `
        <span class="init-chip" data-id="${c.id}">
          <span class="init-drag-handle">⠿</span>
          <span>${c.name}</span>
          <input type="number" class="init-move init-move-input" min="1" max="12" placeholder="→">
          <button type="button" class="init-remove secondary">×</button>
        </span>
      `).join('');
      return `
        <div class="card init-slot-row${isCurrent ? ' current' : ''}" data-slot="${slotNum}">
          <span class="init-slot-num">${isCurrent ? '▶ ' : ''}${slotNum}</span>
          <div class="init-chips-wrap">${chips}</div>
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

  function clearDragHighlight() {
    if (dragHighlightRow) {
      dragHighlightRow.classList.remove('drag-target');
      dragHighlightRow = null;
    }
  }

  function resetChipDragStyles(chip) {
    chip.style.position = '';
    chip.style.left = '';
    chip.style.top = '';
    chip.style.width = '';
    chip.style.zIndex = '';
    chip.style.opacity = '';
    chip.style.pointerEvents = '';
  }

  slotsEl.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.init-drag-handle');
    if (!handle) return;
    const chip = handle.closest('.init-chip');
    const chipId = chip.dataset.id;
    const rect = chip.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    handle.setPointerCapture(e.pointerId);

    chip.style.position = 'fixed';
    chip.style.left = `${rect.left}px`;
    chip.style.top = `${rect.top}px`;
    chip.style.width = `${rect.width}px`;
    chip.style.zIndex = '1000';
    chip.style.opacity = '0.85';
    chip.style.pointerEvents = 'none';

    function onMove(moveEvent) {
      chip.style.left = `${moveEvent.clientX - offsetX}px`;
      chip.style.top = `${moveEvent.clientY - offsetY}px`;

      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const row = under?.closest('.init-slot-row') ?? null;
      if (row !== dragHighlightRow) {
        clearDragHighlight();
        if (row) {
          row.classList.add('drag-target');
          dragHighlightRow = row;
        }
      }
    }

    function detachListeners() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
    }

    function onUp(upEvent) {
      detachListeners();

      const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const row = under?.closest('.init-slot-row') ?? null;
      clearDragHighlight();

      if (row) {
        const newSlot = parseInt(row.dataset.slot, 10);
        moveCombatant(chipId, newSlot);
        // moveCombatant's state change triggers render(), which replaces
        // #init-slots' contents wholesale — the dragged chip node (and its
        // inline drag styles) is discarded along with it, so no manual
        // style reset is needed on this path.
      } else {
        resetChipDragStyles(chip);
      }
    }

    function onCancel() {
      // pointercancel fires when the drag is aborted mid-gesture (e.g. a
      // second finger tapping Next Step / Prev Step / Clear All, which
      // triggers a render() that removes the captured handle from the DOM).
      // The pointer's last known coordinates are stale relative to the
      // freshly-rendered layout, so never commit a move here — just reset.
      detachListeners();
      clearDragHighlight();
      resetChipDragStyles(chip);
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  });

  container.querySelector('#init-next').addEventListener('click', () => nextStep());
  container.querySelector('#init-prev').addEventListener('click', () => prevStep());
  container.querySelector('#init-clear').addEventListener('click', () => clearAll());

  subscribe(render);
  render();
}

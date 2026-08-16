// js/initiative.js
import { getState, addCombatant, removeCombatant, moveCombatant, nextStep, prevStep, clearAll, undoClearAll, canUndo, subscribe } from './initiative-state.js';
import { esc } from './character-card.js';
import { getById as getNpcById, updateNpc } from './npc-storage.js';
import { getById as getPcById, updatePc } from './pc-storage.js';

async function loadSkillDefs() {
  const res = await fetch('data/skills.json');
  if (!res.ok) throw new Error('Failed to load skills.json');
  return res.json();
}

function rankedSkillList(data, skillDefsByName) {
  const entries = [];
  for (const [name, acquired] of Object.entries(data.skills || {})) {
    const def = skillDefsByName.get(name);
    if (!def) continue;
    const vals = def.diceCheck.map(s => data.stats[s] || 0);
    const higher = Math.max(...vals);
    if ((acquired.general || 0) >= 1) {
      entries.push({ name, total: higher + acquired.general });
    }
    if (acquired.specialized) {
      entries.push({ name: `${acquired.specialized.name} (${name})`, total: higher + acquired.specialized.rank });
    }
  }
  entries.sort((a, b) => b.total - a.total);
  return entries;
}

function buildCombatantMiniCard(combatant, skillDefsByName) {
  const wrap = document.createElement('div');
  wrap.className = 'card init-mini-card';

  const nameEl = document.createElement('p');
  nameEl.className = 'input-name mb-0-5';
  nameEl.textContent = combatant.name;
  wrap.appendChild(nameEl);

  if (!combatant.sourceKind || !combatant.sourceId) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'No linked character data';
    wrap.appendChild(note);
    return wrap;
  }

  const getEntry = combatant.sourceKind === 'npc' ? getNpcById : getPcById;
  const updateEntry = combatant.sourceKind === 'npc' ? updateNpc : updatePc;
  const entry = getEntry(combatant.sourceId);
  if (!entry) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'Source not found';
    wrap.appendChild(note);
    return wrap;
  }

  const data = entry.data;
  if (!data.stats || !data.derived || !data.current) {
    const note = document.createElement('p');
    note.className = 'text-muted-sm';
    note.textContent = 'No stat block available for this character';
    wrap.appendChild(note);
    return wrap;
  }

  const statRow = document.createElement('div');
  statRow.className = 'row-flex-wrap mb-0-5';
  for (const key of ['Body', 'Mind', 'Soul']) {
    const field = document.createElement('span');
    field.className = 'init-mini-stat';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'stat-cell-label';
    labelSpan.textContent = key;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'stat-input init-mini-stat-input';
    input.value = data.current[key];
    const max = document.createElement('span');
    max.className = 'text-muted-sm';
    max.textContent = ` / ${data.derived[key]}`;
    input.addEventListener('change', () => {
      const clamped = Math.min(data.derived[key], Math.max(0, Math.round(Number(input.value)) || 0));
      input.value = clamped;
      data.current[key] = clamped;
      updateEntry(combatant.sourceId, { data });
    });
    field.appendChild(labelSpan);
    field.appendChild(document.createElement('br'));
    field.appendChild(input);
    field.appendChild(max);
    statRow.appendChild(field);
  }
  wrap.appendChild(statRow);

  const skillsList = document.createElement('ul');
  skillsList.className = 'init-mini-skills';
  const ranked = rankedSkillList(data, skillDefsByName);
  if (ranked.length === 0) {
    const li = document.createElement('li');
    li.className = 'text-muted-sm';
    li.textContent = 'No ranked skills';
    skillsList.appendChild(li);
  } else {
    for (const { name, total } of ranked) {
      const li = document.createElement('li');
      li.textContent = `${name}: ${total}`;
      skillsList.appendChild(li);
    }
  }
  wrap.appendChild(skillsList);

  const abilityEl = document.createElement('p');
  abilityEl.className = 'mt-0-5';
  const abilityName = data.ability?.name || 'None';
  const abilityDesc = data.ability?.description;
  abilityEl.innerHTML = `<strong>${esc(abilityName)}</strong>${abilityDesc ? ` — ${esc(abilityDesc)}` : ''}`;
  wrap.appendChild(abilityEl);

  return wrap;
}

export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Initiative Tracker</h2>
    <form id="init-form" class="init-form">
      <input id="init-name" type="text" placeholder="Name" required class="init-name-input">
      <input id="init-slot" type="number" placeholder="Slot" min="1" max="12" value="1" required class="init-slot-input">
      <button type="submit">Add</button>
    </form>
    <div id="init-current-wrap" class="init-current-wrap"></div>
    <div id="init-slots"></div>
    <div class="init-actions">
      <button id="init-prev" class="secondary">Prev Step</button>
      <button id="init-next">Next Step</button>
      <span id="init-round" class="init-round"></span>
      <button id="init-clear" class="secondary">Clear All</button>
      <button id="init-undo" class="secondary hidden">Undo</button>
    </div>
  `;

  const slotsEl = container.querySelector('#init-slots');
  const roundEl = container.querySelector('#init-round');
  const undoBtn = container.querySelector('#init-undo');
  const currentWrapEl = container.querySelector('#init-current-wrap');
  let dragHighlightRow = null;

  let skillDefsByName = new Map();
  try {
    const skillDefs = await loadSkillDefs();
    skillDefsByName = new Map(skillDefs.map(s => [s.name, s]));
  } catch {
    // Quick-lookup skill totals degrade to "No ranked skills" if skills.json
    // can't be fetched; the rest of the tracker (slots, drag/drop, round,
    // undo) doesn't depend on this data and stays fully functional.
  }

  function renderCurrentCard(combatants) {
    currentWrapEl.innerHTML = '';
    if (!combatants || combatants.length === 0) return;
    const heading = document.createElement('h3');
    heading.className = 'h3-section';
    heading.textContent = 'Current';
    currentWrapEl.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'init-current-grid';
    for (const c of combatants) {
      grid.appendChild(buildCombatantMiniCard(c, skillDefsByName));
    }
    currentWrapEl.appendChild(grid);
  }

  function render() {
    const { slots, currentStep, round } = getState();
    roundEl.textContent = `Round ${round}`;
    undoBtn.classList.toggle('hidden', !canUndo());
    renderCurrentCard(slots[currentStep]);
    slotsEl.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(slotNum => {
      const combatants = slots[slotNum];
      const isCurrent = slotNum === currentStep;
      const chips = combatants.map(c => {
        const sourceClass = c.sourceKind === 'npc' ? 'source-npc' : c.sourceKind === 'pc' ? 'source-pc' : 'source-none';
        return `
        <span class="init-chip ${sourceClass}" data-id="${c.id}">
          <span class="init-drag-handle">⠿</span>
          <span>${c.name}</span>
          <input type="number" class="init-move init-move-input" min="1" max="12" placeholder="→">
          <button type="button" class="init-remove secondary">×</button>
        </span>
      `;
      }).join('');
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
  container.querySelector('#init-undo').addEventListener('click', () => undoClearAll());

  subscribe(render);
  render();
}

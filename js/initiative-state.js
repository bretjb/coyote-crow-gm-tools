// js/initiative-state.js
const STORAGE_KEY = 'cc-initiative-state';
const SLOT_COUNT = 12;

function emptySlots() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) slots[i] = [];
  return slots;
}

// Clamp a slot value to the valid 1-SLOT_COUNT range. Non-numeric or
// non-finite input (e.g. NaN, undefined, strings) falls back to `fallback`
// so callers never index state.slots with an invalid key.
function clampSlot(value, fallback = 1) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(SLOT_COUNT, Math.max(1, value));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
    const parsed = JSON.parse(raw);
    const slots = emptySlots();
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (Array.isArray(parsed.slots?.[i])) {
        slots[i] = parsed.slots[i].map(c => ({
          id: c.id,
          name: c.name,
          sourceKind: c.sourceKind === 'npc' || c.sourceKind === 'pc' ? c.sourceKind : null,
          sourceId: typeof c.sourceId === 'string' ? c.sourceId : null,
        }));
      }
    }
    const currentStep = clampSlot(parsed.currentStep, SLOT_COUNT);
    return { slots, currentStep };
  } catch {
    return { slots: emptySlots(), currentStep: SLOT_COUNT };
  }
}

let state = load();
const listeners = new Set();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notify() {
  save();
  listeners.forEach(fn => fn());
}

export function getState() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) {
    slots[i] = state.slots[i].map(c => ({ ...c }));
  }
  return { slots, currentStep: state.currentStep };
}

export function addCombatant(name, slot, source) {
  const clamped = clampSlot(slot);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceKind = source && (source.kind === 'npc' || source.kind === 'pc') ? source.kind : null;
  const sourceId = sourceKind && typeof source.id === 'string' ? source.id : null;
  state.slots[clamped].push({ id, name, sourceKind, sourceId });
  notify();
}

export function removeCombatant(id) {
  for (let i = 1; i <= SLOT_COUNT; i++) {
    state.slots[i] = state.slots[i].filter(c => c.id !== id);
  }
  notify();
}

export function moveCombatant(id, newSlot) {
  const clamped = clampSlot(newSlot);
  let found = null;
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const idx = state.slots[i].findIndex(c => c.id === id);
    if (idx !== -1) {
      found = state.slots[i][idx];
      state.slots[i].splice(idx, 1);
      break;
    }
  }
  if (found) {
    state.slots[clamped].push(found);
    notify();
  }
}

function hasAnyCombatants() {
  return Object.values(state.slots).some(list => list.length > 0);
}

export function nextStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    step = step === 1 ? SLOT_COUNT : step - 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}

export function prevStep() {
  if (!hasAnyCombatants()) return;
  let step = state.currentStep;
  for (let i = 0; i < SLOT_COUNT; i++) {
    step = step === SLOT_COUNT ? 1 : step + 1;
    if (state.slots[step].length > 0) {
      state.currentStep = step;
      notify();
      return;
    }
  }
}

export function clearAll() {
  state = { slots: emptySlots(), currentStep: SLOT_COUNT };
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// js/initiative-state.js
const STORAGE_KEY = 'cc-initiative-state';
const SLOT_COUNT = 12;

function emptySlots() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) slots[i] = [];
  return slots;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { slots: emptySlots(), currentStep: SLOT_COUNT };
    const parsed = JSON.parse(raw);
    const slots = emptySlots();
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (Array.isArray(parsed.slots?.[i])) slots[i] = parsed.slots[i];
    }
    const currentStep = Number.isInteger(parsed.currentStep) ? parsed.currentStep : SLOT_COUNT;
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
  return state;
}

export function addCombatant(name, slot) {
  const clamped = Math.min(SLOT_COUNT, Math.max(1, slot));
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.slots[clamped].push({ id, name });
  notify();
}

export function removeCombatant(id) {
  for (let i = 1; i <= SLOT_COUNT; i++) {
    state.slots[i] = state.slots[i].filter(c => c.id !== id);
  }
  notify();
}

export function moveCombatant(id, newSlot) {
  const clamped = Math.min(SLOT_COUNT, Math.max(1, newSlot));
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

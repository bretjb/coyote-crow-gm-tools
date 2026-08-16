// js/pc-storage.js
const STORAGE_KEY = 'cc-pc-library';

// Drops soft-deleted entries permanently — this is the only purge point,
// so deleted entries stay recoverable (via undoRemove) for the rest of
// the session and only disappear for good on the next page load.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pcs: [] };
    const parsed = JSON.parse(raw);
    const pcs = Array.isArray(parsed.pcs) ? parsed.pcs.filter(p => p && !p.deleted) : [];
    return { pcs };
  } catch {
    return { pcs: [] };
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

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAll() {
  return state.pcs.map(p => ({ ...p, data: JSON.parse(JSON.stringify(p.data)) }));
}

export function getById(id) {
  const entry = state.pcs.find(p => p.id === id);
  return entry ? { ...entry, data: JSON.parse(JSON.stringify(entry.data)) } : null;
}

export function savePc({ data, note }) {
  const id = generateId();
  state.pcs.push({ id, data: JSON.parse(JSON.stringify(data)), note: note || '', savedAt: Date.now(), deleted: false });
  notify();
  return id;
}

export function updatePc(id, { data, note } = {}) {
  const entry = state.pcs.find(p => p.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = JSON.parse(JSON.stringify(data));
  if (note !== undefined) entry.note = note;
  notify();
}

export function removePc(id) {
  const entry = state.pcs.find(p => p.id === id);
  if (!entry) return;
  entry.deleted = true;
  notify();
}

export function undoRemove(id) {
  const entry = state.pcs.find(p => p.id === id);
  if (!entry) return;
  entry.deleted = false;
  notify();
}

export function exportAll() {
  return JSON.stringify(state.pcs.filter(p => !p.deleted), null, 2);
}

export function importMerge(jsonString) {
  let imported;
  try {
    imported = JSON.parse(jsonString);
  } catch {
    return 0;
  }
  if (!Array.isArray(imported)) return 0;

  let added = 0;
  for (const item of imported) {
    if (!item || typeof item !== 'object') continue;
    const { data } = item;
    const note = item.note || '';
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') continue;
    const isDuplicate = state.pcs.some(p =>
      !p.deleted &&
      p.note === note &&
      JSON.stringify(p.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.pcs.push({ id: generateId(), data, note, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// js/npc-storage.js
const STORAGE_KEY = 'cc-npc-library';

// Drops soft-deleted entries permanently — this is the only purge point,
// so deleted entries stay recoverable (via undoRemove) for the rest of
// the session and only disappear for good on the next page load.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { npcs: [] };
    const parsed = JSON.parse(raw);
    const npcs = Array.isArray(parsed.npcs) ? parsed.npcs.filter(n => n && !n.deleted) : [];
    return { npcs };
  } catch {
    return { npcs: [] };
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
  return state.npcs.map(n => ({ ...n }));
}

export function saveNpc({ kind, data, note }) {
  const id = generateId();
  state.npcs.push({ id, kind, data, note: note || '', savedAt: Date.now(), deleted: false });
  notify();
  return id;
}

export function updateNpc(id, { data, note } = {}) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = data;
  if (note !== undefined) entry.note = note;
  notify();
}

export function removeNpc(id) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  entry.deleted = true;
  notify();
}

export function undoRemove(id) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  entry.deleted = false;
  notify();
}

export function exportAll() {
  return JSON.stringify(state.npcs.filter(n => !n.deleted), null, 2);
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
    const { kind, data } = item;
    const note = item.note || '';
    if (kind !== 'quick' && kind !== 'full') continue;
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') continue;
    const isDuplicate = state.npcs.some(n =>
      !n.deleted &&
      n.kind === kind &&
      n.note === note &&
      JSON.stringify(n.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.npcs.push({ id: generateId(), kind, data, note, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

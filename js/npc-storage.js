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
    const npcs = Array.isArray(parsed.npcs)
      ? parsed.npcs
          .filter(n => n && !n.deleted)
          .map(n => ({ ...n, tags: Array.isArray(n.tags) ? n.tags.filter(t => typeof t === 'string') : [] }))
      : [];
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
  return state.npcs.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)), tags: [...(n.tags || [])] }));
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? [...new Set(tags.map(t => String(t).trim()).filter(Boolean))] : [];
}

export function saveNpc({ kind, data, note, tags }) {
  const id = generateId();
  state.npcs.push({
    id,
    kind,
    data: JSON.parse(JSON.stringify(data)),
    note: note || '',
    tags: normalizeTags(tags),
    savedAt: Date.now(),
    deleted: false,
  });
  notify();
  return id;
}

export function updateNpc(id, { data, note, tags } = {}) {
  const entry = state.npcs.find(n => n.id === id);
  if (!entry) return;
  if (data !== undefined) entry.data = JSON.parse(JSON.stringify(data));
  if (note !== undefined) entry.note = note;
  if (tags !== undefined) entry.tags = normalizeTags(tags);
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
    const tags = normalizeTags(item.tags);
    if (kind !== 'quick' && kind !== 'full') continue;
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') continue;
    const isDuplicate = state.npcs.some(n =>
      !n.deleted &&
      n.kind === kind &&
      n.note === note &&
      JSON.stringify([...(n.tags || [])].sort()) === JSON.stringify([...tags].sort()) &&
      JSON.stringify(n.data) === JSON.stringify(data)
    );
    if (isDuplicate) continue;
    state.npcs.push({ id: generateId(), kind, data, note, tags, savedAt: Date.now(), deleted: false });
    added++;
  }
  if (added > 0) notify();
  return added;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

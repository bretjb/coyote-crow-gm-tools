// js/encounter.js
import { getAll as getAllNpcs, subscribe as subscribeNpcs } from './npc-storage.js';
import { getAll as getAllPcs, subscribe as subscribePcs } from './pc-storage.js';

function matchesQuery(entry, query) {
  if (!query) return true;
  const name = (entry.data?.name || '').toLowerCase();
  const tags = (entry.tags || []).map(t => t.toLowerCase());
  return name.includes(query) || tags.some(t => t.includes(query));
}

function renderPickerList(listEl, entries, checkedIds, query, extraLineFn, onToggle) {
  const filtered = entries.filter(entry => matchesQuery(entry, query));
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="text-muted-sm">No entries match.</p>';
    return;
  }
  filtered.forEach(entry => {
    const row = document.createElement('label');
    row.className = 'encounter-picker-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checkedIds.has(entry.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) checkedIds.add(entry.id);
      else checkedIds.delete(entry.id);
      onToggle();
    });

    const text = document.createElement('span');
    const extra = extraLineFn ? extraLineFn(entry) : '';
    text.textContent = extra ? `${entry.data?.name || '(unnamed)'} — ${extra}` : (entry.data?.name || '(unnamed)');

    row.appendChild(checkbox);
    row.appendChild(text);
    listEl.appendChild(row);
  });
}

export async function init(container) {
  container.innerHTML = `
    <h2 class="mb-1">Encounter Generator</h2>
    <div class="row-flex-wrap mb-1-5">
      <div class="flex-1">
        <h3 class="mb-0-5">NPCs</h3>
        <input id="enc-npc-search" type="text" class="search-input mb-0-75" placeholder="Search by name or tag...">
        <div id="enc-npc-list" class="encounter-picker-list"></div>
      </div>
      <div class="flex-1">
        <h3 class="mb-0-5">PCs</h3>
        <input id="enc-pc-search" type="text" class="search-input mb-0-75" placeholder="Search by name...">
        <div id="enc-pc-list" class="encounter-picker-list"></div>
      </div>
    </div>
    <button id="enc-generate" disabled>Generate Encounter</button>
  `;

  const npcListEl = container.querySelector('#enc-npc-list');
  const pcListEl = container.querySelector('#enc-pc-list');
  const npcSearchInput = container.querySelector('#enc-npc-search');
  const pcSearchInput = container.querySelector('#enc-pc-search');
  const generateBtn = container.querySelector('#enc-generate');

  const checkedNpcIds = new Set();
  const checkedPcIds = new Set();
  let npcQuery = '';
  let pcQuery = '';

  function updateGenerateBtn() {
    generateBtn.disabled = checkedNpcIds.size === 0 && checkedPcIds.size === 0;
  }

  function getFullNpcEntries() {
    return getAllNpcs().filter(entry => !entry.deleted && entry.kind === 'full');
  }

  function getPcEntries() {
    return getAllPcs().filter(entry => !entry.deleted);
  }

  function refreshNpcList() {
    renderPickerList(npcListEl, getFullNpcEntries(), checkedNpcIds, npcQuery, entry => entry.data?.archetype || '', updateGenerateBtn);
  }

  function refreshPcList() {
    renderPickerList(pcListEl, getPcEntries(), checkedPcIds, pcQuery, null, updateGenerateBtn);
  }

  refreshNpcList();
  refreshPcList();
  updateGenerateBtn();

  subscribeNpcs(refreshNpcList);
  subscribePcs(refreshPcList);

  npcSearchInput.addEventListener('input', () => {
    npcQuery = npcSearchInput.value.trim().toLowerCase();
    refreshNpcList();
  });
  pcSearchInput.addEventListener('input', () => {
    pcQuery = pcSearchInput.value.trim().toLowerCase();
    refreshPcList();
  });
}

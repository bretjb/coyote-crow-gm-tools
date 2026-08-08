import { loadMarked } from './lib/load-marked.js';

export async function init(container) {
  await loadMarked();

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Full Rules</h2>
    <div class="rules-body"></div>
  `;

  const contentEl = container.querySelector('.rules-body');

  try {
    const res = await fetch('data/rules/full-digest.md');
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    contentEl.innerHTML = window.marked.parse(text);
  } catch {
    contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
  }
}

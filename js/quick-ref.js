import { loadMarked } from './lib/load-marked.js';

function splitSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map(s => ({ title: s.title, markdown: s.body.join('\n').trim() }));
}

export async function init(container) {
  await loadMarked();

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Quick Reference</h2>
    <div id="qr-subtabs" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;"></div>
    <div id="qr-content" class="rules-body"></div>
  `;

  const subtabsEl = container.querySelector('#qr-subtabs');
  const contentEl = container.querySelector('#qr-content');

  let sections;
  try {
    const res = await fetch('data/rules/quick-ref.md');
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    sections = splitSections(text);
  } catch {
    contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const buttons = sections.map((section, i) => {
    const btn = document.createElement('button');
    btn.textContent = section.title;
    if (i !== 0) btn.classList.add('secondary');
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.add('secondary'));
      btn.classList.remove('secondary');
      contentEl.innerHTML = window.marked.parse(section.markdown);
    });
    subtabsEl.appendChild(btn);
    return btn;
  });

  if (sections.length > 0) {
    contentEl.innerHTML = window.marked.parse(sections[0].markdown);
  } else {
    contentEl.innerHTML = '<p class="error">No sections found.</p>';
  }
}

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
    <h2>Rules</h2>
    <div class="row-flex-wrap mb-1">
      <button id="rules-mode-quick" data-mode="quick">Quick Reference</button>
      <button id="rules-mode-full" class="secondary" data-mode="full">Full Rules</button>
    </div>
    <div id="rules-subtabs" class="row-flex-wrap mb-1"></div>
    <div id="rules-content" class="rules-body"></div>
  `;

  const modeQuickBtn = container.querySelector('#rules-mode-quick');
  const modeFullBtn = container.querySelector('#rules-mode-full');
  const subtabsEl = container.querySelector('#rules-subtabs');
  const contentEl = container.querySelector('#rules-content');

  let quickSections = null;
  let fullHtml = null;

  function setMode(mode) {
    modeQuickBtn.classList.toggle('secondary', mode !== 'quick');
    modeFullBtn.classList.toggle('secondary', mode !== 'full');
    subtabsEl.classList.toggle('hidden', mode !== 'quick');
    if (mode === 'quick') renderQuick();
    else renderFull();
  }

  async function renderQuick() {
    if (quickSections === null) {
      try {
        const res = await fetch('data/rules/quick-ref.md');
        if (!res.ok) throw new Error('fetch failed');
        const text = await res.text();
        quickSections = splitSections(text);
      } catch {
        quickSections = [];
        contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
        return;
      }

      subtabsEl.innerHTML = '';
      const buttons = quickSections.map((section, i) => {
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
    }

    if (quickSections.length > 0) {
      contentEl.innerHTML = window.marked.parse(quickSections[0].markdown);
    } else if (subtabsEl.children.length === 0) {
      contentEl.innerHTML = '<p class="error">No sections found.</p>';
    }
  }

  async function renderFull() {
    if (fullHtml === null) {
      try {
        const res = await fetch('data/rules/full-digest.md');
        if (!res.ok) throw new Error('fetch failed');
        const text = await res.text();
        fullHtml = window.marked.parse(text);
      } catch {
        contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
        return;
      }
    }
    contentEl.innerHTML = fullHtml;
  }

  modeQuickBtn.addEventListener('click', () => setMode('quick'));
  modeFullBtn.addEventListener('click', () => setMode('full'));

  setMode('quick');
}

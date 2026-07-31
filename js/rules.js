export async function init(container) {
  // Load marked UMD build (sets window.marked)
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/lib/md.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Rules</h2>
    <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
      <button id="rules-quick" class="active-sub">Quick Ref</button>
      <button id="rules-full" class="secondary">Full Digest</button>
    </div>
    <div id="rules-content" class="rules-body"></div>
  `;

  const contentEl = container.querySelector('#rules-content');

  async function loadMd(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      contentEl.innerHTML = window.marked.parse(text);
    } catch {
      contentEl.innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    }
  }

  const quickBtn = container.querySelector('#rules-quick');
  const fullBtn = container.querySelector('#rules-full');

  quickBtn.addEventListener('click', () => {
    quickBtn.classList.remove('secondary');
    fullBtn.classList.add('secondary');
    loadMd('data/rules/quick-ref.md');
  });

  fullBtn.addEventListener('click', () => {
    fullBtn.classList.remove('secondary');
    quickBtn.classList.add('secondary');
    loadMd('data/rules/full-digest.md');
  });

  // Load default sub-tab
  loadMd('data/rules/quick-ref.md');
}

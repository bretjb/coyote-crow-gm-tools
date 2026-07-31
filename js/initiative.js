export async function init(container) {
  let combatants = [];
  let activeIndex = 0;

  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">Initiative Tracker</h2>
    <form id="init-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
      <input id="init-name" type="text" placeholder="Name" required style="flex:1;min-width:8rem;">
      <input id="init-score" type="number" placeholder="Initiative" required style="width:6rem;">
      <button type="submit">Add</button>
    </form>
    <ul id="init-list" style="list-style:none;margin-bottom:1rem;"></ul>
    <div style="display:flex;gap:0.5rem;">
      <button id="init-next">Next Turn</button>
      <button id="init-clear" class="secondary">Clear All</button>
    </div>
  `;

  function render() {
    container.querySelector('#init-list').innerHTML = combatants.map((c, i) => `
      <li class="card" style="display:flex;justify-content:space-between;align-items:center;
          ${i === activeIndex ? 'border-color:var(--accent);' : ''}">
        <span>${i === activeIndex ? '▶ ' : ''}${c.name}</span>
        <span style="color:var(--accent);font-size:1.1rem;">${c.score}</span>
      </li>
    `).join('');
  }

  container.querySelector('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#init-name').value.trim();
    const score = parseInt(container.querySelector('#init-score').value, 10);
    if (!name || isNaN(score)) return;
    combatants.push({ name, score });
    combatants.sort((a, b) => b.score - a.score);
    activeIndex = 0;
    e.target.reset();
    render();
  });

  container.querySelector('#init-next').addEventListener('click', () => {
    if (combatants.length === 0) return;
    activeIndex = (activeIndex + 1) % combatants.length;
    render();
  });

  container.querySelector('#init-clear').addEventListener('click', () => {
    combatants = [];
    activeIndex = 0;
    render();
  });

  render();
}

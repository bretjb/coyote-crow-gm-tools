import { rollDice, countSuccesses } from './dice.js';

export async function init(container) {
  container.innerHTML = `
    <div class="dice-roller">
      <h2>Dice Roller</h2>
      <div class="dice-inputs" style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">
        <label>Dice: <input id="dice-count" type="number" value="3" min="1" max="30" style="width:4rem;"></label>
        <label>Target: <input id="dice-target" type="number" value="8" min="1" max="12" style="width:4rem;"></label>
        <button id="dice-roll">Roll</button>
        <button id="dice-clear" class="secondary">Clear</button>
      </div>
      <div id="dice-faces" style="margin-bottom:0.75rem;"></div>
      <div id="dice-summary" style="font-size:1.1rem;color:var(--accent);"></div>
    </div>
  `;

  const countInput = container.querySelector('#dice-count');
  const targetInput = container.querySelector('#dice-target');
  const facesEl = container.querySelector('#dice-faces');
  const summaryEl = container.querySelector('#dice-summary');

  container.querySelector('#dice-roll').addEventListener('click', () => {
    const count = Math.max(1, parseInt(countInput.value, 10) || 1);
    const target = Math.max(1, Math.min(12, parseInt(targetInput.value, 10) || 8));
    const results = rollDice(count);
    const successes = countSuccesses(results, target);

    facesEl.innerHTML = results
      .map(r => `<span class="die${r >= target ? ' success' : ''}">${r}</span>`)
      .join('');
    summaryEl.textContent = `${successes} success${successes !== 1 ? 'es' : ''} out of ${count} ${count === 1 ? 'die' : 'dice'} (target ${target}+)`;
  });

  container.querySelector('#dice-clear').addEventListener('click', () => {
    facesEl.innerHTML = '';
    summaryEl.textContent = '';
  });
}

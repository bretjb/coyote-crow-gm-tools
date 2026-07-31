import { loadNameData, generateName } from './name-gen.js';

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function init(container) {
  container.innerHTML = `
    <h2 style="margin-bottom:1rem;">NPC Generator</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <button id="btn-quick">Quick NPC</button>
      <button id="btn-full" class="secondary">Full NPC</button>
    </div>
    <div id="npc-output"></div>
  `;

  let nameData, components;
  try {
    [nameData, components] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  container.querySelector('#btn-quick').addEventListener('click', () => {
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    renderQuickNpc(container.querySelector('#npc-output'), npc);
  });

  container.querySelector('#btn-full').addEventListener('click', () => {
    container.querySelector('#npc-output').innerHTML = '<p style="color:var(--muted);">Full NPC coming in next task.</p>';
  });
}

function renderQuickNpc(output, npc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.className = 'secondary';
  copyBtn.style.marginTop = '0.5rem';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(`${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  });
  card.appendChild(copyBtn);
  output.innerHTML = '';
  output.appendChild(card);
}

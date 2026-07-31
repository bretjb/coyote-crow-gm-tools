import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';

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

  let nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes;
  try {
    [nameData, components, motivations, paths, giftsAndBurdens, allSkills, abilities, archetypes] = await Promise.all([
      loadNameData(),
      loadJson('data/npc-components.json'),
      loadJson('data/motivations.json'),
      loadJson('data/paths.json'),
      loadJson('data/gifts-burdens.json'),
      loadJson('data/skills.json'),
      loadJson('data/abilities.json'),
      loadJson('data/archetypes.json'),
    ]);
  } catch {
    container.querySelector('#npc-output').innerHTML = '<p class="error">Data unavailable — please reload while online once to enable offline use.</p>';
    return;
  }

  const output = container.querySelector('#npc-output');

  container.querySelector('#btn-quick').addEventListener('click', () => {
    const npc = {
      name: generateName(nameData),
      role: pick(components.roles),
      personality: pick(components.personalities),
      motivation: pick(components.motivations),
    };
    output.innerHTML = '';
    output.appendChild(renderQuickCard(npc));
  });

  container.querySelector('#btn-full').addEventListener('click', () => {
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const npc = generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype });
    output.innerHTML = '';
    output.appendChild(renderFullCard(npc, allSkills));
  });
}

function generateFullNpc({ nameData, motivations, paths, giftsAndBurdens, allSkills, abilities, archetype }) {
  const stats = allocateStats(42, archetype.statPriorities);
  const skills = allocateSkills(42, allSkills, archetype.preferredSkills);
  return {
    name: generateName(nameData),
    motivation: pick(motivations),
    archetype: archetype.name,
    age: weightedPickDemographic(archetype.demographics.age),
    gender: weightedPickDemographic(archetype.demographics.gender),
    sexuality: weightedPickDemographic(archetype.demographics.sexuality),
    path: pick(paths),
    giftsAndBurdens: selectGiftsBurdens(giftsAndBurdens),
    stats,
    skills,
    ability: selectAbility(abilities, archetype.statPriorities),
    derived: calcDerivedStats(stats),
  };
}

function weightedPickDemographic(options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}

function renderQuickCard(npc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p><strong>Role:</strong> ${npc.role}</p>
    <p><strong>Personality:</strong> ${npc.personality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
  `;
  appendCopyBtn(card, `${npc.name}\nRole: ${npc.role}\nPersonality: ${npc.personality}\nMotivation: ${npc.motivation}`);
  return card;
}

function renderFullCard(npc, allSkills) {
  const card = document.createElement('div');
  card.className = 'card';

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(g => `${g.name} (${g.magnitude > 0 ? '+' : ''}${g.magnitude})`).join(', ')
    : 'None';

  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p style="color:var(--muted);margin-bottom:0.75rem;">${npc.archetype} · ${npc.age} · ${npc.gender} · ${npc.sexuality}</p>
    <p><strong>Motivation:</strong> ${npc.motivation}</p>
    <p><strong>Path:</strong> ${npc.path}</p>
    <p style="margin-bottom:0.75rem;"><strong>Gifts/Burdens:</strong> ${gb}</p>

    <h3 style="margin-bottom:0.5rem;">Stats</h3>
    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;margin-bottom:0.75rem;">
      ${Object.entries(npc.stats).map(([k, v]) => `
        <div style="background:var(--bg);padding:0.3rem 0.5rem;border-radius:3px;border:1px solid var(--border);">
          <span style="color:var(--muted);font-size:0.75rem;">${k}</span><br>
          <span style="font-size:1.1rem;color:var(--accent);">${v}</span>
        </div>`).join('')}
    </div>

    <h3 style="margin-bottom:0.5rem;">Derived</h3>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.3rem;margin-bottom:0.75rem;font-size:0.85rem;">
      ${Object.entries(npc.derived).map(([k, v]) => `
        <div><span style="color:var(--muted);">${k}:</span> <strong>${v}</strong></div>`).join('')}
    </div>

    <h3 style="margin-bottom:0.5rem;">Skills <span style="color:var(--muted);font-size:0.75rem;">(click to roll)</span></h3>
    <div id="skill-list" style="margin-bottom:0.75rem;"></div>
    <div id="skill-roll-result" style="margin-bottom:0.75rem;"></div>

    <h3 style="margin-bottom:0.25rem;">Ability</h3>
    <p style="margin-bottom:0.75rem;"><strong>${npc.ability.name}</strong> — ${npc.ability.description}
      <span style="color:var(--muted);font-size:0.8rem;">[${npc.ability.diceCheck.join(' + ')}]</span>
    </p>
  `;

  // Render skill buttons
  const skillList = card.querySelector('#skill-list');
  const rollResult = card.querySelector('#skill-roll-result');
  for (const [skillName, data] of Object.entries(npc.skills)) {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.style.cssText = 'margin:0.2rem;font-size:0.8rem;padding:0.3rem 0.6rem;';
    const specLabel = data.specialized ? ` [${data.specialized.name} ${data.specialized.rank}]` : '';
    btn.textContent = `${skillName} ${data.general}${specLabel}`;
    btn.dataset.skillName = skillName;
    skillList.appendChild(btn);
  }

  // Wire skill roll clicks using event delegation
  skillList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-skill-name]');
    if (!btn) return;
    const skillName = btn.dataset.skillName;
    const skillDef = allSkills.find(s => s.name === skillName);
    if (!skillDef) return;
    const poolSize = skillDef.diceCheck.reduce((sum, stat) => sum + (npc.stats[stat] || 0), 0);
    const results = rollDice(poolSize);
    const successes = countSuccesses(results, 8);
    const faces = results.map(r => `<span class="die${r >= 8 ? ' success' : ''}">${r}</span>`).join('');
    rollResult.innerHTML = `<strong>${skillName}</strong> (${poolSize} dice): ${faces} — <strong>${successes} success${successes !== 1 ? 'es' : ''}</strong>`;
  });

  appendCopyBtn(card, npcToText(npc));
  return card;
}

function appendCopyBtn(card, text) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary';
  btn.style.marginTop = '0.5rem';
  btn.addEventListener('click', () => navigator.clipboard.writeText(text));
  card.appendChild(btn);
}

function npcToText(npc) {
  const gb = npc.giftsAndBurdens.map(g => `${g.name} (${g.magnitude > 0 ? '+' : ''}${g.magnitude})`).join(', ') || 'None';
  const stats = Object.entries(npc.stats).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(npc.derived).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const skills = Object.entries(npc.skills).map(([k,d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  return `${npc.name}\n${npc.archetype} · ${npc.age} · ${npc.gender}\nMotivation: ${npc.motivation}\nPath: ${npc.path}\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}

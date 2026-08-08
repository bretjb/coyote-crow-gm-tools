import { loadNameData, generateName } from './name-gen.js';
import { allocateStats, calcDerivedStats, allocateSkills, selectGiftsBurdens, selectAbility } from './npc-character-gen.js';
import { rollDice, countSuccesses } from './dice.js';
import { addCombatant } from './initiative-state.js';

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
  const path = pick(paths);
  const stats = allocateStats(42, archetype.statPriorities);
  // Archetype grants +1 to its focus stat; path grants +1 to each of its two stats
  stats[archetype.statBonus]++;
  path.statBonuses.forEach(stat => { stats[stat]++; });

  const skills = allocateSkills(42, allSkills, archetype.preferredSkills);
  // Archetype grants a free rank in one of its two skill options
  const freeSkill = pick(archetype.freeSkillOptions);
  if (!skills[freeSkill]) skills[freeSkill] = { general: 1 };
  else skills[freeSkill].general++;

  return {
    name: generateName(nameData),
    motivation: pick(motivations),
    archetype: archetype.name,
    archetypeStatBonus: archetype.statBonus,
    freeSkill,
    age: weightedPickDemographic(archetype.demographics.age),
    gender: weightedPickDemographic(archetype.demographics.gender),
    sexuality: weightedPickDemographic(archetype.demographics.sexuality),
    path,
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
  appendInitiativeBtn(card, npc.name, null);
  return card;
}

function renderFullCard(npc, allSkills) {
  const card = document.createElement('div');
  card.className = 'card';

  const gb = npc.giftsAndBurdens.length > 0
    ? npc.giftsAndBurdens.map(gbLabel).join(', ')
    : 'None';

  card.innerHTML = `
    <h2>${npc.name}</h2>
    <p style="color:var(--muted);margin-bottom:0.25rem;">${npc.archetype} · ${npc.age} · ${npc.gender} · ${npc.sexuality}</p>
    <p style="color:var(--muted);font-size:0.8rem;margin-bottom:0.75rem;">+1 ${npc.archetypeStatBonus} · free rank: ${npc.freeSkill}</p>
    <p><strong>Motivation:</strong> ${npc.motivation.name}</p>
    <p><strong>Path:</strong> ${npc.path.name} <span style="color:var(--muted);font-size:0.85rem;">(+1 ${npc.path.statBonuses.join(', +1 ')})</span></p>
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

    <h3 style="margin:0.75rem 0 0.35rem;">General Skills <span style="color:var(--muted);font-size:0.75rem;font-weight:normal;">(click to roll)</span></h3>
    <div id="general-skill-table" class="skill-table-wrap"></div>
    <div id="spec-skill-section"></div>
    <div id="skill-roll-result" style="min-height:1.5rem;margin-bottom:0.75rem;"></div>

    <h3 style="margin-bottom:0.25rem;">Ability</h3>
    <p style="margin-bottom:0.75rem;"><strong>${npc.ability.name}</strong> — ${npc.ability.description}
      <span style="color:var(--muted);font-size:0.8rem;">[${npc.ability.diceCheck.join(' + ')}]</span>
    </p>
  `;

  // General skills table — all 28 skills, unranked rows muted
  const rollResult = card.querySelector('#skill-roll-result');
  card.querySelector('#general-skill-table').appendChild(
    buildSkillTable(allSkills, npc.stats, npc.skills)
  );

  // Specialized skills table — only if any exist
  const specEntries = Object.entries(npc.skills)
    .filter(([, d]) => d.specialized)
    .map(([generalName, d]) => ({ generalName, name: d.specialized.name, rank: d.specialized.rank }));
  if (specEntries.length > 0) {
    const sec = card.querySelector('#spec-skill-section');
    sec.innerHTML = '<h3 style="margin:0.75rem 0 0.35rem;">Specialized Skills</h3>';
    const wrap = document.createElement('div');
    wrap.className = 'skill-table-wrap';
    wrap.appendChild(buildSpecTable(allSkills, npc.stats, specEntries));
    sec.appendChild(wrap);
  }

  // Roll handler — shared by both tables
  card.addEventListener('click', e => {
    const row = e.target.closest('tr[data-pool]');
    if (!row) return;
    const pool = parseInt(row.dataset.pool, 10);
    const label = row.dataset.skillName;
    const results = rollDice(pool);
    const successes = countSuccesses(results, 8);
    const faces = results.map(r => `<span class="die${r >= 8 ? ' success' : ''}">${r}</span>`).join('');
    rollResult.innerHTML = `<strong>${label}</strong> (${pool} dice): ${faces} — <strong>${successes} success${successes !== 1 ? 'es' : ''}</strong>`;
  });

  appendCopyBtn(card, npcToText(npc));
  appendInitiativeBtn(card, npc.name, Math.min(12, npc.derived.Initiative));
  return card;
}

function skillPool(skillDef, stats, rank) {
  const vals = skillDef.diceCheck.map(s => stats[s] || 0);
  const higher = Math.max(...vals);
  const lower = Math.min(...vals);
  return rank >= 1 ? higher + rank : lower;
}

function buildSkillTable(allSkills, stats, acquiredSkills) {
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const skillDef of allSkills) {
    const acquired = acquiredSkills[skillDef.name];
    const rank = acquired ? acquired.general : 0;
    const vals = skillDef.diceCheck.map(s => stats[s] || 0);
    const higher = Math.max(...vals);
    const lower = Math.min(...vals);
    const usedVal = rank >= 1 ? higher : lower;
    const usedName = rank >= 1
      ? skillDef.diceCheck[vals.indexOf(higher)]
      : skillDef.diceCheck[vals.lastIndexOf(lower)];
    const pool = rank >= 1 ? higher + rank : lower;

    const tr = document.createElement('tr');
    if (rank === 0) tr.className = 'unranked';
    tr.dataset.pool = pool;
    tr.dataset.skillName = skillDef.name + (skillDef.requiresRank ? '*' : '');
    tr.innerHTML = `<td>${skillDef.name}${skillDef.requiresRank ? '<span style="color:var(--muted);">*</span>' : ''}</td><td>${usedName} ${usedVal}</td><td>${rank}</td><td>${pool}</td>`;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

function buildSpecTable(allSkills, stats, specEntries) {
  const table = document.createElement('table');
  table.className = 'skill-table';
  table.innerHTML = '<thead><tr><th>Skill</th><th>Stat</th><th>Rank</th><th>Total</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const { generalName, name, rank } of specEntries) {
    const skillDef = allSkills.find(s => s.name === generalName);
    if (!skillDef) continue;
    const vals = skillDef.diceCheck.map(s => stats[s] || 0);
    const higher = Math.max(...vals);
    const higherName = skillDef.diceCheck[vals.indexOf(higher)];
    const pool = higher + rank;

    const tr = document.createElement('tr');
    tr.dataset.pool = pool;
    tr.dataset.skillName = `${name} (${generalName})`;
    tr.innerHTML = `<td>${name} <span style="color:var(--muted);font-size:0.8rem;">${generalName}</span></td><td>${higherName} ${higher}</td><td>${rank}</td><td>${pool}</td>`;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  return table;
}

function appendCopyBtn(card, text) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.className = 'secondary';
  btn.style.marginTop = '0.5rem';
  btn.addEventListener('click', () => navigator.clipboard.writeText(text));
  card.appendChild(btn);
}

function appendInitiativeBtn(card, name, suggestedSlot) {
  const wrap = document.createElement('span');
  wrap.style.marginLeft = '0.5rem';
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '0.3rem';

  const btn = document.createElement('button');
  btn.textContent = 'Add to Initiative';
  btn.className = 'secondary';
  btn.style.marginTop = '0.5rem';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '12';
  input.style.width = '4rem';
  input.style.display = 'none';
  if (suggestedSlot != null) input.value = String(suggestedSlot);

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.style.display = 'none';
  confirmBtn.style.marginTop = '0.5rem';

  const status = document.createElement('span');
  status.style.color = 'var(--muted)';
  status.style.fontSize = '0.85rem';

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    input.style.display = '';
    confirmBtn.style.display = '';
    input.focus();
  });

  confirmBtn.addEventListener('click', () => {
    const slot = parseInt(input.value, 10);
    if (isNaN(slot) || slot < 1 || slot > 12) return;
    addCombatant(name, slot);
    input.style.display = 'none';
    confirmBtn.style.display = 'none';
    status.textContent = `Added to Initiative slot ${slot}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(status);
  card.appendChild(wrap);
}

function gbLabel(g) {
  const lvl = Math.abs(g.magnitude);
  const levelWord = lvl === 1 ? 'trivial' : lvl === 2 ? 'serious' : 'critical';
  const type = g.magnitude > 0 ? 'Gift' : 'Burden';
  return `${g.name} ${g.magnitude > 0 ? '+' : ''}${g.magnitude} ${type} (${levelWord})`;
}

function npcToText(npc) {
  const gb = npc.giftsAndBurdens.map(gbLabel).join(', ') || 'None';
  const stats = Object.entries(npc.stats).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const derived = Object.entries(npc.derived).map(([k,v]) => `  ${k}: ${v}`).join('\n');
  const skills = Object.entries(npc.skills).map(([k,d]) => {
    const spec = d.specialized ? ` [${d.specialized.name} ${d.specialized.rank}]` : '';
    return `  ${k} ${d.general}${spec}`;
  }).join('\n');
  return `${npc.name}\n${npc.archetype} (+1 ${npc.archetypeStatBonus}, free: ${npc.freeSkill}) · ${npc.age} · ${npc.gender} · ${npc.sexuality}\nMotivation: ${npc.motivation.name}\nPath: ${npc.path.name} (+1 ${npc.path.statBonuses.join(', +1 ')})\nGifts/Burdens: ${gb}\n\nStats:\n${stats}\n\nDerived:\n${derived}\n\nSkills:\n${skills}\n\nAbility: ${npc.ability.name} — ${npc.ability.description}`;
}

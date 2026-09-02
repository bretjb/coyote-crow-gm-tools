const STAT_NAMES = ['Strength','Agility','Endurance','Intelligence','Perception','Wisdom','Spirit','Charisma','Will'];
// STAT_COSTS[i] = total cost to reach stat value (i+1). e.g., STAT_COSTS[1]=3 means value 2 costs 3 total.
export const STAT_COSTS = [0, 3, 6, 10, 15];
// STAT_INCREMENT[i] = cost to go from value (i+1) to (i+2)
const STAT_INCREMENT = [3, 3, 4, 5];

// SKILL_COSTS[rank] = total cost to reach that rank. rank 0 = unranked (cost 0).
export const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];

export function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function clampStat(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

export function clampSkillRank(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 0;
  return Math.min(6, Math.max(0, n));
}

export function clampSpecRank(v, generalRank) {
  const min = Math.min(6, generalRank + 1);
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.min(6, Math.max(min, n));
}

export function allocateStats(budget, priorities) {
  const values = Object.fromEntries(STAT_NAMES.map(s => [s, 1]));
  let remaining = budget;

  while (remaining > 0) {
    const affordable = STAT_NAMES.filter(s => {
      const cur = values[s];
      return cur < 5 && STAT_INCREMENT[cur - 1] <= remaining;
    });
    if (affordable.length === 0) break;
    const weights = affordable.map(s => priorities.includes(s) ? 3 : 1);
    const chosen = weightedRandom(affordable, weights);
    remaining -= STAT_INCREMENT[values[chosen] - 1];
    values[chosen]++;
  }

  return values;
}

export function calcDerivedStats(s) {
  return {
    Initiative: s.Agility + s.Perception + s.Charisma,
    'Physical Defence': s.Agility + s.Endurance,
    'Mental Defence': s.Perception + s.Wisdom,
    'Mystical Defence': s.Charisma + s.Will,
    Body: s.Strength + s.Agility + s.Endurance,
    Mind: s.Intelligence + s.Perception + s.Wisdom,
    Soul: s.Spirit + s.Charisma + s.Will,
  };
}

export function allocateSkills(budget, allSkills, preferredNames) {
  const acquired = {}; // name -> { general, specialized?: { name, rank } }
  let remaining = budget;

  // Phase 1: buy general ranks
  while (remaining > 0) {
    const affordable = allSkills.filter(skill => {
      const cur = (acquired[skill.name]?.general) || 0;
      if (cur >= 6) return false;
      return (SKILL_COSTS[cur + 1] - SKILL_COSTS[cur]) <= remaining;
    });
    if (affordable.length === 0) break;

    const weights = affordable.map(s => preferredNames.includes(s.name) ? 3 : 1);
    const chosen = weightedRandom(affordable, weights);
    const cur = (acquired[chosen.name]?.general) || 0;
    const cost = SKILL_COSTS[cur + 1] - SKILL_COSTS[cur];
    remaining -= cost;
    if (!acquired[chosen.name]) acquired[chosen.name] = { general: 0 };
    acquired[chosen.name].general = cur + 1;
  }

  // Phase 2: buy specializations for eligible skills (general >= 1, 40% chance each)
  for (const [name, data] of Object.entries(acquired)) {
    if (data.general < 1 || remaining <= 0) continue;
    if (Math.random() > 0.4) continue;
    const skill = allSkills.find(s => s.name === name);
    if (!skill || !skill.specialized?.length) continue;

    // Spec rank must be higher than its general rank
    const minSpecRank = data.general + 1;
    if (minSpecRank > 6) continue;
    // Find highest affordable spec rank
    let buyRank = 0;
    for (let r = minSpecRank; r <= 6; r++) {
      if (SKILL_COSTS[r] <= remaining) buyRank = r;
    }
    if (buyRank === 0) continue;

    remaining -= SKILL_COSTS[buyRank];
    const specName = skill.specialized[Math.floor(Math.random() * skill.specialized.length)];
    data.specialized = { name: specName, rank: buyRank };
  }

  return acquired;
}

export function selectGiftsBurdens(pool) {
  // Count: 30% none, 50% one, 20% two
  const countWeights = [30, 50, 20];
  const count = weightedRandom([0, 1, 2], countWeights);
  if (count === 0 || pool.length === 0) return [];

  // Magnitude weights: ±1 = 35% each, ±2 = 7% each, ±3 = 1% each
  const magWeights = { 1: 35, '-1': 35, 2: 7, '-2': 7, 3: 1, '-3': 1 };
  const results = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    const magTotal = Object.values(magWeights).reduce((a, b) => a + b, 0);
    let r = Math.random() * magTotal;
    let chosenMag = 1;
    for (const [mag, w] of Object.entries(magWeights)) {
      r -= w;
      if (r <= 0) { chosenMag = parseInt(mag); break; }
    }
    const candidates = pool.filter(g => g.magnitude === chosenMag && !used.has(g.name));
    if (candidates.length === 0) continue;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    used.add(chosen.name);
    results.push(chosen);
  }

  return results;
}

export function selectAbility(abilities, priorities) {
  const weights = abilities.map(a => {
    const overlap = a.diceCheck.filter(s => priorities.includes(s)).length;
    return 1 + overlap * 2;
  });
  return weightedRandom(abilities, weights);
}

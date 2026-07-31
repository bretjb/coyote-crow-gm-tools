const STAT_NAMES = ['Strength','Agility','Endurance','Intelligence','Perception','Wisdom','Spirit','Charisma','Will'];
// STAT_COSTS[i] = total cost to reach stat value (i+1). e.g., STAT_COSTS[1]=3 means value 2 costs 3 total.
const STAT_COSTS = [0, 3, 6, 10, 15];
// STAT_INCREMENT[i] = cost to go from value (i+1) to (i+2)
const STAT_INCREMENT = [3, 3, 4, 5];

// SKILL_COSTS[rank] = total cost to reach that rank. rank 0 = unranked (cost 0).
const SKILL_COSTS = [0, 1, 3, 6, 10, 15, 21];

export function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
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

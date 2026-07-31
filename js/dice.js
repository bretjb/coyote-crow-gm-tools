export function rollDice(count) {
  return Array.from({ length: count }, () => Math.ceil(Math.random() * 12));
}

export function countSuccesses(results, target) {
  return results.filter(r => r >= target).length;
}

export function roll(count, target = 8) {
  const results = rollDice(count);
  return { results, successes: countSuccesses(results, target), target };
}

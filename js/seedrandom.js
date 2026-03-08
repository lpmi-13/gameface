/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Deterministic: same seed always produces same sequence.
 * Used to generate the same puzzle for everyone on a given day.
 */
function createRNG(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get a numeric seed from a date string like "2026-03-08".
 */
function dateSeed(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Shuffle an array in place using the seeded RNG.
 */
function seededShuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick a random element from an array using the seeded RNG.
 */
function seededPick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

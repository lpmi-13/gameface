/**
 * Codeword Puzzle Generator
 *
 * Generates a 13x13 codeword grid using:
 * 1. Predefined symmetric grid templates (black/white cell patterns)
 * 2. Backtracking word-filling algorithm
 * 3. Date-seeded random number generation for daily puzzles
 */

// Grid templates: 13x13, 1 = white cell, 0 = black cell.
//
// Invariants (enforced at runtime by isCleanGrid and by the regression tests in
// tests/generator.test.js):
//   - 180-degree rotational symmetry.
//   - Every white cell belongs to at least one across/down run of 3+ cells.
//   - No maximal run is exactly 2 cells long. A 2-cell run is never long enough
//     to become a word slot (slots require 3+ cells), so its two letters would
//     be dictated entirely by the crossing words and almost always spell a
//     non-word. Forbidding 2-cell runs is what keeps stray 2-letter "words" out
//     of generated puzzles.
//   - No maximal run is longer than 8 cells: the dictionary has no 9+ letter
//     words, so a longer slot could never be filled.
var GRID_TEMPLATES = [
  [
    "1111011101111",
    "1010111010001",
    "1111011111101",
    "0111010011100",
    "0101010111111",
    "1010111010101",
    "1111010101111",
    "1010101110101",
    "1111110101010",
    "0011100101110",
    "1011111101111",
    "1000101110101",
    "1111011101111"
  ],
  [
    "1110111011100",
    "0111011101010",
    "1110011111111",
    "0011110101010",
    "1110011101111",
    "1001110111010",
    "1110100010111",
    "0101110111001",
    "1111011100111",
    "0101010111100",
    "1111111100111",
    "0101011101110",
    "0011101110111"
  ],
  [
    "1110011111111",
    "1001111101010",
    "1010011111111",
    "0111010111110",
    "1110111010101",
    "1111010111001",
    "1111000001111",
    "1001110101111",
    "1010101110111",
    "0111110101110",
    "1111111100101",
    "0101011111001",
    "1111111100111"
  ]
];

const DAILY_THEME_WORD = 'BIRTANEM';

/**
 * Parse a grid template into a 2D array of booleans (true = white cell).
 * Also cleans up: any white cell not part of a 3+ letter run becomes black.
 */
function parseTemplate(template) {
  const grid = template.map(row => row.split('').map(c => c === '1'));
  const rows = grid.length;
  const cols = grid[0].length;

  // Mark which cells are in at least one 3+ run
  const inSlot = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Check horizontal runs
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      if (c < cols && grid[r][c]) {
        if (start === -1) start = c;
      } else {
        if (start !== -1 && c - start >= 3) {
          for (let k = start; k < c; k++) inSlot[r][k] = true;
        }
        start = -1;
      }
    }
  }

  // Check vertical runs
  for (let c = 0; c < cols; c++) {
    let start = -1;
    for (let r = 0; r <= rows; r++) {
      if (r < rows && grid[r][c]) {
        if (start === -1) start = r;
      } else {
        if (start !== -1 && r - start >= 3) {
          for (let k = start; k < r; k++) inSlot[k][c] = true;
        }
        start = -1;
      }
    }
  }

  // Turn orphan white cells black
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] && !inSlot[r][c]) {
        grid[r][c] = false;
      }
    }
  }

  return grid;
}

/**
 * Find every maximal run of white cells (horizontal and vertical), regardless
 * of length. A run of length 1 is a single white cell that only crosses a word
 * in the perpendicular direction.
 * Each run is { cells: [{r, c}, ...], direction: 'across'|'down' }.
 *
 * Works on both the boolean template grid and a filled letterGrid (where a cell
 * holds a letter string for white and null/undefined for black).
 */
function getMaximalRuns(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const runs = [];

  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      if (c < cols && grid[r][c]) {
        if (start === -1) start = c;
      } else {
        if (start !== -1) {
          const cells = [];
          for (let k = start; k < c; k++) cells.push({ r, c: k });
          runs.push({ cells, direction: 'across' });
        }
        start = -1;
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let start = -1;
    for (let r = 0; r <= rows; r++) {
      if (r < rows && grid[r][c]) {
        if (start === -1) start = r;
      } else {
        if (start !== -1) {
          const cells = [];
          for (let k = start; k < r; k++) cells.push({ r: k, c });
          runs.push({ cells, direction: 'down' });
        }
        start = -1;
      }
    }
  }

  return runs;
}

/**
 * Extract all word slots (horizontal and vertical) from a grid.
 * A slot is a maximal run of 3+ cells (a run of 2 is never a valid word, and a
 * run of 1 is just a crossing cell), so only runs of length >= 3 become slots.
 * Each slot is { cells: [{r, c}, ...], direction: 'across'|'down' }.
 */
function extractSlots(grid) {
  return getMaximalRuns(grid).filter(run => run.cells.length >= 3);
}

/**
 * A grid is "clean" when every maximal run is something we can actually fill
 * with a real word: no 2-cell runs (which would surface as 2-letter non-words)
 * and no runs longer than the longest available dictionary word (8). Single
 * cells are fine (they are crossed by a word the other way).
 *
 * This is a defensive runtime guard: a malformed template is skipped rather than
 * allowed to emit garbage, so the 2-letter-word bug can never reach players even
 * if a future template slips through review.
 */
function isCleanGrid(grid) {
  for (const run of getMaximalRuns(grid)) {
    const len = run.cells.length;
    if (len === 2 || len > 8) return false;
  }
  return true;
}

function getSlotIndicesByLength(slots, len) {
  const indices = [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].cells.length === len) {
      indices.push(i);
    }
  }
  return indices;
}

// Cap on search nodes per fill attempt. A clean (fully interlocked) grid is a
// tightly coupled CSP; rather than letting one attempt backtrack forever, we
// bail after this many nodes and let generatePuzzle restart with a fresh
// candidate order. Random restarts find a fill far faster than deep search.
var MAX_FILL_STEPS = 10000;

/**
 * Attempt to fill the grid with valid words using backtracking with forward
 * checking. Each slot keeps a live domain of candidate words; assigning a word
 * immediately filters the domains of the crossing slots, and an emptied domain
 * triggers a backtrack before we ever descend into it.
 *
 * This is much faster and more reliable than re-scanning the whole word list at
 * every node, which matters because the grids are now fully clean (no 2-cell
 * runs): those extra crossing constraints make naive backtracking thrash for
 * tens of seconds on some dates.
 *
 * `fixedSlots` is an optional list of { slotIdx, word } seeded before the search
 * (used to force the daily theme word). Returns the filled letterGrid, or null
 * if no fill was found within the step budget.
 */
function fillGrid(grid, slots, rng, fixedSlots) {
  const rows = grid.length;
  const cols = grid[0].length;
  const n = slots.length;

  // For each slot position, find the crossing slot/position that shares the cell.
  const cellOccupants = {};
  for (let i = 0; i < n; i++) {
    const cells = slots[i].cells;
    for (let p = 0; p < cells.length; p++) {
      const key = cells[p].r * 100 + cells[p].c; // r, c < 13 so this key is unique
      (cellOccupants[key] || (cellOccupants[key] = [])).push({ slot: i, pos: p });
    }
  }
  const crossings = Array.from({ length: n }, () => []);
  for (const key in cellOccupants) {
    const occupants = cellOccupants[key];
    for (const a of occupants) {
      for (const b of occupants) {
        if (a.slot !== b.slot) {
          crossings[a.slot].push({ pos: a.pos, other: b.slot, otherPos: b.pos });
        }
      }
    }
  }

  // domain[i] = candidate words still consistent with the assignments so far.
  const domain = new Array(n);
  for (let i = 0; i < n; i++) {
    domain[i] = getWordsOfLength(slots[i].cells.length).slice();
    if (domain[i].length === 0) return null; // a slot length with no dictionary words
  }

  const assigned = new Array(n).fill(null);
  const usedWords = new Set(); // prevent duplicate words across slots

  // Restrict a crossing slot's domain to words with `letter` at `pos`,
  // returning the removed words so the change can be undone on backtrack.
  function restrict(slot, pos, letter) {
    const current = domain[slot];
    const kept = [];
    const removed = [];
    for (const word of current) {
      if (word[pos] === letter) kept.push(word);
      else removed.push(word);
    }
    domain[slot] = kept;
    return removed;
  }

  // Permanently place a seed word and propagate to its crossings.
  function placeFixed(slotIdx, word) {
    if (!slots[slotIdx] || slots[slotIdx].cells.length !== word.length || usedWords.has(word)) {
      return false;
    }
    assigned[slotIdx] = word;
    usedWords.add(word);
    domain[slotIdx] = [word];
    for (const { pos, other, otherPos } of crossings[slotIdx]) {
      if (assigned[other]) {
        if (assigned[other][otherPos] !== word[pos]) return false;
        continue;
      }
      restrict(other, otherPos, word[pos]);
      if (domain[other].length === 0) return false;
    }
    return true;
  }

  for (const { slotIdx, word } of (fixedSlots || [])) {
    if (!placeFixed(slotIdx, word)) return null;
  }

  let steps = 0;

  function solve(numAssigned) {
    if (numAssigned === n) return true;
    if (++steps > MAX_FILL_STEPS) return false;

    // Most-constrained-variable heuristic: smallest remaining domain.
    let best = -1;
    let bestSize = Infinity;
    for (let i = 0; i < n; i++) {
      if (assigned[i]) continue;
      const size = domain[i].length;
      if (size < bestSize) {
        bestSize = size;
        best = i;
        if (size <= 1) break;
      }
    }
    if (best === -1) return true;
    if (bestSize === 0) return false;

    let candidates = domain[best].filter(w => !usedWords.has(w));
    seededShuffle(candidates, rng);
    if (candidates.length > 15) candidates = candidates.slice(0, 15);

    const cross = crossings[best];
    for (const word of candidates) {
      assigned[best] = word;
      usedWords.add(word);
      const savedDomain = domain[best];
      domain[best] = [word];

      const undo = [];
      let ok = true;
      for (const { pos, other, otherPos } of cross) {
        if (assigned[other]) continue;
        const removed = restrict(other, otherPos, word[pos]);
        undo.push({ slot: other, removed });
        if (domain[other].length === 0) {
          ok = false;
          break;
        }
      }

      if (ok && solve(numAssigned + 1)) return true;

      for (const u of undo) domain[u.slot] = domain[u.slot].concat(u.removed);
      domain[best] = savedDomain;
      assigned[best] = null;
      usedWords.delete(word);
    }

    return false;
  }

  if (!solve(usedWords.size)) return null;

  const letterGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (let i = 0; i < n; i++) {
    const word = assigned[i];
    const cells = slots[i].cells;
    for (let p = 0; p < cells.length; p++) {
      letterGrid[cells[p].r][cells[p].c] = word[p];
    }
  }
  return letterGrid;
}

/**
 * Assign code numbers (1-26) to letters found in the grid.
 * Returns a mapping: letter -> number.
 */
function assignCodeNumbers(letterGrid, rng) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const shuffled = [...alphabet];
  seededShuffle(shuffled, rng);

  const letterToNumber = {};
  for (let i = 0; i < shuffled.length; i++) {
    letterToNumber[shuffled[i]] = i + 1;
  }
  return letterToNumber;
}

/**
 * Choose initial revealed letters (3 hints spread across frequency).
 */
function chooseRevealedLetters(letterGrid, letterToNumber, rng) {
  const freq = {};
  for (const row of letterGrid) {
    for (const cell of row) {
      if (cell) freq[cell] = (freq[cell] || 0) + 1;
    }
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const revealed = new Set();

  if (sorted.length >= 6) {
    revealed.add(sorted[0][0]);
    revealed.add(sorted[Math.floor(sorted.length / 2)][0]);
    revealed.add(sorted[sorted.length - 1][0]);
  } else {
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      revealed.add(sorted[i][0]);
    }
  }

  return revealed;
}

/**
 * Generate a complete codeword puzzle for a given date.
 */
function generatePuzzle(dateStr) {
  const seed = dateSeed(dateStr);
  const rng = createRNG(seed);

  const templateIdx = Math.abs(seed) % GRID_TEMPLATES.length;

  // Try each template starting from the selected one
  for (let t = 0; t < GRID_TEMPLATES.length; t++) {
    const tIdx = (templateIdx + t) % GRID_TEMPLATES.length;
    const grid = parseTemplate(GRID_TEMPLATES[tIdx]);

    // Defensive guard: never fill a grid that would surface 2-letter non-words
    // (or unfillable over-long runs). Clean templates pass; a malformed one is
    // skipped rather than handed to players.
    if (!isCleanGrid(grid)) continue;

    const slots = extractSlots(grid);
    slots.sort((a, b) => b.cells.length - a.cells.length);
    const themeSlotIndices = getSlotIndicesByLength(slots, DAILY_THEME_WORD.length);

    if (themeSlotIndices.length === 0) continue;

    // Try multiple randomized restarts per template.
    for (let s = 0; s < 40; s++) {
      const slotOrder = [...themeSlotIndices];
      seededShuffle(slotOrder, createRNG(seed + t * 9973 + s * 7919));

      for (const slotIdx of slotOrder) {
        const attemptRng = createRNG(seed + t * 9973 + s * 7919 + slotIdx * 101);
        const letterGrid = fillGrid(
          grid,
          slots,
          attemptRng,
          [{ slotIdx, word: DAILY_THEME_WORD }]
        );

        if (letterGrid) {
          const letterToNumber = assignCodeNumbers(letterGrid, rng);
          const numberToLetter = {};
          for (const [letter, num] of Object.entries(letterToNumber)) {
            numberToLetter[num] = letter;
          }

          const revealedLetters = chooseRevealedLetters(letterGrid, letterToNumber, rng);

          return { grid, letterGrid, slots, letterToNumber, numberToLetter, revealedLetters };
        }
      }
    }
  }

  throw new Error('Failed to generate puzzle. Please try again.');
}

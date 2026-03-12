/**
 * Codeword Puzzle Generator
 *
 * Generates a 13x13 codeword grid using:
 * 1. Predefined symmetric grid templates (black/white cell patterns)
 * 2. Backtracking word-filling algorithm
 * 3. Date-seeded random number generation for daily puzzles
 */

// Grid templates: 13x13, 1 = white cell, 0 = black cell
// All templates have 180-degree rotational symmetry.
// Every white cell is part of at least one 3+ letter run (across or down).
var GRID_TEMPLATES = [
  [
    "1111011101111",
    "1110111011101",
    "1101110111011",
    "0111011101110",
    "1101110111011",
    "1110111011101",
    "1111011101111",
    "1011101110111",
    "1101110111011",
    "0111011101110",
    "1101110111011",
    "1011101110111",
    "1111011101111"
  ],
  [
    "1110111011101",
    "1101110111011",
    "1111011101111",
    "0110111011010",
    "1111011101111",
    "1101110111011",
    "1110101010111",
    "1101110111011",
    "1111011101111",
    "0101011101100",
    "1111011101111",
    "1101110111011",
    "1011101110111"
  ],
  [
    "1111011101111",
    "1101110111011",
    "1110111011101",
    "0111011101110",
    "1110111011101",
    "1101110111011",
    "1011101011101",
    "1101110111011",
    "1011101110111",
    "0111011101110",
    "1011101110111",
    "1101110111011",
    "1111011101111"
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
 * Extract all word slots (horizontal and vertical) from a grid.
 * Each slot is { cells: [{r, c}, ...], direction: 'across'|'down' }
 */
function extractSlots(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const slots = [];

  // Horizontal slots
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      if (c < cols && grid[r][c]) {
        if (start === -1) start = c;
      } else {
        if (start !== -1 && c - start >= 3) {
          const cells = [];
          for (let k = start; k < c; k++) cells.push({ r, c: k });
          slots.push({ cells, direction: 'across' });
        }
        start = -1;
      }
    }
  }

  // Vertical slots
  for (let c = 0; c < cols; c++) {
    let start = -1;
    for (let r = 0; r <= rows; r++) {
      if (r < rows && grid[r][c]) {
        if (start === -1) start = r;
      } else {
        if (start !== -1 && r - start >= 3) {
          const cells = [];
          for (let k = start; k < r; k++) cells.push({ r: k, c });
          slots.push({ cells, direction: 'down' });
        }
        start = -1;
      }
    }
  }

  return slots;
}

/**
 * Build a pattern string for a slot given current grid state.
 */
function getSlotPattern(slot, letterGrid) {
  return slot.cells.map(({ r, c }) => letterGrid[r][c] || '.').join('');
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

/**
 * Attempt to fill the grid with valid words using backtracking.
 * Returns the filled letterGrid or null if failed.
 */
function fillGrid(grid, slots, rng, maxAttempts, fixedSlots) {
  const rows = grid.length;
  const cols = grid[0].length;
  const letterGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const assignments = fixedSlots || [];

  // Build cell-to-slots mapping
  const cellToSlots = {};
  for (let i = 0; i < slots.length; i++) {
    for (const { r, c } of slots[i].cells) {
      const key = `${r},${c}`;
      if (!cellToSlots[key]) cellToSlots[key] = [];
      cellToSlots[key].push(i);
    }
  }

  const filledSlots = new Set();
  const usedWords = new Set(); // Prevent duplicate words
  let attempts = 0;

  function applyFixedSlots() {
    for (const assignment of assignments) {
      const slot = slots[assignment.slotIdx];
      if (!slot || slot.cells.length !== assignment.word.length || usedWords.has(assignment.word)) {
        return false;
      }

      for (let i = 0; i < slot.cells.length; i++) {
        const { r, c } = slot.cells[i];
        const existing = letterGrid[r][c];
        if (existing && existing !== assignment.word[i]) {
          return false;
        }
        letterGrid[r][c] = assignment.word[i];
      }

      filledSlots.add(assignment.slotIdx);
      usedWords.add(assignment.word);
    }

    for (let i = 0; i < slots.length; i++) {
      if (filledSlots.has(i)) continue;
      const pattern = getSlotPattern(slots[i], letterGrid);
      const candidates = getCandidates(pattern).filter(w => !usedWords.has(w));
      if (candidates.length === 0) {
        return false;
      }
    }

    return true;
  }

  function getMostConstrainedSlot() {
    let bestIdx = -1;
    let bestCount = Infinity;

    for (let i = 0; i < slots.length; i++) {
      if (filledSlots.has(i)) continue;
      const pattern = getSlotPattern(slots[i], letterGrid);
      const candidates = getCandidates(pattern).filter(w => !usedWords.has(w));
      if (candidates.length === 0) return { idx: i, count: 0 };
      if (candidates.length < bestCount) {
        bestCount = candidates.length;
        bestIdx = i;
      }
    }

    return { idx: bestIdx, count: bestCount };
  }

  function solve() {
    attempts++;
    if (attempts > maxAttempts) return false;
    if (filledSlots.size === slots.length) return true;

    const { idx, count } = getMostConstrainedSlot();
    if (idx === -1) return true;
    if (count === 0) return false;

    const slot = slots[idx];
    const pattern = getSlotPattern(slot, letterGrid);
    let candidates = getCandidates(pattern).filter(w => !usedWords.has(w));

    seededShuffle(candidates, rng);
    if (candidates.length > 25) candidates = candidates.slice(0, 25);

    for (const word of candidates) {
      // Place letters
      const saved = [];
      for (let i = 0; i < slot.cells.length; i++) {
        const { r, c } = slot.cells[i];
        saved.push(letterGrid[r][c]);
        letterGrid[r][c] = word[i];
      }

      // Check crossing slots still have candidates
      let crossingsOk = true;
      for (const { r, c } of slot.cells) {
        const key = `${r},${c}`;
        for (const crossIdx of (cellToSlots[key] || [])) {
          if (crossIdx === idx || filledSlots.has(crossIdx)) continue;
          const crossPattern = getSlotPattern(slots[crossIdx], letterGrid);
          if (getCandidates(crossPattern).filter(w => !usedWords.has(w)).length === 0) {
            crossingsOk = false;
            break;
          }
        }
        if (!crossingsOk) break;
      }

      if (crossingsOk) {
        filledSlots.add(idx);
        usedWords.add(word);

        if (solve()) return true;

        filledSlots.delete(idx);
        usedWords.delete(word);
      }

      // Restore
      for (let i = 0; i < slot.cells.length; i++) {
        const { r, c } = slot.cells[i];
        letterGrid[r][c] = saved[i];
      }
    }

    return false;
  }

  if (!applyFixedSlots()) return null;
  return solve() ? letterGrid : null;
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
    const slots = extractSlots(grid);
    slots.sort((a, b) => b.cells.length - a.cells.length);
    const themeSlotIndices = getSlotIndicesByLength(slots, DAILY_THEME_WORD.length);

    if (themeSlotIndices.length === 0) continue;

    // Try multiple seeds per template
    for (let s = 0; s < 8; s++) {
      const slotOrder = [...themeSlotIndices];
      seededShuffle(slotOrder, createRNG(seed + t * 9973 + s * 7919));

      for (const slotIdx of slotOrder) {
        const attemptRng = createRNG(seed + t * 9973 + s * 7919 + slotIdx * 101);
        const letterGrid = fillGrid(
          grid,
          slots,
          attemptRng,
          60000,
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

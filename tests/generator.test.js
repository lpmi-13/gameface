const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadGeneratorContext() {
  const sandbox = { console };
  vm.createContext(sandbox);

  for (const file of ['js/words.js', 'js/seedrandom.js', 'js/generator.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }

  return sandbox;
}

function getSlotWords(puzzle) {
  return puzzle.slots.map(slot =>
    slot.cells.map(({ r, c }) => puzzle.letterGrid[r][c]).join('')
  );
}

function runWord(grid, run) {
  return run.cells.map(({ r, c }) => grid[r][c]).join('');
}

function eachDayOf(year, months) {
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dates = [];
  for (const m of months) {
    for (let d = 1; d <= lengths[m - 1]; d++) {
      dates.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return dates;
}

test('BIRTANEM is available as a fill candidate', () => {
  const sandbox = loadGeneratorContext();
  const candidates = sandbox.getCandidates('BIRTANEM');
  assert.ok(candidates.includes('BIRTANEM'));
});

test('theme word still appears when the date initially selects a template with no 8-letter slot', () => {
  const sandbox = loadGeneratorContext();
  const selectedTemplate = Math.abs(sandbox.dateSeed('2026-03-14')) % sandbox.GRID_TEMPLATES.length;
  const templateSlots = sandbox.extractSlots(sandbox.parseTemplate(sandbox.GRID_TEMPLATES[selectedTemplate]));
  const puzzle = sandbox.generatePuzzle('2026-03-14');

  assert.equal(selectedTemplate, 0);
  assert.equal(templateSlots.some(slot => slot.cells.length === 8), false);
  assert.ok(getSlotWords(puzzle).includes('BIRTANEM'));
});

test('every March 2026 puzzle includes BIRTANEM', { timeout: 30000 }, () => {
  const sandbox = loadGeneratorContext();

  for (let day = 1; day <= 31; day++) {
    const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
    const puzzle = sandbox.generatePuzzle(dateStr);
    assert.ok(getSlotWords(puzzle).includes('BIRTANEM'), dateStr);
  }
});

// --- Regression: stray 2-letter "words" (https://wodecords.com June 14 2026) ---
//
// A 2-cell run is never long enough to be a word slot, so the generator would
// fill those two cells purely from the crossing words and almost always spell a
// non-word (UW, KA, XO, ...). The root-cause guard below proves no template can
// produce such a run; the end-to-end guards prove no generated puzzle does.

test('grid templates contain no run that would become a non-word', () => {
  const sandbox = loadGeneratorContext();

  for (let t = 0; t < sandbox.GRID_TEMPLATES.length; t++) {
    const template = sandbox.GRID_TEMPLATES[t];

    // 13x13 with 180-degree rotational symmetry.
    assert.equal(template.length, 13, `template ${t} should have 13 rows`);
    for (let r = 0; r < 13; r++) {
      assert.equal(template[r].length, 13, `template ${t} row ${r} should have 13 cols`);
      for (let c = 0; c < 13; c++) {
        assert.equal(template[r][c], template[12 - r][12 - c],
          `template ${t} is not rotationally symmetric at ${r},${c}`);
      }
    }

    const grid = sandbox.parseTemplate(template);
    const runs = sandbox.getMaximalRuns(grid);

    for (const run of runs) {
      const len = run.cells.length;
      // No 2-cell runs (the bug) and nothing longer than the longest word (8).
      assert.notEqual(len, 2, `template ${t} has a 2-cell run`);
      assert.ok(len <= 8, `template ${t} has a ${len}-cell run; no word is that long`);
    }

    // Every white cell belongs to at least one 3+ run (no orphans).
    const inSlot = new Set();
    for (const run of runs) {
      if (run.cells.length >= 3) {
        for (const { r, c } of run.cells) inSlot.add(`${r},${c}`);
      }
    }
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (grid[r][c]) {
          assert.ok(inSlot.has(`${r},${c}`), `template ${t} cell ${r},${c} is in no 3+ run`);
        }
      }
    }

    assert.ok(sandbox.isCleanGrid(grid), `template ${t} should pass the isCleanGrid guard`);
  }
});

test('generated puzzles never contain a 2-letter entry, and every entry is a real word',
  { timeout: 60000 }, () => {
    const sandbox = loadGeneratorContext();
    // A broad span across the year, including the originally reported June puzzle.
    for (const dateStr of eachDayOf(2026, [1, 6, 10])) {
      const puzzle = sandbox.generatePuzzle(dateStr);
      for (const run of sandbox.getMaximalRuns(puzzle.letterGrid)) {
        const word = runWord(puzzle.letterGrid, run);
        assert.notEqual(run.cells.length, 2, `${dateStr} has a 2-letter entry "${word}"`);
        if (run.cells.length >= 3) {
          assert.ok(sandbox.getCandidates(word).includes(word),
            `${dateStr} entry "${word}" is not a dictionary word`);
        }
      }
    }
  });

test('the reported June 14 2026 puzzle has no 2-letter non-words', () => {
  const sandbox = loadGeneratorContext();
  const puzzle = sandbox.generatePuzzle('2026-06-14');
  const twoLetterEntries = sandbox.getMaximalRuns(puzzle.letterGrid)
    .filter(run => run.cells.length === 2)
    .map(run => runWord(puzzle.letterGrid, run));
  assert.equal(twoLetterEntries.length, 0,
    `expected no 2-letter entries but found: ${twoLetterEntries.join(', ')}`);
});

// --- Codeword pangram guarantee ---
//
// A codeword replaces each of the 26 letters with a distinct number 1-26. If a
// puzzle omitted a letter, that number would never appear in the grid and could
// never be deduced, and the A-Z letter strip would keep a permanent blank. Every
// generated grid must therefore use all 26 letters.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function missingLetters(puzzle) {
  const present = new Set();
  for (const row of puzzle.letterGrid) {
    for (const cell of row) {
      if (cell) present.add(cell);
    }
  }
  return ALPHABET.filter(letter => !present.has(letter));
}

test('isPangram is true only when all 26 letters are present', () => {
  const sandbox = loadGeneratorContext();
  const full = ALPHABET.map(letter => [letter]);
  assert.equal(sandbox.isPangram(full), true);

  const short = full.slice();
  short[0] = [null]; // drop the "A"
  assert.equal(sandbox.isPangram(short), false);
});

test('every generated puzzle uses all 26 letters (valid codeword)',
  { timeout: 120000 }, () => {
    const sandbox = loadGeneratorContext();
    const allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const dateStr of eachDayOf(2026, allMonths)) {
      const puzzle = sandbox.generatePuzzle(dateStr);
      assert.deepEqual(missingLetters(puzzle), [],
        `${dateStr} is missing letters: ${missingLetters(puzzle).join(', ')}`);
    }
  });

test('a date that previously dropped many letters is now a pangram', () => {
  const sandbox = loadGeneratorContext();
  // 2025-03-15 used to omit F, J, K, Q, V, X and Z.
  const puzzle = sandbox.generatePuzzle('2025-03-15');
  assert.deepEqual(missingLetters(puzzle), []);
});

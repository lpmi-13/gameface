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

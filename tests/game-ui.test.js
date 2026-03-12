const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const { FakeStorage, createGameDocument, dispatch } = require('./helpers/fake-dom');

function createFixedDateClass(isoString) {
  const RealDate = Date;

  return class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoString);
      } else {
        super(...args);
      }
    }

    static now() {
      return new RealDate(isoString).getTime();
    }
  };
}

function createPuzzle() {
  const grid = Array.from({ length: 13 }, () => Array(13).fill(false));
  const letterGrid = Array.from({ length: 13 }, () => Array(13).fill(null));

  grid[0][0] = true;
  grid[0][1] = true;
  grid[0][2] = true;
  grid[1][0] = true;

  letterGrid[0][0] = 'A';
  letterGrid[0][1] = 'B';
  letterGrid[0][2] = 'A';
  letterGrid[1][0] = 'C';

  return {
    grid,
    letterGrid,
    slots: [],
    letterToNumber: { A: 1, B: 2, C: 3 },
    numberToLetter: { 1: 'A', 2: 'B', 3: 'C' },
    revealedLetters: new Set()
  };
}

function setupGame(options = {}) {
  const document = createGameDocument();
  const localStorage = new FakeStorage();
  const puzzle = options.puzzle || createPuzzle();

  if (options.savedState) {
    localStorage.setItem('codeword-state', JSON.stringify(options.savedState));
  }

  const sandbox = {
    console,
    document,
    window: null,
    localStorage,
    confirm: () => options.confirmResult ?? true,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    Date: createFixedDateClass(options.isoDate || '2026-03-12T12:00:00Z'),
    generatePuzzle: () => puzzle
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'js/game.js' });

  return {
    document,
    localStorage,
    grid: document.getElementById('grid'),
    entryInput: document.getElementById('entry-input'),
    revealAllButton: document.getElementById('btn-reveal-all')
  };
}

function getCell(grid, row, col) {
  return grid.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function getLetter(cell) {
  const letterEl = cell.querySelector('.letter');
  return letterEl ? letterEl.textContent : '';
}

test('clicking a cell focuses the entry input, positions it on the cell, and typing fills matching codes', () => {
  const { document, localStorage, grid, entryInput } = setupGame();
  const firstCell = getCell(grid, 0, 0);
  const rect = firstCell.getBoundingClientRect();

  dispatch(firstCell, 'click');
  assert.equal(document.activeElement, entryInput);
  assert.equal(entryInput.style.left, `${rect.left}px`);
  assert.equal(entryInput.style.top, `${rect.top}px`);
  assert.equal(entryInput.style.width, `${rect.width}px`);
  assert.equal(entryInput.style.height, `${rect.height}px`);
  assert.equal(entryInput.style.opacity, '0.01');
  assert.equal(entryInput.style.pointerEvents, 'auto');

  entryInput.value = 'a';
  dispatch(entryInput, 'input');

  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');
  assert.equal(getLetter(getCell(grid, 0, 2)), 'A');

  const selectedCell = grid.querySelector('.cell.selected');
  assert.equal(String(selectedCell.dataset.row), '0');
  assert.equal(String(selectedCell.dataset.col), '1');

  const savedState = JSON.parse(localStorage.getItem('codeword-state'));
  assert.equal(savedState.userGuesses['1'], 'A');
});

test('backspace clears the selected code assignment', () => {
  const { grid, entryInput } = setupGame();
  const firstCell = getCell(grid, 0, 0);

  dispatch(firstCell, 'click');
  entryInput.value = 'A';
  dispatch(entryInput, 'input');

  dispatch(firstCell, 'click');
  dispatch(entryInput, 'keydown', { key: 'Backspace' });

  assert.equal(getLetter(getCell(grid, 0, 0)), '');
  assert.equal(getLetter(getCell(grid, 0, 2)), '');
});

test('revealing the full solution blurs the entry input', () => {
  const { document, grid, entryInput, revealAllButton } = setupGame({ confirmResult: true });
  const firstCell = getCell(grid, 0, 0);

  dispatch(firstCell, 'click');
  assert.equal(document.activeElement, entryInput);

  dispatch(revealAllButton, 'click');

  assert.notEqual(document.activeElement, entryInput);
  assert.equal(entryInput.style.opacity, '0');
  assert.equal(entryInput.style.pointerEvents, 'none');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');
  assert.equal(getLetter(getCell(grid, 0, 1)), 'B');
  assert.equal(getLetter(getCell(grid, 1, 0)), 'C');
});

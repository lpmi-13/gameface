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
    revealAllButton: document.getElementById('btn-reveal-all'),
    revealLetterButton: document.getElementById('btn-reveal-letter'),
    undoButton: document.getElementById('btn-undo'),
    resetButton: document.getElementById('btn-reset'),
    checkButton: document.getElementById('btn-check'),
    timerToggle: document.getElementById('timer-toggle'),
    infoButton: document.getElementById('btn-info'),
    infoDialog: document.getElementById('info-dialog'),
    infoClose: document.getElementById('info-close'),
    message: document.getElementById('message'),
    messageText: document.getElementById('message-text'),
    strip: document.getElementById('letter-strip')
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

function typeAt(grid, entryInput, row, col, letter) {
  dispatch(getCell(grid, row, col), 'click');
  entryInput.value = letter;
  dispatch(entryInput, 'input');
}

test('reset returns the puzzle to its starting configuration', () => {
  const puzzle = createPuzzle();
  puzzle.revealedLetters = new Set(['C']);
  const { localStorage, grid, entryInput, revealLetterButton, resetButton } = setupGame({ puzzle });

  assert.equal(getLetter(getCell(grid, 1, 0)), 'C');

  typeAt(grid, entryInput, 0, 0, 'A');
  typeAt(grid, entryInput, 0, 1, 'X');
  dispatch(revealLetterButton, 'click');

  dispatch(resetButton, 'click');

  assert.equal(getLetter(getCell(grid, 0, 0)), '');
  assert.equal(getLetter(getCell(grid, 0, 1)), '');
  assert.equal(getLetter(getCell(grid, 1, 0)), 'C');
  assert.ok(getCell(grid, 1, 0).classList.contains('revealed'));
  assert.deepEqual([...puzzle.revealedLetters], ['C']);

  const savedState = JSON.parse(localStorage.getItem('codeword-state'));
  assert.deepEqual(savedState.userGuesses, { 3: 'C' });
  assert.equal(savedState.gameComplete, false);
});

test('reset does nothing when the confirmation is declined', () => {
  const { grid, entryInput, resetButton } = setupGame({ confirmResult: false });

  typeAt(grid, entryInput, 0, 0, 'A');
  dispatch(resetButton, 'click');

  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');
});

test('undo reverts actions one at a time', () => {
  const { grid, entryInput, undoButton } = setupGame();

  assert.equal(undoButton.disabled, true);

  typeAt(grid, entryInput, 0, 0, 'A');
  typeAt(grid, entryInput, 0, 1, 'B');
  assert.equal(undoButton.disabled, false);

  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');
  assert.equal(getLetter(getCell(grid, 0, 1)), '');

  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), '');
  assert.equal(undoButton.disabled, true);
});

test('undo restores a letter moved from another code', () => {
  const { grid, entryInput, undoButton } = setupGame();

  typeAt(grid, entryInput, 0, 0, 'A');
  typeAt(grid, entryInput, 0, 1, 'A');
  assert.equal(getLetter(getCell(grid, 0, 0)), '');
  assert.equal(getLetter(getCell(grid, 0, 1)), 'A');

  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');
  assert.equal(getLetter(getCell(grid, 0, 1)), '');
});

test('undo reverts a deletion, a reset, and revealing the solution', () => {
  const { grid, entryInput, undoButton, resetButton, revealAllButton } = setupGame();

  typeAt(grid, entryInput, 0, 0, 'A');
  dispatch(getCell(grid, 0, 0), 'click');
  dispatch(entryInput, 'keydown', { key: 'Backspace' });
  assert.equal(getLetter(getCell(grid, 0, 0)), '');

  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');

  dispatch(resetButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), '');
  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');

  dispatch(revealAllButton, 'click');
  assert.equal(getLetter(getCell(grid, 1, 0)), 'C');
  dispatch(undoButton, 'click');
  assert.equal(getLetter(getCell(grid, 0, 1)), '');
  assert.equal(getLetter(getCell(grid, 1, 0)), '');

  // Input works again after undoing the solution reveal
  typeAt(grid, entryInput, 0, 1, 'B');
  assert.equal(getLetter(getCell(grid, 0, 1)), 'B');
});

function getStripItem(strip, letter) {
  return strip.querySelector(`.strip-item[data-letter="${letter}"]`);
}

test('the info button opens the guide, and the close button or backdrop dismisses it', () => {
  const { document, infoButton, infoDialog, infoClose } = setupGame();

  dispatch(infoButton, 'click');
  assert.equal(infoDialog.open, true);

  dispatch(infoClose, 'click');
  assert.equal(infoDialog.open, false);

  // Clicks inside the guide's content leave it open
  const content = document.createElement('p');
  infoDialog.appendChild(content);
  dispatch(infoButton, 'click');
  dispatch(content, 'click');
  assert.equal(infoDialog.open, true);

  // Clicks on the backdrop target the dialog itself
  dispatch(infoDialog, 'click');
  assert.equal(infoDialog.open, false);
});

test('check marks right letters and crosses out wrong ones', () => {
  const { grid, entryInput, checkButton, message, messageText } = setupGame();

  typeAt(grid, entryInput, 0, 0, 'A');
  typeAt(grid, entryInput, 0, 1, 'X');
  dispatch(checkButton, 'click');

  assert.ok(getCell(grid, 0, 0).classList.contains('correct-check'));
  assert.ok(getCell(grid, 0, 2).classList.contains('correct-check'));
  assert.ok(getCell(grid, 0, 1).classList.contains('error-check'));
  assert.ok(!getCell(grid, 1, 0).classList.contains('correct-check'));
  assert.ok(!getCell(grid, 1, 0).classList.contains('error-check'));

  assert.ok(message.classList.contains('is-visible'));
  assert.ok(message.classList.contains('toast--error'));
  assert.match(messageText.textContent, /wrong/);
});

test('the letter key shows placed and given letters and tracks the selected square', () => {
  const puzzle = createPuzzle();
  puzzle.revealedLetters = new Set(['C']);
  const { grid, entryInput, strip } = setupGame({ puzzle });

  const itemC = getStripItem(strip, 'C');
  assert.ok(itemC.classList.contains('used'));
  assert.ok(itemC.classList.contains('locked'));
  assert.equal(itemC.querySelector('.strip-number').textContent, '3');
  assert.equal(itemC.getAttribute('aria-label'), 'C: number 3');
  assert.equal(getStripItem(strip, 'B').getAttribute('aria-label'), 'B: not placed');

  typeAt(grid, entryInput, 0, 0, 'A');
  const itemA = getStripItem(strip, 'A');
  assert.ok(itemA.classList.contains('used'));
  assert.ok(!itemA.classList.contains('locked'));
  assert.equal(itemA.querySelector('.strip-number').textContent, '1');

  // Typing moved the selection to an empty square
  assert.equal(strip.querySelector('.strip-item.active'), null);

  dispatch(getCell(grid, 0, 0), 'click');
  assert.equal(strip.querySelector('.strip-item.active'), getStripItem(strip, 'A'));
});

test('revealing the solution stops the timer and disables help actions until undone', () => {
  const {
    entryInput,
    checkButton,
    revealLetterButton,
    revealAllButton,
    timerToggle,
    undoButton
  } = setupGame();

  dispatch(timerToggle, 'click');
  assert.equal(timerToggle.textContent, 'Pause');

  dispatch(revealAllButton, 'click');
  assert.equal(timerToggle.textContent, 'Start');
  for (const button of [checkButton, revealLetterButton, revealAllButton, timerToggle]) {
    assert.equal(button.disabled, true);
  }
  assert.equal(entryInput.tabIndex, -1);

  dispatch(undoButton, 'click');
  for (const button of [checkButton, revealLetterButton, revealAllButton, timerToggle]) {
    assert.equal(button.disabled, false);
  }
  assert.equal(entryInput.tabIndex, 0);
});

test('focusing the entry input with the keyboard selects the first square', () => {
  const { grid, entryInput } = setupGame();

  assert.equal(grid.querySelector('.cell.selected'), null);
  dispatch(entryInput, 'focus');

  const selectedCell = grid.querySelector('.cell.selected');
  assert.equal(String(selectedCell.dataset.row), '0');
  assert.equal(String(selectedCell.dataset.col), '0');
});

test('Ctrl+Z and Cmd+Z undo the last change', () => {
  const { grid, entryInput } = setupGame();

  typeAt(grid, entryInput, 0, 0, 'A');
  typeAt(grid, entryInput, 0, 1, 'B');

  dispatch(entryInput, 'keydown', { key: 'z', ctrlKey: true });
  assert.equal(getLetter(getCell(grid, 0, 1)), '');
  assert.equal(getLetter(getCell(grid, 0, 0)), 'A');

  dispatch(entryInput, 'keydown', { key: 'z', metaKey: true });
  assert.equal(getLetter(getCell(grid, 0, 0)), '');
});

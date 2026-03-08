/**
 * Codeword Game UI and Interaction Logic
 */

(function() {
  'use strict';

  // --- State ---
  let puzzle = null;
  let selectedCell = null; // {r, c}
  let userGuesses = {}; // codeNumber -> letter (user's guesses)
  let timerInterval = null;
  let timerSeconds = 0;
  let timerRunning = false;
  let gameComplete = false;

  // --- DOM refs ---
  const gridEl = document.getElementById('grid');
  const stripEl = document.getElementById('letter-strip');
  const timerDisplay = document.getElementById('timer-display');
  const timerToggle = document.getElementById('timer-toggle');
  const timerReset = document.getElementById('timer-reset');
  const btnCheck = document.getElementById('btn-check');
  const btnRevealLetter = document.getElementById('btn-reveal-letter');
  const btnRevealAll = document.getElementById('btn-reveal-all');
  const messageEl = document.getElementById('message');
  const loadingEl = document.getElementById('loading');
  const gameContainer = document.getElementById('game-container');
  const dateEl = document.getElementById('puzzle-date');

  // --- Init ---
  function init() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Display date
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = today.toLocaleDateString('en-US', options);

    // Load saved state or generate new puzzle
    const savedState = loadState(dateStr);

    try {
      puzzle = generatePuzzle(dateStr);
    } catch (e) {
      loadingEl.textContent = 'Error generating puzzle. Please refresh the page.';
      console.error(e);
      return;
    }

    if (savedState && savedState.dateStr === dateStr) {
      userGuesses = savedState.userGuesses || {};
      timerSeconds = savedState.timerSeconds || 0;
      gameComplete = savedState.gameComplete || false;
    } else {
      // Initialize with revealed letters
      userGuesses = {};
      for (const letter of puzzle.revealedLetters) {
        const num = puzzle.letterToNumber[letter];
        userGuesses[num] = letter;
      }
      timerSeconds = 0;
      gameComplete = false;
    }

    loadingEl.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    renderGrid();
    renderStrip();
    updateTimerDisplay();
    bindEvents();

    if (gameComplete) {
      showMessage('Puzzle complete! Well done!', 'success');
    }
  }

  // --- Rendering ---
  function renderGrid() {
    gridEl.innerHTML = '';

    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.row = r;
        cell.dataset.col = c;

        if (!puzzle.grid[r][c]) {
          cell.classList.add('black');
        } else {
          const solutionLetter = puzzle.letterGrid[r][c];
          const codeNum = puzzle.letterToNumber[solutionLetter];

          // Code number label
          const numSpan = document.createElement('span');
          numSpan.classList.add('code-number');
          numSpan.textContent = codeNum;
          cell.appendChild(numSpan);

          // Letter display
          const letterSpan = document.createElement('span');
          letterSpan.classList.add('letter');
          cell.appendChild(letterSpan);

          // Show guessed letter
          if (userGuesses[codeNum]) {
            letterSpan.textContent = userGuesses[codeNum];
            if (puzzle.revealedLetters.has(solutionLetter) &&
                userGuesses[codeNum] === solutionLetter) {
              cell.classList.add('revealed');
            }
          }

          cell.dataset.code = codeNum;
        }

        gridEl.appendChild(cell);
      }
    }

    updateHighlights();
  }

  function renderStrip() {
    stripEl.innerHTML = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (const letter of alphabet) {
      const item = document.createElement('div');
      item.classList.add('strip-item');
      item.dataset.letter = letter;

      const letterSpan = document.createElement('span');
      letterSpan.classList.add('strip-letter');
      letterSpan.textContent = letter;

      const numberSpan = document.createElement('span');
      numberSpan.classList.add('strip-number');

      // Find if this letter has been assigned to a code number
      const assignedNum = Object.entries(userGuesses)
        .find(([num, l]) => l === letter);
      if (assignedNum) {
        numberSpan.textContent = assignedNum[0];
        item.classList.add('used');
      } else {
        numberSpan.textContent = '-';
      }

      item.appendChild(letterSpan);
      item.appendChild(numberSpan);
      stripEl.appendChild(item);
    }
  }

  function updateHighlights() {
    // Remove all highlights
    document.querySelectorAll('.cell.selected, .cell.same-code').forEach(el => {
      el.classList.remove('selected', 'same-code');
    });

    if (!selectedCell) return;

    const { r, c } = selectedCell;
    const cell = getCellEl(r, c);
    if (!cell || cell.classList.contains('black')) return;

    cell.classList.add('selected');
    const code = cell.dataset.code;

    // Highlight all cells with the same code number
    if (code) {
      document.querySelectorAll(`.cell[data-code="${code}"]`).forEach(el => {
        if (el !== cell) el.classList.add('same-code');
      });
    }
  }

  function getCellEl(r, c) {
    return gridEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  // --- Events ---
  function bindEvents() {
    gridEl.addEventListener('click', onGridClick);
    document.addEventListener('keydown', onKeyDown);
    timerToggle.addEventListener('click', toggleTimer);
    timerReset.addEventListener('click', resetTimer);
    btnCheck.addEventListener('click', checkPuzzle);
    btnRevealLetter.addEventListener('click', revealOneLetter);
    btnRevealAll.addEventListener('click', revealAll);
  }

  function onGridClick(e) {
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('black')) return;

    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    selectedCell = { r, c };
    updateHighlights();
  }

  function onKeyDown(e) {
    if (gameComplete) return;
    if (!selectedCell) return;

    const cell = getCellEl(selectedCell.r, selectedCell.c);
    if (!cell || cell.classList.contains('black')) return;

    const code = parseInt(cell.dataset.code);

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toUpperCase();

      // Check if this letter is already assigned to a different code
      const existingCode = Object.entries(userGuesses)
        .find(([num, l]) => l === letter && parseInt(num) !== code);

      // Check if the target code already has a revealed letter
      const solutionLetter = puzzle.letterGrid[selectedCell.r][selectedCell.c];
      if (puzzle.revealedLetters.has(solutionLetter) &&
          userGuesses[code] === solutionLetter) {
        // Can't change a revealed letter
        moveToNextCell();
        return;
      }

      if (existingCode) {
        // Remove the letter from the other code first
        const otherCode = parseInt(existingCode[0]);
        // Check if it's a revealed letter
        const otherSolution = puzzle.numberToLetter[otherCode];
        if (puzzle.revealedLetters.has(otherSolution) &&
            userGuesses[otherCode] === otherSolution) {
          // Can't steal a revealed letter
          showMessage('That letter is already confirmed for another number.', 'info');
          setTimeout(() => hideMessage(), 2000);
          return;
        }
        delete userGuesses[otherCode];
      }

      userGuesses[code] = letter;
      renderGrid();
      renderStrip();
      saveState();

      // Move to next white cell
      moveToNextCell();

      // Check for completion
      checkCompletion();

    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const solutionLetter = puzzle.letterGrid[selectedCell.r][selectedCell.c];
      if (puzzle.revealedLetters.has(solutionLetter) &&
          userGuesses[code] === solutionLetter) {
        return; // Can't delete revealed letters
      }
      delete userGuesses[code];
      renderGrid();
      renderStrip();
      saveState();

    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveSelection(0, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveSelection(0, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1, 0);
    }
  }

  function moveToNextCell() {
    if (!selectedCell) return;
    let { r, c } = selectedCell;

    // Move right, wrapping to next row
    for (let i = 0; i < 169; i++) {
      c++;
      if (c >= 13) { c = 0; r++; }
      if (r >= 13) { r = 0; }
      if (puzzle.grid[r][c]) {
        selectedCell = { r, c };
        updateHighlights();
        return;
      }
    }
  }

  function moveSelection(dr, dc) {
    if (!selectedCell) return;
    let { r, c } = selectedCell;

    for (let i = 0; i < 13; i++) {
      r += dr;
      c += dc;
      if (r < 0) r = 12;
      if (r > 12) r = 0;
      if (c < 0) c = 12;
      if (c > 12) c = 0;
      if (puzzle.grid[r][c]) {
        selectedCell = { r, c };
        updateHighlights();
        return;
      }
    }
  }

  // --- Game actions ---
  function checkPuzzle() {
    let allCorrect = true;
    let anyFilled = false;

    document.querySelectorAll('.cell:not(.black)').forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);
      const code = parseInt(cell.dataset.code);
      const guess = userGuesses[code];
      const solution = puzzle.letterGrid[r][c];

      cell.classList.remove('correct-check', 'error-check');

      if (guess) {
        anyFilled = true;
        if (guess === solution) {
          cell.classList.add('correct-check');
        } else {
          cell.classList.add('error-check');
          allCorrect = false;
        }
      } else {
        allCorrect = false;
      }
    });

    if (!anyFilled) {
      showMessage('Fill in some letters first!', 'info');
    } else if (allCorrect && isFullyFilled()) {
      completePuzzle();
    } else if (allCorrect) {
      showMessage('Looking good so far! Keep going.', 'info');
    } else {
      showMessage('Some letters are incorrect. Check the highlighted cells.', 'error');
    }

    // Clear check highlights after 3 seconds
    setTimeout(() => {
      document.querySelectorAll('.correct-check, .error-check').forEach(el => {
        el.classList.remove('correct-check', 'error-check');
      });
    }, 3000);

    setTimeout(() => hideMessage(), 3000);
  }

  function revealOneLetter() {
    if (gameComplete) return;

    // Find a code number that hasn't been correctly guessed yet
    const unguessed = [];
    for (let num = 1; num <= 26; num++) {
      const letter = puzzle.numberToLetter[num];
      if (!letter) continue;
      if (userGuesses[num] !== letter) {
        unguessed.push(num);
      }
    }

    if (unguessed.length === 0) {
      showMessage('All letters are already revealed!', 'info');
      setTimeout(() => hideMessage(), 2000);
      return;
    }

    // Pick a random one
    const num = unguessed[Math.floor(Math.random() * unguessed.length)];
    const letter = puzzle.numberToLetter[num];
    userGuesses[num] = letter;
    puzzle.revealedLetters.add(letter);

    renderGrid();
    renderStrip();
    saveState();
    checkCompletion();
  }

  function revealAll() {
    if (gameComplete) return;

    if (!confirm('Are you sure you want to see the solution?')) return;

    for (let num = 1; num <= 26; num++) {
      if (puzzle.numberToLetter[num]) {
        userGuesses[num] = puzzle.numberToLetter[num];
      }
    }

    renderGrid();
    renderStrip();
    gameComplete = true;
    saveState();
    showMessage('Solution revealed.', 'info');
  }

  function isFullyFilled() {
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (puzzle.grid[r][c]) {
          const code = puzzle.letterToNumber[puzzle.letterGrid[r][c]];
          if (!userGuesses[code]) return false;
        }
      }
    }
    return true;
  }

  function checkCompletion() {
    if (gameComplete) return;

    // Check if all cells are correctly filled
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (puzzle.grid[r][c]) {
          const solution = puzzle.letterGrid[r][c];
          const code = puzzle.letterToNumber[solution];
          if (userGuesses[code] !== solution) return;
        }
      }
    }

    completePuzzle();
  }

  function completePuzzle() {
    gameComplete = true;
    gridEl.classList.add('complete');
    showMessage(`Puzzle complete! Time: ${formatTime(timerSeconds)}`, 'success');
    if (timerRunning) toggleTimer();
    saveState();
  }

  // --- Timer ---
  function toggleTimer() {
    if (timerRunning) {
      clearInterval(timerInterval);
      timerRunning = false;
      timerToggle.textContent = 'Start';
    } else {
      timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
      }, 1000);
      timerRunning = true;
      timerToggle.textContent = 'Stop';
    }
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerSeconds = 0;
    updateTimerDisplay();
    timerToggle.textContent = 'Start';
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatTime(timerSeconds);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // --- Messages ---
  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = type;
    messageEl.classList.remove('hidden');
  }

  function hideMessage() {
    messageEl.classList.add('hidden');
  }

  // --- Persistence ---
  function saveState() {
    const today = new Date().toISOString().split('T')[0];
    const state = {
      dateStr: today,
      userGuesses,
      timerSeconds,
      gameComplete
    };
    try {
      localStorage.setItem('codeword-state', JSON.stringify(state));
    } catch (e) {
      // localStorage might be unavailable
    }
  }

  function loadState(dateStr) {
    try {
      const raw = localStorage.getItem('codeword-state');
      if (raw) {
        const state = JSON.parse(raw);
        if (state.dateStr === dateStr) return state;
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }

  // --- Start ---
  init();
})();

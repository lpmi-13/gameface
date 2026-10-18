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
  let initialRevealedLetters = null; // letters revealed at the start of the puzzle
  let history = []; // snapshots of game state for undo
  let messageTimer = null;
  let checkTimer = null;

  // --- DOM refs ---
  const gridEl = document.getElementById('grid');
  const stripEl = document.getElementById('letter-strip');
  const timerDisplay = document.getElementById('timer-display');
  const timerToggle = document.getElementById('timer-toggle');
  const btnUndo = document.getElementById('btn-undo');
  const btnReset = document.getElementById('btn-reset');
  const btnCheck = document.getElementById('btn-check');
  const btnRevealLetter = document.getElementById('btn-reveal-letter');
  const btnRevealAll = document.getElementById('btn-reveal-all');
  const btnInfo = document.getElementById('btn-info');
  const infoDialog = document.getElementById('info-dialog');
  const infoClose = document.getElementById('info-close');
  const messageEl = document.getElementById('message');
  const messageText = document.getElementById('message-text');
  const messageClose = document.getElementById('message-close');
  const loadingEl = document.getElementById('loading');
  const gameContainer = document.getElementById('game-container');
  const dateEl = document.getElementById('puzzle-date');
  const entryInput = document.getElementById('entry-input');

  // --- Init ---
  function init() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Display the puzzle's date. Puzzles are keyed by the UTC date, which can
    // differ from the local date near midnight.
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
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

    initialRevealedLetters = new Set(puzzle.revealedLetters);

    if (savedState && savedState.dateStr === dateStr) {
      userGuesses = savedState.userGuesses || {};
      timerSeconds = savedState.timerSeconds || 0;
      gameComplete = savedState.gameComplete || false;
    } else {
      userGuesses = getStartingGuesses();
      timerSeconds = 0;
      gameComplete = false;
    }

    loadingEl.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    renderGrid();
    renderStrip();
    updateTimerDisplay();
    updateUndoButton();
    updateControls();
    bindEvents();

    if (gameComplete) {
      showMessage('Puzzle complete. Come back tomorrow for a new one!', 'success', 0);
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
            if (isLocked(codeNum)) {
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
      item.setAttribute('role', 'listitem');
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
        if (isLocked(assignedNum[0])) item.classList.add('locked');
        item.setAttribute('aria-label', `${letter}: number ${assignedNum[0]}`);
      } else {
        numberSpan.textContent = '\u2013';
        item.setAttribute('aria-label', `${letter}: not placed`);
      }

      item.appendChild(letterSpan);
      item.appendChild(numberSpan);
      stripEl.appendChild(item);
    }

    updateStripHighlight();
  }

  function updateHighlights() {
    // Remove all highlights
    gridEl.querySelectorAll('.cell.selected, .cell.same-code').forEach(el => {
      el.classList.remove('selected', 'same-code');
    });

    const cell = getSelectedPlayableCell();
    if (!cell) {
      hideEntryInput();
      updateStripHighlight();
      return;
    }

    cell.classList.add('selected');
    const code = cell.dataset.code;

    // Highlight all cells with the same code number
    if (code) {
      gridEl.querySelectorAll(`.cell[data-code="${code}"]`).forEach(el => {
        if (el !== cell) el.classList.add('same-code');
      });
    }

    syncEntryInputPosition(cell);
    updateStripHighlight();
  }

  // Outline the letter key entry for the letter in the selected square.
  function updateStripHighlight() {
    stripEl.querySelectorAll('.strip-item.active').forEach(el => {
      el.classList.remove('active');
    });

    const cell = getSelectedPlayableCell();
    const letter = cell && userGuesses[cell.dataset.code];
    if (!letter) return;

    const item = stripEl.querySelector(`.strip-item[data-letter="${letter}"]`);
    if (item) item.classList.add('active');
  }

  function getCellEl(r, c) {
    return gridEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  // A code is locked once its letter has been revealed (at the start or via
  // Reveal Letter) and that letter is in place.
  function isLocked(code) {
    const letter = puzzle.numberToLetter[code];
    return puzzle.revealedLetters.has(letter) && userGuesses[code] === letter;
  }

  // --- Events ---
  function bindEvents() {
    gridEl.addEventListener('click', onGridClick);
    entryInput.addEventListener('input', onEntryInput);
    entryInput.addEventListener('keydown', onEntryKeyDown);
    entryInput.addEventListener('focus', onEntryFocus);
    timerToggle.addEventListener('click', toggleTimer);
    btnUndo.addEventListener('click', undo);
    btnReset.addEventListener('click', resetPuzzle);
    btnCheck.addEventListener('click', checkPuzzle);
    btnRevealLetter.addEventListener('click', revealOneLetter);
    btnRevealAll.addEventListener('click', revealAll);
    btnInfo.addEventListener('click', openInfo);
    infoClose.addEventListener('click', closeInfo);
    infoDialog.addEventListener('click', onInfoDialogClick);
    messageClose.addEventListener('click', hideMessage);
  }

  function onGridClick(e) {
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('black')) return;

    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    selectedCell = { r, c };
    updateHighlights();
    focusEntryInput();
  }

  // Tabbing to the grid lands on the entry input; start keyboard users on the
  // first square so they can type and move with the arrow keys straight away.
  function onEntryFocus() {
    if (selectedCell || gameComplete) return;

    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (puzzle.grid[r][c]) {
          selectedCell = { r, c };
          updateHighlights();
          return;
        }
      }
    }
  }

  function onEntryInput() {
    if (gameComplete || !selectedCell) {
      entryInput.value = '';
      return;
    }

    const letters = entryInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    entryInput.value = '';

    for (const letter of letters) {
      handleLetterInput(letter);
    }
  }

  function onEntryKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
      return;
    }

    if (gameComplete || !selectedCell) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      handleDeleteInput();
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

  function getSelectedPlayableCell() {
    if (!selectedCell) return null;
    const cell = getCellEl(selectedCell.r, selectedCell.c);
    if (!cell || cell.classList.contains('black')) return null;
    return cell;
  }

  function handleLetterInput(letter) {
    const cell = getSelectedPlayableCell();
    if (!cell) return;

    const code = parseInt(cell.dataset.code);

    // Check if this letter is already assigned to a different code
    const existingCode = Object.entries(userGuesses)
      .find(([num, l]) => l === letter && parseInt(num) !== code);

    // Check if the target code already has a revealed letter
    if (isLocked(code)) {
      moveToNextCell();
      return;
    }

    if (existingCode) {
      const otherCode = parseInt(existingCode[0]);
      if (isLocked(otherCode)) {
        showMessage(`${letter} is already given as number ${otherCode}.`, 'info', 2500);
        return;
      }
    }

    if (userGuesses[code] === letter) {
      moveToNextCell();
      return;
    }

    pushHistory();
    if (existingCode) delete userGuesses[parseInt(existingCode[0])];
    userGuesses[code] = letter;
    renderGrid();
    renderStrip();
    saveState();
    moveToNextCell();
    checkCompletion();
  }

  function handleDeleteInput() {
    const cell = getSelectedPlayableCell();
    if (!cell) return;

    const code = parseInt(cell.dataset.code);
    if (isLocked(code)) return;
    if (!userGuesses[code]) return;

    pushHistory();
    delete userGuesses[code];
    renderGrid();
    renderStrip();
    saveState();
  }

  function focusEntryInput() {
    if (!selectedCell || gameComplete) return;

    entryInput.value = '';
    const selectedEl = getSelectedPlayableCell();
    if (selectedEl) syncEntryInputPosition(selectedEl);
    try {
      entryInput.focus({ preventScroll: true });
    } catch (e) {
      entryInput.focus();
    }
  }

  function blurEntryInput() {
    entryInput.blur();
    entryInput.value = '';
    hideEntryInput();
  }

  function syncEntryInputPosition(cell) {
    if (!cell || gameComplete) {
      hideEntryInput();
      return;
    }

    const rect = cell.getBoundingClientRect();
    entryInput.style.left = `${rect.left}px`;
    entryInput.style.top = `${rect.top}px`;
    entryInput.style.width = `${rect.width}px`;
    entryInput.style.height = `${rect.height}px`;
    entryInput.style.opacity = '0.01';
    entryInput.style.pointerEvents = 'auto';
  }

  function hideEntryInput() {
    entryInput.style.left = '0px';
    entryInput.style.top = '0px';
    entryInput.style.width = '1px';
    entryInput.style.height = '1px';
    entryInput.style.opacity = '0';
    entryInput.style.pointerEvents = 'none';
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
    if (gameComplete) return;

    let allCorrect = true;
    let anyFilled = false;

    gridEl.querySelectorAll('.cell:not(.black)').forEach(cell => {
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
      showMessage('Fill in a few letters first, then check.', 'info');
    } else if (allCorrect && isFullyFilled()) {
      completePuzzle();
    } else if (allCorrect) {
      showMessage('Everything so far is right. Keep going!', 'success');
    } else {
      showMessage('Some letters are wrong. They\u2019re crossed out in red.', 'error');
    }

    // Clear check highlights after 3 seconds
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      gridEl.querySelectorAll('.correct-check, .error-check').forEach(el => {
        el.classList.remove('correct-check', 'error-check');
      });
    }, 3000);
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
      showMessage('All letters are already revealed!', 'info', 2000);
      return;
    }

    // Pick a random one
    const num = unguessed[Math.floor(Math.random() * unguessed.length)];
    const letter = puzzle.numberToLetter[num];
    pushHistory();
    userGuesses[num] = letter;
    puzzle.revealedLetters.add(letter);

    renderGrid();
    renderStrip();
    saveState();
    checkCompletion();
  }

  function revealAll() {
    if (gameComplete) return;

    if (!confirm('Show the full solution? This ends today\u2019s puzzle.')) return;

    pushHistory();

    for (let num = 1; num <= 26; num++) {
      if (puzzle.numberToLetter[num]) {
        userGuesses[num] = puzzle.numberToLetter[num];
      }
    }

    renderGrid();
    renderStrip();
    gameComplete = true;
    stopTimer();
    blurEntryInput();
    updateControls();
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
    stopTimer();
    blurEntryInput();
    updateControls();
    const time = timerSeconds > 0 ? ` in ${formatTime(timerSeconds)}` : '';
    showMessage(`Solved${time}. Well done!`, 'success', 0);
    saveState();
  }

  // Actions that only make sense mid-puzzle are disabled once it's over.
  function updateControls() {
    btnCheck.disabled = gameComplete;
    btnRevealLetter.disabled = gameComplete;
    btnRevealAll.disabled = gameComplete;
    timerToggle.disabled = gameComplete;
    entryInput.tabIndex = gameComplete ? -1 : 0;

    const label = timerRunning ? 'Pause' : (timerSeconds > 0 ? 'Resume' : 'Start');
    timerToggle.textContent = label;
    timerToggle.setAttribute('aria-label', `${label} timer`);
  }

  // --- Undo / reset ---
  function getStartingGuesses() {
    const guesses = {};
    for (const letter of initialRevealedLetters) {
      guesses[puzzle.letterToNumber[letter]] = letter;
    }
    return guesses;
  }

  function snapshot() {
    return {
      userGuesses: { ...userGuesses },
      revealedLetters: new Set(puzzle.revealedLetters),
      gameComplete
    };
  }

  function pushHistory() {
    history.push(snapshot());
    updateUndoButton();
  }

  function restoreSnapshot(state) {
    userGuesses = state.userGuesses;
    puzzle.revealedLetters = state.revealedLetters;
    gameComplete = state.gameComplete;

    if (gameComplete) {
      gridEl.classList.add('complete');
      blurEntryInput();
    } else {
      gridEl.classList.remove('complete');
    }

    hideMessage();
    renderGrid();
    renderStrip();
    saveState();
    updateUndoButton();
    updateControls();
  }

  function undo() {
    if (history.length === 0) return;
    restoreSnapshot(history.pop());
  }

  function resetPuzzle() {
    if (!confirm('Go back to the starting letters? This also resets the timer.')) return;

    pushHistory();
    resetTimer();
    restoreSnapshot({
      userGuesses: getStartingGuesses(),
      revealedLetters: new Set(initialRevealedLetters),
      gameComplete: false
    });
  }

  function updateUndoButton() {
    btnUndo.disabled = history.length === 0;
  }

  // --- Info dialog ---
  function openInfo() {
    infoDialog.showModal();
  }

  function closeInfo() {
    infoDialog.close();
  }

  // Clicks on the backdrop target the <dialog> itself; clicks on its content
  // target a descendant.
  function onInfoDialogClick(e) {
    if (e.target === infoDialog) closeInfo();
  }

  // --- Timer ---
  function toggleTimer() {
    if (timerRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    if (timerRunning || gameComplete) return;
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
    timerRunning = true;
    updateControls();
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    updateControls();
  }

  function resetTimer() {
    timerSeconds = 0;
    stopTimer();
    updateTimerDisplay();
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
  // Shows a toast that hides itself after `duration` ms; 0 keeps it up until
  // dismissed.
  function showMessage(text, type, duration = 3000) {
    clearTimeout(messageTimer);
    messageText.textContent = text;
    messageEl.className = `toast toast--${type} is-visible`;
    messageClose.tabIndex = 0;
    if (duration) messageTimer = setTimeout(hideMessage, duration);
  }

  // The faded-out toast stays in the page so screen readers keep the live
  // region, but its close button must not be an invisible tab stop.
  function hideMessage() {
    clearTimeout(messageTimer);
    messageEl.classList.remove('is-visible');
    messageClose.tabIndex = -1;
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

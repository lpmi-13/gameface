# Gameface - Daily Codeword

A daily codeword puzzle game built entirely with frontend code (HTML, CSS, vanilla JS).

## What is a Codeword?

Codewords are like crosswords but with no clues. Every letter of the alphabet has been replaced by a number (1-26). The same number always represents the same letter throughout the puzzle. A few letters are revealed to get you started — use them to deduce the remaining letters and fill the grid with valid English words.

## How it Works

- **Daily puzzles**: A new puzzle is generated each day using a date-seeded random number generator. Everyone gets the same puzzle on the same day.
- **Pure frontend**: No backend needed. Puzzle generation, game logic, and state persistence all run in the browser.
- **Deterministic generation**: Uses a seeded PRNG (Mulberry32) so the same date always produces the same puzzle.

### Architecture

```
index.html          - Main page
css/style.css       - Responsive styling
js/seedrandom.js    - Seeded PRNG for deterministic daily puzzles
js/words.js         - Curated word list (~5000 words) organized by length
js/generator.js     - Grid templates + backtracking word filler
js/game.js          - Game UI, input handling, timer, persistence
```

### Puzzle Generation

1. A grid template (13x13 with symmetric black/white pattern) is selected based on the date
2. Word slots are extracted and filled using a backtracking algorithm with constraint propagation
3. Code numbers (1-26) are assigned to letters via a shuffled mapping
4. Three letters are revealed as starting hints

## Running

Open `index.html` in a browser. No build step or server required.

## Testing

Run the automated checks with:

```bash
node --test
```

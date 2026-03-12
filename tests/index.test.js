const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

test('index removes the how to play UI copy', () => {
  assert.equal(indexHtml.includes('How to Play'), false);
});

test('index includes the hidden entry input used for mobile keyboards', () => {
  assert.match(indexHtml, /id="entry-input"/);
  assert.match(indexHtml, /autocapitalize="characters"/);
  assert.match(indexHtml, /enterkeyhint="done"/);
});

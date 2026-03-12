class ClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }

  add(...names) {
    for (const name of names) {
      if (name) this.classes.add(name);
    }
  }

  remove(...names) {
    for (const name of names) {
      this.classes.delete(name);
    }
  }

  contains(name) {
    return this.classes.has(name);
  }

  setFromString(value) {
    this.classes = new Set(
      String(value)
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean)
    );
  }

  toString() {
    return [...this.classes].join(' ');
  }
}

function datasetKeyFromAttribute(name) {
  return name
    .slice(5)
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function getAttributeValue(element, name) {
  if (name === 'id') return element.id || null;
  if (name === 'class') return element.className || null;
  if (name.startsWith('data-')) {
    const key = datasetKeyFromAttribute(name);
    const value = element.dataset[key];
    return value == null ? null : String(value);
  }
  return Object.prototype.hasOwnProperty.call(element.attributes, name)
    ? element.attributes[name]
    : null;
}

function matchesSingleSelector(element, selector) {
  let remaining = selector.trim();
  if (!remaining) return false;

  const excludedClasses = [];
  remaining = remaining.replace(/:not\(\.([A-Za-z0-9_-]+)\)/g, (_, className) => {
    excludedClasses.push(className);
    return '';
  });

  const attributeMatches = [...remaining.matchAll(/\[([A-Za-z0-9_-]+)="([^"]*)"\]/g)];
  remaining = remaining.replace(/\[[^\]]+\]/g, '');

  const idMatches = [...remaining.matchAll(/#([A-Za-z0-9_-]+)/g)].map(match => match[1]);
  remaining = remaining.replace(/#[A-Za-z0-9_-]+/g, '');

  const classMatches = [...remaining.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(match => match[1]);
  remaining = remaining.replace(/\.[A-Za-z0-9_-]+/g, '').trim();

  const tagName = remaining || null;
  if (tagName && element.tagName.toLowerCase() !== tagName.toLowerCase()) {
    return false;
  }

  for (const id of idMatches) {
    if (element.id !== id) return false;
  }

  for (const className of classMatches) {
    if (!element.classList.contains(className)) return false;
  }

  for (const className of excludedClasses) {
    if (element.classList.contains(className)) return false;
  }

  for (const [, attrName, value] of attributeMatches) {
    if (getAttributeValue(element, attrName) !== value) return false;
  }

  return true;
}

function matchesSelector(element, selector) {
  return selector
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => matchesSingleSelector(element, part));
}

function traverse(root, callback) {
  for (const child of root.children) {
    callback(child);
    traverse(child, callback);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.eventListeners = new Map();
    this.classList = new ClassList(this);
    this.style = {};
    this.textContent = '';
    this.value = '';
    this._id = '';
  }

  get id() {
    return this._id;
  }

  set id(value) {
    const nextValue = value ? String(value) : '';
    if (this._id) {
      this.ownerDocument.unregisterId(this._id, this);
    }
    this._id = nextValue;
    if (nextValue) {
      this.ownerDocument.registerId(nextValue, this);
    }
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get innerHTML() {
    return this.children.map(child => child.textContent).join('');
  }

  set innerHTML(value) {
    this.children = [];
    this.textContent = value === '' ? '' : String(value);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    const normalized = String(value);
    if (name === 'id') {
      this.id = normalized;
      return;
    }
    if (name === 'class') {
      this.className = normalized;
      return;
    }
    if (name.startsWith('data-')) {
      this.dataset[datasetKeyFromAttribute(name)] = normalized;
      return;
    }
    this.attributes[name] = normalized;
  }

  getAttribute(name) {
    return getAttributeValue(this, name);
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;

    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      listener.call(this, event);
      if (event._propagationStopped) return !event.defaultPrevented;
    }

    if (event.bubbles !== false && this.parentNode) {
      return this.parentNode.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node !== this.ownerDocument && matchesSelector(node, selector)) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    traverse(this, node => {
      if (matchesSelector(node, selector)) {
        matches.push(node);
      }
    });
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    const parsePx = value => {
      if (value == null || value === '') return null;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const styleLeft = parsePx(this.style.left);
    const styleTop = parsePx(this.style.top);
    const styleWidth = parsePx(this.style.width);
    const styleHeight = parsePx(this.style.height);

    if (styleLeft != null && styleTop != null && styleWidth != null && styleHeight != null) {
      return {
        x: styleLeft,
        y: styleTop,
        left: styleLeft,
        top: styleTop,
        width: styleWidth,
        height: styleHeight,
        right: styleLeft + styleWidth,
        bottom: styleTop + styleHeight
      };
    }

    if (this.classList.contains('cell')) {
      const row = Number.parseInt(this.dataset.row || '0', 10);
      const col = Number.parseInt(this.dataset.col || '0', 10);
      const size = 38;
      const left = col * size;
      const top = row * size;
      return {
        x: left,
        y: top,
        left,
        top,
        width: size,
        height: size,
        right: left + size,
        bottom: top + size
      };
    }

    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0
    };
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.elementsById = new Map();
    this.body = this.createElement('body');
    this.appendChild(this.body);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerId(id, element) {
    this.elementsById.set(id, element);
  }

  unregisterId(id, element) {
    if (this.elementsById.get(id) === element) {
      this.elementsById.delete(id);
    }
  }
}

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.key = init.key;
    this.target = init.target || null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this._propagationStopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._propagationStopped = true;
  }
}

function append(parent, tagName, options = {}) {
  const element = parent.ownerDocument.createElement(tagName);
  if (options.id) element.id = options.id;
  if (options.className) element.className = options.className;
  if (options.textContent) element.textContent = options.textContent;
  parent.appendChild(element);
  return element;
}

function createGameDocument() {
  const document = new FakeDocument();
  const app = append(document.body, 'div', { id: 'app' });
  const header = append(app, 'header');
  append(header, 'h1', { textContent: 'Daily Codeword' });
  append(header, 'p', { id: 'puzzle-date', className: 'date' });

  const loading = append(app, 'div', { id: 'loading' });
  append(loading, 'p', { textContent: 'Generating today\'s puzzle...' });

  const gameContainer = append(app, 'div', { id: 'game-container', className: 'hidden' });
  const toolbar = append(gameContainer, 'div', { className: 'toolbar' });
  const timer = append(toolbar, 'div', { className: 'timer' });
  append(timer, 'span', { id: 'timer-display', textContent: '00:00' });
  append(timer, 'button', { id: 'timer-toggle', textContent: 'Start' });
  append(timer, 'button', { id: 'timer-reset', textContent: 'Reset' });

  const actions = append(toolbar, 'div', { className: 'actions' });
  append(actions, 'button', { id: 'btn-check', textContent: 'Check' });
  append(actions, 'button', { id: 'btn-reveal-letter', textContent: 'Reveal Letter' });
  append(actions, 'button', { id: 'btn-reveal-all', textContent: 'Solution' });

  const gridWrapper = append(gameContainer, 'div', { id: 'grid-wrapper' });
  append(gridWrapper, 'div', { id: 'grid' });
  append(gameContainer, 'div', { id: 'letter-strip' });
  append(gameContainer, 'div', { id: 'message', className: 'hidden' });

  const entryInput = append(gameContainer, 'input', {
    id: 'entry-input',
    className: 'entry-input'
  });
  entryInput.value = '';

  return document;
}

class FakeStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  clear() {
    this.store.clear();
  }
}

function dispatch(target, type, init = {}) {
  const event = new FakeEvent(type, { ...init, target });
  target.dispatchEvent(event);
  return event;
}

module.exports = {
  FakeStorage,
  createGameDocument,
  dispatch
};

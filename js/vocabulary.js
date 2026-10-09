let popover = null;
let currentButton = null;
let listening = false;

function isLetter(char) {
  return /\p{L}/u.test(char || '');
}

function findRanges(text, vocabulary) {
  const items = (vocabulary || [])
    .map((item) => ({
      ...item,
      needle: String(item.match || item.phrase || '').trim(),
    }))
    .filter((item) => item.needle);

  const lower = text.toLowerCase();
  const candidates = [];

  items.forEach((item) => {
    const needle = item.needle.toLowerCase();
    let from = 0;
    let found = false;
    while (from < lower.length) {
      const start = lower.indexOf(needle, from);
      if (start === -1) break;
      const end = start + needle.length;
      const leftOk = start === 0 || !isLetter(text[start - 1]);
      const rightOk = end === text.length || !isLetter(text[end]);
      if (leftOk && rightOk) {
        candidates.push({ start, end, item });
        found = true;
      }
      from = start + Math.max(needle.length, 1);
    }
    if (!found) console.warn(`Nie znaleziono w tekście: „${item.needle}”`);
  });

  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen = [];
  candidates.forEach((candidate) => {
    const overlaps = chosen.some(
      (other) => candidate.start < other.end && candidate.end > other.start,
    );
    if (!overlaps) chosen.push(candidate);
  });
  chosen.sort((a, b) => a.start - b.start);
  return chosen;
}

function createWord(surface, item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vocab-word';
  button.textContent = surface;
  button.dataset.phrase = item.phrase || surface;
  button.dataset.uk = item.uk || '';
  button.dataset.ru = item.ru || '';
  button.setAttribute('aria-expanded', 'false');
  return button;
}

function appendHighlighted(parent, text, vocabulary) {
  const ranges = findRanges(text, vocabulary);
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) parent.append(text.slice(cursor, range.start));
    parent.append(createWord(text.slice(range.start, range.end), range.item));
    cursor = range.end;
  });
  if (cursor < text.length) parent.append(text.slice(cursor));
}

function paragraphList(fragment) {
  if (Array.isArray(fragment?.paragraphs)) {
    return fragment.paragraphs
      .map((part) => String(part).replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean);
  }
  return String(fragment?.text || '')
    .trim()
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

function styledPieces(text) {
  const pieces = [];
  const pattern = /\[(\/?)(b|i)\]/g;
  const stack = [];
  let cursor = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > cursor) {
      pieces.push({
        text: text.slice(cursor, match.index),
        bold: stack.includes('b'),
        italic: stack.includes('i'),
      });
    }
    const closing = match[1] === '/';
    const kind = match[2];
    if (closing) {
      const at = stack.lastIndexOf(kind);
      if (at >= 0) stack.splice(at, 1);
    } else {
      stack.push(kind);
    }
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) {
    pieces.push({
      text: text.slice(cursor),
      bold: stack.includes('b'),
      italic: stack.includes('i'),
    });
  }
  return pieces.filter((piece) => piece.text);
}

export function renderParagraphs(fragment) {
  const fragmentNode = document.createDocumentFragment();
  const vocabulary = fragment.vocabulary || [];
  paragraphList(fragment).forEach((part) => {
    const paragraph = document.createElement('p');
    styledPieces(part).forEach((piece) => {
      const host = document.createElement('span');
      appendHighlighted(host, piece.text, vocabulary);
      if (!piece.bold && !piece.italic) {
        paragraph.append(...host.childNodes);
        return;
      }
      const wrap = document.createElement(piece.bold ? 'strong' : 'em');
      if (piece.bold && piece.italic) wrap.append(document.createElement('em'));
      const target = piece.bold && piece.italic ? wrap.firstChild : wrap;
      target.append(...host.childNodes);
      paragraph.append(wrap);
    });
    fragmentNode.append(paragraph);
  });
  return fragmentNode;
}

function ensurePopover() {
  if (popover) return popover;
  popover = document.createElement('div');
  popover.className = 'vocab-pop';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Tłumaczenie');
  document.body.append(popover);
  return popover;
}

function addTranslation(code, flag, text) {
  if (!text) return;
  const line = document.createElement('p');
  line.className = 'vocab-line';
  line.lang = code;
  const mark = document.createElement('span');
  mark.className = 'vocab-flag';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = flag;
  const value = document.createElement('span');
  value.textContent = text;
  line.append(mark, value);
  popover.append(line);
}

function fillPopover(button) {
  const box = ensurePopover();
  box.replaceChildren();

  const phrase = document.createElement('p');
  phrase.className = 'vocab-phrase';
  phrase.textContent = button.dataset.phrase || button.textContent;
  box.append(phrase);
  addTranslation('uk', '🇺🇦', button.dataset.uk || '');
  addTranslation('ru', '🇷🇺', button.dataset.ru || '');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'vocab-close';
  close.setAttribute('aria-label', 'Zamknij');
  close.textContent = '×';
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    closePopover();
  });
  box.append(close);
}

function placePopover(button) {
  const box = ensurePopover();
  const margin = 10;
  const width = Math.min(280, window.innerWidth - margin * 2);
  box.style.width = `${width}px`;
  box.hidden = false;

  const anchor = button.getBoundingClientRect();
  const height = box.offsetHeight;
  let top = anchor.bottom + 8;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, anchor.top - height - 8);
  }
  let left = anchor.left;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
  box.style.top = `${Math.max(margin, top)}px`;
  box.style.left = `${Math.max(margin, left)}px`;
}

function closePopover() {
  if (currentButton) currentButton.setAttribute('aria-expanded', 'false');
  currentButton = null;
  if (popover) popover.hidden = true;
}

function togglePopover(button) {
  if (currentButton === button) {
    closePopover();
    return;
  }
  if (currentButton) currentButton.setAttribute('aria-expanded', 'false');
  currentButton = button;
  button.setAttribute('aria-expanded', 'true');
  fillPopover(button);
  placePopover(button);
}

export function initVocabulary() {
  if (listening) return;
  listening = true;
  ensurePopover();

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.vocab-word');
    if (button) {
      event.preventDefault();
      togglePopover(button);
      return;
    }
    if (popover && !popover.hidden && !popover.contains(event.target)) closePopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePopover();
  });

  window.addEventListener(
    'scroll',
    () => {
      if (!currentButton) return;
      const rect = currentButton.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) closePopover();
      else placePopover(currentButton);
    },
    true,
  );

  window.addEventListener('resize', () => {
    if (currentButton) placePopover(currentButton);
  });
}

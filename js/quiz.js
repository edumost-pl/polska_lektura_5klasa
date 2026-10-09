import { el } from './common.js';

const TYPE_MAP = {
  choice: 'choice',
  wybierz: 'choice',
  truefalse: 'truefalse',
  'true-false': 'truefalse',
  'prawda-falsz': 'truefalse',
  match: 'match',
  polacz: 'match',
  'połącz': 'match',
  fill: 'fill',
  uzupelnij: 'fill',
  'uzupełnij': 'fill',
};

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.?!…,;:]+$/u, '');
}

function normalizeType(type) {
  return TYPE_MAP[normalize(type)] || '';
}

function asBool(value) {
  if (typeof value === 'boolean') return value;
  const text = normalize(value);
  if (['prawda', 'true', 'tak', 'yes', '1'].includes(text)) return true;
  if (['fałsz', 'falsz', 'false', 'nie', 'no', '0'].includes(text)) return false;
  return null;
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function acceptedFill(question) {
  const raw = []
    .concat(question.accept || [])
    .concat(question.answer ?? []);
  return raw.map(normalize).filter(Boolean);
}

function canonicalFill(question) {
  if (Array.isArray(question.answer) && question.answer.length) return String(question.answer[0]);
  if (typeof question.answer === 'string' && question.answer.trim()) return question.answer.trim();
  return (question.accept || [])[0] || '';
}

function choiceIndex(question) {
  if (typeof question.answer === 'number') return question.answer;
  const options = question.options || [];
  const wanted = normalize(question.answer);
  return options.findIndex((option) => normalize(option) === wanted);
}

function feedback(root, ok, text) {
  root.classList.add(ok ? 'is-correct' : 'is-wrong');
  const note = el('p', 'quiz-feedback', ok ? 'Dobrze.' : text);
  root.append(note);
}

function renderChoice(question, index, uid) {
  const root = el('div', 'quiz-item');
  root.setAttribute('role', 'group');
  const title = el('p', 'quiz-q', question.question || '');
  root.append(title);
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = choiceIndex(question);
  options.forEach((option, optionIndex) => {
    const label = el('label', 'option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${uid}-q${index}`;
    input.value = String(optionIndex);
    label.append(input, document.createTextNode(String(option)));
    root.append(label);
  });
  return {
    root,
    ignored: options.length === 0 || answer < 0,
    isComplete: () => Boolean(root.querySelector('input:checked')),
    isCorrect: () => Number(root.querySelector('input:checked')?.value) === answer,
    showResult() {
      const selected = Number(root.querySelector('input:checked')?.value);
      root.querySelectorAll('.option').forEach((label, optionIndex) => {
        if (optionIndex === answer) label.classList.add('is-key');
        else if (optionIndex === selected) label.classList.add('is-miss');
      });
      const ok = selected === answer;
      feedback(root, ok, `Poprawna odpowiedź: ${options[answer] ?? ''}`);
    },
    lock() {
      root.querySelectorAll('input').forEach((input) => {
        input.disabled = true;
      });
    },
  };
}

function renderTrueFalse(question, index, uid) {
  const root = el('div', 'quiz-item');
  root.setAttribute('role', 'group');
  root.append(el('p', 'quiz-q', question.question || ''));
  const answer = asBool(question.answer);
  [
    ['true', 'Prawda'],
    ['false', 'Fałsz'],
  ].forEach(([value, labelText]) => {
    const label = el('label', 'option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${uid}-q${index}`;
    input.value = value;
    label.append(input, document.createTextNode(labelText));
    root.append(label);
  });
  return {
    root,
    ignored: answer === null,
    isComplete: () => Boolean(root.querySelector('input:checked')),
    isCorrect: () => (root.querySelector('input:checked')?.value === 'true') === answer,
    showResult() {
      const selected = root.querySelector('input:checked')?.value;
      const ok = (selected === 'true') === answer;
      root.querySelectorAll('.option').forEach((label) => {
        const value = label.querySelector('input')?.value === 'true';
        if (value === answer) label.classList.add('is-key');
        else if (label.querySelector('input')?.checked) label.classList.add('is-miss');
      });
      feedback(root, ok, `Poprawna odpowiedź: ${answer ? 'Prawda' : 'Fałsz'}`);
    },
    lock() {
      root.querySelectorAll('input').forEach((input) => {
        input.disabled = true;
      });
    },
  };
}

function renderFill(question) {
  const root = el('div', 'quiz-item');
  const accepted = acceptedFill(question);
  const prompt = el('div', 'quiz-q fill-line');
  const parts = String(question.question || '').split('___');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fill-input';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Uzupełnij zdanie');
  if (parts.length > 1) {
    parts.forEach((part, partIndex) => {
      prompt.append(document.createTextNode(part));
      if (partIndex < parts.length - 1) prompt.append(input);
    });
  } else {
    prompt.append(document.createTextNode(question.question || 'Uzupełnij zdanie'));
    prompt.append(input);
  }
  root.append(prompt);
  return {
    root,
    ignored: accepted.length === 0,
    isComplete: () => input.value.trim() !== '',
    isCorrect: () => accepted.includes(normalize(input.value)),
    showResult() {
      const ok = accepted.includes(normalize(input.value));
      input.disabled = true;
      input.classList.add(ok ? 'is-key' : 'is-miss');
      feedback(root, ok, `Poprawna odpowiedź: ${canonicalFill(question)}`);
    },
    lock() {
      input.disabled = true;
    },
  };
}

function renderMatch(question) {
  const root = el('div', 'quiz-item');
  root.append(el('p', 'quiz-q', question.question || 'Połącz.'));
  const pairs = Array.isArray(question.pairs) ? question.pairs : [];
  const options = shuffle(pairs.map((pair, pairIndex) => ({ pairIndex, text: pair.right })));
  const selects = [];

  pairs.forEach((pair) => {
    const row = el('div', 'match-row');
    row.append(el('span', 'match-left', pair.left));
    const select = document.createElement('select');
    select.className = 'match-select';
    const empty = el('option', '', '— wybierz —');
    empty.value = '';
    select.append(empty);
    options.forEach((option) => {
      const node = el('option', '', option.text);
      node.value = String(option.pairIndex);
      select.append(node);
    });
    selects.push(select);
    row.append(select);
    root.append(row);
  });

  return {
    root,
    ignored: pairs.length < 2 || pairs.some((pair) => !pair.left || !pair.right),
    isComplete: () => selects.every((select) => select.value !== ''),
    isCorrect: () => selects.every((select, rowIndex) => Number(select.value) === rowIndex),
    showResult() {
      const ok = selects.every((select, rowIndex) => Number(select.value) === rowIndex);
      selects.forEach((select, rowIndex) => {
        select.disabled = true;
        select.classList.add(Number(select.value) === rowIndex ? 'is-key' : 'is-miss');
      });
      feedback(root, ok, 'Sprawdź pary jeszcze raz.');
    },
    lock() {
      selects.forEach((select) => {
        select.disabled = true;
      });
    },
  };
}

function renderQuestion(question, index, uid) {
  const type = normalizeType(question?.type);
  if (type === 'choice') return renderChoice(question, index, uid);
  if (type === 'truefalse') return renderTrueFalse(question, index, uid);
  if (type === 'fill') return renderFill(question);
  if (type === 'match') return renderMatch(question);

  const root = el('div', 'quiz-item');
  root.append(el('p', 'quiz-q', question?.question || 'Pytanie'));
  root.append(el('p', 'muted', 'Tego typu pytania nie rozpoznaję. Sprawdź pole „type” w JSON.'));
  return {
    root,
    ignored: true,
    isComplete: () => true,
    isCorrect: () => false,
    showResult() {},
    lock() {},
  };
}

export function mountQuiz(container, questions, options = {}) {
  container.replaceChildren();
  const list = Array.isArray(questions) ? questions : [];
  const title = el('h2', 'quiz-title', options.title || 'Sprawdź, czy rozumiesz');
  container.append(title);

  if (!list.length) {
    if (options.emptyText) container.append(el('p', 'muted', options.emptyText));
    return;
  }

  const uid = options.id || `quiz-${Math.random().toString(36).slice(2, 8)}`;
  const nodes = list.map((question, index) => renderQuestion(question, index, uid));
  nodes.forEach((node) => container.append(node.root));

  const notice = el('p', 'quiz-notice');
  notice.hidden = true;
  const action = el('button', 'btn btn-primary', 'Sprawdź');
  action.type = 'button';
  container.append(notice, action);

  action.addEventListener('click', () => {
    const pending = nodes.filter((node) => !node.ignored && !node.isComplete());
    if (pending.length) {
      notice.hidden = false;
      notice.textContent = 'Uzupełnij wszystkie odpowiedzi.';
      pending[0].root.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    notice.hidden = true;
    const active = nodes.filter((node) => !node.ignored);
    let score = 0;
    active.forEach((node) => {
      const ok = node.isCorrect();
      if (ok) score += 1;
      node.showResult();
      node.lock();
    });

    const result = el('p', 'quiz-score', `${score} / ${active.length}`);
    action.replaceWith(result);

    const retry = el('button', 'btn btn-ghost', 'Spróbuj ponownie');
    retry.type = 'button';
    retry.addEventListener('click', () => mountQuiz(container, questions, options));
    container.append(retry);
    options.onResult?.(score, active.length);
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  if (options.focus) {
    title.tabIndex = -1;
    title.focus();
  }
}

import { assetUrl, el, isFileProtocol, loadBook, loadJson, LOCAL_SERVER_HINT, pageHref, queryParam } from './common.js';
import { createBookAudio, mountPartAudio } from './audio.js';
import { mountQuiz } from './quiz.js';
import { initVocabulary, renderParagraphs } from './vocabulary.js';

function chapterTitle(chapter, meta) {
  return chapter.title || meta.title || 'Rozdział';
}

function paintError(root, bookId, message) {
  root.replaceChildren();
  root.append(el('p', 'status', message));
  const back = el('a', 'btn btn-ghost', '← Powrót do rozdziałów');
  back.href = bookId ? pageHref('lektura.html', { book: bookId }) : '../index.html';
  root.append(back);
}

function paragraphItems(part) {
  if (Array.isArray(part?.paragraphs)) {
    return part.paragraphs.map((item) => String(item)).filter((item) => item.trim());
  }
  return String(part?.text || '')
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chapterParts(chapter) {
  if (Array.isArray(chapter.parts)) return chapter.parts;
  return (Array.isArray(chapter.fragments) ? chapter.fragments : []).map((fragment, index) => ({
    id: fragment.id || `part-${index + 1}`,
    title: fragment.title || '',
    description: fragment.description || '',
    paragraphs: paragraphItems(fragment),
    vocabulary: fragment.vocabulary || [],
    audio: fragment.audio || { start: null, end: null },
    images: Array.isArray(fragment.images) ? fragment.images : [],
    content: Array.isArray(fragment.content) ? fragment.content : undefined,
    questions: fragment.questions || fragment.quiz || [],
  }));
}

function finalQuizOf(chapter) {
  if (chapter.finalQuiz && typeof chapter.finalQuiz === 'object') return chapter.finalQuiz;
  return {
    title: 'Mini test',
    questions: Array.isArray(chapter.quiz) ? chapter.quiz : [],
  };
}

function bookAudioFile(book, chapter) {
  const raw = (typeof book?.audio === 'string' && book.audio.trim())
    || (typeof chapter?.audio === 'string' && chapter.audio.trim())
    || '';
  const marker = raw.indexOf('audio/');
  if (marker >= 0) return raw.slice(marker);
  return raw.replace(/^(\.\.\/)+/, '');
}

function partAnchor(part, index) {
  const raw = String(part.id || `part-${index + 1}`);
  return `czesc-${raw.replace(/[^a-z0-9_-]+/gi, '')}`;
}

export async function initReader() {
  const root = document.querySelector('#app');
  if (!root) return;
  if (isFileProtocol()) {
    root.textContent = LOCAL_SERVER_HINT;
    return;
  }

  const bookId = queryParam('book');
  const chapterParam = queryParam('chapter');

  try {
    if (!bookId || !chapterParam) throw new Error('Brak książki lub rozdziału.');
    const book = await loadBook(bookId);
    const index = book.chapters.findIndex((chapter) => String(chapter.id) === String(chapterParam));
    if (index < 0) throw new Error('Nie ma takiego rozdziału.');
    const meta = book.chapters[index];
    const chapter = await loadJson(`${book.dir}/${meta.file}`);
    paint(root, book, chapter, meta, index);
  } catch (error) {
    paintError(root, bookId, error.message || 'Nie udało się otworzyć rozdziału.');
  }
}

function paint(root, book, chapter, meta, index) {
  initVocabulary();
  const title = chapterTitle(chapter, meta);
  document.title = `${title} · ${book.title}`;

  const parts = chapterParts(chapter);
  const finalQuiz = finalQuizOf(chapter);
  const finalQuestions = Array.isArray(finalQuiz.questions) ? finalQuiz.questions : [];
  const player = createBookAudio(assetUrl(bookAudioFile(book, chapter)));
  const hasText = parts.some((part) => paragraphItems(part).length);

  root.replaceChildren();

  const back = el('a', 'back-link', '← Powrót do rozdziałów');
  back.href = pageHref('lektura.html', { book: book.id });
  const headerInner = document.querySelector('.header-inner');
  if (headerInner && !headerInner.querySelector('.back-link')) headerInner.prepend(back);

  if (!parts.length && !finalQuestions.length && !hasText) {
    root.append(el('h1', 'chapter-title', title));
    root.append(el('p', 'empty-chapter', 'Ten rozdział jeszcze nie jest gotowy.'));
    root.append(chapterNav(book, index));
    return;
  }

  const top = el('div', 'reader-top');
  top.append(el('h1', 'chapter-title', title));
  const navButtons = [];
  const sections = [];

  if (parts.length) {
    const nav = el('nav', 'part-nav');
    nav.setAttribute('aria-label', 'Części rozdziału');
    parts.forEach((part, partIndex) => {
      const anchor = partAnchor(part, partIndex);
      const button = el('button', 'part-jump', String(partIndex + 1));
      button.type = 'button';
      button.dataset.target = anchor;
      button.setAttribute('aria-label', `Część ${partIndex + 1}${part.title ? `: ${part.title}` : ''}`);
      button.addEventListener('click', () => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navButtons.push(button);
      nav.append(button);
    });
    top.append(nav);
  }
  root.append(top);

  parts.forEach((part, partIndex) => {
    const section = renderPart(part, partIndex, parts, player);
    sections.push(section);
    root.append(section);
  });

  if (parts.length || finalQuestions.length) {
    root.append(renderFinalQuiz(finalQuiz, meta.id, title));
  }

  root.append(chapterNav(book, index));
  root.append(player.audio);
  if (navButtons.length && sections.length) watchParts(navButtons, sections);
}

function renderPart(part, index, parts, player) {
  const total = parts.length;
  const anchor = partAnchor(part, index);
  const section = el('article', 'part-card');
  section.id = anchor;
  section.lang = 'pl';

  const head = el('header', 'part-head');
  const intro = el('div', 'part-intro');
  const kicker = el('p', 'part-kicker', `Część ${index + 1} z ${total}`);
  intro.append(kicker);
  const heading = el('h2', 'part-title', part.title || `Część ${index + 1}`);
  heading.id = `${anchor}-title`;
  section.setAttribute('aria-labelledby', heading.id);
  intro.append(heading);
  const description = String(part.description || '').trim();
  if (description) intro.append(el('p', 'part-description', description));
  head.append(intro);

  const switcher = el('div', 'part-switch');
  switcher.append(partStep('←', 'Poprzednia część', index > 0 ? partAnchor(parts[index - 1], index - 1) : ''));
  switcher.append(partStep('→', 'Następna część', index < total - 1 ? partAnchor(parts[index + 1], index + 1) : ''));
  head.append(switcher);
  section.append(head);

  const audioSlot = el('div', 'part-audio');
  section.append(audioSlot);
  const range = part.audio && typeof part.audio === 'object' ? part.audio : {};
  mountPartAudio(audioSlot, player, {
    id: part.id || `part-${index + 1}`,
    start: range.start,
    end: range.end,
  });

  section.append(renderReading(part));
  section.append(renderPartQuiz(part, index));
  return section;
}

function partStep(symbol, label, anchor) {
  const button = el('button', 'part-step', symbol);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  if (!anchor) {
    button.disabled = true;
    return button;
  }
  button.addEventListener('click', () => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return button;
}

function usesContent(part) {
  return Array.isArray(part?.content) && part.content.length > 0;
}

function renderTextBlock(paragraphs, vocabulary) {
  const text = el('div', 'part-text');
  text.append(renderParagraphs({ paragraphs: paragraphs || [], vocabulary }));
  return text;
}

function renderInlineImage(block) {
  const src = String(block?.src || '').trim();
  if (!src) return null;
  return renderImages([{ src, alt: block.alt || '' }]);
}

function renderReading(part) {
  const reading = el('div', 'part-reading');
  const vocabulary = part.vocabulary || [];
  if (usesContent(part)) {
    part.content.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      if (block.type === 'text') {
        reading.append(renderTextBlock(block.paragraphs, vocabulary));
        return;
      }
      if (block.type === 'image') {
        const figure = renderInlineImage(block);
        if (figure) reading.append(figure);
      }
    });
    return reading;
  }
  const images = Array.isArray(part.images) ? part.images.slice(0, 2) : [];
  if (images.length) reading.append(renderImages(images));
  reading.append(renderTextBlock(paragraphItems(part), vocabulary));
  return reading;
}

function imageUrl(path) {
  const raw = String(path || '').trim();
  const at = raw.indexOf('images/');
  return assetUrl(at >= 0 ? raw.slice(at) : raw.replace(/^(\.\.\/)+/, ''));
}

function renderImages(images) {
  const wrap = el('div', 'part-images');
  images.forEach((image) => {
    const figure = el('figure', 'part-figure');
    const src = String(image?.src || '').trim();
    if (!src) {
      figure.classList.add('is-empty');
      const slot = el('div', 'part-figure-slot');
      slot.append(el('span', 'part-figure-mark', 'Ilustracja'));
      figure.append(slot);
      wrap.append(figure);
      return;
    }
    const img = document.createElement('img');
    img.src = imageUrl(src);
    img.alt = image.alt || '';
    const zoom = el('button', 'part-figure-zoom');
    zoom.type = 'button';
    zoom.setAttribute('aria-expanded', 'false');
    zoom.setAttribute('aria-label', 'Powiększ ilustrację');
    zoom.append(img);
    zoom.addEventListener('click', () => {
      const open = figure.classList.toggle('is-expanded');
      zoom.setAttribute('aria-expanded', open ? 'true' : 'false');
      zoom.setAttribute('aria-label', open ? 'Pomniejsz ilustrację' : 'Powiększ ilustrację');
    });
    figure.append(zoom);
    wrap.append(figure);
  });
  return wrap;
}

function isRevealQuestion(item) {
  return Boolean(item && typeof item.question === 'string' && typeof item.answer === 'string');
}

function renderPartQuiz(part, index) {
  const check = el('section', 'part-check');
  check.setAttribute('aria-label', 'Pytania');
  const questions = Array.isArray(part.questions) ? part.questions : [];
  if (questions.length && questions.every(isRevealQuestion)) {
    check.append(el('h3', 'part-q-heading', 'Pytania'));
    const list = el('ol', 'part-q-list');
    questions.forEach((item, number) => {
      const row = el('li', 'part-q');
      row.append(el('p', 'part-q-kicker', `Pytanie ${number + 1}`));
      row.append(el('p', 'part-q-text', item.question));
      const answer = el('p', 'part-q-answer', `✓ ${item.answer}`);
      answer.hidden = true;
      const button = el('button', 'part-q-toggle', '▸ Pokaż odpowiedź');
      button.type = 'button';
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const open = answer.hidden;
        answer.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.textContent = open ? '▾ Ukryj odpowiedź' : '▸ Pokaż odpowiedź';
      });
      row.append(button, answer);
      list.append(row);
    });
    check.append(list);
    return check;
  }
  if (!questions.length) {
    check.append(el('h3', 'quiz-title', '🧠 Sprawdź, czy rozumiesz'));
    check.append(el('p', 'muted part-check-empty', 'Pytania do tej części pojawią się później.'));
    return check;
  }
  const slot = el('div', 'quiz-slot');
  check.append(slot);
  mountQuiz(slot, questions, {
    id: `part-${part.id || index + 1}`,
    title: '🧠 Sprawdź, czy rozumiesz',
  });
  return check;
}

function renderFinalQuiz(finalQuiz, chapterId, chapterName) {
  const section = el('section', 'final-test');
  section.id = 'mini-test';
  const questions = Array.isArray(finalQuiz.questions) ? finalQuiz.questions : [];
  const title = finalQuiz.title || `Mini test — ${chapterName}`;
  if (!questions.length) {
    section.append(el('h2', 'quiz-title final-title', `🏆 ${title}`));
    section.append(el('p', 'muted', 'Pytania do tego rozdziału pojawią się później.'));
    return section;
  }
  const slot = el('div', 'quiz-slot');
  section.append(slot);
  mountQuiz(slot, questions, {
    id: `final-${chapterId}`,
    title: `🏆 ${title}`,
  });
  return section;
}

function watchParts(buttons, sections) {
  const setCurrent = (id) => {
    buttons.forEach((button) => {
      const on = button.dataset.target === id;
      button.classList.toggle('is-current', on);
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setCurrent(visible[0].target.id);
    },
    { rootMargin: '-18% 0px -55% 0px', threshold: [0.15, 0.4] },
  );
  sections.forEach((section) => observer.observe(section));
  setCurrent(sections[0].id);
}

function chapterNav(book, index) {
  const nav = el('nav', 'chapter-nav');
  nav.setAttribute('aria-label', 'Sąsiednie rozdziały');
  const previous = book.chapters[index - 1];
  const next = book.chapters[index + 1];

  if (previous) {
    const link = el('a', 'btn btn-ghost', '← Poprzedni rozdział');
    link.href = pageHref('reader.html', { book: book.id, chapter: previous.id });
    nav.append(link);
  } else {
    nav.append(el('span', 'nav-spacer'));
  }

  if (next) {
    const link = el('a', 'btn btn-ghost', 'Następny rozdział →');
    link.href = pageHref('reader.html', { book: book.id, chapter: next.id });
    nav.append(link);
  }

  return nav;
}

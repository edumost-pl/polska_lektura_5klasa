import {
  assetUrl,
  el,
  isFileProtocol,
  loadBook,
  loadBookEntry,
  loadCatalog,
  LOCAL_SERVER_HINT,
  pad2,
  pageHref,
  queryParam,
} from './common.js';

const COVER_COLORS = ['#0e6b62', '#8d4b2b', '#2c5282', '#6b3f69', '#3f6b45'];

function coverColor(id) {
  const text = String(id || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index) * (index + 1)) % 997;
  }
  return COVER_COLORS[hash % COVER_COLORS.length];
}

function initials(title) {
  const words = String(title || '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && /\p{L}/u.test(word[0]));
  const first = words[0]?.[0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase() || 'PL';
}

function coverNode(book) {
  const cover = el('div', 'cover');
  cover.style.background = coverColor(book.id);
  const fallback = el('span', 'cover-fallback', initials(book.title));
  if (!book.cover) {
    cover.append(fallback);
    return cover;
  }
  const image = document.createElement('img');
  image.className = 'cover-img';
  image.alt = '';
  image.src = assetUrl(book.cover);
  image.addEventListener('error', () => {
    image.remove();
    cover.append(fallback);
  });
  cover.append(image);
  return cover;
}

function renderCard(book) {
  const card = el('article', 'book-card');
  const body = el('div', 'book-card-body');
  const title = el('h3', 'book-title');
  const titleLink = el('a', 'book-title-link', book.title);
  titleLink.href = pageHref('lektura.html', { book: book.id });
  title.append(titleLink);
  body.append(title);
  body.append(el('p', 'author', book.author || ''));
  const read = el('a', 'btn btn-primary', 'Czytaj');
  read.href = pageHref('lektura.html', { book: book.id });
  body.append(read);
  card.append(coverNode(book), body);
  return card;
}

async function initHome() {
  const list = document.querySelector('#book-list');
  if (!list) return;
  if (isFileProtocol()) {
    list.textContent = LOCAL_SERVER_HINT;
    return;
  }
  try {
    const catalog = await loadCatalog();
    const books = catalog.books || [];
    if (!books.length) {
      list.textContent = 'Nie ma jeszcze żadnej lektury. Dodaj ją w data/lektury.json.';
      return;
    }
    const cards = document.createDocumentFragment();
    for (const entry of books) {
      try {
        cards.append(renderCard(await loadBookEntry(entry)));
      } catch (error) {
        cards.append(el('p', 'status', error.message));
      }
    }
    list.replaceChildren(cards);
  } catch (error) {
    list.textContent = error.message || 'Nie udało się wczytać listy lektur.';
  }
}

function renderChapterRow(book, meta, index) {
  const row = el('li', 'chapter-row');
  const info = el('div', 'chapter-info');
  info.append(el('p', 'chapter-no', pad2(index + 1)));
  info.append(el('h3', 'chapter-name', meta.title));
  const link = el('a', 'btn btn-primary', 'Czytaj →');
  link.href = pageHref('reader.html', { book: book.id, chapter: meta.id });
  row.append(info, link);
  return row;
}

async function initBook() {
  const root = document.querySelector('#app');
  if (!root) return;
  if (isFileProtocol()) {
    root.textContent = LOCAL_SERVER_HINT;
    return;
  }

  const bookId = queryParam('book');
  try {
    if (!bookId) throw new Error('Nie wybrano lektury.');
    const book = await loadBook(bookId);
    document.title = `${book.title} · Polska Lektura`;
    root.replaceChildren();

    const home = el('a', 'back-link', '← Moje lektury');
    home.href = '../index.html';
    root.append(home);

    root.append(el('h1', 'book-heading', book.title));
    if (book.author) root.append(el('p', 'author author-lg', book.author));
    root.append(el('h2', 'section-heading', 'Rozdziały'));
    if (!book.chapters.length) {
      root.append(el('p', 'muted', 'W tej książce nie ma jeszcze rozdziałów.'));
    } else {
      const list = el('ol', 'chapter-list');
      book.chapters.forEach((chapter, index) => list.append(renderChapterRow(book, chapter, index)));
      root.append(list);
    }
  } catch (error) {
    root.replaceChildren(el('p', 'status', error.message || 'Nie udało się otworzyć książki.'));
    const home = el('a', 'btn btn-ghost', '← Moje lektury');
    home.href = '../index.html';
    root.append(home);
  }
}

const page = document.body?.dataset.page;
if (page === 'home') initHome();
else if (page === 'book') initBook();
else if (page === 'reader') {
  import('./reader.js').then((module) => module.initReader());
}

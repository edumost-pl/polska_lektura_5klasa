export const LOCAL_SERVER_HINT =
  'Otwórz projekt przez lokalny serwer. W folderze polska_lektura_5klasa uruchom: python3 -m http.server 8765 i wejdź na http://localhost:8765/';

export function isFileProtocol() {
  return window.location.protocol === 'file:';
}

export function appRoot() {
  return document.body.dataset.page === 'home' ? '' : '../';
}

export function assetUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return appRoot() + String(path).replace(/^\//, '');
}

export async function loadJson(path) {
  const response = await fetch(assetUrl(path));
  if (!response.ok) {
    const error = new Error(`Nie udało się wczytać pliku: ${path}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function pageHref(file, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const path = document.body.dataset.page === 'home' ? `pages/${file}` : file;
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export async function loadCatalog() {
  return loadJson('data/lektury.json');
}

export async function loadBookEntry(entry) {
  const book = await loadJson(`${entry.dir}/book.json`);
  return {
    ...book,
    id: entry.id,
    dir: entry.dir,
    chapters: Array.isArray(book.chapters) ? book.chapters : [],
  };
}

export async function loadBook(bookId) {
  const catalog = await loadCatalog();
  const entry = (catalog.books || []).find((book) => book.id === bookId);
  if (!entry) throw new Error('Nie ma takiej lektury.');
  return loadBookEntry(entry);
}

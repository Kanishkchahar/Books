import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const books = [
  { id: "ikigai", title: "Ikigai", author: "Héctor García & Francesc Miralles", file: "ikigai.pdf", cover: "covers/ikigai.jpg", pages: 123, className: "cover-ikigai", label: "The Japanese secret to a long and happy life" },
  { id: "power", title: "The 48 Laws of Power", author: "Robert Greene", file: "The-48-Laws-Of-Power.pdf", cover: "covers/power.jpg", pages: 476, className: "cover-power", label: "Robert Greene" },
  { id: "nature", title: "The Laws of Human Nature", author: "Robert Greene", file: "The Laws of Human Nature.pdf", cover: "covers/nature.jpg", pages: 690, className: "cover-nature", label: "Robert Greene" },
  { id: "premchand", title: "Premchand Ki Sarvashreshta Kahaniyan", author: "Munshi Premchand", file: "Premchand Ki Sarvashreshta Kahaniyan.pdf", cover: "covers/premchand.jpg", pages: 133, className: "cover-premchand", label: "Selected stories" }
];
const state = { book: null, pdf: null, page: 1, zoom: "fit-width", bookmarks: {}, notes: {}, filter: "all", query: "", readerSearch: "", searchToken: 0, pageMode: "normal", brightness: 100, continuous: true, spread: false, renderToken: 0, chromeTimer: null, pinchDistance: 0, swipeStart: null, outline: [], thumbnailToken: 0, loadToken: 0, appendPromise: null, searchTimer: null, textCache: new Map() };
const $ = (id) => document.getElementById(id);
const stored = JSON.parse(localStorage.getItem("quiet-shelf") || "{}");
state.bookmarks = stored.bookmarks || {};
state.notes = stored.notes || {};
const progress = stored.progress || {};

function save() { localStorage.setItem("quiet-shelf", JSON.stringify({ progress, bookmarks: state.bookmarks, notes: state.notes, lastBook: stored.lastBook, readerPrefs: stored.readerPrefs || {} })); }
function getProgress(book) { return progress[book.id] || { page: 1, lastRead: 0 }; }
function normalizeText(value) { return value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").toLocaleLowerCase(); }
function titleMarkup(book) { return `<div class="cover ${book.className}"><img src="${book.cover}" alt="" /><span class="cover-shade"></span><small>${book.label}</small><h3>${book.title}</h3></div>`; }
function renderLibrary() {
  const query = normalizeText(state.query);
  const visible = books.filter((book) => {
    const matchesText = normalizeText(`${book.title} ${book.author}`).includes(query);
    const matchesFilter = state.filter === "all" || getProgress(book).page > 1;
    return matchesText && matchesFilter;
  });
  $("bookGrid").innerHTML = visible.map((book) => {
    const current = getProgress(book); const percent = Math.min(100, Math.round((current.page / book.pages) * 100));
    return `<article class="book-card" data-book="${book.id}">${titleMarkup(book)}<div class="book-info"><h3>${book.title}</h3><p>${book.author}</p><div class="progress-track"><span style="width:${percent}%"></span></div></div></article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden", visible.length > 0);
  document.querySelectorAll(".book-card").forEach((card) => card.addEventListener("click", () => openReader(card.dataset.book)));
  $("bookCount").textContent = books.length;
  $("pagesRead").textContent = Object.values(progress).reduce((sum, item) => sum + Math.max(0, (item.page || 1) - 1), 0);
  const lastRead = Math.max(...Object.values(progress).map((item) => item.lastRead || 0), 0);
  $("readingStreak").textContent = lastRead && new Date(lastRead).toDateString() === new Date().toDateString() ? "1" : "0";
  renderContinueCard();
}
function renderContinueCard() {
  const book = stored.lastBook && books.find((item) => item.id === stored.lastBook);
  if (!book || !progress[book.id] || progress[book.id].page <= 1) { $("continueCard").classList.add("hidden"); return; }
  const current = getProgress(book); const percent = Math.min(100, Math.round((current.page / book.pages) * 100));
  $("continueCard").classList.remove("hidden"); $("continueCover").style.backgroundImage = `url("${book.cover}")`; $("continueTitle").textContent = book.title;
  $("continueMeta").textContent = `Page ${current.page} of ${book.pages} · ${percent}% complete`; $("continueProgress").style.width = `${percent}%`; $("continueCardButton").onclick = () => openReader(book.id);
}

async function openReader(id) {
  const loadToken = ++state.loadToken;
  state.renderToken += 1; state.thumbnailToken += 1; state.appendPromise = null; state.textCache.clear();
  state.book = books.find((book) => book.id === id); state.page = getProgress(state.book).page; state.zoom = "fit-width";
  const readerPrefs = stored.readerPrefs?.[id] || {};
  state.pageMode = readerPrefs.pageMode || "normal"; state.brightness = readerPrefs.brightness || 100;
  state.continuous = true; state.spread = false;
  applyPageMode(); $("brightnessRange").value = state.brightness; $("pageMode").value = state.pageMode;
  $("notesPanel").classList.add("hidden"); $("bookmarksPanel").classList.add("hidden"); $("navigationPanel").classList.add("hidden"); $("helpPanel").classList.add("hidden"); $("searchPanel").classList.add("hidden"); $("readerOverlay").classList.remove("chrome-hidden");
  $("viewMode").value = "continuous";
  stored.lastBook = id; save(); document.body.classList.add("reader-open"); $("readerOverlay").classList.remove("hidden"); $("loadingState").classList.remove("hidden"); $("pageStack").replaceChildren();
  $("readerBookTitle").textContent = state.book.title; $("readerPageLabel").textContent = "Opening...";
  try {
    const pdf = await pdfjsLib.getDocument(encodeURI(state.book.file)).promise;
    if (loadToken !== state.loadToken) return;
    state.pdf = pdf;
    $("pageTotal").textContent = `/ ${state.pdf.numPages}`;
    $("pageInput").max = state.pdf.numPages; $("progressRange").max = state.pdf.numPages; $("loadingState").classList.add("hidden");
    state.outline = await state.pdf.getOutline() || []; if (loadToken !== state.loadToken) return;
    renderOutline(); renderThumbnails(); renderPage(state.page);
  } catch (error) {
    $("loadingState").querySelector("span").textContent = "Could not open this PDF. Start a local server in this folder.";
    console.error(error);
  }
}
async function renderPage(pageNumber) {
  const pdf = state.pdf; const loadToken = state.loadToken;
  if (!pdf) return;
  state.page = Math.max(1, Math.min(pageNumber, pdf.numPages));
  await renderVisiblePages();
  if (loadToken !== state.loadToken || pdf !== state.pdf) return;
  const targetFrame = document.querySelector(`.page-frame[data-page="${state.page}"]`);
  if (targetFrame) $("pdfStage").scrollTo({ top: Math.max(0, targetFrame.offsetTop - 18), behavior: "smooth" });
  $("pageInput").value = state.page; $("readerPageLabel").textContent = `Page ${state.page} of ${pdf.numPages}`;
  $("progressRange").value = state.page; $("progressSummary").textContent = `Page ${state.page} of ${pdf.numPages} · about ${Math.max(1, Math.ceil((pdf.numPages - state.page) * 1.5))} min left`;
  $("zoomLabel").textContent = state.zoom === "fit-width" ? "Fit width" : state.zoom === "fit-page" ? "Fit page" : `${Math.round(state.zoom * 100)}%`;
  progress[state.book.id] = { page: state.page, lastRead: Date.now() }; save(); renderLibrary();
  $("bookmarkButton").classList.toggle("active", (state.bookmarks[state.book.id] || []).includes(state.page));
  document.querySelectorAll(".thumbnail-item").forEach((item) => item.classList.toggle("active", Number(item.dataset.page) === state.page));
  renderBookmarks();
}
async function renderVisiblePages() {
  const token = ++state.renderToken; const stage = $("pdfStage"); const stack = $("pageStack");
  const pages = state.spread && window.innerWidth >= 1100 ? [state.page, Math.min(state.page + 1, state.pdf.numPages)] : state.continuous ? [state.page, Math.min(state.page + 1, state.pdf.numPages), Math.min(state.page + 2, state.pdf.numPages)] : [state.page];
  stack.classList.toggle("spread", pages.length === 2); stack.classList.toggle("continuous", state.continuous);
  stack.replaceChildren();
  await appendPageFrames(pages[0], pages[pages.length - 1], token);
  if (token === state.renderToken) applyPageMode();
}
async function appendPageFrames(startPage, endPage, token = ++state.renderToken) {
  if (state.appendPromise) return state.appendPromise;
  state.appendPromise = appendPageFramesInternal(startPage, endPage, token).finally(() => { state.appendPromise = null; });
  return state.appendPromise;
}
async function appendPageFramesInternal(startPage, endPage, token) {
  const stage = $("pdfStage"); const stack = $("pageStack");
  const existing = new Set([...stack.querySelectorAll(".page-frame")].map((frame) => Number(frame.dataset.page)));
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    if (existing.has(pageNumber) || pageNumber > state.pdf.numPages) continue;
    const page = await state.pdf.getPage(pageNumber); if (token !== state.renderToken) return;
    const base = page.getViewport({ scale: 1 }); const availableWidth = Math.min(stage.clientWidth - 60, 1100);
    const scale = state.zoom === "fit-width" ? Math.max(.5, availableWidth / base.width) : state.zoom === "fit-page" ? Math.max(.5, Math.min(availableWidth / base.width, (stage.clientHeight - 80) / base.height)) : state.zoom;
    const viewport = page.getViewport({ scale }); const frame = document.createElement("div"); frame.className = "page-frame"; frame.dataset.page = pageNumber;
    const canvas = document.createElement("canvas"); const context = canvas.getContext("2d", { alpha: false }); const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio); canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    await page.render({ canvasContext: context, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
    frame.append(canvas); stack.append(frame);
  }
}
function applyPageMode() {
  const overlay = $("readerOverlay"); overlay.classList.remove("page-dark", "page-sepia", "page-warm"); if (state.pageMode !== "normal") overlay.classList.add(`page-${state.pageMode}`); overlay.style.setProperty("--page-brightness", `${state.brightness / 100}`);
}
function closeReader() { state.loadToken += 1; state.renderToken += 1; state.thumbnailToken += 1; state.pdf = null; state.appendPromise = null; document.body.classList.remove("reader-open"); if ("speechSynthesis" in window) speechSynthesis.cancel(); $("readerOverlay").classList.add("hidden"); renderLibrary(); }
function toggleSearch() { $("searchPanel").classList.toggle("hidden"); if (!$("searchPanel").classList.contains("hidden")) $("readerSearch").focus(); }
function toggleNotes() { $("notesPanel").classList.toggle("hidden"); renderNotes(); }
function toggleBookmarks() { $("bookmarksPanel").classList.toggle("hidden"); renderBookmarks(); }
function renderNotes() {
  const list = $("notesList"); list.replaceChildren();
  (state.notes[state.book.id] || []).forEach((note) => { const item = document.createElement("div"); item.className = "note-item"; item.textContent = note.text; const meta = document.createElement("small"); meta.textContent = `Page ${note.page} · ${note.date}`; item.append(meta); list.append(item); });
}
function toggleBookmark() {
  const pages = state.bookmarks[state.book.id] || []; const index = pages.indexOf(state.page);
  index >= 0 ? pages.splice(index, 1) : pages.push(state.page); state.bookmarks[state.book.id] = pages; save();
  $("bookmarkButton").classList.toggle("active", pages.includes(state.page));
  renderBookmarks();
}
function renderBookmarks() {
  if (!state.book) return;
  const pages = [...(state.bookmarks[state.book.id] || [])].sort((a, b) => a - b);
  const list = $("bookmarksList"); list.replaceChildren();
  if (!pages.length) { list.innerHTML = `<div class="panel-empty">No saved pages yet.<br />Use ☆ while reading.</div>`; return; }
  pages.forEach((page) => { const item = document.createElement("button"); item.className = "bookmark-item"; item.innerHTML = `<span>Page ${page}</span><b>→</b>`; item.onclick = () => { toggleBookmarks(); renderPage(page); }; list.append(item); });
}
async function renderThumbnails() {
  if (!state.pdf) return; const token = ++state.thumbnailToken; const list = $("thumbnailList"); list.replaceChildren();
  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const item = document.createElement("button"); item.className = "thumbnail-item"; item.dataset.page = pageNumber; item.innerHTML = `<span>Page ${pageNumber}</span>`;
    item.onclick = () => renderPage(pageNumber); list.append(item);
    if (pageNumber <= 12) { const page = await state.pdf.getPage(pageNumber); if (token !== state.thumbnailToken) return; const viewport = page.getViewport({ scale: .13 }); const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise; item.prepend(canvas); }
  }
}
function renderOutline() {
  const list = $("outlineList"); list.replaceChildren();
  if (!state.outline.length) { list.innerHTML = `<div class="panel-empty">This PDF has no table of contents.</div>`; return; }
  const addItems = (items, parent) => items.forEach((entry) => { const button = document.createElement("button"); button.className = "outline-item"; button.textContent = entry.title; button.onclick = async () => { try { const destination = await state.pdf.getDestination(entry.dest); if (!destination) return; const page = await state.pdf.getPageIndex(destination[0]); renderPage(page + 1); } catch (error) { console.warn("Could not open outline destination", error); } }; parent.append(button); if (entry.items?.length) addItems(entry.items, parent); });
  addItems(state.outline, list);
}
function exportNotes() {
  if (!state.book) return; const notes = state.notes[state.book.id] || []; const bookmarks = state.bookmarks[state.book.id] || [];
  const markdown = `# ${state.book.title}\n\n## Notes\n\n${notes.map((note) => `- **Page ${note.page}** — ${note.text}`).join("\n") || "_No notes yet._"}\n\n## Bookmarks\n\n${bookmarks.map((page) => `- Page ${page}`).join("\n") || "_No bookmarks yet._"}\n`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" })); link.download = `${state.book.title.replace(/[^\w]+/g, "-")}-notes.md`; link.click(); URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.filter = button.dataset.filter; renderLibrary();
}));
$("librarySearch").addEventListener("input", (event) => { state.query = event.target.value; renderLibrary(); });
$("brandLink").addEventListener("click", (event) => { event.preventDefault(); closeReader(); });
$("resumeButton").addEventListener("click", () => {
  const last = stored.lastBook && books.find((book) => book.id === stored.lastBook); openReader(last?.id || books[0].id);
});
$("closeReader").addEventListener("click", closeReader); $("prevPage").addEventListener("click", () => renderPage(state.page - 1)); $("nextPage").addEventListener("click", () => renderPage(state.page + 1));
$("pageInput").addEventListener("change", (event) => renderPage(Number(event.target.value)));
$("progressRange").addEventListener("input", (event) => renderPage(Number(event.target.value)));
$("zoomOut").addEventListener("click", () => { state.zoom = Math.max(.5, (typeof state.zoom === "number" ? state.zoom : 1) - .1); renderPage(state.page); });
$("zoomIn").addEventListener("click", () => { state.zoom = Math.min(2.5, (typeof state.zoom === "number" ? state.zoom : 1) + .1); renderPage(state.page); });
$("fitWidth").addEventListener("click", () => { state.zoom = "fit-width"; renderPage(state.page); });
$("fitPage").addEventListener("click", () => { state.zoom = "fit-page"; renderPage(state.page); });
$("actualSize").addEventListener("click", () => { state.zoom = 1; renderPage(state.page); });
$("pageMode").addEventListener("change", (event) => { state.pageMode = event.target.value; saveReaderPrefs(); applyPageMode(); });
$("brightnessRange").addEventListener("input", (event) => { state.brightness = Number(event.target.value); saveReaderPrefs(); applyPageMode(); });
$("viewMode").addEventListener("change", (event) => { state.continuous = event.target.value === "continuous"; state.spread = event.target.value === "spread"; renderPage(state.page); });
$("pdfStage").addEventListener("wheel", (event) => { if (!event.ctrlKey) return; event.preventDefault(); state.zoom = Math.max(.5, Math.min(2.5, (typeof state.zoom === "number" ? state.zoom : 1) - event.deltaY * .001)); renderPage(state.page); }, { passive: false });
$("pdfStage").addEventListener("touchstart", (event) => { if (event.touches.length === 2) state.pinchDistance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); }, { passive: true });
$("pdfStage").addEventListener("touchmove", (event) => { if (event.touches.length !== 2 || !state.pinchDistance) return; const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); const delta = distance - state.pinchDistance; if (Math.abs(delta) > 12) { state.zoom = Math.max(.5, Math.min(2.5, (typeof state.zoom === "number" ? state.zoom : 1) + delta * .002)); state.pinchDistance = distance; renderPage(state.page); } }, { passive: true });
$("pdfStage").addEventListener("touchend", () => { state.pinchDistance = 0; }, { passive: true });
$("pdfStage").addEventListener("touchstart", (event) => {
  if (event.touches.length === 1 && !state.pinchDistance) state.swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
$("pdfStage").addEventListener("touchend", (event) => {
  if (!state.swipeStart || state.pinchDistance || state.continuous) { state.swipeStart = null; return; }
  const touch = event.changedTouches[0]; if (!touch) return;
  const dx = touch.clientX - state.swipeStart.x; const dy = touch.clientY - state.swipeStart.y;
  state.swipeStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.25) renderPage(state.page + (dx < 0 ? 1 : -1));
}, { passive: true });
$("pdfStage").addEventListener("scroll", () => { const frames = [...document.querySelectorAll(".page-frame")]; const middle = $("pdfStage").scrollTop + $("pdfStage").clientHeight / 3; const current = frames.find((frame) => frame.offsetTop + frame.offsetHeight > middle); if (current && Number(current.dataset.page) !== state.page) { state.page = Number(current.dataset.page); updateReadingStatus(); } });
let scrollLoadFrame = 0;
$("pdfStage").addEventListener("scroll", () => {
  if (scrollLoadFrame) return;
  scrollLoadFrame = requestAnimationFrame(async () => {
    scrollLoadFrame = 0;
    if (!state.continuous || !state.pdf || $("pdfStage").scrollTop + $("pdfStage").clientHeight <= $("pdfStage").scrollHeight - 420) return;
    const lastFrame = [...document.querySelectorAll(".page-frame")].pop();
    const nextPage = Number(lastFrame?.dataset.page || state.page) + 1;
    if (nextPage <= state.pdf.numPages) await appendPageFrames(nextPage, Math.min(nextPage + 3, state.pdf.numPages));
  });
}, { passive: true });
$("readerOverlay").addEventListener("pointermove", showChrome); $("readerOverlay").addEventListener("pointerdown", showChrome); $("readerOverlay").addEventListener("touchstart", showChrome, { passive: true });
$("readerOverlay").addEventListener("dblclick", () => { state.continuous = !state.continuous; renderPage(state.page); });
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (!state.pdf || $("readerOverlay").classList.contains("hidden")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderPage(state.page), 160);
});
$("bookmarkButton").addEventListener("click", toggleBookmark); $("searchToggle").addEventListener("click", toggleSearch); $("closeSearch").addEventListener("click", toggleSearch); $("notesToggle").addEventListener("click", toggleNotes); $("closeNotes").addEventListener("click", toggleNotes); $("bookmarksToggle").addEventListener("click", toggleBookmarks); $("closeBookmarks").addEventListener("click", toggleBookmarks);
$("navigationToggle").addEventListener("click", () => $("navigationPanel").classList.toggle("hidden")); $("closeNavigation").addEventListener("click", () => $("navigationPanel").classList.add("hidden"));
document.querySelectorAll(".navigation-tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".navigation-tab").forEach((item) => item.classList.remove("active")); tab.classList.add("active"); $("thumbnailList").classList.toggle("hidden", tab.dataset.nav !== "thumbs"); $("outlineList").classList.toggle("hidden", tab.dataset.nav !== "outline"); }));
$("exportNotes").addEventListener("click", exportNotes); $("helpToggle").addEventListener("click", () => $("helpPanel").classList.toggle("hidden")); $("closeHelp").addEventListener("click", () => $("helpPanel").classList.add("hidden"));
$("readAloudButton").addEventListener("click", readCurrentPage);
$("saveNote").addEventListener("click", () => { const text = $("notesInput").value.trim(); if (!text) return; state.notes[state.book.id] = [{ text, page: state.page, date: new Date().toLocaleDateString() }, ...(state.notes[state.book.id] || [])]; $("notesInput").value = ""; save(); renderNotes(); });
$("fullscreenButton").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : $("readerOverlay").requestFullscreen());
$("themeToggle").addEventListener("click", () => { document.body.classList.toggle("dark-mode"); localStorage.setItem("quiet-shelf-theme", document.body.classList.contains("dark-mode") ? "dark" : "light"); });
$("readerSearch").addEventListener("input", async (event) => {
  state.readerSearch = normalizeText(event.target.value.trim());
  const token = ++state.searchToken;
  clearTimeout(state.searchTimer);
  if (!state.readerSearch || !state.pdf) { $("searchStatus").textContent = ""; return; }
  state.searchTimer = setTimeout(async () => {
    $("searchStatus").textContent = "Searching...";
    let matches = 0; let firstMatch = 0;
    for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
      let contents = state.textCache.get(pageNumber);
      if (!contents) {
        const text = await (await state.pdf.getPage(pageNumber)).getTextContent();
        contents = normalizeText(text.items.map((item) => item.str).join(" "));
        state.textCache.set(pageNumber, contents);
      }
      if (contents.includes(state.readerSearch)) { matches += 1; if (!firstMatch) firstMatch = pageNumber; }
      if (token !== state.searchToken) return;
    }
    $("searchStatus").textContent = matches ? `${matches} page${matches === 1 ? "" : "s"} found` : "No matches";
    if (firstMatch) renderPage(firstMatch);
  }, 220);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") { event.preventDefault(); $("librarySearch").focus(); }
  if ($("readerOverlay").classList.contains("hidden")) return;
  if (event.key === "ArrowRight" || event.key === " ") { event.preventDefault(); renderPage(state.page + 1); } if (event.key === "ArrowLeft") renderPage(state.page - 1); if (event.key.toLowerCase() === "b") toggleBookmark(); if (event.key.toLowerCase() === "n") toggleNotes(); if (event.key.toLowerCase() === "s") toggleSearch(); if (event.key.toLowerCase() === "t") $("navigationPanel").classList.toggle("hidden"); if (event.key.toLowerCase() === "f") document.fullscreenElement ? document.exitFullscreen() : $("readerOverlay").requestFullscreen(); if (event.key === "?") $("helpPanel").classList.toggle("hidden"); if (event.key === "Escape") closeReader();
});
if (localStorage.getItem("quiet-shelf-theme") === "dark") document.body.classList.add("dark-mode");
renderLibrary();

function saveReaderPrefs() {
  stored.readerPrefs = { ...(stored.readerPrefs || {}), [state.book.id]: { pageMode: state.pageMode, brightness: state.brightness } }; save();
}
function updateReadingStatus() {
  if (!state.pdf || !state.book) return;
  $("pageInput").value = state.page; $("progressRange").value = state.page; $("readerPageLabel").textContent = `Page ${state.page} of ${state.pdf.numPages}`;
  $("progressSummary").textContent = `Page ${state.page} of ${state.pdf.numPages} · about ${Math.max(1, Math.ceil((state.pdf.numPages - state.page) * 1.5))} min left`;
  progress[state.book.id] = { page: state.page, lastRead: Date.now() }; save();
}
function showChrome() {
  const overlay = $("readerOverlay"); overlay.classList.remove("chrome-hidden"); clearTimeout(state.chromeTimer);
  state.chromeTimer = setTimeout(() => overlay.classList.add("chrome-hidden"), 2400);
}
async function readCurrentPage() {
  if (!state.pdf || !("speechSynthesis" in window)) return;
  const content = await (await state.pdf.getPage(state.page)).getTextContent(); const text = content.items.map((item) => item.str).join(" ").trim();
  if (!text) return;
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-US"; speechSynthesis.speak(utterance);
}

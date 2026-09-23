'use strict';

/* ============================================================
   Navidv0 SPA — routing, rendering, 18+ blur, auto-sync
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const REVEAL_KEY = 'nvd-revealed';

function getRevealed() {
  try {
    return JSON.parse(localStorage.getItem(REVEAL_KEY) || '[]');
  } catch {
    return [];
  }
}
function setRevealed(slug) {
  const list = getRevealed();
  if (!list.includes(slug)) {
    list.push(slug);
    localStorage.setItem(REVEAL_KEY, JSON.stringify(list));
  }
}
function isRevealed(slug) {
  return getRevealed().includes(slug);
}

// ---------- state ----------
const state = {
  lastUpdated: null,
  counts: { movies: 0, episodes: 0, withSources: 0 },
  total: 0,
  adult: 0,
  pages: 1,
  genres: [],
  years: [],
  countries: [],
  slider: [],
};

let pendingReveal = null; // {slug, nav}

// ---------- API ----------
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('API error ' + res.status);
  return res.json();
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  return p.toString();
}

// ---------- toast ----------
function toast(title, msg, type = '') {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<b>${esc(title)}</b><p>${esc(msg)}</p>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 320);
  }, 4600);
}

// ---------- hero slider ----------
function renderHero(slides) {
  if (!slides.length) return '';
const safe = slides
    .map((s, i) => {
      const adult = s.adult;
      const hidden = adult && !isRevealed(s.slug);
      const bgStyle = `background-image:url("${esc(s.img)}")`;
      return `
      <div class="hero-slide ${i === 0 ? 'active' : ''} ${hidden ? 'adult-hidden' : ''}">
        <div class="hero-bg" style="${bgStyle}"></div>
        <div class="hero-shade"></div>
        ${hidden ? '<div class="hero-adult-badge"><span>18+</span><small>🔒 Adult content</small></div>' : ''}
        <div class="hero-info">
          <span class="hero-chip">◆ Latest Release</span>
          <h2 class="hero-title">${esc(s.title)}</h2>
          <div class="hero-meta">
            <span class="hero-tag">${esc(s.quality || 'HD')}</span>
            ${s.imdb ? `<span class="hero-tag imdb">★ ${esc(s.imdb)}</span>` : ''}
            <span class="hero-tag">${esc(s.genres.join(', ') || 'Movie')}</span>
            ${adult ? '<span class="hero-tag adult">18+</span>' : ''}
          </div>
          ${s.desc ? `<p class="hero-desc">${esc(s.desc)}</p>` : ''}
          <div class="hero-btns">
            <button class="btn btn-grad" data-goto="${esc(s.slug)}">▶ Watch Now</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const dots = slides
    .map((_, i) => `<span class="${i === 0 ? 'active' : ''}" data-i="${i}"></span>`)
    .join('');

  return `
  <section class="hero" id="hero">
    ${safe}
    <div class="hero-dots">${dots}</div>
    <div class="hero-nav">
      <button data-hero="prev" aria-label="Previous">◀</button>
      <button data-hero="next" aria-label="Next">▶</button>
    </div>
  </section>`;
}

let heroTimer = null;
function initHero() {
  const hero = $('#hero');
  if (!hero) return;
  const slides = $$('.hero-slide', hero);
  const dots = $$('.hero-dots span', hero);
  let cur = 0;
  const show = (n) => {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === cur));
    dots.forEach((d, i) => d.classList.toggle('active', i === cur));
  };
  const next = () => show(cur + 1);
  hero.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hero]');
    if (b) show(cur + (b.dataset.hero === 'next' ? 1 : -1));
    const d = e.target.closest('[data-i]');
    if (d) show(+d.dataset.i);
  });
  clearInterval(heroTimer);
  heroTimer = setInterval(next, 6500);
}

// ---------- card ----------
function cardHTML(it, idx = 0) {
  const revealed = isRevealed(it.slug);
  const isNew =
    it.added && Date.now() - new Date(it.added).getTime() < 2 * 86400000;
  const genreTags = (it.genres || []).slice(0, 3);

  const img = it.img
    ? `<img class="card-img" loading="lazy" src="${esc(it.img)}" alt="${esc(it.title)}">`
    : `<div class="card-img" style="display:grid;place-items:center;color:#667;font-weight:800">—</div>`;

  const adultOverlay = it.adult && !revealed ? `
    <div class="card-18" data-confirm="${esc(it.slug)}">
      <div class="card-18-badge">18+</div>
      <span class="lock">🔒 Click to reveal</span>
    </div>` : '';

  return `
  <article class="card ${revealed ? 'revealed' : ''}" data-slug="${esc(it.slug)}" style="animation-delay:${Math.min(idx * 28, 400)}ms">
    <a class="card-link" href="/watch/${esc(it.slug)}" data-link data-path="/watch/${esc(it.slug)}">
      <div class="card-imgwrap">
        ${it.adult && !revealed ? `<div class="card-blur" style="background-image:url('${esc(it.img)}')"></div>` : img}
        ${isNew ? '<span class="card-new">New</span>' : ''}
        ${it.quality ? `<span class="card-quality">${esc(it.quality)}</span>` : ''}
        ${adultOverlay}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(it.title)}</div>
        <div class="card-sub">
          <span>${esc(it.year || '—')}</span>
          ${it.duration && it.duration !== '-' ? `<span class="dot"></span><span>${esc(it.duration)}</span>` : ''}
          ${it.type ? `<span class="card-type">${esc(it.type)}</span>` : ''}
          ${it.imdb ? `<span class="dot"></span><span class="card-rat">★ ${esc(it.imdb)}</span>` : ''}
        </div>
      </div>
      ${genreTags.length ? `<div class="card-genres">${genreTags.map((g) => `<span class="card-genre">${esc(g)}</span>`).join('')}</div>` : ''}
    </a>
  </article>`;
}

// ---------- grid views ----------
async function renderGrid({ title, subtitle, params, mode }) {
  const view = $('#view');
  view.innerHTML = `<div class="sec-head"><div class="sec-title"><span class="bar"></span><span>${esc(title)}</span>${subtitle ? ` <em>${esc(subtitle)}</em>` : ''}</div></div><div class="filters" id="filters"></div><div class="grid" id="grid"></div><div class="pager" id="pager"></div>`;

  const filters = $('#filters');
  if (mode !== 'plain') {
    filters.innerHTML = renderFilters(params);
    bindFilters(params, title);
  }

  await loadGrid(params);
}

function renderFilters(params) {
  return `
    <select class="filter-select" data-f="genre">
      <option value="">All Genres</option>
      ${state.genres.map((g) => `<option value="${esc(g)}" ${params.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
    </select>
    <select class="filter-select" data-f="year">
      <option value="">All Years</option>
      ${state.years.map((y) => `<option value="${esc(y)}" ${params.year === y ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
    <select class="filter-select" data-f="country">
      <option value="">All Countries</option>
      ${state.countries.map((c) => `<option value="${esc(c)}" ${params.country === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
    </select>
    <div class="toggle-group">
      <button class="toggle-btn ${!params.type || params.type === 'Movie' ? 'active' : ''}" data-t="Movie">Movies</button>
      <button class="toggle-btn ${params.type === 'TV' ? 'active' : ''}" data-t="TV">TV</button>
    </div>
    <select class="filter-select sort-pill" data-f="sort">
      <option value="new" ${params.sort !== 'rating' ? 'selected' : ''}>Newest</option>
      <option value="rating" ${params.sort === 'rating' ? 'selected' : ''}>Top Rated</option>
    </select>`;
}

function bindFilters(params, title) {
  $('#filters').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t) {
      params.type = t.dataset.t === 'TV' ? 'TV' : 'Movie';
      params.page = 1;
      history.replaceState(null, '', `?${qs(params)}`);
      if (title && route === '/movies' || route === '/tv' || route === '/18') renderGrid({ title, params, mode: 'f' });
    }
  });
  $('#filters').addEventListener('change', (e) => {
    const f = e.target.closest('[data-f]');
    if (!f) return;
    const key = f.dataset.f;
    params[key] = f.value;
    params.page = 1;
    history.replaceState(null, '', `?${qs(params)}`);
    renderGrid({ title, params, mode: 'f' });
  });
}

async function loadGrid(params) {
  const grid = $('#grid');
  const pager = $('#pager');
  grid.innerHTML = Array.from({ length: 12 }).map(() => '<div class="skeleton"></div>').join('');
  try {
    const data = await api('/api/movies?' + qs(params));
    grid.innerHTML = data.items.length
      ? data.items.map(cardHTML).join('')
      : `<div class="filter-empty"><div class="big">🎬</div><h3>No titles match</h3><p>Try another filter or hit sync to pull the newest releases.</p></div>`;

    const totalPages = data.pages;
    const parts = [];
    if (data.page > 1) parts.push(`<button class="page-btn" data-p="${data.page - 1}">← Prev</button>`);
    const start = Math.max(1, data.page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) parts.push(`<button class="page-num ${i === data.page ? 'active' : ''}" data-p="${i}">${i}</button>`);
    if (data.page < totalPages) parts.push(`<button class="page-btn" data-p="${data.page + 1}">Next →</button>`);
    pager.innerHTML = parts.join('') + `<span class="page-info">${data.total.toLocaleString()} titles</span>`;

    pager.querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => {
        params.page = +b.dataset.p;
        history.replaceState(null, '', `?${qs(params)}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        loadGrid(params);
        grid.innerHTML = Array.from({ length: 12 }).map(() => '<div class="skeleton"></div>').join('');
      })
    );
  } catch (e) {
    grid.innerHTML = '<div class="filter-empty"><div class="big">⚠️</div><h3>Could not load</h3><p>' + esc(e.message) + '</p></div>';
  }
}

// ---------- home ----------
async function renderHome() {
  const view = $('#view');
  view.innerHTML = '<div class="loader-wrap"><div class="loader-ring"></div><p class="loader-text">Loading the grid…</p></div>';

  let slider = state.slider;
  if (!slider.length) {
    try {
      const s = await api('/api/slider');
      slider = s.slider;
    } catch {}
  }

  let html = '';
  if (slider.length) html += renderHero(slider);
  html += `
    <div class="sec-head"><div class="sec-title"><span class="bar"></span><span>Latest <em>Movies</em></span></div><a class="sec-more" href="/movies" data-link data-path="/movies">View All →</a></div>
    <div class="grid" id="homeMovies"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div class="sec-head" style="margin-top:40px"><div class="sec-title"><span class="bar" style="background:linear-gradient(120deg,#ff2d95,#8b5cf6)"></span><span>Latest <em>Episodes</em></span></div><a class="sec-more" href="/tv" data-link data-path="/tv">View All →</a></div>
    <div class="grid" id="homeTv"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;

  view.innerHTML = html;

  try {
    const mv = await api('/api/movies?' + qs({ type: 'Movie', per: 18, page: 1 }));
    $('#homeMovies').innerHTML = mv.items.map(cardHTML).join('') || '<div class="filter-empty">No movies yet — hit sync.</div>';
  } catch {}
  try {
    const tv = await api('/api/movies?' + qs({ type: 'TV', per: 12, page: 1 }));
    $('#homeTv').innerHTML = tv.items.map(cardHTML).join('') || '<div class="filter-empty">No episodes yet.</div>';
  } catch {}

  initHero();
  bindCards(document);
}

// ---------- watch page ----------
async function renderWatch(slug) {
  const view = $('#view');
  view.innerHTML = '<div class="loader-wrap"><div class="loader-ring"></div><p class="loader-text">Loading player…</p></div>';
  let item;
  try {
    const data = await api('/api/movie/' + encodeURIComponent(slug));
    item = data.item;
  } catch (e) {
    view.innerHTML = `<div class="filter-empty"><div class="big">🎬</div><h3>Not found</h3><p>${esc(e.message)}</p><div style="margin-top:14px"><a class="btn btn-grad" href="/" data-link data-path="/">← Go Home</a></div></div>`;
    return;
  }

  const adult = item.adult;
  const revealed = adult && isRevealed(item.slug);
  const player = buildPlayerHTML(item, revealed);

  document.title = `${item.title} — Navidv0`;

  view.innerHTML = `
  <div class="watch-wrap" data-slug="${esc(item.slug)}">
    <div class="watch-main">
      <div class="watch-hero">
        <div class="watch-cover" style="background-image:url('${esc(item.img || item.thumb || '')}')"></div>
        <div class="watch-player-shell" id="playerShell">${player}</div>
        <div class="watch-info">
          <h1 class="watch-title">${esc(item.title)}${item.year ? ` <em>(${esc(item.year)})</em>` : ''}</h1>
          <div class="watch-meta">
            ${item.quality ? `<span class="hero-tag">${esc(item.quality)}</span>` : ''}
            ${item.imdb ? `<span class="hero-tag imdb">★ ${esc(item.imdb)} IMDb</span>` : ''}
            ${item.duration ? `<span class="hero-tag">⏱ ${esc(item.duration)}</span>` : ''}
            ${(item.genres || []).map((g) => `<span class="hero-tag ${g.toLowerCase() === '18+' ? 'adult' : ''}">${esc(g)}</span>`).join('')}
          </div>
          ${item.desc ? `<p class="watch-desc">${esc(item.desc)}</p>` : ''}
          <div class="watch-facts">
            ${item.release ? `<div class="fact"><b>Release</b><span>${esc(item.release)}</span></div>` : ''}
            ${(item.countries || []).length ? `<div class="fact"><b>Country</b><span>${esc(item.countries.join(', '))}</span></div>` : ''}
            ${(item.directors || []).length ? `<div class="fact"><b>Director</b><span>${esc(item.directors.join(', '))}</span></div>` : ''}
            ${item.duration ? `<div class="fact"><b>Runtime</b><span>${esc(item.duration)}</span></div>` : ''}
            ${item.quality ? `<div class="fact"><b>Quality</b><span>${esc(item.quality)}</span></div>` : ''}
          </div>
          <div class="watch-fallback">
            ${item.sources && item.sources.length > 1 ? `<span class="src-badge" data-src="all">⚡ Auto source</span>` : ''}
            <a class="src-badge" href="${esc(item.url || 'https://jaikonmovie.com/' + slug + '/')}" target="_blank" rel="noopener">↗ Source page</a>
          </div>
        </div>
      </div>
    </div>
    <aside class="watch-side">
      ${(item.actors || []).length ? `<div class="side-card"><h4>Cast</h4><div class="stars-list">${item.actors.map((a) => `<span class="star-chip">${esc(a)}</span>`).join('')}</div></div>` : ''}
      ${(item.tracks || []).length ? `<div class="side-card"><h4>Subtitles</h4><div class="track-list">${item.tracks.map((t) => `<div class="track-item"><span>${esc(t.label || 'Track')}</span><span style="color:var(--muted);font-size:.75rem">${esc(t.kind || 'captions')}</span></div>`).join('')}</div></div>` : ''}
      ${(item.gallery || []).length ? `<div class="side-card"><h4>Gallery</h4><div class="gallery" id="gallery">${item.gallery.map((g) => `<img loading="lazy" src="${esc(g.thumb)}" data-full="${esc(g.full)}" alt="">`).join('')}</div></div>` : ''}
    </aside>
  </div>`;

  const gal = $('#gallery');
  if (gal) {
    gal.addEventListener('click', (e) => {
      const img = e.target.closest('img[data-full]');
      if (img) window.open(img.dataset.full, '_blank');
    });
  }

  // 18+ blur overlay
  if (adult && !revealed) {
    $('.watch-player-shell').insertAdjacentHTML(
      'beforeend',
      `<div class="watch-blur-overlay" id="watchBlur">
        <div>
          <div class="watch-18-badge">18+</div>
          <h3>Adult Content</h3>
          <p>This title is blurred. Tap to confirm you are 18 or older and unlock the player.</p>
          <button class="btn btn-primary" type="button" data-unlock="${esc(item.slug)}">I'm 18+ — Unlock</button>
        </div>
      </div>`
    );
  }

  $('#view').addEventListener('click', (e) => {
    const unlock = e.target.closest('[data-unlock]');
    if (unlock) {
      setRevealed(unlock.dataset.unlock);
      const shell = $('.watch-player-shell');
      const ov = $('#watchBlur');
      if (ov) ov.remove();
      const fresh = buildPlayerHTML(item, true);
      shell.innerHTML = fresh;
      initVideo(shell);
    }
  });
}

function buildPlayerHTML(item, revealed) {
  if (!item.sources || !item.sources.length) {
    return `<div style="text-align:center;color:#99a;padding:40px">
      <div style="font-size:2rem">🎬</div><p>This title is still being indexed. Hit sync and try again in a minute.</p>
      <a class="src-badge" href="${esc(item.url || '#')}" target="_blank" rel="noopener">↗ Watch on source</a>
    </div>`;
  }
  const srcs = item.sources.map((s) => `<source src="${esc(s.file)}" label="${esc(s.label || 'Default')}">`).join('');
  const tracks = (item.tracks || [])
    .map((t, i) => `<track src="${esc(t.file)}" kind="subtitles" srclang="${esc(t.label || 'en')}" label="${esc(t.label || 'Subtitle')}" ${i === 0 ? 'default' : ''}>`)
    .join('');
  return `<video id="nvdVideo" controls playsinline preload="metadata" poster="${esc(item.thumb || item.img || '')}">
    ${srcs}${tracks}
  </video>`;
}

function initVideo(root) {
  const v = $('#nvdVideo', root);
  if (!v) return;
  const sources = $$('source', v);
  if (!sources.length) return;

  const trySource = (idx) => {
    const src = sources[idx];
    if (!src) return;
    const file = src.getAttribute('src');
    const isHls = /\.m3u8($|\?)/i.test(file) || file.includes('manifest');
    if (isHls && window.Hls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 60, enableWorker: true });
      hls.loadSource(file);
      hls.attachMedia(v);
      v.__hls = hls;
      const nextSrc = sources[idx + 1];
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          trySource(idx + 1);
        }
      });
    } else {
      v.src = file;
      if (idx === 0) v.load();
    }
  };

  trySource(0);

  v.addEventListener('error', () => {
    if (v.__hls) {
      v.__hls.destroy();
      v.__hls = null;
    }
    const cur = sources.findIndex((s) => s.getAttribute('src') === (v.currentSrc || '').split('?')[0]);
    trySource(cur + 1);
    if (cur >= 0) v.src = sources[cur + 1] ? sources[cur + 1].getAttribute('src') : v.src;
  });
}

// ---------- 18+ confirm modal ----------
function openAgeModal(payload) {
  pendingReveal = payload;
  const modal = $('#ageModal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeAgeModal() {
  $('#ageModal').hidden = true;
  document.body.style.overflow = '';
  pendingReveal = null;
}

function applyReveal() {
  if (!pendingReveal) return;
  const { slug, navigate } = pendingReveal;
  setRevealed(slug);
  closeAgeModal();
  // unblur the card in place
  const card = document.querySelector(`.card[data-slug="${CSS.escape(slug)}"]`);
  if (card) {
    card.classList.add('revealed');
    const link = card.querySelector('.card-link');
    if (navigate && link) {
      window.location.href = link.getAttribute('href');
      return;
    }
  } else if (navigate) {
    window.location.href = '/watch/' + slug;
  }
}

function bindCards(root) {
  root.addEventListener('click', (e) => {
    const confirmBtn = e.target.closest('[data-confirm]');
    if (confirmBtn) {
      e.preventDefault();
      e.stopPropagation();
      const slug = confirmBtn.dataset.confirm;
      const card = confirmBtn.closest('.card');
      const link = card && card.querySelector('.card-link');
      const href = link ? link.getAttribute('href') : '/watch/' + slug;
      const doNav = () => {
        window.location.href = href;
      };
      openAgeModal({ slug, navigate: true, onYes: doNav });
      return;
    }
  });

  // gallery zoom etc handled elsewhere
}

// ---------- router ----------
let route = '/';

async function router() {
  const path = window.location.pathname;
  const paramsObj = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  route = path;

  document.title = 'Navidv0 — Watch Free Movies';
  try {
    if (path === '/' || path === '') {
      await renderHome();
    } else if (path === '/movies' || path === '/tv' || path === '/18') {
      const isTV = path === '/tv';
      const is18 = path === '/18';
      const params = {
        page: paramsObj.page || 1,
        per: paramsObj.per || 36,
        type: isTV ? 'TV' : is18 ? undefined : paramsObj.type || 'Movie',
        genre: paramsObj.genre || '',
        year: paramsObj.year || '',
        country: paramsObj.country || '',
        sort: paramsObj.sort || 'new',
        q: paramsObj.q || '',
        ...(is18 ? { adult: '1', type: undefined } : {}),
      };
      await renderGrid({
        title: is18 ? '18+' : isTV ? 'TV Series' : 'Movies',
        subtitle: is18 ? 'Adult Collection' : '',
        params,
        mode: 'f',
      });
      bindCards(document);
    } else if (path.startsWith('/watch/')) {
      const slug = decodeURIComponent(path.split('/')[2] || '');
      await renderWatch(slug);
    } else if (path.startsWith('/search')) {
      const params = { q: paramsObj.q || '', page: paramsObj.page || 1, per: 36, type: '' };
      await renderGrid({ title: 'Search', subtitle: params.q ? `"${params.q}"` : '', params, mode: 'f' });
      bindCards(document);
    } else {
      renderHome();
    }
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="filter-empty"><div class="big">⚠️</div><h3>Something broke</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ---------- nav / dropdown / search ----------
function initNav() {
  $$('[data-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const p = a.dataset.path;
      history.pushState(null, '', p);
      router();
    });
  });

  window.addEventListener('popstate', router);

  const burger = $('#burgerBtn');
  const links = $('#navLinks');
  burger.addEventListener('click', () => links.classList.toggle('open'));

  document.addEventListener('click', (e) => {
    const dd = document.querySelector('.nav-dropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
  });
  $('.dropdown-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('.nav-dropdown').classList.toggle('open');
  });

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    window.location.href = '/search?q=' + encodeURIComponent(q);
  });
}

function buildDropdown() {
  const g = $('#ddGenres');
  const y = $('#ddYears');
  const c = $('#ddCountries');
  g.innerHTML = state.genres
    .map((x) => `<button class="dd-chip ${x.toLowerCase() === '18+' ? 'adult' : ''}" data-g="${esc(x)}">${esc(x)}</button>`)
    .join('');
  y.innerHTML = state.years
    .slice(0, 14)
    .map((x) => `<button class="dd-chip" data-y="${esc(x)}">${x}</button>`)
    .join('');
  c.innerHTML = state.countries
    .slice(0, 20)
    .map((x) => `<button class="dd-chip" data-c="${esc(x)}">${esc(x)}</button>`)
    .join('');

  g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (b) navigate(`/movies?genre=${encodeURIComponent(b.dataset.g)}`);
  });
  y.addEventListener('click', (e) => {
    const b = e.target.closest('[data-y]');
    if (b) navigate(`/movies?year=${encodeURIComponent(b.dataset.y)}`);
  });
  c.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (b) navigate(`/movies?country=${encodeURIComponent(b.dataset.c)}`);
  });
}

function navigate(p) {
  history.pushState(null, '', p);
  router();
}

// ---------- sync ----------
async function runSync(manual = true) {
  const btn = $('#syncBtn');
  btn.classList.add('spinning');
  btn.disabled = true;
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      toast('Sync complete', data.added > 0 ? `${data.added} new title${data.added > 1 ? 's' : ''} added! Total: ${data.after}` : 'No new titles. Everything up to date.', 'success');
      await refreshState(true);
    } else {
      toast('Sync failed', data.error || 'Unknown error', 'danger');
    }
  } catch (e) {
    toast('Sync failed', e.message, 'danger');
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

async function refreshState(forceRender = false) {
  try {
    const s = await api('/api/state');
    const prevTotal = state.total;
    state.lastUpdated = s.lastUpdated;
    state.counts = s.counts;
    state.total = s.total;
    state.adult = s.adult;
    state.pages = s.pages;
    state.genres = s.genres || [];
    state.years = s.years || [];
    state.countries = s.countries || [];
    $('#footCount').textContent = s.total.toLocaleString();
    $('#footSync').textContent = s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : '—';
    if (!document.querySelector('#ddGenres').children.length) buildDropdown();
    if (forceRender) router();
  } catch {}
}

// ---------- main ----------
async function main() {
  $('#yearNow').textContent = new Date().getFullYear();
  initNav();
  buildDropdown();
  await refreshState(false);

  $('#syncBtn').addEventListener('click', () => runSync(true));
  $('#ageYes').addEventListener('click', applyReveal);
  $('#ageNo').addEventListener('click', closeAgeModal);
  $('#ageModal').addEventListener('click', (e) => {
    if (e.target.id === 'ageModal') closeAgeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAgeModal();
  });

  // global click: cards navigate unless adult-unconfirmed
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (link) return; // handled by initNav
  });

  router();

  // poll for new movies in background
  setInterval(async () => {
    try {
      const s = await api('/api/state');
      if (s.lastUpdated && s.lastUpdated !== state.lastUpdated) {
        toast('New movies available', 'Catalog refreshed — new titles added.', 'success');
        state.lastUpdated = s.lastUpdated;
        state.total = s.total;
        $('#footCount').textContent = s.total.toLocaleString();
        $('#footSync').textContent = new Date(s.lastUpdated).toLocaleString();
        // refresh the current view's grid silently-ish
        router();
      }
    } catch {}
  }, 60000);
}

main();
'use strict';

// ============================================================
// app.js — shared request handler for Navidv0.
// Used locally (server.js) AND on Vercel (api/index.js).
// ============================================================

const fs = require('fs');
const path = require('path');
const url = require('url');

const syncMod = require('./sync');
const S = require('./lib/scraper');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'db.json');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const ADULT_GENRES = new Set(['18+', 'vivamax', 'vmx (vivamax)', '18']);
const isAdult = (item) => (item.genres || []).some((g) => ADULT_GENRES.has(g.toLowerCase().trim()));

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { lastUpdated: '', items: [], slider: [], pages: 1, counts: { movies: 0, episodes: 0 } };
  }
}

// for the first few seconds after deploy, priming fetch may be needed —
// local dev / vercel both just read the committed snapshot.

function sortItems(items) {
  const now = Date.now();
  const isFresh = (it) => it.added != null && now - new Date(it.added).getTime() < 3 * 86400000;
  return [...items].sort((a, b) => {
    const aFresh = isFresh(a);
    const bFresh = isFresh(b);
    if (aFresh !== bFresh) return aFresh ? -1 : 1;
    const da = (a.added || '').replace('T', ' ');
    const db = (b.added || '').replace('T', ' ');
    if (aFresh && bFresh) return da < db ? 1 : da > db ? -1 : 0;
    const rd = (a.date || '').localeCompare(b.date || '');
    if (rd !== 0) return -rd;
    return da < db ? 1 : da > db ? -1 : 0;
  });
}

function filterItems(db, q) {
  let items = db.items || [];
  if (q.q) {
    const needle = q.q.toLowerCase();
    items = items.filter(
      (it) =>
        it.title.toLowerCase().includes(needle) ||
        (it.genres || []).join(' ').toLowerCase().includes(needle) ||
        (it.actors || []).join(' ').toLowerCase().includes(needle) ||
        (it.directors || []).join(' ').toLowerCase().includes(needle) ||
        (it.countries || []).join(' ').toLowerCase().includes(needle)
    );
  }
  if (q.type) items = items.filter((it) => (it.type || 'Movie').toLowerCase() === q.type.toLowerCase());
  if (q.genre) items = items.filter((it) => (it.genres || []).some((g) => g.toLowerCase() === q.genre.toLowerCase()));
  if (q.year) items = items.filter((it) => it.year === q.year);
  if (q.country) items = items.filter((it) => (it.countries || []).some((c) => c.toLowerCase() === q.country.toLowerCase()));
  if (q.adult === '1') items = items.filter(isAdult);
  if (q.adult === '0') items = items.filter((it) => !isAdult(it));

  if (q.sort === 'rating') {
    items = [...items].sort((a, b) => parseFloat(b.imdb || 0) - parseFloat(a.imdb || 0));
  } else {
    items = sortItems(items);
  }

  const page = Math.max(1, parseInt(q.page || '1', 10));
  const per = Math.min(120, Math.max(1, parseInt(q.per || '30', 10)));
  const total = items.length;
  return {
    items: items.slice((page - 1) * per, page * per),
    page,
    per,
    total,
    pages: Math.max(1, Math.ceil(total / per)),
  };
}

function publicItem(it) {
  return {
    slug: it.slug,
    title: it.title,
    year: it.year,
    duration: it.duration,
    type: it.type,
    quality: it.quality,
    img: it.img,
    thumb: it.thumb,
    genres: it.genres || [],
    countries: it.countries || [],
    directors: it.directors || [],
    actors: it.actors || [],
    date: it.date,
    added: it.added,
    imdb: it.imdb,
    desc: it.desc,
    adult: isAdult(it),
    hasSource: !!(it.sources && it.sources.length),
  };
}

function fullItem(it) {
  return {
    ...publicItem(it),
    sources: it.sources || [],
    tracks: it.tracks || [],
    gallery: it.gallery || [],
    release: it.release,
    ratingCount: it.ratingCount,
  };
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

function serveIndex(res) {
  sendFile(res, path.join(ROOT, 'index.html'));
}

function findItem(db, slug) {
  return (db.items || []).find((it) => it.slug === slug);
}

// lightweight in-memory cache for on-demand hydration (per instance)
const memoryCache = new Set();

async function hydrateOne(db, slug) {
  const it = findItem(db, slug);
  if (!it) return null;
  const pageUrl = it.url || `${S.BASE}/${it.slug}/`;
  try {
    const html = await syncMod.fetchUrl(pageUrl);
    const d = S.parseDetail(html);
    if (d.sources && d.sources.length) it.sources = d.sources;
    if (d.tracks && d.tracks.length) it.tracks = d.tracks;
    if (d.thumb) it.thumb = d.thumb;
    if (d.imdb) it.imdb = d.imdb;
    if (d.gallery && d.gallery.length) it.gallery = d.gallery;
    if (d.desc) it.desc = d.desc;
    if (d.duration) it.duration = d.duration;
    if (d.genres && d.genres.length) it.genres = d.genres;
    if (d.actors && d.actors.length) it.actors = d.actors;
    if (d.director) it.directors = [d.director];
    if (d.country) it.countries = d.country.split(',').map((c) => c.trim());
    if (d.release) it.release = d.release;
    memoryCache.add(slug);
    try {
      syncMod.saveDb(db); // local dev persists; on Vercel fs is read-only → ignored
    } catch {}
    return it;
  } catch (e) {
    return it;
  }
}

async function handleApi(req, res, pathname, query) {
  const db = loadDb();

  if (pathname === '/api/state') {
    const genres = new Set();
    const years = new Set();
    const countries = new Set();
    let adultCount = 0;
    for (const it of db.items || []) {
      (it.genres || []).forEach((g) => genres.add(g));
      if (it.year) years.add(it.year);
      (it.countries || []).forEach((c) => countries.add(c));
      if (isAdult(it)) adultCount++;
    }
    return sendJson(res, {
      lastUpdated: db.lastUpdated,
      counts: db.counts || { movies: 0, episodes: 0 },
      total: (db.items || []).length,
      adult: adultCount,
      pages: db.pages || 1,
      genres: [...genres].sort(),
      years: [...years].sort((a, b) => b.localeCompare(a)),
      countries: [...countries].sort(),
    });
  }

  if (pathname === '/api/slider') {
    return sendJson(res, {
      slider: (db.slider || []).map((s) => ({
        ...s,
        adult: (s.genres || []).some((g) => ADULT_GENRES.has(g.toLowerCase())),
      })),
    });
  }

  if (pathname === '/api/movies') {
    const { items, page, per, total, pages } = filterItems(db, query);
    return sendJson(res, { items: items.map(publicItem), page, per, total, pages });
  }

  if (pathname.startsWith('/api/movie/')) {
    const slug = decodeURIComponent(pathname.slice('/api/movie/'.length));
    let it = findItem(db, slug);
    if (!it) return sendJson(res, { error: 'not_found' }, 404);
    if ((!it.sources || !it.sources.length) && !memoryCache.has(slug)) {
      it = await hydrateOne(db, slug);
      if (!it) return sendJson(res, { error: 'not_found' }, 404);
    }
    return sendJson(res, { item: fullItem(it) });
  }

  if (pathname === '/api/sync' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      const resSync = await syncMod.runSync({ pages: 2, hydrateLimit: 4 });
      return sendJson(res, { ok: true, added: resSync.added, after: resSync.after });
    } catch (e) {
      return sendJson(res, { ok: false, error: e.message }, 500);
    }
  }

  return sendJson(res, { error: 'not_found' }, 404);
}

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const query = parsed.query || {};

  try {
    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, query);
    }

    // static assets
    if (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname === '/favicon.svg' || pathname === '/favicon.ico') {
      const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(ROOT, safe);
      if (filePath.startsWith(ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return sendFile(res, filePath);
      }
      return sendJson(res, { error: 'not_found' }, 404);
    }

    // SPA shell
    return serveIndex(res);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal error');
    }
  }
}

module.exports = { handleRequest, loadDb, DATA_FILE, ROOT, isAdult };
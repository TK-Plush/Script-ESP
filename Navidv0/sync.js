'use strict';

// ============================================================
// sync.js — fetches jaikonmovie.com and maintains local cache
// in data/db.json. New movies are auto-added on every run.
// ============================================================

const fs = require('fs');
const path = require('path');
const S = require('./lib/scraper');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BASE = S.BASE;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const FETCH_DELAY = 400; // ms between requests to be gentle

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchUrl(url, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { lastUpdated: '', items: [], slider: [], pages: 1, counts: { movies: 0, episodes: 0 } };
  }
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 0));
}

// merge list of parsed articles into db items, keep order by date desc
function mergeItems(db, list, { isTv = false } = {}) {
  const bySlug = new Map(db.items.map((it) => [it.slug, it]));
  let addedCount = 0;
  for (const a of list) {
    if (!a || !a.slug) continue;
    const existing = bySlug.get(a.slug);
    if (existing) {
      // refresh lightweight fields if changed
      for (const k of ['title', 'img', 'genres', 'countries', 'directors', 'year', 'duration', 'quality', 'date']) {
        if (a[k] && !existing[k]) existing[k] = a[k];
      }
      if (a.type) existing.type = a.type;
      continue;
    }
    a.type = isTv && !a.type ? 'TV' : a.type || 'Movie';
    a.added = a.posted ? a.posted + 'T00:00:00.000Z' : new Date().toISOString();
    a.sources = [];
    a.tracks = [];
    db.items.push(a);
    bySlug.set(a.slug, a);
    addedCount++;
  }
  return addedCount;
}

async function syncPages(db, maxPages = 3) {
  let added = 0;
  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1 ? BASE + '/' : `${BASE}/page/${p}/`;
    try {
      const html = await fetchUrl(url);
      const grid = S.parseGrid(html);
      added += mergeItems(db, grid.items);
      if (p === 1) {
        const home = S.parseHome(html);
        if (home.slider && home.slider.length) db.slider = home.slider;
        if (home.maxPage) db.pages = parseInt(home.maxPage, 10) || db.pages;
      }
      console.log(`[sync] page ${p}: ${grid.items.length} items`);
    } catch (e) {
      console.warn(`[sync] page ${p} failed: ${e.message}`);
    }
    await sleep(FETCH_DELAY);
  }
  return added;
}

// fetch details (player sources + metadata) for items missing sources
async function hydrate(db, limit = 12) {
  const queue = db.items.filter((it) => !it.sources || !it.sources.length).slice(0, limit);
  let done = 0;
  for (const it of queue) {
    try {
      const url = it.url || `${BASE}/${it.slug}/`;
      const html = await fetchUrl(url);
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
      done++;
      console.log(`[hydrate] ${it.slug}: ${d.sources.length} sources`);
    } catch (e) {
      console.warn(`[hydrate] ${it.slug} failed: ${e.message}`);
    }
    await sleep(FETCH_DELAY);
  }
  return done;
}

async function runSync({ pages, hydrateLimit } = {}) {
  const db = loadDb();
  const before = db.items.length;

  const maxPages = Math.min(pages || db.pages || Math.max(db.pages, 1), 26);
  const added = await syncPages(db, maxPages);
  await hydrate(db, hydrateLimit ?? 12);

  db.counts = {
    movies: db.items.filter((i) => i.type !== 'TV').length,
    episodes: db.items.filter((i) => i.type === 'TV').length,
    withSources: db.items.filter((i) => i.sources && i.sources.length).length,
  };
  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  return { before, after: db.items.length, added, hydrate: db.counts.withSources, db };
}

// ----- CLI / manual entry -----
if (require.main === module) {
  (async () => {
    const pagesArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
    console.log('Navidv0 sync started at', new Date().toISOString());
    const res = await runSync({ pages: pagesArg });
    console.log(
      `[sync] done. items before=${res.before} after=${res.after} added=${res.added} hydrated=${res.hydrate}`
    );
    process.exit(0);
  })().catch((e) => {
    console.error('[sync] fatal:', e);
    process.exit(1);
  });
}

module.exports = { runSync, loadDb, saveDb, fetchUrl, DATA_DIR, DB_FILE };
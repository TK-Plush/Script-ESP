'use strict';

// ============================================================
// Scraper for jaikonmovie.com — extracts movies, episodes,
// slider, and detail (player sources + metadata) from HTML.
// ============================================================

const BASE = 'https://jaikonmovie.com';

const decodeHtml = (s = '') =>
  s
    .replace(/&#8217;|&#39;|&rsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '\u201c')
    .replace(/&#8221;|&rdquo;/g, '\u201d')
    .replace(/&#8211;|&ndash;/g, '\u2013')
    .replace(/&#8212;|&mdash;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, (m) => {
      try {
        return String.fromCodePoint(parseInt(m.slice(2, -1), 10));
      } catch {
        return m;
      }
    });

const stripTags = (s = '') => decodeHtml(s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '=["\']([^"\']*)["\']', 'i'));
  return m ? decodeHtml(m[1]) : '';
};

const rtext = (src, re) => {
  const m = src.match(re);
  return m ? stripTags(m[1]).trim() : '';
};

// --- article.box parsing (used for movie + episode cards) ---
function parseArticle(block) {
  const aTag = block.match(/<a class="tip"[^>]*>/i) || block.match(/<a[^>]*class="tip"[^>]*>/i) || block.match(/<a [^>]*>/i);
  if (!aTag) return null;
  const href = attr(aTag[0], 'href');
  const rel = attr(aTag[0], 'rel');
  const title = (attr(aTag[0], 'title') || attr(aTag[0], 'alt') || '').trim();
  const imgM = block.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
  const heading = rtext(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const name = title || heading;
  if (!name || !href) return null;

  const year = rtext(block, /<span class="addyear">([^<]*)<\/span>/i);
  const durM = block.match(/<i class="dot"><\/i>\s*([^<]{0,20})/i);
  const duration = durM ? durM[1].trim() : '';
  const typeM = block.match(/<i class="type">([^<]*)<\/i>/i);
  const type = typeM ? typeM[1].trim() : 'Movie';
  const qualityM = block.match(/<span class="quality[^"]*"[^>]*>([^<]*)<\/span>/i);
  const quality = qualityM ? qualityM[1].trim() : 'HD';
  const dateM = block.match(/<time itemprop="dateCreated" datetime="([^"]+)"/i);
  const date = dateM && dateM[1] ? dateM[1].slice(0, 10) : '';

  const genres = [];
  const gm = block.match(/<span itemprop="genre">([\s\S]*?)<\/span>/gi);
  if (gm) gm.forEach((g) => genres.push(stripTags(g.replace(/^<span[^>]*>/, ''))));
  if (!genres.length) {
    const gn = block.match(/<div class="g">([\s\S]*?)<\/div>/i);
    if (gn) genres.push(...(stripTags(gn[1]) || '').split(','));
  }

  const countries = [];
  const cm = block.match(/<span itemprop="(?:contentLocation|countryOfOrigin)"[^>]*>([\s\S]*?)<\/span>/gi);
  if (cm) cm.forEach((c) => {
    const m = c.match(/<a[^>]*>([^<]*)<\/a>/i);
    if (m) countries.push(decodeHtml(m[1]).trim());
  });

  const directors = [];
  const dm = block.match(/<span itemprop="director"[^>]*>([\s\S]*?)<\/span>/gi);
  if (dm) dm.forEach((d) => {
    const m = d.match(/<a[^>]*>([^<]*)<\/a>/i);
    if (m) directors.push(decodeHtml(m[1]).trim());
  });

  return {
    slug: (href || '').replace(/\/+$/, '').split('/').pop(),
    url: href || '',
    title: name,
    year,
    duration,
    type,
    quality,
    img: imgM ? imgM[1] : '',
    genres,
    countries,
    directors,
    date,
    posted: date || '',
  };
}

// --- home page: slider + latest movies + latest episodes ---
function parseHome(html) {
  const out = { slider: [], movies: [], episodes: [] };

  // Slider
  const slideRe = /<div class="swiper-slide">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/a>/g;
  let m;
  const slideBlocks = [];
  const slideAlt = /<div class="swiper-slide">([\s\S]*?)(?=<div class="swiper-slide">|<\/div>\s*<\/div>\s*<div class="paging">)/g;
  while ((m = slideAlt.exec(html))) slideBlocks.push(m[1]);

  slideBlocks.forEach((b) => {
    const name = rtext(b, /<span class="name">([\s\S]*?)<\/span>/i);
    const hrefM = b.match(/<a href="([^"]+)"/i);
    const imgM = b.match(/<img class="glimg" src="([^"]+)"/i);
    const imdb = rtext(b, /IMDb: <b>([^<]*)<\/b>/i);
    const quality = rtext(b, /<span class="quality">([^<]*)<\/span>/i);
    const genre = rtext(b, /Genre: ([^<]*)</i);
    const desc = rtext(b, /<div class="desc">([\s\S]*?)<\/div>/i);
    if (name && hrefM) {
      out.slider.push({
        title: name,
        url: hrefM[1] || '',
        slug: (hrefM[1] || '').replace(/\/+$/, '').split('/').pop(),
        img: imgM ? imgM[1] : '',
        imdb,
        quality: quality || 'HD',
        genres: (genre || '').split(',').map((g) => g.trim()).filter(Boolean),
        desc,
      });
    }
  });
  if (!out.slider.length) {
    // fallback: first movies
    out.slider = [];
  }

  // Split at "Latest Episodes"
  const epsIdx = html.indexOf('Latest Episodes');
  const movieSec = epsIdx > -1 ? html.slice(0, epsIdx) : html;
  const epSec = epsIdx > -1 ? html.slice(epsIdx) : '';

  const parseGrid = (sec) => {
    const items = [];
    const re = /<article class="box"[\s\S]*?<\/article>/g;
    let mm;
    while ((mm = re.exec(sec))) {
      const it = parseArticle(mm[0]);
      if (it) items.push(it);
    }
    return items;
  };

  out.movies = parseGrid(movieSec);
  out.episodes = parseGrid(epSec);

  // pagination
  const pg = html.match(/<div class="hpage pagination">([\s\S]*?)<\/div>/i);
  out.maxPage = pg ? (pg[1].match(/class='page-numbers last' href='[^']*\/page\/(\d+)\//) || [])[1] || '' : '';
  out.pages = parseInt(out.maxPage, 10) || 1;

  return out;
}

// --- any grid page (page/2, genre, search results) ---
function parseGrid(html) {
  const out = { items: [] };
  const re = /<article class="box"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const it = parseArticle(m[0]);
    if (it) out.items.push(it);
  }
  const pg = html.match(/<div class="hpage pagination">([\s\S]*?)<\/div>/i);
  if (pg) {
    const last = pg[1].match(/page-numbers last' href='[^']*\/page\/(\d+)\//);
    out.maxPage = last ? last[1] : '';
  }
  return out;
}

// --- movie / episode / watch detail page ---
function parseDetail(html) {
  const d = {};
  d.title = rtext(html, /<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || rtext(html, /<title>([^<]*)<.title>/i).replace(/\s*[-|]\s*.*$/, '');
  d.img = (html.match(/<div class="limage">\s*<img[^>]*src="([^"]+)"/i) || [])[1] || '';
  d.desc = rtext(html, /<div class="entry-content" itemprop="description">([\s\S]*?)<ul class="data">/i);
  if (!d.desc) d.desc = rtext(html, /<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/i).slice(0, 600);

  const dataUl = (html.match(/<ul class="data">([\s\S]*?)<\/ul>/i) || [])[1] || '';
  const liRe = /<li><b>([^<]*)<\/b>:([\s\S]*?)<\/li>/g;
  let m;
  const fields = {};
  while ((m = liRe.exec(dataUl))) {
    const key = m[1].trim().toLowerCase();
    const val = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    fields[key] = val;
  }

  d.genre = fields['genre:'] || fields.genre || '';
  d.genres = d.genre ? d.genre.split(',').map((g) => g.trim()).filter(Boolean) : [];
  d.release = fields['release:'] || fields.release || '';
  d.stars = fields['stars:'] || fields.stars || '';
  d.actors = d.stars ? d.stars.split(',').map((a) => a.trim()).filter(Boolean) : [];
  d.duration = fields['duration:'] || fields.duration || '';
  d.director = fields['director:'] || fields.director || '';
  d.country = fields['country:'] || fields.country || '';
  d.quality = fields['quality:'] || fields.quality || 'HD';
  d.year = (d.release || d.title).match(/(19|20)\d{2}/);

  // rating
  const ratingM = html.match(/<span itemprop="ratingValue">([\d.]+)<\/span>\s*\/\s*<span itemprop="ratingCount">([\d.]+)<\/span>/i);
  if (ratingM) {
    d.imdb = ratingM[1];
    d.ratingCount = ratingM[2];
  }

  // gallery
  const gallery = [];
  const gRe = /<div class="gallery_img">\s*<a href="([^"]+)">\s*<img src="([^"]+)"/g;
  while ((m = gRe.exec(html))) gallery.push({ full: m[1], thumb: m[2] });
  d.gallery = gallery;

  // player sources + subtitles
  const player = extractPlayer(html);
  d.sources = player.sources;
  d.tracks = player.tracks;
  d.thumb = player.thumb;
  d.mirrors = player.mirrors;

  return d;
}

function extractPlayer(html) {
  const out = { sources: [], tracks: [], mirrors: [], thumb: '' };

  // 1) Inline jwplayer setup
  const setupRe = /playerInstance\.setup\(\{([\s\S]*?)\}\s*\)/i;
  const setup = html.match(setupRe);
  if (setup) {
    const txt = setup[1];
    const thumbM = txt.match(/image:\s*"([^"]+)"/i);
    if (thumbM) out.thumb = thumbM[1];
    // sources array entries  {file:"..."} or {file:"...",label:"..."}
    const srcRe = /\{file:\s*"([^"]+)"([^}]*)\}/g;
    let m;
    while ((m = srcRe.exec(txt))) {
      const labelM = m[2].match(/label:\s*"([^"]+)"/i);
      out.sources.push({ file: m[1], label: labelM ? labelM[1] : '' });
    }
    const trRe = /\{file:\s*"([^"]+)"[^}]*label:\s*"([^"]+)"[^}]*kind:\s*"([^"]+)"/g;
    while ((m = trRe.exec(txt))) {
      out.tracks.push({ file: m[1], label: m[2], kind: m[3] || 'captions' });
    }
  }

  // 2) Fallback: mirror links with base64 data-em
  const mirrorRe = /<a href="#\/" data-em="([^"]+)"[^>]*data-href="([^"]*)"/g;
  let mm;
  while ((mm = mirrorRe.exec(html))) {
    const label = (mm[1] || '').length > 50 ? '' : '';
    out.mirrors.push({ em: mm[1], href: mm[2] });
    try {
      const dec = Buffer.from(mm[1], 'base64').toString('utf8');
      const srcRe2 = /\{file:\s*"([^"]+)"([^}]*)\}/g;
      let m2;
      while ((m2 = srcRe2.exec(dec))) {
        const labelM = m2[2].match(/label:\s*"([^"]+)"/i);
        out.sources.push({ file: m2[1], label: labelM ? labelM[1] : '' });
      }
      if (!out.thumb) {
        const t = dec.match(/image:\s*"([^"]+)"/i);
        if (t) out.thumb = t[1];
      }
    } catch {}
  }

  // dedupe sources; drop anything that is a caption file
  const seen = new Set();
  const isCaption = (f) => /\.(srt|vtt|ttml|dfxp)(\?|$)/i.test(f || '');
  out.sources = out.sources.filter((s) => {
    if (!s.file || isCaption(s.file) || seen.has(s.file)) return false;
    seen.add(s.file);
    return true;
  });

  return out;
}

module.exports = {
  BASE,
  decodeHtml,
  stripTags,
  parseHome,
  parseGrid,
  parseArticle,
  parseDetail,
  extractPlayer,
};
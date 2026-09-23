# Navidv0 🎬

A modern, ad-free movie streaming site that mirrors **jaikonmovie.com** and keeps itself
updated automatically. Rebranded from Jaikon Movie → **Navidv0**, with a full neon/dark
redesign, an **18+ click-to-reveal blur gate**, zero ads, and auto-sync of new titles.

> Content is streamed from the source catalog's public CDN links. All rights belong to
> their respective owners; this project is for personal/fair-use viewing.

---

## Features

| Feature | Details |
|---|---|
| 🔄 **Auto-update** | Server re-scans jaikonmovie.com every 30 min (configurable), adds new movies/episodes automatically, hydrates players for the newest titles |
| 🚫 **No ads** | Google Analytics, ad networks, popunders, JWPlayer VAST pre-rolls, flag counters — all stripped |
| 🔞 **18+ gate** | Adult titles (18+ / Vivamax genres) appear blurred with an animated **18+** badge. Click → confirm → blur removed. Same gate on the player page. Persists per title (localStorage) |
| 🎨 **Insane theme** | Animated aurora background, neon gradients, glass cards, glow hovers, ken-burns hero slider, Orbitron display font, custom scrollbar & scrollbar glow |
| 🎬 **Watch page** | HTML5 player with HLS support (hls.js), subtitle tracks (EN/KH), automatic source fallback, casting, gallery, IMDb ratings |
| 🔍 **Full browsing** | Search, genre/year/country filters, Movies / TV sections, 18+ collection page, pagination, top-rated sort |
| ⚡ **Zero-dependency** | Pure Node.js (>=18). No npm install required |

---

## Quick start

```bash
# 1. First sync: pull the full catalog (26 pages) + hydrate newest titles' players
node sync.js 26

# 2. Start the server
node server.js
# → http://localhost:3000
```

Config via env vars:

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SYNC_MINUTES` | `30` | Auto-sync interval |
| `AUTO_SYNC` | `1` | Set `0` to disable background sync |

Manual sync anytime: click the ⟳ button in the header, or `POST /api/sync`.

---

## Project layout

```
Navidv0/
├── server.js          # HTTP server + JSON API + auto-sync + on-demand hydration
├── sync.js            # catalog scraper (paginated, cached, incremental)
├── lib/scraper.js     # HTML parsers (home, grid, detail, player extraction)
├── data/db.json       # generated cache (625+ titles, players, metadata)
└── public/
    ├── index.html     # SPA shell
    ├── css/style.css  # neon cinema theme
    ├── js/app.js      # router, rendering, 18+ gate, search, sync UI
    └── favicon.svg
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/state` | counts, genres, years, countries, last sync |
| `GET /api/slider` | hero slider items |
| `GET /api/movies?type=&genre=&year=&country=&q=&adult=&sort=&page=&per=` | filtered, paginated catalog |
| `GET /api/movie/:slug` | full detail + player sources/tracks (hydrates on demand) |
| `POST /api/sync` | trigger immediate catalog sync |

## How the 18+ gate works

1. Title is flagged adult when its genres include `18+`, `Vivamax`, or `VMX (Vivamax)`.
2. On grids: poster is blurred + dimmed, animated red **18+** badge + 🔒 shown.
3. Clicking the card opens a confirm modal — **I'm 18+ — Reveal** unblurs it and
   (per the request) navigates to the watch page; the grid then stays unblurred for that
   title (stored in `localStorage` key `nvd-revealed`).
4. On the watch page the player is blurred with a big 18+ overlay until confirmed.

## Notes

- Movie detail pages are fetched lazily the first time someone opens them, then cached
  in `data/db.json` — so the site stays fast and the catalog grows automatically.
- HLS (`.m3u8`) sources play via hls.js; MP4 sources play natively; the player walks
  through mirrors automatically if one fails.
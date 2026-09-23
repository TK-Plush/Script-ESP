'use strict';

// Local dev server (for Vercel production use api/index.js)
const http = require('http');
const { handleRequest } = require('./app');
const syncMod = require('./sync');

const PORT = process.env.PORT || 3000;
const SYNC_MINUTES = parseInt(process.env.SYNC_MINUTES || '30', 10);

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`Navidv0 running at http://localhost:${PORT}`);
  const db = syncMod.loadDb();
  if (db.items && db.items.length) {
    console.log(`Cache: ${db.items.length} items (last sync ${db.lastUpdated || 'never'})`);
  } else {
    console.log('Cache empty — run `node sync.js` first.');
  }
  console.log(`Auto-sync every ${SYNC_MINUTES} min (AUTO_SYNC=0 to disable)`);
  setInterval(async () => {
    try {
      const r = await syncMod.runSync({ pages: 2, hydrateLimit: 8 });
      console.log(`[auto-sync] done added=${r.added} after=${r.after}`);
    } catch (e) {
      console.warn('[auto-sync] failed', e.message);
    }
  }, SYNC_MINUTES * 60 * 1000);
});
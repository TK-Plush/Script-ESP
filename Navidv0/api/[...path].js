'use strict';

// ============================================================
// Vercel serverless entrypoint — catch-all under /api/*.
// Dispatches to the shared Navidv0 handler.
// ============================================================

const { handleRequest } = require('../app');

module.exports = handleRequest;
'use strict';

// ============================================================
// Vercel serverless entrypoint.
// All routes (/) and (/api/*) dispatch to the shared handler.
// ============================================================

const { handleRequest } = require('../app');

module.exports = handleRequest;
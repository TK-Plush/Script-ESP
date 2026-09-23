'use strict';

// Vercel serverless entrypoint: POST /api/sync
const { handleRequest } = require('../app');

module.exports = handleRequest;
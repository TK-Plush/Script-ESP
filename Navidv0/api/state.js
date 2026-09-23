'use strict';

// Vercel serverless entrypoint: GET /api/state
const { handleRequest } = require('../app');

module.exports = handleRequest;
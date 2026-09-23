'use strict';

// Vercel serverless entrypoint: GET /api/slider
const { handleRequest } = require('../app');

module.exports = handleRequest;
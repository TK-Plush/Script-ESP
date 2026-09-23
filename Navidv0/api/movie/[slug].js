'use strict';

// Vercel serverless entrypoint: GET /api/movie/:slug
const { handleRequest } = require('../../app');

module.exports = handleRequest;
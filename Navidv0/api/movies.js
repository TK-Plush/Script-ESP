'use strict';

// Vercel serverless entrypoint: GET /api/movies
const { handleRequest } = require('../app');

module.exports = handleRequest;
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { scrapeMovies, scrapeMovieVideo, getCategorizedMovies } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// API Routes

/**
 * GET /api/movies
 * Returns all scraped movies
 */
app.get('/api/movies', async (req, res) => {
    try {
        const movies = await scrapeMovies();
        res.json({
            success: true,
            count: movies.length,
            movies: movies
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/categories
 * Returns movies organized by categories
 */
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getCategorizedMovies();
        res.json({
            success: true,
            categories: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/video
 * Gets video URL for a specific movie
 * Body: { movieUrl: "https://..." }
 */
app.post('/api/video', async (req, res) => {
    try {
        const { movieUrl } = req.body;

        if (!movieUrl) {
            return res.status(400).json({
                success: false,
                error: 'movieUrl is required'
            });
        }

        const result = await scrapeMovieVideo(movieUrl);
        res.json({
            success: result.success,
            videoUrl: result.videoUrl,
            embedType: result.embedType,
            error: result.error
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/proxy
 * Proxy endpoint to bypass X-Frame-Options
 * Usage: /api/proxy?url=https://example.com
 */
app.get('/api/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) {
            return res.status(400).send('URL parameter required');
        }

        console.log('🔄 Proxying:', targetUrl);

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://fanprojnet.com/'
            },
            responseType: 'stream',
            timeout: 30000
        });

        // Remove security headers that block embedding
        delete response.headers['x-frame-options'];
        delete response.headers['content-security-policy'];
        delete response.headers['x-content-security-policy'];

        // Set CORS headers
        res.set({
            ...response.headers,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

/**
 * GET /
 * Serve the main HTML page
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              🎬 HASHISTREM SERVER RUNNING 🎬              ║
║                                                           ║
║  Server URL: http://localhost:${PORT}                      ║
║  API Endpoint: http://localhost:${PORT}/api/movies        ║
║                                                           ║
║  Premium Movie Streaming Platform                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);

    // Pre-cache movies on startup
    scrapeMovies().then(() => {
        console.log('✓ Movies pre-cached and ready!');
    }).catch(err => {
        console.log('⚠ Initial scraping failed, will retry on first request');
    });
});

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

// Debug endpoint to check Vercel environment
app.get('/api/debug', (req, res) => {
    const fs = require('fs');

    const debugInfo = {
        cwd: process.cwd(),
        dirname: __dirname,
        filesRoot: [],
        filesPublic: [],
        moviesJsonExists: false,
        moviesJsonSize: 0,
        env: process.env.NODE_ENV
    };

    try {
        debugInfo.filesRoot = fs.readdirSync(process.cwd());
    } catch (e) { debugInfo.errorRoot = e.message; }

    try {
        const scraper = require('./scraper');
        const cats = scraper.getCategorizedMovies();
        debugInfo.inMemoryMovieCount = cats && cats.All ? cats.All.length : 0;
        debugInfo.loadStatus = cats ? cats.DebugStatus : 'unknown';
    } catch (e) { debugInfo.errorScraper = e.message; }

    try {
        const dbPath = path.join(process.cwd(), 'movies.json');
        if (fs.existsSync(dbPath)) {
            debugInfo.moviesJsonExists = true;
            debugInfo.moviesJsonSize = fs.statSync(dbPath).size;
        }
    } catch (e) { debugInfo.errorDb = e.message; }

    res.json(debugInfo);
});

// Proxy endpoint for video playback (resolves CORS issues)
/**
 * GET /api/proxy
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
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
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

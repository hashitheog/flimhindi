const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Cache
let moviesCache = null;
let lastScrapeTime = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

// ENHANCED Khaanfilms.com scraper
// Global cache maintained in memory
let cachedMovies = [];
let isFirstLoad = true;

async function scrapeMovies(forceRefresh = false) {
    // 0. Static File Check (Fastest) - Use require to force bundling
    if (!forceRefresh) {
        try {
            console.log('📂 Attempting to require static DB...');
            // Load from ROOT to ensure Vercel bundles it as a dependency
            const staticData = require('./movies.json');
            if (staticData && staticData.length > 0) {
                console.log('✅ Loaded movies from static DB via require!');
                cachedMovies = staticData;
                return cachedMovies;
            }
        } catch (e) {
            console.log('Static DB require failed:', e.message);

            // Fallback to FS for local dev if require fails (sometimes happens with dynamic paths)
            try {
                const dbPath = path.join(process.cwd(), 'public', 'movies.json');
                if (fs.existsSync(dbPath)) {
                    const data = fs.readFileSync(dbPath, 'utf8');
                    cachedMovies = JSON.parse(data);
                    return cachedMovies;
                }
            } catch (err) { console.log('FS fallback failed too'); }
        }
    }

    // If we have data in memory and not forcing refresh, return it
    if (cachedMovies.length > 0 && !forceRefresh) {
        return cachedMovies;
    }

    console.log('Cache empty, starting scrape...');

    // 1. Scrape Fanproj (Fast - First 2 pages)
    const fanprojMovies = await scrapeFanproj(1, 2);
    cachedMovies = fanprojMovies.map((m, i) => ({ ...m, id: i + 1 }));

    // 2. Start Rest of Fanproj & KhaanFilms in BACKGROUND
    startBackgroundScrapes(cachedMovies.length + 1);

    return cachedMovies;
}

async function startBackgroundScrapes(startId) {
    console.log('🚀 Triggering PARALLEL background scrapes...');

    // Fanproj Page 3-100 (Maximized for "All Movies")
    const fanprojPromise = scrapeFanproj(3, 100).then(moreMovies => {
        let currentId = startId;
        const currentLinks = new Set(cachedMovies.map(m => m.link));

        for (const m of moreMovies) {
            if (!currentLinks.has(m.link)) {
                cachedMovies.push({ ...m, id: currentId++ });
                currentLinks.add(m.link);
            }
        }
        console.log(`✅ Fanproj background finished! Total: ${cachedMovies.length}`);
    });

    // Start KhaanFilms concurrently
    const khaanPromise = startKhaanFilmsBackgroundScrape();

    return Promise.allSettled([fanprojPromise, khaanPromise]).then(() => {
        console.log(`🏁 ALL SCRAPES COMPLETE. Final Total: ${cachedMovies.length}`);
        return cachedMovies;
    });
}


async function startKhaanFilmsBackgroundScrape() {
    console.log('🚀 Triggering KhaanFilms background scrape...');
    const khaanMovies = await scrapeKhaanFilms(); // This is the slow part

    // Merge and Deduplicate
    const currentLinks = new Set(cachedMovies.map(m => m.link));
    let nextId = cachedMovies.length + 1; // Always recalc based on current cache state

    for (const m of khaanMovies) {
        if (!currentLinks.has(m.link)) {
            cachedMovies.push({ ...m, id: nextId++ });
            currentLinks.add(m.link);
        }
    }
    console.log(`✅ Background scrape finished! Total movies: ${cachedMovies.length}`);
}

async function scrapeKhaanFilms(limit = null) {
    console.log('\n🎬 Starting KHAANFILMS.COM scraper...');
    const allMovies = [];
    const sitemaps = [
        'https://www.khaanfilms.com/sitemap.xml?page=1',
        'https://www.khaanfilms.com/sitemap.xml?page=2'
    ];

    try {
        // 1. Fetch all URLs from sitemaps first
        let movieUrls = [];
        for (const sitemapUrl of sitemaps) {
            console.log(`📄 Fetching sitemap: ${sitemapUrl}`);
            try {
                const { data } = await axios.get(sitemapUrl, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                const $ = cheerio.load(data, { xmlMode: true });
                $('loc').each((i, el) => {
                    const url = $(el).text().trim();
                    if (url.includes('.html') && !url.includes('/p/') && !url.includes('/search')) {
                        movieUrls.push(url);
                    }
                });
            } catch (err) {
                console.error(`  ❌ Failed to fetch sitemap ${sitemapUrl}: ${err.message}`);
            }
        }

        console.log(`\n📊 Found ${movieUrls.length} potential movie URLs. Starting detail extraction...`);

        // UNLOCKED: Scraping ALL available movies (unless limited)
        const moviesToScrape = limit ? movieUrls.slice(0, limit) : movieUrls;
        console.log(`⚡ Scraping details for ${limit ? 'LIMIT ' + limit : 'ALL ' + moviesToScrape.length} movies...`);

        // OPTIMIZED: Much larger batch size for speed
        const BATCH_SIZE = 50;
        for (let i = 0; i < moviesToScrape.length; i += BATCH_SIZE) {
            const batch = moviesToScrape.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (url) => {
                try {
                    const { data } = await axios.get(url, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    const $ = cheerio.load(data);

                    const title = $('h1.title').text().trim() || $('title').text().replace('- cimraan khaan films', '').trim();
                    if (!title) return null;

                    // Extract Metadata
                    let thumbnail = $('meta[property="og:image"]').attr('content') || $('#info .thumb img').attr('src');
                    if (thumbnail) {
                        thumbnail = thumbnail.replace('/s72-c/', '/w500-h750-c/').replace('/w1200/', '/w500/');
                        if (thumbnail.includes('blogger_img_proxy')) { }
                    } else {
                        thumbnail = 'https://via.placeholder.com/300x450?text=No+Image';
                    }

                    const description = $('#synopsis').text().trim() || $('meta[name="description"]').attr('content') || '';

                    let year = 2024; // Default
                    const dateText = $('meta[property="article:published_time"]').attr('content');
                    if (dateText) {
                        year = new Date(dateText).getFullYear();
                    } else {
                        // Fallback: Try to find year in title
                        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
                        if (yearMatch) {
                            year = parseInt(yearMatch[0]);
                        }
                    }

                    const genres = [];
                    $('.meta a[rel="tag"]').each((j, el) => {
                        const t = $(el).text().trim();
                        if (!['Movie', 'Completed', 'India'].includes(t)) genres.push(t);
                    });

                    // CATEGORY LOGIC
                    let category = 'Movies';
                    const catText = genres.join(' ').toLowerCase();
                    if (catText.includes('drama')) category = 'Drama';
                    else if (catText.includes('action')) category = 'Action';
                    else if (catText.includes('horror') || catText.includes('scary')) category = 'Horror';
                    else if (catText.includes('comedy') || catText.includes('funny')) category = 'Comedy';
                    else if (catText.includes('romance') || catText.includes('love')) category = 'Romance';
                    else if (catText.includes('thriller') || catText.includes('crime') || catText.includes('mystery')) category = 'Thriller';
                    else if (catText.includes('adventure')) category = 'Adventure';
                    else if (catText.includes('sci-fi') || catText.includes('fantasy')) category = 'Sci-Fi';
                    else if (catText.includes('family') || catText.includes('animation') || catText.includes('cartoon')) category = 'Family';

                    // Special categories
                    if (title.toLowerCase().includes('musalsal') || title.includes('Season') || catText.includes('series')) category = 'TV Series';
                    else if (catText.includes('turkish') || title.toLowerCase().includes('turki')) category = 'Turkish Drama';

                    // VIDEO EXTRACTION (Crucial)
                    let videoUrl = null;
                    const options = [];
                    $('.DagPlayOpt').each((j, el) => {
                        const embed = $(el).attr('data-embed');
                        if (embed) options.push(embed);
                    });

                    // Priority 1: DEEP EXTRACTION
                    for (const opt of options) {
                        try {
                            if (opt.includes('khaanfilms.com') && opt.includes('src=')) {
                                const urlObj = new URL(opt);
                                const directSrc = urlObj.searchParams.get('src') || urlObj.searchParams.get('url');
                                if (directSrc) {
                                    const decoded = decodeURIComponent(directSrc);
                                    if (decoded.includes('.mp4')) {
                                        videoUrl = decoded;
                                        break;
                                    }
                                }
                            }
                        } catch (e) { console.log('Error parsing url', e.message); }
                    }

                    // Priority 2: Google Drive
                    if (!videoUrl) {
                        videoUrl = options.find(u => u.includes('drive.google.com'));
                    }

                    // Priority 3: Fallback wrapper
                    if (!videoUrl) {
                        videoUrl = options.find(u => u.includes('khaanfilms.com') && !u.includes('soomflare'));
                    }

                    // Fallback to iframe
                    if (!videoUrl) {
                        const iframeSrc = $('#pembed iframe').attr('src');
                        if (iframeSrc && !iframeSrc.includes('soomflare.xyz')) {
                            videoUrl = iframeSrc;
                        }
                    }

                    return {
                        title: title,
                        link: url,
                        thumbnail: thumbnail,
                        year: year || 2023,
                        category: category,
                        genres: genres,
                        rating: 4.5,
                        imdbRating: null,
                        description: description,
                        quality: 'HD',
                        duration: null,
                        isNew: year >= 2025,
                        source: 'khaanfilms.com',
                        videoUrl: videoUrl
                    };

                } catch (err) {
                    console.error(`    ❌ Error scraping ${url}: ${err.message}`);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            results.filter(Boolean).forEach(m => {
                // Deduplicate locally inside scrapeKhaanFilms
                // Only unique titles within this run? Or just push all and let backgroundScrape handle unique links?
                // backgroundScrape handles deduplication by link.
                allMovies.push(m);
            });

            await new Promise(r => setTimeout(r, 500));
        }

    } catch (err) {
        console.error('❌ KhaanFilms scraper failed:', err.message);
    }

    console.log(`✅ KhaanFilms Scraped: ${allMovies.length} movies`);
    return allMovies;
}

// ENHANCED Fanproj.net scraper with comprehensive data extraction
async function scrapeFanproj(startPage = 1, endPage = 100) {
    if (startPage === 1) console.log('\n🎬 Starting ENHANCED fanproj.net scraper...');
    const allMovies = [];
    const seenTitles = new Set();
    const maxPages = endPage;
    let consecutiveErrors = 0;

    async function fetchWithRetry(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Connection': 'keep-alive'
                    },
                    timeout: 30000,
                    maxRedirects: 5
                });
                return data;
            } catch (error) {
                if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                else throw error;
            }
        }
    }

    try {
        // Parallel Scraping: Process pages in batches of 5
        const BATCH_SIZE = 5;
        for (let i = startPage; i <= maxPages; i += BATCH_SIZE) {
            if (consecutiveErrors >= 3) break;

            const batchPromises = [];
            const endBatch = Math.min(i + BATCH_SIZE - 1, maxPages);

            console.log(`⚡ Fetching Pages ${i} to ${endBatch} in parallel...`);

            for (let page = i; page <= endBatch; page++) {
                const url = `https://fanprojnet.com/page/${page}/`;
                const pagePromise = (async () => {
                    try {
                        const data = await fetchWithRetry(url);
                        const $ = cheerio.load(data);
                        let pageCount = 0;
                        const pageMovies = [];

                        $('article.item, article.movies, .item, article').each((i, el) => {
                            const $el = $(el);
                            const $titleLink = $el.find('h2 a, .data h3 a, h3 a, a.tip, .title a').first();
                            let title = $titleLink.text().trim() || $el.find('h2, h3, .title').first().text().trim() || $titleLink.attr('title') || '';
                            title = title.replace(/\s+/g, ' ').trim();
                            const link = $titleLink.attr('href') || $el.find('a').first().attr('href');
                            const $img = $el.find('img').first();
                            let thumbnail = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src');

                            if (thumbnail) {
                                if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail;
                                else if (thumbnail.startsWith('/')) thumbnail = 'https://fanprojnet.com' + thumbnail;
                                thumbnail = thumbnail.replace('-150x150', '').replace('-300x300', '').replace('w185', 'w500');
                            }

                            // Year extraction
                            let year = 2024;
                            const yearText = $el.find('.year').text() || $el.find('.date').text() || title;
                            const yearMatch = yearText.match(/20\d{2}|19\d{2}/);
                            if (yearMatch) year = parseInt(yearMatch[0]);

                            // Extract Genres
                            const genres = [];
                            $el.find('.genres a, .sgeneros a, .category a, a[rel="category tag"], [class*="genre"] a').each((j, catEl) => {
                                const genre = $(catEl).text().trim();
                                if (genre && !genres.includes(genre)) genres.push(genre);
                            });

                            // Enhanced Category Logic
                            let category = 'Movies';
                            if (title.toLowerCase().includes('tv') || link?.includes('tvshows')) category = 'TV Series';
                            else if (genres.length > 0) {
                                const catText = genres.join(' ').toLowerCase();
                                if (catText.includes('drama')) category = 'Drama';
                                else if (catText.includes('action')) category = 'Action';
                                else if (catText.includes('horror') || catText.includes('scary')) category = 'Horror';
                                else if (catText.includes('comedy') || catText.includes('funny')) category = 'Comedy';
                                else if (catText.includes('romance') || catText.includes('love')) category = 'Romance';
                                else if (catText.includes('thriller') || catText.includes('crime') || catText.includes('mystery')) category = 'Thriller';
                                else if (catText.includes('adventure')) category = 'Adventure';
                                else if (catText.includes('sci-fi') || catText.includes('fantasy')) category = 'Sci-Fi';
                                else if (catText.includes('family') || catText.includes('animation') || catText.includes('cartoon')) category = 'Family';
                            }

                            if (title && link) {
                                pageMovies.push({
                                    title, link,
                                    thumbnail: thumbnail || '',
                                    year, category,
                                    genres: genres,
                                    rating: 4.5, imdbRating: null,
                                    description: '', quality: 'HD', duration: null,
                                    isNew: year >= 2025,
                                    source: 'fanproj.net'
                                });
                            }
                        });
                        return pageMovies;
                    } catch (e) {
                        console.error(`Error page ${page}:`, e.message);
                        return [];
                    }
                })();
                batchPromises.push(pagePromise);
            }

            const batchResults = await Promise.all(batchPromises);

            // Flatten and add to allMovies
            let newMoviesCount = 0;
            batchResults.flat().forEach(m => {
                if (!seenTitles.has(m.title)) {
                    seenTitles.add(m.title);
                    allMovies.push(m);
                    newMoviesCount++;
                }
            });

            console.log(`  ✓ Batch complete. Added ${newMoviesCount} new movies. Total: ${allMovies.length}`);
            if (newMoviesCount === 0 && allMovies.length > 50) consecutiveErrors++; // Soft error if empty pages
            else consecutiveErrors = 0;

            await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between batches
        }

        return allMovies;
    } catch (error) {
        console.error('❌ Fatal scraping error:', error.message);
        return [];
    }
}

async function getCategorizedMovies() {
    const movies = await scrapeMovies();
    const categories = { All: movies };
    movies.forEach(movie => {
        if (!categories[movie.category]) categories[movie.category] = [];
        categories[movie.category].push(movie);
    });
    return categories;
}

async function scrapeMovieVideo(movieUrl) {
    console.log(`🎬 Scraping video for: ${movieUrl}`);
    try {
        const { data } = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });
        const $ = cheerio.load(data);

        // Strategy 1: Look for specific embed buttons/data
        let videoUrl = null;
        const options = [];

        // Collect all potential sources
        $('.DagPlayOpt, .play-btn, .dooplay_player_option').each((j, el) => {
            const embed = $(el).attr('data-embed') || $(el).attr('data-src');
            if (embed) options.push(embed);
        });

        // Search in collected options
        // Priority 1: Direct .mp4 or specific fast servers
        for (const opt of options) {
            if (opt.includes('.mp4')) {
                videoUrl = opt;
                break;
            }
            if (opt.includes('drive.google.com') || opt.includes('ok.ru') || opt.includes('mediafire')) {
                videoUrl = opt;
                break; // Good enough
            }
        }

        // Strategy 2: Iframes (Standard)
        if (!videoUrl) {
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src && (src.includes('video') || src.includes('embed') || src.includes('player'))) {
                    // Filter out ads/trackers if known, otherwise take best guess
                    if (!src.includes('facebook') && !src.includes('twitter')) {
                        videoUrl = src;
                        return false; // Break
                    }
                }
            });
        }

        // Strategy 3: Fanproj specific structure
        if (!videoUrl) {
            const customFrame = $('#pembed iframe').attr('src');
            if (customFrame) videoUrl = customFrame;
        }

        if (videoUrl) {
            console.log(`  ✅ Found video: ${videoUrl}`);
            return { success: true, videoUrl: videoUrl };
        }

        console.log('  ❌ No video found');
        return { success: false, error: 'No video sources found' };

    } catch (e) {
        console.error(`  ❌ search error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

module.exports = {
    scrapeMovies,
    scrapeMovieVideo,
    startBackgroundScrapes,
    getCategorizedMovies: () => ({ 'All': cachedMovies }) // Helper
};

// Auto-start logic removed to be controlled by server.js

const { scrapeMovies, startBackgroundScrapes } = require('./scraper');
const fs = require('fs');
const path = require('path');

async function generate() {
    console.log('🚀 Starting Static Database Generation...');

    // 1. Initial Scrape (First few pages)
    console.log('Step 1: Initial Scrape...');
    const initialMovies = await scrapeMovies(true); // forceRefresh = true
    console.log(`Initial count: ${initialMovies.length}`);

    // 2. Background Scrape (The rest)
    console.log('Step 2: Deep Scrape (This may take a minute)...');
    // Start from ID 1 + initial length roughly, but function handles it
    // Pass a dummy ID, logic inside handles cache
    await startBackgroundScrapes(initialMovies.length + 1);

    // 3. Save
    const finalMovies = require('./scraper').getCategorizedMovies().All;
    console.log(`\n🎉 Generation Complete! Total Movies: ${finalMovies.length}`);

    const outputPath = path.join(__dirname, 'public', 'movies.json');
    fs.writeFileSync(outputPath, JSON.stringify(finalMovies, null, 2));
    console.log(`✅ Saved to ${outputPath}`);

    console.log('File size: ' + (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2) + ' MB');
}

generate().catch(console.error);

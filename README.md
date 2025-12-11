# Hashistrem - Premium Movie Streaming Platform

A state-of-the-art movie streaming platform that scrapes content from fanprojnet.com and presents it with a stunning UI inspired by Google TV and Apple TV+.

## Features

✨ **Premium UI/UX**
- Glassmorphism design elements
- Smooth animations and transitions
- Google TV / Apple TV+ inspired interface
- Fully responsive layout

🎬 **Custom Video Player**
- Play/pause controls
- Progress bar with seeking
- Volume control
- Fullscreen support
- Keyboard shortcuts (Space: play/pause, F: fullscreen, M: mute, Arrow keys: seek)
- Auto-hide controls

🔍 **Smart Features**
- Category-based browsing
- Real-time search
- Movie categorization
- Caching for performance

🌐 **Backend Scraping**
- Axios + Cheerio web scraping
- Automatic data extraction
- REST API endpoints
- CORS-enabled for cross-origin requests

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Open in Browser**
   Navigate to `http://localhost:3000`

## API Endpoints

- `GET /api/movies` - Get all movies
- `GET /api/categories` - Get categorized movies
- `POST /api/video` - Get video URL for a specific movie

## Technology Stack

- **Backend**: Node.js, Express, Axios, Cheerio
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Design**: Custom CSS with modern features (Grid, Flexbox, Animations)
- **Fonts**: Google Fonts (Inter, Outfit)

## Keyboard Shortcuts

- **Space** - Play/Pause
- **F** - Toggle Fullscreen
- **M** - Toggle Mute
- **Arrow Left** - Rewind 10 seconds
- **Arrow Right** - Forward 10 seconds
- **Escape** - Close video player

## Project Structure

```
hashistrem/
├── server.js           # Express server
├── scraper.js          # Web scraping logic
├── index.html          # Main HTML file
├── styles.css          # Premium CSS styling
├── app.js              # Application logic
├── video-player.js     # Custom video player
├── package.json        # Dependencies
└── README.md           # This file
```

## License

MIT

---

**Built with ❤️ for premium streaming experience**

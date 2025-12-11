
// Shaleemo - Enhanced with 10 Advanced Features
const App = {
    // State
    movies: [],
    allMovies: [],
    categories: new Set(),
    recentlyWatched: [],
    favorites: [],
    watchLater: [], // NEW
    watchProgress: {},
    currentCategory: 'All',
    currentSort: 'default',
    currentMovie: null,
    viewMode: 'grid',

    // Pagination
    currentPage: 1,
    moviesPerPage: 30,

    // Context Menu
    contextMenuTarget: null,

    async init() {




        console.log('🎬 App Initializing...');
        console.log('🎬 Loading Shaleemo with 10 advanced features...');
        this.loadPreferences();
        this.setupEvents();
        this.showSkeletons(true);
        await this.loadMovies();
        this.showSkeletons(false);
        this.updateMobileNav();

        // AUTO-UPDATE: Sync movies every 8 seconds to catch background updates
        setInterval(() => this.syncMoviesSilent(), 8000);
    },

    async syncMoviesSilent() {
        try {
            const res = await fetch(`/api/categories?t=${Date.now()}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && data.categories.All && data.categories.All.length > this.allMovies.length) {
                const oldCount = this.allMovies.length;
                this.allMovies = data.categories.All;
                const newCount = this.allMovies.length;

                // Process new movies
                this.allMovies.forEach((m, index) => {
                    if (m.year) m.year = parseInt(m.year) + 1;
                    m.title = m.title.trim();
                    m.showNewBadge = (index % 5 === 0);
                });

                // Re-sort
                this.allMovies.sort((a, b) => {
                    const yearA = a.year || 0;
                    const yearB = b.year || 0;
                    if (yearB !== yearA) return yearB - yearA;
                    return 0;
                });

                // If user is on "All" category and page 1, refresh grid gracefully
                if (this.currentCategory === 'All') {
                    // Update current view logic (keep persistent sort/filter if possible)
                    this.movies = [...this.allMovies];
                    this.render();
                    this.showToast(`⚡ Found ${newCount - oldCount} new movies!`);
                }
            }
        } catch (e) { console.log('Sync skipped'); }
    },

    updateMobileNav() {
        const navItems = document.querySelectorAll('.nav-item');
        if (!navItems.length) return;

        navItems.forEach(item => item.classList.remove('active'));
        if (this.viewMode === 'favorites') { // FIXED: was this.view
            navItems[2].classList.add('active');
        } else if (this.viewMode === 'grid' || this.viewMode === 'list') {
            navItems[0].classList.add('active');
        }
    },

    // NEW: Load User Preferences from localStorage
    loadPreferences() {
        // Dark mode
        // Dark mode
        // Force Light Mode as requested by user
        localStorage.setItem('shaleemo_theme', 'light');
        document.body.classList.remove('dark-mode');
        this.updateDarkModeIcon(false);
        /* 
        const theme = localStorage.getItem('shaleemo_theme');
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            this.updateDarkModeIcon(true);
        }
        */

        // View mode
        this.viewMode = localStorage.getItem('shaleemo_viewMode') || 'grid';
        if (this.viewMode === 'list') {
            document.body.classList.add('list-view');
        }
        this.updateViewButtons();

        // Favorites
        const savedFavorites = localStorage.getItem('shaleemo_favorites');
        if (savedFavorites) {
            this.favorites = JSON.parse(savedFavorites);
        }

        // Watch Later - NEW
        const savedWatchLater = localStorage.getItem('shaleemo_watchLater');
        if (savedWatchLater) {
            this.watchLater = JSON.parse(savedWatchLater);
        }

        // Watch progress
        const savedProgress = localStorage.getItem('shaleemo_watchProgress');
        if (savedProgress) {
            this.watchProgress = JSON.parse(savedProgress);
        }

        // Recently watched
        const savedRecent = localStorage.getItem('recentlyWatched');
        if (savedRecent) {
            this.recentlyWatched = JSON.parse(savedRecent);
        }
    },

    setupEvents() {
        // Search
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        searchInput?.addEventListener('input', (e) => {
            this.search(e.target.value);
            clearSearch.style.display = e.target.value ? 'block' : 'none';
        });

        clearSearch?.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch.style.display = 'none';
            this.currentPage = 1;
            this.render();
        });

        // Sort
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.applySorting();
        });

        // NEW: Dark Mode Toggle
        document.getElementById('darkModeToggle')?.addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // NEW: Favorites Filter
        document.getElementById('favoritesBtn')?.addEventListener('click', () => {
            this.showFavorites();
        });

        // NEW: Watch Later Filter
        document.getElementById('watchLaterBtn')?.addEventListener('click', () => {
            this.showWatchLater();
        });

        // NEW: Random Movie
        document.getElementById('randomMovieBtn')?.addEventListener('click', () => {
            if (this.allMovies.length > 0) {
                const random = this.allMovies[Math.floor(Math.random() * this.allMovies.length)];
                this.openPlayer(random.id);
                this.showToast('🎲 Random Movie: ' + random.title);
            }
        });

        // NEW: View Toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.setViewMode(view);
            });
        });

        // NEW: Advanced Filters
        document.getElementById('filterToggle')?.addEventListener('click', () => {
            document.getElementById('advancedFilters')?.classList.toggle('active');
        });

        document.getElementById('yearMin')?.addEventListener('input', () => this.applyAdvancedFilters());
        document.getElementById('yearMax')?.addEventListener('input', () => this.applyAdvancedFilters());

        document.getElementById('resetFilters')?.addEventListener('click', () => {
            document.getElementById('yearMin').value = '';
            document.getElementById('yearMax').value = '';
            this.currentCategory = 'All';
            this.movies = [...this.allMovies];
            this.currentPage = 1;
            this.renderCategoryChips();
            this.render();
        });

        // NEW: Pagination
        document.getElementById('prevPage')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        document.getElementById('nextPage')?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.movies.length / this.moviesPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // Back to Top
        const backToTop = document.getElementById('backToTop');
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTop?.classList.add('visible');
            } else {
                backToTop?.classList.remove('visible');
            }
        });

        backToTop?.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closePlayer();
                document.getElementById('shortcutsModal')?.classList.remove('active');
                this.hideContextMenu();
            }

            if (e.key === '/' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                searchInput?.focus();
            }

            if (e.key === '?' && e.target.tagName !== 'INPUT') {
                document.getElementById('shortcutsModal')?.classList.add('active');
            }

            if (e.key === 'd' && e.target.tagName !== 'INPUT') {
                this.toggleDarkMode();
            }
        });

        document.getElementById('closeShortcuts')?.addEventListener('click', () => {
            document.getElementById('shortcutsModal')?.classList.remove('active');
        });

        // Modal controls
        document.getElementById('closeBtn')?.addEventListener('click', () => this.closePlayer());
        document.getElementById('modalBackdrop')?.addEventListener('click', () => this.closePlayer());
        document.getElementById('addToWatched')?.addEventListener('click', () => this.markAsWatched());

        // NEW: Share Button
        document.getElementById('shareMovie')?.addEventListener('click', () => {
            if (this.currentMovie) {
                this.shareMovie(this.currentMovie);
            }
        });

        // NEW: Context Menu
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            const card = e.target.closest('.movie-card');
            if (card) {
                e.preventDefault();
                const movieId = parseInt(card.dataset.id);
                this.showContextMenu(e.clientX, e.clientY, movieId);
            }
        });

        document.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.currentTarget.dataset.action;
                this.handleContextAction(action);
            });
        });
    },

    // NEW: Dark Mode Toggle
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('shaleemo_theme', isDark ? 'dark' : 'light');
        this.updateDarkModeIcon(isDark);
    },

    updateDarkModeIcon(isDark) {
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');
        if (isDark) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    },

    // NEW: View Mode Toggle
    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('shaleemo_viewMode', mode);

        if (mode === 'list') {
            document.body.classList.add('list-view');
        } else {
            document.body.classList.remove('list-view');
        }

        this.updateViewButtons();
    },

    updateViewButtons() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            if (btn.dataset.view === this.viewMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // NEW: Favorites System
    toggleFavorite(movieId) {
        const index = this.favorites.indexOf(movieId);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(movieId);
        }
        localStorage.setItem('shaleemo_favorites', JSON.stringify(this.favorites));
        this.render();
        this.showToast(index > -1 ? 'Removed from favorites' : 'Added to favorites');
    },

    showFavorites() {
        if (this.favorites.length === 0) {
            this.showToast('No favorites yet!');
            return;
        }
        this.movies = this.allMovies.filter(m => this.favorites.includes(m.id));
        this.currentPage = 1;
        this.currentCategory = 'Favorites';
        this.renderCategoryChips();
        this.render();
        this.showToast(`Showing ${this.movies.length} favorites`);
    },

    // NEW: Watch Later
    toggleWatchLater(movieId) {
        const index = this.watchLater.indexOf(movieId);
        if (index > -1) {
            this.watchLater.splice(index, 1);
        } else {
            this.watchLater.push(movieId);
        }
        localStorage.setItem('shaleemo_watchLater', JSON.stringify(this.watchLater));
        this.showToast(index > -1 ? 'Removed from Watch Later' : 'Added to Watch Later');
    },

    showWatchLater() {
        if (this.watchLater.length === 0) {
            this.showToast('Watch Later list is empty!');
            return;
        }
        this.movies = this.allMovies.filter(m => this.watchLater.includes(m.id));
        this.currentPage = 1;
        this.currentCategory = 'Watch Later';
        this.renderCategoryChips();
        this.render();
        this.showToast(`Showing ${this.movies.length} saved movies`);
    },

    // NEW: Toast Notification
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // NEW: Share Movie
    shareMovie(movie) {
        const url = `${window.location.origin}?movie = ${movie.id} `;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Link copied to clipboard!');
        }).catch(() => {
            this.showToast('Failed to copy link');
        });
    },

    // NEW: Context Menu
    showContextMenu(x, y, movieId) {
        const menu = document.getElementById('contextMenu');
        this.contextMenuTarget = movieId;
        menu.style.left = `${x} px`;
        menu.style.top = `${y} px`;
        menu.classList.add('active');
    },

    hideContextMenu() {
        document.getElementById('contextMenu')?.classList.remove('active');
    },

    handleContextAction(action) {
        const movie = this.allMovies.find(m => m.id === this.contextMenuTarget);
        if (!movie) return;

        switch (action) {
            case 'play':
                this.openPlayer(movie.id);
                break;
            case 'favorite':
                this.toggleFavorite(movie.id);
                break;
            case 'watchlater':
                this.toggleWatchLater(movie.id);
                break;
            case 'share':
                this.shareMovie(movie);
                break;
        }
        this.hideContextMenu();
    },

    // NEW: Advanced Filters
    applyAdvancedFilters() {
        const yearMin = parseInt(document.getElementById('yearMin')?.value) || 0;
        const yearMax = parseInt(document.getElementById('yearMax')?.value) || 9999;

        let filtered = [...this.allMovies];

        // Category filter
        if (this.currentCategory !== 'All') {
            filtered = filtered.filter(m => m.category === this.currentCategory);
        }

        // Year filter
        filtered = filtered.filter(m => {
            const year = m.year || 2024;
            return year >= yearMin && year <= yearMax;
        });

        this.movies = filtered;
        this.currentPage = 1;
        this.render();
    },

    async loadMovies() {
        try {
            console.log('Fetching movies...');
            const grid = document.getElementById('moviesGrid');

            const res = await fetch(`/api/categories?t=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP Error: ${res.status} `);

            const data = await res.json();
            console.log('Data received:', data);

            if (data.success) {
                this.allMovies = data.categories.All || [];

                if (this.allMovies.length === 0) {
                    if (grid) grid.innerHTML = '<div style="color:white; padding:20px; text-align:center;">No movies found in the database.</div>';
                    this.showSkeletons(false);
                    return;
                }

                // NEW: Process movies (Increment Year + Clean Data)
                this.allMovies.forEach((m, index) => {
                    // Increment year by 1 as requested
                    if (m.year) m.year = parseInt(m.year) + 1;
                    // Ensure Clean Title if needed (Optional, but safe)
                    m.title = m.title.trim();
                    // "Only one 1/5" should be new
                    m.showNewBadge = (index % 5 === 0);
                });

                // NEW: Default Sort (Latest First + Premium Thumbnails)
                // 1. Sort by Year Descending
                // 2. Prioritize non-placeholder images (Premium check)
                this.allMovies.sort((a, b) => {
                    const yearA = a.year || 0;
                    const yearB = b.year || 0;

                    // Primary: Year
                    if (yearB !== yearA) return yearB - yearA;

                    // Secondary: Thumbnail Quality (Deprioritize placeholders)
                    const isPlaceA = a.thumbnail.includes('placeholder');
                    const isPlaceB = b.thumbnail.includes('placeholder');
                    if (isPlaceA && !isPlaceB) return 1;
                    if (!isPlaceA && isPlaceB) return -1;

                    return 0;
                });

                this.movies = [...this.allMovies]; // Initial view
                // Assuming updateMovieCount and renderCategories are defined elsewhere or will be added
                // this.updateMovieCount(); 
                // this.renderCategories(); 

                // Extract categories
                Object.keys(data.categories).forEach(cat => {
                    if (cat !== 'All') this.categories.add(cat);
                });

                console.log(`✓ Loaded ${this.movies.length} movies(${this.allMovies.filter(m => m.isNew).length} new)`);

                this.renderCategoryChips();
                this.render();

                // Show toast
                this.showToast(`Loaded ${this.allMovies.length} movies!`);
            } else {
                throw new Error(data.error || 'Unknown server error');
            }
        } catch (err) {
            console.error('Error loading movies:', err);
            const grid = document.getElementById('moviesGrid');
            if (grid) {
                grid.innerHTML = `
                    <div style="color: #ff5555; text-align: center; padding: 40px; background: rgba(255,0,0,0.1); border-radius: 8px;">
                        <h3>Error Loading Movies</h3>
                        <p>${err.message}</p>
                        <p style="font-size:12px; margin-top:10px;">Please ensure server.js is running.</p>
                        <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; cursor:pointer;">Retry</button>
                    </div>
                `;
            }
            this.showToast('Error loading movies');
        } finally {
            this.showSkeletons(false);
        }
    },

    renderCategoryChips() {
        const container = document.getElementById('filterChips');
        if (!container) return;

        // Add Recently Watched and Favorites as special categories
        const cats = ['All', 'Recently Watched', ...Array.from(this.categories)];
        container.innerHTML = cats.map(cat => `
            <button class="chip ${cat === this.currentCategory ? 'active' : ''}"
                    onclick="App.filterByCategory('${cat}')">
                ${cat === 'Recently Watched' ? '🕒 ' : ''}${cat}
            </button>
        `).join('');
    },

    filterByCategory(category) {
        this.currentCategory = category;
        this.currentPage = 1;

        if (category === 'Recently Watched') {
            if (this.recentlyWatched.length === 0) {
                this.showToast('No recently watched movies');
                this.movies = [];
            } else {
                this.movies = this.recentlyWatched
                    .map(id => this.allMovies.find(m => m.id === id))
                    .filter(m => m);
            }
            this.render();
        } else {
            this.applyAdvancedFilters();
        }
        this.renderCategoryChips();
    },

    playRandom() {
        if (this.allMovies.length === 0) return;
        const randomMovie = this.allMovies[Math.floor(Math.random() * this.allMovies.length)];
        this.openPlayer(randomMovie.id);
    },

    applySorting() {
        let sorted = [...this.movies];

        switch (this.currentSort) {
            case 'name':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'year':
                sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
                break;
            case 'category':
                sorted.sort((a, b) => a.category.localeCompare(b.category));
                break;
        }

        this.movies = sorted;
        this.render();
    },

    // NEW: Pagination Render
    render() {
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;

        const totalPages = Math.ceil(this.movies.length / this.moviesPerPage);
        const start = (this.currentPage - 1) * this.moviesPerPage;
        const end = start + this.moviesPerPage;
        const pageMovies = this.movies.slice(start, end);

        grid.innerHTML = pageMovies.map(m => this.createCard(m)).join('');

        // Update movie count
        document.getElementById('movieCount').textContent =
            `${this.movies.length} movie${this.movies.length !== 1 ? 's' : ''} `;

        // Update pagination
        this.renderPagination(totalPages);
    },

    renderPagination(totalPages) {
        const pagination = document.getElementById('pagination');
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';

        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageNumbers = document.getElementById('pageNumbers');

        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        // Render page numbers (Responsive limit)
        let pages = [];
        const isMobile = window.innerWidth < 768;
        const maxVisible = isMobile ? 3 : 7; // Show fewer on mobile

        if (totalPages <= maxVisible) {
            pages = Array.from({ length: totalPages }, (_, i) => i + 1);
        } else {
            // Complex logic for fewer keys
            if (isMobile) {
                // Simplified mobile logic: [1, .. cur .. tot]
                if (this.currentPage <= 2) {
                    pages = [1, 2, '...', totalPages];
                } else if (this.currentPage >= totalPages - 1) {
                    pages = [1, '...', totalPages - 1, totalPages];
                } else {
                    pages = [1, '...', this.currentPage, '...', totalPages];
                }
            } else {
                // Desktop logic (Existing)
                if (this.currentPage <= 4) {
                    pages = [1, 2, 3, 4, 5, '...', totalPages];
                } else if (this.currentPage >= totalPages - 3) {
                    pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
                } else {
                    pages = [1, '...', this.currentPage - 1, this.currentPage, this.currentPage + 1, '...', totalPages];
                }
            }
        }

        pageNumbers.innerHTML = pages.map(p => {
            if (p === '...') {
                return '<span style="padding:8px">...</span>';
            }
            return `
                <button class="page-num ${p === this.currentPage ? 'active' : ''}"
                        onclick="App.goToPage(${p})">
                    ${p}
                </button>
            `;
        }).join('');
    },

    goToPage(page) {
        this.currentPage = page;
        this.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },


    createCard(movie) {
        const isFavorite = this.favorites.includes(movie.id);
        const progress = this.watchProgress[movie.id] || 0;
        // Logic: Must be flagged as 'showNewBadge' (1/5) AND recent year
        const isNew = movie.showNewBadge && (movie.year >= 2025);
        const rating = movie.rating || 4.0;

        // Generate star rating HTML
        const fullStars = Math.floor(rating);
        const hasHalfStar = (rating % 1) >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

        const starsHTML = '★'.repeat(fullStars) +
            (hasHalfStar ? '⯨' : '') +
            '☆'.repeat(emptyStars);

        return `
            <div class="movie-card" data-id="${movie.id}" onclick="App.openPlayer(${movie.id})">
        ${isNew ? '<div class="new-badge">✨ NEW</div>' : ''}
                <button class="favorite-icon ${isFavorite ? 'active' : ''}" 
                        onclick="event.stopPropagation(); App.toggleFavorite(${movie.id})">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" 
                         stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <img src="${movie.thumbnail}" alt="${movie.title}" loading="lazy" referrerpolicy="no-referrer"
                     onerror="this.src='https://via.placeholder.com/300x450?text=${encodeURIComponent(movie.title.substring(0, 10))}'">
                ${progress > 0 ? `
                    <div class="watch-progress">
                        <div class="watch-progress-fill" style="width: ${progress}%"></div>
                    </div>
                ` : ''}
                <div class="movie-card-info">
                    <div class="movie-rating">
                        <span class="stars">${starsHTML}</span>
                        <span class="rating-number">${rating.toFixed(1)}</span>
                    </div>
                    <div class="movie-card-title">${movie.title}</div>
                    <div class="movie-card-meta">${movie.year || '2024'} • ${movie.category}</div>
                    ${movie.description ? `<div class="movie-description">${movie.description}</div>` : ''}
                </div>
            </div>
`;
    },

    loadRecommendations(movie) {
        const similar = this.allMovies
            .filter(m => m.category === movie.category && m.id !== movie.id)
            .slice(0, 6);

        const grid = document.getElementById('recGrid');
        if (!grid) return;

        grid.innerHTML = similar.map(m => this.createCard(m)).join('');
    },

    markAsWatched() {
        if (this.currentMovie) {
            this.watchProgress[this.currentMovie.id] = 100;
            localStorage.setItem('shaleemo_watchProgress', JSON.stringify(this.watchProgress));
            this.saveRecentlyWatched(this.currentMovie.id);
            const btn = document.getElementById('addToWatched');
            if (btn) {
                btn.textContent = '✓ Watched';
                btn.style.background = '#e8f0fe';
                btn.style.color = '#1967d2';
            }
            this.showToast('Marked as watched!');
        }
    },

    renderVideo(container, videoUrl) {
        const isDirect = videoUrl.includes('.mp4') ||
            videoUrl.includes('dl.khaanfilms.com') ||
            videoUrl.includes('vip.khaanfilms.com') ||
            videoUrl.includes('drama.khaanfilms.com') ||
            videoUrl.includes('storage');

        if (isDirect) {
            container.innerHTML = `
                <video controls autoplay name="media" style="width:100%; height:100%; object-fit:contain;">
                    <source src="${videoUrl}" type="video/mp4">
                </video>`;
        } else {
            container.innerHTML = `
                <iframe src="${videoUrl}" 
                    frameborder="0" 
                    sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen 
                    style="width:100%; height:100%; border:0; position:absolute; top:0; left:0;">
                </iframe>`;
        }
    },

    saveRecentlyWatched(movieId) {
        if (!this.recentlyWatched.includes(movieId)) {
            this.recentlyWatched.unshift(movieId);
            this.recentlyWatched = this.recentlyWatched.slice(0, 10);
            localStorage.setItem('recentlyWatched', JSON.stringify(this.recentlyWatched));
            this.renderRecentlyWatched();
        }
    },

    renderRecentlyWatched() {
        if (this.recentlyWatched.length === 0) return;

        const section = document.getElementById('recentSection');
        const grid = document.getElementById('recentGrid');

        if (!section || !grid) return;

        const movies = this.recentlyWatched
            .map(id => this.allMovies.find(m => m.id === id))
            .filter(m => m);

        if (movies.length > 0) {
            section.style.display = 'block';
            grid.innerHTML = movies.map(m => this.createCard(m)).join('');
        }
    },

    showSkeletons(show) {
        const skeletons = document.getElementById('skeletonGrid');
        if (skeletons) {
            skeletons.style.display = show ? 'grid' : 'none';
        }
    },

    search(query) {
        if (!query.trim()) {
            this.movies = this.currentCategory === 'All' ?
                [...this.allMovies] :
                this.allMovies.filter(m => m.category === this.currentCategory);
            this.currentPage = 1;
            this.render();
            return;
        }

        const results = this.allMovies.filter(m =>
            m.title.toLowerCase().includes(query.toLowerCase())
        );
        this.movies = results;
        this.currentPage = 1;
        this.render();
    },

    openPlayer(movieId) {
        const movie = this.allMovies.find(m => m.id === movieId);
        if (!movie) return;

        this.currentMovie = movie;
        const modal = document.getElementById('videoModal');
        const container = document.getElementById('videoContainer');
        const title = document.getElementById('videoTitle');
        const meta = document.getElementById('videoMeta');
        const addToWatchedBtn = document.getElementById('addToWatched');

        if (modal) {
            modal.classList.add('active');
        }

        if (title) title.textContent = movie.title;
        if (meta) meta.textContent = `${movie.year || '2024'} • ${movie.category} `;

        // Reset Watched Button
        if (addToWatchedBtn) {
            const isWatched = this.watchProgress[movie.id] === 100;
            addToWatchedBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    ${isWatched ? 'Watched' : 'Mark as Watched'}
`;
            if (isWatched) {
                addToWatchedBtn.classList.add('watched');
                addToWatchedBtn.style.background = '#e8f0fe';
                addToWatchedBtn.style.color = '#1967d2';
            } else {
                addToWatchedBtn.classList.remove('watched');
                addToWatchedBtn.style.background = '';
                addToWatchedBtn.style.color = '';
            }
        }

        // Load recommendations
        this.loadRecommendations(movie);

        // Fetch video
        if (container) {
            container.innerHTML = '<div class="loading">Loading video...</div>';

            if (movie.videoUrl) {
                console.log('Using pre-scraped video URL:', movie.videoUrl);
                this.renderVideo(container, movie.videoUrl);
            } else {
                fetch('/api/video', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        movieUrl: movie.link
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.videoUrl) {
                            this.renderVideo(container, data.videoUrl);
                        } else if (data.videoUrl) {
                            // Fallback to proxying the page itself if scraper failed but we have a URL
                            console.log('Falling back to proxy for:', data.videoUrl);
                            const proxyUrl = `/api/proxy?url=${encodeURIComponent(data.videoUrl)}`;
                            container.innerHTML = `
                            <iframe src="${proxyUrl}" 
                                frameborder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowfullscreen 
                                style="width:100%; height:100%; border:0; position:absolute; top:0; left:0; filter: contrast(1.1);">
                            </iframe>
                            <div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); color:white; padding:5px 10px; border-radius:4px; font-size:12px; pointer-events:none;">
                                Proxy Mode
                            </div>
                        `;
                        } else {
                            container.innerHTML = `<div class="loading">Video not found. <a href="${movie.link}" target="_blank" style="color:white;text-decoration:underline;">Click here to watch on source site</a></div>`;
                        }
                    })
                    .catch(err => {
                        container.innerHTML = '<div class="loading">Error loading video.</div>';
                        console.error(err);
                    });
            }
        }
    },

    closePlayer() {
        const modal = document.getElementById('videoModal');
        const container = document.getElementById('videoContainer');

        if (modal) {
            modal.classList.remove('active');
        }

        if (container) container.innerHTML = ''; // Stop video
        this.currentMovie = null;
    }
};

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

window.App = App;

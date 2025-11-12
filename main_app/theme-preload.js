// Theme preload script - must run before any rendering
(function() {
    'use strict';
    
    function detectSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    function applyTheme(theme) {
        const html = document.documentElement;
        const body = document.body;
        if (theme === 'light') {
            html.classList.add('light-theme');
            if (body) body.classList.add('light-theme');
        } else {
            html.classList.remove('light-theme');
            if (body) body.classList.remove('light-theme');
        }
    }

    // Try to get saved theme from localStorage first (synchronous)
    let savedTheme = null;
    try {
        // Check if we have a cached theme in localStorage for instant loading
        savedTheme = localStorage.getItem('quicknotes_theme_cache');
    } catch (e) {
        // Ignore localStorage errors
    }

    // Apply saved theme immediately if available, otherwise use system theme
    const initialTheme = savedTheme || detectSystemTheme();
    applyTheme(initialTheme);

    // Then verify with IndexedDB (asynchronous) and update if different
    if (typeof dbManager !== 'undefined') {
        dbManager.getSetting('theme').then(function(theme) {
            if (theme && theme !== initialTheme) {
                // Database has different theme, apply it
                applyTheme(theme);
                // Update localStorage cache
                try {
                    localStorage.setItem('quicknotes_theme_cache', theme);
                } catch (e) {
                    // Ignore localStorage errors
                }
            } else if (theme) {
                // Sync localStorage cache
                try {
                    localStorage.setItem('quicknotes_theme_cache', theme);
                } catch (e) {
                    // Ignore localStorage errors
                }
            }
        }).catch(function(error) {
            console.error('Error loading theme:', error);
        });
    }
})();

// Theme preload script for AI chat window - must run before any rendering
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
        savedTheme = localStorage.getItem('quicknotes_theme_cache');
    } catch (e) {}
    
    // Apply saved theme immediately if available, otherwise use system theme
    const initialTheme = savedTheme || detectSystemTheme();
    applyTheme(initialTheme);
})();

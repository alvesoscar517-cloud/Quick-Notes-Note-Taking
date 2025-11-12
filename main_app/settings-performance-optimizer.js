// Settings Performance Optimizer
// Performance optimization for Settings page

class SettingsPerformanceOptimizer {
    constructor() {
        this.aiUsageInterval = null;
        this.premiumStatusCache = null;
        this.premiumStatusCacheTime = 0;
        this.PREMIUM_CACHE_DURATION = 60000; // 1 minute
        this.lastAIUsageData = null;
        this.isSettingsPageActive = false;
        this.observers = [];
    }

    /**
     * Initialize optimizer when opening settings page
     */
    init() {
        this.isSettingsPageActive = true;
        this.startSmartPolling();
        this.setupVisibilityListener();
    }

    /**
     * Cleanup when closing settings page
     */
    cleanup() {
        this.isSettingsPageActive = false;
        this.stopPolling();
        this.clearObservers();
    }

    /**
     * Smart Polling - Only poll when necessary
     */
    startSmartPolling() {
        // Stop old polling if exists
        this.stopPolling();
        // Only poll when settings page is active
        if (!this.isSettingsPageActive) return;
        // Load initial data
        this.loadAIUsageDataOptimized();
        // Poll with smart frequency
        this.aiUsageInterval = setInterval(() => {
            if (this.isSettingsPageActive && document.visibilityState === 'visible') {
                this.loadAIUsageDataOptimized();
            }
        }, 30000); // Increased from 10s to 30s to reduce load
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.aiUsageInterval) {
            clearInterval(this.aiUsageInterval);
            this.aiUsageInterval = null;
        }
    }

    /**
     * Listen to visibility change to pause polling when tab is not active
     */
    setupVisibilityListener() {
        const visibilityHandler = () => {
            if (document.visibilityState === 'hidden') {
                this.stopPolling();
            } else if (this.isSettingsPageActive) {
                this.startSmartPolling();
            }
        };

        document.addEventListener('visibilitychange', visibilityHandler);
        this.observers.push({
            type: 'visibilitychange',
            handler: visibilityHandler
        });
    }

    /**
     * Load AI Usage Data - Call function from main_app.js
     */
    async loadAIUsageDataOptimized(forceRefresh = false) {
        try {
            // Call loadAIUsageData function from main_app.js if available
            if (typeof window.loadAIUsageData === 'function') {
                await window.loadAIUsageData(forceRefresh);
            } else {
                console.warn('loadAIUsageData function not found in main_app.js');
            }
        } catch (error) {
            console.error('Error loading AI usage data from optimizer:', error);
        }
    }

    /**
     * Check Premium Status with cache
     */
    async checkServerPremiumStatusCached(userEmail) {
        const now = Date.now();

        // Use cache if still valid
        if (this.premiumStatusCache &&
            this.premiumStatusCache.email === userEmail &&
            (now - this.premiumStatusCacheTime < this.PREMIUM_CACHE_DURATION)) {
            return this.premiumStatusCache.status;
        }
        // Call API if cache expired
        try {
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/payment/check-premium?email=${encodeURIComponent(userEmail)}`);
            const result = await response.json();

            // Cache result
            this.premiumStatusCache = {
                email: userEmail,
                status: result
            };
            this.premiumStatusCacheTime = now;

            return result;
        } catch (error) {
            console.error('Error checking premium status:', error);
            return { isPremium: false };
        }
    }

    /**
     * Check AI Unlock Status optimized
     */
    async checkAIUnlockStatusOptimized() {
        try {
            const aiUnlocked = await dbManager.getSetting('aiUnlocked');
            let isAIUnlocked = aiUnlocked === true;

            const userEmail = await this.getUserEmail();
            if (userEmail) {
                // Use cached premium status
                const serverStatus = await this.checkServerPremiumStatusCached(userEmail);

                if (serverStatus.isPremium !== isAIUnlocked) {
                    // Only update when there's a change
                    await dbManager.saveSetting('aiUnlocked', serverStatus.isPremium);
                    isAIUnlocked = serverStatus.isPremium;

                    // Only update UI when there's a change
                    this.updateUnlockButtonDisplayOptimized(isAIUnlocked);
                }
            }

            return isAIUnlocked;
        } catch (error) {
            console.error('Error checking AI unlock status:', error);
            return false;
        }
    }

    /**
     * Update AI Usage Display - Only update when there's a change
     */
    updateAIUsageDisplayOptimized(stats) {
        // Compare with old data, only update when there's a change
        if (this.lastAIUsageData &&
            JSON.stringify(this.lastAIUsageData) === JSON.stringify(stats)) {
            return; // No change, skip update
        }
        this.lastAIUsageData = { ...stats };
        // Batch DOM updates
        requestAnimationFrame(() => {
            const usageCount = document.getElementById('ai-usage-count');
            const usageProgress = document.getElementById('ai-usage-progress');
            const usagePercentage = document.getElementById('ai-usage-percentage');

            if (stats.requiresLogin) {
                if (usageCount) {
                    usageCount.textContent = '0/0';
                    usageCount.className = 'usage-count login-required';
                }
                if (usageProgress) {
                    usageProgress.style.width = '0%';
                    usageProgress.className = 'usage-progress-fill login-required';
                }
                if (usagePercentage) {
                    usagePercentage.textContent = 'LOCK';
                }
                return;
            }

            if (stats.isPremium) {
                if (usageCount) {
                    usageCount.textContent = chrome.i18n.getMessage('settings_unlimited') || 'Unlimited';
                    usageCount.className = 'usage-count unlimited';
                }
                if (usageProgress) {
                    usageProgress.style.width = '100%';
                    usageProgress.className = 'usage-progress-fill unlimited';
                }
                if (usagePercentage) {
                    usagePercentage.textContent = '∞';
                }
                return;
            }

            // Normal display
            if (usageCount) {
                usageCount.textContent = `${stats.used}/${stats.limit}`;
                let className = 'usage-count';
                if (stats.percentage >= 95) className += ' danger';
                else if (stats.percentage >= 80) className += ' warning';
                usageCount.className = className;
            }

            if (usageProgress) {
                usageProgress.style.width = `${stats.percentage}%`;
                let className = 'usage-progress-fill';
                if (stats.percentage >= 95) className += ' danger';
                else if (stats.percentage >= 80) className += ' warning';
                usageProgress.className = className;
            }

            if (usagePercentage) {
                usagePercentage.textContent = `${stats.percentage}%`;
            }
        });
    }

    /**
     * Update Unlock Button Display optimized
     */
    updateUnlockButtonDisplayOptimized(isAIUnlocked) {
        requestAnimationFrame(() => {
            const unlockBtn = document.getElementById('unlock-ai-btn');
            const premiumUnlockedBtn = document.getElementById('premium-unlocked-btn');

            if (!unlockBtn || !premiumUnlockedBtn) return;

            if (isAIUnlocked) {
                unlockBtn.style.display = 'none';
                premiumUnlockedBtn.style.display = 'flex';
            } else {
                unlockBtn.style.display = 'flex';
                premiumUnlockedBtn.style.display = 'none';
            }
        });
    }

    /**
     * Helper: Check if user is logged in
     */
    async isUserLoggedIn() {
        try {
            const userEmail = await dbManager.getSetting('userEmail');
            return !!userEmail;
        } catch (error) {
            return false;
        }
    }

    /**
     * Helper: Get user email
     */
    async getUserEmail() {
        try {
            const userEmail = await dbManager.getSetting('userEmail');
            return userEmail || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear all observers
     */
    clearObservers() {
        this.observers.forEach(observer => {
            document.removeEventListener(observer.type, observer.handler);
        });
        this.observers = [];
    }

    /**
     * Invalidate premium cache (call when user changes premium status)
     */
    invalidatePremiumCache() {
        this.premiumStatusCache = null;
        this.premiumStatusCacheTime = 0;
    }
}

// Export singleton instance
window.settingsOptimizer = new SettingsPerformanceOptimizer();


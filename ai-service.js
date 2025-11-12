// ai-service.js - AI Service for Quick Notes

class AIService {
    constructor() {
        this.backendUrl = null; // Will be set dynamically
        this.cache = new Map();
        this.rateLimit = {
            requests: 0,
            resetTime: Date.now() + 60000, // 1 minute
            maxRequests: 60
        };
    }

    // Get user email from OAuth
    async getUserEmail() {
        try {
            if (typeof chrome !== 'undefined' && chrome.identity) {

                // Get email from OAuth2 token instead of getProfileUserInfo to avoid popup
                const token = await new Promise((resolve, reject) => {
                    chrome.identity.getAuthToken({ interactive: false }, token => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(token);
                    });
                });

                if (!token) {
                    return null;
                }

                const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const userInfo = await response.json();
                return userInfo.email;
            }
            return null;
        } catch (error) {
            console.error('Error getting user email:', error);
            return null;
        }
    }

    // Get backend URL
    getBackendUrl() {
        if (this.backendUrl) {
            return this.backendUrl;
        }

        // Use global serverSelector (always returns US server)
        if (typeof serverSelector !== 'undefined') {
            this.backendUrl = serverSelector.getServerUrl();
        } else {
            // Fallback to hardcoded US server
            this.backendUrl = 'https://quick-notes-85523783979.us-central1.run.app';
        }

        return this.backendUrl;
    }

    // Initialize AI service
    async initialize() {
        try {
            this.getBackendUrl();
            return true;
        } catch (error) {
            console.error('Failed to initialize AI service:', error);
            return false;
        }
    }

    // Set backend URL
    async setBackendUrl(url) {
        this.backendUrl = url;
        await dbManager.saveSetting('aiBackendUrl', url);
    }

    // Check rate limit
    checkRateLimit() {
        const now = Date.now();
        if (now > this.rateLimit.resetTime) {
            this.rateLimit.requests = 0;
            this.rateLimit.resetTime = now + 60000;
        }
        return this.rateLimit.requests < this.rateLimit.maxRequests;
    }

    // Check if user is logged in
    async isUserLoggedIn() {
        try {
            const userEmail = await this.getUserEmail();
            const isLoggedIn = !!userEmail;
            return isLoggedIn;
        } catch (error) {
            console.error('Error checking login status:', error);
            return false;
        }
    }

    // Make API request to backend
    async makeRequest(action, params = {}) {
        const backendUrl = this.getBackendUrl();
        if (!backendUrl) {
            throw new Error(chrome.i18n.getMessage('ai_backendNotConfigured') || 'Backend URL not configured');
        }

        // Check if user is logged in
        const isLoggedIn = await this.isUserLoggedIn();

        if (!isLoggedIn) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        // Get user email - required for server-side usage tracking and limit checking
        const userEmail = await this.getUserEmail();
        if (!userEmail) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        if (!this.checkRateLimit()) {
            throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
        }

        const cacheKey = this.getCacheKey(JSON.stringify({ action, params }), {});
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            this.rateLimit.requests++;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000); // 35 second timeout

            const response = await fetch(`${backendUrl}/api/ai/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify(params),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || `Backend request failed: ${response.status} ${response.statusText}`;

                if (response.status === 429) {
                    // Check if it's daily limit or rate limit from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
                } else if (response.status === 401) {
                    throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed. Please sign in again.');
                } else if (response.status === 403) {
                    // Check if it's daily limit related from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_accessDenied') || 'Access forbidden. Please check your permissions.');
                } else if (response.status >= 500) {
                    throw new Error(chrome.i18n.getMessage('ai_serviceDown') || 'Service down');
                } else {
                    throw new Error(errorMessage);
                }
            }

            const data = await response.json();

            if (!data.success || !data.result) {
                throw new Error(chrome.i18n.getMessage('ai_invalidResponse') || 'Invalid response from backend service.');
            }

            // Cache the result
            this.cache.set(cacheKey, data.result);

            return data.result;
        } catch (error) {
            console.error('Backend request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error(chrome.i18n.getMessage('ai_timeout') || 'Timeout');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error(chrome.i18n.getMessage('ai_noConnection') || 'No connection');
            } else {
                throw error;
            }
        }
    }

    // Make streaming API request to backend
    async makeStreamingRequest(action, params = {}) {
        const backendUrl = this.getBackendUrl();
        if (!backendUrl) {
            throw new Error(chrome.i18n.getMessage('ai_backendNotConfigured') || 'Backend URL not configured');
        }

        // Check if user is logged in
        const isLoggedIn = await this.isUserLoggedIn();

        if (!isLoggedIn) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        // Get user email - required for server-side usage tracking and limit checking
        const userEmail = await this.getUserEmail();
        if (!userEmail) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        if (!this.checkRateLimit()) {
            throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
        }

        try {
            this.rateLimit.requests++;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for streaming

            const response = await fetch(`${backendUrl}/api/ai/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify({
                    ...params,
                    streaming: true
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.text().catch(() => '');
                const errorMessage = errorData || `Backend request failed: ${response.status} ${response.statusText}`;

                if (response.status === 429) {
                    // Check if it's daily limit or rate limit from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
                } else if (response.status === 401) {
                    throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed. Please sign in again.');
                } else if (response.status === 403) {
                    // Check if it's daily limit related from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_accessDenied') || 'Access forbidden. Please check your permissions.');
                } else if (response.status >= 500) {
                    throw new Error(chrome.i18n.getMessage('ai_serviceDown') || 'Service down');
                } else {
                    throw new Error(errorMessage);
                }
            }

            // Return the response stream for processing
            return response;
        } catch (error) {
            console.error('Streaming request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error(chrome.i18n.getMessage('ai_timeout') || 'Timeout');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error(chrome.i18n.getMessage('ai_noConnection') || 'No connection');
            } else {
                throw error;
            }
        }
    }

    // Generate cache key
    getCacheKey(prompt, options) {
        return `${prompt}_${JSON.stringify(options)}`;
    }

    // Summarize content
    async summarize(content, options = {}) {
        return await this.makeRequest('summarize', {
            content,
            options
        });
    }

    // Expand content
    async expand(content, options = {}) {
        return await this.makeRequest('expand', {
            content,
            options
        });
    }

    // Improve content
    async improve(content, options = {}) {
        return await this.makeRequest('improve', {
            content,
            options
        });
    }

    // Tone transformation - 6 specialized methods
    async toneHumorous(content, options = {}) {
        return await this.makeRequest('tone/humorous', {
            content,
            options
        });
    }

    async tonePoetic(content, options = {}) {
        return await this.makeRequest('tone/poetic', {
            content,
            options
        });
    }

    async toneDramatic(content, options = {}) {
        return await this.makeRequest('tone/dramatic', {
            content,
            options
        });
    }

    async toneGenz(content, options = {}) {
        return await this.makeRequest('tone/genz', {
            content,
            options
        });
    }

    async toneProfessional(content, options = {}) {
        return await this.makeRequest('tone/professional', {
            content,
            options
        });
    }

    async toneSimplify(content, options = {}) {
        return await this.makeRequest('tone/simplify', {
            content,
            options
        });
    }

    // Get suggestions for improvement
    async getSuggestions(content, options = {}) {
        return await this.makeRequest('suggestions', {
            content,
            options
        });
    }

    // Create outline
    async createOutline(content, options = {}) {
        return await this.makeRequest('outline', {
            content,
            options
        });
    }

    // AI Chat - 2 specialized modes
    // Free chat - general conversational AI
    async chatFree(message, options = {}) {
        return await this.makeRequest('chat/free', {
            message,
            options
        });
    }

    // Free chat with streaming
    async chatFreeStream(message, options = {}) {
        return await this.makeStreamingRequest('chat/free', {
            message,
            options
        });
    }

    // Context chat - chat with selected text/note content
    async chatContext(message, context, options = {}) {
        return await this.makeRequest('chat/context', {
            message,
            context,
            options
        });
    }

    // Context chat with streaming
    async chatContextStream(message, context, options = {}) {
        return await this.makeStreamingRequest('chat/context', {
            message,
            context,
            options
        });
    }

    // AI Workspace - 5 specialized features
    // Workspace Chat - chat with multiple notes context
    async workspaceChat(message, notesContent, options = {}) {
        return await this.makeRequest('workspace/chat', {
            message,
            notesContent,
            options
        });
    }

    async workspaceChatStream(message, notesContent, options = {}) {
        return await this.makeStreamingRequest('workspace/chat', {
            message,
            notesContent,
            options
        });
    }

    // Workspace Summary - summarize multiple notes
    async workspaceSummary(notesContent, options = {}) {
        return await this.makeRequest('workspace/summary', {
            notesContent,
            options
        });
    }

    async workspaceSummaryStream(notesContent, options = {}) {
        return await this.makeStreamingRequest('workspace/summary', {
            notesContent,
            options
        });
    }

    // Workspace Tasks - extract tasks from multiple notes
    async workspaceTasks(notesContent, options = {}) {
        return await this.makeRequest('workspace/tasks', {
            notesContent,
            options
        });
    }

    async workspaceTasksStream(notesContent, options = {}) {
        return await this.makeStreamingRequest('workspace/tasks', {
            notesContent,
            options
        });
    }

    // Workspace Keywords - extract keywords from multiple notes
    async workspaceKeywords(notesContent, options = {}) {
        return await this.makeRequest('workspace/keywords', {
            notesContent,
            options
        });
    }

    async workspaceKeywordsStream(notesContent, options = {}) {
        return await this.makeStreamingRequest('workspace/keywords', {
            notesContent,
            options
        });
    }

    // Workspace Synthesize - deep analysis with custom task
    async workspaceSynthesize(notesContent, userTask, options = {}) {
        return await this.makeRequest('workspace/synthesize', {
            notesContent,
            userTask,
            options
        });
    }

    async workspaceSynthesizeStream(notesContent, userTask, options = {}) {
        return await this.makeStreamingRequest('workspace/synthesize', {
            notesContent,
            userTask,
            options
        });
    }

    // Meeting notes with structured output for meetings and lectures
    async meetingNotes(content, options = {}) {
        return await this.makeRequest('meeting-notes', {
            content,
            options
        });
    }

    // Extract action items and create to-do list
    async actionItems(content, options = {}) {
        return await this.makeRequest('action-items', {
            content,
            options
        });
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Get cache size
    getCacheSize() {
        return this.cache.size;
    }

    // Get daily usage statistics from server
    async getDailyUsageStats(forceRefresh = false) {
        try {
            const userEmail = await this.getUserEmail();
            if (!userEmail) {
                return null;
            }

            // Clear cache if force refresh is requested
            if (forceRefresh) {
                this.clearCache();
            }

            const backendUrl = this.getBackendUrl();

            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(`${backendUrl}/api/usage/check`, {
                method: 'GET',
                headers: {
                    'x-user-email': userEmail
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`Usage stats request failed with status: ${response.status}`);
                throw new Error(chrome.i18n.getMessage('ai_statsFailed') || 'Stats failed');
            }

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('Usage stats response is not JSON:', contentType);
                throw new Error(chrome.i18n.getMessage('errors_invalidResponseFormat') || 'Invalid response format');
            }

            const data = await response.json();
            return data.success ? data.usage : null;
        } catch (error) {
            console.error('Error fetching usage stats:', error);
            // Return default stats on error
            return {
                used: 0,
                remaining: 15,
                limit: 15,
                percentage: 0,
                canUse: true,
                isPremium: false
            };
        }
    }

    // Check if user has exceeded daily limit (4 uses for regular users)
    async checkDailyLimit() {
        try {
            // Check if AI is unlocked (premium users have unlimited access)
            const isUnlocked = await this.checkAIUnlockStatus();
            if (isUnlocked) {
                return { allowed: true, remaining: -1, limit: -1 };
            }

            // Check if user is logged in
            const isLoggedIn = await this.isUserLoggedIn();
            if (!isLoggedIn) {
                return { allowed: false, remaining: 0, limit: 4, reason: 'not_logged_in' };
            }

            // Get usage stats from local storage
            const userEmail = await this.getUserEmail();
            const today = new Date().toDateString();
            const storageKey = `ai_usage_${userEmail}_${today}`;

            const usageData = await dbManager.getSetting(storageKey) || { count: 0, date: today };

            // Reset if date changed
            if (usageData.date !== today) {
                usageData.count = 0;
                usageData.date = today;
            }

            const limit = 4;
            const remaining = Math.max(0, limit - usageData.count);
            const allowed = usageData.count < limit;

            return { allowed, remaining, limit, count: usageData.count };
        } catch (error) {
            console.error('Error checking daily limit:', error);
            return { allowed: false, remaining: 0, limit: 4, reason: 'error' };
        }
    }

    // Increment daily usage count
    async incrementDailyUsage() {
        try {
            // Don't increment for premium users
            const isUnlocked = await this.checkAIUnlockStatus();
            if (isUnlocked) {
                return true;
            }

            const userEmail = await this.getUserEmail();
            if (!userEmail) {
                return false;
            }

            const today = new Date().toDateString();
            const storageKey = `ai_usage_${userEmail}_${today}`;

            const usageData = await dbManager.getSetting(storageKey) || { count: 0, date: today };

            // Reset if date changed
            if (usageData.date !== today) {
                usageData.count = 0;
                usageData.date = today;
            }

            usageData.count += 1;
            await dbManager.saveSetting(storageKey, usageData);

            return true;
        } catch (error) {
            console.error('Error incrementing daily usage:', error);
            return false;
        }
    }

    // Clear AI service cache
    clearCache() {
        this.cache.clear();
    }

    // Check if approaching daily limit
    async isApproachingDailyLimit() {
        try {
            const stats = await this.getDailyUsageStats();
            if (!stats) return false;

            const percentage = (stats.used / stats.limit) * 100;
            return percentage >= 80;
        } catch (error) {
            console.error('Error checking approaching limit:', error);
            return false;
        }
    }

    // Check if AI is unlocked
    async checkAIUnlockStatus() {
        try {
            if (typeof dbManager !== 'undefined') {
                const aiUnlocked = await dbManager.getSetting('aiUnlocked');
                return aiUnlocked === true;
            }
            return false;
        } catch (error) {
            console.error('Error checking AI unlock status:', error);
            return false;
        }
    }

    // Make unlimited request (bypass daily limit)
    async makeUnlimitedRequest(action, params = {}) {
        const backendUrl = this.getBackendUrl();
        if (!backendUrl) {
            throw new Error(chrome.i18n.getMessage('ai_backendNotConfigured') || 'Backend URL not configured');
        }

        // Check if AI is unlocked first - this is critical for security
        const isUnlocked = await this.checkAIUnlockStatus();
        if (!isUnlocked) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        // Get user email - required for server-side usage tracking
        const userEmail = await this.getUserEmail();
        if (!userEmail) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        if (!this.checkRateLimit()) {
            throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
        }

        const cacheKey = this.getCacheKey(JSON.stringify({ action, params }), {});
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            this.rateLimit.requests++;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);

            const response = await fetch(`${backendUrl}/api/ai/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify(params),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || `Backend request failed: ${response.status} ${response.statusText}`;

                if (response.status === 429) {
                    // Check if it's daily limit or rate limit from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
                } else if (response.status === 401) {
                    throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed. Please sign in again.');
                } else if (response.status === 403) {
                    // Check if it's daily limit related from backend
                    if (errorMessage.includes('daily limit') || errorMessage.includes('Daily limit')) {
                        throw new Error(chrome.i18n.getMessage('ai_dailyLimitReached') || 'You have reached your daily limit. Upgrade to Premium for unlimited access!');
                    }
                    throw new Error(chrome.i18n.getMessage('ai_accessDenied') || 'Access forbidden. Please check your permissions.');
                } else if (response.status >= 500) {
                    throw new Error(chrome.i18n.getMessage('ai_serviceDown') || 'Service down');
                } else {
                    throw new Error(errorMessage);
                }
            }

            const data = await response.json();

            if (!data.success || !data.result) {
                throw new Error(chrome.i18n.getMessage('ai_invalidResponse') || 'Invalid response from backend service.');
            }

            // Cache the result (no daily limit increment for unlimited requests)
            this.cache.set(cacheKey, data.result);

            return data.result;
        } catch (error) {
            console.error('Unlimited request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error(chrome.i18n.getMessage('ai_timeout') || 'Timeout');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error(chrome.i18n.getMessage('ai_noConnection') || 'No connection');
            } else {
                throw error;
            }
        }
    }
}

// Create global instance only if window is available (not in service worker)
if (typeof window !== 'undefined') {
    window.aiService = new AIService();
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIService;
}


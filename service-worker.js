// service-worker.js

// Import required scripts
importScripts('libs/dexie.min.js');
importScripts('indexeddb-manager.js');
importScripts('server-config.js');

// Tracks currently open note windows to prevent duplicates. { noteId: windowId }
let openNoteWindows = {};
let syncTimeout;

// Global storage lock to prevent race conditions
let storageLock = false;
let storageQueue = [];

// Process storage operations sequentially to prevent race conditions
async function processStorageOperation(operation) {
    return new Promise((resolve, reject) => {
        storageQueue.push({ operation, resolve, reject });
        processStorageQueue();
    });
}

async function processStorageQueue() {
    if (storageLock || storageQueue.length === 0) return;

    storageLock = true;

    while (storageQueue.length > 0) {
        const { operation, resolve, reject } = storageQueue.shift();
        try {
            const result = await operation();
            resolve(result);
        } catch (error) {
            reject(error);
        }
    }

    storageLock = false;
}

// AI Service for Service Worker (no window object)
class ServiceWorkerAIService {
    constructor() {
        this.backendUrl = null; // Will be set dynamically
        this.cache = new Map();
        this.rateLimit = {
            requests: 0,
            resetTime: Date.now() + 60000, // 1 minute
            maxRequests: 60, // Increased back to 60
            backoffMultiplier: 1,
            lastBackoffTime: 0
        };
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

    async initialize() {
        try {
            this.getBackendUrl();
            return true;
        } catch (error) {
            console.error(chrome.i18n.getMessage('errors_failedToInitializeAIService') || 'Failed to initialize AI service:', error);
            return false;
        }
    }

    async setBackendUrl(url) {
        this.backendUrl = url;
        await dbManager.saveSetting('aiBackendUrl', url);
    }

    // Check if AI is unlocked
    async checkAIUnlockStatus() {
        try {
            const aiUnlocked = await dbManager.getSetting('aiUnlocked');
            return aiUnlocked === true;
        } catch (error) {
            console.error(chrome.i18n.getMessage('errors_errorCheckingAIUnlockStatus') || 'Error checking AI unlock status:', error);
            return false;
        }
    }

    // Get user email from OAuth (for service worker)
    async getUserEmail() {
        try {
            // Get email from OAuth2 token to avoid popup
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) {
                        // User not signed in - this is expected, not an error
                        resolve(null);
                    } else {
                        resolve(token);
                    }
                });
            });

            if (!token) {
                // No token available - user needs to sign in
                return null;
            }

            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.warn('Failed to fetch user info:', response.status);
                return null;
            }

            const userInfo = await response.json();
            return userInfo.email;
        } catch (error) {
            // Silently handle errors - user just needs to sign in
            console.warn('Could not get user email (user may need to sign in):', error.message);
            return null;
        }
    }

    checkRateLimit() {
        const now = Date.now();
        if (now > this.rateLimit.resetTime) {
            this.rateLimit.requests = 0;
            this.rateLimit.resetTime = now + 60000; // 1 minute
            this.rateLimit.backoffMultiplier = 1; // Reset backoff
        }

        // Check if we're in backoff period
        if (this.rateLimit.lastBackoffTime > 0) {
            const backoffDuration = 30000 * this.rateLimit.backoffMultiplier; // 30s, 60s, 120s...
            if (now - this.rateLimit.lastBackoffTime < backoffDuration) {
                return false;
            }
            this.rateLimit.lastBackoffTime = 0; // Reset backoff
        }

        return this.rateLimit.requests < this.rateLimit.maxRequests;
    }

    // Make unlimited request (bypass daily limit)
    async makeUnlimitedRequest(action, params = {}) {
        let backendUrl = this.getBackendUrl(); if (!backendUrl) {
            throw new Error(chrome.i18n.getMessage('ai_backendNotConfigured') || 'Backend URL not configured');
        }

        // Check if AI is unlocked first - this is critical for security
        const isUnlocked = await this.checkAIUnlockStatus();
        if (!isUnlocked) {
            throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
        }

        // Check backend health first
        try {
            const healthResponse = await fetch(`${backendUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            if (!healthResponse.ok) {
                throw new Error(chrome.i18n.getMessage('ai_backendNotResponding') || 'Backend server is not responding');
            }
        } catch (error) {
            console.error(chrome.i18n.getMessage('errors_backendHealthCheckFailed') || '[Service Worker] Backend health check failed:', error.message);
            throw new Error(chrome.i18n.getMessage('ai_backendNotAvailable') || 'Backend server is not available. Please check your connection and try again.');
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

            // Get user email for authentication
            const userEmail = await this.getUserEmail();
            if (!userEmail) {
                throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'User not authenticated. Please sign in again.');
            }

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
                    throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
                } else if (response.status === 401) {
                    throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed. Please sign in again.');
                } else if (response.status === 403) {
                    throw new Error(chrome.i18n.getMessage('ai_accessDenied') || 'Access forbidden. Please check your permissions.');
                } else if (response.status >= 500) {
                    console.error(chrome.i18n.getMessage('errors_backendServerError') || '[Service Worker] Backend server error:', response.status, errorMessage);
                    throw new Error(chrome.i18n.getMessage('ai_serviceUnavailable') || 'Backend server is temporarily unavailable. Please try again later.');
                } else {
                    throw new Error(chrome.i18n.getMessage('ai_unknownError') || errorMessage);
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
            console.error(chrome.i18n.getMessage('errors_unlimitedRequestFailed') || 'Unlimited request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error(chrome.i18n.getMessage('ai_timeout') || 'Timeout');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error(chrome.i18n.getMessage('ai_noConnection') || 'No connection');
            } else {
                throw error;
            }
        }
    }

    // Clear AI service cache
    clearCache() {
        this.cache.clear();
    }

    // Get daily usage statistics from server
    async getDailyUsageStats(forceRefresh = false) {
        try {
            const userEmail = await this.getUserEmail();
            if (!userEmail) {
                // User not signed in - return default stats
                return {
                    used: 0,
                    remaining: 15,
                    limit: 15,
                    percentage: 0,
                    canUse: true,
                    isPremium: false
                };
            }

            // Clear cache if force refresh is requested (but limit frequency)
            if (forceRefresh) {
                // Add debouncing to prevent excessive cache clearing
                const now = Date.now();
                if (!this.lastCacheClear || (now - this.lastCacheClear) > 5000) { // 5 second debounce
                    this.clearCache();
                    this.lastCacheClear = now;
                }
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
            console.error(chrome.i18n.getMessage('errors_errorFetchingUsageStats') || 'Error fetching usage stats:', error);
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

    async makeRequest(action, params = {}) {
        const backendUrl = this.getBackendUrl(); if (!backendUrl) {
            throw new Error(chrome.i18n.getMessage('ai_backendNotConfigured') || 'Backend URL not configured');
        }

        // Check backend health first
        try {
            const healthResponse = await fetch(`${backendUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });

            if (!healthResponse.ok) {
                throw new Error(chrome.i18n.getMessage('ai_backendNotResponding') || 'Backend server is not responding');
            }
        } catch (error) {
            console.error(chrome.i18n.getMessage('errors_backendHealthCheckFailed') || '[Service Worker] Backend health check failed:', error.message);
            throw new Error(chrome.i18n.getMessage('ai_backendNotAvailable') || 'Backend server is not available. Please check your connection and try again.');
        }

        // Check if user is logged in and AI is unlocked
        const userEmail = await this.getUserEmail();
        const isUnlocked = await this.checkAIUnlockStatus();

        if (userEmail && isUnlocked) {
            return await this.makeUnlimitedRequest(action, params);
        } else if (userEmail) {
            // Continue with regular request flow below
        } else {
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

            // Get user email for authentication
            const userEmail = await this.getUserEmail();
            if (!userEmail) {
                throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'User not authenticated. Please sign in again.');
            }

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
                    throw new Error(chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit exceeded. Please try again later.');
                } else if (response.status === 401) {
                    throw new Error(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed. Please sign in again.');
                } else if (response.status === 403) {
                    throw new Error(chrome.i18n.getMessage('ai_accessDenied') || 'Access forbidden. Please check your permissions.');
                } else if (response.status >= 500) {
                    console.error(chrome.i18n.getMessage('errors_backendServerError') || '[Service Worker] Backend server error:', response.status, errorMessage);
                    throw new Error(chrome.i18n.getMessage('ai_serviceUnavailable') || 'Backend server is temporarily unavailable. Please try again later.');
                } else {
                    throw new Error(chrome.i18n.getMessage('ai_unknownError') || errorMessage);
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
            console.error(chrome.i18n.getMessage('errors_backendRequestFailed') || 'Backend request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error(chrome.i18n.getMessage('ai_timeout') || 'Timeout');
            } else if (error.message.includes('Failed to fetch')) {
                throw new Error(chrome.i18n.getMessage('ai_noConnection') || 'No connection');
            } else {
                throw error;
            }
        }
    }

    getCacheKey(prompt, options) {
        return `${prompt}_${JSON.stringify(options)}`;
    }

    getShortErrorMessage(errorMessage) {
        const errorMappings = {
            'Rate limit exceeded': chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Too many',
            'Request timeout': chrome.i18n.getMessage('ai_timeout') || 'Timeout',
            'Network error': chrome.i18n.getMessage('ai_noConnection') || 'No connection',
            'Invalid API key': chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid key',
            'API access forbidden': chrome.i18n.getMessage('ai_accessDenied') || 'Access denied',
            'AI service temporarily unavailable': chrome.i18n.getMessage('ai_serviceUnavailable') || 'AI down',
            'No response generated': chrome.i18n.getMessage('ai_noResponse') || 'No response',
            'Empty response': chrome.i18n.getMessage('ai_emptyResponse') || 'Empty',
            'AI API key not configured': chrome.i18n.getMessage('ai_apiKeyNotConfigured') || 'No API key',
            'API key not valid': chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid key',
            'The API key provided is not valid': chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid key',
            'API key is invalid': chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid key',
            'Invalid credentials': chrome.i18n.getMessage('ai_invalidCredentials') || 'Invalid login',
            'Permission denied': chrome.i18n.getMessage('ai_accessDenied') || 'Access denied',
            'Quota exceeded': chrome.i18n.getMessage('ai_quotaExceeded') || 'Quota full',
            'Daily limit exceeded': chrome.i18n.getMessage('ai_dailyLimitReached') || 'Daily limit',
            'User rate limit exceeded': chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit',
            'Project rate limit exceeded': chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Rate limit',
            'Model not found': chrome.i18n.getMessage('ai_modelNotFound') || 'No model',
            'Invalid model': chrome.i18n.getMessage('ai_invalidModel') || 'Bad model',
            'Content filter': chrome.i18n.getMessage('ai_contentFiltered') || 'Filtered',
            'Safety filter': chrome.i18n.getMessage('ai_safetyFiltered') || 'Blocked'
        };

        // Check for exact matches first
        for (const [key, value] of Object.entries(errorMappings)) {
            if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
                return value;
            }
        }

        // Check for common error patterns
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            return chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid API key - Please check your API key';
        }
        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
            return chrome.i18n.getMessage('ai_accessDenied') || 'Access denied - Please check API key permissions';
        }
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            return chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Too many requests - Please try again later';
        }
        if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
            return chrome.i18n.getMessage('ai_serverError') || 'Server error - Please try again later';
        }

        // Return detailed error
        return `${chrome.i18n.getMessage('ai_errorPrefix') || 'AI Error'}: ${errorMessage}`;
    }

    async summarize(content, options = {}) {
        return await this.makeRequest('summarize', {
            content,
            options
        });
    }

    async expand(content, options = {}) {
        return await this.makeRequest('expand', {
            content,
            options
        });
    }

    async improve(content, options = {}) {
        return await this.makeRequest('improve', {
            content,
            options
        });
    }


    async getSuggestions(content, options = {}) {
        return await this.makeRequest('suggestions', {
            content,
            options
        });
    }


    // Chat methods - updated to use new endpoints
    async chat(message, context = '', options = {}) {
        // Detect if this is context chat or free chat
        const hasContext = context && context.trim().length > 0;
        if (hasContext) {
            return await this.makeRequest('chat/context', {
                message,
                context,
                options
            });
        } else {
            return await this.makeRequest('chat/free', {
                message,
                options
            });
        }
    }

    async outline(content, options = {}) {
        return await this.makeRequest('outline', {
            content,
            options
        });
    }

    // Tone transformation - updated to use specialized endpoints
    async tone(content, tone, options = {}) {
        // Map to specialized tone endpoints
        return await this.makeRequest(`tone/${tone}`, {
            content,
            options
        });
    }

    async meetingNotes(content, options = {}) {
        return await this.makeRequest('meeting-notes', {
            content,
            options
        });
    }

    async actionItems(content, options = {}) {
        return await this.makeRequest('action-items', {
            content,
            options
        });
    }
}

// Create AI service instance for service worker
const aiService = new ServiceWorkerAIService();

// AI Service initialization state
let aiServiceInitialized = false;
let aiServiceInitializing = false;

// Lazy initialize AI service when needed
async function ensureAIServiceReady() {
    if (aiServiceInitialized) {
        return true;
    }

    if (aiServiceInitializing) {
        // Wait for ongoing initialization
        return new Promise((resolve) => {
            const checkReady = () => {
                if (aiServiceInitialized) {
                    resolve(true);
                } else if (!aiServiceInitializing) {
                    resolve(false);
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }

    aiServiceInitializing = true;
    try {
        await aiService.initialize();
        aiServiceInitialized = true;
        return true;
    } catch (error) {
        console.error(chrome.i18n.getMessage('errors_failedToInitializeAIService') || 'AI Service initialization failed:', error);
        aiServiceInitializing = false;
        return false;
    }
}

// --- Extension Lifecycle Listeners ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "addTextToNote",
            title: chrome.i18n.getMessage('contextMenu_addToNote') || "Add to Quick Notes",
            contexts: ["selection"]
        });
    });
});


// --- Action and Command Listeners ---
chrome.action.onClicked.addListener(async () => {
    // Check if this is the first time opening the app
    const hasOpenedBefore = await dbManager.getSetting('hasOpenedBefore');

    if (!hasOpenedBefore) {
        // First time: open Main App and set flag
        await dbManager.saveSetting('hasOpenedBefore', true);
        openMainWindow();
    } else {
        // Subsequent times: create new note directly
        createNewNote();
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "addTextToNote" && info.selectionText) {
        // Try to inject and execute script to get formatted HTML
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) {
                    return '';
                }
                const range = selection.getRangeAt(0);
                const container = document.createElement('div');
                container.appendChild(range.cloneContents());
                return container.innerHTML || selection.toString();
            }
        }).then(results => {
            if (results && results[0] && results[0].result) {
                const html = results[0].result;
                // Wrap in paragraph if not already wrapped
                const content = html.startsWith('<') ? html : `<p>${html}</p>`;
                createNewNote({ content: content });
            } else {
                // Fallback to plain text
                createNewNote({ content: `<p>${info.selectionText}</p>` });
            }
        }).catch(error => {
            // If script injection fails, use plain text
            console.log('Script injection failed, using plain text:', error);
            createNewNote({ content: `<p>${info.selectionText}</p>` });
        });
    }
});

// --- External Message Listener (for web pages) ---
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('External message received:', request);
    
    const handleExternalMessage = async () => {
        try {
            switch (request.action) {
                case "ping":
                    sendResponse({ success: true, installed: true });
                    break;
                case "openSharedNote":
                    try {
                        const shareId = request.shareId;
                        if (!shareId) {
                            sendResponse({ success: false, error: 'Share ID is required' });
                            return;
                        }

                        // Fetch shared note data from backend
                        const backendUrl = serverSelector.getServerUrl();
                        const response = await fetch(`${backendUrl}/api/shared-notes/${shareId}`);
                        
                        if (!response.ok) {
                            sendResponse({ success: false, error: 'Shared note not found' });
                            return;
                        }

                        const data = await response.json();
                        if (!data.success || !data.note) {
                            sendResponse({ success: false, error: 'Invalid shared note data' });
                            return;
                        }

                        // Create a new note with the shared content
                        const newNote = await createNewNote({
                            content: data.note.contentHTML,
                            color: data.note.color || '#8b9dc3',
                            size: data.note.size || { width: 584, height: 792 }, // Use shared note's window size
                            skipWindow: false
                        });

                        // Open the note window
                        await openNoteWindow(newNote.id);

                        sendResponse({ success: true, noteId: newNote.id });
                    } catch (e) {
                        console.error('Open shared note failed:', e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('External message handler error:', error);
            sendResponse({ success: false, error: error.message });
        }
    };

    handleExternalMessage();
    return true; // Required for async response
});

// --- Message Listener ---
// Message throttling to prevent spam
const messageThrottle = new Map();
const THROTTLE_DELAY = 100; // 100ms throttle

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Log incoming message for debugging (only in development)
    // if (request.action) {
    //     console.log('[Service Worker] Received message:', request.action, 'from:', sender.tab ? 'tab' : 'extension');
    // }
    
    // Throttle rapid duplicate messages
    const messageKey = `${request.action}_${request.noteId || ''}_${request.collectionId || ''}`;
    const now = Date.now();
    const lastCall = messageThrottle.get(messageKey);
    
    if (lastCall && (now - lastCall) < THROTTLE_DELAY) {
        // Too soon, ignore this message
        console.warn('[Service Worker] Throttled duplicate message:', request.action);
        sendResponse({ success: true, throttled: true });
        return true;
    }
    
    messageThrottle.set(messageKey, now);
    
    // Clean up old entries periodically
    if (messageThrottle.size > 100) {
        const cutoff = now - 1000; // Remove entries older than 1 second
        for (const [key, time] of messageThrottle.entries()) {
            if (time < cutoff) {
                messageThrottle.delete(key);
            }
        }
    }
    
    // Handle async responses properly
    const handleAsyncResponse = async () => {
        try {
            // Check if action exists
            if (!request.action) {
                console.warn('[Service Worker] Message without action:', request);
                sendResponse({ success: false, error: 'No action specified' });
                return;
            }
            
            switch (request.action) {
                case "createNewNote":
                    const newNote = await createNewNote({
                        collectionId: request.collectionId,
                        content: request.content,
                        isMarkdown: request.isMarkdown, // Pass markdown flag
                        skipWindow: request.skipWindow // Don't open window if true
                    });
                    sendResponse({ success: true, noteId: newNote.id });
                    break;
                case "openNoteWindow":
                    await openNoteWindow(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "openMainWindow":
                    await openMainWindow();
                    sendResponse({ success: true });
                    break;
                case "updateNoteData":
                    await updateNoteData(request.noteId, request.data);
                    sendResponse({ success: true });
                    break;
                case "broadcastBackgroundUpdate":
                    await broadcastBackgroundUpdate(request.backgroundId);
                    sendResponse({ success: true });
                    break;
                case "deleteNote":
                    await deleteNote(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "restoreNote":
                    await restoreNote(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "deleteNotePermanently":
                    await deleteNotePermanently(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "restoreAllTrash":
                    await restoreAllTrash();
                    sendResponse({ success: true });
                    break;
                case "clearAllTrash":
                    await clearAllTrash();
                    sendResponse({ success: true });
                    break;
                case "deleteDraftNote":
                    await deleteDraftNote(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "createCollection":
                    await createCollection(request.collectionData);
                    sendResponse({ success: true });
                    break;
                case "updateCollection":
                    await updateCollection(request.collectionId, request.data);
                    sendResponse({ success: true });
                    break;
                case "deleteCollection":
                    await deleteCollection(request.collectionId);
                    sendResponse({ success: true });
                    break;
                case "restoreCollection":
                    await restoreCollection(request.collectionId);
                    sendResponse({ success: true });
                    break;
                case "deleteCollectionPermanently":
                    await deleteCollectionPermanently(request.collectionId);
                    sendResponse({ success: true });
                    break;
                case "moveNoteToCollection":
                    await moveNoteToCollection(request.noteId, request.collectionId);
                    sendResponse({ success: true });
                    break;
                case "removeNoteFromCollection":
                    await removeNoteFromCollection(request.noteId);
                    sendResponse({ success: true });
                    break;
                case "getCollections":
                    const collections = await getCollections();
                    sendResponse({ success: true, collections });
                    break;
                case "getCollectionNotes":
                    const notes = await getCollectionNotes(request.collectionId);
                    sendResponse({ success: true, notes });
                    break;
                case "syncNow":
                    try {
                        await syncWithDrive(true);
                        sendResponse({ success: true });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_syncProcessFailed') || "Sync process failed with error:", e);
                        sendResponse({ success: false });
                    }
                    break;
                case "aiSummarize":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.summarize(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiSummarizeFailed') || "AI summarize failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiExpand":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.expand(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiExpandFailed') || "AI expand failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiImprove":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.improve(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiImproveFailed') || "AI improve failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiSuggestions":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.getSuggestions(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiSuggestionsFailed') || "AI suggestions failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiOutline":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.outline(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiOutlineFailed') || "AI outline failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;

                case "tone":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.tone(request.content, request.tone, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiToneFailed') || "AI tone failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiMeetingNotes":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.meetingNotes(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiMeetingNotesFailed') || "AI meeting notes failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiActionItems":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const result = await aiService.actionItems(request.content, request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error('AI action items failed:', e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiChat":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        // AI chat now works independently without note context
                        const result = await aiService.chat(request.message, '', request.options);
                        sendResponse({ success: true, result });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiChatFailed') || "AI chat failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiSetBackendUrl":
                    try {
                        await aiService.setBackendUrl(request.backendUrl);
                        sendResponse({ success: true });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiSetBackendUrlFailed') || "AI set backend URL failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "aiInitialize":
                    try {
                        const isReady = await ensureAIServiceReady();
                        sendResponse({ success: isReady, initialized: isReady });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_aiInitializeFailed') || "AI initialize failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "getDailyUsageStats":
                    try {
                        const isReady = await ensureAIServiceReady();
                        if (!isReady) {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI Service not available' });
                            return;
                        }
                        const stats = await aiService.getDailyUsageStats(request.forceRefresh);
                        // Always return success with stats (even if default values)
                        // The stats object itself indicates the actual state
                        sendResponse({
                            success: true, stats: stats || {
                                used: 0,
                                remaining: 15,
                                limit: 15,
                                percentage: 0,
                                canUse: true,
                                isPremium: false
                            }
                        });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_getDailyUsageStatsFailed') || "Get daily usage stats failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "clearAICache":
                    try {
                        if (aiService) {
                            aiService.clearCache();
                        }
                        sendResponse({ success: true });
                    } catch (e) {
                        console.error(chrome.i18n.getMessage('errors_clearAICacheFailed') || "Clear AI cache failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "quota_exceeded":
                    try {
                        const cleanedCount = await cleanupStorage();
                        sendResponse({ success: true, cleanedCount });
                    } catch (e) {
                        console.error('Cleanup failed:', e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "openAIChatWithContext":
                    try {
                        const aiSelectedText = await dbManager.getSetting('aiSelectedText');

                        if (aiSelectedText) {
                            try {
                                await chrome.windows.create({
                                    url: chrome.runtime.getURL('ai-chat.html'),
                                    type: 'popup',
                                    width: 480,
                                    height: 720,
                                    focused: true
                                });
                                sendResponse({ success: true, hasContext: true });
                            } catch (windowError) {
                                console.error('Failed to create AI chat window:', windowError);
                                // Fallback without specific bounds
                                try {
                                    await chrome.windows.create({
                                        url: chrome.runtime.getURL('ai-chat.html'),
                                        type: 'popup',
                                        focused: true
                                    });
                                    sendResponse({ success: true, hasContext: true });
                                } catch (fallbackError) {
                                    console.error('AI chat fallback window creation failed:', fallbackError);
                                    sendResponse({ success: false, error: chrome.i18n.getMessage('ai_chatWindowFailed') || 'Failed to create AI chat window' });
                                }
                            }
                        } else {
                            sendResponse({ success: false, error: chrome.i18n.getMessage('ai_noSelectedText') || 'No selected text' });
                        }
                    } catch (e) {
                        console.error("Open AI chat with context failed:", e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                case "ping":
                    // Simple ping to check if extension is installed
                    sendResponse({ success: true, installed: true });
                    break;
                case "openSharedNote":
                    try {
                        const shareId = request.shareId;
                        if (!shareId) {
                            sendResponse({ success: false, error: 'Share ID is required' });
                            return;
                        }

                        // Fetch shared note data from backend
                        const backendUrl = serverSelector.getServerUrl();
                        const response = await fetch(`${backendUrl}/api/shared-notes/${shareId}`);
                        
                        if (!response.ok) {
                            sendResponse({ success: false, error: 'Shared note not found' });
                            return;
                        }

                        const data = await response.json();
                        if (!data.success || !data.note) {
                            sendResponse({ success: false, error: 'Invalid shared note data' });
                            return;
                        }

                        // Create a new note with the shared content
                        const newNote = await createNewNote({
                            content: data.note.contentHTML,
                            color: data.note.color || '#8b9dc3',
                            skipWindow: false // Open the note window
                        });

                        // Open the note window
                        await openNoteWindow(newNote.id);

                        sendResponse({ success: true, noteId: newNote.id });
                    } catch (e) {
                        console.error('Open shared note failed:', e);
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                default:
                    // Unknown action - log but don't error
                    console.warn('[Service Worker] Unknown action:', request.action);
                    sendResponse({ success: false, error: 'Unknown action: ' + request.action });
                    break;
            }
        } catch (error) {
            console.error('Message handler error:', error);
            // Always send response even on error
            try {
                sendResponse({ success: false, error: error.message || 'Unknown error' });
            } catch (sendError) {
                console.error('Failed to send error response:', sendError);
            }
        }
    };

    // Execute async handler
    handleAsyncResponse().catch(err => {
        console.error('[Service Worker] Async handler failed:', err);
        try {
            sendResponse({ success: false, error: err.message || 'Handler failed' });
        } catch (sendError) {
            console.error('Failed to send error response:', sendError);
        }
    });
    return true; // Required for async response
});

// --- Core Functions ---
async function openMainWindow() {
    const windows = await chrome.windows.getAll({ populate: true });
    const mainAppUrl = `main_app/main_app.html`;

    const mainWindow = windows.find(w => w.tabs?.some(t => t.url?.includes(mainAppUrl)));

    if (mainWindow) {
        await chrome.windows.update(mainWindow.id, { focused: true });
    } else {
        try {
            await chrome.windows.create({
                url: mainAppUrl,
                type: 'popup',
                width: 540,
                height: 870,
                focused: true
            });
        } catch (error) {
            console.error('Failed to create main window:', error);
            // Fallback without specific bounds
            try {
                await chrome.windows.create({
                    url: mainAppUrl,
                    type: 'popup',
                    focused: true
                });
            } catch (fallbackError) {
                console.error('Fallback main window creation failed:', fallbackError);
            }
        }
    }

    // Generate titles for notes that don't have them yet (in background)
    generateMissingTitles();
}

async function createNewNote(noteData = {}) {
    const noteId = noteData.id || `note_${Date.now()}`;

    const defaultBackground = await dbManager.getSetting('defaultBackground') || 'none';
    const defaultNoteSize = await dbManager.getSetting('defaultNoteSize') || { width: 584, height: 792 };

    const defaultPosition = {
        x: Math.floor(Math.random() * (1470 - 450)), // Random x position (screen width - note width)
        y: Math.floor(Math.random() * (480))         // Random y position (screen height - note height)
    };

    // Check if note has meaningful content
    const hasContent = noteData.content &&
        noteData.content.trim() !== '' &&
        noteData.content !== '<div></div>' &&
        noteData.content !== '<div><br></div>' &&
        noteData.content !== '<div><br/></div>' &&
        noteData.content !== '<br>' &&
        noteData.content !== '<br/>';

    const newNote = {
        id: noteId,
        content: noteData.content || '<div></div>',
        color: noteData.color || '#fbbc04', // Use color from noteData if provided
        background: defaultBackground, // Apply default background to new notes
        position: noteData.position || defaultPosition,
        size: noteData.size || defaultNoteSize, // Use default note size from settings
        lastModified: Date.now(),
        category: noteData.category || 'general',
        isDraft: !hasContent, // Mark as draft if no meaningful content
        pinned: false, // Add pinned property
        isMarkdown: noteData.isMarkdown || false // Flag to indicate markdown content
    };

    console.log('[Service Worker] Creating note with content:', newNote.content);
    console.log('[Service Worker] Has content:', hasContent);
    console.log('[Service Worker] Is markdown:', newNote.isMarkdown);

    // Only add collectionId if it's passed in noteData
    if (noteData.collectionId) {
        newNote.collectionId = noteData.collectionId;
    }

    // Save note
    await dbManager.saveNote(newNote);

    // Update collection noteCount if note belongs to collection
    if (newNote.collectionId) {
        const collections = await dbManager.getAllCollections();
        if (collections[newNote.collectionId]) {
            const notes = await dbManager.getAllNotes();
            const noteCount = Object.values(notes).filter(n => n.collectionId === newNote.collectionId).length;
            collections[newNote.collectionId].noteCount = noteCount;
            await dbManager.saveCollection(collections[newNote.collectionId]);
        }
    }

    // Trigger sync
    triggerSync();

    // Only open window if not skipped
    if (!noteData.skipWindow) {
        await openNoteWindow(noteId, newNote);
    }

    return newNote;
}

async function closeNoteInAllWindows(noteId) {
    try {
        // Get all windows
        const windows = await chrome.windows.getAll({ populate: true });
        
        // Send message to all note windows to close tabs with this noteId
        for (const win of windows) {
            const noteTab = win.tabs.find(tab => 
                tab.url && tab.url.includes('note/note.html')
            );
            
            if (noteTab) {
                try {
                    await chrome.tabs.sendMessage(noteTab.id, {
                        action: 'closeNoteTab',
                        noteId: noteId
                    });
                } catch (error) {
                    // Tab might not be ready or already closed
                }
            }
        }
    } catch (error) {
        console.error('[ServiceWorker] Error closing note in all windows:', error);
    }
}

async function findNoteInOpenWindows(noteId) {
    try {
        // Get all windows
        const windows = await chrome.windows.getAll({ populate: true });
        
        // Check each note window for tabs with this noteId
        for (const win of windows) {
            const noteTab = win.tabs.find(tab => 
                tab.url && tab.url.includes('note/note.html')
            );
            
            if (noteTab) {
                try {
                    const response = await chrome.tabs.sendMessage(noteTab.id, {
                        action: 'hasNoteTab',
                        noteId: noteId
                    });
                    
                    if (response && response.hasTab) {
                        return { windowId: win.id, tabId: noteTab.id };
                    }
                } catch (error) {
                    // Tab might not be ready
                }
            }
        }
    } catch (error) {
        console.error('[ServiceWorker] Error finding note in windows:', error);
    }
    return null;
}

async function openNoteWindow(noteId, noteInfo) {
    // First, check if this note is already open in a tab somewhere
    const existingTab = await findNoteInOpenWindows(noteId);
    if (existingTab) {
        try {
            // Focus the window first
            await chrome.windows.update(existingTab.windowId, { focused: true });
            
            // Wait a bit for window to focus
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Tell the window to switch to this tab
            try {
                await chrome.tabs.sendMessage(existingTab.tabId, {
                    action: 'switchToNoteTab',
                    noteId: noteId
                });
            } catch (msgError) {
                console.log('[ServiceWorker] Could not send switch message, tab might be loading');
            }
            return;
        } catch (error) {
            console.error('[ServiceWorker] Error focusing existing tab:', error);
        }
    }

    // Check if there's a dedicated window for this note
    if (openNoteWindows[noteId]) {
        try {
            await chrome.windows.update(openNoteWindows[noteId], { focused: true });
            return;
        } catch (error) {
            // Window doesn't exist anymore, so we'll create a new one.
            delete openNoteWindows[noteId];
        }
    }

    const createWindow = async (note) => {
        // Ensure note has all required properties
        const safeNote = {
            ...note,
            size: note.size || { width: 584, height: 792 },
            position: note.position
        };

        try {
            const windowOptions = {
                url: `note/note.html?id=${note.id}`,
                type: 'popup',
                width: safeNote.size.width,
                height: safeNote.size.height,
                focused: true
            };

            // Only set position if it exists, let Chrome handle default positioning otherwise
            if (safeNote.position && safeNote.position.x !== undefined && safeNote.position.y !== undefined) {
                windowOptions.left = safeNote.position.x;
                windowOptions.top = safeNote.position.y;
            }

            const newWindow = await chrome.windows.create(windowOptions);
            if (newWindow && newWindow.id) {
                openNoteWindows[note.id] = newWindow.id;
            }
        } catch (error) {
            console.error('Failed to create note window:', error);
            // Fallback: create window without specific position
            try {
                const fallbackWindow = await chrome.windows.create({
                    url: `note/note.html?id=${note.id}`,
                    type: 'popup',
                    width: 584,
                    height: 792,
                    focused: true
                });
                if (fallbackWindow && fallbackWindow.id) {
                    openNoteWindows[note.id] = fallbackWindow.id;
                }
            } catch (fallbackError) {
                console.error('Fallback window creation also failed:', fallbackError);
            }
        }
    };

    if (noteInfo) {
        await createWindow(noteInfo);
    } else {
        const note = await dbManager.getNote(noteId);
        if (note) {
            await createWindow(note);
        }
    }
}

// --- Data Modification Functions ---
async function updateNoteData(noteId, data) {
    return processStorageOperation(async () => {
        const note = await dbManager.getNote(noteId);
        if (note) {
            const updatedNote = { ...note, ...data, lastModified: Date.now() };
            await dbManager.saveNote(updatedNote);
            // Trigger sync
            triggerSync();
        }
    });
}

// --- Broadcast Functions ---
async function broadcastBackgroundUpdate(backgroundId) {
    try {
        const windows = await chrome.windows.getAll();
        const noteWindows = windows.filter(window =>
            window.url &&
            window.url.includes('note.html')
        );

        for (const window of noteWindows) {
            try {
                const tabs = await chrome.tabs.query({ windowId: window.id });
                for (const tab of tabs) {
                    if (tab.url && tab.url.includes('note.html')) {
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'backgroundUpdated',
                            backgroundId: backgroundId
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to send message to window:', error);
            }
        }

        return true;
    } catch (error) {
        console.error('Failed to broadcast background update:', error);
        return false;
    }
}

async function deleteNote(noteId) {
    return processStorageOperation(async () => {
        const note = await dbManager.getNote(noteId);
        if (note) {
            // Move to trash
            await dbManager.saveTrashItem(note);

            // Delete from notes
            await dbManager.deleteNote(noteId);

            // Update collection note count if note was in a collection
            if (note.collectionId) {
                const collections = await dbManager.getAllCollections();
                if (collections[note.collectionId]) {
                    const notes = await dbManager.getAllNotes();
                    const noteCount = Object.values(notes).filter(n => n.collectionId === note.collectionId).length;
                    collections[note.collectionId].noteCount = noteCount;
                    await dbManager.saveCollection(collections[note.collectionId]);
                }
            }

            // Record the delete time to prevent auto-restore from Drive
            await dbManager.saveSetting('lastDeleteTime', Date.now());

            // Trigger sync
            triggerSync();

            // Close all tabs with this noteId in all windows
            await closeNoteInAllWindows(noteId);

            // Close window if open (for single-note windows)
            if (openNoteWindows[noteId]) {
                try {
                    await chrome.windows.remove(openNoteWindows[noteId]);
                } catch (error) {
                    // Window might already be closed
                }
                delete openNoteWindows[noteId];
            }
        }
    });
}

async function restoreNote(noteId) {
    return processStorageOperation(async () => {
        const note = await dbManager.getTrashItem(noteId);
        if (note) {
            // Restore to notes
            await dbManager.saveNote(note);

            // Delete from trash
            await dbManager.deleteTrashItem(noteId);

            // Update collection note count if note was in a collection
            if (note.collectionId) {
                const collections = await dbManager.getAllCollections();
                if (collections[note.collectionId]) {
                    const notes = await dbManager.getAllNotes();
                    const noteCount = Object.values(notes).filter(n => n.collectionId === note.collectionId).length;
                    collections[note.collectionId].noteCount = noteCount;
                    await dbManager.saveCollection(collections[note.collectionId]);
                }
            }

            // Trigger sync
            triggerSync();
        }
    });
}

async function deleteNotePermanently(noteId) {
    return processStorageOperation(async () => {
        const item = await dbManager.getTrashItem(noteId);
        if (item) {
            await dbManager.deleteTrashItem(noteId);
            // Record the delete time to prevent auto-restore from Drive
            await dbManager.saveSetting('lastDeleteTime', Date.now());
            // Trigger sync
            triggerSync();
        }
    });
}

async function restoreAllTrash() {
    return processStorageOperation(async () => {
        const trash = await dbManager.getAllTrash();

        // Restore all items from trash
        for (const itemId in trash) {
            const item = trash[itemId];
            delete item.deletedAt;

            if (item.content !== undefined) {
                // It's a note
                await dbManager.saveNote(item);
            } else if (item.name !== undefined) {
                // It's a collection
                await dbManager.saveCollection(item);
            }
        }

        // Clear trash
        await dbManager.clearAllTrash();

        // Trigger sync
        triggerSync();
    });
}

async function clearAllTrash() {
    return processStorageOperation(async () => {
        await dbManager.clearAllTrash();
        // Record the delete time to prevent auto-restore from Drive
        await dbManager.saveSetting('lastDeleteTime', Date.now());
        // Trigger sync
        triggerSync();
    });
}

async function deleteDraftNote(noteId) {
    return processStorageOperation(async () => {
        const note = await dbManager.getNote(noteId);
        if (note && note.isDraft) {
            await dbManager.deleteNote(noteId);
            // Record the delete time to prevent auto-restore from Drive
            await dbManager.saveSetting('lastDeleteTime', Date.now());
            // Trigger sync
            triggerSync();
        }
    });
}

// --- Collection Management Functions ---
async function createCollection(collectionData) {
    const collectionId = `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newCollection = {
        id: collectionId,
        name: collectionData.name || 'New Collection',
        color: collectionData.color || '#ff6b6b',
        theme: collectionData.theme || 'work',
        createdAt: Date.now(),
        lastModified: Date.now(),
        noteCount: 0
    };

    await dbManager.saveCollection(newCollection);
    triggerSync();
    return newCollection;
}

async function updateCollection(collectionId, data) {
    return processStorageOperation(async () => {
        const collection = await dbManager.getCollection(collectionId);
        if (collection) {
            const updatedCollection = {
                ...collection,
                ...data,
                lastModified: Date.now()
            };
            await dbManager.saveCollection(updatedCollection);
            triggerSync();
        }
    });
}

async function deleteCollection(collectionId) {
    return processStorageOperation(async () => {
        const collection = await dbManager.getCollection(collectionId);
        if (!collection) return;

        const notes = await dbManager.getAllNotes();
        const deletedAt = Date.now();

        // Move all notes in this collection to trash
        for (const noteId in notes) {
            if (notes[noteId].collectionId === collectionId) {
                const note = notes[noteId];
                note.deletedAt = deletedAt;
                await dbManager.saveTrashItem(note);
                await dbManager.deleteNote(noteId);
            }
        }

        // Move the collection to trash
        collection.deletedAt = deletedAt;
        await dbManager.saveTrashItem(collection);
        await dbManager.deleteCollection(collectionId);

        // Record the delete time to prevent auto-restore from Drive
        await dbManager.saveSetting('lastDeleteTime', deletedAt);

        // Trigger sync
        triggerSync();
    });
}

async function moveNoteToCollection(noteId, collectionId) {
    return processStorageOperation(async () => {
        const note = await dbManager.getNote(noteId);
        if (note) {
            const oldCollectionId = note.collectionId;
            note.collectionId = collectionId;
            note.lastModified = Date.now();
            await dbManager.saveNote(note);

            // Update collection note count for both old and new collections
            if (oldCollectionId) {
                await updateCollectionNoteCount(oldCollectionId);
            }
            await updateCollectionNoteCount(collectionId);

            triggerSync();
        }
    });
}

async function removeNoteFromCollection(noteId) {
    return processStorageOperation(async () => {
        const note = await dbManager.getNote(noteId);
        if (note && note.collectionId) {
            const oldCollectionId = note.collectionId;
            delete note.collectionId;
            note.lastModified = Date.now();
            await dbManager.saveNote(note);

            // Update collection note count
            await updateCollectionNoteCount(oldCollectionId);

            triggerSync();
        }
    });
}

async function updateCollectionNoteCount(collectionId) {
    const collection = await dbManager.getCollection(collectionId);
    if (collection) {
        const notes = await dbManager.getAllNotes();
        const noteCount = Object.values(notes).filter(note => note.collectionId === collectionId).length;
        collection.noteCount = noteCount;
        // Don't update lastModified when only changing noteCount
        // to prevent collection from being pushed to top of list
        await dbManager.saveCollection(collection);
    }
}

async function getCollections() {
    const collections = await dbManager.getAllCollections();
    return Object.values(collections).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function getCollectionNotes(collectionId) {
    const notes = await dbManager.getAllNotes();
    return Object.values(notes)
        .filter(note => note.collectionId === collectionId)
        .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

async function restoreCollection(collectionId) {
    return processStorageOperation(async () => {
        const collection = await dbManager.getTrashItem(collectionId);
        if (!collection) return;

        delete collection.deletedAt;
        await dbManager.saveCollection(collection);
        await dbManager.deleteTrashItem(collectionId);

        // Restore all notes that belong to this collection
        const trash = await dbManager.getAllTrash();
        for (const noteId in trash) {
            if (trash[noteId].collectionId === collectionId) {
                const note = trash[noteId];
                delete note.deletedAt;
                await dbManager.saveNote(note);
                await dbManager.deleteTrashItem(noteId);
            }
        }

        // Update collection note count
        await updateCollectionNoteCount(collectionId);

        // Trigger sync
        triggerSync();
    });
}

async function deleteCollectionPermanently(collectionId) {
    return processStorageOperation(async () => {
        const collection = await dbManager.getTrashItem(collectionId);
        if (!collection) return;

        // Delete all notes that belong to this collection permanently
        const trash = await dbManager.getAllTrash();
        for (const noteId in trash) {
            if (trash[noteId].collectionId === collectionId) {
                await dbManager.deleteTrashItem(noteId);
            }
        }

        // Delete the collection permanently
        await dbManager.deleteTrashItem(collectionId);

        // Record the delete time to prevent auto-restore from Drive
        await dbManager.saveSetting('lastDeleteTime', Date.now());

        // Trigger sync
        triggerSync();
    });
}

// =================================================================
// --- GOOGLE DRIVE SYNC LOGIC ---
// =================================================================
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const SYNC_FILENAME = 'sticky_notes_sync_data.json';

async function saveDataAndSync(data) {
    await dbManager.set(data);
    triggerSync();
}

function triggerSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        syncWithDrive(false);
    }, 10000); // Sync 10 seconds after the last change (increased from 5s)
}

function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, (token) => {
            if (chrome.runtime.lastError || !token) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
}

async function findSyncFile(token) {
    const response = await fetch(`${DRIVE_API_URL}?q=name='${SYNC_FILENAME}'&spaces=appDataFolder`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(chrome.i18n.getMessage('errors_googleDriveAPIError') || `Google Drive API error: ${response.status}`);
    const data = await response.json();
    return data.files.length > 0 ? data.files[0] : null;
}

async function downloadFromDrive(token, fileId) {
    const response = await fetch(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(chrome.i18n.getMessage('errors_googleDriveAPIError') || `Google Drive API error: ${response.status}`);
    return response.json();
}

async function uploadToDrive(token, fileId, dataToSync) {
    const metadata = { name: SYNC_FILENAME, mimeType: 'application/json' };
    if (!fileId) { metadata.parents = ['appDataFolder']; }
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', new Blob([JSON.stringify(dataToSync)], { type: 'application/json' }));
    const url = fileId ? `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart` : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
    const method = fileId ? 'PATCH' : 'POST';
    const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    if (!response.ok) throw new Error(chrome.i18n.getMessage('errors_googleDriveAPIError') || `Google Drive API error: ${response.status}`);
}

function sendMessageToApp(message) {
    chrome.runtime.sendMessage(message).catch(error => {
        if (!error.message.includes("Could not establish connection")) {
            console.error("SendMessage error:", error);
        }
    });
}

async function syncWithDrive(isInteractive, retryCount = 0) {
    console.log('[Sync] Starting sync with Drive, interactive:', isInteractive, 'retry:', retryCount);

    let token;
    try {
        token = await getAuthToken(isInteractive);
    } catch (error) {
        // Only show error message if user explicitly requested sync
        if (isInteractive) {
            sendMessageToApp({ type: 'sync_status', success: false, message: chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed.' });
        }
        console.log('[Sync] No auth token available, skipping sync');
        return; // Can't proceed without a token
    }

    try {
        const driveFile = await findSyncFile(token);
        const { notes, trash, collections, lastDeleteTime, lastSyncTime } = await dbManager.get(['notes', 'trash', 'collections', 'lastDeleteTime', 'lastSyncTime']);
        const localData = { notes: notes || {}, trash: trash || {}, collections: collections || {} };

        // Calculate local timestamp more accurately
        const localTimestamp = Math.max(0,
            ...Object.values(localData.notes).map(n => n.lastModified || 0),
            ...Object.values(localData.trash).map(n => n.lastModified || 0),
            ...Object.values(localData.collections).map(c => c.lastModified || 0),
            lastDeleteTime || 0 // Include last delete time in timestamp calculation
        );

        if (driveFile) {
            const driveDataContainer = await downloadFromDrive(token, driveFile.id);
            const driveTimestamp = driveDataContainer.lastModified || 0;
            const isLocalEmpty = Object.keys(localData.notes).length === 0 &&
                Object.keys(localData.trash).length === 0 &&
                Object.keys(localData.collections).length === 0;
            const hasDriveData = driveDataContainer.data && (
                Object.keys(driveDataContainer.data.notes || {}).length > 0 ||
                Object.keys(driveDataContainer.data.trash || {}).length > 0 ||
                Object.keys(driveDataContainer.data.collections || {}).length > 0
            );

            // Check if local only has default/welcome notes (isDefault flag)
            const localNoteIds = Object.keys(localData.notes);
            const hasOnlyDefaultNotes = localNoteIds.length > 0 &&
                localNoteIds.every(id => localData.notes[id].isDefault === true);

            const localCollectionIds = Object.keys(localData.collections);
            const hasOnlyDefaultCollections = localCollectionIds.length > 0 &&
                localCollectionIds.every(id => localData.collections[id].isDefault === true);

            // Consider local as "empty" if it only has default welcome content
            const isLocalEffectivelyEmpty = isLocalEmpty || (hasOnlyDefaultNotes && hasOnlyDefaultCollections);

            // Check if there was a recent delete operation (within last 24 hours)
            const recentDelete = lastDeleteTime && (Date.now() - lastDeleteTime) < 86400000; // 24 hours
            
            // Check if this is the first sync ever (no lastSyncTime)
            const isFirstSync = !lastSyncTime || lastSyncTime === 0;

            if (isLocalEffectivelyEmpty && hasDriveData && !recentDelete) {
                // Only restore from Drive if local is empty AND no recent delete
                await dbManager.set(driveDataContainer.data);
                await dbManager.saveSetting('lastSyncTime', Date.now());
                if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_restoredFromDrive') || 'Restored from Drive' });
            } else if (isFirstSync && hasDriveData) {
                // First sync ever and Drive has data - prefer Drive data
                // Don't check recentDelete here because we want to merge, not overwrite
                const driveData = driveDataContainer.data;
                const mergedNotes = { ...driveData.notes };
                const mergedCollections = { ...driveData.collections };
                const mergedTrash = { ...driveData.trash };

                // Add any local non-default notes that don't exist in Drive
                Object.keys(localData.notes).forEach(noteId => {
                    const localNote = localData.notes[noteId];
                    if (!localNote.isDefault && !mergedNotes[noteId]) {
                        mergedNotes[noteId] = localNote;
                    }
                });

                // Add any local non-default collections that don't exist in Drive
                Object.keys(localData.collections).forEach(collectionId => {
                    const localCollection = localData.collections[collectionId];
                    if (!localCollection.isDefault && !mergedCollections[collectionId]) {
                        mergedCollections[collectionId] = localCollection;
                    }
                });

                await dbManager.set({
                    notes: mergedNotes,
                    collections: mergedCollections,
                    trash: mergedTrash
                });

                // Calculate new timestamp after merge
                const mergedTimestamp = Math.max(
                    ...Object.values(mergedNotes).map(n => n.lastModified || 0),
                    ...Object.values(mergedTrash).map(n => n.lastModified || 0),
                    ...Object.values(mergedCollections).map(c => c.lastModified || 0),
                    lastDeleteTime || 0
                );

                // Upload merged data back to Drive
                console.log('[Sync] Uploading first sync merged data to Drive');
                await uploadToDrive(token, driveFile.id, {
                    lastModified: mergedTimestamp,
                    lastDeleteTime: lastDeleteTime || 0,
                    data: {
                        notes: mergedNotes,
                        collections: mergedCollections,
                        trash: mergedTrash
                    }
                });

                await dbManager.saveSetting('lastSyncTime', Date.now());
                console.log('[Sync] First sync complete, data saved to IndexedDB');

                // dbManager.set() already emits change events, no need to broadcast again

                if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_syncedFromDrive') || 'Synced from Drive' });
            } else if (driveTimestamp > localTimestamp) {
                // Drive is newer, merge data
                // Don't check recentDelete here because we want to merge, not skip
                console.log('[Sync] Drive is newer, merging data');
                // Merge data instead of overwriting to prevent data loss
                const driveData = driveDataContainer.data;
                const mergedNotes = { ...localData.notes };
                const mergedCollections = { ...localData.collections };
                const mergedTrash = { ...localData.trash };

                // Merge notes: keep note with newer lastModified
                Object.keys(driveData.notes || {}).forEach(noteId => {
                    const driveNote = driveData.notes[noteId];
                    const localNote = mergedNotes[noteId];

                    if (!localNote || driveNote.lastModified > localNote.lastModified) {
                        mergedNotes[noteId] = driveNote;
                    }
                });

                // Merge collections: keep collection with newer lastModified
                Object.keys(driveData.collections || {}).forEach(collectionId => {
                    const driveCollection = driveData.collections[collectionId];
                    const localCollection = mergedCollections[collectionId];

                    if (!localCollection || driveCollection.lastModified > localCollection.lastModified) {
                        mergedCollections[collectionId] = driveCollection;
                    }
                });

                // Merge trash: keep item with newer lastModified
                Object.keys(driveData.trash || {}).forEach(itemId => {
                    const driveItem = driveData.trash[itemId];
                    const localItem = mergedTrash[itemId];

                    if (!localItem || (driveItem.lastModified || driveItem.deletedAt || 0) > (localItem.lastModified || localItem.deletedAt || 0)) {
                        mergedTrash[itemId] = driveItem;
                    }
                });

                await dbManager.set({
                    notes: mergedNotes,
                    collections: mergedCollections,
                    trash: mergedTrash
                });

                // Calculate new timestamp after merge
                const mergedTimestamp = Math.max(
                    ...Object.values(mergedNotes).map(n => n.lastModified || 0),
                    ...Object.values(mergedTrash).map(n => n.lastModified || 0),
                    ...Object.values(mergedCollections).map(c => c.lastModified || 0),
                    lastDeleteTime || 0
                );

                // Upload merged data back to Drive to ensure both sides have all data
                console.log('[Sync] Uploading merged data back to Drive');
                await uploadToDrive(token, driveFile.id, {
                    lastModified: mergedTimestamp,
                    lastDeleteTime: lastDeleteTime || 0,
                    data: {
                        notes: mergedNotes,
                        collections: mergedCollections,
                        trash: mergedTrash
                    }
                });

                await dbManager.saveSetting('lastSyncTime', Date.now());
                console.log('[Sync] Merge complete, data saved to IndexedDB');

                // dbManager.set() already emits change events, no need to broadcast again

                if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_syncedFromDrive') || 'Synced from Drive' });
            } else if (localTimestamp > driveTimestamp) {
                // Local is newer - but need to check if it's just default notes
                if (isLocalEffectivelyEmpty && hasDriveData) {
                    // Local only has default notes but Drive has real data
                    // This means welcome note was created after last Drive sync
                    // Should pull from Drive instead of uploading empty data
                    console.log('[Sync] Local only has defaults but Drive has data, pulling from Drive');
                    await dbManager.set(driveDataContainer.data);
                    await dbManager.saveSetting('lastSyncTime', Date.now());
                    console.log('[Sync] Pull complete, data saved to IndexedDB');

                    // dbManager.set() already emits change events, no need to broadcast again

                    if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_syncedFromDrive') || 'Synced from Drive' });
                } else {
                    // Local has real data and is newer, upload to Drive
                    console.log('[Sync] Local is newer, uploading to Drive');
                    await uploadToDrive(token, driveFile.id, {
                        lastModified: localTimestamp,
                        lastDeleteTime: lastDeleteTime || 0,
                        data: localData
                    });
                    await dbManager.saveSetting('lastSyncTime', Date.now());
                    if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_syncedToDrive') || 'Synced to Drive' });
                }
            } else {
                // Timestamps are equal - but still need to merge to ensure both sides have all data
                const driveData = driveDataContainer.data;
                
                // Check if there are differences
                const localNoteIds = new Set(Object.keys(localData.notes));
                const driveNoteIds = new Set(Object.keys(driveData.notes || {}));
                const hasDifferences = localNoteIds.size !== driveNoteIds.size || 
                    [...localNoteIds].some(id => !driveNoteIds.has(id)) ||
                    [...driveNoteIds].some(id => !localNoteIds.has(id));
                
                if (hasDifferences) {
                    const mergedNotes = { ...localData.notes, ...driveData.notes };
                    const mergedCollections = { ...localData.collections, ...driveData.collections };
                    const mergedTrash = { ...localData.trash, ...driveData.trash };
                    
                    await dbManager.set({
                        notes: mergedNotes,
                        collections: mergedCollections,
                        trash: mergedTrash
                    });
                    
                    // Upload merged data back to Drive
                    const mergedTimestamp = Math.max(
                        ...Object.values(mergedNotes).map(n => n.lastModified || 0),
                        ...Object.values(mergedTrash).map(n => n.lastModified || 0),
                        ...Object.values(mergedCollections).map(c => c.lastModified || 0),
                        lastDeleteTime || 0
                    );
                    
                    await uploadToDrive(token, driveFile.id, {
                        lastModified: mergedTimestamp,
                        lastDeleteTime: lastDeleteTime || 0,
                        data: {
                            notes: mergedNotes,
                            collections: mergedCollections,
                            trash: mergedTrash
                        }
                    });
                }
                
                await dbManager.saveSetting('lastSyncTime', Date.now());
                if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_notesUpToDate') || 'Notes are up to date' });
            }
        } else { // No file on drive yet
            if (Object.keys(localData.notes).length > 0 ||
                Object.keys(localData.trash).length > 0 ||
                Object.keys(localData.collections).length > 0) {
                await uploadToDrive(token, null, {
                    lastModified: localTimestamp,
                    lastDeleteTime: lastDeleteTime || 0,
                    data: localData
                });
                await dbManager.saveSetting('lastSyncTime', Date.now());
                if (isInteractive) sendMessageToApp({ type: 'sync_status', success: true, message: chrome.i18n.getMessage('messages_backedUpToDrive') || 'Backed up to Drive' });
            }
        }
    } catch (apiError) {
        console.error("Google Drive API operation failed:", apiError);

        // Retry up to 3 times with exponential backoff for non-interactive syncs
        if (retryCount < 3 && !isInteractive) {
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            setTimeout(() => syncWithDrive(false, retryCount + 1), delay);
        } else if (isInteractive) {
            sendMessageToApp({ type: 'sync_status', success: false, message: chrome.i18n.getMessage('messages_syncFailed') || 'Sync failed' });
        }
    }
}

chrome.alarms.create('periodicSync', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'periodicSync') {
        syncWithDrive(false);
    }
});

// --- Storage Cleanup Functions ---
async function cleanupStorage() {
    try {
        // Get all settings from IndexedDB
        const items = await dbManager.get([
            'cache_', 'temp_', 'ai_cache_', 'preview_', 'thumbnail_',
            'backup_', 'aiBackendUrl', 'aiUnlocked', 'aiSelectedText'
        ]);

        const keysToDelete = [];

        // Only delete cache and temp data - DO NOT touch notes
        Object.keys(items).forEach(key => {
            if (key.startsWith('cache_') ||
                key.startsWith('temp_') ||
                key.startsWith('ai_cache_') ||
                key.startsWith('preview_') ||
                key.startsWith('thumbnail_') ||
                key.startsWith('backup_') ||
                key.startsWith('aiBackendUrl') ||
                key.startsWith('aiUnlocked') ||
                key.startsWith('aiSelectedText')) {
                keysToDelete.push(key);
            }
        });

        if (keysToDelete.length > 0) {
            await dbManager.remove(keysToDelete);
        }

        return keysToDelete.length;
    } catch (error) {
        console.error('Cleanup error:', error);
        return 0;
    }
}

// Check if Main App window is currently open
async function checkIfMainAppIsOpen() {
    try {
        const windows = await chrome.windows.getAll({ populate: true });
        const mainAppUrl = `main_app/main_app.html`;

        const mainWindow = windows.find(w => w.tabs?.some(t => t.url?.includes(mainAppUrl)));

        return !!mainWindow;
    } catch (error) {
        console.error('[Service Worker] Error checking if Main App is open:', error);
        return false;
    }
}

// --- Window Close Handler ---
chrome.windows.onRemoved.addListener(async (windowId) => {
    // Find the noteId that corresponds to this windowId
    let foundNoteId = null;
    for (const noteId in openNoteWindows) {
        if (openNoteWindows[noteId] === windowId) {
            foundNoteId = noteId;
            break;
        }
    }

    // Remove from tracking
    if (foundNoteId) {
        delete openNoteWindows[foundNoteId];

        // Check if Main App is currently open
        const isMainAppOpen = await checkIfMainAppIsOpen();

        if (isMainAppOpen) {
            // If Main App is open, generate title immediately for better UX
            await generateTitleForNote(foundNoteId);
        } else {
            // If Main App is not open, title will be generated when user opens Main App
        }
    }
});

// Helper function to extract text from HTML (service worker compatible)
function extractTextFromHTML(html) {
    if (!html) return '';

    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

// Generate title for note using AI
async function generateTitleForNote(noteId) {
    try {
        const note = await dbManager.getNote(noteId);

        if (!note || !note.content) {
            return;
        }

        // Extract text from HTML content
        const textContent = extractTextFromHTML(note.content);

        // Skip if content is too short or empty
        if (textContent.length < 3) {
            return;
        }

        // Check if title was already generated for this exact content
        const contentHash = textContent.substring(0, 100);
        if (note.aiTitle && note.titleContentHash === contentHash) {
            return;
        }

        // Call backend API to generate title (no auth needed - free feature)
        const backendUrl = aiService.getBackendUrl();
        const response = await fetch(`${backendUrl}/api/ai/generate-title`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: note.content
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.title) {
            // Send message FIRST before saving to storage
            // This allows main app to show typewriter animation before storage update triggers re-render
            try {
                await chrome.runtime.sendMessage({
                    action: 'aiTitleGenerated',
                    noteId: noteId,
                    aiTitle: result.title
                });

                // Wait for animation to complete
                const animationTime = result.title.length * 50 + 500;
                await new Promise(resolve => setTimeout(resolve, animationTime));
            } catch (error) {
                // No main app listening, continue
            }

            // Save to storage after animation completes
            note.aiTitle = result.title;
            note.titleContentHash = contentHash;
            note.aiTitleGeneratedAt = Date.now();
            await dbManager.saveNote(note);
        } else {
            throw new Error(chrome.i18n.getMessage('errors_failedToGenerateTitle') || 'Failed to generate title');
        }

    } catch (error) {
        console.error('Error generating AI title:', error);

        // Fallback: use first 50 characters as title
        try {
            const note = await dbManager.getNote(noteId);

            if (note && note.content) {
                const textContent = extractTextFromHTML(note.content);
                const fallbackTitle = textContent.substring(0, 50) || 'New Note';

                note.aiTitle = fallbackTitle;
                note.titleContentHash = textContent.substring(0, 100);
                note.aiTitleGeneratedAt = Date.now();
                await dbManager.saveNote(note);

                // Notify main app
                chrome.runtime.sendMessage({
                    action: 'aiTitleGenerated',
                    noteId: noteId,
                    aiTitle: fallbackTitle
                });
            }
        } catch (fallbackError) {
            console.error('Fallback title generation failed:', fallbackError);
        }
    }
}

// Generate titles for all notes that don't have them yet
// Process one by one with delay to avoid rate limiting
async function generateMissingTitles() {
    try {
        const notes = await dbManager.getAllNotes();

        // Find notes that need title generation
        const notesNeedingTitles = [];

        for (const noteId in notes) {
            const note = notes[noteId];

            // Skip if note is draft, deleted, or already has title
            if (note.isDraft || note.isDeleted) continue;
            if (note.aiTitle) continue;

            // Check if note has meaningful content
            const textContent = extractTextFromHTML(note.content);
            if (textContent.length >= 3) {
                notesNeedingTitles.push(noteId);
            }
        }

        if (notesNeedingTitles.length === 0) {
            return;
        }

        // Process each note with delay to avoid rate limiting
        // Use 3 seconds delay between each request
        for (let i = 0; i < notesNeedingTitles.length; i++) {
            const noteId = notesNeedingTitles[i];

            try {
                await generateTitleForNote(noteId);
            } catch (error) {
                console.error(`[Service Worker] Failed to generate title for ${noteId}:`, error);
            }

            // Wait 3 seconds before processing next note (except for the last one)
            if (i < notesNeedingTitles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

    } catch (error) {
        console.error('[Service Worker] Error in generateMissingTitles:', error);
    }
}





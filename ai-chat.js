// ai-chat.js - AI Chat Interface Logic
// Version: 2.0 - Fixed authentication issue

// Prevent zoom on all gestures
(function preventZoom() {
    // Prevent pinch zoom
    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('gesturechange', function (e) {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('gestureend', function (e) {
        e.preventDefault();
    }, { passive: false });

    // Prevent wheel zoom (Ctrl + scroll)
    document.addEventListener('wheel', function (e) {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });

    // Prevent keyboard zoom (Ctrl + Plus/Minus)
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=')) {
            e.preventDefault();
        }
    }, { passive: false });

    // Prevent double-tap zoom on touch devices
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
})();

class AIChatInterface {
    constructor() {
        this.isOpen = false;
        this.isMinimized = false;
        this.currentAction = null;
        this.messageHistory = [];
        this.isProcessing = false;
        this.selectedText = null;
        this.selectionInfo = null; // Store selection position info for replace

        // Force refresh check
        this.checkForUpdates();

        this.initializeElements();
        this.setupEventListeners();
        this.initializeTranslation();
        this.initializeContext();
    }

    // Check for updates and force refresh if needed
    checkForUpdates() {
        const currentVersion = '2.0';
        const storedVersion = localStorage.getItem('ai-chat-version');

        if (storedVersion !== currentVersion) {
            localStorage.setItem('ai-chat-version', currentVersion);

            // Clear any cached data
            if (window.aiService && window.aiService.clearCache) {
                window.aiService.clearCache();
            }

            // Force reload if this is an update
            if (storedVersion && storedVersion !== currentVersion) {
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        }
    }

    initializeElements() {
        this.overlay = document.getElementById('ai-chat-overlay');
        this.container = document.getElementById('ai-chat-container');
        this.messagesContainer = document.getElementById('ai-chat-messages');
        this.input = document.getElementById('ai-chat-input');
        this.sendBtn = document.getElementById('ai-send-btn');
        this.typingIndicator = document.getElementById('ai-typing-indicator');
        this.errorMessage = document.getElementById('ai-error-message');
        this.errorText = document.getElementById('ai-error-text');
        this.minimizeBtn = document.getElementById('ai-minimize-btn');
    }

    setupEventListeners() {
        // Input events
        this.input.addEventListener('input', this.handleInputChange.bind(this));
        this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.sendBtn.addEventListener('click', this.handleSendMessage.bind(this));

        // Control buttons
        this.minimizeBtn.addEventListener('click', this.toggleMinimize.bind(this));

        // Overlay click to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Disable Chrome context menu globally
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    async initializeTranslation() {
        // Translation system simplified - no language switching
        // Chrome i18n is automatically initialized
    }

    // Initialize context from selected text
    async initializeContext() {
        try {
            const aiSelectedText = await dbManager.getSetting('aiSelectedText');
            const aiSelectionInfo = await dbManager.getSetting('aiSelectionInfo');
            const aiContextTimestamp = await dbManager.getSetting('aiContextTimestamp');

            if (aiSelectedText && aiContextTimestamp) {
                // Check if context is recent (within 5 minutes)
                const isRecent = (Date.now() - aiContextTimestamp) < 300000;

                if (isRecent) {
                    this.showContextIndicator(aiSelectedText);
                    this.selectedText = aiSelectedText;
                    this.selectionInfo = aiSelectionInfo || null;
                } else {
                    // Clear old context
                    this.clearContext();
                }
            }
        } catch (error) {
            console.error('Failed to initialize context:', error);
        }
    }

    // Clear context
    async clearContext() {
        this.selectedText = null;
        this.selectionInfo = null;
        await dbManager.deleteSetting('aiSelectedText');
        await dbManager.deleteSetting('aiSelectionInfo');
        await dbManager.deleteSetting('aiContextTimestamp');

        // Remove context indicator if exists
        const contextIndicator = document.querySelector('.ai-context-indicator');
        if (contextIndicator && contextIndicator.parentElement === this.messagesContainer) {
            contextIndicator.remove();
        }
    }

    // Show context indicator for selected text
    showContextIndicator(selectedText) {
        const contextDiv = document.createElement('div');
        contextDiv.className = 'ai-context-indicator';
        contextDiv.innerHTML = `
            <div class="context-header">
                <span class="context-icon">🎯</span>
                <span class="context-label">Selected Text:</span>
            </div>
            <div class="context-content">${this.escapeHtml(selectedText)}</div>
        `;

        // Insert at the beginning of chat messages
        this.messagesContainer.insertBefore(contextDiv, this.messagesContainer.firstChild);
    }

    // Show chat interface with circular reveal animation
    async show(sourceElement = null) {
        if (this.isOpen) return;

        this.isOpen = true;

        // If sourceElement is provided, create circular reveal animation
        if (sourceElement && typeof anime !== 'undefined') {
            await this.circularRevealAnimation(sourceElement);
        } else {
            // Fallback to normal animation
            this.overlay.classList.add('show');
        }

        this.input.focus();

        // Add animation class
        this.container.classList.add('ai-fade-in');

        // Initialize AI service and check login status
        const initialized = await this.initializeAIService();
        if (!initialized) {
            // Show warning but don't prevent opening
            this.addMessage('ai', chrome.i18n.getMessage('ai_serviceNotAvailable'));
        } else {
            // Check if user is logged in
            const isLoggedIn = await window.aiService.isUserLoggedIn();
            if (!isLoggedIn) {
                this.addMessage('ai', chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension to get started!');
            } else {
                // Show usage information for logged-in users
                await this.showUsageInfo();
            }
        }
    }

    // Show usage information
    async showUsageInfo() {
        try {
            const limitCheck = await window.aiService.checkDailyLimit();

            if (limitCheck.remaining === -1) {
                // Premium user
                this.addMessage('ai', chrome.i18n.getMessage('ai_welcomePremiumUser'));
            } else if (limitCheck.remaining > 0) {
                // Regular user with remaining requests
                const message = chrome.i18n.getMessage('ai_welcomeUser')
                    .replace('{remaining}', limitCheck.remaining)
                    .replace('{limit}', limitCheck.limit);
                this.addMessage('ai', message);
            } else {
                // Limit reached
                const message = chrome.i18n.getMessage('ai_limitReached')
                    .replace('{limit}', limitCheck.limit);
                this.addMessage('ai', message);
            }
        } catch (error) {
            console.error('Error showing usage info:', error);
        }
    }

    // Circular reveal animation from source element
    async circularRevealAnimation(sourceElement) {
        return new Promise((resolve) => {
            // Get source element position
            const sourceRect = sourceElement.getBoundingClientRect();
            const sourceCenterX = sourceRect.left + sourceRect.width / 2;
            const sourceCenterY = sourceRect.top + sourceRect.height / 2;

            // Calculate the maximum distance to cover entire screen
            const maxDistance = Math.sqrt(
                Math.pow(Math.max(sourceCenterX, window.innerWidth - sourceCenterX), 2) +
                Math.pow(Math.max(sourceCenterY, window.innerHeight - sourceCenterY), 2)
            ) * 2;

            // Create circular reveal element
            const circleReveal = document.createElement('div');
            circleReveal.className = 'ai-circular-reveal';
            circleReveal.style.left = sourceCenterX + 'px';
            circleReveal.style.top = sourceCenterY + 'px';
            circleReveal.style.width = '0px';
            circleReveal.style.height = '0px';
            document.body.appendChild(circleReveal);

            // Show overlay immediately but transparent
            this.overlay.style.opacity = '0';
            this.overlay.style.visibility = 'visible';

            // Animate the circular reveal
            anime({
                targets: circleReveal,
                width: maxDistance + 'px',
                height: maxDistance + 'px',
                left: (sourceCenterX - maxDistance / 2) + 'px',
                top: (sourceCenterY - maxDistance / 2) + 'px',
                opacity: [0.9, 0],
                easing: 'easeOutCubic',
                duration: 600,
                begin: () => {
                    // Fade in overlay during animation
                    anime({
                        targets: this.overlay,
                        opacity: 1,
                        duration: 400,
                        easing: 'easeOutQuad'
                    });
                },
                complete: () => {
                    // Remove circular reveal element
                    circleReveal.remove();

                    // Ensure overlay is fully visible
                    this.overlay.classList.add('show');
                    this.overlay.style.opacity = '';

                    resolve();
                }
            });
        });
    }

    // Close chat interface
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.overlay.classList.remove('show');
        this.container.classList.remove('ai-fade-in');

        // Reset container state
        this.resetContainerState();

        // Clear input and reset state
        this.input.value = '';
        this.currentAction = null;
        this.hideError();
        this.hideTyping();

        // Clear context when closing
        this.clearContext();
    }

    // Toggle minimize
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;

        if (this.isMinimized) {
            this.container.style.height = '72px';
            this.minimizeBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
        } else {
            this.container.style.height = '600px';
            this.minimizeBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
        }
    }

    // Handle input change
    handleInputChange() {
        const hasText = this.input.value.trim().length > 0;
        this.sendBtn.disabled = !hasText || this.isProcessing;

        // Auto-resize textarea with smooth transition
        this.input.style.height = 'auto';
        const newHeight = Math.min(this.input.scrollHeight, 120);
        this.input.style.height = newHeight + 'px';

        // Add pulse effect to send button when text is entered
        if (hasText && !this.sendBtn.classList.contains('ai-pulse')) {
            this.sendBtn.classList.add('ai-pulse');
        } else if (!hasText && this.sendBtn.classList.contains('ai-pulse')) {
            this.sendBtn.classList.remove('ai-pulse');
        }
    }

    // Handle key down
    handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                this.handleSendMessage();
            }
        }
    }

    // Handle send message
    async handleSendMessage() {
        const message = this.input.value.trim();
        if (!message || this.isProcessing) return;

        // Add user message to chat
        this.addMessage('user', message);

        // Clear input
        this.input.value = '';
        this.handleInputChange();

        // Process message
        await this.processMessage(message);
    }

    // Process message
    async processMessage(message) {
        this.showTyping();
        this.isProcessing = true;

        try {
            // Include selected text as context if available
            let contextMessage = message;
            if (this.selectedText) {
                contextMessage = `${chrome.i18n.getMessage('ai_selectedText')}: ${this.selectedText}\n\n${chrome.i18n.getMessage('ai_userMessage')}: ${message}`;
            } else {
                // Smart context detection for regular messages
                const context = await this.detectContext(message);
                if (context && context.includes('Current note content:')) {
                    contextMessage = context;
                }
            }

            await this.sendToAIStream('chat', {
                message: contextMessage
            });

        } catch (error) {
            console.error('AI processing error:', error);
            const shortError = this.getShortErrorMessage(error.message);
            this.showError(shortError);
        } finally {
            this.hideTyping();
            this.isProcessing = false;
        }
    }

    // Send to AI service using ai-service.js
    async sendToAI(action, params) {
        try {
            // Check if AI service is available
            if (!window.aiService) {
                console.error('[DEBUG] AI service not available');
                throw new Error(chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI service not available. Please refresh the page.');
            }

            // Check if user is logged in first
            const isLoggedIn = await window.aiService.isUserLoggedIn();

            if (!isLoggedIn) {
                console.error('[DEBUG] User not logged in - blocking AI request');
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
            }

            // Double-check AI unlock status for extra security
            const isUnlocked = await window.aiService.checkAIUnlockStatus();

            if (!isUnlocked) {
                console.error('[DEBUG] AI not unlocked - blocking AI request');
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
            }

            // Use the appropriate AI service method
            let result;
            switch (action) {
                case 'chat':
                    // Detect if this is context chat or free chat
                    const hasContext = params.context && params.context.trim().length > 0;
                    if (hasContext) {
                        result = await window.aiService.chatContext(params.message, params.context, params.options || {});
                    } else {
                        result = await window.aiService.chatFree(params.message, params.options || {});
                    }
                    break;
                case 'summarize':
                    result = await window.aiService.summarize(params.content, params.options || {});
                    break;
                case 'expand':
                    result = await window.aiService.expand(params.content, params.options || {});
                    break;
                case 'improve':
                    result = await window.aiService.improve(params.content, params.options || {});
                    break;
                case 'suggestions':
                    result = await window.aiService.getSuggestions(params.content, params.options || {});
                    break;
                case 'outline':
                    result = await window.aiService.createOutline(params.content, params.options || {});
                    break;
                case 'meeting-notes':
                    result = await window.aiService.meetingNotes(params.content, params.options || {});
                    break;
                default:
                    throw new Error(`Unknown AI action: ${action}`);
            }

            return result;
        } catch (error) {
            console.error('AI service error:', error);
            throw error;
        }
    }

    // Send to AI service with streaming
    async sendToAIStream(action, params) {
        try {
            // Check if AI service is available
            if (!window.aiService) {
                throw new Error(chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI service not available. Please refresh the page.');
            }

            // Check if user is logged in first
            const isLoggedIn = await window.aiService.isUserLoggedIn();

            if (!isLoggedIn) {
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
            }

            // Double-check AI unlock status for extra security
            const isUnlocked = await window.aiService.checkAIUnlockStatus();

            if (!isUnlocked) {
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
            }

            // Use the appropriate AI service streaming method
            let response;
            switch (action) {
                case 'chat':
                    // Detect if this is context chat or free chat
                    const hasContext = params.context && params.context.trim().length > 0;
                    if (hasContext) {
                        response = await window.aiService.chatContextStream(params.message, params.context, params.options || {});
                    } else {
                        response = await window.aiService.chatFreeStream(params.message, params.options || {});
                    }
                    break;
                default:
                    throw new Error(`Streaming not supported for action: ${action}`);
            }

            // Process streaming response
            await this.processStreamingResponse(response, !!this.selectedText);
        } catch (error) {
            console.error('AI streaming service error:', error);
            throw error;
        }
    }

    // Process streaming response
    async processStreamingResponse(response, hasContext = false) {
        try {
            // Create AI message container
            const messageDiv = document.createElement('div');
            messageDiv.className = 'ai-ai-message ai-slide-up';

            const contextIndicator = hasContext ?
                '<div class="ai-context-indicator">📝 Using note content</div>' : '';

            messageDiv.innerHTML = `
                <div class="ai-avatar">
                    <img src="note img/Gemini.svg" width="20" height="20" alt="__MSG_toolbar_aiAssistant__">
                </div>
                <div class="ai-message-content">
                    ${contextIndicator}
                    <div class="ai-streaming-content" id="ai-streaming-content"></div>
                </div>
            `;

            this.messagesContainer.appendChild(messageDiv);
            this.scrollToBottom();

            // Store in history
            this.messageHistory.push({ type: 'ai', content: '', timestamp: Date.now() });

            // Auto-expand container for AI responses with smooth animation
            this.autoExpandContainerForResponse('');

            // Process the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            const streamingContent = document.getElementById('ai-streaming-content');

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    fullContent += chunk;

                    // Update the streaming content
                    if (streamingContent) {
                        streamingContent.innerHTML = this.formatAIResponse(fullContent);
                        this.scrollToBottom();
                    }
                }

                // Update the final content in history
                const lastMessage = this.messageHistory[this.messageHistory.length - 1];
                if (lastMessage && lastMessage.type === 'ai') {
                    lastMessage.content = fullContent;
                }

                // Add action buttons after streaming completes
                this.addActionButtons(fullContent, 'chat');

            } finally {
                reader.releaseLock();
            }

        } catch (error) {
            console.error('Error processing streaming response:', error);
            throw error;
        }
    }

    // Add message to chat
    addMessage(type, content, hasContext = false) {
        if (!content || content.trim() === '') {
            console.warn('Empty message content, skipping');
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-${type}-message ai-slide-up`;

        if (type === 'user') {
            messageDiv.innerHTML = `
                <div class="ai-message-content">
                    <p>${this.escapeHtml(content)}</p>
                </div>
            `;
        } else {
            const contextIndicator = hasContext ?
                '<div class="ai-context-indicator">📝 Using note content</div>' : '';

            messageDiv.innerHTML = `
                <div class="ai-avatar">
                    <img src="note img/Gemini.svg" width="20" height="20" alt="__MSG_toolbar_aiAssistant__">
                </div>
                <div class="ai-message-content">
                    ${contextIndicator}
                    ${this.formatAIResponse(content)}
                </div>
            `;

            // Auto-expand container for AI responses with smooth animation
            this.autoExpandContainerForResponse(content);
        }

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();

        // Store in history
        this.messageHistory.push({ type, content, timestamp: Date.now() });
    }

    // Add action buttons
    addActionButtons(response, action) {
        const lastMessage = this.messagesContainer.lastElementChild;
        if (!lastMessage || !lastMessage.classList.contains('ai-ai-message')) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'ai-action-buttons';

        // Check if we have selection info for replace functionality
        const hasSelection = this.selectionInfo && this.selectionInfo.index !== undefined;

        // Create Apply button - smart behavior based on selection
        const applyBtn = document.createElement('button');
        applyBtn.className = 'ai-action-btn ai-apply-btn';
        applyBtn.dataset.action = 'apply';

        // Store selection info in button for smart apply
        applyBtn._rawContent = response;
        applyBtn._selectionInfo = hasSelection ? this.selectionInfo : null;
        applyBtn._hasSelection = hasSelection;

        applyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${chrome.i18n.getMessage('ai_applyToNote') || 'Apply to Note'}
        `;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-action-btn ai-copy-btn';
        copyBtn.dataset.action = 'copy';
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6C4 4.89543 4.89543 4 6 4H8M16 4C16 2.89543 15.1046 2 14 2H10C8.89543 2 8 2.89543 8 4M16 4C16 5.10457 15.1046 6 14 6H10C8.89543 6 8 5.10457 8 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${chrome.i18n.getMessage('ai_copy') || 'Copy'}
        `;
        copyBtn._rawContent = response;

        // Add event listeners
        applyBtn.addEventListener('click', this.handleActionButton.bind(this));
        copyBtn.addEventListener('click', this.handleActionButton.bind(this));

        buttonContainer.appendChild(applyBtn);
        buttonContainer.appendChild(copyBtn);

        lastMessage.appendChild(buttonContainer);
    }

    // Handle action button
    async handleActionButton(e) {
        const action = e.currentTarget.dataset.action;
        // Get raw content from button property (not from data-content to avoid HTML escaping)
        const content = e.currentTarget._rawContent;
        const selectionInfo = e.currentTarget._selectionInfo;
        const hasSelection = e.currentTarget._hasSelection;

        if (!content) {
            console.error('[AI Chat] No content found for action:', action);
            this.showError(chrome.i18n.getMessage('ai_contentNotAvailable') || 'Content not available');
            return;
        }

        console.log('[AI Chat] Action button clicked:', action, 'Has selection:', hasSelection, 'Content length:', content.length);

        switch (action) {
            case 'apply':
                // Smart apply: replace if has selection, otherwise append
                if (hasSelection && selectionInfo) {
                    await this.insertAndReplace(content, selectionInfo);
                } else {
                    await this.applyToNote(content);
                }
                break;
            case 'copy':
                await this.copyToClipboard(content);
                break;
        }
    }

    // Insert and replace selected text
    async insertAndReplace(content, selectionInfo) {
        try {
            console.log('[AI Chat] Inserting and replacing content, length:', content.length, 'selection:', selectionInfo);

            // Try to send message to opener window first (if opened from note)
            if (window.opener && !window.opener.closed) {
                console.log('[AI Chat] Sending insert/replace to opener window');
                window.opener.postMessage({
                    action: 'insertAndReplaceAIContent',
                    content: content,
                    selectionInfo: selectionInfo
                }, '*');
            } else {
                // Fallback: Send via chrome.runtime.sendMessage
                console.log('[AI Chat] Sending insert/replace via chrome.runtime.sendMessage');
                chrome.runtime.sendMessage({
                    action: 'insertAndReplaceAIContent',
                    content: content,
                    selectionInfo: selectionInfo
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[AI Chat] Message send error:', chrome.runtime.lastError);
                    } else {
                        console.log('[AI Chat] Message sent successfully:', response);
                    }
                });
            }

            this.addMessage('ai', chrome.i18n.getMessage('ai_contentInserted') || 'Content inserted and replaced selected text');

            // Clear selection info after successful insert
            this.clearContext();
        } catch (error) {
            console.error('[AI Chat] Insert/replace failed:', error);
            this.showError(chrome.i18n.getMessage('ai_insertFailed') || 'Failed to insert content');
        }
    }

    // Apply content to note (append)
    async applyToNote(content) {
        try {
            console.log('[AI Chat] Applying content to note, length:', content.length);

            // Try to send message to opener window first (if opened from note)
            if (window.opener && !window.opener.closed) {
                console.log('[AI Chat] Sending to opener window');
                window.opener.postMessage({
                    action: 'applyAIContent',
                    content: content
                }, '*');
            } else {
                // Fallback: Send via chrome.runtime.sendMessage
                console.log('[AI Chat] Sending via chrome.runtime.sendMessage');
                chrome.runtime.sendMessage({
                    action: 'applyAIContent',
                    content: content
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[AI Chat] Message send error:', chrome.runtime.lastError);
                    } else {
                        console.log('[AI Chat] Message sent successfully:', response);
                    }
                });
            }

            this.addMessage('ai', chrome.i18n.getMessage('ai_contentApplied') || 'Content applied to note');
        } catch (error) {
            console.error('[AI Chat] Apply failed:', error);
            this.showError(chrome.i18n.getMessage('ai_applyFailed') || 'Failed to apply content');
        }
    }

    // Copy to clipboard
    async copyToClipboard(content) {
        try {
            // Convert markdown to plain text before copying
            let plainText = content;

            if (window.MarkdownProcessor && window.MarkdownProcessor.toPlainText) {
                plainText = window.MarkdownProcessor.toPlainText(content);
                console.log('[AI Chat] Converted markdown to plain text for clipboard');
            } else {
                console.warn('[AI Chat] MarkdownProcessor not available, copying as-is');
            }

            await navigator.clipboard.writeText(plainText);
            this.addMessage('ai', chrome.i18n.getMessage('ai_contentCopied') || 'Content copied to clipboard');
        } catch (error) {
            console.error('[AI Chat] Copy failed:', error);
            this.showError(chrome.i18n.getMessage('ai_copyFailed') || 'Failed to copy content');
        }
    }

    // Show typing indicator
    showTyping() {
        this.typingIndicator.style.display = 'flex';
        // Reset animation to trigger it again
        this.typingIndicator.style.animation = 'none';
        this.typingIndicator.offsetHeight; // Trigger reflow
        this.typingIndicator.style.animation = 'ai-typing-appear 0.3s ease-out forwards';
        this.scrollToBottom();
    }

    // Hide typing indicator
    hideTyping() {
        this.typingIndicator.style.display = 'none';
    }

    // Show error message
    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    // Hide error message
    hideError() {
        this.errorMessage.style.display = 'none';
    }

    // Scroll to bottom
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // Auto-expand container for AI response with smooth animation
    autoExpandContainerForResponse(content) {
        // Calculate optimal height based on content length
        const contentLength = content.length;
        let targetHeight = 500; // Base height

        if (contentLength > 500) {
            targetHeight = 700; // Large responses
        } else if (contentLength > 200) {
            targetHeight = 600; // Medium responses
        }

        // Add auto-expanded class for smooth transition
        this.container.classList.add('auto-expanded');

        // Apply expansion with smooth transition
        this.container.style.height = `${targetHeight}px`;
        this.container.classList.add('expanded');

        // Add enhanced gradient effect for AI responses
        this.addEnhancedGradientEffect();

        // Auto-scroll to show the new content
        setTimeout(() => {
            this.scrollToBottom();
        }, 100);

        // Remove auto-expanded class after animation completes
        setTimeout(() => {
            this.container.classList.remove('auto-expanded');
        }, 600);
    }

    // Enhanced gradient effect for AI responses
    addEnhancedGradientEffect() {
        // Add subtle glow effect to container
        this.container.style.boxShadow = `
            var(--ai-glass-shadow-dark), 
            0 0 30px rgba(255, 107, 107, 0.2), 
            0 0 60px rgba(156, 39, 176, 0.15)
        `;

        // The gradient animation is now handled by CSS ::before pseudo-element
        // No need to set animation directly in JavaScript
    }

    // Reset container to normal state
    resetContainerState() {
        this.container.style.height = '500px';
        this.container.classList.remove('expanded');
        this.container.style.boxShadow = 'var(--ai-glass-shadow-dark)';
        // Gradient animation is handled by CSS ::before pseudo-element
    }

    // Animate container expansion
    animateContainerExpansion() {
        // The CSS transitions handle the animation
        // This function can be used for additional JavaScript-based animations if needed
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 400); // Match CSS transition duration
        });
    }

    // Format AI response - using marked.js for consistent markdown rendering
    formatAIResponse(content) {
        // Use MarkdownProcessor if available
        if (window.MarkdownProcessor && window.MarkdownProcessor.toHTML) {
            try {
                return window.MarkdownProcessor.toHTML(content);
            } catch (error) {
                console.error('[AI Chat] Error formatting with MarkdownProcessor:', error);
                // Fallback to simple formatting
            }
        }

        // Fallback: Simple formatting
        let formatted = this.escapeHtml(content);
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        formatted = formatted.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    // Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize AI service
    async initializeAIService() {
        try {
            // Check if AI service is available
            if (!window.aiService) {
                console.warn('AI service not available');
                this.showError(chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI service not available. Please refresh the page.');
                return false;
            }

            // Initialize the AI service
            const initialized = await window.aiService.initialize();

            if (!initialized) {
                console.warn('AI service not properly initialized');
                this.showError(chrome.i18n.getMessage('ai_serviceNotConfigured') || 'AI service not properly configured');
                return false;
            }
            return true;
        } catch (error) {
            console.error('Failed to initialize AI service:', error);
            this.showError(chrome.i18n.getMessage('ai_serviceInitFailed') || 'Failed to initialize AI service');
            return false;
        }
    }

    // Check AI service status
    async checkAIServiceStatus() {
        try {
            if (!window.aiService) {
                return { success: false, error: chrome.i18n.getMessage('ai_serviceNotAvailable') || 'AI service not available' };
            }

            const isLoggedIn = await window.aiService.isUserLoggedIn();
            const initialized = await window.aiService.initialize();

            return {
                success: initialized,
                initialized: initialized,
                isLoggedIn: isLoggedIn,
                error: initialized ? null : (chrome.i18n.getMessage('ai_serviceNotInitialized') || 'AI service not initialized')
            };
        } catch (error) {
            console.error('Failed to check AI service status:', error);
            return { success: false, error: error.message };
        }
    }

    // Smart context detection
    async detectContext(message) {
        const lowerMessage = message.toLowerCase();

        // Keywords that indicate note-related operations
        const noteContextKeywords = [
            'summarize', 'summarize content', 'summary',
            'expand', 'expand content', 'elaborate',
            'improve', 'improve content', 'enhance',
            'translate', 'translate content', 'translation',
            'suggestions', 'suggestions for', 'suggest',
            'outline', 'create outline', 'structure',
            'tone', 'change tone', 'adjust tone',
            'content', 'note', 'text', 'document'
        ];

        // Check if message contains note-related keywords
        const needsNoteContext = noteContextKeywords.some(keyword =>
            lowerMessage.includes(keyword)
        );

        if (needsNoteContext) {
            try {
                // Get current note content
                const noteContent = await this.getCurrentNoteContent();
                if (noteContent && noteContent.trim()) {
                    return `Current note content: ${noteContent}`;
                }
            } catch (error) {
                console.warn('Failed to get note content:', error);
            }
        }

        return ''; // No context needed for general chat
    }

    // Get current note content
    async getCurrentNoteContent() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'getNoteContent'
            }, (response) => {
                if (response && response.success) {
                    resolve(response.content);
                } else {
                    resolve('');
                }
            });
        });
    }

    // Get short error message
    getShortErrorMessage(errorMessage) {
        const errorMappings = {
            'Please sign in to use AI features': chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI',
            'Please sign in to use AI features. Click the sign-in button in the extension.': chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI',
            'Rate limit exceeded': chrome.i18n.getMessage('ai_rateLimitExceeded') || 'Too many requests',
            'Request timeout': chrome.i18n.getMessage('ai_requestTimeout') || 'Request timeout',
            'Network error': chrome.i18n.getMessage('ai_networkError') || 'Network error',
            'Invalid API key': chrome.i18n.getMessage('ai_invalidAPIKey') || 'Invalid API key',
            'API access forbidden': chrome.i18n.getMessage('ai_accessDenied') || 'Access denied',
            'AI service temporarily unavailable': chrome.i18n.getMessage('ai_serviceUnavailable') || 'AI service temporarily unavailable',
            'No response generated': chrome.i18n.getMessage('ai_noResponse') || 'No response from AI',
            'Empty response': chrome.i18n.getMessage('ai_emptyResponse') || 'Empty response',
            'AI API key not configured': chrome.i18n.getMessage('ai_apiKeyNotConfigured') || 'API key not configured',
            'Daily AI usage limit reached': chrome.i18n.getMessage('ai_dailyLimitReached') || 'Daily limit reached',
            'You have reached your daily limit': chrome.i18n.getMessage('ai_dailyLimitReached') || 'Daily limit reached. Upgrade to Premium!'
        };

        for (const [key, value] of Object.entries(errorMappings)) {
            if (errorMessage.includes(key)) {
                return value;
            }
        }

        // If no mapping found, return a generic short message
        return chrome.i18n.getMessage('ai_unknownError') || 'Unknown AI error';
    }
}

// Initialize chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    window.aiChatInterface = new AIChatInterface();

    // Load and apply theme
    if (typeof dbManager !== 'undefined') {
        try {
            const theme = await dbManager.getSetting('theme');
            if (theme) {
                applyThemeToWindow(theme);
            }
        } catch (e) {
            console.error('Error loading theme:', e);
        }
    }

    // Listen for theme changes from main app
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'themeChanged') {
            applyThemeToWindow(request.theme);
            sendResponse({ success: true });
        }
    });
});

// Function to apply theme to this window
function applyThemeToWindow(theme) {
    const isLightTheme = theme === 'light';
    document.documentElement.classList.toggle('light-theme', isLightTheme);
    document.body.classList.toggle('light-theme', isLightTheme);
}

// Expose function to allow parent window to update theme
window.applyThemeFromParent = (theme) => {
    applyThemeToWindow(theme);
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIChatInterface;
}

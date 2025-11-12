// note.js

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
            // Only preventDefault if event is cancelable
            if (e.cancelable) {
                e.preventDefault();
            }
        }
        lastTouchEnd = now;
    }, { passive: false });
})();

// Quill.js Editor Integration

// Global Quill editor instance
let quillEditor = null;

// Global undo history variables
let aiUndoHistory = [];
let aiUndoIndex = -1;
const MAX_UNDO_HISTORY = 10;

// Morph Animation Function using Anime.js
function morphAIButtonToInput(fromElement, toElement, callback) {
    if (!fromElement || !toElement || typeof anime === 'undefined') {
        console.warn('Morph animation skipped: missing elements or anime.js');
        if (callback) callback();
        return;
    }

    // Get positions and sizes
    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    // Create a clone of the floating button for animation
    const morphElement = fromElement.cloneNode(true);
    morphElement.style.position = 'fixed';
    morphElement.style.left = fromRect.left + 'px';
    morphElement.style.top = fromRect.top + 'px';
    morphElement.style.width = fromRect.width + 'px';
    morphElement.style.height = fromRect.height + 'px';
    morphElement.style.zIndex = '10000';
    morphElement.style.pointerEvents = 'none';
    morphElement.style.transition = 'none';
    morphElement.style.margin = '0';
    morphElement.style.padding = '0';
    document.body.appendChild(morphElement);

    // Hide original button
    fromElement.style.opacity = '0';

    // Create timeline for smooth animation
    const timeline = anime.timeline({
        easing: 'easeOutCubic',
        duration: 500
    });

    // Animate the morph with multiple stages
    timeline
        .add({
            targets: morphElement,
            left: toRect.left + 'px',
            top: toRect.top + 'px',
            width: toRect.width + 'px',
            height: toRect.height + 'px',
            borderRadius: ['50%', '18px'],
            opacity: [1, 0.5, 0],
            scale: [1, 1.1, 0.95],
            duration: 450,
            easing: 'easeInOutQuad'
        })
        .add({
            targets: toElement,
            scale: [0.95, 1],
            opacity: [0, 1],
            duration: 200,
            easing: 'easeOutBack',
            begin: () => {
                toElement.style.transformOrigin = 'center';
            },
            complete: () => {
                // Remove morph element
                morphElement.remove();

                // Reset original button
                fromElement.style.opacity = '';

                // Show the target element with animation
                if (callback) callback();
            }
        }, '-=100'); // Overlap animations slightly
}

// Animate text falling to toolbar button
function animateTextToToolbarButton(fromElement, toButton, selectedText, callback) {
    if (!fromElement || !toButton || typeof anime === 'undefined') {
        console.warn('Text animation skipped: missing elements or anime.js');
        if (callback) callback();
        return;
    }

    // Get positions
    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toButton.getBoundingClientRect();

    // Create text element for animation - matching indicator style
    const textElement = document.createElement('div');
    textElement.style.position = 'fixed';
    textElement.style.left = fromRect.left + 'px';
    textElement.style.top = fromRect.top + 'px';
    textElement.style.zIndex = '10000';
    textElement.style.pointerEvents = 'none';
    textElement.style.background = 'rgba(50, 50, 50, 0.7)';
    textElement.style.backdropFilter = 'blur(12px)';
    textElement.style.webkitBackdropFilter = 'blur(12px)';
    textElement.style.border = '1px solid rgba(120, 120, 120, 0.3)';
    textElement.style.color = '#e0e0e0';
    textElement.style.padding = '8px 12px';
    textElement.style.borderRadius = '8px';
    textElement.style.fontSize = '13px';
    textElement.style.fontWeight = '400';
    textElement.style.fontStyle = 'italic';
    textElement.style.maxWidth = '200px';
    textElement.style.overflow = 'hidden';
    textElement.style.textOverflow = 'ellipsis';
    textElement.style.whiteSpace = 'nowrap';
    textElement.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
    textElement.textContent = selectedText.length > 30 ? selectedText.substring(0, 30) + '...' : selectedText;
    document.body.appendChild(textElement);

    // Hide floating button
    fromElement.style.opacity = '0';

    // Animate text falling to toolbar button
    anime({
        targets: textElement,
        left: toRect.left + toRect.width / 2 - 100 + 'px',
        top: toRect.top + toRect.height / 2 - 20 + 'px',
        scale: [1, 0.3],
        opacity: [1, 0],
        duration: 500,
        easing: 'easeInCubic',
        complete: () => {
            // Remove text element
            textElement.remove();

            // Reset floating button
            fromElement.style.opacity = '';

            // Pulse effect on toolbar button
            anime({
                targets: toButton,
                scale: [1, 1.15, 1],
                duration: 300,
                easing: 'easeOutElastic(1, .5)',
                complete: () => {
                    if (callback) callback();
                }
            });
        }
    });
}

// Save current editor state to undo history
function saveToUndoHistory() {
    if (!quillEditor) return;

    const currentContent = quillEditor.root.innerHTML;
    const currentTime = Date.now();

    // Don't save if content hasn't changed
    if (aiUndoHistory.length > 0 && aiUndoHistory[aiUndoIndex]?.content === currentContent) {
        return;
    }

    // Remove any history after current index (when user makes new changes)
    aiUndoHistory = aiUndoHistory.slice(0, aiUndoIndex + 1);

    // Add new state
    aiUndoHistory.push({
        content: currentContent,
        timestamp: currentTime
    });

    // Update index
    aiUndoIndex = aiUndoHistory.length - 1;

    // Limit history size
    if (aiUndoHistory.length > MAX_UNDO_HISTORY) {
        aiUndoHistory.shift();
        aiUndoIndex--;
    }
}

// Undo last AI operation
function undoAIOperation() {
    if (!quillEditor) return;

    if (aiUndoIndex <= 0) {
        showToast(chrome.i18n.getMessage('ai_noUndoAvailable'), 'info');
        return;
    }

    aiUndoIndex--;
    const previousState = aiUndoHistory[aiUndoIndex];

    if (previousState && quillEditor) {
        quillEditor.clipboard.dangerouslyPasteHTML(previousState.content);
        markAsUnsaved();
        saveNoteWithContext('content');
        showToast(chrome.i18n.getMessage('ai_undoSuccess'), 'success');
    }
}

// Send request to AI service
async function sendToAI(action, data, streaming = false) {
    try {
        if (streaming) {
            // Use streaming API
            return await sendToAIStreaming(action, data);
        } else {
            // Map action names to service worker expected format
            const actionMap = {
                'summarize': 'aiSummarize',
                'expand': 'aiExpand',
                'improve': 'aiImprove',
                'suggestions': 'aiSuggestions',
                'outline': 'aiOutline',
                'meeting-notes': 'aiMeetingNotes',
                'action-items': 'aiActionItems',
                'chat': 'aiChat'
            };

            const mappedAction = actionMap[action] || action;

            // Send message to service worker
            const response = await chrome.runtime.sendMessage({
                action: mappedAction,
                ...data
            });

            if (response && response.success) {
                return response.result;
            } else {
                throw new Error(response?.error || chrome.i18n.getMessage('errors_aiRequestFailed') || 'AI request failed');
            }
        }
    } catch (error) {
        console.error('AI request error:', error);
        throw error;
    }
}

// Send streaming request to AI service
async function sendToAIStreaming(action, data) {
    try {
        // Get user email for authentication
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) {
            throw new Error(chrome.i18n.getMessage('errors_userNotAuthenticated') || 'User not authenticated');
        }

        // Prepare request data
        const requestData = {
            ...data,
            streaming: true
        };

        // Get backend URL
        const backendUrl = serverSelector.getServerUrl();

        // Make streaming request to backend
        const response = await fetch(`${backendUrl}/api/ai/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': userEmail
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Read the stream and return as text
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                // Decode the chunk
                const chunk = decoder.decode(value, { stream: true });
                text += chunk;
            }
        } finally {
            reader.releaseLock();
        }

        // console.log('AI stream response received:', text);
        return text;
    } catch (error) {
        console.error('Streaming AI request error:', error);
        throw error;
    }
}

// Get current user email
async function getCurrentUserEmail() {
    try {
        const userEmail = await dbManager.getSetting('userEmail');
        return userEmail || null;
    } catch (error) {
        console.error('Error getting user email:', error);
        return null;
    }
}

// Global helper functions - Using new toast system from toast-system.js
// Functions showToast, showErrorToast, showSuccessToast are defined in toast-system.js
// No need to redefine them here

function markAsUnsaved() {
    // This will be defined in DOMContentLoaded
    if (window.markAsUnsaved) {
        window.markAsUnsaved();
    } else {
        console.warn('markAsUnsaved not available yet');
    }
}

function saveNoteWithContext(type = 'content') {
    // This will be defined in DOMContentLoaded
    if (window.saveNoteWithContext) {
        window.saveNoteWithContext(type);
    } else {
        console.warn('saveNoteWithContext not available yet');
    }
}

function applyShimmerEffect(action, range) {
    // Show Lottie animation in center of screen
    showAILottieAnimation();
}



function removeShimmerEffect() {
    // Hide Lottie animation
    hideAILottieAnimation();
}

// AI Lottie Animation Functions - Unified for all AI features
let aiLottieAnimation = null;

function showAILottieAnimation() {
    const container = document.getElementById('ai-lottie-container');
    const animationDiv = document.getElementById('ai-lottie-animation');

    if (!container || !animationDiv) {
        console.error('AI Lottie container not found');
        return;
    }

    // Destroy previous animation if exists
    if (aiLottieAnimation) {
        aiLottieAnimation.destroy();
        aiLottieAnimation = null;
    }

    // Clear animation div
    animationDiv.innerHTML = '';

    // Show overlay
    const overlay = document.getElementById('ai-overlay');
    if (overlay) {
        overlay.style.display = 'block';
    }

    // Disable editor to prevent user interaction
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(false);
    }

    // Show container
    container.style.display = 'flex';

    // Load and play Lottie animation
    if (typeof lottie !== 'undefined') {
        aiLottieAnimation = lottie.loadAnimation({
            container: animationDiv,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '../libs/Star Loader.json'
        });
    } else {
        console.error('Lottie library not loaded');
    }
}

function hideAILottieAnimation() {
    const container = document.getElementById('ai-lottie-container');
    const overlay = document.getElementById('ai-overlay');

    if (container) {
        container.style.display = 'none';
    }

    if (overlay) {
        overlay.style.display = 'none';
    }

    // Re-enable editor
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(true);
    }

    // Destroy animation to free memory
    if (aiLottieAnimation) {
        aiLottieAnimation.destroy();
        aiLottieAnimation = null;
    }
}

// OCR specific functions with Document OCR Scan animation
function showOCRLottieAnimation() {
    const container = document.getElementById('ai-lottie-container');
    const overlay = document.getElementById('ai-overlay');
    const animationDiv = document.getElementById('ai-lottie-animation');

    if (!container || !animationDiv) {
        console.error('AI Lottie container or animation div not found');
        return;
    }

    // Show overlay
    if (overlay) {
        overlay.style.display = 'block';
    }

    // Disable editor
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(false);
    }

    // Clear previous animation
    animationDiv.innerHTML = '';

    // Show container
    container.style.display = 'flex';

    // Load and play Document OCR Scan animation
    if (typeof lottie !== 'undefined') {
        aiLottieAnimation = lottie.loadAnimation({
            container: animationDiv,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '../libs/Document OCR Scan.json'
        });
    } else {
        console.error('Lottie library not loaded');
    }
}

function hideOCRLottieAnimation() {
    const container = document.getElementById('ai-lottie-container');
    const overlay = document.getElementById('ai-overlay');

    if (container) {
        container.style.display = 'none';
    }

    if (overlay) {
        overlay.style.display = 'none';
    }

    // Re-enable editor
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(true);
    }

    // Destroy animation to free memory
    if (aiLottieAnimation) {
        aiLottieAnimation.destroy();
        aiLottieAnimation = null;
    }
}

// AI Tone specific loading animation with Money (smaller size)
let aiToneLottieAnimation = null;

function showAIToneLoading() {
    const container = document.getElementById('ai-tone-lottie-container');
    const animationDiv = document.getElementById('ai-tone-lottie-animation');

    if (!container || !animationDiv) {
        console.error('AI Tone Lottie container not found');
        return;
    }

    // Destroy previous animation if exists
    if (aiToneLottieAnimation) {
        aiToneLottieAnimation.destroy();
        aiToneLottieAnimation = null;
    }

    // Clear animation div
    animationDiv.innerHTML = '';

    // Show overlay
    const overlay = document.getElementById('ai-overlay');
    if (overlay) {
        overlay.style.display = 'block';
    }

    // Disable editor to prevent user interaction
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(false);
    }

    // Show container
    container.style.display = 'flex';

    // Load and play Star Loader animation for AI Tone
    if (typeof lottie !== 'undefined') {
        aiToneLottieAnimation = lottie.loadAnimation({
            container: animationDiv,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '../libs/Star Loader.json'
        });
    } else {
        console.error('Lottie library not loaded');
    }
}

function hideAIToneLoading() {
    const container = document.getElementById('ai-tone-lottie-container');
    const overlay = document.getElementById('ai-overlay');

    if (container) {
        container.style.display = 'none';
    }

    if (overlay) {
        overlay.style.display = 'none';
    }

    // Re-enable editor
    if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.enable(true);
    }

    // Destroy animation to free memory
    if (aiToneLottieAnimation) {
        aiToneLottieAnimation.destroy();
        aiToneLottieAnimation = null;
    }
}

async function streamTextToEditor(streamResponse, selection) {
    if (!quillEditor) {
        return;
    }

    if (!selection) {
        return;
    }

    try {
        // Hide loading dots when starting to stream
        removeShimmerEffect();

        // Delete the old text first
        // console.log('Deleting old text at index:', selection.index, 'length:', selection.length);
        quillEditor.deleteText(selection.index, selection.length);

        // Check if streamResponse is already text or a Response object
        let text = '';
        if (typeof streamResponse === 'string') {
            text = streamResponse;
        } else if (streamResponse && typeof streamResponse.text === 'function') {
            text = await streamResponse.text();
        } else if (typeof streamResponse === 'object') {
            // Handle object responses (e.g., from AI tone)
            if (streamResponse.result && streamResponse.result.transformedText) {
                text = streamResponse.result.transformedText;
            } else if (streamResponse.transformedText) {
                text = streamResponse.transformedText;
            } else if (streamResponse.result && typeof streamResponse.result === 'string') {
                text = streamResponse.result;
            } else {
                console.error('Cannot extract text from object:', streamResponse);
                quillEditor.insertText(selection.index, chrome.i18n.getMessage('ai_responseReceived') || 'AI response received', 'user');
                return;
            }
        } else {
            console.error('Invalid stream response type:', typeof streamResponse);
            quillEditor.insertText(selection.index, chrome.i18n.getMessage('ai_responseReceived') || 'AI response received', 'user');
            return;
        }

        // Check if text contains markdown checklist
        const hasChecklist = /^- \[ \]/m.test(text);

        if (hasChecklist) {
            // Handle checklist format
            const lines = text.split('\n');
            let currentIndex = selection.index;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if line is a checklist item
                if (/^- \[ \]/.test(line)) {
                    // Extract task text
                    const taskText = line.replace(/^- \[ \]\s*/, '');

                    // Insert task text
                    quillEditor.insertText(currentIndex, taskText, 'user');
                    currentIndex += taskText.length;

                    // Apply checklist format to the line
                    quillEditor.formatLine(currentIndex - taskText.length, taskText.length, 'list', 'unchecked');

                    // Add newline if not last line
                    if (i < lines.length - 1) {
                        quillEditor.insertText(currentIndex, '\n', 'user');
                        currentIndex += 1;
                    }
                } else if (/^- \[x\]/.test(line)) {
                    // Handle checked items
                    const taskText = line.replace(/^- \[x\]\s*/, '');

                    quillEditor.insertText(currentIndex, taskText, 'user');
                    currentIndex += taskText.length;

                    quillEditor.formatLine(currentIndex - taskText.length, taskText.length, 'list', 'checked');

                    if (i < lines.length - 1) {
                        quillEditor.insertText(currentIndex, '\n', 'user');
                        currentIndex += 1;
                    }
                } else if (line.trim()) {
                    // Regular line
                    quillEditor.insertText(currentIndex, line, 'user');
                    currentIndex += line.length;

                    if (i < lines.length - 1) {
                        quillEditor.insertText(currentIndex, '\n', 'user');
                        currentIndex += 1;
                    }
                }

                // Add small delay for streaming effect
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        } else {
            // Use MarkdownProcessor for consistent handling
            if (window.MarkdownProcessor && window.MarkdownProcessor.insertIntoQuill) {
                try {
                    window.MarkdownProcessor.insertIntoQuill(quillEditor, text, selection.index);
                } catch (error) {
                    console.error('[Stream] Error with MarkdownProcessor:', error);
                    // Fallback: plain text
                    quillEditor.insertText(selection.index, text, 'user');
                }
            } else {
                console.warn('[Stream] MarkdownProcessor not available, using plain text');
                quillEditor.insertText(selection.index, text, 'user');
            }
        }

    } catch (error) {
        console.error('Error in streamTextToEditor:', error);
        // Fallback: just insert text directly
        try {
            const text = typeof streamResponse === 'string' ? streamResponse : (chrome.i18n.getMessage('ai_responseReceived') || 'AI response received');
            quillEditor.insertText(selection.index, text, 'user');
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
    }
}

// OCR-specific streaming function
async function streamOCRResultToEditor(streamResponse, selection) {
    if (!quillEditor) {
        return;
    }

    if (!selection) {
        return;
    }

    try {
        // Add line break before code block
        quillEditor.insertText(selection.index, '\n');
        let currentIndex = selection.index + 1;

        // Read the streaming response
        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                // Decode the chunk
                const chunk = decoder.decode(value, { stream: true });

                // Stream the chunk word by word with code-block format
                const words = chunk.split(' ');
                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    if (word.trim() || word === ' ') {
                        // Insert word at current position with code-block format
                        const wordToInsert = word + (i < words.length - 1 ? ' ' : '');
                        quillEditor.insertText(currentIndex, wordToInsert);
                        quillEditor.formatText(currentIndex, wordToInsert.length, 'code-block', true);

                        // Update current position for next word
                        currentIndex += wordToInsert.length;

                        // Add small delay for streaming effect
                        if (word.trim()) {
                            await new Promise(resolve => setTimeout(resolve, 30));
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Add an extra newline inside code block to ensure last line is included
        quillEditor.insertText(currentIndex, '\n');
        quillEditor.formatText(currentIndex, 1, 'code-block', true);
        currentIndex += 1;

        // Add line break after code block
        quillEditor.insertText(currentIndex, '\n');

        // Mark as unsaved and save
        markAsUnsaved();
        saveNoteWithContext('content');

    } catch (error) {
        console.error('Error in streamOCRResultToEditor:', error);
        // Fallback: just insert text directly in code block
        try {
            const text = typeof streamResponse === 'string' ? streamResponse : (chrome.i18n.getMessage('ai_ocrResultReceived') || 'OCR result received');
            quillEditor.insertText(selection.index, '\n' + text + '\n');
            quillEditor.formatText(selection.index + 1, text.length, 'code-block', true);
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
    }
}

function replaceSelectedText(newText) {
    if (!quillEditor) return;

    const range = quillEditor.getSelection();
    if (range) {
        quillEditor.deleteText(range.index, range.length);
        quillEditor.insertText(range.index, newText, 'user');
    }
}

function appendTextToEditor(text) {
    if (quillEditor) {
        const length = quillEditor.getLength();
        quillEditor.insertText(length - 1, text, 'user');
        return true;
    }
    return false;
}

function createFormattedText(text, color, emoji) {
    // Create a span with the specified color and emoji
    const span = document.createElement('span');
    span.style.color = color;
    span.style.fontWeight = '500';
    span.innerHTML = text;

    // Add emoji at the beginning if not already present
    if (emoji && !text.includes(emoji)) {
        span.innerHTML = emoji + ' ' + text;
    }

    return span.outerHTML;
}

function createAdvancedFormattedText(text, mainColor, emoji, colorSegments) {
    // If no color segments provided, use simple formatting
    if (!colorSegments || colorSegments.length === 0) {
        return createFormattedText(text, mainColor, emoji);
    }

    // Create a container div
    const container = document.createElement('div');
    container.style.lineHeight = '1.6';
    container.style.fontSize = '14px';
    container.style.padding = '8px';
    container.style.fontFamily = 'inherit';

    // Process each color segment
    colorSegments.forEach((segment, index) => {
        // Create a paragraph for each segment
        const paragraph = document.createElement('p');
        paragraph.style.margin = '0 0 8px 0';
        paragraph.style.padding = '0';

        const span = document.createElement('span');
        span.style.color = segment.color || mainColor;
        span.style.fontWeight = segment.style === 'bold' ? 'bold' : 'normal';
        span.style.fontStyle = segment.style === 'italic' ? 'italic' : 'normal';
        span.style.textDecoration = segment.style === 'underline' ? 'underline' : 'none';
        span.style.fontSize = 'inherit';
        span.innerHTML = segment.text;

        paragraph.appendChild(span);
        container.appendChild(paragraph);
    });

    return container.outerHTML;
}

function replaceSelectedTextWithHTML(htmlContent) {
    if (!quillEditor) return;

    const range = quillEditor.getSelection();
    if (range) {
        quillEditor.deleteText(range.index, range.length);
        quillEditor.clipboard.dangerouslyPasteHTML(range.index, htmlContent, 'user');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize translation system
    // Chrome i18n is automatically initialized
    // DOM Elements
    const noteContainer = document.querySelector('.note-container');
    const topBar = document.querySelector('.top-bar');
    const addNewBtn = document.getElementById('add-new-btn');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const viewAllNotesBtn = document.getElementById('view-all-notes-btn');
    const colorPaletteContainer = document.getElementById('color-palette');
    const insertImageBtn = document.querySelector('[data-command="image"]');
    const imageInput = document.getElementById('image-input');
    let editor = document.getElementById('editor');
    const toolbar = document.querySelector('.toolbar');
    const toolbarContainer = document.querySelector('.toolbar-container');

    // Variables for AI functionality
    let savedSelection = null;

    // Debug: Check if elements exist
    // console.log('editor:', editor);
    // console.log('toolbar:', toolbar);
    // console.log('toolbarContainer:', toolbarContainer);

    // Check if editor is contenteditable
    if (editor) {
        // console.log('Editor contentEditable:', editor.contentEditable);
        // console.log('Editor isContentEditable:', editor.isContentEditable);
    }
    const aiAssistantBtn = document.getElementById('ai-assistant-btn');
    // console.log('AI Assistant Button:', aiAssistantBtn);
    const backgroundBtn = document.getElementById('background-btn');
    const backgroundPickerModal = document.getElementById('background-picker-modal');
    const aiInputBar = document.getElementById('ai-input-bar');
    const aiInput = document.getElementById('ai-input');
    const aiSubmitBtn = document.getElementById('ai-submit-btn');
    const aiGradientWrapper = document.querySelector('.ai-gradient-wrapper');
    const aiResultDisplay = document.getElementById('ai-result-display');
    const aiResultText = document.getElementById('ai-result-text');
    const aiInputArea = document.getElementById('ai-input-area');
    const aiInputContainer = document.querySelector('.ai-input-container');
    const aiResultInsert = document.getElementById('ai-result-insert');
    const aiResultCopy = document.getElementById('ai-result-copy');

    // AI Result Area Elements - Only AI response
    const aiResultArea = document.getElementById('ai-result-area');
    const aiAiMessage = document.getElementById('ai-ai-message');
    const aiResultActions = document.querySelector('.ai-result-actions');
    const aiCopyResultBtn = document.getElementById('ai-copy-result');
    const aiApplyResultBtn = document.getElementById('ai-apply-result');
    const aiCloseResultBtn = document.getElementById('ai-close-result');

    let saveTimeout;
    let hasUnsavedChanges = false;
    let originalContent = '';
    let lastSaveType = 'content';
    let isUserTyping = false; // Track if user is actually typing



    const urlParams = new URLSearchParams(window.location.search);
    let noteId = urlParams.get('id');

    // Function to update current noteId (used by tabs)
    window.updateCurrentNoteId = (newNoteId) => {
        noteId = newNoteId;
        console.log('[Note] Updated current noteId to:', noteId);
    };

    const NOTE_COLORS = ['#8b9dc3', '#a8c8a8', '#d4a5a5', '#b8a9c9', '#a5b8d4', '#c9a8a8'];
    let currentNoteColor = NOTE_COLORS[0];
    let currentBackground = 'none';



    // Dynamic backgrounds - only show available images
    const BACKGROUND_OPTIONS = [
        { id: 'none', name: 'None', image: null, isPremium: false, category: 'basic' },
        { id: 'cage', name: 'Cage', image: '../img/cage.svg', isPremium: false, category: 'geometric' },

        // Christmas backgrounds
        { id: 'christmas-tree-star', name: 'Christmas Tree Star', image: '../img/christmas-tree-with-star-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-tree-balls-star', name: 'Christmas Tree Balls Star', image: '../img/christmas-tree-with-balls-and-a-star-on-top-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-tree-dots', name: 'Christmas Tree Dots', image: '../img/christmas-tree-with-dots-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-tree-drawing', name: 'Christmas Tree Drawing', image: '../img/christmas-tree-drawing-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-wreath', name: 'Christmas Wreath', image: '../img/christmas-wreath-wreath-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-baubles', name: 'Christmas Baubles', image: '../img/christmas-baubles-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-bell', name: 'Christmas Bell', image: '../img/christmas-bell-ornament-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-snowflake', name: 'Christmas Snowflake', image: '../img/christmas-snow-flake-winter-cold-christmas-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-socks', name: 'Christmas Socks', image: '../img/christmas-socks-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'christmas-sock', name: 'Christmas Sock', image: '../img/christmas-sock-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'candy-cane', name: 'Candy Cane', image: '../img/candy-cane-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'mistletoe', name: 'Mistletoe', image: '../img/mistletoe-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'mistletoe-alt', name: 'Mistletoe Alt', image: '../img/mistletoe-svgrepo-com (1).svg', isPremium: true, category: 'christmas' },
        { id: 'ribbon', name: 'Ribbon', image: '../img/ribbon-svgrepo-com.svg', isPremium: true, category: 'christmas' },
        { id: 'ice-skate', name: 'Ice Skate', image: '../img/ice-skate-svgrepo-com.svg', isPremium: true, category: 'christmas' },

        // Geometric patterns
        { id: '4-point-stars', name: '4 Point Stars', image: '../img/4-point-stars.svg', isPremium: true, category: 'geometric' },
        { id: 'architect', name: 'Architect', image: '../img/architect.svg', isPremium: true, category: 'geometric' },
        { id: 'aztec', name: 'Aztec', image: '../img/aztec.svg', isPremium: true, category: 'geometric' },
        { id: 'bevel-circle', name: 'Bevel Circle', image: '../img/bevel-circle.svg', isPremium: true, category: 'geometric' },
        { id: 'boxes', name: 'Boxes', image: '../img/boxes.svg', isPremium: true, category: 'geometric' },
        { id: 'charlie-brown', name: 'Charlie Brown', image: '../img/charlie-brown.svg', isPremium: true, category: 'geometric' },
        { id: 'circles-and-squares', name: 'Circles And Squares', image: '../img/circles-and-squares.svg', isPremium: true, category: 'geometric' },
        { id: 'cutout', name: 'Cutout', image: '../img/cutout.svg', isPremium: true, category: 'geometric' },
        { id: 'death-star', name: 'Death Star', image: '../img/death-star.svg', isPremium: true, category: 'geometric' },
        { id: 'diagonal-lines', name: 'Diagonal Lines', image: '../img/diagonal-lines.svg', isPremium: true, category: 'geometric' },
        { id: 'diagonal-stripes', name: 'Diagonal Stripes', image: '../img/diagonal-stripes.svg', isPremium: true, category: 'geometric' },
        { id: 'dominos', name: 'Dominos', image: '../img/dominos.svg', isPremium: true, category: 'geometric' },
        { id: 'flipped-diamonds', name: 'Flipped Diamonds', image: '../img/flipped-diamonds.svg', isPremium: true, category: 'geometric' },
        { id: 'floor-tile', name: 'Floor Tile', image: '../img/floor-tile.svg', isPremium: true, category: 'geometric' },
        { id: 'formal-invitation', name: 'Formal Invitation', image: '../img/formal-invitation.svg', isPremium: true, category: 'geometric' },
        { id: 'glamorous', name: 'Glamorous', image: '../img/glamorous.svg', isPremium: true, category: 'geometric' },
        { id: 'graph-paper', name: 'Graph Paper', image: '../img/graph-paper.svg', isPremium: true, category: 'geometric' },
        { id: 'happy-intersection', name: 'Happy Intersection', image: '../img/happy-intersection.svg', isPremium: true, category: 'geometric' },
        { id: 'hexagons', name: 'Hexagons', image: '../img/hexagons.svg', isPremium: true, category: 'geometric' },
        { id: 'hideout', name: 'Hideout', image: '../img/hideout.svg', isPremium: true, category: 'geometric' },
        { id: 'houndstooth', name: 'Houndstooth', image: '../img/houndstooth.svg', isPremium: true, category: 'geometric' },
        { id: 'intersecting-circles', name: 'Intersecting Circles', image: '../img/intersecting-circles.svg', isPremium: true, category: 'geometric' },
        { id: 'jigsaw', name: 'Jigsaw', image: '../img/jigsaw.svg', isPremium: true, category: 'geometric' },
        { id: 'morphing-diamonds', name: 'Morphing Diamonds', image: '../img/morphing-diamonds.svg', isPremium: true, category: 'geometric' },
        { id: 'overlapping-circles', name: 'Overlapping Circles', image: '../img/overlapping-circles.svg', isPremium: true, category: 'geometric' },
        { id: 'overlapping-diamonds', name: 'Overlapping Diamonds', image: '../img/overlapping-diamonds.svg', isPremium: true, category: 'geometric' },
        { id: 'overlapping-hexagons', name: 'Overlapping Hexagons', image: '../img/overlapping-hexagons.svg', isPremium: true, category: 'geometric' },
        { id: 'parkay-floor', name: 'Parkay Floor', image: '../img/parkay-floor.svg', isPremium: true, category: 'geometric' },
        { id: 'pie-factory', name: 'Pie Factory', image: '../img/pie-factory.svg', isPremium: true, category: 'geometric' },
        { id: 'pixel-dots', name: 'Pixel Dots', image: '../img/pixel-dots.svg', isPremium: true, category: 'geometric' },
        { id: 'plus', name: 'Plus', image: '../img/plus.svg', isPremium: true, category: 'geometric' },
        { id: 'polka-dots', name: 'Polka Dots', image: '../img/polka-dots.svg', isPremium: true, category: 'geometric' },
        { id: 'rounded-plus-connected', name: 'Rounded Plus Connected', image: '../img/rounded-plus-connected.svg', isPremium: true, category: 'geometric' },
        { id: 'slanted-stars', name: 'Slanted Stars', image: '../img/slanted-stars.svg', isPremium: true, category: 'geometric' },
        { id: 'squares-in-squares', name: 'Squares In Squares', image: '../img/squares-in-squares.svg', isPremium: true, category: 'geometric' },
        { id: 'squares', name: 'Squares', image: '../img/squares.svg', isPremium: true, category: 'geometric' },
        { id: 'stamp-collection', name: 'Stamp Collection', image: '../img/stamp-collection.svg', isPremium: true, category: 'geometric' },
        { id: 'stripes', name: 'Stripes', image: '../img/stripes.svg', isPremium: true, category: 'geometric' },
        { id: 'tic-tac-toe', name: 'Tic Tac Toe', image: '../img/tic-tac-toe.svg', isPremium: true, category: 'geometric' },
        { id: 'tiny-checkers', name: 'Tiny Checkers', image: '../img/tiny-checkers.svg', isPremium: true, category: 'geometric' },
        { id: 'x-equals', name: 'X Equals', image: '../img/x-equals.svg', isPremium: true, category: 'geometric' },
        { id: 'zig-zag', name: 'Zig Zag', image: '../img/zig-zag.svg', isPremium: true, category: 'geometric' },

        // Nature & Organic
        { id: 'autumn', name: 'Autumn', image: '../img/autumn.svg', isPremium: true, category: 'nature' },
        { id: 'bamboo', name: 'Bamboo', image: '../img/bamboo.svg', isPremium: true, category: 'nature' },
        { id: 'bubbles', name: 'Bubbles', image: '../img/bubbles.svg', isPremium: true, category: 'nature' },
        { id: 'endless-clouds', name: 'Endless Clouds', image: '../img/endless-clouds.svg', isPremium: true, category: 'nature' },
        { id: 'falling-triangles', name: 'Falling Triangles', image: '../img/falling-triangles.svg', isPremium: true, category: 'nature' },
        { id: 'heavy-rain', name: 'Heavy Rain', image: '../img/heavy-rain.svg', isPremium: true, category: 'nature' },
        { id: 'kiwi', name: 'Kiwi', image: '../img/kiwi.svg', isPremium: true, category: 'nature' },
        { id: 'leaf', name: 'Leaf', image: '../img/leaf.svg', isPremium: true, category: 'nature' },
        { id: 'overcast', name: 'Overcast', image: '../img/overcast.svg', isPremium: true, category: 'nature' },
        { id: 'rain', name: 'Rain', image: '../img/rain.svg', isPremium: true, category: 'nature' },
        { id: 'topography', name: 'Topography', image: '../img/topography.svg', isPremium: true, category: 'nature' },

        // Abstract & Artistic
        { id: 'anchors-away', name: 'Anchors Away', image: '../img/anchors-away.svg', isPremium: true, category: 'abstract' },
        { id: 'bank-note', name: 'Bank Note', image: '../img/bank-note.svg', isPremium: true, category: 'abstract' },
        { id: 'brick-wall', name: 'Brick Wall', image: '../img/brick-wall.svg', isPremium: true, category: 'abstract' },
        { id: 'church-on-sunday', name: 'Church On Sunday', image: '../img/church-on-sunday.svg', isPremium: true, category: 'abstract' },
        { id: 'circuit-board', name: 'Circuit Board', image: '../img/circuit-board.svg', isPremium: true, category: 'abstract' },
        { id: 'connections', name: 'Connections', image: '../img/connections.svg', isPremium: true, category: 'abstract' },
        { id: 'cork-screw', name: 'Cork Screw', image: '../img/cork-screw.svg', isPremium: true, category: 'abstract' },
        { id: 'current', name: 'Current', image: '../img/current.svg', isPremium: true, category: 'abstract' },
        { id: 'curtain', name: 'Curtain', image: '../img/curtain.svg', isPremium: true, category: 'abstract' },
        { id: 'eyes', name: 'Eyes', image: '../img/eyes.svg', isPremium: true, category: 'abstract' },
        { id: 'fancy-rectangles', name: 'Fancy Rectangles', image: '../img/fancy-rectangles.svg', isPremium: true, category: 'abstract' },
        { id: 'floating-cogs', name: 'Floating Cogs', image: '../img/floating-cogs.svg', isPremium: true, category: 'abstract' },
        { id: 'groovy', name: 'Groovy', image: '../img/groovy.svg', isPremium: true, category: 'abstract' },
        { id: 'i-like-food', name: 'I Like Food', image: '../img/i-like-food.svg', isPremium: true, category: 'abstract' },
        { id: 'jupiter', name: 'Jupiter', image: '../img/jupiter.svg', isPremium: true, category: 'abstract' },
        { id: 'line-in-motion', name: 'Line In Motion', image: '../img/line-in-motion.svg', isPremium: true, category: 'abstract' },
        { id: 'lips', name: 'Lips', image: '../img/lips.svg', isPremium: true, category: 'abstract' },
        { id: 'lisbon', name: 'Lisbon', image: '../img/lisbon.svg', isPremium: true, category: 'abstract' },
        { id: 'melt', name: 'Melt', image: '../img/melt.svg', isPremium: true, category: 'abstract' },
        { id: 'moroccan', name: 'Moroccan', image: '../img/moroccan.svg', isPremium: true, category: 'abstract' },
        { id: 'piano-man', name: 'Piano Man', image: '../img/piano-man.svg', isPremium: true, category: 'abstract' },
        { id: 'rails', name: 'Rails', image: '../img/rails.svg', isPremium: true, category: 'abstract' },
        { id: 'random-shapes', name: 'Random Shapes', image: '../img/random-shapes.svg', isPremium: true, category: 'abstract' },
        { id: 'signal', name: 'Signal', image: '../img/signal.svg', isPremium: true, category: 'abstract' },
        { id: 'skulls', name: 'Skulls', image: '../img/skulls.svg', isPremium: true, category: 'abstract' },
        { id: 'steel-beams', name: 'Steel Beams', image: '../img/steel-beams.svg', isPremium: true, category: 'abstract' },
        { id: 'temple', name: 'Temple', image: '../img/temple.svg', isPremium: true, category: 'abstract' },
        { id: 'texture', name: 'Texture', image: '../img/texture.svg', isPremium: true, category: 'abstract' },
        { id: 'volcano-lamp', name: 'Volcano Lamp', image: '../img/volcano-lamp.svg', isPremium: true, category: 'abstract' },
        { id: 'wallpaper', name: 'Wallpaper', image: '../img/wallpaper.svg', isPremium: true, category: 'abstract' },
        { id: 'wiggle', name: 'Wiggle', image: '../img/wiggle.svg', isPremium: true, category: 'abstract' }
    ];


    // Smart debouncing configuration
    const SAVE_DELAYS = {
        content: 5000,      // 5 seconds for text content only
        formatting: 0,      // No toast for formatting changes
        position: 0         // Immediate for position/size changes
    };


    if (!noteId) {
        // Silently close if no ID is provided.
        window.close();
        return;
    }

    const applyTheme = (theme) => {
        const isLightTheme = theme === 'light';

        // Apply theme class to body
        document.body.classList.toggle('light-theme', isLightTheme);

        // FORCE UPDATE QUILL EDITOR THEME
        if (quillEditor && quillEditor.root) {
            const editorColor = isLightTheme ? '#202124' : '#e8eaed';

            // Force update editor text color
            quillEditor.root.style.color = editorColor;

            // Force reflow to apply changes immediately
            quillEditor.root.offsetHeight;
        }

        // FORCE UPDATE NOTE CONTAINER
        const noteContainer = document.querySelector('.note-container');
        if (noteContainer) {
            // Update background based on theme
            if (currentBackground && currentBackground !== 'none') {
                // Create a completely new background style
                const newBackgroundStyle = generateBackgroundStyle(currentBackground, currentNoteColor);
                const themeBackground = isLightTheme ? '#f1f3f4' : '#202124';

                // Clear and set again with new value
                noteContainer.style.background = '';
                noteContainer.offsetHeight; // Force reflow
                noteContainer.style.background = `${newBackgroundStyle}, ${themeBackground}`;
                // Set size, position, repeat for all 4 layers + theme background (5 layers total)
                noteContainer.style.backgroundSize = 'auto, auto, auto, cover, auto';
                noteContainer.style.backgroundPosition = 'center, center, center, center, center';
                noteContainer.style.backgroundRepeat = 'no-repeat, no-repeat, no-repeat, no-repeat, repeat';
            } else {
                // No custom background, just apply theme color
                noteContainer.style.background = '';
                noteContainer.offsetHeight; // Force reflow
            }

            // Update text color
            noteContainer.style.color = isLightTheme ? '#202124' : '#e8eaed';
        }

        // FORCE UPDATE TOOLBAR
        const toolbarContainer = document.querySelector('.toolbar-container');
        if (toolbarContainer) {
            // Force reflow to apply CSS changes
            toolbarContainer.offsetHeight;
        }

        // FORCE UPDATE TOP BAR
        const topBar = document.querySelector('.top-bar');
        if (topBar) {
            // Force reflow to apply CSS changes
            topBar.offsetHeight;
        }

        // FORCE UPDATE ALL TOOLBAR BUTTONS ICONS
        const toolbarButtons = document.querySelectorAll('.toolbar button img, .top-bar-btn img');
        toolbarButtons.forEach(img => {
            // Force reflow on each icon
            img.offsetHeight;
        });

        // Force a complete repaint of the entire document
        document.body.offsetHeight;
    };

    // Detect system theme preference
    const detectSystemTheme = () => {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    };

    const loadAndApplyTheme = async () => {
        let theme = await dbManager.getSetting('theme');
        let themeToApply;

        if (theme) {
            // User has previously chosen a theme, use their preference
            themeToApply = theme;
        } else {
            // First time opening app, use system theme
            themeToApply = detectSystemTheme();
            // Save the system theme as default
            await dbManager.saveSetting('theme', themeToApply);
        }

        applyTheme(themeToApply);
    };

    // Expose function to allow parent window to update theme
    window.applyThemeFromParent = (theme) => {
        applyTheme(theme);
    };

    const updateNoteAppearance = (color) => {
        // Apply color with glassmorphism effect
        if (color) {
            // Convert hex to rgba with transparency for glass effect
            const hex = color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // Check if light theme is active
            const isLightTheme = document.body.classList.contains('light-theme');
            const opacity = isLightTheme ? 0.75 : 0.8; // Increased opacity to 80%
            const borderOpacity = isLightTheme ? 0.65 : 0.75;
            const shadowOpacity = isLightTheme ? 0.18 : 0.25;

            // Apply colored glass effect
            topBar.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            topBar.style.borderBottomColor = `rgba(${r}, ${g}, ${b}, ${borderOpacity})`;
            topBar.style.boxShadow = `0 8px 32px rgba(${r}, ${g}, ${b}, ${shadowOpacity}),
                                      0 0 0 1px rgba(${r}, ${g}, ${b}, ${shadowOpacity}),
                                      inset 0 1px 0 rgba(255, 255, 255, ${isLightTheme ? 0.2 : 0.1})`;

            // Update text selection color based on note color (lighter and softer)
            const selectionOpacity = isLightTheme ? 0.25 : 0.35; // Lower opacity for selection
            const selectionColor = `rgba(${r}, ${g}, ${b}, ${selectionOpacity})`;

            // Set CSS custom properties for text selection
            document.documentElement.style.setProperty('--note-selection-color', selectionColor);
            document.documentElement.style.setProperty('--note-selection-color-light', selectionColor);

            // Set AI button colors to match note color
            const accentColor = `rgb(${r}, ${g}, ${b})`;
            const accentHover = `rgba(${r}, ${g}, ${b}, 0.8)`;
            document.documentElement.style.setProperty('--note-accent-color', accentColor);
            document.documentElement.style.setProperty('--note-accent-hover', accentHover);

            // Store color for consistency with main app
            currentNoteColor = color;
        }
    };

    const initializeColorPalette = () => {
        colorPaletteContainer.innerHTML = '';
        NOTE_COLORS.forEach(color => {
            const colorDot = document.createElement('div');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = color;
            colorDot.dataset.color = color;
            colorDot.classList.toggle('selected', color === currentNoteColor);

            colorDot.addEventListener('click', (e) => {
                e.stopPropagation();
                handleColorChange(color);
            });
            colorPaletteContainer.appendChild(colorDot);
        });
    };


    const handleColorChange = (newColor) => {
        if (newColor === currentNoteColor) return;
        currentNoteColor = newColor;
        updateNoteAppearance(newColor);

        colorPaletteContainer.querySelectorAll('.color-dot').forEach(dot => {
            dot.classList.toggle('selected', dot.dataset.color === newColor);
        });

        // Update background if one is selected
        if (currentBackground && currentBackground !== 'none') {
            applyBackgroundToNote(currentBackground);
        }

        // Update background picker previews
        updateBackgroundPickerPreviews();

        // Get current noteId from tabs if tabs are active
        const currentNoteId = window.tabsManager && window.tabsManager.getCurrentNoteId ? 
            window.tabsManager.getCurrentNoteId() : noteId;

        // Update tab color if tabs manager is active
        if (window.tabsManager && window.tabsManager.updateTabColor) {
            window.tabsManager.updateTabColor(currentNoteId, newColor);
        }

        const dataToUpdate = { color: newColor };
        chrome.runtime.sendMessage({ action: "updateNoteData", noteId: currentNoteId, data: dataToUpdate });
    };



    // Function to hide all pickers
    const hideAllPickers = () => {
        hideBackgroundPicker();
    };

    // Helper function to apply highlight with better readability
    const applyHighlightToSelection = (color) => {
        // Implementation pending
    };


    // Font Size Functions


    // Function to convert hex color to rgba with opacity
    const hexToRgba = (hex, opacity) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // Function to generate background style based on note color - Using images instead of patterns
    const generateBackgroundStyle = (backgroundId, noteColor) => {
        if (backgroundId === 'none') {
            return 'transparent';
        }

        const backgroundOption = BACKGROUND_OPTIONS.find(bg => bg.id === backgroundId);
        if (!backgroundOption || !backgroundOption.image) {
            return 'transparent';
        }

        // Phân biệt custom background (ảnh người dùng tải lên) và default background (SVG pattern)
        const isCustomBackground = backgroundOption.isCustom === true;

        // Detect current theme
        const isLightTheme = document.body.classList.contains('light-theme');

        // Use image as background with appropriate overlay for each theme
        const hex = noteColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        let overlayColor, colorOverlay, imageOpacityLayer;

        if (isCustomBackground) {
            // CUSTOM BACKGROUND (ảnh người dùng): Overlay nhẹ
            if (isLightTheme) {
                overlayColor = `rgba(255, 255, 255, 0.3)`; // White 30% (giảm 10% từ 40%)
                colorOverlay = `rgba(${r}, ${g}, ${b}, 0.1)`; // Color rất nhẹ 10%
            } else {
                overlayColor = `rgba(0, 0, 0, 0.4)`; // Black 40% để làm tối vừa phải
                colorOverlay = `rgba(${r}, ${g}, ${b}, 0.1)`; // Color rất nhẹ 10%
            }
            // Opacity nhẹ hơn cho ảnh người dùng (30% opacity layer = 70% visible)
            imageOpacityLayer = `linear-gradient(135deg, rgba(128, 128, 128, 0.3), rgba(128, 128, 128, 0.3))`;
        } else {
            // DEFAULT BACKGROUND (SVG pattern): Overlay mạnh hơn cho pattern
            if (isLightTheme) {
                overlayColor = `rgba(255, 255, 255, 0.75)`; // White 75% để làm sáng
                colorOverlay = `rgba(${r}, ${g}, ${b}, 0.35)`; // Color 35%
            } else {
                overlayColor = `rgba(0, 0, 0, 0.3)`; // Black 30%
                colorOverlay = `rgba(${r}, ${g}, ${b}, 0.2)`; // Color 20%
            }
            // Opacity mạnh hơn cho pattern (50% opacity layer = 50% visible)
            imageOpacityLayer = `linear-gradient(135deg, rgba(128, 128, 128, 0.5), rgba(128, 128, 128, 0.5))`;
        }

        const gradientOverlay = `linear-gradient(135deg, ${overlayColor}, ${overlayColor})`;
        const colorGradient = `linear-gradient(135deg, ${colorOverlay}, ${colorOverlay})`;

        return `${gradientOverlay}, ${colorGradient}, ${imageOpacityLayer}, url('${backgroundOption.image}')`;
    };

    // Function to get background size for images
    const getBackgroundSize = (backgroundId) => {
        if (backgroundId === 'none') return '';
        return 'cover'; // Use cover to fill background with image
    };

    // Background picker functions
    let cachedPremiumStatus = null;
    let currentCategory = 'all';
    let backgroundsInitialized = false;
    let basicBackgroundsLoaded = false;

    // Load basic backgrounds immediately (Upload, None, Custom)
    const loadBasicBackgrounds = async () => {
        if (basicBackgroundsLoaded) return;

        const allContainer = document.getElementById('all-backgrounds');

        // Load custom backgrounds and cache premium status in parallel
        const [_, userEmail] = await Promise.all([
            loadCustomBackgrounds(),
            getUserEmailFromExtension()
        ]);

        // Cache premium status once
        if (cachedPremiumStatus === null) {
            if (userEmail) {
                cachedPremiumStatus = await checkPremiumStatus(userEmail);
            } else {
                cachedPremiumStatus = false;
            }
        }

        // Clear container (removes spinner)
        allContainer.innerHTML = '';

        // 1. Add upload option first
        const uploadOption = createUploadOption();
        allContainer.appendChild(uploadOption);

        // 2. Add None option
        const noneOption = BACKGROUND_OPTIONS.find(bg => bg.id === 'none');
        if (noneOption) {
            const option = await createBackgroundOption(noneOption, cachedPremiumStatus);
            allContainer.appendChild(option);
        }

        // 3. Add custom backgrounds
        const customBackgrounds = BACKGROUND_OPTIONS.filter(bg => bg.isCustom === true);
        for (const bg of customBackgrounds) {
            const option = await createBackgroundOption(bg, cachedPremiumStatus);
            allContainer.appendChild(option);
        }

        basicBackgroundsLoaded = true;
    };

    // Load remaining backgrounds in background
    const loadRemainingBackgrounds = async () => {
        if (backgroundsInitialized) return;

        const allContainer = document.getElementById('all-backgrounds');
        const defaultBackgrounds = BACKGROUND_OPTIONS.filter(bg => bg.id !== 'none' && bg.isCustom !== true);

        const batchSize = 15;
        for (let i = 0; i < defaultBackgrounds.length; i += batchSize) {
            const batch = defaultBackgrounds.slice(i, i + batchSize);

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 10));

            for (const bg of batch) {
                const option = await createBackgroundOption(bg, cachedPremiumStatus);
                option.classList.add('lazy-loading');
                allContainer.appendChild(option);
            }

            // Apply filter after each batch
            filterBackgroundsByCategory(currentCategory);
        }

        backgroundsInitialized = true;
    };

    const initializeBackgroundPicker = async () => {
        // Load basic backgrounds first (blocking)
        await loadBasicBackgrounds();

        // Load remaining backgrounds in background (non-blocking)
        setTimeout(() => {
            loadRemainingBackgrounds();
        }, 0);
    };

    const filterBackgroundsByCategory = (category) => {
        currentCategory = category;
        const allOptions = document.querySelectorAll('.background-option');

        allOptions.forEach(option => {
            const bgId = option.dataset.backgroundId;

            // Upload, None và custom backgrounds chỉ hiển thị ở tab "All"
            if (bgId === 'upload' || bgId === 'none') {
                option.style.display = category === 'all' ? 'flex' : 'none';
                return;
            }

            const bg = BACKGROUND_OPTIONS.find(b => b.id === bgId);

            // Custom backgrounds chỉ hiển thị ở tab "All"
            if (bg && bg.isCustom) {
                option.style.display = category === 'all' ? 'flex' : 'none';
                return;
            }

            // Filter by category
            if (category === 'all') {
                option.style.display = 'flex';
            } else if (bg && bg.category === category) {
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    };

    // Load custom backgrounds from Chrome storage
    const loadCustomBackgrounds = async () => {
        try {
            const customBackgrounds = await dbManager.getSetting('customBackgrounds') || [];

            // Add custom backgrounds to BACKGROUND_OPTIONS
            customBackgrounds.forEach(bg => {
                // Check if background already exists to avoid duplicates
                const exists = BACKGROUND_OPTIONS.find(existing => existing.id === bg.id);
                if (!exists) {
                    BACKGROUND_OPTIONS.push(bg);
                }
            });
        } catch (error) {
            console.error('Error loading custom backgrounds:', error);
        }
    };

    // Function to generate preview background style with images for picker
    const generatePreviewBackgroundStyle = (backgroundId, noteColor) => {
        if (backgroundId === 'none') {
            return 'transparent';
        }

        const backgroundOption = BACKGROUND_OPTIONS.find(bg => bg.id === backgroundId);
        if (!backgroundOption || !backgroundOption.image) {
            return 'transparent';
        }

        // Preview hiển thị thuần: chỉ hình ảnh (opacity được xử lý bởi CSS ::before)
        return `url('${backgroundOption.image}')`;
    };

    const createUploadOption = () => {
        const option = document.createElement('div');
        option.className = 'background-option upload-option';
        option.dataset.backgroundId = 'upload';

        option.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #e8eaed;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 4px;">
                    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M16 13H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M16 17H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10 9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span style="font-size: 10px; font-weight: 500;">${chrome.i18n.getMessage('background_upload') || 'Upload'}</span>
            </div>
        `;

        // Add click handler for upload
        option.addEventListener('click', () => {
            // Hide context menu when clicking on upload option
            hideBackgroundContextMenu();

            const uploadInput = document.getElementById('background-upload-input');
            if (uploadInput) {
                uploadInput.click();
            }
        });

        return option;
    };

    const createBackgroundOption = async (bg, isPremiumUser = null) => {
        const option = document.createElement('div');
        option.className = 'background-option';
        option.dataset.backgroundId = bg.id;

        // Check if background is premium and user is not premium
        let isLocked = false;
        if (bg.isPremium) {
            // Use cached premium status if available (performance optimization)
            if (isPremiumUser !== null) {
                isLocked = !isPremiumUser;
            } else {
                const userEmail = await getUserEmailFromExtension();
                if (userEmail) {
                    const isPremium = await checkPremiumStatus(userEmail);
                    isLocked = !isPremium;
                } else {
                    // User not signed in - lock premium backgrounds
                    isLocked = true;
                }
            }
        }

        if (bg.id === 'none') {
            // Display "None" for option without background
            option.style.background = 'rgba(255, 255, 255, 0.1)';
            option.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
            option.innerHTML = `<span style="color: #e8eaed; font-size: 12px; font-weight: 500;">${chrome.i18n.getMessage('background_none') || 'None'}</span>`;
            option.style.display = 'flex';
            option.style.alignItems = 'center';
            option.style.justifyContent = 'center';
        } else {
            // Use image for preview (opacity overlay handled by CSS ::before)
            const backgroundStyle = generatePreviewBackgroundStyle(bg.id, currentNoteColor);
            option.style.background = backgroundStyle;
            option.style.backgroundSize = 'cover';
            option.style.backgroundPosition = 'center';
            option.style.backgroundRepeat = 'no-repeat';
            // Add fallback if image fails to load
            option.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';

            // Add locked overlay if premium and locked
            if (isLocked) {
                option.classList.add('locked');
                // Add small lock icon overlay instead of full overlay
                option.innerHTML = `
                    <div class="locked-overlay">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/>
                        </svg>
                    </div>
                `;
            }
        }

        // Add click handler for selection
        option.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Hide context menu when clicking on background option
            hideBackgroundContextMenu();

            // Check if locked
            if (isLocked) {
                showPremiumModal(chrome.i18n.getMessage('messages_backgroundPremiumOnly'));
                return;
            }

            selectBackground(bg.id);
        });

        // Add right-click handler for context menu (only for non-upload options and non-locked)
        if (bg.id !== 'upload') {
            option.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Only show context menu if not locked
                if (!isLocked) {
                    showBackgroundContextMenu(e, bg);
                }
                // If locked, do nothing (no context menu)
            });
        }

        return option;
    };

    const selectBackground = (backgroundId) => {
        currentBackground = backgroundId;

        // Update visual selection
        document.querySelectorAll('.background-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.backgroundId === backgroundId);
        });

        // Apply background to note
        applyBackgroundToNote(backgroundId);

        // Get current noteId from tabs if tabs are active
        const currentNoteId = window.tabsManager && window.tabsManager.getCurrentNoteId ? 
            window.tabsManager.getCurrentNoteId() : noteId;

        // Save background preference
        const dataToUpdate = { background: backgroundId };
        chrome.runtime.sendMessage({ action: "updateNoteData", noteId: currentNoteId, data: dataToUpdate });

        // Close modal after selection
        setTimeout(() => {
            hideBackgroundPicker();
        }, 300);
    };

    const applyBackgroundToNote = async (backgroundId) => {
        const noteContainer = document.querySelector('.note-container');
        if (!noteContainer) return;

        // Save background to current note's storage only (not shared)
        try {
            // Get current noteId from tabs if tabs are active
            const currentNoteId = window.tabsManager && window.tabsManager.getCurrentNoteId ? 
                window.tabsManager.getCurrentNoteId() : noteId;
                
            if (currentNoteId) {
                // Save to local storage for quick access
                await dbManager.saveSetting(`note_${currentNoteId}_background`, backgroundId);

                console.log('[Note] Background saved for note:', currentNoteId, '- background:', backgroundId);
            }
        } catch (error) {
            console.error('Error saving background to storage:', error);
        }

        if (backgroundId === 'none') {
            // Check if light theme is active
            const isLightTheme = document.body.classList.contains('light-theme');
            const themeBackground = isLightTheme ? '#f1f3f4' : '#202124';
            noteContainer.style.background = themeBackground;
            noteContainer.style.backgroundSize = '';
            noteContainer.style.backgroundPosition = '';
            noteContainer.style.backgroundRepeat = '';
            return;
        }

        // Check if light theme is active
        const isLightTheme = document.body.classList.contains('light-theme');
        const themeBackground = isLightTheme ? '#f1f3f4' : '#202124';

        // Generate background style based on current note color
        const backgroundStyle = generateBackgroundStyle(backgroundId, currentNoteColor);

        // Apply background image
        noteContainer.style.background = `${backgroundStyle}, ${themeBackground}`;
        // Set size, position, repeat for all 4 layers + theme background (5 layers total)
        noteContainer.style.backgroundSize = 'auto, auto, auto, cover, auto';
        noteContainer.style.backgroundPosition = 'center, center, center, center, center';
        noteContainer.style.backgroundRepeat = 'no-repeat, no-repeat, no-repeat, no-repeat, repeat';
    };

    const showBackgroundPicker = () => {
        const allContainer = document.getElementById('all-backgrounds');

        // Close all other modals when opening background picker
        closeAllModals();

        // Show modal immediately with loading spinner
        backgroundPickerModal.style.display = 'flex';
        setTimeout(() => {
            backgroundPickerModal.classList.add('show');
        }, 10);

        // Reset to "All" tab
        currentCategory = 'all';
        document.querySelectorAll('.bg-tab').forEach(t => t.classList.remove('active'));
        const allTab = document.querySelector('.bg-tab[data-category="all"]');
        if (allTab) allTab.classList.add('active');

        // Show loading spinner if no backgrounds loaded yet
        if (!basicBackgroundsLoaded) {
            allContainer.innerHTML = `
                <div class="background-loading-spinner">
                    <div class="spinner"></div>
                </div>
            `;
        }

        // Load backgrounds asynchronously
        (async () => {
            // Load basic backgrounds first
            await loadBasicBackgrounds();

            // Highlight current background
            setTimeout(() => {
                document.querySelectorAll('.background-option').forEach(option => {
                    option.classList.toggle('selected', option.dataset.backgroundId === currentBackground);
                });
            }, 50);

            // Load remaining backgrounds in background
            setTimeout(() => {
                loadRemainingBackgrounds();
            }, 0);
        })();
    };

    const hideBackgroundPicker = () => {
        backgroundPickerModal.classList.remove('show');
        setTimeout(() => {
            backgroundPickerModal.style.display = 'none';
        }, 300);
    };

    const updateBackgroundPickerPreviews = () => {
        // Update all background option previews with new note color
        document.querySelectorAll('.background-option').forEach(option => {
            const backgroundId = option.dataset.backgroundId;
            if (backgroundId === 'upload') return; // Skip upload option

            const backgroundStyle = generatePreviewBackgroundStyle(backgroundId, currentNoteColor);
            const backgroundSize = getBackgroundSize(backgroundId);

            if (backgroundSize) {
                option.style.background = `${backgroundStyle} ${backgroundSize}`;
            } else {
                option.style.background = backgroundStyle;
            }
        });
    };

    const handleBackgroundUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check if user is logged in
        const userEmail = await getUserEmailFromExtension();
        if (!userEmail) {
            showErrorModal(chrome.i18n.getMessage('messages_signInToUpload') || 'Sign in to upload');
            return;
        }

        // Check premium status for background upload
        const isPremium = await checkPremiumStatus(userEmail);
        if (!isPremium) {
            showPremiumModal(chrome.i18n.getMessage('messages_backgroundUploadPremiumOnly'));
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showErrorToast(chrome.i18n.getMessage('toast_imageFileRequired') || 'Image file required');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showErrorToast(chrome.i18n.getMessage('toast_imageTooLarge') || 'Image too large');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const dataUrl = event.target.result;

            // Get existing custom backgrounds from storage
            let customBackgrounds = await dbManager.getSetting('customBackgrounds') || [];

            // Create new background option with optimized name
            const customCount = customBackgrounds.length + 1;
            const newBgId = 'custom_' + Date.now();
            const customPrefix = chrome.i18n.getMessage('background_customName') || 'Custom';
            const newBgOption = {
                id: newBgId,
                name: `${customPrefix} ${customCount}`,
                image: dataUrl,
                isCustom: true,
                uploadedAt: Date.now()
            };

            // Add to BACKGROUND_OPTIONS
            BACKGROUND_OPTIONS.push(newBgOption);

            // Save to Chrome storage
            customBackgrounds.push(newBgOption);
            await dbManager.saveSetting('customBackgrounds', customBackgrounds);


            // Create and add option to UI
            const option = await createBackgroundOption(newBgOption);
            const allContainer = document.getElementById('all-backgrounds');
            allContainer.appendChild(option);

            // Select the new background
            selectBackground(newBgId);

            // Background uploaded successfully - no toast needed
        };

        reader.readAsDataURL(file);

        // Reset input
        e.target.value = '';
    };

    // Helper function to adjust context menu position to prevent overflow
    const adjustContextMenuPosition = (menu, x, y) => {
        // First, position the menu temporarily to measure its size
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'block';

        // Get menu dimensions
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust horizontal position if menu overflows right edge
        let adjustedX = x;
        if (menuRect.right > viewportWidth) {
            adjustedX = viewportWidth - menuRect.width - 10; // 10px padding from edge
        }

        // Ensure menu doesn't overflow left edge
        if (adjustedX < 10) {
            adjustedX = 10;
        }

        // Adjust vertical position if menu overflows bottom edge
        let adjustedY = y;
        if (menuRect.bottom > viewportHeight) {
            adjustedY = viewportHeight - menuRect.height - 10; // 10px padding from edge
        }

        // Ensure menu doesn't overflow top edge
        if (adjustedY < 10) {
            adjustedY = 10;
        }

        // Apply adjusted position
        menu.style.left = adjustedX + 'px';
        menu.style.top = adjustedY + 'px';
    };

    // Hide all context menus in note page except the specified one
    const hideAllNoteContextMenusExcept = (exceptMenu) => {
        if (exceptMenu !== 'background') hideBackgroundContextMenu();
        if (exceptMenu !== 'image') hideImageContextMenu();
        if (exceptMenu !== 'ai') hideContextMenu();
    };

    const showBackgroundContextMenu = (e, bg) => {
        // Hide all other context menus first
        hideAllNoteContextMenusExcept('background');

        const contextMenu = document.getElementById('background-context-menu');
        if (!contextMenu) return;

        // Show/hide delete option based on whether it's a custom background
        const deleteOption = document.getElementById('delete-custom-option');
        if (deleteOption) {
            deleteOption.style.display = bg.isCustom ? 'flex' : 'none';
        }

        // Show/hide set default option - only for system backgrounds
        const setDefaultOption = document.getElementById('set-default-option');
        if (setDefaultOption) {
            setDefaultOption.style.display = bg.isCustom ? 'none' : 'flex';
        }

        // Store current background for context menu actions
        contextMenu.dataset.backgroundId = bg.id;

        // Position the menu with overflow prevention
        adjustContextMenuPosition(contextMenu, e.clientX, e.clientY);

        // Show with animation
        setTimeout(() => {
            contextMenu.classList.add('show');
        }, 10);
    };

    const hideBackgroundContextMenu = () => {
        const contextMenu = document.getElementById('background-context-menu');
        if (!contextMenu) return;

        contextMenu.classList.remove('show');
        setTimeout(() => {
            contextMenu.style.display = 'none';
        }, 200);
    };

    const handleBackgroundContextAction = (action) => {
        const contextMenu = document.getElementById('background-context-menu');
        if (!contextMenu) return;

        const backgroundId = contextMenu.dataset.backgroundId;
        const bg = BACKGROUND_OPTIONS.find(b => b.id === backgroundId);

        if (!bg) return;

        switch (action) {
            case 'set-default':
                setAsDefaultBackground(bg);
                break;
            case 'delete':
                deleteCustomBackground(bg);
                break;
        }

        hideBackgroundContextMenu();
    };

    const setAsDefaultBackground = async (bg) => {
        try {
            // Save as default background in storage
            await dbManager.saveSetting('defaultBackground', bg.id);

            // Apply to current note immediately
            currentBackground = bg.id;
            applyBackgroundToNote(bg.id);

            // Update UI to highlight the selected background (without closing modal)
            document.querySelectorAll('.background-option').forEach(option => {
                option.classList.toggle('selected', option.dataset.backgroundId === bg.id);
            });

            // Show success modal instead of toast
            showSuccessModal(chrome.i18n.getMessage('messages_defaultBackgroundSet'), '');

            // Broadcast background update to all open note windows
            chrome.runtime.sendMessage({
                action: "broadcastBackgroundUpdate",
                backgroundId: bg.id
            });

        } catch (error) {
            console.error('Error setting default background:', error);
            showErrorToast(chrome.i18n.getMessage('toast_backgroundSetFailed') || 'Background failed');
        }
    };

    const deleteCustomBackground = async (bg) => {
        if (!bg.isCustom) {
            showErrorToast(chrome.i18n.getMessage('toast_cannotDeleteDefault') || 'Cannot delete');
            return;
        }

        // Remove from BACKGROUND_OPTIONS
        const index = BACKGROUND_OPTIONS.findIndex(b => b.id === bg.id);
        if (index > -1) {
            BACKGROUND_OPTIONS.splice(index, 1);
        }

        // Remove from Chrome storage
        try {
            const customBackgrounds = await dbManager.getSetting('customBackgrounds') || [];
            const updatedBackgrounds = customBackgrounds.filter(b => b.id !== bg.id);
            await dbManager.saveSetting('customBackgrounds', updatedBackgrounds);

        } catch (error) {
            console.error('Error removing background from storage:', error);
        }

        // Remove from UI
        const option = document.querySelector(`[data-background-id="${bg.id}"]`);
        if (option) {
            option.remove();
        }

        // If this was the current background, reset to none
        if (currentBackground === bg.id) {
            selectBackground('none');
        }

        // Background deleted successfully - no toast needed
    };

    const markAsUnsaved = () => {
        const content = quillEditor ? quillEditor.root.innerHTML : '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const textContent = tempDiv.textContent.trim();

        // Check for meaningful HTML elements (images, videos, audio, canvas, svg, etc.)
        const hasMediaContent = tempDiv.querySelector('img, video, audio, canvas, svg, iframe, object, embed') !== null;

        // More comprehensive check for meaningful content
        const hasContent = (textContent.length > 0 || hasMediaContent) &&
            content !== '<div></div>' &&
            content !== '<div><br></div>' &&
            content !== '<div><br/></div>' &&
            content !== '<br>' &&
            content !== '<br/>' &&
            content.trim() !== '';

        // Only mark as unsaved if there's actual content and it's different from original
        if (hasContent && content !== originalContent) {
            hasUnsavedChanges = true;
            // console.log('Content changed, marked as unsaved');
        }
    };

    // Make functions globally accessible
    window.markAsUnsaved = markAsUnsaved;

    const markAsSaved = (showToast = true) => {
        hasUnsavedChanges = false;
        // Update original content to current content after saving
        originalContent = quillEditor ? quillEditor.root.innerHTML : '';
        // Toast disabled - no longer show save notifications
        // if (showToast && lastSaveType === 'content' && isUserTyping) {
        //     showSaveToast();
        // }
        // Reset typing flag after save
        isUserTyping = false;
    };

    const saveNoteWithContext = (type = 'content') => {
        clearTimeout(saveTimeout);
        lastSaveType = type;

        if (type === 'position') {
            saveNote();
            return;
        }

        saveTimeout = setTimeout(async () => {
            await saveNote();
        }, SAVE_DELAYS[type]);
    };

    // Make functions globally accessible
    window.saveNoteWithContext = saveNoteWithContext;

    const handleQuotaError = async () => {
        try {
            // Notify cleanup in progress
            showToast(chrome.i18n.getMessage('toast_storageFullCleaning') || '🧹 Storage full, cleaning cache...', 'info');
            // Call cleanup
            const response = await chrome.runtime.sendMessage({ action: 'quota_exceeded' });

            if (response.success) {
                const message = chrome.i18n.getMessage('toast_cacheCleaned', [response.cleanedCount]) || `✅ Cleaned ${response.cleanedCount} cache items. Your notes are safe!`;
                showToast(message, 'success');
                // Retry save after 1 second
                setTimeout(() => {
                    saveNoteWithContext('content');
                }, 1000);
            } else {
                showToast(chrome.i18n.getMessage('toast_restartExtension') || '⚠️ Please restart the extension to free up space.', 'warning');
            }
        } catch (error) {
            console.error('Quota error handling failed:', error);
            showToast(chrome.i18n.getMessage('toast_storageError') || '❌ Storage error. Please restart the extension.', 'error');
        }
    };

    const saveNote = async () => {
        // Get current noteId from tabs if tabs are active
        const currentNoteId = window.tabsManager && window.tabsManager.getCurrentNoteId ? 
            window.tabsManager.getCurrentNoteId() : noteId;

        const content = quillEditor ? quillEditor.root.innerHTML : '';

        // Check if note has meaningful content (not just empty divs, whitespace, or only HTML tags)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const textContent = tempDiv.textContent.trim();

        // Check for meaningful HTML elements (images, videos, audio, canvas, svg, etc.)
        const hasMediaContent = tempDiv.querySelector('img, video, audio, canvas, svg, iframe, object, embed') !== null;

        // More comprehensive check for meaningful content
        const hasContent = (textContent.length > 0 || hasMediaContent) &&
            content !== '<div></div>' &&
            content !== '<div><br></div>' &&
            content !== '<div><br/></div>' &&
            content !== '<br>' &&
            content !== '<br/>' &&
            content.trim() !== '';

        // Only save if there's actual content
        if (hasContent) {
            const dataToUpdate = {
                content: content,
                position: { x: window.screenX, y: window.screenY },
                size: { width: window.outerWidth, height: window.outerHeight },
                isDraft: false // Remove draft flag when saving content
            };

            try {
                await chrome.runtime.sendMessage({ action: "updateNoteData", noteId: currentNoteId, data: dataToUpdate });
                markAsSaved();
                lastSaveTime = Date.now(); // Update last save time

                // Update tab title if tabs are active
                if (window.tabsManager && window.tabsManager.autoUpdateTabTitle) {
                    window.tabsManager.autoUpdateTabTitle();
                }
            } catch (error) {
                console.error('Save error:', error);

                // Handle quota error
                if (error.message.includes('quota') || error.message.includes('QuotaBytes')) {
                    await handleQuotaError();
                } else {
                    markAsUnsaved(true);
                }
            }
        } else {
            // If no content, don't save and don't mark as saved to avoid saving empty notes
            hasUnsavedChanges = false;
        }
    };

    const savePositionOnly = () => {
        const dataToUpdate = {
            position: { x: window.screenX, y: window.screenY },
            size: { width: window.outerWidth, height: window.outerHeight }
        };
        chrome.runtime.sendMessage({ action: "updateNoteData", noteId, data: dataToUpdate });
        // Don't show toast for position/size changes
    };

    // Expose saveNote for immediate saving (used by tabs)
    window.saveNoteImmediately = saveNote;





    // --- Event Listeners Setup ---

    dbManager.onChanged.addListener(async (changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.theme) {
            applyTheme(changes.theme.newValue);
        }


        const newNoteData = changes.notes?.newValue?.[noteId];
        const oldNoteData = changes.notes?.oldValue?.[noteId];
        if (newNoteData && newNoteData.content !== oldNoteData?.content) {
            const currentContent = quillEditor ? quillEditor.root.innerHTML : '';
            if (currentContent !== newNoteData.content) {
                // Save cursor position before updating content
                const selection = quillEditor ? quillEditor.getSelection() : null;

                // Update content using innerHTML to preserve formatting
                if (quillEditor) {
                    quillEditor.root.innerHTML = newNoteData.content;
                    quillEditor.update();
                }

                // Restore cursor position after content update
                if (selection && quillEditor) {
                    try {
                        quillEditor.setSelection(selection.index, selection.length);
                    } catch (e) {
                        // console.log('Could not restore selection:', e);
                    }
                }
            }
        }
    });

    // Listen for background updates from service worker
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'backgroundUpdated') {
            // Always update background when receiving broadcast message
            if (request.backgroundId) {
                currentBackground = request.backgroundId;
                selectBackground(request.backgroundId);
                applyBackgroundToNote(request.backgroundId);
            }
        }
    });


    // Note: Editor event listeners are now handled by the editor
    // The editor manages input, paste, and click events internally



    // Helper function to safely get format from Quill
    function getSafeFormat() {
        if (!quillEditor) return {};

        try {
            const selection = quillEditor.getSelection();

            if (selection && selection.index !== undefined) {
                return quillEditor.getFormat(selection.index, selection.length);
            } else {
                // Get format at current cursor position or start of document
                const length = quillEditor.getLength();
                if (length > 1) {
                    return quillEditor.getFormat(0, 1);
                }
            }
        } catch (error) {
            console.warn('Error getting format:', error);
        }

        return {};
    }

    // Helper function to apply formatting at cursor position
    function applyFormattingAtCursor(command, value) {
        const selection = quillEditor.getSelection();
        if (!selection || selection.index === undefined) return;

        const currentFormat = getSafeFormat();

        // Basic text formatting
        if (command === 'bold' || command === 'italic' || command === 'underline' || command === 'strike') {
            const isActive = currentFormat[command] || false;
            quillEditor.format(command, !isActive);
        }
        // Headers
        else if (command === 'header') {
            const isActive = currentFormat['header'] === value;
            quillEditor.format('header', isActive ? false : value);
        }
        // Lists
        else if (command === 'bulletList') {
            const isActive = currentFormat['list'] === 'bullet';
            quillEditor.format('list', isActive ? false : 'bullet');
        } else if (command === 'orderedList') {
            const isActive = currentFormat['list'] === 'ordered';
            quillEditor.format('list', isActive ? false : 'ordered');
        } else if (command === 'checklist') {
            const isActive = currentFormat['list'] === 'unchecked' || currentFormat['list'] === 'checked';
            quillEditor.format('list', isActive ? false : 'unchecked');
        }
        // Block elements
        else if (command === 'blockquote') {
            const isActive = currentFormat['blockquote'] || false;
            quillEditor.format('blockquote', !isActive);
        } else if (command === 'code-block') {
            const isActive = currentFormat['code-block'] || false;
            quillEditor.format('code-block', !isActive);
        }
        // Text alignment
        else if (command === 'textAlign') {
            const isActive = currentFormat['align'] === value;
            quillEditor.format('align', isActive ? false : value);
        }
        // Colors
        else if (command === 'color') {
            // Open color picker for text color
            openColorPicker('text');
        } else if (command === 'background') {
            // Open color picker for background color
            openColorPicker('background');
        }
        // Font Size
        else if (command === 'fontSize') {
            openFontSizePicker();
        }
        // Link
        else if (command === 'link') {
            openLinkOverlay();
        }
        // Video
        else if (command === 'video') {
            openVideoOverlay();
        }
        // Image
        else if (command === 'image') {
            imageInput.click();
        }
        // Remove format
        else if (command === 'removeFormat') {
            quillEditor.removeFormat(selection.index, 1);
        }

        // Force update toolbar buttons after formatting
        setTimeout(() => {
            updateToolbarButtons();
        }, 10);
    }

    // Helper function to apply formatting to selection
    function applyFormattingToSelection(command, value, selection) {
        const currentFormat = getSafeFormat();

        // Basic text formatting
        if (command === 'bold' || command === 'italic' || command === 'underline' || command === 'strike') {
            const isActive = currentFormat[command] || false;
            quillEditor.format(command, !isActive);
        }
        // Headers
        else if (command === 'header') {
            const isActive = currentFormat['header'] === value;
            quillEditor.format('header', isActive ? false : value);
        }
        // Lists
        else if (command === 'bulletList') {
            const isActive = currentFormat['list'] === 'bullet';
            quillEditor.format('list', isActive ? false : 'bullet');
        } else if (command === 'orderedList') {
            const isActive = currentFormat['list'] === 'ordered';
            quillEditor.format('list', isActive ? false : 'ordered');
        } else if (command === 'checklist') {
            const isActive = currentFormat['list'] === 'unchecked' || currentFormat['list'] === 'checked';
            quillEditor.format('list', isActive ? false : 'unchecked');
        }
        // Block elements
        else if (command === 'blockquote') {
            const isActive = currentFormat['blockquote'] || false;
            quillEditor.format('blockquote', !isActive);
        } else if (command === 'code-block') {
            const isActive = currentFormat['code-block'] || false;
            quillEditor.format('code-block', !isActive);
        }
        // Text alignment
        else if (command === 'textAlign') {
            const isActive = currentFormat['align'] === value;
            quillEditor.format('align', isActive ? false : value);
        }
        // Colors
        else if (command === 'color') {
            openColorPicker('text');
        } else if (command === 'background') {
            openColorPicker('background');
        }
        // Font Size
        else if (command === 'fontSize') {
            openFontSizePicker();
        }
        // Link
        else if (command === 'link') {
            openLinkOverlay();
        }
        // Video
        else if (command === 'video') {
            openVideoOverlay();
        }
        // Image
        else if (command === 'image') {
            imageInput.click();
        }
        // Remove format
        else if (command === 'removeFormat') {
            quillEditor.removeFormat(selection.index, selection.length);
        }

        // Force update toolbar buttons after formatting
        setTimeout(() => {
            updateToolbarButtons();
        }, 10);
    }

    // Helper function to apply formatting to entire document
    function applyFormattingToDocument(command, value) {
        const currentFormat = getSafeFormat();

        // Basic text formatting
        if (command === 'bold' || command === 'italic' || command === 'underline' || command === 'strike') {
            const isActive = currentFormat[command] || false;
            quillEditor.format(command, !isActive);
        }
        // Headers
        else if (command === 'header') {
            const isActive = currentFormat['header'] === value;
            quillEditor.format('header', isActive ? false : value);
        }
        // Lists
        else if (command === 'bulletList') {
            const isActive = currentFormat['list'] === 'bullet';
            quillEditor.format('list', isActive ? false : 'bullet');
        } else if (command === 'orderedList') {
            const isActive = currentFormat['list'] === 'ordered';
            quillEditor.format('list', isActive ? false : 'ordered');
        } else if (command === 'checklist') {
            const isActive = currentFormat['list'] === 'unchecked' || currentFormat['list'] === 'checked';
            quillEditor.format('list', isActive ? false : 'unchecked');
        }
        // Block elements
        else if (command === 'blockquote') {
            const isActive = currentFormat['blockquote'] || false;
            quillEditor.format('blockquote', !isActive);
        } else if (command === 'code-block') {
            const isActive = currentFormat['code-block'] || false;
            quillEditor.format('code-block', !isActive);
        }
        // Text alignment
        else if (command === 'textAlign') {
            const isActive = currentFormat['align'] === value;
            quillEditor.format('align', isActive ? false : value);
        }
        // Colors
        else if (command === 'color') {
            openColorPicker('text');
        } else if (command === 'background') {
            openColorPicker('background');
        }
        // Font Size
        else if (command === 'fontSize') {
            openFontSizePicker();
        }
        // Link
        else if (command === 'link') {
            openLinkOverlay();
        }
        // Video
        else if (command === 'video') {
            openVideoOverlay();
        }
        // Image
        else if (command === 'image') {
            imageInput.click();
        }
        // Remove format
        else if (command === 'removeFormat') {
            const length = quillEditor.getLength();
            if (length > 1) {
                quillEditor.removeFormat(0, length - 1);
            }
        }

        // Force update toolbar buttons after formatting
        setTimeout(() => {
            updateToolbarButtons();
        }, 10);
    }

    // Update toolbar button states
    function updateToolbarButtons() {
        if (!quillEditor) return;

        try {
            // Get format safely
            const format = getSafeFormat();

            // Update button states based on current format
            document.querySelectorAll('[data-command]').forEach(button => {
                const command = button.dataset.command;
                const value = button.dataset.value;

                let isActive = false;

                // Basic text formatting
                if (command === 'bold') {
                    isActive = !!format['bold'];
                } else if (command === 'italic') {
                    isActive = !!format['italic'];
                } else if (command === 'underline') {
                    isActive = !!format['underline'];
                } else if (command === 'strike') {
                    isActive = !!format['strike'];
                }
                // Headers
                else if (command === 'header') {
                    isActive = format['header'] === value;
                }
                // Lists
                else if (command === 'bulletList') {
                    isActive = format['list'] === 'bullet';
                } else if (command === 'orderedList') {
                    isActive = format['list'] === 'ordered';
                } else if (command === 'checklist') {
                    isActive = format['list'] === 'unchecked' || format['list'] === 'checked';
                }
                // Block elements
                else if (command === 'blockquote') {
                    isActive = !!format['blockquote'];
                } else if (command === 'code-block') {
                    isActive = !!format['code-block'];
                }
                // Text alignment
                else if (command === 'textAlign') {
                    isActive = format['align'] === value || (!format['align'] && value === 'left');
                }
                // Colors and other features don't have active states
                else if (command === 'color' || command === 'background' || command === 'link' || command === 'video' || command === 'image' || command === 'removeFormat') {
                    isActive = false; // These don't have active states
                }

                button.classList.toggle('is-active', isActive);
            });
        } catch (error) {
            console.error('Error in updateToolbarButtons:', error);
            // Reset all buttons to inactive state on error
            document.querySelectorAll('[data-command]').forEach(button => {
                button.classList.remove('is-active');
            });
        }
    }

    // Initialize toolbar event listener after Quill is ready
    function initializeToolbar() {
        if (!toolbar) {
            console.error('Toolbar not found!');
            return;
        }

        // Quill.js toolbar event listener
        toolbar.addEventListener('click', (e) => {
            // console.log('Toolbar clicked:', e.target);
            const button = e.target.closest('button');
            const command = button?.dataset.command;
            const value = button?.dataset.value;

            if (command && quillEditor) {
                // console.log('Processing command:', command);
                e.preventDefault(); // Prevent default behavior

                try {
                    // Save selection BEFORE any focus changes
                    const currentSelection = quillEditor.getSelection();
                    // console.log('Selection before focus:', currentSelection);

                    // Handle image command separately
                    if (command === 'image') {
                        // console.log('Opening image input');
                        imageInput.click();
                        return;
                    }

                    // Focus editor to ensure commands work properly
                    quillEditor.focus();

                    // Wait a bit for focus to settle
                    setTimeout(() => {
                        // Restore selection after focus
                        if (currentSelection) {
                            quillEditor.setSelection(currentSelection.index, currentSelection.length);
                        }

                        // console.log('Editor focused, current selection:', quillEditor.getSelection());

                        // Get current selection for safe formatting
                        const selection = quillEditor.getSelection();
                        const hasSelection = selection && selection.index !== undefined && selection.length > 0;
                        // console.log('Has selection:', hasSelection);

                        // If no selection, create one at cursor position
                        if (!hasSelection && selection && selection.index !== undefined) {
                            // console.log('No selection, using cursor position:', selection.index);
                            // Apply formatting at cursor position
                            applyFormattingAtCursor(command, value);
                        } else if (hasSelection) {
                            // console.log('Has selection, applying formatting to selection');
                            // Apply formatting to selection
                            applyFormattingToSelection(command, value, selection);
                        } else {
                            // console.log('No valid selection, applying to entire document');
                            // Apply formatting to entire document
                            applyFormattingToDocument(command, value);
                        }

                        // Mark as unsaved
                        markAsUnsaved();
                        saveNoteWithContext('formatting');

                        // console.log('Command processed successfully');
                        // console.log('Editor content after command:', quillEditor.root.innerHTML.substring(0, 100) + '...');
                        // console.log('Editor selection after command:', quillEditor.getSelection());
                    }, 10);

                } catch (error) {
                    console.error('Error processing toolbar command:', error);
                    showToast(chrome.i18n.getMessage('note_errorApplyingFormatting'), 'error');
                }
            } else {
                // console.log('Command not processed - missing command or quillEditor');
            }
        });

        // console.log('Toolbar event listener initialized');

        // Test toolbar functionality
        // console.log('Testing toolbar functionality...');
        const testButton = toolbar.querySelector('[data-command="bold"]');
        if (testButton) {
            // console.log('Bold button found:', testButton);
            // console.log('Bold button command:', testButton.dataset.command);
        } else {
            console.error('Bold button not found!');
        }
    }

    // Note: input event listener is now handled in initializeSimpleEditor() to avoid duplication

    // Handle paste to support images in Quill
    // Note: Quill handles text paste automatically
    // We only need to handle image paste explicitly
    // Remove old contenteditable paste handler as Quill manages this

    // Ctrl+A is handled by Quill editor automatically

    addNewBtn.addEventListener('click', () => {
        // Create new tab
        if (window.tabsManager) {
            window.tabsManager.createTab();
        } else {
            // Fallback to creating new window if tabs not initialized
            chrome.runtime.sendMessage({ action: "createNewNote" });
        }
    });
    deleteNoteBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: "deleteNote", noteId }));
    viewAllNotesBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: "openMainWindow" }));

    // Text color button event listener

    // Highlight color button event listener












    // Handle font size for new text input
    // Font size handling is now managed by Quill



    if (aiAssistantBtn) {
        aiAssistantBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // console.log('AI Assistant button clicked');
            toggleAIInputBar();
        });
    } else {
        console.error('AI Assistant button not found!');
    }

    // AI Tone Magic Button and Menu - Compact Design
    const aiToneBtn = document.getElementById('ai-tone-btn');
    const aiToneMenu = document.getElementById('ai-tone-menu');

    if (aiToneBtn) {
        aiToneBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // console.log('AI Tone button clicked');
            if (aiToneMenu && aiToneMenu.classList.contains('show')) {
                hideAIToneMenu();
                aiToneBtn.classList.remove('active');
            } else {
                showAIToneMenu();
                aiToneBtn.classList.add('active');
            }
        });
    } else {
        console.error('AI Tone button not found!');
    }

    // AI Formatting Button and Menu
    const aiFormattingBtn = document.getElementById('ai-formatting-btn');
    const aiFormattingMenu = document.getElementById('ai-formatting-menu');

    if (aiFormattingBtn) {
        aiFormattingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (aiFormattingMenu && aiFormattingMenu.classList.contains('show')) {
                hideAIFormattingMenu();
                aiFormattingBtn.classList.remove('active');
            } else {
                showAIFormattingMenu();
                aiFormattingBtn.classList.add('active');
            }
        });
    } else {
        console.error('AI Formatting button not found!');
    }

    // Close formatting menu when clicking outside
    document.addEventListener('click', (e) => {
        if (aiFormattingMenu && aiFormattingMenu.classList.contains('show') &&
            !aiFormattingMenu.contains(e.target) && !aiFormattingBtn.contains(e.target)) {
            hideAIFormattingMenu();
            aiFormattingBtn.classList.remove('active');
        }
    });

    // Close formatting menu with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aiFormattingMenu && aiFormattingMenu.classList.contains('show')) {
            hideAIFormattingMenu();
            aiFormattingBtn.classList.remove('active');
        }
    });

    // Formatting option click handlers
    const formattingOptions = document.querySelectorAll('.ai-formatting-option-compact');
    formattingOptions.forEach(option => {
        option.addEventListener('click', () => {
            const action = option.dataset.action;
            handleFormattingSelection(action);
        });
    });

    // Close tone menu when clicking outside
    document.addEventListener('click', (e) => {
        if (aiToneMenu && aiToneMenu.classList.contains('show') && !aiToneMenu.contains(e.target) && !aiToneBtn.contains(e.target)) {
            hideAIToneMenu();
            aiToneBtn.classList.remove('active');
        }
    });

    // Close tone menu when clicking outside
    document.addEventListener('click', (e) => {
        if (aiToneMenu && aiToneMenu.classList.contains('show') && !aiToneMenu.contains(e.target) && !aiToneBtn.contains(e.target)) {
            hideAIToneMenu();
            aiToneBtn.classList.remove('active');
        }
    });

    // Close tone menu with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aiToneMenu && aiToneMenu.classList.contains('show')) {
            hideAIToneMenu();
            aiToneBtn.classList.remove('active');
        }
    });

    // Tone option click handlers - Updated for compact design
    const toneOptions = document.querySelectorAll('.ai-tone-option-compact');
    toneOptions.forEach(option => {
        option.addEventListener('click', () => {
            const tone = option.dataset.tone;
            handleToneSelection(tone);
        });
    });

    backgroundBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showBackgroundPicker();
    });

    // Background picker tab event listeners
    document.querySelectorAll('.bg-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const category = tab.dataset.category;

            // Update active tab
            document.querySelectorAll('.bg-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Filter backgrounds
            filterBackgroundsByCategory(category);
        });
    });

    // Share note button event listener
    const shareNoteBtn = document.getElementById('share-note-btn');
    if (shareNoteBtn) {
        shareNoteBtn.addEventListener('click', handleShareNote);
    }

    // Share modal event listeners
    const shareModal = document.getElementById('share-modal');
    const shareModalClose = document.getElementById('share-modal-close');
    const shareCopyBtn = document.getElementById('share-copy-btn');
    const shareSocialBtns = document.querySelectorAll('.share-social-btn');

    // Close modal events
    if (shareModalClose) {
        shareModalClose.addEventListener('click', hideShareModal);
    }

    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                hideShareModal();
            }
        });
    }

    // Copy link button
    if (shareCopyBtn) {
        shareCopyBtn.addEventListener('click', copyShareLink);
    }

    // Social media share buttons
    shareSocialBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform');
            const linkInput = document.getElementById('share-link-input');
            if (platform && linkInput && linkInput.value) {
                shareToSocial(platform, linkInput.value);
            }
        });
    });

    // Close background picker when clicking outside
    backgroundPickerModal.addEventListener('click', (e) => {
        if (e.target === backgroundPickerModal) {
            hideBackgroundPicker();
        }
        // Hide context menu when clicking in background picker
        hideBackgroundContextMenu();
        // Don't stop propagation to allow context menu to hide
    });

    // Handle background upload
    const backgroundUploadInput = document.getElementById('background-upload-input');
    if (backgroundUploadInput) {
        backgroundUploadInput.addEventListener('change', handleBackgroundUpload);
        backgroundUploadInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Handle background context menu
    const setDefaultOption = document.getElementById('set-default-option');
    const deleteCustomOption = document.getElementById('delete-custom-option');
    const backgroundContextMenu = document.getElementById('background-context-menu');

    if (setDefaultOption) {
        setDefaultOption.addEventListener('click', (e) => {
            e.stopPropagation();
            handleBackgroundContextAction('set-default');
        });
    }

    if (deleteCustomOption) {
        deleteCustomOption.addEventListener('click', (e) => {
            e.stopPropagation();
            handleBackgroundContextAction('delete');
        });
    }

    // Hide context menu when clicking on context menu container
    if (backgroundContextMenu) {
        backgroundContextMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Hide context menu when clicking outside
    document.addEventListener('click', hideBackgroundContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideBackgroundContextMenu();
        }
    });

    // AI Input Bar Event Listeners
    aiInput.addEventListener('input', handleAIInputChange);
    aiInput.addEventListener('keydown', handleAIInputKeydown);
    aiSubmitBtn.addEventListener('click', handleAISubmit);

    // Disable Chrome context menu globally, except for editor area
    document.addEventListener('contextmenu', (e) => {
        // Check if the click is on the editor (which should show our AI context menu)
        const isEditorElement = e.target.closest('#editor');

        if (isEditorElement) {
            // For editor area, prevent default and show our AI context menu
            e.preventDefault();
            handleQuillContextMenu(e);
        } else {
            // Prevent Chrome context menu for all other areas
            e.preventDefault();
        }
    });

    // AI Event Listeners - Context menu handled by Quill
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }

        // Ctrl+Z for undo AI operations
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            // Check if we have AI undo history (aiUndoIndex >= 0 means we have at least one state to restore)
            if (aiUndoIndex >= 0 && aiUndoHistory.length > 0) {
                e.preventDefault();
                undoAIOperation();
            }
        }
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;

            // Insert image into editor using Quill
            if (quillEditor) {
                const range = quillEditor.getSelection(true);
                if (range && range.index !== undefined) {
                    quillEditor.insertEmbed(range.index, 'image', dataUrl, 'user');

                    // Add context menu to newly inserted image
                    setTimeout(() => {
                        const images = quillEditor.root.querySelectorAll('img:not([data-context-menu-added])');
                        images.forEach(img => {
                            img.addEventListener('contextmenu', handleImageContextMenu);
                            img.setAttribute('data-context-menu-added', 'true');
                        });
                    }, 100);

                    markAsUnsaved();
                    saveNoteWithContext('content');
                } else {
                    // If no selection, insert at end
                    const length = quillEditor.getLength();
                    quillEditor.insertEmbed(length - 1, 'image', dataUrl, 'user');

                    setTimeout(() => {
                        const images = quillEditor.root.querySelectorAll('img:not([data-context-menu-added])');
                        images.forEach(img => {
                            img.addEventListener('contextmenu', handleImageContextMenu);
                            img.setAttribute('data-context-menu-added', 'true');
                        });
                    }, 100);

                    markAsUnsaved();
                    saveNoteWithContext('content');
                }
            } else {
                // console.log('Editor not ready for image insertion');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = null; // Reset to allow re-selection of the same file
    });

    // Image context menu handling
    let currentImageElement = null;

    function handleImageContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();

        try {
            currentImageElement = e.target;

            // Validate image element
            if (!currentImageElement || currentImageElement.tagName !== 'IMG') {
                console.error('Invalid image element');
                showToast(chrome.i18n.getMessage('ai_imageAnalysisError'), 'error');
                return;
            }

            // Check if image has base64 data (can be analyzed)
            const src = currentImageElement.src;
            if (!src) {
                console.error('Image has no src');
                showToast(chrome.i18n.getMessage('ai_imageAnalysisError') || 'Image has no source', 'error');
                return;
            }

            if (src.startsWith('data:image/')) {
                // Already base64, show menu directly
                showImageContextMenu(e.clientX, e.clientY);
            } else {
                // External image, check if it's from a known problematic domain
                const url = new URL(src);
                const problematicDomains = [
                    'hoanghamobile.com',
                    'googleusercontent.com',
                    'facebook.com',
                    'instagram.com',
                    'twitter.com'
                ];

                const isProblematicDomain = problematicDomains.some(domain =>
                    url.hostname.includes(domain)
                );

                if (isProblematicDomain) {
                    // Show context menu with limited options for problematic domains
                    showImageContextMenuLimited(e.clientX, e.clientY);
                } else {
                    // Try to convert to base64 for other domains
                    // console.log('Converting external image to base64...');
                    showToast(chrome.i18n.getMessage('ai_imageAnalysisInProgress') || 'Converting image...', 'info');

                    convertImageToBase64(currentImageElement).then((dataUrl) => {
                        // console.log('Image converted successfully');
                        showImageContextMenu(e.clientX, e.clientY);
                    }).catch((error) => {
                        console.error('Image conversion failed:', error);

                        // Show limited context menu on CORS error
                        showImageContextMenuLimited(e.clientX, e.clientY);
                    });
                }
            }
        } catch (error) {
            console.error('Error in handleImageContextMenu:', error);
            showToast(chrome.i18n.getMessage('ai_imageAnalysisError'), 'error');
        }
    }

    function showImageContextMenu(x, y) {
        // Hide all other context menus first
        hideAllNoteContextMenusExcept('image');

        const contextMenu = document.getElementById('image-context-menu');
        if (!contextMenu) {
            console.error('Image context menu not found');
            return;
        }

        // console.log('Showing image context menu at:', x, y);

        // Show all menu items
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            item.style.display = 'flex';
        });

        // Position the menu with overflow prevention
        adjustContextMenuPosition(contextMenu, x, y);

        // Show with animation
        setTimeout(() => {
            contextMenu.classList.add('show');
        }, 10);

        // Remove existing event listeners first to avoid duplicates
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            item.removeEventListener('click', handleImageContextMenuAction);
        });

        // Add click handlers for menu items
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            // console.log('Adding click handler to menu item:', item.dataset.action);
            item.addEventListener('click', handleImageContextMenuAction);
        });
    }

    function showImageContextMenuLimited(x, y) {
        // Hide all other context menus first
        hideAllNoteContextMenusExcept('image');

        const contextMenu = document.getElementById('image-context-menu');
        if (!contextMenu) {
            console.error('Image context menu not found');
            return;
        }

        // console.log('Showing limited image context menu at:', x, y);

        // Hide OCR option for problematic images
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            const action = item.dataset.action;
            if (action === 'extract-text') {
                item.style.display = 'none';
            } else {
                item.style.display = 'flex';
            }
        });

        // Position the menu with overflow prevention
        adjustContextMenuPosition(contextMenu, x, y);

        // Show with animation
        setTimeout(() => {
            contextMenu.classList.add('show');
        }, 10);

        // Remove existing event listeners first to avoid duplicates
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            item.removeEventListener('click', handleImageContextMenuAction);
        });

        // Add click handlers for menu items
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            // console.log('Adding click handler to limited menu item:', item.dataset.action);
            item.addEventListener('click', handleImageContextMenuAction);
        });

        // Show info message
        showToast(chrome.i18n.getMessage('note_ocrNotAvailable'), 'info');
    }

    function hideImageContextMenu() {
        const contextMenu = document.getElementById('image-context-menu');
        if (!contextMenu) return;

        contextMenu.classList.remove('show');
        setTimeout(() => {
            contextMenu.style.display = 'none';
        }, 200);

        // Remove click handlers
        contextMenu.querySelectorAll('.image-context-menu-item').forEach(item => {
            item.removeEventListener('click', handleImageContextMenuAction);
        });
    }

    async function handleImageContextMenuAction(e) {
        // console.log('OCR context menu action clicked:', e.currentTarget.dataset.action);
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;

        hideImageContextMenu();

        if (!currentImageElement) {
            console.error('No current image element found');
            showToast(chrome.i18n.getMessage('ai_imageAnalysisError'), 'error');
            return;
        }

        // console.log('Processing OCR action for image:', currentImageElement.src);

        try {
            switch (action) {
                case 'extract-text':
                    // console.log('Starting OCR extraction with streaming...');
                    // Show loading indicator below image
                    const loadingIndicator = showOCRLoadingIndicator(currentImageElement);

                    // Get image data
                    // console.log('Getting image base64 data...');
                    const imageData = await getImageBase64Data(currentImageElement);
                    if (!imageData) {
                        console.error('Failed to get image data');
                        removeOCRLoadingIndicator(loadingIndicator);
                        throw new Error('Could not get image data');
                    }

                    // console.log('Image data obtained, sending to AI with streaming...');

                    try {
                        // Use streaming for OCR
                        const streamResponse = await analyzeImage(imageData, 'extract-text', true);

                        // Remove loading indicator
                        removeOCRLoadingIndicator(loadingIndicator);

                        // Find the position of the image in the editor
                        const imageBlot = quillEditor ? quillEditor.root.querySelector(`img[src="${currentImageElement.src}"]`) : null;
                        let insertIndex = quillEditor ? quillEditor.getLength() - 1 : 0;

                        if (imageBlot && quillEditor) {
                            // Get the Blot object for the image
                            const blot = window.Quill.find(imageBlot);
                            if (blot) {
                                // Get the index of the image in the editor
                                insertIndex = quillEditor.getIndex(blot);
                                // Insert after the image (image takes 1 character)
                                insertIndex += 1;
                            }
                        }

                        const selection = {
                            index: insertIndex,
                            length: 0
                        };

                        // Stream the OCR result to editor
                        await streamOCRResultToEditor(streamResponse, selection);

                    } catch (streamError) {
                        console.error('OCR streaming failed, falling back to regular mode:', streamError);

                        // Fallback to regular OCR
                        const result = await analyzeImage(imageData, 'extract-text', false);
                        if (result) {
                            // console.log('OCR result received (fallback):', result);
                            removeOCRLoadingIndicator(loadingIndicator);
                            displayImageAnalysisResult(result, action);
                        } else {
                            console.error('No OCR result received');
                            removeOCRLoadingIndicator(loadingIndicator);
                            throw new Error('No result received');
                        }
                    }
                    break;

                case 'download-image':
                    // console.log('Downloading image...');
                    downloadImage(currentImageElement);
                    break;


                default:
                    console.error('Unknown action:', action);
                    throw new Error('Unknown action');
            }

        } catch (error) {
            console.error('Image action error:', error);
            showToast(chrome.i18n.getMessage('ai_imageAnalysisError') || 'Action failed', 'error');
        }
    }

    function showOCRLoadingIndicator(imageElement) {
        // Show Lottie animation in center of screen
        showOCRLottieAnimation();

        // Return a dummy object for compatibility
        return {
            isLottie: true
        };
    }

    function removeOCRLoadingIndicator(loadingIndicator) {
        if (!loadingIndicator) return;

        // Hide Lottie animation
        hideOCRLottieAnimation();
    }

    async function getImageBase64Data(imgElement) {
        return new Promise((resolve) => {
            if (imgElement.src.startsWith('data:image/')) {
                resolve(imgElement.src);
                return;
            }

            // Convert external image to base64
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            imgElement.onload = () => {
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                ctx.drawImage(imgElement, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                resolve(dataURL);
            };

            imgElement.onerror = () => {
                resolve(null);
            };

            // Trigger load if not already loaded
            if (imgElement.complete) {
                imgElement.onload();
            }
        });
    }

    async function convertImageToBase64(imgElement) {
        return new Promise((resolve, reject) => {
            if (imgElement.src.startsWith('data:image/')) {
                resolve(imgElement.src);
                return;
            }

            // Try multiple approaches to handle CORS
            const tryConversion = (img) => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Validate image dimensions
                    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                        throw new Error('Image has no dimensions');
                    }

                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;

                    // Try to draw the image
                    ctx.drawImage(img, 0, 0);

                    // Try different quality settings for toDataURL
                    let dataURL;
                    try {
                        dataURL = canvas.toDataURL('image/png', 1.0);
                    } catch (e) {
                        // If PNG fails, try JPEG
                        try {
                            dataURL = canvas.toDataURL('image/jpeg', 0.9);
                        } catch (e2) {
                            // If both fail, try with lower quality
                            dataURL = canvas.toDataURL('image/jpeg', 0.7);
                        }
                    }

                    img.src = dataURL; // Update the image src to base64
                    resolve(dataURL);

                } catch (error) {
                    console.error('Canvas conversion error:', error);

                    // If CORS error, try to fetch the image through a proxy
                    if (error.name === 'SecurityError' || error.message.includes('CORS')) {
                        // console.log('CORS error detected, trying proxy image approach...');
                        createProxyImage(imgElement).then(resolve).catch((proxyError) => {
                            // console.log('Proxy image failed, trying fetch approach...');
                            tryFetchImage(img.src).then(resolve).catch(reject);
                        });
                    } else {
                        reject(new Error('Cannot convert image to base64: ' + error.message));
                    }
                }
            };

            // Alternative approach: fetch image through a proxy
            const tryFetchImage = async (src) => {
                try {
                    // Try to fetch the image as blob
                    const response = await fetch(src, { mode: 'cors' });
                    if (!response.ok) throw new Error('Failed to fetch image');

                    const blob = await response.blob();
                    const reader = new FileReader();

                    return new Promise((resolve, reject) => {
                        reader.onload = () => {
                            const dataURL = reader.result;
                            imgElement.src = dataURL;
                            resolve(dataURL);
                        };
                        reader.onerror = () => reject(new Error('Failed to read image blob'));
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    throw new Error('Cannot convert image to base64 due to CORS restrictions. Please use "Re-upload Image" option.');
                }
            };

            // Check if image is already loaded
            if (imgElement.complete && imgElement.naturalWidth > 0) {
                tryConversion(imgElement);
                return;
            }

            // Image not loaded yet, wait for it
            const onLoad = () => {
                tryConversion(imgElement);
            };

            const onError = () => {
                reject(new Error('Could not load image. This may be due to CORS restrictions or network issues.'));
            };

            // Set up event listeners
            imgElement.addEventListener('load', onLoad, { once: true });
            imgElement.addEventListener('error', onError, { once: true });

            // Try different CORS settings
            if (!imgElement.crossOrigin) {
                imgElement.crossOrigin = 'anonymous';
            }

            // If image is already loaded, trigger the load event
            if (imgElement.complete) {
                setTimeout(() => {
                    if (imgElement.naturalWidth > 0) {
                        onLoad();
                    } else {
                        onError();
                    }
                }, 0);
            }
        });
    }

    async function analyzeImage(imageData, analysisType, streaming = false) {
        try {
            // Use the same authentication system as other AI features
            const userEmail = await getUserEmailFromExtension();
            if (!userEmail) {
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features. Click the sign-in button in the extension.');
            }

            // Check if AI is unlocked (same as other AI features)
            const isUnlocked = await checkAIUnlockStatus();
            if (isUnlocked) {
                // console.log('AI is unlocked - bypassing daily limit for OCR');
                // Use unlimited request for unlocked users
                return await makeUnlimitedOCRRequest(imageData, analysisType, userEmail, streaming);
            }

            // Get backend URL
            const backendUrl = serverSelector.getServerUrl();

            // For regular users, use the standard request flow
            const response = await fetch(`${backendUrl}/api/ai/analyze-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify({
                    imageData: imageData,
                    analysisType: analysisType,
                    streaming: streaming
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 429) {
                    throw new Error(chrome.i18n.getMessage('ai_imageAnalysisLimitReached') || 'Daily limit reached');
                }
                throw new Error(errorData.error || chrome.i18n.getMessage('ai_imageAnalysisError') || 'Analysis failed');
            }

            if (streaming) {
                // Return the response for streaming
                return response;
            } else {
                const data = await response.json();
                return data.result;
            }

        } catch (error) {
            console.error('Image analysis API error:', error);
            throw error;
        }
    }

    // Helper function to check AI unlock status (same as ai-service.js)
    async function checkAIUnlockStatus() {
        try {
            const aiUnlocked = await dbManager.getSetting('aiUnlocked');
            return aiUnlocked === true;
        } catch (error) {
            console.error('Error checking AI unlock status:', error);
            return false;
        }
    }

    // Helper function to make unlimited OCR request (bypass daily limit)
    async function makeUnlimitedOCRRequest(imageData, analysisType, userEmail, streaming = false) {
        try {
            // Get backend URL
            const backendUrl = serverSelector.getServerUrl();

            const response = await fetch(`${backendUrl}/api/ai/analyze-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify({
                    imageData: imageData,
                    analysisType: analysisType,
                    streaming: streaming
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || chrome.i18n.getMessage('ai_imageAnalysisError') || 'Analysis failed');
            }

            if (streaming) {
                // Return the response for streaming
                return response;
            } else {
                const data = await response.json();
                return data.result;
            }

        } catch (error) {
            console.error('Unlimited OCR request failed:', error);
            throw error;
        }
    }

    function downloadImage(imgElement) {
        try {
            // Create a temporary canvas to convert image to blob
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size to image size
            canvas.width = imgElement.naturalWidth || imgElement.width;
            canvas.height = imgElement.naturalHeight || imgElement.height;

            // Draw image on canvas
            ctx.drawImage(imgElement, 0, 0);

            // Convert canvas to blob
            canvas.toBlob((blob) => {
                if (!blob) {
                    throw new Error(chrome.i18n.getMessage('ai_imageDownloadError') || 'Failed to create image blob');
                }

                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;

                // Generate filename with timestamp
                const now = new Date();
                const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
                link.download = `image-${timestamp}.png`;

                // Trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Clean up
                URL.revokeObjectURL(url);

                showToast(chrome.i18n.getMessage('ai_imageDownloadSuccess') || 'Image downloaded successfully', 'success');
            }, 'image/png');

        } catch (error) {
            console.error('Download error:', error);
            showToast(chrome.i18n.getMessage('ai_imageDownloadError') || 'Failed to download image', 'error');
        }
    }


    function displayImageAnalysisResult(result, analysisType) {
        if (!currentImageElement) {
            console.error('No current image element for displaying result');
            return;
        }

        // Format AI result with basic HTML formatting
        const formattedText = formatAIResult(result);
        // console.log('Formatted text:', formattedText);

        // Insert OCR result below the image
        insertOCRResultBelowImage(formattedText);
    }

    function formatAIResult(text) {
        if (!text) return '';

        // Convert to completely plain text - remove ALL markdown formatting
        let formattedText = text
            // Remove all markdown headers
            .replace(/^#{1,6}\s+(.*)$/gm, '$1')
            // Remove all bold/italic formatting
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/_(.*?)_/g, '$1')
            // Remove all code formatting
            .replace(/```([\s\S]*?)```/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            // Convert lists to simple text
            .replace(/^\*\s+(.*)$/gm, '• $1')
            .replace(/^-\s+(.*)$/gm, '• $1')
            .replace(/^\d+\.\s+(.*)$/gm, '$1')
            // Remove blockquotes
            .replace(/^>\s*(.*)$/gm, '$1')
            // Remove horizontal rules
            .replace(/^[-*_]{3,}$/gm, '')
            // Remove extra line breaks
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .replace(/\n\n+/g, '\n\n')
            .trim();

        return formattedText;
    }

    function insertOCRResultBelowImage(formattedText) {
        if (!currentImageElement || !formattedText) {
            console.error('Missing currentImageElement or formattedText');
            return;
        }

        // Method 1: Try inserting into Quill editor directly in code block
        if (quillEditor) {
            try {
                // console.log('Attempting to insert OCR result into Quill editor in code block...');

                // Find the position of the image in the editor
                const imageBlot = quillEditor.root.querySelector(`img[src="${currentImageElement.src}"]`);
                let insertIndex = quillEditor.getLength() - 1;

                if (imageBlot) {
                    // Get the Blot object for the image
                    const blot = window.Quill.find(imageBlot);
                    if (blot) {
                        // Get the index of the image in the editor
                        insertIndex = quillEditor.getIndex(blot);
                        // Insert after the image (image takes 1 character)
                        insertIndex += 1;
                    }
                }

                // Insert line break before code block
                quillEditor.insertText(insertIndex, '\n');
                insertIndex += 1;

                // Insert OCR text
                quillEditor.insertText(insertIndex, formattedText);
                quillEditor.formatText(insertIndex, formattedText.length, 'code-block', true);
                insertIndex += formattedText.length;

                // Add an extra newline inside code block to ensure last line is included
                quillEditor.insertText(insertIndex, '\n');
                quillEditor.formatText(insertIndex, 1, 'code-block', true);
                insertIndex += 1;

                // Add line break after code block
                quillEditor.insertText(insertIndex, '\n');

                // console.log('OCR result inserted into Quill editor in code block successfully');

                // Mark as unsaved and save
                markAsUnsaved();
                saveNoteWithContext('content');

                // Scroll to show the result
                setTimeout(() => {
                    const editor = document.getElementById('editor');
                    if (editor) {
                        editor.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }, 100);

                return;
            } catch (error) {
                console.error('Failed to insert into Quill editor:', error);
            }
        }

        // Method 2: Fallback - Insert into DOM as plain text
        // console.log('Falling back to DOM insertion as plain text...');

        // Create simple OCR result container - plain text only
        const resultContainer = document.createElement('div');
        resultContainer.textContent = formattedText;
        resultContainer.setAttribute('data-ocr-result', 'true');
        resultContainer.style.cssText = `
            margin: 8px 0;
            padding: 8px;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.4;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;

        // console.log('Created result container:', resultContainer);

        // Insert after the image
        const parent = currentImageElement.parentNode;
        const nextSibling = currentImageElement.nextSibling;

        // console.log('Parent element:', parent);
        // console.log('Next sibling:', nextSibling);

        if (nextSibling) {
            parent.insertBefore(resultContainer, nextSibling);
            // console.log('Inserted before next sibling');
        } else {
            parent.appendChild(resultContainer);
            // console.log('Appended to parent');
        }

        // Mark as unsaved and save
        markAsUnsaved();
        saveNoteWithContext('content');

        // Scroll to show the result with smooth animation
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);

        // console.log('OCR result inserted successfully');
    }

    // Helper function to check if an image should have context menu
    function shouldAddContextMenu(img) {
        if (!img || img.tagName !== 'IMG') return false;

        // Exclude images in toolbar or buttons
        if (img.closest('.toolbar, .top-bar, button, .toolbar-btn')) return false;

        // Exclude images with certain classes
        if (img.classList.contains('toolbar-icon') || img.classList.contains('button-icon')) return false;

        // Exclude SVG images or very small images (likely icons)
        if (img.src && (img.src.endsWith('.svg') || img.width < 32 || img.height < 32)) return false;

        // Only include images that are in the editor
        if (!editor.contains(img)) return false;

        // Exclude images in Quill toolbar
        if (img.closest('.ql-toolbar, .ql-picker')) return false;

        return true;
    }

    // Add context menu event listeners to existing images
    function addImageContextMenus() {
        const images = editor.querySelectorAll('img');
        images.forEach(img => {
            if (!img.hasAttribute('data-context-menu-added') && shouldAddContextMenu(img)) {
                try {
                    img.addEventListener('contextmenu', handleImageContextMenu);
                    img.setAttribute('data-context-menu-added', 'true');
                    // console.log('Context menu added to image:', img.src);
                } catch (error) {
                    console.error('Error adding context menu to image:', error);
                }
            }
        });
    }

    // Add context menu to images when they are added
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'IMG') {
                        if (shouldAddContextMenu(node)) {
                            try {
                                node.addEventListener('contextmenu', handleImageContextMenu);
                                node.setAttribute('data-context-menu-added', 'true');
                                // console.log('Context menu added to new image:', node.src);
                            } catch (error) {
                                console.error('Error adding context menu to new image:', error);
                            }
                        }
                    } else if (node.querySelectorAll) {
                        const images = node.querySelectorAll('img');
                        images.forEach(img => {
                            if (!img.hasAttribute('data-context-menu-added') && shouldAddContextMenu(img)) {
                                try {
                                    img.addEventListener('contextmenu', handleImageContextMenu);
                                    img.setAttribute('data-context-menu-added', 'true');
                                    // console.log('Context menu added to nested image:', img.src);
                                } catch (error) {
                                    console.error('Error adding context menu to nested image:', error);
                                }
                            }
                        });
                    }
                }
            });
        });
    });

    // Start observing
    observer.observe(editor, { childList: true, subtree: true });

    // Add context menus to existing images on load
    addImageContextMenus();

    // Helper function to safely add context menu to any image
    function safeAddImageContextMenu(img) {
        if (!shouldAddContextMenu(img)) return false;

        try {
            if (!img.hasAttribute('data-context-menu-added')) {
                img.addEventListener('contextmenu', handleImageContextMenu);
                img.setAttribute('data-context-menu-added', 'true');
                // console.log('Context menu added to image:', img.src);
                return true;
            }
        } catch (error) {
            console.error('Error adding context menu to image:', error);
        }
        return false;
    }

    // Helper function to create a proxy image for CORS issues
    function createProxyImage(originalImg) {
        return new Promise((resolve, reject) => {
            try {
                // Create a new image element
                const proxyImg = new Image();

                // Set up event handlers
                proxyImg.onload = () => {
                    try {
                        // Create canvas to convert to base64
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        canvas.width = proxyImg.naturalWidth;
                        canvas.height = proxyImg.naturalHeight;
                        ctx.drawImage(proxyImg, 0, 0);

                        const dataURL = canvas.toDataURL('image/png');

                        // Update original image
                        originalImg.src = dataURL;
                        originalImg.setAttribute('data-proxy-converted', 'true');

                        resolve(dataURL);
                    } catch (error) {
                        reject(error);
                    }
                };

                proxyImg.onerror = () => {
                    reject(new Error('Failed to load proxy image'));
                };

                // Try to load the image with different CORS settings
                proxyImg.crossOrigin = 'anonymous';
                proxyImg.src = originalImg.src;

            } catch (error) {
                reject(error);
            }
        });
    }

    // Periodically check for images without context menus (for images added by external scripts)
    setInterval(() => {
        const images = editor.querySelectorAll('img:not([data-context-menu-added])');
        images.forEach(img => {
            safeAddImageContextMenu(img);
        });
    }, 2000); // Check every 2 seconds

    // Hide image context menu when clicking outside
    document.addEventListener('click', hideImageContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideImageContextMenu();
        }
    });

    // Horizontal scroll functionality for toolbar
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    toolbarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        toolbarContainer.style.cursor = 'grabbing';
        startX = e.pageX - toolbarContainer.offsetLeft;
        scrollLeft = toolbarContainer.scrollLeft;
    });

    toolbarContainer.addEventListener('mouseleave', () => {
        isDragging = false;
        toolbarContainer.style.cursor = 'grab';
    });

    toolbarContainer.addEventListener('mouseup', () => {
        isDragging = false;
        toolbarContainer.style.cursor = 'grab';
    });

    toolbarContainer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - toolbarContainer.offsetLeft;
        const walk = (x - startX) * 2;
        toolbarContainer.scrollLeft = scrollLeft - walk;
    });

    // Set initial cursor style
    toolbarContainer.style.cursor = 'grab';

    // Optimize toolbar width for large screens
    function optimizeToolbarForLargeScreens() {
        if (!toolbar || !toolbarContainer) return;

        const screenWidth = window.innerWidth;

        // Only apply optimization for screens >= 1024px
        if (screenWidth >= 1024) {
            // Temporarily reset width to get actual content width
            toolbarContainer.style.width = 'auto';
            toolbarContainer.style.maxWidth = 'none';

            // Force a reflow to get accurate measurements
            toolbarContainer.offsetHeight;

            // Get the actual width of toolbar container after it wraps content
            // Use offsetWidth which includes padding and border
            const actualWidth = toolbarContainer.offsetWidth;

            // Ensure it doesn't exceed screen width
            const finalWidth = Math.min(actualWidth, screenWidth - 40);

            // Apply the calculated width to toolbar container
            toolbarContainer.style.width = `${finalWidth}px`;
            toolbarContainer.style.maxWidth = `${finalWidth}px`;

            // Apply width to AI input bar with a reasonable max width
            if (aiInputBar) {
                // AI input bar should have a max width of 600px for better UX
                const aiInputMaxWidth = Math.min(finalWidth, 600);
                aiInputBar.style.width = `${aiInputMaxWidth}px`;
                aiInputBar.style.maxWidth = `${aiInputMaxWidth}px`;
            }

            // Enable/disable scrolling based on whether toolbar fits
            if (actualWidth <= screenWidth - 40) {
                // Toolbar fits completely, disable scrolling
                toolbarContainer.style.overflowX = 'hidden';
            } else {
                // Toolbar is too wide, enable scrolling
                toolbarContainer.style.overflowX = 'auto';
            }
        } else {
            // Reset for smaller screens
            toolbarContainer.style.width = '';
            toolbarContainer.style.maxWidth = '';
            toolbarContainer.style.overflowX = 'auto';

            if (aiInputBar) {
                aiInputBar.style.width = '';
                aiInputBar.style.maxWidth = '';
            }
        }
    }

    // Call optimization on load and resize
    // This ensures toolbar is properly sized when page loads
    optimizeToolbarForLargeScreens();

    // Debounced resize handler to avoid excessive calculations
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(optimizeToolbarForLargeScreens, 150);
    });

    // Also re-optimize when toolbar buttons are added/removed dynamically
    // This observer watches for changes in toolbar structure
    const toolbarObserver = new MutationObserver(() => {
        optimizeToolbarForLargeScreens();
    });

    if (toolbar) {
        toolbarObserver.observe(toolbar, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });
    }

    // AI Input Bar Functions
    function toggleAIInputBar() {
        if (!aiInputBar) {
            console.error('AI Input Bar not found!');
            return;
        }

        if (aiInputBar.classList.contains('show')) {
            hideAIInputBar();
        } else {
            showAIInputBar();
        }
    }

    function showAIInputBar() {
        if (!aiInputBar) return;

        // Close all other modals when opening AI input (but not AI input bar itself)
        // console.log('Closing other modals before showing AI Input Bar');
        closeAllFormattingModals();

        const aiToneMenu = document.getElementById('ai-tone-menu');
        if (aiToneMenu && aiToneMenu.classList.contains('show')) {
            aiToneMenu.classList.remove('show');
            // Remove active state from AI Tone button
            const aiToneBtn = document.getElementById('ai-tone-btn');
            if (aiToneBtn) {
                aiToneBtn.classList.remove('active');
            }
        }

        const aiFormattingMenu = document.getElementById('ai-formatting-menu');
        if (aiFormattingMenu && aiFormattingMenu.classList.contains('show')) {
            aiFormattingMenu.classList.remove('show');
            // Remove active state from AI Formatting button
            const aiFormattingBtn = document.getElementById('ai-formatting-btn');
            if (aiFormattingBtn) {
                aiFormattingBtn.classList.remove('active');
            }
        }

        const backgroundPickerModal = document.getElementById('background-picker-modal');
        if (backgroundPickerModal && backgroundPickerModal.classList.contains('show')) {
            backgroundPickerModal.classList.remove('show');
            setTimeout(() => {
                backgroundPickerModal.style.display = 'none';
            }, 300);
        }

        const shareModal = document.getElementById('share-modal');
        if (shareModal && shareModal.classList.contains('show')) {
            shareModal.classList.remove('show');
        }

        // Clear any old context if opening without selected text
        if (!window.selectedTextForAI) {
            removeSelectedTextIndicator();
        }

        // Use morph animation with .show class
        requestAnimationFrame(() => {
            aiInputBar.classList.add('show');
            if (aiInput) {
                setTimeout(() => aiInput.focus(), 100);
            }
        });

        if (aiAssistantBtn) {
            aiAssistantBtn.classList.add('ai-active');
        }
    }

    function hideAIInputBar() {
        try {
            if (!aiInputBar) return;

            // Remove .show class for morph animation
            aiInputBar.classList.remove('show');

            const inputElement = document.getElementById('ai-input');
            if (inputElement) {
                inputElement.value = '';
                inputElement.placeholder = chrome.i18n.getMessage('ai_inputPlaceholder') || 'Ask AI anything...';
            }

            if (aiSubmitBtn) {
                aiSubmitBtn.disabled = true;
            }

            if (typeof hideAIResult === 'function') {
                hideAIResult(); // Hide AI result when closing input bar
            }

            if (aiAssistantBtn) {
                aiAssistantBtn.classList.remove('ai-active');
            }

            // Clear selected text context when closing
            removeSelectedTextIndicator();
        } catch (e) {
            console.error('Error in hideAIInputBar:', e);
        }
    }






    function handleAIInputChange() {
        const inputElement = document.getElementById('ai-input');
        if (!inputElement) return;

        const hasText = inputElement.value.trim().length > 0;
        aiSubmitBtn.disabled = !hasText;
    }

    function handleAIInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!aiSubmitBtn.disabled) {
                handleAISubmit();
            }
        } else if (e.key === 'Escape') {
            hideAIInputBar();
        }
    }

    async function handleAISubmit() {
        const inputElement = document.getElementById('ai-input');
        if (!inputElement) return;

        const command = inputElement.value.trim();
        if (!command) return;

        try {
            await processAICommand(command);
            // Clear input text but keep container open to display result
            inputElement.value = '';
            aiSubmitBtn.disabled = true;
            // Don't hide AI input bar, keep it expanded to show result
        } catch (error) {
            console.error('AI command failed:', error);
            // Error toast is already shown in sendToAI function
        }
    }

    async function handleAISuggestion(action) {
        const commands = {
            'summarize': chrome.i18n.getMessage('ai_summarize').toLowerCase(),
            'expand': chrome.i18n.getMessage('ai_expand').toLowerCase(),
            'improve': chrome.i18n.getMessage('ai_improve').toLowerCase(),
            'suggestions': chrome.i18n.getMessage('ai_suggestions').toLowerCase(),
            'outline': chrome.i18n.getMessage('ai_outline').toLowerCase(),
            'tone': chrome.i18n.getMessage('ai_tone').toLowerCase(),
            'save': chrome.i18n.getMessage('ai_save').toLowerCase(),
            'search': chrome.i18n.getMessage('ai_search').toLowerCase()
        };

        const inputElement = document.getElementById('ai-input');
        if (inputElement) {
            inputElement.value = commands[action] || action;
            inputElement.focus();
        }
        aiSubmitBtn.disabled = false;
    }

    async function processAICommand(command) {
        // Check if we have selected text for AI
        const hasSelectedText = window.selectedTextForAI && window.selectedTextForAI.trim();

        // If we have selected text, use it as context
        let processedCommand = command;
        if (hasSelectedText) {
            processedCommand = `${chrome.i18n.getMessage('ai_selectedText') || 'Selected text'}: "${window.selectedTextForAI}"\n\n${chrome.i18n.getMessage('ai_userRequest') || 'User request'}: ${command}`;
            // console.log('Using selected text as context:', window.selectedTextForAI);
        }

        // Show loading state
        aiSubmitBtn.disabled = true;
        aiSubmitBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                    <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                    <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                </circle>
            </svg>
        `;

        // Add spinning animation to AI assistant button in toolbar
        const aiAssistantBtn = document.getElementById('ai-assistant-btn');
        if (aiAssistantBtn) {
            aiAssistantBtn.classList.add('ai-processing');
        }

        try {
            // Don't clear selection info yet - we need it for apply
            // Just remove the visual indicator
            const indicator = document.getElementById('selected-text-indicator');
            if (indicator && hasSelectedText) {
                indicator.remove();
            }

            let result;

            // Use processed command for AI processing
            if (hasSelectedText || processedCommand !== command) {
                // For commands with context (selected text), use processed command
                result = await sendToAI('chat', { message: processedCommand });
            } else {
                // For general chat without context
                result = await sendToAI('chat', { message: command });
            }

            // Display AI result in the new result area
            if (result && result.trim()) {
                showAIResult(result, command);
                // AI processing completed - no toast needed
            } else {
                showErrorToast(chrome.i18n.getMessage('toast_aiResponseFailed') || 'AI failed');
            }

        } catch (error) {
            console.error('AI processing failed:', error);
            // Error toast is already shown in sendToAI function
        } finally {
            // Reset button state
            aiSubmitBtn.disabled = false;
            aiSubmitBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;

            // Remove spinning animation from AI assistant button in toolbar
            const aiAssistantBtn = document.getElementById('ai-assistant-btn');
            if (aiAssistantBtn) {
                aiAssistantBtn.classList.remove('ai-processing');
            }
        }
    }

    function getNoteTextContent() {
        return quillEditor ? quillEditor.getText() : '';
    }

    // Format AI response - unified approach (same as AI chat)
    function formatAIResponse(content) {
        // Use MarkdownProcessor if available
        if (window.MarkdownProcessor && window.MarkdownProcessor.toHTML) {
            try {
                return window.MarkdownProcessor.toHTML(content);
            } catch (error) {
                console.error('[Note] Error formatting with MarkdownProcessor:', error);
                // Fallback to simple formatting
            }
        }

        // Fallback: Simple formatting
        let formatted = escapeHtml(content);
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        formatted = formatted.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
        formatted = formatted.replace(/^- \[ \] (.+)$/gm, '<div style="display: flex; align-items: center; margin: 0; padding: 0; line-height: 1.4;"><input type="checkbox" style="margin-right: 8px; margin-top: 0; flex-shrink: 0;" onchange="toggleTask(this)"> <span style="flex: 1;">$1</span></div>');
        formatted = formatted.replace(/^- \[x\] (.+)$/gm, '<div style="display: flex; align-items: center; margin: 0; padding: 0; line-height: 1.4;"><input type="checkbox" checked style="margin-right: 8px; margin-top: 0; flex-shrink: 0;" onchange="toggleTask(this)"> <span style="flex: 1; text-decoration: line-through; opacity: 0.7;">$1</span></div>');
        formatted = formatted.replace(/^## (.+)$/gm, '<h2 style="margin: 16px 0 8px 0; font-size: 18px; font-weight: 600; color: inherit;">$1</h2>');
        formatted = formatted.replace(/^### (.+)$/gm, '<h3 style="margin: 12px 0 6px 0; font-size: 16px; font-weight: 600; color: inherit;">$1</h3>');
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    // Format AI response for note display (legacy - keeping for backward compatibility)
    function formatAIResponseForNote(content) {
        // Use the unified formatting function
        return formatAIResponse(content);
    }

    // Escape HTML function
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Toggle task completion
    function toggleTask(checkbox) {
        const span = checkbox.nextElementSibling;
        if (checkbox.checked) {
            span.style.textDecoration = 'line-through';
            span.style.opacity = '0.7';
        } else {
            span.style.textDecoration = 'none';
            span.style.opacity = '1';
        }

        // Mark as unsaved and save
        markAsUnsaved();
        saveNoteWithContext('content');
    }

    // Make toggleTask globally available
    window.toggleTask = toggleTask;

    // Color picker functions - using overlay

    function generateColorPalette(type) {
        const colors = [
            '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
            '#FF0000', '#FF6600', '#FFCC00', '#00FF00', '#0066FF', '#6600FF',
            '#FF0066', '#FF3366', '#FF6699', '#FF99CC', '#FFCCFF', '#CC99FF',
            '#9966FF', '#6633FF', '#3300FF', '#0033FF', '#0066FF', '#0099FF',
            '#00CCFF', '#00FFFF', '#00FFCC', '#00FF99', '#00FF66', '#00FF33'
        ];

        return colors.map(color => `
            <div class="color-option" data-color="${color}" style="background-color: ${color}; border: 1px solid #ccc;"></div>
        `).join('');
    }

    // Link dialog function
    function openLinkDialog() {
        openLinkOverlay();
    }



    async function sendToAI(action, params) {
        // console.log('sendToAI called with action:', action, 'params:', params);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // console.log('AI request timeout');
                reject(new Error('Request timeout. Please try again.'));
            }, 35000);

            // Convert action to proper camelCase for service worker
            const actionMap = {
                'meeting-notes': 'aiMeetingNotes',
                'smart-summary': 'aiSmartSummary',
                'meeting-summary': 'aiMeetingSummary'
            };

            const message = {
                action: actionMap[action] || `ai${action.charAt(0).toUpperCase() + action.slice(1)}`,
                ...params
            };

            chrome.runtime.sendMessage(message, (response) => {
                clearTimeout(timeout);
                // console.log('Received response from service worker:', response);

                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    // console.log('AI request successful, result:', response.result);
                    resolve(response.result);
                } else {
                    const errorMessage = response?.error || 'AI request failed';
                    console.error('AI request failed:', errorMessage);

                    // Show specific error toast based on error message
                    if (errorMessage.includes('sign in') || errorMessage.includes('login')) {
                        showErrorToast(chrome.i18n.getMessage('ai_signInRequired') || 'Sign in to use AI');
                    } else if (errorMessage.includes('usage limit') || errorMessage.includes('limit reached')) {
                        showErrorToast(chrome.i18n.getMessage('ai_dailyLimitReached') || 'Daily limit reached');
                    } else if (errorMessage.includes('authentication') || errorMessage.includes('auth')) {
                        showErrorToast(chrome.i18n.getMessage('messages_authenticationFailed') || 'Authentication failed');
                    } else {
                        showErrorToast(chrome.i18n.getMessage('toast_aiResponseFailed') || 'AI failed');
                    }

                    reject(new Error(errorMessage));
                }
            });
        });
    }

    // Store original markdown content for applying to editor
    let originalAIContent = '';

    // AI Result Display Functions - Only show AI response
    function showAIResult(content, userQuery = '') {
        if (!aiResultArea || !aiAiMessage) return;

        // Store original markdown content
        originalAIContent = content;

        // Format and show AI response only
        const formattedContent = formatAIResponse(content);
        const aiContent = aiAiMessage.querySelector('.message-content');
        if (aiContent) {
            aiContent.innerHTML = formattedContent;
            aiAiMessage.style.display = 'block';
        }

        // Show action buttons
        if (aiResultActions) {
            aiResultActions.style.display = 'flex';
        }

        // Show result area
        aiResultArea.style.display = 'block';

        // Scroll to result area
        aiResultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function hideAIResult() {
        if (!aiResultArea) return;
        aiResultArea.style.display = 'none';

        // Hide AI message and action buttons
        if (aiAiMessage) aiAiMessage.style.display = 'none';
        if (aiResultActions) aiResultActions.style.display = 'none';

        // Clear AI content
        if (aiAiMessage) {
            const aiContent = aiAiMessage.querySelector('.message-content');
            if (aiContent) aiContent.textContent = '';
        }

        // Clear selection info when closing result without applying
        window.selectedTextForAI = null;
        window.selectedTextInfo = null;
        await dbManager.deleteSetting('aiSelectedText');
        await dbManager.deleteSetting('aiSelectionInfo');
        await dbManager.deleteSetting('aiContextTimestamp');
    }

    function copyAIResult() {
        if (!aiAiMessage) return;

        // Use original markdown content for copying
        const content = originalAIContent || '';
        if (!content) return;

        // Convert markdown to plain text before copying
        let plainText = content;

        if (window.MarkdownProcessor && window.MarkdownProcessor.toPlainText) {
            plainText = window.MarkdownProcessor.toPlainText(content);
            console.log('[Note AI] Converted markdown to plain text for clipboard');
        } else {
            console.warn('[Note AI] MarkdownProcessor not available, copying as-is');
        }

        navigator.clipboard.writeText(plainText).then(() => {
            // AI result copied to clipboard - no toast needed
        }).catch(err => {
            console.error('Failed to copy AI result:', err);
            showErrorToast(chrome.i18n.getMessage('toast_operationFailed') || 'Operation failed');
        });
    }

    function applyAIResult() {
        if (!aiAiMessage) return;

        // Use original markdown content instead of formatted HTML
        const content = originalAIContent || '';
        if (!content) return;

        // Smart apply: check if we have selection info
        if (window.selectedTextInfo && window.selectedTextInfo.index !== undefined) {
            console.log('[AI Result] Applying with replace, selection info:', window.selectedTextInfo);
            insertAndReplaceAIContent(content, window.selectedTextInfo);
        } else {
            console.log('[AI Result] Applying with append (no selection info)');
            applyAIContent(content);
        }

        hideAIResult();
    }

    // Event listeners for AI result actions
    if (aiCopyResultBtn) {
        aiCopyResultBtn.addEventListener('click', copyAIResult);
    }

    if (aiApplyResultBtn) {
        aiApplyResultBtn.addEventListener('click', applyAIResult);
    }

    if (aiCloseResultBtn) {
        aiCloseResultBtn.addEventListener('click', hideAIResult);
    }

    // Listen for AI content application and language changes
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'applyAIContent') {
            console.log('[Note] Received applyAIContent via chrome.runtime.onMessage');
            applyAIContent(request.content);
            sendResponse({ success: true });
        } else if (request.action === 'insertAndReplaceAIContent') {
            console.log('[Note] Received insertAndReplaceAIContent via chrome.runtime.onMessage');
            insertAndReplaceAIContent(request.content, request.selectionInfo);
            sendResponse({ success: true });
        }
    });

    // Listen for postMessage from AI chat window
    window.addEventListener('message', (event) => {
        // Security check - only accept messages from same origin
        if (event.origin !== window.location.origin) {
            return;
        }

        if (event.data && event.data.action === 'applyAIContent') {
            console.log('[Note] Received applyAIContent via postMessage');
            applyAIContent(event.data.content);
        } else if (event.data && event.data.action === 'insertAndReplaceAIContent') {
            console.log('[Note] Received insertAndReplaceAIContent via postMessage');
            insertAndReplaceAIContent(event.data.content, event.data.selectionInfo);
        }
    });

    // Insert and replace AI content at specific selection
    async function insertAndReplaceAIContent(content, selectionInfo) {
        if (!quillEditor) {
            console.error('[AI Content] Quill editor not available');
            return;
        }

        console.log('[AI Content] Insert and replace:', {
            contentLength: content.length,
            selectionInfo: selectionInfo
        });

        // Save current state to undo history BEFORE making changes
        saveToUndoHistory();

        // Validate selection info
        if (!selectionInfo || typeof selectionInfo.index !== 'number' || typeof selectionInfo.length !== 'number') {
            console.warn('[AI Content] Invalid selection info, falling back to append');
            applyAIContent(content);
            return;
        }

        // Check if selection is still valid (not too old)
        const selectionAge = Date.now() - (selectionInfo.timestamp || 0);
        if (selectionAge > 300000) { // 5 minutes
            console.warn('[AI Content] Selection too old, falling back to append');
            applyAIContent(content);
            return;
        }

        // Use MarkdownProcessor for consistent handling
        if (window.MarkdownProcessor && window.MarkdownProcessor.insertIntoQuill) {
            try {
                // Delete the selected text first
                console.log('[AI Content] Deleting selection at:', selectionInfo.index, 'length:', selectionInfo.length);
                quillEditor.deleteText(selectionInfo.index, selectionInfo.length, 'user');

                // Insert new content at the same position
                console.log('[AI Content] Inserting new content at:', selectionInfo.index);
                window.MarkdownProcessor.insertIntoQuill(quillEditor, content, selectionInfo.index);

                console.log('[AI Content] Successfully replaced using MarkdownProcessor');
            } catch (error) {
                console.error('[AI Content] Error with MarkdownProcessor:', error);
                // Fallback to append
                applyAIContent(content);
                return;
            }
        } else {
            console.warn('[AI Content] MarkdownProcessor not available, using fallback');
            try {
                // Delete selection
                quillEditor.deleteText(selectionInfo.index, selectionInfo.length, 'user');

                // Insert content
                if (typeof marked !== 'undefined' && window.MarkdownProcessor && window.MarkdownProcessor.toHTML) {
                    const html = window.MarkdownProcessor.toHTML(content);
                    quillEditor.clipboard.dangerouslyPasteHTML(selectionInfo.index, html, 'user');
                } else {
                    quillEditor.insertText(selectionInfo.index, content, 'user');
                }
            } catch (error) {
                console.error('[AI Content] Fallback failed:', error);
                applyAIContent(content);
                return;
            }
        }

        markAsUnsaved();
        saveNoteWithContext('content');

        // Clear selection info after successful replace
        window.selectedTextInfo = null;
        await dbManager.deleteSetting('aiSelectedText');
        await dbManager.deleteSetting('aiSelectionInfo');
        await dbManager.deleteSetting('aiContextTimestamp');

        console.log('[AI Content] Content inserted and replaced successfully');
    }

    function applyAIContent(content) {
        if (!quillEditor) {
            console.error('[AI Content] Quill editor not available');
            return;
        }

        console.log('[AI Content] Applying to editor:', {
            contentLength: content.length,
            contentPreview: content.substring(0, 100),
            hasMarkdownProcessor: !!(window.MarkdownProcessor),
            hasMarked: !!(typeof marked !== 'undefined')
        });

        // Save current state to undo history BEFORE making changes
        saveToUndoHistory();

        // Use MarkdownProcessor for consistent handling
        if (window.MarkdownProcessor && window.MarkdownProcessor.insertIntoQuill) {
            try {
                if (savedSelection && savedSelection.index !== undefined && savedSelection.length !== undefined) {
                    // Replace selection
                    console.log('[AI Content] Replacing selection at:', savedSelection.index, 'length:', savedSelection.length);
                    quillEditor.deleteText(savedSelection.index, savedSelection.length, 'user');
                    window.MarkdownProcessor.insertIntoQuill(quillEditor, content, savedSelection.index);
                    savedSelection = null;
                } else {
                    // Insert at cursor or end
                    const selection = quillEditor.getSelection();
                    const insertIndex = selection ? selection.index : quillEditor.getLength() - 1;
                    console.log('[AI Content] Inserting at index:', insertIndex);
                    window.MarkdownProcessor.insertIntoQuill(quillEditor, content, insertIndex);
                }
                console.log('[AI Content] Successfully inserted using MarkdownProcessor');
            } catch (error) {
                console.error('[AI Content] Error with MarkdownProcessor:', error);
                // Fallback: Try to convert markdown to HTML and paste
                try {
                    if (window.MarkdownProcessor && window.MarkdownProcessor.toHTML) {
                        const html = window.MarkdownProcessor.toHTML(content);
                        const insertIndex = quillEditor.getLength() - 1;
                        quillEditor.clipboard.dangerouslyPasteHTML(insertIndex, html, 'user');
                        console.log('[AI Content] Inserted using HTML paste fallback');
                    } else {
                        // Last resort: plain text
                        const insertIndex = quillEditor.getLength() - 1;
                        quillEditor.insertText(insertIndex, content, 'user');
                        console.log('[AI Content] Inserted as plain text');
                    }
                } catch (fallbackError) {
                    console.error('[AI Content] Fallback also failed:', fallbackError);
                    // Absolute last resort
                    const insertIndex = quillEditor.getLength() - 1;
                    quillEditor.insertText(insertIndex, content, 'user');
                }
            }
        } else {
            console.warn('[AI Content] MarkdownProcessor not available');
            // Try HTML paste if possible
            try {
                if (typeof marked !== 'undefined') {
                    const html = marked.parse(content);
                    const insertIndex = quillEditor.getLength() - 1;
                    quillEditor.clipboard.dangerouslyPasteHTML(insertIndex, html, 'user');
                    console.log('[AI Content] Inserted using marked.js directly');
                } else {
                    const insertIndex = quillEditor.getLength() - 1;
                    quillEditor.insertText(insertIndex, content, 'user');
                    console.log('[AI Content] Inserted as plain text (no markdown support)');
                }
            } catch (error) {
                console.error('[AI Content] Error:', error);
                const insertIndex = quillEditor.getLength() - 1;
                quillEditor.insertText(insertIndex, content, 'user');
            }
        }

        markAsUnsaved();
        saveNoteWithContext('content');

        // AI content applied - no toast needed
    }

    // AI Functions
    let floatingAIButton = null;
    let currentSelection = null;
    let contentIndicator = null;

    // Function to clean up old selections
    function cleanupOldSelection() {
        if (savedSelection && savedSelection.timestamp) {
            const age = Date.now() - savedSelection.timestamp;
            // Clear selection if it's older than 10 seconds (reduced from 30)
            if (age > 10000) {
                savedSelection = null;
            }
        }
    }

    // Function to check if current selection is still valid
    function isSelectionStillValid() {
        if (!savedSelection || !quillEditor) return false;

        // Check timestamp first
        if (savedSelection.timestamp) {
            const age = Date.now() - savedSelection.timestamp;
            if (age > 10000) return false;
        }

        // Check if index is still valid for Quill selection
        if (savedSelection.index !== undefined) {
            const length = quillEditor.getLength();
            return savedSelection.index >= 0 && savedSelection.index + savedSelection.length <= length;
        }

        return false;
    }

    function handleContextMenu(e) {
        e.preventDefault();

        if (!quillEditor) {
            console.warn('Quill editor not initialized');
            return;
        }

        const range = quillEditor.getSelection();

        if (!range || range.length === 0) {
            hideContextMenu();
            return;
        }

        // Ensure range has valid index and length properties
        if (typeof range.index !== 'number' || typeof range.length !== 'number') {
            console.warn('Invalid range object:', range);
            hideContextMenu();
            return;
        }

        const selectedText = quillEditor.getText(range.index, range.length);

        if (selectedText.trim().length === 0) {
            hideContextMenu();
            return;
        }

        // Save selection for later use (Quill format)
        savedSelection = {
            index: range.index,
            length: range.length,
            text: selectedText,
            timestamp: Date.now()
        };

        // console.log('Selection saved successfully:', savedSelection);

        showContextMenu(e.clientX, e.clientY);
    }

    // Handle context menu for Quill editor
    function handleQuillContextMenu(e) {
        // console.log('handleQuillContextMenu called');

        if (!quillEditor) {
            console.warn('Quill editor not initialized');
            return;
        }

        const range = quillEditor.getSelection();

        if (!range || range.length === 0) {
            // console.log('No text selected, hiding context menu');
            hideContextMenu();
            return;
        }

        const selectedText = quillEditor.getText(range.index, range.length);
        // console.log('Selected text:', selectedText);

        if (selectedText.trim().length === 0) {
            // console.log('Selected text is empty, hiding context menu');
            hideContextMenu();
            return;
        }

        // Save selection for later use (Quill format)
        savedSelection = {
            index: range.index,
            length: range.length,
            text: selectedText,
            timestamp: Date.now()
        };

        // console.log('Selection saved successfully:', savedSelection);

        // Use the existing showContextMenu function
        showContextMenu(e.clientX, e.clientY);
    }

    function showContextMenu(x, y) {
        // Hide all other context menus first
        hideAllNoteContextMenusExcept('ai');

        // console.log('showContextMenu called with position:', x, y);

        const contextMenu = document.getElementById('ai-context-menu');
        if (!contextMenu) {
            console.error('AI context menu element not found');
            return;
        }

        // console.log('Context menu element found:', contextMenu);

        // Position the menu with overflow prevention
        adjustContextMenuPosition(contextMenu, x, y);

        // Show with animation
        setTimeout(() => {
            contextMenu.classList.add('show');
            // console.log('Context menu shown');
        }, 10);

        // Add click handlers for menu items
        const menuItems = contextMenu.querySelectorAll('.ai-context-menu-item');
        // console.log('Found menu items:', menuItems.length);

        menuItems.forEach(item => {
            item.addEventListener('click', handleContextMenuAction);
        });
    }

    function hideContextMenu() {
        const contextMenu = document.getElementById('ai-context-menu');
        if (!contextMenu) return;

        contextMenu.classList.remove('show');
        setTimeout(() => {
            contextMenu.style.display = 'none';
        }, 200);

        // Remove click handlers
        contextMenu.querySelectorAll('.ai-context-menu-item').forEach(item => {
            item.removeEventListener('click', handleContextMenuAction);
        });
    }


    async function handleContextMenuAction(e) {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;

        // console.log('handleContextMenuAction called with action:', action);

        // Clean up old selections first
        cleanupOldSelection();

        if (!savedSelection || !savedSelection.text) {
            // console.log('No saved selection available');
            hideContextMenu();
            return;
        }

        // console.log('Saved selection:', savedSelection);

        // Check if we have a valid range before proceeding
        const hasValidRange = isSelectionStillValid();
        // console.log('Has valid range:', hasValidRange);

        // Save current state to undo history BEFORE making any changes
        saveToUndoHistory();

        hideContextMenu();

        try {
            // Disable AI button while processing
            const aiAssistantBtn = document.getElementById('ai-assistant-btn');
            if (aiAssistantBtn) {
                aiAssistantBtn.classList.add('ai-processing');
            }

            // Apply loading effect to selected text
            if (quillEditor && savedSelection.index !== undefined && savedSelection.length !== undefined) {
                // console.log('Applying loading effect...');
                // Create a range object for Quill
                const range = { index: savedSelection.index, length: savedSelection.length };
                applyShimmerEffect(action, range);
                // console.log('Loading effect applied');
            } else {
                // console.log('Cannot apply loading effect - missing quillEditor or selection data');
            }

            let result;
            const selectedText = savedSelection.text;

            switch (action) {
                case 'summarize':
                    result = await sendToAI('summarize', { content: selectedText });
                    break;
                case 'expand':
                    result = await sendToAI('expand', { content: selectedText });
                    break;
                case 'improve':
                    result = await sendToAI('improve', { content: selectedText });
                    break;
                case 'suggestions':
                    result = await sendToAI('suggestions', { content: selectedText });
                    break;
                case 'outline':
                    result = await sendToAI('outline', { content: selectedText });
                    break;
                case 'meeting-notes':
                    result = await sendToAI('meeting-notes', { content: selectedText });
                    break;
                case 'action-items':
                    result = await sendToAI('action-items', { content: selectedText });
                    break;
            }

            // Replace selected text with AI result using streaming
            if (result) {
                // console.log('AI stream response received:', result);

                // Add delay to let loading effect be visible
                setTimeout(async () => {
                    // Remove loading effect and stream text
                    try {
                        await streamTextToEditor(result, savedSelection);

                        // Mark as unsaved and save
                        markAsUnsaved();
                        saveNoteWithContext('content');

                        // Clear savedSelection after successful streaming
                        savedSelection = null;
                        // Success - no toast notification
                    } catch (error) {
                        console.error('Error streaming text:', error);
                        // Clear invalid selection to prevent future errors
                        savedSelection = null;
                        // Fallback to append if streaming fails
                        // console.log('Falling back to append text...');
                        if (appendTextToEditor('Error: Streaming failed')) {
                            // console.log('Error message appended');
                        } else {
                            console.error('Append text also failed');
                            showErrorToast(chrome.i18n.getMessage('toast_operationFailed') || 'Operation failed');
                        }
                    }
                }, 1000); // 1 second delay to show loading effect
            } else {
                // console.log('No AI result received');
            }

        } catch (error) {
            console.error('AI context menu action failed:', error);
            removeShimmerEffect();
            // Error toast is already shown in sendToAI function
        } finally {
            // Re-enable AI button
            const aiAssistantBtn = document.getElementById('ai-assistant-btn');
            if (aiAssistantBtn) {
                aiAssistantBtn.classList.remove('ai-processing');
            }

            // Only clear savedSelection after successful completion
            // Don't clear it in finally block as it's needed for text replacement
        }
    }

    function appendTextToEditor(text) {
        const editor = document.getElementById('editor');
        if (!editor) {
            console.error('Editor element not found');
            return false;
        }

        try {
            // Save cursor position before updating content
            const selection = window.getSelection();
            let savedRange = null;

            if (selection.rangeCount > 0) {
                try {
                    savedRange = selection.getRangeAt(0);
                } catch (e) {
                    // console.log('Could not save selection:', e);
                }
            }

            // Use simple text formatting
            const formattedContent = text;

            // Get current content
            const currentContent = quillEditor ? quillEditor.root.innerHTML : '';

            // Add formatted content with proper spacing
            const separator = currentContent.trim() ? '<br><br>' : '';
            const newContent = currentContent + separator + formattedContent;

            // Update content using Quill
            if (quillEditor) {
                quillEditor.clipboard.dangerouslyPasteHTML(newContent);
            }

            // Restore cursor position after content update
            if (savedRange && quillEditor) {
                try {
                    quillEditor.setSelection(savedRange.index, savedRange.length);
                } catch (e) {
                    // console.log('Could not restore selection:', e);
                }
            }

            // Scroll to bottom to show the new content
            if (quillEditor) {
                quillEditor.scrollSelectionIntoView();
            }

            // Mark as unsaved and save
            markAsUnsaved();
            saveNoteWithContext('content');

            return true;
        } catch (error) {
            console.error('Error appending text to editor:', error);
            return false;
        }
    }

    // Save current state to undo history before AI operation
    function saveToUndoHistory() {
        const currentState = {
            content: quillEditor ? quillEditor.root.innerHTML : '',
            selection: savedSelection ? {
                text: savedSelection.text,
                range: savedSelection.range,
                startContainer: savedSelection.startContainer,
                startOffset: savedSelection.startOffset,
                endContainer: savedSelection.endContainer,
                endOffset: savedSelection.endOffset
            } : null,
            timestamp: Date.now()
        };

        // Remove any states after current index
        aiUndoHistory = aiUndoHistory.slice(0, aiUndoIndex + 1);

        // Add new state
        aiUndoHistory.push(currentState);
        aiUndoIndex++;

        // Limit history size
        if (aiUndoHistory.length > MAX_UNDO_HISTORY) {
            aiUndoHistory.shift();
            aiUndoIndex--; // Adjust index when removing oldest state
        }

        // console.log('Saved to undo history. Index:', aiUndoIndex, 'History length:', aiUndoHistory.length);
    }

    // Undo last AI operation
    function undoAIOperation() {
        if (aiUndoIndex < 0 || aiUndoHistory.length === 0) {
            // console.log('No AI operations to undo');
            showToast(chrome.i18n.getMessage('ai_noUndoAvailable'), 'info');
            return false;
        }

        // Get the state to restore (current index points to state BEFORE AI operation)
        const previousState = aiUndoHistory[aiUndoIndex];

        if (!previousState) {
            console.warn('No previous state found');
            return false;
        }

        // console.log('Undoing to state at index:', aiUndoIndex);

        // Save cursor position before updating content
        const selection = window.getSelection();
        let savedRange = null;

        if (selection.rangeCount > 0) {
            try {
                savedRange = selection.getRangeAt(0);
            } catch (e) {
                // console.log('Could not save selection:', e);
            }
        }

        // Restore editor content using Quill
        if (quillEditor) {
            quillEditor.clipboard.dangerouslyPasteHTML(previousState.content);
        }

        // Restore cursor position after content update
        if (savedRange && quillEditor) {
            try {
                quillEditor.setSelection(savedRange.index, savedRange.length);
            } catch (e) {
                // console.log('Could not restore selection:', e);
            }
        }

        // Move index back to prevent re-undoing to the same state
        aiUndoIndex--;

        // Restore selection if available
        if (previousState.selection && previousState.selection.startContainer &&
            document.contains(previousState.selection.startContainer)) {
            try {
                const range = document.createRange();
                range.setStart(previousState.selection.startContainer, previousState.selection.startOffset);
                range.setEnd(previousState.selection.endContainer, previousState.selection.endOffset);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                savedSelection = previousState.selection;
            } catch (error) {
                console.warn('Could not restore selection:', error);
            }
        }

        // Mark as unsaved and save
        markAsUnsaved();
        saveNoteWithContext('content');

        return true;
    }

    function getActionText(action) {
        const actionTexts = {
            summarize: 'Summarize',
            expand: 'Expand',
            improve: 'Improve',
            suggestions: 'Suggestions',
            outline: 'Create Outline'
        };
        return actionTexts[action] || action;
    }

    // Event Listeners for Context Menu - Context menu handled by Quill
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
    });

    // Input and scroll events are handled by Quill editor automatically

    // New AI Features Functions
    async function saveNoteToCloud() {
        try {
            const noteContent = quillEditor ? quillEditor.root.innerHTML : '';
            const noteTitle = document.title || 'Untitled Note';
            const timestamp = new Date().toISOString();

            // Save to Chrome storage
            const savedNotes = await dbManager.getSetting('savedNotes') || [];
            const newNote = {
                id: Date.now().toString(),
                title: noteTitle,
                content: noteContent,
                timestamp: timestamp,
                tags: []
            };

            savedNotes.push(newNote);
            await dbManager.saveSetting('savedNotes', savedNotes);

            // Note saved manually - no toast needed
        } catch (error) {
            console.error('Failed to save note:', error);
            showErrorToast(chrome.i18n.getMessage('toast_operationFailed') || 'Operation failed');
        }
    }

    async function openSearchInterface() {
        try {
            // Open search interface in new window
            const searchWindow = await chrome.windows.create({
                url: chrome.runtime.getURL('search.html'),
                type: 'popup',
                width: 600,
                height: 500,
                focused: true
            });
        } catch (error) {
            console.error('Failed to open search interface:', error);
            // Fallback without specific bounds
            try {
                const fallbackWindow = await chrome.windows.create({
                    url: chrome.runtime.getURL('search.html'),
                    type: 'popup',
                    focused: true
                });
            } catch (fallbackError) {
                console.error('Fallback search window creation failed:', fallbackError);
                showErrorToast(chrome.i18n.getMessage('toast_operationFailed') || 'Operation failed');
            }
        }
    }


    // Listen for get note content requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getNoteContent') {
            const content = quillEditor ? quillEditor.getText() : '';
            sendResponse({ success: true, content: content });
        }
    });

    window.addEventListener('resize', savePositionOnly);




    // Auto-save before closing window to prevent data loss
    window.addEventListener('beforeunload', () => {
        const content = quillEditor ? quillEditor.root.innerHTML : '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const textContent = tempDiv.textContent.trim();

        // Check for meaningful HTML elements (images, videos, audio, canvas, svg, etc.)
        const hasMediaContent = tempDiv.querySelector('img, video, audio, canvas, svg, iframe, object, embed') !== null;

        // More comprehensive check for meaningful content
        const hasContent = (textContent.length > 0 || hasMediaContent) &&
            content !== '<div></div>' &&
            content !== '<div><br></div>' &&
            content !== '<div><br/></div>' &&
            content !== '<br>' &&
            content !== '<br/>' &&
            content.trim() !== '';

        // Check if note has meaningful content
        if (hasContent) {
            // Save if there's actual content
            if (hasUnsavedChanges) {
                saveNote();
            }
        } else {
            // If no content, check if this is a draft note and delete it
            chrome.runtime.sendMessage({ action: "deleteDraftNote", noteId });
        }
    });

    // --- Initial Load ---
    // Function to load note properties (color, background, etc.)
    window.loadNoteProperties = async (note) => {
        if (!note) return;

        const currentNoteId = note.id;
        
        // Load color
        currentNoteColor = note.color || NOTE_COLORS[0];

        // Load background from note-specific storage first, then fallback to notes data
        const noteBackgroundKey = `note_${currentNoteId}_background`;
        const savedBackground = await dbManager.getSetting(noteBackgroundKey);
        currentBackground = savedBackground || note.background || 'none';

        console.log('[Note] Loading properties for note', currentNoteId, '- color:', currentNoteColor, 'background:', currentBackground);

        // Apply appearance
        updateNoteAppearance(currentNoteColor);
        applyBackgroundToNote(currentBackground);
    };

    await loadAndApplyTheme();

    const note = await dbManager.getNote(noteId);
    if (note) {
        // Content will be loaded by Quill editor initialization
        originalContent = note.content;
        
        // Load note properties
        await window.loadNoteProperties(note);

        initializeColorPalette();
        // console.log('About to initialize text color picker...');
        // Lazy load background picker - only initialize when user opens it
        // initializeBackgroundPicker(); // Removed - now loads on demand

        markAsSaved(false); // Initial state is saved, but don't show toast
    } else {
        // If note somehow doesn't exist, close window.
        window.close();
    }

    // Function to handle complex nested formatting removal
    const removeComplexFormatting = (element) => {
        if (!element) return;

        // First, remove all attributes
        removeAllFormatting(element);

        // Then, handle nested formatting elements
        const formattingElements = element.querySelectorAll('b, i, u, s, strong, em, mark, code, font, span[style], span[class]');

        // Also find spans with data attributes (using a different approach)
        const spansWithData = element.querySelectorAll('span');
        const spansWithDataAttributes = Array.from(spansWithData).filter(span => {
            return Array.from(span.attributes).some(attr => attr.name.startsWith('data-'));
        });
        // Process regular formatting elements
        formattingElements.forEach(el => {
            // Unwrap the element and move its children to parent
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
            }
        });

        // Process spans with data attributes
        spansWithDataAttributes.forEach(el => {
            // Unwrap the element and move its children to parent
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
            }
        });

        // Recursively process remaining elements
        const remainingElements = element.querySelectorAll('*');
        remainingElements.forEach(el => {
            removeComplexFormatting(el);
        });
    };




    // Make removeComplexFormatting available globally for debugging
    window.removeComplexFormatting = removeComplexFormatting;

    // Function to remove all formatting from text - comprehensive cleanup
    const removeAllFormatting = (element) => {
        if (!element) return;

        // Remove all inline styles
        element.removeAttribute('style');

        // Remove common formatting attributes
        element.removeAttribute('color');
        element.removeAttribute('bgcolor');
        element.removeAttribute('face');
        element.removeAttribute('size');
        element.removeAttribute('align');
        element.removeAttribute('class');
        element.removeAttribute('id');

        // Remove data attributes used for formatting
        element.removeAttribute('data-font-size');
        element.removeAttribute('data-color');
        element.removeAttribute('data-highlight');
        element.removeAttribute('data-font-family');
        element.removeAttribute('data-text-decoration');

        // Remove any other data attributes that might be used for formatting
        const dataAttributes = Array.from(element.attributes).filter(attr => attr.name.startsWith('data-'));
        dataAttributes.forEach(attr => {
            element.removeAttribute(attr.name);
        });

        // If element is a span with only formatting (no other attributes), unwrap it
        if (element.tagName === 'SPAN' &&
            element.attributes.length === 0 &&
            element.parentNode) {
            const parent = element.parentNode;
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }
            parent.removeChild(element);
            return;
        }

        // Recursively clean up child elements
        const children = Array.from(element.children);
        children.forEach(child => {
            removeAllFormatting(child);
        });

        // After cleaning children, check if this element is now empty of formatting
        if (element.tagName === 'SPAN' &&
            element.attributes.length === 0 &&
            element.parentNode) {
            const parent = element.parentNode;
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }
            parent.removeChild(element);
        }
    };

    // Function to sanitize HTML - moved inside DOMContentLoaded scope
    const sanitizeHtml = (html) => {
        // Create a temporary div to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Remove potentially dangerous elements and attributes
        const dangerousTags = ['script', 'object', 'embed', 'iframe', 'form', 'input'];
        const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'style'];

        dangerousTags.forEach(tag => {
            const elements = tempDiv.querySelectorAll(tag);
            elements.forEach(el => el.remove());
        });

        // Clean dangerous attributes
        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            dangerousAttrs.forEach(attr => {
                if (el.hasAttribute(attr)) {
                    el.removeAttribute(attr);
                }
            });
        });

        return tempDiv.innerHTML;
    };

    // Floating AI Button Functions - Optimized Version
    let textSelectionDebounceTimer = null;
    let isInitialized = false;

    // Cached DOM elements for performance
    let cachedEditorElement = null;
    let cachedToolbarElement = null;
    let lastSelectionText = '';
    let lastSelectionRange = null;
    let selectionChangeThrottle = null;
    let isButtonVisible = false;
    let lastButtonPosition = { top: 0, left: 0 };

    function initializeFloatingAIButton() {
        // Prevent multiple initializations
        if (isInitialized) {
            return;
        }

        floatingAIButton = document.getElementById('ai-floating-button');

        if (floatingAIButton) {
            // Cache DOM elements once
            cachedToolbarElement = document.getElementById('toolbar');

            // Add click handler
            floatingAIButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleFloatingAIClick();
            });

            // Optimized: Use only mouseup for mouse selections
            document.addEventListener('mouseup', (e) => {
                // Ignore clicks on the button itself
                if (floatingAIButton.contains(e.target)) {
                    return;
                }
                // Quick response for mouse selection
                setTimeout(() => debouncedHandleTextSelection(), 50);
            });

            // Throttled selectionchange for keyboard selections
            document.addEventListener('selectionchange', throttledHandleTextSelection);

            // Add click listener to hide button when clicking outside
            document.addEventListener('mousedown', handleOutsideClick);

            // Handle scroll to reposition button
            const editorElement = getCachedEditorElement();
            if (editorElement) {
                editorElement.addEventListener('scroll', handleScroll);
            }

            isInitialized = true;
        } else {
            console.error('Floating AI button element not found!');
        }
    }

    // Optimized: Cache editor element on first access
    function getCachedEditorElement() {
        if (!cachedEditorElement && quillEditor) {
            cachedEditorElement = quillEditor.root;
        }
        return cachedEditorElement;
    }

    // Handle scroll to reposition or hide button
    function handleScroll() {
        if (isButtonVisible && lastSelectionRange) {
            // Reposition button smoothly during scroll
            requestAnimationFrame(() => {
                showFloatingAIButton(lastSelectionRange, true);
            });
        }
    }

    // Optimized: Separate handler for outside clicks
    function handleOutsideClick(e) {
        const editorElement = getCachedEditorElement();

        if (editorElement &&
            !editorElement.contains(e.target) &&
            !floatingAIButton.contains(e.target) &&
            (!cachedToolbarElement || !cachedToolbarElement.contains(e.target))) {
            hideFloatingAIButton();
            currentSelection = null;
        }
    }

    // Optimized: Throttle for selectionchange event (fires very frequently)
    function throttledHandleTextSelection() {
        if (selectionChangeThrottle) return;

        selectionChangeThrottle = setTimeout(() => {
            debouncedHandleTextSelection();
            selectionChangeThrottle = null;
        }, 150); // Faster throttle for better responsiveness
    }

    function debouncedHandleTextSelection() {
        // Clear existing timer
        if (textSelectionDebounceTimer) {
            clearTimeout(textSelectionDebounceTimer);
        }

        // Set new timer with 200ms delay - show quickly but not too fast
        textSelectionDebounceTimer = setTimeout(() => {
            handleTextSelection();
        }, 200);
    }

    function handleTextSelection() {
        if (!quillEditor) {
            return;
        }

        try {
            const range = quillEditor.getSelection();

            // Optimized: Early return for invalid range
            if (!range || typeof range.index !== 'number' || typeof range.length !== 'number') {
                if (isButtonVisible) {
                    hideFloatingAIButton();
                    currentSelection = null;
                }
                return;
            }

            const selectedText = range.length > 0 ? quillEditor.getText(range.index, range.length).trim() : '';

            // Optimized: Skip if selection hasn't changed significantly
            if (selectedText === lastSelectionText &&
                lastSelectionRange &&
                lastSelectionRange.index === range.index &&
                lastSelectionRange.length === range.length) {
                return;
            }

            lastSelectionText = selectedText;
            lastSelectionRange = range;

            // Check if we have a valid selection (minimum 2 characters)
            if (range.length > 0 && selectedText.length >= 2) {
                // Store selection immediately
                currentSelection = {
                    text: selectedText,
                    index: range.index,
                    length: range.length,
                    timestamp: Date.now()
                };
                showFloatingAIButton(range);
            } else {
                // Hide button when no text is selected or selection too short
                hideFloatingAIButton();
                currentSelection = null;
            }
        } catch (error) {
            console.error('Error in handleTextSelection:', error);
            hideFloatingAIButton();
            currentSelection = null;
        }
    }

    function showFloatingAIButton(range, isRepositioning = false) {
        if (!floatingAIButton || !quillEditor || !range) {
            return;
        }

        // Validate range object has required properties
        if (typeof range.index !== 'number' || typeof range.length !== 'number') {
            return;
        }

        try {
            const bounds = quillEditor.getBounds(range.index, range.length);
            const editorRect = quillEditor.root.getBoundingClientRect();

            // Calculate selection rectangle
            const rectTop = editorRect.top + bounds.top;
            const rectBottom = editorRect.top + bounds.bottom;
            const rectLeft = editorRect.left + bounds.left;
            const rectRight = editorRect.left + bounds.left + bounds.width;
            const rectWidth = bounds.width;
            const rectHeight = bounds.height;

            // Button dimensions
            const buttonWidth = 40;
            const buttonHeight = 32;
            const padding = 12;
            const minDistanceFromSelection = 8;

            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Smart positioning algorithm
            let top, left;
            let positionClass = '';

            // Calculate available space in all directions
            const spaceAbove = rectTop - padding - buttonHeight;
            const spaceBelow = viewportHeight - rectBottom - padding - buttonHeight;
            const spaceLeft = rectLeft - padding - buttonWidth;
            const spaceRight = viewportWidth - rectRight - padding - buttonWidth;

            // Priority: Above > Below > Right > Left
            if (spaceAbove >= minDistanceFromSelection) {
                // Position above selection, centered
                top = rectTop - buttonHeight - minDistanceFromSelection;
                left = rectLeft + (rectWidth / 2) - (buttonWidth / 2);
                positionClass = 'above';
            } else if (spaceBelow >= minDistanceFromSelection) {
                // Position below selection, centered
                top = rectBottom + minDistanceFromSelection;
                left = rectLeft + (rectWidth / 2) - (buttonWidth / 2);
                positionClass = 'below';
            } else if (spaceRight >= minDistanceFromSelection) {
                // Position to the right, vertically centered
                top = rectTop + (rectHeight / 2) - (buttonHeight / 2);
                left = rectRight + minDistanceFromSelection;
                positionClass = 'right';
            } else if (spaceLeft >= minDistanceFromSelection) {
                // Position to the left, vertically centered
                top = rectTop + (rectHeight / 2) - (buttonHeight / 2);
                left = rectLeft - buttonWidth - minDistanceFromSelection;
                positionClass = 'left';
            } else {
                // Fallback: position at top-right corner of selection
                top = rectTop - buttonHeight - 4;
                left = rectRight - buttonWidth;
                positionClass = 'corner';
            }

            // Ensure button stays within viewport with padding
            top = Math.max(padding, Math.min(top, viewportHeight - buttonHeight - padding));
            left = Math.max(padding, Math.min(left, viewportWidth - buttonWidth - padding));

            // Add scroll offset
            top += window.scrollY;
            left += window.scrollX;

            // Check if position changed significantly (avoid micro-movements)
            const positionChanged = !isRepositioning ||
                Math.abs(top - lastButtonPosition.top) > 5 ||
                Math.abs(left - lastButtonPosition.left) > 5;

            if (positionChanged) {
                lastButtonPosition = { top, left };

                // Smooth animation using CSS transitions
                if (!isButtonVisible) {
                    // First show: fade in with scale - quick and smooth
                    floatingAIButton.style.cssText = `
                        left: ${left}px;
                        top: ${top}px;
                        display: flex;
                        pointer-events: auto;
                        z-index: 9999;
                        position: absolute;
                        opacity: 0;
                        transform: scale(0.7) translateY(8px);
                        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                                    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    `;

                    // Trigger animation immediately
                    requestAnimationFrame(() => {
                        floatingAIButton.style.opacity = '1';
                        floatingAIButton.style.transform = 'scale(1) translateY(0)';
                    });
                } else {
                    // Reposition: smooth movement
                    floatingAIButton.style.cssText = `
                        left: ${left}px;
                        top: ${top}px;
                        display: flex;
                        pointer-events: auto;
                        z-index: 9999;
                        position: absolute;
                        opacity: 1;
                        transform: scale(1) translateY(0);
                        transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1), 
                                    top 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    `;
                }

                isButtonVisible = true;
            }
        } catch (error) {
            console.error('Error in showFloatingAIButton:', error);
        }
    }

    function hideFloatingAIButton() {
        if (floatingAIButton && isButtonVisible) {
            // Smooth fade out - quick animation
            floatingAIButton.style.opacity = '0';
            floatingAIButton.style.transform = 'scale(0.7) translateY(8px)';

            // Hide after animation (match transition duration)
            setTimeout(() => {
                if (floatingAIButton) {
                    floatingAIButton.style.display = 'none';
                }
            }, 250);

            isButtonVisible = false;
            lastSelectionText = '';
            lastSelectionRange = null;
        }

        // Optimized: Clear all timers when hiding
        if (textSelectionDebounceTimer) {
            clearTimeout(textSelectionDebounceTimer);
            textSelectionDebounceTimer = null;
        }
        if (selectionChangeThrottle) {
            clearTimeout(selectionChangeThrottle);
            selectionChangeThrottle = null;
        }
    }

    async function handleFloatingAIClick() {
        let selectedText = null;

        if (currentSelection && currentSelection.text) {
            selectedText = currentSelection.text;
            // console.log('Using stored selection:', selectedText);
        } else {
            // Fallback: try to get current selection
            const selection = window.getSelection();
            const currentText = selection.toString().trim();
            if (currentText.length > 0) {
                selectedText = currentText;
                // console.log('Using current selection as fallback:', selectedText);
            }
        }

        if (selectedText) {
            // console.log('Opening AI input bar with text:', selectedText);
            await openAIWithSelectedText(selectedText);
        } else {
            // console.log('No text available for AI input');
        }
    }

    async function openAIWithSelectedText(selectedText) {
        try {
            // console.log('Opening AI input bar with selected text:', selectedText);

            // Store selection info for potential replace operation
            const selectionInfo = currentSelection ? {
                index: currentSelection.index,
                length: currentSelection.length,
                timestamp: Date.now()
            } : null;

            // Save to chrome storage for AI chat window
            if (selectionInfo) {
                await dbManager.saveSetting('aiSelectedText', selectedText);
                await dbManager.saveSetting('aiSelectionInfo', selectionInfo);
                await dbManager.saveSetting('aiContextTimestamp', Date.now());
            }

            // Get the floating button and AI assistant button in toolbar
            const floatingBtn = document.getElementById('ai-floating-button');
            const aiAssistantBtn = document.getElementById('ai-assistant-btn');

            // Animate text falling to AI assistant button in toolbar
            if (floatingBtn && aiAssistantBtn && typeof anime !== 'undefined') {
                animateTextToToolbarButton(floatingBtn, aiAssistantBtn, selectedText, () => {
                    // Show AI input bar after animation
                    showAIInputBar();

                    // Set a placeholder indicator instead of full text
                    if (aiInput) {
                        // console.log('Setting AI input placeholder...');
                        aiInput.value = '';
                        aiInput.placeholder = chrome.i18n.getMessage('ai_chatWithSelectedText') || 'Chat with AI about selected text...';
                        aiInput.focus();

                        // Store selected text for AI processing
                        window.selectedTextForAI = selectedText;
                        window.selectedTextInfo = selectionInfo;

                        // Add visual indicator for selected text
                        addSelectedTextIndicator(selectedText);

                        // Enable submit button
                        const aiSubmitBtn = document.getElementById('ai-submit-btn');
                        if (aiSubmitBtn) {
                            aiSubmitBtn.disabled = false;
                            // console.log('AI submit button enabled');
                        }
                    }
                });
            } else {
                // Fallback: show without animation
                // console.log('Animation not available, using fallback');
                showAIInputBar();

                if (aiInput) {
                    aiInput.value = '';
                    aiInput.placeholder = chrome.i18n.getMessage('ai_chatWithSelectedText') || 'Chat with AI about selected text...';
                    aiInput.focus();
                    window.selectedTextForAI = selectedText;
                    window.selectedTextInfo = selectionInfo;
                    addSelectedTextIndicator(selectedText);

                    const aiSubmitBtn = document.getElementById('ai-submit-btn');
                    if (aiSubmitBtn) {
                        aiSubmitBtn.disabled = false;
                    }
                }
            }

            // Hide floating button and clear selection
            hideFloatingAIButton();
            currentSelection = null;

            // console.log('AI input bar opened with selected text context');

        } catch (error) {
            console.error('Failed to open AI input bar:', error);
        }
    }

    // Add visual indicator for selected text
    function addSelectedTextIndicator(selectedText) {
        // Remove existing indicator if any
        const existingIndicator = document.getElementById('selected-text-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Create indicator element
        const indicator = document.createElement('div');
        indicator.id = 'selected-text-indicator';
        indicator.className = 'selected-text-indicator';

        // Truncate text if too long (increased limit since we now use CSS ellipsis)
        const displayText = selectedText.length > 80 ? selectedText.substring(0, 80) + '...' : selectedText;

        indicator.innerHTML = `
            <div class="indicator-content">
                <span class="indicator-text">${displayText}</span>
                <button class="indicator-close">×</button>
            </div>
        `;

        // Add event listener to close button
        const closeButton = indicator.querySelector('.indicator-close');
        if (closeButton) {
            closeButton.addEventListener('click', removeSelectedTextIndicator);
        }

        // Insert before AI input
        const aiInputContainer = document.querySelector('.ai-input-container');
        if (aiInputContainer) {
            aiInputContainer.insertBefore(indicator, aiInputContainer.firstChild);
        }
    }

    // Remove selected text indicator
    async function removeSelectedTextIndicator() {
        const indicator = document.getElementById('selected-text-indicator');
        if (indicator) {
            indicator.remove();
        }
        window.selectedTextForAI = null;
        window.selectedTextInfo = null;

        // Clear from chrome storage
        await dbManager.deleteSetting('aiSelectedText');
        await dbManager.deleteSetting('aiSelectionInfo');
        await dbManager.deleteSetting('aiContextTimestamp');
    }

    // Function is now used with event listener instead of inline onclick


    // AI Service function to send requests to backend
    async function sendToAI(action, params = {}) {
        try {
            // Get user email
            const userEmail = await getUserEmailFromExtension();
            if (!userEmail) {
                throw new Error(chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI features');
            }

            // Check if AI is unlocked
            const isUnlocked = await checkAIUnlockStatus();
            if (isUnlocked) {
                // console.log('AI is unlocked - bypassing daily limit');
                // Use unlimited request for unlocked users
                return await makeUnlimitedAIRequest(action, params, userEmail);
            }

            // Get backend URL
            const backendUrl = serverSelector.getServerUrl();

            // For regular users, use the standard request flow
            const response = await fetch(`${backendUrl}/api/ai/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                const errorData = await response.json();
                let errorMsg;

                // Short message based on status code
                if (response.status === 429) {
                    errorMsg = 'Daily AI limit reached';
                } else if (response.status === 401) {
                    errorMsg = 'Please sign in';
                } else if (response.status === 403) {
                    errorMsg = 'Access denied';
                } else if (response.status >= 500) {
                    errorMsg = 'AI service unavailable';
                } else {
                    // Get error from backend and shorten
                    errorMsg = errorData.error || 'AI request failed';
                    if (errorMsg.length > 50) {
                        errorMsg = errorMsg.substring(0, 47) + '...';
                    }
                }

                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (!data.success || !data.result) {
                throw new Error('Invalid AI response');
            }

            return data.result;
        } catch (error) {
            console.error('AI request failed:', error);
            showErrorToast(error.message);
            throw error;
        }
    }

    // Helper function to make unlimited AI request (bypass daily limit)
    async function makeUnlimitedAIRequest(action, params, userEmail) {
        try {
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/ai/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI request failed');
            }

            const data = await response.json();
            if (!data.success || !data.result) {
                throw new Error(chrome.i18n.getMessage('ai_invalidResponse') || 'Invalid response from AI service');
            }

            return data.result;
        } catch (error) {
            console.error('Unlimited AI request failed:', error);
            throw error;
        }
    }

    // Function to insert content at cursor - moved inside DOMContentLoaded scope
    const insertContentAtCursor = (content) => {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            // If no selection, append to end
            if (false) {
                const currentContent = quillEditor ? quillEditor.root.innerHTML : '';
                if (quillEditor) {
                    quillEditor.clipboard.dangerouslyPasteHTML(currentContent + content);
                }
            } else {
                if (quillEditor) {
                    const currentContent = quillEditor.root.innerHTML;
                    quillEditor.clipboard.dangerouslyPasteHTML(currentContent + content);
                }
            }
        } else {
            const range = selection.getRangeAt(0);
            range.deleteContents();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;

            const fragment = document.createDocumentFragment();
            const nodes = [];
            while (tempDiv.firstChild) {
                const node = tempDiv.firstChild;
                fragment.appendChild(node);
                nodes.push(node);
            }

            range.insertNode(fragment);

            // Move cursor to end of inserted content
            if (nodes.length > 0) {
                const lastNode = nodes[nodes.length - 1];
                range.setStartAfter(lastNode);
            } else {
                range.setStartAfter(range.endContainer);
            }
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        // Trigger save
        markAsUnsaved();
        saveNoteWithContext('content');
    };

    // =======================================================
    // --- SHARE NOTE FUNCTIONALITY ---
    // =======================================================

    // Function to sync note to Firebase before sharing
    async function syncNoteToFirebase(noteId, userEmail) {
        try {
            // Get note data from storage using storageAdapter
            const noteData = await dbManager.getNote(noteId);

            if (!noteData) {
                throw new Error(chrome.i18n.getMessage('errors_noteNotFound') || 'Note not found in local storage');
            }

            const backendUrl = serverSelector.getServerUrl();
            const syncResponse = await fetch(`${backendUrl}/api/notes/${noteId}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify({
                    content: noteData.content,
                    color: noteData.color,
                    lastModified: noteData.lastModified,
                    position: noteData.position,
                    size: noteData.size
                })
            });

            if (!syncResponse.ok) {
                const errorData = await syncResponse.json();
                throw new Error(errorData.error || chrome.i18n.getMessage('sync_noteFailed') || 'Failed to sync note to server');
            }

            // console.log('Note synced to Firebase successfully');

        } catch (error) {
            console.error('Error syncing note:', error);
            throw error;
        }
    }

    // Helper function to get user email from extension
    async function getUserEmailFromExtension() {
        try {
            // Get email from OAuth2 token to avoid popup
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) {
                        // User not signed in - return null instead of rejecting
                        resolve(null);
                    } else {
                        resolve(token);
                    }
                });
            });

            if (!token) {
                // User not signed in - return null gracefully
                return null;
            }

            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const userInfo = await response.json();
            return userInfo.email;
        } catch (error) {
            // Log error but return null instead of throwing
            console.warn('Cannot access authentication API:', error);
            return null;
        }
    }


    // Function to check premium status
    async function checkPremiumStatus(userEmail) {
        try {
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/usage/check`, {
                method: 'GET',
                headers: {
                    'x-user-email': userEmail
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.usage.isPremium;
            }
            return false;
        } catch (error) {
            console.error('Error checking premium status:', error);
            return false;
        }
    }

    // Function to handle note sharing
    async function handleShareNote() {
        // Check if note is empty before proceeding
        if (isNoteEmpty()) {
            showToast(chrome.i18n.getMessage('errors_noteEmpty') || 'Note is empty. Please add content before using this feature.', 'warning');
            return;
        }

        // Always save note before sharing to ensure content is up to date
        saveNote();

        // Show loading overlay
        showShareLoading();

        try {
            const userEmail = await getUserEmailFromExtension();

            // Check login status
            if (!userEmail) {
                hideShareLoading();
                showErrorModal(chrome.i18n.getMessage('messages_signInToShare') || 'Sign in to share');
                return;
            }

            // Debug: Log noteId for checking
            // console.log('NoteId for sharing:', noteId);
            // console.log('User email:', userEmail);

            // STEP 1: Sync note to Firebase before sharing
            await syncNoteToFirebase(noteId, userEmail);

            // STEP 2: Create share link
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/notes/${noteId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail // Send email for backend authentication
                }
            });

            const data = await response.json();

            if (response.ok && data.success && data.link) {
                // Hide loading and show share modal
                hideShareLoading();
                showShareModal(data.link);
            } else {
                throw new Error(data.error || chrome.i18n.getMessage('messages_cannotCreateShareLink') || 'Cannot create share link.');
            }
        } catch (error) {
            console.error('Error sharing note:', error);

            // Hide loading overlay
            hideShareLoading();

            // Handle different types of errors
            if (error.message.includes('Note not found')) {
                showErrorModal(chrome.i18n.getMessage('messages_noteNotFound') || 'Note not found on server. Please try again.');
            } else if (error.message.includes('404')) {
                showErrorModal(chrome.i18n.getMessage('messages_shareNotConfigured') || 'Share not configured.');
            } else if (error.message.includes('Daily share limit reached')) {
                showWarningModal(chrome.i18n.getMessage('messages_dailyLimitReached') || 'Daily limit reached. Try tomorrow or upgrade.');
            } else if (error.message.includes('User email required')) {
                showErrorModal(chrome.i18n.getMessage('messages_signInToShare') || 'Sign in to share');
            } else {
                showErrorModal(chrome.i18n.getMessage('errors_genericError') || 'An error occurred. Please try again.');
            }
        }
    }

    // =======================================================
    // --- SHARE MODAL FUNCTIONALITY ---
    // =======================================================

    //loading overlay
    function showShareLoading() {
        const loadingOverlay = document.getElementById('share-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('show');
        }
    }

    // Function to hide loading overlay
    function hideShareLoading() {
        const loadingOverlay = document.getElementById('share-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('show');
        }
    }

    // Function to show share modal
    function showShareModal(shareLink) {
        const modal = document.getElementById('share-modal');
        const linkInput = document.getElementById('share-link-input');

        if (modal && linkInput) {
            // Close all other modals when opening share modal
            closeAllModals();

            linkInput.value = shareLink;
            modal.classList.add('show');
        }
    }

    // Function to hide share modal
    function hideShareModal() {
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // Function to copy link to clipboard
    async function copyShareLink() {
        const linkInput = document.getElementById('share-link-input');
        const copyBtn = document.getElementById('share-copy-btn');

        if (linkInput && linkInput.value && copyBtn) {
            try {
                await navigator.clipboard.writeText(linkInput.value);

                // Change icon and text
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17L4 12"/>
                    </svg>
                    ${chrome.i18n.getMessage('share_copied') || 'Copied'}
                `;
                copyBtn.classList.add('copied');

                // Reset after 2 seconds
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        ${chrome.i18n.getMessage('share_copy') || 'Copy'}
                    `;
                    copyBtn.classList.remove('copied');
                }, 2000);

            } catch (error) {
                // Show error message if clipboard API fails
                console.error('Failed to copy to clipboard:', error);
                showToast(chrome.i18n.getMessage('toast_copyFailed') || 'Failed to copy link. Please try again.', 'error');
            }
        }
    }

    // Function to share to social media
    function shareToSocial(platform, shareLink) {
        const encodedUrl = encodeURIComponent(shareLink);
        const encodedTitle = encodeURIComponent(chrome.i18n.getMessage('share_defaultTitle') || 'Check out this note from Quick Notes');

        let shareUrl = '';

        switch (platform) {
            case 'linkedin':
                shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
                break;
            case 'facebook':
                shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
                break;
            case 'reddit':
                shareUrl = `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
                break;
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
                break;
            case 'whatsapp':
                shareUrl = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
                break;
        }

        if (shareUrl) {
            window.open(shareUrl, '_blank', 'width=600,height=400');
        }
    }

    // =======================================================
    // --- END OF SHARE FUNCTIONALITY ---
    // =======================================================

    // Initialize floating AI button after DOM is ready
    setTimeout(() => {
        // Reset initialization state if needed
        if (isInitialized) {
            // console.log('Resetting floating AI button initialization...');
            isInitialized = false;
        }

        initializeFloatingAIButton();

    }, 100);

    // Initialize Quill Editor function
    async function initializeQuillEditor() {
        // console.log('Initializing Quill Editor...');

        // Wait for Quill to be loaded
        if (typeof Quill === 'undefined') {
            console.error('Quill not loaded!');
            return;
        }

        // Get editor element
        const editorElement = document.getElementById('editor');
        if (!editorElement) {
            console.error('Editor element not found!');
            return;
        }

        // Load note data first
        const urlParams = new URLSearchParams(window.location.search);
        const noteId = urlParams.get('id');

        let initialContent = '';
        let isMarkdownContent = false;
        if (noteId) {
            try {
                const note = await dbManager.getNote(noteId);
                if (note) {
                    initialContent = note.content || '';
                    isMarkdownContent = note.isMarkdown || false;
                    console.log('[Note Init] Loading note, isMarkdown:', isMarkdownContent);
                }
            } catch (error) {
                console.error('Error loading note content:', error);
            }
        }

        // Register custom font size format for Quill
        const Size = Quill.import('attributors/style/size');
        Size.whitelist = null; // Allow any size value
        Quill.register(Size, true);

        // Register color and background formats for Quill
        const ColorStyle = Quill.import('attributors/style/color');
        const BackgroundStyle = Quill.import('attributors/style/background');
        Quill.register(ColorStyle, true);
        Quill.register(BackgroundStyle, true);

        // Import Delta for clipboard matcher
        const Delta = Quill.import('delta');



        // Initialize Quill Editor
        quillEditor = new Quill(editorElement, {
            theme: 'snow',
            modules: {
                toolbar: false, // Use custom toolbar
                clipboard: {
                    matchVisual: false,
                    matchers: [
                        // Chỉ loại bỏ color, background, font, size - GIỮ NGUYÊN TẤT CẢ còn lại
                        [Node.ELEMENT_NODE, function (node, delta) {
                            // Loại bỏ các attributes về màu sắc và font
                            const ops = delta.ops.map(op => {
                                if (op.attributes) {
                                    const { color, background, font, size, ...keepAttributes } = op.attributes;
                                    return {
                                        insert: op.insert,
                                        attributes: Object.keys(keepAttributes).length > 0 ? keepAttributes : undefined
                                    };
                                }
                                return op;
                            });
                            return new Delta(ops);
                        }]
                    ]
                }
            },
            placeholder: '', // No placeholder text
        });

        // Ensure editor is properly configured
        if (quillEditor && quillEditor.root) {
            quillEditor.root.setAttribute('contenteditable', 'true');
            // console.log('Editor contentEditable set to true');
        }

        // Verify Quill is working
        if (!quillEditor || !quillEditor.format) {
            console.error('Quill editor not properly initialized!');
            return;
        }

        // Test Quill formatting
        // console.log('Testing Quill formatting...');
        try {
            quillEditor.insertText(0, 'Test formatting');
            quillEditor.format('bold', true);
            quillEditor.deleteText(0, 16); // Remove test text
            // Reset all formatting after test
            quillEditor.format('bold', false);
        } catch (error) {
            console.error('Quill formatting test failed:', error);
        }

        // Set initial content - Use setContents to bypass clipboard matchers
        if (initialContent) {
            console.log('[Note Init] Loading initial content, length:', initialContent.length);
            console.log('[Note Init] Content preview:', initialContent.substring(0, 200));
            console.log('[Note Init] Is markdown:', isMarkdownContent);

            try {
                if (isMarkdownContent) {
                    // Content is markdown - convert using MarkdownProcessor
                    console.log('[Note Init] Converting markdown to Quill format');
                    if (window.MarkdownProcessor && window.MarkdownProcessor.insertIntoQuill) {
                        window.MarkdownProcessor.insertIntoQuill(quillEditor, initialContent, 0);
                        console.log('[Note Init] Markdown converted successfully');
                    } else {
                        console.warn('[Note Init] MarkdownProcessor not available, using plain text');
                        quillEditor.setText(initialContent);
                    }
                } else {
                    // Content is HTML - use innerHTML directly to preserve all formatting including colors
                    // This bypasses clipboard matchers which would strip color/background attributes
                    console.log('[Note Init] Using innerHTML to preserve colors');
                    quillEditor.root.innerHTML = initialContent;
                    
                    // Update Quill's internal state to match the HTML
                    quillEditor.update();
                }

                console.log('[Note Init] Content loaded, editor length:', quillEditor.getLength());
                console.log('[Note Init] Editor text preview:', quillEditor.getText().substring(0, 100));
            } catch (error) {
                console.error('[Note Init] Error loading content:', error);
                // Last resort: set innerHTML or plain text
                if (isMarkdownContent) {
                    quillEditor.setText(initialContent);
                } else {
                    quillEditor.root.innerHTML = initialContent;
                    quillEditor.update();
                }
            }
        }



        originalContent = quillEditor.root.innerHTML;

        // Assign to window for debugging
        window.quillEditor = quillEditor;

        // Initialize Note Tabs Manager
        const tabsManager = new NoteTabsManager();
        await tabsManager.init(noteId, quillEditor);
        window.tabsManager = tabsManager;
        
        // If tabs were loaded, clear the initial content from editor
        if (tabsManager.tabs && tabsManager.tabs.length > 0) {
            console.log('[Note] Tabs loaded, initial note content will be ignored');
        }

        // Initialize toolbar after Quill is ready
        initializeToolbar();

        // Initialize color pickers after Quill is ready
        initializeColorPickers();

        // Variables for debouncing
        let inputTimeout;

        // Enhanced text-change event listener for auto-save
        quillEditor.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                // Debounce toolbar update
                if (inputTimeout) {
                    clearTimeout(inputTimeout);
                }
                inputTimeout = setTimeout(() => {
                    updateToolbarButtons();
                }, 50);

                // Mark as unsaved and start auto-save
                markAsUnsaved();
                isUserTyping = true;

                // Use the existing saveNoteWithContext system
                saveNoteWithContext('content');
            }
        });

        // Selection-change event listener for toolbar updates
        quillEditor.on('selection-change', (range, oldRange, source) => {
            if (range) {
                updateToolbarButtons();
            }
        });

        // Handle link clicks - open in new tab
        quillEditor.root.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                e.preventDefault();
                e.stopPropagation();
                // Open link in new tab
                chrome.tabs.create({ url: link.href });
                // console.log('Opening link:', link.href);
            }
        });

        // Show tooltip on link hover
        quillEditor.root.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
                link.title = `Click to open: ${link.href}`;
            }
        });

        // Stop auto-save when editor loses focus
        quillEditor.root.addEventListener('blur', () => {
            isUserTyping = false;

            // Save immediately when user leaves editor
            if (hasUnsavedChanges) {
                saveNote();
            }
        });

        // Save on window focus loss
        window.addEventListener('beforeunload', () => {
            if (hasUnsavedChanges) {
                saveNote();
            }
        });

        // Save on visibility change (when user switches tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && hasUnsavedChanges) {
                saveNote();
            }
        });

        // Add context menu to images in content
        setTimeout(() => {
            const images = quillEditor.root.querySelectorAll('img');
            images.forEach(img => {
                img.addEventListener('contextmenu', handleImageContextMenu);
                img.setAttribute('data-context-menu-added', 'true');
            });
        }, 100);
    }

    // Initialize Quill Editor
    // console.log('About to initialize Quill Editor...');
    initializeQuillEditor();

    // ============================================
    // TOPBAR AUTO-HIDE FUNCTIONALITY
    // ============================================
    let topbarHideTimeout;
    let isTopbarInteracting = false;

    // Ensure topbar is visible on page load
    if (topBar) {
        topBar.classList.remove('hidden');
    }

    // Function to hide topbar
    function hideTopbar() {
        // Don't hide if dropdown is open
        if (topBar && !isTopbarInteracting && !topBar.classList.contains('dropdown-open')) {
            topBar.classList.add('hidden');
        }
    }

    // Function to show topbar
    function showTopbar() {
        if (topBar) {
            topBar.classList.remove('hidden');
            // Clear any pending hide timeout
            if (topbarHideTimeout) {
                clearTimeout(topbarHideTimeout);
            }
        }
    }

    // Hide topbar when clicking in editor
    if (quillEditor) {
        quillEditor.root.addEventListener('click', (e) => {
            // Only hide if not clicking on topbar elements
            if (!topBar.contains(e.target)) {
                hideTopbar();
            }
        });

        quillEditor.root.addEventListener('focus', () => {
            // Delay hiding to allow user to finish any topbar interaction
            setTimeout(() => {
                if (!isTopbarInteracting) {
                    hideTopbar();
                }
            }, 100);
        });

        // Hide topbar when typing
        quillEditor.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                hideTopbar();
            }
        });

        // Hide topbar on any keyboard input
        quillEditor.root.addEventListener('keydown', () => {
            hideTopbar();
        });
    }

    // Hide topbar when clicking anywhere in note container (except topbar)
    if (noteContainer) {
        noteContainer.addEventListener('click', (e) => {
            if (!topBar.contains(e.target)) {
                hideTopbar();
            }
        });
    }

    // Show topbar when hovering over the thin border area
    if (topBar) {
        topBar.addEventListener('mouseenter', () => {
            showTopbar();
            isTopbarInteracting = true;
        });

        // Hide topbar after mouse leaves (with delay)
        topBar.addEventListener('mouseleave', () => {
            isTopbarInteracting = false;
            topbarHideTimeout = setTimeout(() => {
                hideTopbar();
            }, 1000); // 1 second delay before hiding
        });

        // Prevent hiding when clicking on topbar buttons
        topBar.addEventListener('click', () => {
            isTopbarInteracting = true;
            // Reset after a short delay
            setTimeout(() => {
                isTopbarInteracting = false;
            }, 500);
        });
    }

    // ============================================
    // DROPDOWN MENU CLICK FUNCTIONALITY
    // ============================================
    const menuBtn = document.getElementById('menu-btn');
    const tabMenuBtn = document.getElementById('tab-menu-btn');
    const dropdownContent = document.querySelector('.dropdown-content');

    if (dropdownContent) {
        // Move dropdown to body to avoid overflow issues
        document.body.appendChild(dropdownContent);

        // Function to position dropdown based on which button was clicked
        function positionDropdown(buttonElement) {
            const rect = buttonElement.getBoundingClientRect();
            dropdownContent.style.top = (rect.bottom + 5) + 'px';
            dropdownContent.style.right = (window.innerWidth - rect.right) + 'px';
        }

        // Function to toggle dropdown
        function toggleDropdown(e, buttonElement) {
            e.stopPropagation();
            const isShowing = dropdownContent.classList.toggle('show');

            if (isShowing) {
                positionDropdown(buttonElement);
                // Show topbar when opening dropdown (only if using topbar menu button)
                if (buttonElement === menuBtn) {
                    showTopbar();
                    isTopbarInteracting = true;
                    // Add class to prevent topbar from hiding
                    if (topBar) {
                        topBar.classList.add('dropdown-open');
                    }
                }
            } else {
                // Remove class when closing dropdown
                if (topBar) {
                    topBar.classList.remove('dropdown-open');
                }
                isTopbarInteracting = false;
            }
        }

        // Toggle dropdown on menu button click (topbar)
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => toggleDropdown(e, menuBtn));
        }

        // Toggle dropdown on tab menu button click
        if (tabMenuBtn) {
            tabMenuBtn.addEventListener('click', (e) => toggleDropdown(e, tabMenuBtn));
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const isMenuBtn = menuBtn && menuBtn.contains(e.target);
            const isTabMenuBtn = tabMenuBtn && tabMenuBtn.contains(e.target);
            const isDropdown = dropdownContent.contains(e.target);
            
            if (!isMenuBtn && !isTabMenuBtn && !isDropdown) {
                dropdownContent.classList.remove('show');
                // Remove class when closing dropdown
                if (topBar) {
                    topBar.classList.remove('dropdown-open');
                }
                isTopbarInteracting = false;
            }
        });

        // Close dropdown when clicking on a menu item
        const dropdownItems = dropdownContent.querySelectorAll('a');
        dropdownItems.forEach(item => {
            item.addEventListener('click', () => {
                dropdownContent.classList.remove('show');
                // Remove class when closing dropdown
                if (topBar) {
                    topBar.classList.remove('dropdown-open');
                }
                isTopbarInteracting = false;
            });
        });

        // Reposition dropdown on window resize
        window.addEventListener('resize', () => {
            if (dropdownContent.classList.contains('show')) {
                // Find which button is currently visible and reposition based on it
                const activeButton = (tabMenuBtn && tabMenuBtn.style.display !== 'none') ? tabMenuBtn : menuBtn;
                if (activeButton) {
                    positionDropdown(activeButton);
                }
            }
        });
    }

    // Listen for theme changes from main app
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'themeChanged') {
            applyTheme(request.theme);
            sendResponse({ success: true });
        }
    });

});

// Fallback functions
function showAILoadingOverlay(action, selectedText) {
    // Fallback to simple overlay if shimmer fails
    let overlay = document.getElementById('ai-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ai-loading-overlay';
        overlay.className = 'ai-loading-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="ai-loading-container">
            <div class="neural-network">
                <div class="ai-loading-text">${chrome.i18n.getMessage('ai_processing') || 'AI Processing...'}</div>
            </div>
        </div>
    `;

    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('show');
    }, 10);
}

function hideAILoadingOverlay() {
    const overlay = document.getElementById('ai-loading-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}


// Draw neural network connections
function drawNeuralConnections() {
    const svg = document.querySelector('.neural-connections');
    if (!svg) return;

    const centerX = 100;
    const centerY = 100;
    const radius = 60;
    const nodeCount = 8;

    // Clear existing connections
    svg.innerHTML = '';

    // Draw connections from center to each node
    for (let i = 0; i < nodeCount; i++) {
        const angle = (i * 360 / nodeCount) * Math.PI / 180;
        const nodeX = centerX + radius * Math.cos(angle);
        const nodeY = centerY + radius * Math.sin(angle);

        // Create line element
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', centerX);
        line.setAttribute('y1', centerY);
        line.setAttribute('x2', nodeX);
        line.setAttribute('y2', nodeY);
        line.setAttribute('class', 'neural-connection');
        line.setAttribute('style', `--delay: ${i * 0.1}s;`);

        svg.appendChild(line);
    }

    // Draw some inter-node connections for more complex network look
    for (let i = 0; i < nodeCount; i += 2) {
        const angle1 = (i * 360 / nodeCount) * Math.PI / 180;
        const angle2 = ((i + 2) * 360 / nodeCount) * Math.PI / 180;

        const x1 = centerX + radius * Math.cos(angle1);
        const y1 = centerY + radius * Math.sin(angle1);
        const x2 = centerX + radius * Math.cos(angle2);
        const y2 = centerY + radius * Math.sin(angle2);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'neural-connection-secondary');
        line.setAttribute('style', `--delay: ${i * 0.15 + 0.8}s;`);

        svg.appendChild(line);
    }
}

function getActionText(action) {
    const actionTexts = {
        summarize: 'Summarize',
        expand: 'Expand',
        improve: 'Improve',
        suggestions: 'Suggestions',
        outline: 'Create Outline'
    };
    return actionTexts[action] || action;
}

function getShortErrorMessage(errorMessage) {
    const errorMappings = {
        'Rate limit exceeded': 'Too many requests',
        'Request timeout': 'Request timeout',
        'Network error': 'Network error',
        'Invalid API key': 'Invalid API key',
        'API access forbidden': 'Access denied',
        'AI service temporarily unavailable': 'AI service temporarily unavailable',
        'No response generated': 'No response from AI',
        'Empty response': 'Empty response',
        'AI API key not configured': 'API key not configured'
    };

    for (const [key, value] of Object.entries(errorMappings)) {
        if (errorMessage.includes(key)) {
            return value;
        }
    }

    // If no mapping found, return a generic short message
    return 'Unknown AI error';
}

// Toast functions are defined in toast-system.js
// showToast, showErrorToast, showSuccessToast, showWarningToast, showInfoToast

// Notification Modal System for Long Messages - Optimized Design with Icons
function showNotificationModal(message, type = 'info') {
    const overlay = document.getElementById('notification-modal-overlay');
    const content = overlay.querySelector('.notification-modal-content');
    const iconContainer = document.getElementById('notification-modal-icon');
    const messageEl = document.getElementById('notification-modal-message');
    const closeBtn = document.getElementById('notification-modal-close');

    // Set icon based on type
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55101 19.3437 1.64151 19.6871 1.81445 19.9905C1.98738 20.2939 2.23675 20.5467 2.53773 20.7239C2.83871 20.9011 3.18082 20.9962 3.53 21H20.47C20.8192 20.9962 21.1613 20.9011 21.4623 20.7239C21.7633 20.5467 22.0126 20.2939 22.1856 19.9905C22.3585 19.6871 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56611 13.2807 3.32312 12.9812 3.15448C12.6817 2.98585 12.3437 2.89725 12 2.89725C11.6563 2.89725 11.3183 2.98585 11.0188 3.15448C10.7193 3.32312 10.4683 3.56611 10.29 3.86Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 16V12M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`
    };

    // Set icon
    iconContainer.innerHTML = icons[type] || icons.info;
    iconContainer.className = `notification-modal-icon ${type}`;

    // Set content
    messageEl.textContent = message;

    // Add compact class for short messages (single line)
    if (message.length <= 50 && !message.includes('\n')) {
        content.classList.add('notification-modal-compact');
    } else {
        content.classList.remove('notification-modal-compact');
    }

    // Show modal
    overlay.classList.add('show');

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            hideNotificationModal();
        }
    };

    // Close on close button click
    closeBtn.onclick = hideNotificationModal;
}

function hideNotificationModal() {
    const overlay = document.getElementById('notification-modal-overlay');
    const content = overlay.querySelector('.notification-modal-content');
    const iconContainer = document.getElementById('notification-modal-icon');
    overlay.classList.remove('show');
    content.classList.remove('notification-modal-compact');
    iconContainer.className = 'notification-modal-icon';
}

// Convenience functions for different notification types
function showErrorModal(message) {
    showNotificationModal(message, 'error');
}

function showPremiumModal(message) {
    showNotificationModal(message, 'warning');
}

function showWarningModal(message) {
    showNotificationModal(message, 'warning');
}

function showSuccessModal(title, message) {
    const overlay = document.getElementById('notification-modal-overlay');
    const content = overlay.querySelector('.notification-modal-content');
    const iconContainer = document.getElementById('notification-modal-icon');
    const messageEl = document.getElementById('notification-modal-message');
    const closeBtn = document.getElementById('notification-modal-close');

    // Set success icon
    iconContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    iconContainer.className = 'notification-modal-icon success';

    // Set content with title and message
    const fullMessage = message ? `${title}\n\n${message}` : title;
    messageEl.textContent = fullMessage;

    // Add compact class for short messages
    if (fullMessage.length <= 50 && !fullMessage.includes('\n')) {
        content.classList.add('notification-modal-compact');
    } else {
        content.classList.remove('notification-modal-compact');
    }

    // Show modal
    overlay.classList.add('show');

    // Auto hide after 3 seconds
    setTimeout(() => {
        hideNotificationModal();
    }, 3000);

    // Close button
    closeBtn.onclick = hideNotificationModal;
}

// Modern AI UX: No success indicator needed - silent operation

// Export Loading Modal Functions
function showExportLoadingModal() {
    const modal = document.getElementById('export-loading-modal');
    const spinner = document.getElementById('export-loading-spinner');
    const successIcon = document.getElementById('export-success-icon');
    const title = document.getElementById('export-loading-title');
    const message = document.getElementById('export-loading-message');

    // Reset modal state
    spinner.style.display = 'block';
    successIcon.style.display = 'none';
    title.textContent = chrome.i18n.getMessage('export_exportingImages') || 'Exporting images...';
    message.textContent = chrome.i18n.getMessage('export_pleaseWait') || 'Please wait a moment';

    // Show modal
    modal.classList.add('show');
}

function showExportSuccessModal() {
    const modal = document.getElementById('export-loading-modal');
    const spinner = document.getElementById('export-loading-spinner');
    const successIcon = document.getElementById('export-success-icon');
    const title = document.getElementById('export-loading-title');
    const message = document.getElementById('export-loading-message');

    // Switch to success state
    spinner.style.display = 'none';
    successIcon.style.display = 'block';
    title.textContent = chrome.i18n.getMessage('export_completed') || 'Completed!';
    message.textContent = chrome.i18n.getMessage('export_downloadSuccess') || 'Image downloaded successfully';

    // Auto-hide modal after 2 seconds
    setTimeout(() => {
        hideExportModal();
    }, 2000);
}

function hideExportModal() {
    const modal = document.getElementById('export-loading-modal');
    modal.classList.remove('show');
}

// Download Note as Image Functionality
const downloadNoteBtn = document.getElementById('download-note-btn');

// Check if html2canvas is loaded
// console.log('html2canvas available:', typeof html2canvas !== 'undefined');

const exportNoteAsImage = async () => {
    try {
        // Check if html2canvas is available
        if (typeof html2canvas === 'undefined') {
            console.error('html2canvas is not loaded!');
            showToast(chrome.i18n.getMessage('toast_libraryNotLoaded') || 'Library not loaded', 'error');
            return;
        }

        // console.log('Starting image export...');

        // Disable download button during export
        downloadNoteBtn.disabled = true;
        downloadNoteBtn.style.opacity = '0.5';

        // Show loading modal
        showExportLoadingModal();

        // Wait a bit for toast to show
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the editor element (main content)
        const editor = document.getElementById('editor');
        if (!editor) {
            throw new Error('Editor not found');
        }

        // Get the note container for background
        const noteContainer = document.querySelector('.note-container');
        if (!noteContainer) {
            throw new Error('Note container not found');
        }

        // console.log('Editor found:', editor);
        // console.log('Note container found:', noteContainer);

        // Create a temporary container for export
        const exportDiv = document.createElement('div');
        exportDiv.style.position = 'absolute';
        exportDiv.style.top = '-9999px';
        exportDiv.style.left = '-9999px';
        exportDiv.style.width = noteContainer.offsetWidth + 'px';
        exportDiv.style.height = noteContainer.offsetHeight + 'px';

        // Copy background styles from note container
        const computedStyle = window.getComputedStyle(noteContainer);
        exportDiv.style.background = computedStyle.background;

        // Get current note color from note data
        let currentColor = '#fbbc04'; // Default color

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const noteId = urlParams.get('id');
            if (noteId) {
                const noteData = await dbManager.getNote(noteId);
                if (noteData && noteData.color) {
                    currentColor = noteData.color;
                }
            }
        } catch (error) {
            // console.log('Could not get note color from storage:', error);
        }
        const hex = currentColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Check if light theme is active
        const isLightTheme = document.body.classList.contains('light-theme');

        // Create app header with Quick Notes branding using note color
        const appHeader = document.createElement('div');
        appHeader.style.cssText = `
                background: rgb(${r}, ${g}, ${b});
                color: #ffffff;
                display: flex;
                align-items: center;
                padding: 4px 16px;
                border-radius: 0;
                box-shadow: none;
                border-bottom: none;
                font-family: 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                font-size: 16px;
                letter-spacing: 0.5px;
            `;

        // Create app icon
        const appIcon = document.createElement('img');
        appIcon.src = chrome.runtime.getURL('icons/icon128.png');
        appIcon.alt = chrome.i18n.getMessage('app_name') || 'Quick Notes';
        appIcon.style.cssText = `
                width: 24px;
                height: 24px;
                margin-right: 12px;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            `;

        // Create app title
        const appTitle = document.createElement('span');
        appTitle.textContent = chrome.i18n.getMessage('app_name') || 'Quick Notes';
        appTitle.style.cssText = `
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            `;

        appHeader.appendChild(appIcon);
        appHeader.appendChild(appTitle);

        // Create the main content area
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
                background: ${computedStyle.background};
                color: ${computedStyle.color};
                padding: 0 16px 16px 16px;
                border-radius: 0;
                min-height: 200px;
                font-family: ${computedStyle.fontFamily};
                line-height: ${computedStyle.lineHeight};
                overflow: visible;
                max-height: none;
            `;

        // Create a spacer div for top spacing
        const spacerDiv = document.createElement('div');
        spacerDiv.style.cssText = `
                height: 5px;
                width: 100%;
                background: transparent;
                display: block;
            `;

        contentArea.appendChild(spacerDiv);

        // Clone the editor content with all styles
        const editorClone = editor.cloneNode(true);

        // Remove Quill classes that might have conflicting styles
        editorClone.classList.remove('ql-editor', 'ql-container', 'ql-snow', 'ql-blank');

        // Also remove classes from all child elements
        const allElements = editorClone.querySelectorAll('*');
        allElements.forEach(el => {
            el.classList.remove('ql-editor', 'ql-container', 'ql-snow', 'ql-blank');
        });

        // Remove any height restrictions and scrolling from the clone
        editorClone.style.cssText = `
                width: 100%;
                min-height: auto;
                height: auto;
                overflow: visible;
                max-height: none;
                padding: 0 !important;
                margin: 0 !important;
                border: none;
                outline: none;
                background: transparent;
                color: ${computedStyle.color};
                font-family: ${computedStyle.fontFamily};
                line-height: ${computedStyle.lineHeight};
            `;

        contentArea.appendChild(editorClone);

        // Assemble the export structure
        exportDiv.appendChild(appHeader);
        exportDiv.appendChild(contentArea);

        // Apply background styles to the main container
        exportDiv.style.backgroundColor = computedStyle.backgroundColor;
        exportDiv.style.backgroundImage = computedStyle.backgroundImage;
        exportDiv.style.backgroundSize = computedStyle.backgroundSize;
        exportDiv.style.backgroundPosition = computedStyle.backgroundPosition;
        exportDiv.style.backgroundRepeat = computedStyle.backgroundRepeat;
        exportDiv.style.borderRadius = '12px';
        exportDiv.style.overflow = 'hidden';
        exportDiv.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
        document.body.appendChild(exportDiv);

        // console.log('Export div created with app header:', exportDiv);

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 200));

        // Calculate the actual height needed for the content
        const headerHeight = appHeader.offsetHeight;
        const spacerHeight = spacerDiv.offsetHeight;
        const contentHeight = editorClone.scrollHeight;
        const totalHeight = headerHeight + spacerHeight + contentHeight + 32; // 32px for bottom padding

        // console.log('Header height:', headerHeight);
        // console.log('Spacer height:', spacerHeight);
        // console.log('Content height:', contentHeight);
        // console.log('Total height needed:', totalHeight);

        // Update export div height to accommodate full content
        exportDiv.style.height = totalHeight + 'px';

        // Capture the export div
        // console.log('Starting html2canvas with export div:', exportDiv);
        const canvas = await html2canvas(exportDiv, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: exportDiv.offsetWidth,
            height: totalHeight,
            scrollX: 0,
            scrollY: 0,
            windowWidth: exportDiv.offsetWidth,
            windowHeight: totalHeight,
            onclone: (clonedDoc) => {
                // Ensure styles are applied in cloned document
                const clonedDiv = clonedDoc.querySelector('div');
                if (clonedDiv) {
                    clonedDiv.offsetHeight; // Force reflow
                }
            }
        });

        // Fallback: if canvas is empty, try capturing the original editor
        if (canvas.width === 0 || canvas.height === 0) {
            // console.log('Canvas is empty, trying fallback with original editor and header');

            // Create a fallback container with header
            const fallbackDiv = document.createElement('div');
            fallbackDiv.style.cssText = `
                    position: absolute;
                    top: '-9999px';
                    left: '-9999px';
                    width: ${noteContainer.offsetWidth}px;
                    background: ${computedStyle.background};
                    border-radius: 8px;
                    overflow: hidden;
                `;

            // Add the same app header
            const fallbackHeader = appHeader.cloneNode(true);
            fallbackDiv.appendChild(fallbackHeader);

            // Add editor content
            const fallbackContent = document.createElement('div');
            fallbackContent.style.cssText = `
                    background: ${computedStyle.background};
                    color: ${computedStyle.color};
                    padding: 16px;
                    border-radius: 0 0 8px 8px;
                    min-height: 200px;
                    font-family: ${computedStyle.fontFamily};
                    line-height: ${computedStyle.lineHeight};
                    overflow: visible;
                    max-height: none;
                `;

            const editorClone = editor.cloneNode(true);
            editorClone.style.cssText = `
                    width: 100%;
                    min-height: auto;
                    height: auto;
                    overflow: visible;
                    max-height: none;
                    padding: 0;
                    margin: 0;
                    border: none;
                    outline: none;
                    background: transparent;
                    color: ${computedStyle.color};
                    font-family: ${computedStyle.fontFamily};
                    line-height: ${computedStyle.lineHeight};
                `;

            fallbackContent.appendChild(editorClone);
            fallbackDiv.appendChild(fallbackContent);

            document.body.appendChild(fallbackDiv);

            // Calculate height for fallback too
            const fallbackHeaderHeight = fallbackHeader.offsetHeight;
            const fallbackContentHeight = editorClone.scrollHeight;
            const fallbackTotalHeight = fallbackHeaderHeight + fallbackContentHeight + 32;

            fallbackDiv.style.height = fallbackTotalHeight + 'px';

            const fallbackCanvas = await html2canvas(fallbackDiv, {
                backgroundColor: null,
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: fallbackDiv.offsetWidth,
                height: fallbackTotalHeight,
                scrollX: 0,
                scrollY: 0,
                windowWidth: fallbackDiv.offsetWidth,
                windowHeight: fallbackTotalHeight
            });

            // Clean up fallback div
            document.body.removeChild(fallbackDiv);

            return fallbackCanvas;
        }

        // console.log('Canvas created successfully:', canvas);

        // Generate filename with timestamp
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `sticky-note-${timestamp}.png`;

        // Create download link
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png', 1.0);

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success in modal
        showExportSuccessModal();

    } catch (error) {
        console.error('Export error:', error);
        hideExportModal();
        showToast(chrome.i18n.getMessage('toast_exportFailed') || 'Export failed', 'error');
    } finally {
        // Clean up temporary export div
        if (typeof exportDiv !== 'undefined' && exportDiv.parentNode) {
            exportDiv.parentNode.removeChild(exportDiv);
            // console.log('Export div cleaned up');
        }

        // Clean up any fallback divs that might still exist
        const fallbackDivs = document.querySelectorAll('div[style*="position: absolute"][style*="top: -9999px"]');
        fallbackDivs.forEach(div => {
            if (div.parentNode) {
                div.parentNode.removeChild(div);
            }
        });

        // Re-enable download button
        downloadNoteBtn.disabled = false;
        downloadNoteBtn.style.opacity = '1';
    }
};

// Add event listener for download button with delay to ensure DOM is ready
setTimeout(() => {
    const downloadBtn = document.getElementById('download-note-btn');
    if (downloadBtn) {
        // console.log('Download button found, adding event listener');
        downloadBtn.addEventListener('click', (e) => {
            // console.log('Download button clicked!');
            e.preventDefault();
            e.stopPropagation();

            // Check if html2canvas is loaded before proceeding
            if (typeof html2canvas === 'undefined') {
                console.error('html2canvas not loaded, waiting...');
                showToast(chrome.i18n.getMessage('toast_libraryNotLoaded') || 'Library not loaded', 'info');

                // Wait a bit and try again
                setTimeout(() => {
                    if (typeof html2canvas !== 'undefined') {
                        exportNoteAsImage();
                    } else {
                        showToast(chrome.i18n.getMessage('toast_libraryError') || 'Library error', 'error');
                    }
                }, 1000);
                return;
            }

            exportNoteAsImage();
        });
    } else {
        console.error('Download button not found!');
    }
}, 100);

// Check premium status function
async function checkPremiumStatus(userEmail) {
    try {
        if (!userEmail) return false;

        const backendUrl = serverSelector.getServerUrl();
        const response = await fetch(`${backendUrl}/api/usage/check`, {
            method: 'GET',
            headers: {
                'x-user-email': userEmail
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.usage.isPremium || false;
        }
        return false;
    } catch (error) {
        console.error('Error checking premium status:', error);
        return false;
    }
}

// Get user email from extension
async function getUserEmailFromExtension() {
    try {
        // Get email from OAuth2 token to avoid popup
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: false }, token => {
                if (chrome.runtime.lastError) {
                    // User not signed in - return null instead of rejecting
                    resolve(null);
                } else {
                    resolve(token);
                }
            });
        });

        if (!token) return null;

        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const userInfo = await response.json();
        return userInfo.email;
    } catch (error) {
        console.warn('Cannot access authentication API:', error);
        return null;
    }
}

// AI Tone Magic Functions
function showAIToneMenu() {
    const aiToneMenu = document.getElementById('ai-tone-menu');
    if (!aiToneMenu) {
        console.error('AI Tone Menu not found!');
        return;
    }

    // Close all other modals when opening AI tone menu (but not AI tone menu itself)
    // console.log('Closing other modals before showing AI Tone Menu');
    closeAllFormattingModals();

    const aiInputBar = document.getElementById('ai-input-bar');
    if (aiInputBar && aiInputBar.classList.contains('show')) {
        aiInputBar.classList.remove('show');
        // Remove active state from AI Assistant button
        const aiAssistantBtn = document.getElementById('ai-assistant-btn');
        if (aiAssistantBtn) {
            aiAssistantBtn.classList.remove('ai-active');
        }
    }

    const aiFormattingMenu = document.getElementById('ai-formatting-menu');
    if (aiFormattingMenu && aiFormattingMenu.classList.contains('show')) {
        aiFormattingMenu.classList.remove('show');
        // Remove active state from AI Formatting button
        const aiFormattingBtn = document.getElementById('ai-formatting-btn');
        if (aiFormattingBtn) {
            aiFormattingBtn.classList.remove('active');
        }
    }

    const backgroundPickerModal = document.getElementById('background-picker-modal');
    if (backgroundPickerModal && backgroundPickerModal.classList.contains('show')) {
        backgroundPickerModal.classList.remove('show');
        setTimeout(() => {
            backgroundPickerModal.style.display = 'none';
        }, 300);
    }

    const shareModal = document.getElementById('share-modal');
    if (shareModal && shareModal.classList.contains('show')) {
        shareModal.classList.remove('show');
    }

    // Use morph animation with .show class
    requestAnimationFrame(() => {
        aiToneMenu.classList.add('show');
    });
}

function hideAIToneMenu() {
    const aiToneMenu = document.getElementById('ai-tone-menu');
    if (!aiToneMenu) return;

    // Remove .show class for morph animation
    aiToneMenu.classList.remove('show');
}

// AI Tone Loading Animation Functions - Moved to global scope

// Create simple formatted text with emoji and line breaks
function createSimpleFormattedText(text, emoji) {
    // Debug: Log the text being formatted
    // console.log('Creating formatted text:', text);
    // console.log('Text length:', text.length);

    const container = document.createElement('div');
    container.style.lineHeight = '1.6';
    container.style.fontSize = 'inherit';
    container.style.padding = '0';
    container.style.margin = '0';
    container.style.whiteSpace = 'pre-wrap'; // Preserve line breaks and spaces
    // Don't set fontFamily - let it inherit from system

    if (emoji && !text.includes(emoji)) {
        const emojiSpan = document.createElement('span');
        emojiSpan.style.fontSize = '1.2em';
        emojiSpan.style.marginRight = '8px';
        emojiSpan.textContent = emoji;
        container.appendChild(emojiSpan);
    }

    // Use innerHTML instead of textContent to preserve line breaks
    container.innerHTML = text.replace(/\n/g, '<br>');

    return container.outerHTML;
}

// Replace selected text with HTML content
function replaceSelectedTextWithHTML(htmlContent) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }

        range.insertNode(fragment);
        selection.removeAllRanges();
    }
}

// Global helper function to check if note is empty (including whitespace-only content)
function isNoteEmpty() {
    if (!quillEditor) {
        return true;
    }

    // Get text content without trailing newline
    const length = quillEditor.getLength();
    const text = quillEditor.getText(0, length - 1);

    // Check if text is empty or contains only whitespace
    return !text || text.trim() === '';
}

// Global function for tone selection
window.handleToneSelection = async function (tone) {
    try {
        // Hide the tone menu first
        hideAIToneMenu();

        // Remove active state from button
        const aiToneBtn = document.getElementById('ai-tone-btn');
        if (aiToneBtn) {
            aiToneBtn.classList.remove('active');
        }

        if (!quillEditor) {
            console.error('Quill editor not available');
            return;
        }

        // Check if note is empty before proceeding
        if (isNoteEmpty()) {
            showToast(chrome.i18n.getMessage('errors_noteEmpty') || 'Note is empty. Please add content before using this feature.', 'warning');
            return;
        }

        // Get selected text using Quill API
        const range = quillEditor.getSelection();
        let selectedText = '';
        let selectionInfo = null;
        let isEntireNote = false;

        if (range && range.length > 0) {
            // User has selected text
            selectedText = quillEditor.getText(range.index, range.length).trim();
            selectionInfo = {
                index: range.index,
                length: range.length,
                text: selectedText
            };
        } else {
            // No selection, use entire note content
            const length = quillEditor.getLength();
            selectedText = quillEditor.getText(0, length - 1).trim(); // -1 to exclude trailing newline
            selectionInfo = {
                index: 0,
                length: length - 1,
                text: selectedText
            };
            isEntireNote = true;
        }

        if (!selectedText) {
            showToast(chrome.i18n.getMessage('errors_noteEmpty') || 'Note is empty. Please add content before using this feature.', 'warning');
            return;
        }

        // Show loading state
        if (aiToneBtn) {
            aiToneBtn.classList.add('ai-processing');
        }

        // Show AI tone loading animation
        showAIToneLoading();

        // Save current state to undo history
        saveToUndoHistory();

        // Debug: Log the text being sent
        // console.log('Text being sent to AI:', selectedText);
        // console.log('Text length:', selectedText.length);
        // console.log('Selection info:', selectionInfo);

        // Send tone transformation request (non-streaming)
        try {
            // Get user email for authentication
            const userEmail = await getCurrentUserEmail();
            if (!userEmail) {
                throw new Error('User not authenticated');
            }

            // Make request to backend - using specialized tone endpoint
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/ai/tone/${tone}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': userEmail
                },
                body: JSON.stringify({
                    content: selectedText
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorText = errorData.error || `HTTP error! status: ${response.status}`;
                console.error('API Error:', errorText);
                throw new Error(errorText);
            }

            const data = await response.json();

            if (!data.success || !data.result) {
                throw new Error('Invalid response from server');
            }

            let transformedText = data.result;

            // Ensure transformedText is a string
            if (typeof transformedText !== 'string') {
                console.error('[Tone] Result is not a string:', typeof transformedText, transformedText);
                transformedText = String(transformedText);
            }

            console.log('[Tone] Transformation completed, length:', transformedText.length);
            console.log('[Tone] Content preview:', transformedText.substring(0, 100));

            // Hide loading
            hideAIToneLoading();

            // Replace the selected text with the transformed text
            try {
                console.log('[Tone] Replacing text at index:', selectionInfo.index, 'length:', selectionInfo.length);

                // Delete old text first
                quillEditor.deleteText(selectionInfo.index, selectionInfo.length, 'user');

                // Convert markdown to HTML and insert
                if (typeof marked !== 'undefined') {
                    try {
                        console.log('[Tone] Converting markdown to HTML');
                        const html = marked.parse(transformedText);

                        // Use dangerouslyPasteHTML to insert with formatting
                        quillEditor.clipboard.dangerouslyPasteHTML(selectionInfo.index, html, 'user');
                        console.log('[Tone] Content inserted with formatting');
                    } catch (markdownError) {
                        console.error('[Tone] Markdown conversion failed:', markdownError);
                        // Fallback: plain text
                        quillEditor.insertText(selectionInfo.index, transformedText, 'user');
                        console.log('[Tone] Inserted as plain text (fallback)');
                    }
                } else {
                    console.warn('[Tone] marked.js not available, using plain text');
                    quillEditor.insertText(selectionInfo.index, transformedText, 'user');
                }

                console.log('[Tone] Text replacement completed');
            } catch (error) {
                console.error('[Tone] Error replacing text:', error);
                throw new Error('Failed to insert transformed text');
            }

            // Mark as unsaved and save
            markAsUnsaved();
            saveNoteWithContext('content');

            // Remove AI processing state
            if (aiToneBtn) {
                aiToneBtn.classList.remove('ai-processing');
            }

            return; // Exit early since we already handled everything
        } catch (error) {
            console.error('Tone transformation error:', error);

            hideAIToneLoading();

            if (aiToneBtn) {
                aiToneBtn.classList.remove('ai-processing');
            }

            // Show user-friendly error message
            let errorMsg = error.message || 'Tone transformation failed';
            if (errorMsg.includes('sign in') || errorMsg.includes('login')) {
                errorMsg = chrome.i18n.getMessage('ai_signInRequired') || 'Please sign in to use AI';
            } else if (errorMsg.includes('limit')) {
                errorMsg = chrome.i18n.getMessage('ai_dailyLimitReached') || 'Daily limit reached';
            } else if (errorMsg.length > 50) {
                errorMsg = errorMsg.substring(0, 47) + '...';
            }

            showErrorToast(errorMsg);
            return;
        }

    } catch (error) {
        console.error('Tone transformation failed:', error);
        hideAIToneLoading();

        // Optimize error message from backend
        let errorMsg = error.message || 'Tone change failed';
        if (errorMsg.length > 50) {
            errorMsg = errorMsg.substring(0, 47) + '...';
        }

        showErrorToast(errorMsg);

        // Re-enable tone button
        const aiToneBtn = document.getElementById('ai-tone-btn');
        if (aiToneBtn) {
            aiToneBtn.classList.remove('ai-processing');
        }
    }
}


// Load note content into Quill editor
async function loadNoteContent() {
    if (!quillEditor) return;

    // Get note content from URL parameters or storage
    const urlParams = new URLSearchParams(window.location.search);
    const noteId = urlParams.get('id');

    if (noteId) {
        // Load note content from storage using storageAdapter
        try {
            const note = await dbManager.getNote(noteId);
            if (note) {
                if (note.content) {
                    // Use innerHTML to bypass clipboard matchers and preserve formatting
                    quillEditor.root.innerHTML = note.content;
                    quillEditor.update();
                }
            }
        } catch (error) {
            console.error('Error loading note content:', error);
        }
    }
}

// ============================================
// UNIFIED FORMATTING MODAL SYSTEM
// ============================================

let currentOpenModal = null;
let savedSelection = null; // Save selection before opening modal

// Unified modal manager
function closeAllFormattingModals() {
    const modals = document.querySelectorAll('.formatting-modal');
    modals.forEach(modal => {
        modal.classList.remove('show');
    });
    currentOpenModal = null;
    // Don't clear savedSelection immediately - it might be needed for applying format
    // It will be cleared when opening a new modal
}

// Helper function to close all modals (formatting, AI, background, share)
function closeAllModals() {
    // Close formatting modals
    closeAllFormattingModals();

    // Close AI Input Bar
    const aiInputBar = document.getElementById('ai-input-bar');
    if (aiInputBar && aiInputBar.classList.contains('show')) {
        aiInputBar.classList.remove('show');
        // Remove active state from AI Assistant button
        const aiAssistantBtn = document.getElementById('ai-assistant-btn');
        if (aiAssistantBtn) {
            aiAssistantBtn.classList.remove('ai-active');
        }
    }

    // Close AI Tone Menu
    const aiToneMenu = document.getElementById('ai-tone-menu');
    if (aiToneMenu && aiToneMenu.classList.contains('show')) {
        aiToneMenu.classList.remove('show');
        // Remove active state from AI Tone button
        const aiToneBtn = document.getElementById('ai-tone-btn');
        if (aiToneBtn) {
            aiToneBtn.classList.remove('active');
        }
    }

    // Close AI Formatting Menu
    const aiFormattingMenu = document.getElementById('ai-formatting-menu');
    if (aiFormattingMenu && aiFormattingMenu.classList.contains('show')) {
        aiFormattingMenu.classList.remove('show');
        // Remove active state from AI Formatting button
        const aiFormattingBtn = document.getElementById('ai-formatting-btn');
        if (aiFormattingBtn) {
            aiFormattingBtn.classList.remove('active');
        }
    }

    // Close Background Picker Modal
    const backgroundPickerModal = document.getElementById('background-picker-modal');
    if (backgroundPickerModal && backgroundPickerModal.classList.contains('show')) {
        backgroundPickerModal.classList.remove('show');
        setTimeout(() => {
            backgroundPickerModal.style.display = 'none';
        }, 300);
    }

    // Close Share Modal
    const shareModal = document.getElementById('share-modal');
    if (shareModal && shareModal.classList.contains('show')) {
        shareModal.classList.remove('show');
    }

    // Close Context Menus
    const contextMenus = [
        'ai-context-menu',
        'background-context-menu',
        'image-context-menu'
    ];
    contextMenus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu && menu.classList.contains('show')) {
            menu.classList.remove('show');
            menu.style.display = 'none';
        }
    });

    // Close AI Overlay (blur background)
    const aiOverlay = document.getElementById('ai-overlay');
    if (aiOverlay && aiOverlay.style.display !== 'none') {
        aiOverlay.style.display = 'none';
    }
}

function showFormattingModal(modalId) {
    // Close all other modals when opening formatting modal
    // console.log('Closing other modals before showing formatting modal:', modalId);

    // Close any open modal first (but keep savedSelection)
    const hadOpenModal = currentOpenModal !== null;
    closeAllModals();

    // Save current selection before opening new modal
    // Only save if we're opening a new modal (not closing)
    if (quillEditor) {
        savedSelection = quillEditor.getSelection();
        // console.log('Saved selection:', savedSelection);
    }

    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal not found:', modalId);
        return;
    }

    // Show modal with animation
    requestAnimationFrame(() => {
        modal.classList.add('show');
        currentOpenModal = modalId;
    });
}

// Restore selection helper
function restoreSelection() {
    if (quillEditor && savedSelection) {
        quillEditor.setSelection(savedSelection.index, savedSelection.length);
        // console.log('Restored selection:', savedSelection);
    }
}

// Initialize color pickers with colors
function initializeColorPickers() {
    const colors = [
        // Row 1: Grayscale
        '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF', '#E8EAED', '#F1F3F4',
        // Row 2: Primary & Bright Colors
        '#FF0000', '#FF6600', '#FFCC00', '#00FF00', '#00CCFF', '#0066FF', '#6600FF', '#FF0066',
        // Row 3: Medium Tones
        '#FF3366', '#FF6699', '#FF99CC', '#FFCCFF', '#CC99FF', '#9966FF', '#6633FF', '#3300FF',
        // Row 4: Blues & Greens
        '#0033FF', '#0099FF', '#00FFFF', '#00FFCC', '#00FF99', '#00FF66', '#00FF33', '#66FF66',
        // Row 5: Earth & Warm Tones
        '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#F4A460', '#DEB887', '#F5DEB3', '#FFE4B5'
    ];

    // Text color picker
    const textColorGrid = document.getElementById('text-color-grid');
    if (textColorGrid) {
        textColorGrid.innerHTML = colors.map(color =>
            `<div class="text-color-option" data-color="${color}" style="background-color: ${color};"></div>`
        ).join('');

        textColorGrid.querySelectorAll('.text-color-option').forEach(option => {
            option.onclick = () => {
                const color = option.dataset.color;
                if (quillEditor) {
                    // Use saved selection
                    const selection = savedSelection || quillEditor.getSelection();
                    // console.log('Applying text color:', color, 'to selection:', selection);

                    if (selection && selection.length > 0) {
                        // Restore selection first
                        quillEditor.setSelection(selection.index, selection.length);
                        // Apply to selection
                        quillEditor.formatText(selection.index, selection.length, 'color', color);
                    } else if (selection) {
                        // Apply to cursor position for next typing
                        quillEditor.format('color', color, 'user');
                    }
                    markAsUnsaved();
                    saveNoteWithContext('content');
                }
                closeAllFormattingModals();
            };
        });
    }

    // Highlight color picker
    const highlightColorGrid = document.getElementById('highlight-color-grid');
    if (highlightColorGrid) {
        highlightColorGrid.innerHTML = colors.map(color =>
            `<div class="highlight-color-option" data-color="${color}" style="background-color: ${color};"></div>`
        ).join('');

        highlightColorGrid.querySelectorAll('.highlight-color-option').forEach(option => {
            option.onclick = () => {
                const color = option.dataset.color;
                if (quillEditor) {
                    // Use saved selection
                    const selection = savedSelection || quillEditor.getSelection();
                    // console.log('Applying background color:', color, 'to selection:', selection);

                    if (selection && selection.length > 0) {
                        // Restore selection first
                        quillEditor.setSelection(selection.index, selection.length);
                        // Apply to selection
                        quillEditor.formatText(selection.index, selection.length, 'background', color);
                    } else if (selection) {
                        // Apply to cursor position for next typing
                        quillEditor.format('background', color, 'user');
                    }
                    markAsUnsaved();
                    saveNoteWithContext('content');
                }
                closeAllFormattingModals();
            };
        });
    }
}

// Link overlay with toggle support
function openLinkOverlay() {
    // Toggle if already open
    if (currentOpenModal === 'link-input-overlay') {
        closeAllFormattingModals();
        return;
    }

    showFormattingModal('link-input-overlay');

    const input = document.getElementById('link-url-input');
    const insertBtn = document.getElementById('link-insert-btn');

    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }

    const insertLink = () => {
        const url = input.value.trim();
        if (url) {
            insertLinkToEditor(url);
            closeAllFormattingModals();
        }
    };

    if (insertBtn) insertBtn.onclick = insertLink;
    if (input) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter') insertLink();
            if (e.key === 'Escape') closeAllFormattingModals();
        };
    }
}

// Video overlay with toggle support
function openVideoOverlay() {
    // Toggle if already open
    if (currentOpenModal === 'video-input-overlay') {
        closeAllFormattingModals();
        return;
    }

    showFormattingModal('video-input-overlay');

    const input = document.getElementById('video-url-input');
    const insertBtn = document.getElementById('video-insert-btn');

    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }

    const insertVideo = () => {
        const url = input.value.trim();
        if (url) {
            insertVideoToEditor(url);
            closeAllFormattingModals();
        }
    };

    if (insertBtn) insertBtn.onclick = insertVideo;
    if (input) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter') insertVideo();
            if (e.key === 'Escape') closeAllFormattingModals();
        };
    }
}



// Color picker with toggle support
function openColorPicker(type) {
    const modalId = type === 'text' ? 'text-color-picker' : 'highlight-color-picker';

    // Toggle if already open
    if (currentOpenModal === modalId) {
        closeAllFormattingModals();
    } else {
        showFormattingModal(modalId);
    }
}

// Font size picker with toggle support
function openFontSizePicker() {
    // Toggle if already open
    if (currentOpenModal === 'font-size-picker') {
        closeAllFormattingModals();
        return;
    }

    showFormattingModal('font-size-picker');
    initializeFontSizePicker();
}

// Initialize font size picker
let currentFontSize = 16; // Default font size in px

function initializeFontSizePicker() {
    const decreaseBtn = document.getElementById('font-size-decrease');
    const increaseBtn = document.getElementById('font-size-increase');
    const display = document.getElementById('font-size-display');

    // Get current font size from selection
    if (quillEditor) {
        const format = quillEditor.getFormat();
        if (format.size) {
            // Quill uses size like 'small', 'large', 'huge' or custom values
            // We'll use px values
            const sizeMatch = format.size.match(/(\d+)px/);
            if (sizeMatch) {
                currentFontSize = parseInt(sizeMatch[1]);
            }
        }
    }

    // Update display
    if (display) {
        display.textContent = `${currentFontSize}px`;
    }

    // Decrease button
    if (decreaseBtn) {
        decreaseBtn.onclick = () => {
            if (currentFontSize > 8) {
                currentFontSize -= 2;
                applyFontSize(currentFontSize);
                display.textContent = `${currentFontSize}px`;
            }
        };
    }

    // Increase button
    if (increaseBtn) {
        increaseBtn.onclick = () => {
            if (currentFontSize < 72) {
                currentFontSize += 2;
                applyFontSize(currentFontSize);
                display.textContent = `${currentFontSize}px`;
            }
        };
    }
}

// Apply font size to selection
function applyFontSize(size) {
    if (!quillEditor) return;

    // Use saved selection
    const selection = savedSelection || quillEditor.getSelection();
    // console.log('Applying font size:', size, 'to selection:', selection);

    if (selection && selection.length > 0) {
        // Restore selection first
        quillEditor.setSelection(selection.index, selection.length);
        // Apply to selection
        quillEditor.formatText(selection.index, selection.length, 'size', `${size}px`);
    } else if (selection) {
        // Apply to cursor position for next typing
        quillEditor.format('size', `${size}px`, 'user');
    }

    markAsUnsaved();
    saveNoteWithContext('content');
}

// Prevent modal clicks from losing selection (except inputs)
document.addEventListener('mousedown', (e) => {
    const modal = e.target.closest('.formatting-modal');
    // Don't prevent if clicking on input or button that needs focus
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    if (modal && !isInput) {
        // Prevent default to keep selection for color pickers, buttons, etc.
        e.preventDefault();
    }
});

// Global click handler to close modals when clicking outside
document.addEventListener('click', (e) => {
    if (!currentOpenModal) return;

    const modal = document.getElementById(currentOpenModal);
    if (!modal) return;

    // Check if click is outside modal and not on toolbar
    const isClickInsideModal = modal.contains(e.target);
    const isClickOnToolbar = e.target.closest('.toolbar');

    if (!isClickInsideModal && !isClickOnToolbar) {
        closeAllFormattingModals();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentOpenModal) {
        closeAllFormattingModals();
    }
});

// Color pickers are now initialized after Quill is ready (see above)

// Helper functions for inserting content
function insertLinkToEditor(url) {
    if (!quillEditor) return;

    // Use saved selection
    const selection = savedSelection || quillEditor.getSelection();
    // console.log('Inserting link:', url, 'at selection:', selection);

    if (selection && selection.length > 0) {
        // Restore selection first
        quillEditor.setSelection(selection.index, selection.length);
        // Apply link to selected text
        quillEditor.formatText(selection.index, selection.length, 'link', url);
    } else {
        // Insert link at cursor position
        const index = selection ? selection.index : quillEditor.getLength() - 1;
        quillEditor.insertText(index, url, { link: url });
    }

    markAsUnsaved();
    saveNoteWithContext('content');
}

function insertVideoToEditor(url) {
    if (!quillEditor) return;

    const selection = quillEditor.getSelection();
    const index = selection ? selection.index : quillEditor.getLength() - 1;

    // Convert YouTube URL to embed format
    let embedUrl = url;
    if (url.includes('youtube.com/watch?v=')) {
        const videoId = url.split('v=')[1].split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    // Create video HTML
    const videoHtml = `
            <div style="margin: 10px 0; text-align: center;">
                <iframe 
                    src="${embedUrl}" 
                    width="560" 
                    height="315" 
                    frameborder="0" 
                    allowfullscreen
                    style="max-width: 100%; height: auto; border-radius: 8px;">
                </iframe>
            </div>
        `;

    quillEditor.clipboard.dangerouslyPasteHTML(index, videoHtml, 'user');

    markAsUnsaved();
    saveNoteWithContext('content');
}


// AI Formatting Menu Functions
function showAIFormattingMenu() {
    const aiFormattingMenu = document.getElementById('ai-formatting-menu');
    if (!aiFormattingMenu) return;

    // Close all other modals first (but not AI formatting menu itself)
    closeAllFormattingModals();

    const aiInputBar = document.getElementById('ai-input-bar');
    if (aiInputBar && aiInputBar.classList.contains('show')) {
        aiInputBar.classList.remove('show');
        // Remove active state from AI Assistant button
        const aiAssistantBtn = document.getElementById('ai-assistant-btn');
        if (aiAssistantBtn) {
            aiAssistantBtn.classList.remove('ai-active');
        }
    }

    const aiToneMenu = document.getElementById('ai-tone-menu');
    if (aiToneMenu && aiToneMenu.classList.contains('show')) {
        aiToneMenu.classList.remove('show');
        // Remove active state from AI Tone button
        const aiToneBtn = document.getElementById('ai-tone-btn');
        if (aiToneBtn) {
            aiToneBtn.classList.remove('active');
        }
    }

    const backgroundPickerModal = document.getElementById('background-picker-modal');
    if (backgroundPickerModal && backgroundPickerModal.classList.contains('show')) {
        backgroundPickerModal.classList.remove('show');
        setTimeout(() => {
            backgroundPickerModal.style.display = 'none';
        }, 300);
    }

    const shareModal = document.getElementById('share-modal');
    if (shareModal && shareModal.classList.contains('show')) {
        shareModal.classList.remove('show');
    }

    // Close context menus
    const contextMenus = ['ai-context-menu', 'background-context-menu', 'image-context-menu'];
    contextMenus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu && menu.classList.contains('show')) {
            menu.classList.remove('show');
            menu.style.display = 'none';
        }
    });

    // Show AI formatting menu
    aiFormattingMenu.classList.add('show');
}

function hideAIFormattingMenu() {
    const aiFormattingMenu = document.getElementById('ai-formatting-menu');
    if (aiFormattingMenu) {
        aiFormattingMenu.classList.remove('show');
    }
}

// Handle formatting selection
async function handleFormattingSelection(action) {
    if (!quillEditor) {
        console.error('Quill editor not available');
        showToast(chrome.i18n.getMessage('note_editorNotAvailable') || 'Editor not available', 'error');
        return;
    }

    // Hide menu
    hideAIFormattingMenu();
    const aiFormattingBtn = document.getElementById('ai-formatting-btn');
    if (aiFormattingBtn) {
        aiFormattingBtn.classList.remove('active');
    }

    // Check if note is empty before proceeding
    if (isNoteEmpty()) {
        showToast(chrome.i18n.getMessage('errors_noteEmpty') || 'Note is empty. Please add content before using this feature.', 'warning');
        return;
    }

    // Get current note content
    const content = quillEditor.root.innerHTML;

    // Show loading animation
    showAILottieAnimation();

    // Disable formatting button while processing
    if (aiFormattingBtn) {
        aiFormattingBtn.classList.add('ai-processing');
        aiFormattingBtn.disabled = true;
    }

    try {
        let result;

        if (action === 'color-suggestion') {
            result = await callAIFormattingAPI('color-suggestion', content);
            await applyColorSuggestion(result);
            showToast(chrome.i18n.getMessage('note_smartColorsApplied') || 'Smart colors applied!', 'success');
        } else if (action === 'structure-optimization') {
            result = await callAIFormattingAPI('structure-optimization', content);
            await applyStructureOptimization(result);
            showToast(chrome.i18n.getMessage('note_structureOptimized') || 'Structure optimized!', 'success');
        }

    } catch (error) {
        console.error('[AI Formatting] Error:', error);
        showToast(error.message || 'AI formatting failed', 'error');
    } finally {
        // Hide loading animation
        hideAILottieAnimation();

        // Re-enable formatting button
        if (aiFormattingBtn) {
            aiFormattingBtn.classList.remove('ai-processing');
            aiFormattingBtn.disabled = false;
        }
    }
}

// Call AI Formatting API
async function callAIFormattingAPI(action, content) {
    try {
        const backendUrl = serverSelector.getServerUrl();
        const userEmail = await getUserEmailFromExtension();

        if (!userEmail) {
            throw new Error('Please sign in to use AI features');
        }

        const response = await fetch(`${backendUrl}/api/ai/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({ content })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Request failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.result) {
            throw new Error('Invalid response from server');
        }

        return data.result;

    } catch (error) {
        console.error('[AI Formatting API] Error:', error);
        throw error;
    }
}

// Helper function to apply HTML content to Quill editor
function applyHTMLToQuill(content) {
    if (!quillEditor) {
        throw new Error('Editor not available');
    }

    console.log('[AI Formatting] Starting to apply content, length:', content.length);
    console.log('[AI Formatting] Content preview:', content.substring(0, 200));

    // Detect if content is markdown instead of HTML (only if no HTML tags found)
    const hasHTMLTags = /<\/?[a-z][\s\S]*>/i.test(content);

    if (!hasHTMLTags) {
        console.log('[AI Formatting] No HTML tags detected, checking if markdown...');
        const isMarkdown = detectMarkdown(content);
        if (isMarkdown) {
            console.log('[AI Formatting] Detected markdown content, converting to HTML...');
            // Convert markdown to HTML using marked.js if available
            if (typeof marked !== 'undefined') {
                try {
                    content = marked.parse(content);
                    console.log('[AI Formatting] Converted markdown to HTML successfully');
                } catch (markdownError) {
                    console.error('[AI Formatting] Markdown conversion failed:', markdownError);
                }
            } else {
                console.warn('[AI Formatting] marked.js not available, using content as-is');
            }
        }
    } else {
        console.log('[AI Formatting] HTML tags detected, using content directly');
    }

    // Save current selection to restore later
    const currentSelection = quillEditor.getSelection();

    // Clear all current content completely
    console.log('[AI Formatting] Clearing editor content...');
    quillEditor.setText('', 'silent'); // Clear silently first

    // Small delay to ensure editor is cleared
    setTimeout(async () => {
        try {
            console.log('[AI Formatting] Inserting new content...');
            // Insert new HTML content at position 0
            quillEditor.clipboard.dangerouslyPasteHTML(0, content, 'user');
            console.log('[AI Formatting] Content inserted successfully');

            // Force editor update
            quillEditor.update('user');

            // Mark as unsaved and trigger save
            if (typeof markAsUnsaved === 'function') {
                markAsUnsaved();
            }

            // Save note immediately (no delay)
            if (typeof saveNote === 'function') {
                await saveNote();
                console.log('[AI Formatting] Note saved immediately');
            }

            // Set cursor to beginning
            setTimeout(() => {
                quillEditor.setSelection(0, 0, 'user');
                console.log('[AI Formatting] Apply completed successfully');
            }, 50);

        } catch (error) {
            console.error('[AI Formatting] Error applying content:', error);
            // Fallback: Try using innerHTML directly
            try {
                console.log('[AI Formatting] Trying innerHTML fallback...');
                quillEditor.root.innerHTML = content;
                quillEditor.update('user');

                if (typeof markAsUnsaved === 'function') markAsUnsaved();
                if (typeof saveNote === 'function') await saveNote();

                console.log('[AI Formatting] Applied using innerHTML fallback with immediate save');
            } catch (innerHTMLError) {
                console.error('[AI Formatting] innerHTML fallback failed:', innerHTMLError);
                throw new Error('Failed to apply formatting');
            }
        }
    }, 100);
}

// Helper function to detect if content is markdown
function detectMarkdown(content) {
    if (!content || typeof content !== 'string') return false;

    // If content already has HTML tags, it's not markdown
    if (/<\/?[a-z][\s\S]*>/i.test(content)) {
        return false;
    }

    // Check for common markdown patterns
    const markdownPatterns = [
        /^#{1,6}\s+/m,           // Headers: # ## ###
        /\*\*[^*]+\*\*/,         // Bold: **text**
        /\*[^*]+\*/,             // Italic: *text*
        /^\s*[-*+]\s+/m,         // Unordered lists: - * +
        /^\s*\d+\.\s+/m,         // Ordered lists: 1. 2.
        /\[.+\]\(.+\)/,          // Links: [text](url)
        /`[^`]+`/,               // Inline code: `code`
        /```[\s\S]*?```/         // Code blocks: ```code```
    ];

    return markdownPatterns.some(pattern => pattern.test(content));
}

// Helper function to apply HTML with colors preserved (for color suggestion)
async function applyHTMLWithColorsToQuill(htmlContent) {
    if (!quillEditor) {
        throw new Error('Editor not available');
    }

    console.log('[AI Formatting] Applying HTML with colors preserved');
    console.log('[AI Formatting] HTML length:', htmlContent.length);

    // Parse HTML to DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Clear editor first
    console.log('[AI Formatting] Clearing editor...');
    quillEditor.setText('', 'silent');

    // Wait for clear to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('[AI Formatting] Inserting colored content...');

    // Method 1: Try using innerHTML directly (preserves all styles)
    try {
        quillEditor.root.innerHTML = htmlContent;
        quillEditor.update('user');
        console.log('[AI Formatting] Applied using innerHTML (colors preserved)');
        return;
    } catch (error) {
        console.error('[AI Formatting] innerHTML method failed:', error);
    }

    // Method 2: Fallback - use clipboard with custom matcher to preserve colors
    try {
        // Temporarily disable clipboard matchers that strip styles
        const originalMatchers = quillEditor.clipboard.matchers;

        // Add custom matcher to preserve color styles
        quillEditor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
            // Preserve color and background-color from inline styles
            if (node.style && node.style.color) {
                const color = node.style.color;
                delta.ops = delta.ops.map(op => {
                    if (op.insert && typeof op.insert === 'string') {
                        return {
                            ...op,
                            attributes: {
                                ...op.attributes,
                                color: color
                            }
                        };
                    }
                    return op;
                });
            }

            if (node.style && node.style.backgroundColor) {
                const bgColor = node.style.backgroundColor;
                delta.ops = delta.ops.map(op => {
                    if (op.insert && typeof op.insert === 'string') {
                        return {
                            ...op,
                            attributes: {
                                ...op.attributes,
                                background: bgColor
                            }
                        };
                    }
                    return op;
                });
            }

            return delta;
        });

        quillEditor.clipboard.dangerouslyPasteHTML(0, htmlContent, 'user');
        console.log('[AI Formatting] Applied using clipboard with color matcher');

        // Restore original matchers
        quillEditor.clipboard.matchers = originalMatchers;

    } catch (error) {
        console.error('[AI Formatting] Clipboard method failed:', error);
        throw new Error('Failed to apply colors');
    }
}

// Apply color suggestion to note
async function applyColorSuggestion(content) {
    if (!quillEditor) {
        throw new Error('Editor not available');
    }

    console.log('[AI Formatting] Applying color suggestion');
    console.log('[AI Formatting] Content length:', content.length);
    console.log('[AI Formatting] Content preview:', content.substring(0, 200));

    // Save current state to undo history
    if (typeof saveToUndoHistory === 'function') {
        saveToUndoHistory();
        console.log('[AI Formatting] Saved to undo history');
    }

    // Apply HTML content with colors preserved
    await applyHTMLWithColorsToQuill(content);

    // Mark as unsaved and save immediately (no delay)
    if (typeof markAsUnsaved === 'function') {
        markAsUnsaved();
    }
    // Save immediately instead of using delayed save
    if (typeof saveNote === 'function') {
        await saveNote();
        console.log('[AI Formatting] Note saved immediately after color application');
    }
}

// Apply structure optimization to note
async function applyStructureOptimization(content) {
    if (!quillEditor) {
        throw new Error('Editor not available');
    }

    console.log('[AI Formatting] Applying structure optimization');
    console.log('[AI Formatting] Content length:', content.length);
    console.log('[AI Formatting] Content preview:', content.substring(0, 200));

    // Save current state to undo history
    if (typeof saveToUndoHistory === 'function') {
        saveToUndoHistory();
        console.log('[AI Formatting] Saved to undo history');
    }

    // Apply HTML content to editor
    applyHTMLToQuill(content);

    // Note: Save is handled inside applyHTMLToQuill
}

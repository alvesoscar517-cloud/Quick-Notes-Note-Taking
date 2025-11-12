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

// Function to handle AI response and optimize formatting
function formatAIResponse(text) {
    if (!text) return '';

    // Use MarkdownProcessor if available
    if (window.MarkdownProcessor && window.MarkdownProcessor.toHTML) {
        try {
            return window.MarkdownProcessor.toHTML(text);
        } catch (error) {
            console.error('[AI Workspace] Error formatting with MarkdownProcessor:', error);
            // Fallback to simple formatting
        }
    }

    // Fallback: Simple formatting
    let formatted = text;

    // Basic markdown to HTML conversion
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // **bold**
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>'); // *italic*
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>'); // `code`
    formatted = formatted.replace(/\n/g, '<br>'); // newlines

    return formatted;
}

// Function to convert markdown to plain text while preserving basic formatting
function convertMarkdownToPlainText(text) {
    if (!text) return '';

    return text
        // Remove HTML tags but keep content
        .replace(/<strong>(.*?)<\/strong>/g, '$1')
        .replace(/<em>(.*?)<\/em>/g, '$1')
        .replace(/<code>(.*?)<\/code>/g, '$1')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]*>/g, '')
        // Remove markdown headers (# ## ###)
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold (**text** or __text__)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // Remove italic (*text* or _text_)
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Convert markdown links to just text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}$/gm, '')
        // Clean up list markers
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/^\s*(\d+)\.\s+/gm, '$1. ')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Function to add action buttons to AI message
function addAIMessageActionButtons(messageElement, rawContent) {
    // Check if buttons already exist
    if (messageElement.querySelector('.ai-message-actions')) {
        return;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-message-actions';
    actionsDiv.innerHTML = `
        <button class="ai-action-icon-btn" data-action="add-to-note" title="Add to new note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
            </svg>
        </button>
        <button class="ai-action-icon-btn" data-action="copy" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
        </button>
    `;

    // Add event listeners
    const addToNoteBtn = actionsDiv.querySelector('[data-action="add-to-note"]');
    const copyBtn = actionsDiv.querySelector('[data-action="copy"]');

    addToNoteBtn.addEventListener('click', async () => {
        await addAIResponseToNewNote(rawContent);
    });

    copyBtn.addEventListener('click', async () => {
        await copyAIResponse(rawContent);
    });

    messageElement.appendChild(actionsDiv);
}

// Function to add AI response to new note
async function addAIResponseToNewNote(content) {
    try {
        console.log('[Add to Note] Starting with content length:', content.length);
        console.log('[Add to Note] Content preview:', content.substring(0, 100));

        // Send markdown content with a special flag
        // Let the note window handle the conversion using its own Quill instance
        const response = await chrome.runtime.sendMessage({
            action: "createNewNote",
            content: content, // Send raw markdown
            isMarkdown: true // Flag to indicate this is markdown content
        });

        console.log('[Add to Note] Response:', response);

        if (response && response.success) {
            // Show success message
            if (window.showToast) {
                showToast(chrome.i18n.getMessage('toast_addedToNewNote') || '✅ Added to new note', 'success');
            }

            // Refresh notes display if on main page
            if (typeof loadNotes === 'function') {
                await loadNotes();
            }
        } else {
            throw new Error(chrome.i18n.getMessage('errors_failedToCreateNote') || 'Failed to create note');
        }
    } catch (error) {
        console.error('Error adding to new note:', error);
        if (window.showToast) {
            showToast(chrome.i18n.getMessage('toast_failedToAddToNote') || '❌ Failed to add to note', 'error');
        }
    }
}

// Function to copy AI response
async function copyAIResponse(content) {
    try {
        // Convert markdown to plain text before copying
        let plainText = content;

        if (window.MarkdownProcessor && window.MarkdownProcessor.toPlainText) {
            plainText = window.MarkdownProcessor.toPlainText(content);
            console.log('[Copy] Converted markdown to plain text');
        } else {
            console.warn('[Copy] MarkdownProcessor not available, copying as-is');
        }

        await navigator.clipboard.writeText(plainText);

        if (window.showToast) {
            showToast(chrome.i18n.getMessage('toast_copiedToClipboard') || '✅ Copied to clipboard', 'success');
        }
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        if (window.showToast) {
            showToast(chrome.i18n.getMessage('toast_failedToCopy') || '❌ Failed to copy', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check if just returned from payment
    await checkIfReturnedFromPayment();

    // Initialize i18n translations with improved retry logic
    let i18nRetryCount = 0;

    const maxI18nRetries = 5;

    function initializeI18n() {
        if (typeof chrome === 'undefined' || !chrome.i18n || !chrome.i18n.getMessage) {
            if (i18nRetryCount < maxI18nRetries) {
                i18nRetryCount++;
                const retryDelay = Math.min(100 * Math.pow(2, i18nRetryCount - 1), 1000); // Exponential backoff, max 1s
                console.warn(`Chrome i18n not available, retrying... (${i18nRetryCount}/${maxI18nRetries})`);
                setTimeout(initializeI18n, retryDelay);
                return;
            } else {
                console.warn('Chrome i18n failed to initialize after maximum retries, using fallback');
                initializeI18nFallback();
                return;
            }
        }


        // Update app title elements
        const loadingAppTitle = document.querySelector('.app-title');
        const mainAppTitle = document.querySelector('.header h1');

        if (loadingAppTitle) loadingAppTitle.textContent = 'Quick Notes';
        if (mainAppTitle) mainAppTitle.textContent = 'Quick Notes';

        // Update other elements
        const createNoteBtn = document.getElementById('create-note-btn');
        const createCollectionBtn = document.getElementById('create-collection-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const searchInput = document.getElementById('search-input');

        if (createNoteBtn) createNoteBtn.title = chrome.i18n.getMessage('main_createNote') || 'Create a new note';
        if (createCollectionBtn) createCollectionBtn.title = chrome.i18n.getMessage('collections_createCollection') || 'Create Collection';
        if (settingsBtn) settingsBtn.title = chrome.i18n.getMessage('settings_title') || 'Settings';
        if (searchInput) searchInput.placeholder = chrome.i18n.getMessage('main_searchPlaceholder') || 'Search notes...';

    }

    // Function to process translation keys in text
    function processTranslationKeys(text) {
        if (typeof text !== 'string') return text;

        // Check if Chrome i18n is available
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            // Replace __MSG_key__ with translated text
            return text.replace(/__MSG_(\w+)__/g, (match, key) => {
                const translated = chrome.i18n.getMessage(key);
                return translated || match; // Return original if translation not found
            });
        }

        // Fallback: return original text if i18n not available
        return text;
    }

    // Fallback i18n initialization when Chrome i18n fails
    function initializeI18nFallback() {

        // Update app title elements with fallback text
        const loadingAppTitle = document.querySelector('.app-title');
        const mainAppTitle = document.querySelector('.header h1');

        if (loadingAppTitle) loadingAppTitle.textContent = 'Quick Notes';
        if (mainAppTitle) mainAppTitle.textContent = 'Quick Notes';

        // Update other elements with fallback text
        const createNoteBtn = document.getElementById('create-note-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const searchInput = document.getElementById('search-input');

        if (createNoteBtn) createNoteBtn.title = chrome.i18n.getMessage('main_createNote') || 'Create a new note';
        if (settingsBtn) settingsBtn.title = chrome.i18n.getMessage('settings_title') || 'Settings';
        if (searchInput) searchInput.placeholder = chrome.i18n.getMessage('main_searchPlaceholder') || 'Search notes...';

    }


    // Initialize i18n immediately
    initializeI18n();


    // Multi-select state
    let multiSelectMode = false;
    let selectedItems = new Set();
    let currentPage = 'main'; // 'main', 'collection', 'trash'

    // Loading state
    let isLoadingScreenHidden = false;

    // Cut-paste state
    let cutNoteId = null;
    let cutNoteElement = null;

    // Multi-select functions
    function enterMultiSelectMode() {
        // Don't allow multi-select mode when on trash page
        if (currentPage === 'trash') {
            return;
        }

        multiSelectMode = true;
        if (document.body) document.body.classList.add('multi-select-mode');
        updateSelectionCount(); // This will show/hide selection bar based on count
        updateSelectionBar(); // Update selection bar buttons based on current page

        // Add drag listeners for already selected items
        selectedItems.forEach(itemKey => {
            const [itemType, itemId] = itemKey.split(':');
            updateItemSelection(itemId, itemType);
        });
    }

    function exitMultiSelectMode() {
        multiSelectMode = false;
        selectedItems.clear();
        if (document.body) document.body.classList.remove('multi-select-mode');
        hideSelectionBar();
        clearAllSelections();
    }

    function toggleItemSelection(itemId, itemType) {
        const itemKey = `${itemType}:${itemId}`;
        if (selectedItems.has(itemKey)) {
            selectedItems.delete(itemKey);
        } else {
            selectedItems.add(itemKey);
        }
        updateItemSelection(itemId, itemType);
        updateSelectionCount();
        updateSelectionBar();
    }

    function updateItemSelection(itemId, itemType) {
        const itemKey = `${itemType}:${itemId}`;

        // Find element based on current page
        let element;
        if (currentPage === 'collection') {
            element = document.querySelector(`#collection-notes-container .note-tab[data-note-id="${itemId}"]`);
        } else if (currentPage === 'trash') {
            element = document.querySelector(`#trash-container [data-${itemType}-id="${itemId}"]`);
        } else {
            element = document.querySelector(`#notes-list [data-${itemType}-id="${itemId}"]`);
        }

        if (element) {
            if (selectedItems.has(itemKey)) {
                element.classList.add('item-selected');
                element.draggable = true;
                addMultiSelectDragListeners(element, itemType, itemId);
            } else {
                element.classList.remove('item-selected');
                element.draggable = false;
                removeMultiSelectDragListeners(element);
            }
        }
    }

    function clearAllSelections() {
        selectedItems.clear();
        document.querySelectorAll('.item-selected').forEach(el => {
            el.classList.remove('item-selected');
            el.draggable = false;
            removeMultiSelectDragListeners(el);
        });
    }

    function addMultiSelectDragListeners(element, itemType, itemId) {
        // Remove existing listeners first to avoid duplicates
        removeMultiSelectDragListeners(element);

        // Add drag start listener for multi-select drag
        const dragStartHandler = (e) => {
            if (multiSelectMode && selectedItems.size > 0) {
                // Set special data for multi-select drag
                e.dataTransfer.setData('text/plain', 'multi-select-drag');
                e.dataTransfer.effectAllowed = 'move';
            }
        };

        // Store the handler on the element for later removal
        element._multiSelectDragStart = dragStartHandler;
        element.addEventListener('dragstart', dragStartHandler);
    }

    function removeMultiSelectDragListeners(element) {
        if (element._multiSelectDragStart) {
            element.removeEventListener('dragstart', element._multiSelectDragStart);
            delete element._multiSelectDragStart;
        }
    }

    // Cut-paste functions
    function cutNote(noteId) {
        // Clear previous cut note
        clearCutNote();

        // Find note element
        const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);
        if (!noteElement) return;

        // Set cut state
        cutNoteId = noteId;
        cutNoteElement = noteElement;

        // Add visual feedback
        noteElement.classList.add('cut-note');
    }

    function clearCutNote() {
        if (cutNoteElement) {
            cutNoteElement.classList.remove('cut-note');
        }
        cutNoteId = null;
        cutNoteElement = null;
    }

    function undoCutNote() {
        // Clear cut state and restore normal appearance
        clearCutNote();

        // Show toast notification
        showToast(chrome.i18n.getMessage('messages_moveCancelled'));
    }

    async function pasteNoteToCollection(collectionId) {
        if (!cutNoteId) return;

        try {
            await chrome.runtime.sendMessage({
                action: 'moveNoteToCollection',
                noteId: cutNoteId,
                collectionId: collectionId
            });

            showToast(chrome.i18n.getMessage('messages_movedToCollection'));

            // Clear cut state
            clearCutNote();

            // Refresh display with animation for move operation
            if (currentPage === 'collection') {
                loadAndDisplayCollectionNotes();
            } else {
                loadAndDisplayNotesWithCollections(true);
            }
        } catch (error) {
            console.error('Error moving note to collection:', error);
            showToast(chrome.i18n.getMessage('messages_failedToMoveNote'));
        }
    }

    function selectAllItems() {
        if (currentPage === 'trash') return;

        // Get items based on current page
        const selector = currentPage === 'collection'
            ? '#collection-notes-container .note-tab'
            : '#notes-list .note-tab, #notes-list .collection-card';

        const items = document.querySelectorAll(selector);

        // Clear and rebuild
        selectedItems.clear();

        // Add all items to selection
        items.forEach(item => {
            const noteId = item.dataset.noteId;
            const collectionId = item.dataset.collectionId;

            if (noteId) {
                selectedItems.add(`note:${noteId}`);
                item.classList.add('item-selected');
            } else if (collectionId) {
                selectedItems.add(`collection:${collectionId}`);
                item.classList.add('item-selected');
            }
        });

        updateSelectionCount();
        updateSelectionBar();
    }

    function showSelectionBar() {
        const selectionBar = document.getElementById('selection-bar');
        if (selectionBar && selectedItems.size > 0) {
            selectionBar.classList.add('show');
        }
    }

    function hideSelectionBar() {
        const selectionBar = document.getElementById('selection-bar');
        if (selectionBar) {
            selectionBar.classList.remove('show');
        }
    }

    function updateSelectionCount() {
        const countElement = document.getElementById('selection-count');
        const selectionBar = document.getElementById('selection-bar');
        const breakdownElement = document.getElementById('selection-breakdown');
        const count = selectedItems.size;

        if (countElement) {
            countElement.textContent = count.toString();
        }

        // Update breakdown (notes vs collections)
        if (breakdownElement) {
            let noteCount = 0;
            let collectionCount = 0;

            selectedItems.forEach(itemKey => {
                const [itemType] = itemKey.split(':');
                if (itemType === 'note') {
                    noteCount++;
                } else if (itemType === 'collection') {
                    collectionCount++;
                }
            });

            let breakdownHTML = '';
            if (noteCount > 0) {
                breakdownHTML += `<span class="selection-breakdown-item">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                        <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    ${noteCount}
                </span>`;
            }
            if (collectionCount > 0) {
                breakdownHTML += `<span class="selection-breakdown-item">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    ${collectionCount}
                </span>`;
            }
            breakdownElement.innerHTML = breakdownHTML;
        }

        // Show/hide selection bar based on count, but not on trash page
        if (selectionBar) {
            if (currentPage === 'trash') {
                // Trash page doesn't have selection bar
                selectionBar.classList.remove('show');
            } else if (count > 0) {
                selectionBar.classList.add('show');
            } else {
                selectionBar.classList.remove('show');
            }
        }
    }

    function updateSelectionBar() {
        const bulkRestoreBtn = document.getElementById('bulk-restore-btn');
        const bulkDeleteForeverBtn = document.getElementById('bulk-delete-forever-btn');
        const bulkDeleteBtn = document.getElementById('bulk-delete-btn');

        if (currentPage === 'trash') {
            // Trash page doesn't have selection bar
            return;
        } else {
            // Show normal buttons, hide restore and delete forever
            if (bulkRestoreBtn) bulkRestoreBtn.style.display = 'none';
            if (bulkDeleteForeverBtn) bulkDeleteForeverBtn.style.display = 'none';
            if (bulkDeleteBtn) bulkDeleteBtn.style.display = 'flex';
        }
    }


    async function performBulkOperation(operation) {
        if (selectedItems.size === 0) return;

        // Only confirm for restore and deleteForever operations
        const confirmMessages = {
            restore: chrome.i18n.getMessage('multiSelect_confirmBulkRestore'),
            deleteForever: chrome.i18n.getMessage('multiSelect_confirmBulkDeleteForever')
        };

        if (confirmMessages[operation]) {
            const confirmed = await showCustomConfirm(confirmMessages[operation]);
            if (!confirmed) return;
        }

        const promises = [];
        for (const itemKey of selectedItems) {
            const [itemType, itemId] = itemKey.split(':');

            switch (operation) {
                case 'pin':
                    if (itemType === 'note') {
                        promises.push(chrome.runtime.sendMessage({ action: 'updateNoteData', noteId: itemId, data: { pinned: true } }));
                    } else if (itemType === 'collection') {
                        promises.push(chrome.runtime.sendMessage({ action: 'updateCollection', collectionId: itemId, data: { pinned: true } }));
                    }
                    break;
                case 'unpin':
                    if (itemType === 'note') {
                        promises.push(chrome.runtime.sendMessage({ action: 'updateNoteData', noteId: itemId, data: { pinned: false } }));
                    } else if (itemType === 'collection') {
                        promises.push(chrome.runtime.sendMessage({ action: 'updateCollection', collectionId: itemId, data: { pinned: false } }));
                    }
                    break;
                case 'delete':
                    if (itemType === 'note') {
                        promises.push(chrome.runtime.sendMessage({ action: 'deleteNote', noteId: itemId }));
                    } else if (itemType === 'collection') {
                        promises.push(chrome.runtime.sendMessage({ action: 'deleteCollection', collectionId: itemId }));
                    }
                    break;
                case 'restore':
                    if (itemType === 'note') {
                        promises.push(chrome.runtime.sendMessage({ action: 'restoreNote', noteId: itemId }));
                    } else if (itemType === 'collection') {
                        promises.push(chrome.runtime.sendMessage({ action: 'restoreCollection', collectionId: itemId }));
                    }
                    break;
                case 'deleteForever':
                    if (itemType === 'note') {
                        promises.push(chrome.runtime.sendMessage({ action: 'deleteNotePermanently', noteId: itemId }));
                    } else if (itemType === 'collection') {
                        promises.push(chrome.runtime.sendMessage({ action: 'deleteCollectionPermanently', collectionId: itemId }));
                    }
                    break;
            }
        }

        try {
            await Promise.all(promises);
            showToast(chrome.i18n.getMessage('messages_done'));
            exitMultiSelectMode();

            // Refresh display based on current page
            if (currentPage === 'collection') {
                loadAndDisplayCollectionNotes();
            } else {
                loadAndDisplayNotesWithCollections();
            }
        } catch (error) {
            console.error('Bulk operation failed:', error);
            showToast(chrome.i18n.getMessage('toast_failed') || 'Failed');
        }
    }

    // DOM elements
    const mainPage = document.getElementById('main-page');
    const settingsPage = document.getElementById('settings-page');
    const trashPage = document.getElementById('trash-page');
    const createNoteBtn = document.getElementById('create-note-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const searchInput = document.getElementById('search-input');
    const searchGradientWrapper = document.getElementById('search-gradient-wrapper');
    const notesListContainer = document.getElementById('notes-list');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const googleSyncBtn = document.getElementById('google-sync-btn');
    const googleSignoutBtn = document.getElementById('google-signout-btn');
    const userInfoContainer = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');
    const toggleThemeBtn = document.getElementById('toggle-theme-btn');
    const exportNotesBtn = document.getElementById('export-notes-btn');
    const importNotesBtn = document.getElementById('import-notes-btn');
    const importFileInput = document.getElementById('import-file-input');
    const openTrashBtn = document.getElementById('open-trash-btn');
    const backFromTrashBtn = document.getElementById('back-from-trash-btn');
    const trashContainer = document.getElementById('trash-container');
    const restoreAllBtn = document.getElementById('restore-all-btn');
    const clearTrashBtn = document.getElementById('clear-trash-btn');
    const toast = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    const confirmOverlay = document.getElementById('custom-confirm-overlay');
    const confirmMessage = document.getElementById('custom-confirm-message');
    const confirmYesBtn = document.getElementById('custom-confirm-yes');
    const confirmNoBtn = document.getElementById('custom-confirm-no');
    const loadingScreen = document.getElementById('loading-screen');
    const noteContextMenu = document.getElementById('note-context-menu');
    const collectionContextMenu = document.getElementById('collection-context-menu');
    const individualCollectionContextMenu = document.getElementById('individual-collection-context-menu');
    const trashContextMenu = document.getElementById('trash-context-menu');
    const collectionPage = document.getElementById('collection-page');
    const backFromCollectionBtn = document.getElementById('back-from-collection-btn');
    const collectionDialogOverlay = document.getElementById('collection-dialog-overlay');
    const collectionNameInput = document.getElementById('collection-name-input');
    const collectionCreateBtn = document.getElementById('collection-create-btn');
    const collectionCancelBtn = document.getElementById('collection-cancel-btn');
    const collectionEditDialogOverlay = document.getElementById('collection-edit-dialog-overlay');
    const collectionEditNameInput = document.getElementById('collection-edit-name-input');
    const collectionSaveBtn = document.getElementById('collection-save-btn');
    const collectionEditCancelBtn = document.getElementById('collection-edit-cancel-btn');
    const themeOptions = document.querySelectorAll('.theme-option');

    // Event listeners
    if (createNoteBtn) {
        createNoteBtn.addEventListener('click', () => chrome.runtime.sendMessage({ action: "createNewNote" }));
    }

    // Multi-select event listeners
    document.addEventListener('click', (e) => {
        if (multiSelectMode) {
            // Handle item clicks in multi-select mode
            const noteTab = e.target.closest('.note-tab');
            const collectionCard = e.target.closest('.collection-card');

            if (noteTab) {
                e.preventDefault();
                e.stopPropagation();
                const noteId = noteTab.dataset.noteId;
                if (noteId) {
                    toggleItemSelection(noteId, 'note');
                }
            } else if (collectionCard) {
                e.preventDefault();
                e.stopPropagation();
                const collectionId = collectionCard.dataset.collectionId;
                if (collectionId) {
                    toggleItemSelection(collectionId, 'collection');
                }
            }
        }
    });

    // Drag and drop for selected items
    document.addEventListener('dragstart', (e) => {
        if (multiSelectMode && selectedItems.size > 0) {
            const item = e.target.closest('.note-tab, .collection-card');
            if (item && item.classList.contains('item-selected')) {
                e.stopPropagation(); // Prevent individual drag handlers
                e.dataTransfer.setData('text/plain', 'multi-select-drag');
                e.dataTransfer.effectAllowed = 'move';

                // Create a custom drag image showing multiple items
                const dragImage = document.createElement('div');
                dragImage.style.cssText = `
                    position: absolute;
                    top: -1000px;
                    background: var(--glass-bg-dark);
                    border: 1px solid var(--glass-border-dark);
                    border-radius: 8px;
                    padding: 8px 12px;
                    color: var(--dark-text);
                    font-size: 12px;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                `;
                dragImage.textContent = selectedItems.size.toString();
                if (document.body) {
                    document.body.appendChild(dragImage);
                    e.dataTransfer.setDragImage(dragImage, 0, 0);

                    // Clean up drag image after a short delay
                    setTimeout(() => {
                        if (document.body && document.body.contains(dragImage)) {
                            document.body.removeChild(dragImage);
                        }
                    }, 100);
                }
            }
        }
    });


    // Selection bar event listeners
    document.getElementById('cancel-selection-btn')?.addEventListener('click', () => {
        exitMultiSelectMode();
    });

    document.getElementById('select-all-btn')?.addEventListener('click', () => {
        selectAllItems();
    });


    document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
        await performBulkOperation('delete');
    });

    document.getElementById('bulk-restore-btn')?.addEventListener('click', async () => {
        await performBulkOperation('restore');
    });

    document.getElementById('bulk-delete-forever-btn')?.addEventListener('click', async () => {
        await performBulkOperation('deleteForever');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && multiSelectMode) {
            exitMultiSelectMode();
        }
    });
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (searchInput) searchInput.addEventListener('input', filterNotes);

    // Handle Enter key press for shake animation when no results
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const filter = searchInput.value.trim();

                // console.log('Enter pressed, filter:', filter);

                if (filter) {
                    const filterLower = filter.toLowerCase();

                    // Wait a bit for the filter to complete
                    setTimeout(() => {
                        const tabs = notesListContainer.querySelectorAll('.note-tab');
                        const collections = notesListContainer.querySelectorAll('.collection-card');

                        // Check if there are any visible results
                        let hasVisibleResults = false;

                        tabs.forEach(tab => {
                            const displayStyle = window.getComputedStyle(tab).display;
                            if (displayStyle !== 'none') {
                                hasVisibleResults = true;
                            }
                        });

                        if (!hasVisibleResults) {
                            collections.forEach(collection => {
                                const displayStyle = window.getComputedStyle(collection).display;
                                if (displayStyle !== 'none') {
                                    hasVisibleResults = true;
                                }
                            });
                        }

                        // console.log('Has visible results:', hasVisibleResults);

                        // Trigger shake animation if no results
                        if (!hasVisibleResults) {
                            // console.log('No results found, triggering shake animation');

                            // Check if anime is available
                            if (typeof anime !== 'undefined') {
                                anime({
                                    targets: searchInput,
                                    translateX: [
                                        { value: -50, duration: 50 },
                                        { value: 50, duration: 50 },
                                        { value: -50, duration: 50 },
                                        { value: 50, duration: 50 },
                                        { value: -50, duration: 50 },
                                        { value: 50, duration: 50 },
                                        { value: 0, duration: 50 }
                                    ],
                                    easing: 'easeInOutQuad'
                                });
                            } else {
                                console.error('anime.js is not loaded');
                            }
                        }
                    }, 200); // Wait for debounce to complete
                }
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            // No longer add 'active' class to remove gradient border
        });
        searchInput.addEventListener('blur', () => {
            // No longer remove 'active' class since we don't add it
        });
    }
    if (backToMainBtn) backToMainBtn.addEventListener('click', closeSettings);
    if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', toggleTheme);
    if (exportNotesBtn) exportNotesBtn.addEventListener('click', exportData);
    if (importNotesBtn) importNotesBtn.addEventListener('click', () => importFileInput?.click());
    if (importFileInput) importFileInput.addEventListener('change', importData);
    if (openTrashBtn) openTrashBtn.addEventListener('click', openTrash);
    if (backFromTrashBtn) backFromTrashBtn.addEventListener('click', closeTrash);
    if (googleSyncBtn) googleSyncBtn.addEventListener('click', handleGoogleAuth);
    const manualSyncBtn = document.getElementById('manual-sync-btn');
    if (manualSyncBtn) manualSyncBtn.addEventListener('click', handleManualSync);
    if (googleSignoutBtn) googleSignoutBtn.addEventListener('click', handleSignOut);
    if (restoreAllBtn) restoreAllBtn.addEventListener('click', restoreAllNotes);
    if (clearTrashBtn) clearTrashBtn.addEventListener('click', clearAllTrashNotes);

    // Note size configuration modal event listeners
    const configureNoteSizeBtn = document.getElementById('configure-note-size-btn');
    const noteSizeModal = document.getElementById('note-size-modal');
    const noteWidthInput = document.getElementById('note-width-input');
    const noteHeightInput = document.getElementById('note-height-input');
    const saveNoteSizeBtn = document.getElementById('save-note-size-btn');
    const cancelNoteSizeBtn = document.getElementById('cancel-note-size-btn');
    const resetNoteSizeBtn = document.getElementById('reset-note-size-btn');

    if (configureNoteSizeBtn) {
        configureNoteSizeBtn.addEventListener('click', async () => {
            // Load current settings
            const defaultSize = await dbManager.getSetting('defaultNoteSize') || { width: 584, height: 792 };
            noteWidthInput.value = defaultSize.width;
            noteHeightInput.value = defaultSize.height;
            noteSizeModal.style.display = 'flex';
        });
    }

    if (resetNoteSizeBtn) {
        resetNoteSizeBtn.addEventListener('click', () => {
            // Reset to default values
            noteWidthInput.value = 584;
            noteHeightInput.value = 792;
        });
    }

    if (saveNoteSizeBtn) {
        saveNoteSizeBtn.addEventListener('click', async () => {
            const width = parseInt(noteWidthInput.value);
            const height = parseInt(noteHeightInput.value);
            
            if (width >= 400 && width <= 1920 && height >= 400 && height <= 1080) {
                await dbManager.saveSetting('defaultNoteSize', { width, height });
                noteSizeModal.style.display = 'none';
                showToast(chrome.i18n.getMessage('settings_noteSizeModal_saved') || 'Đã lưu kích thước mặc định');
            } else {
                showToast(chrome.i18n.getMessage('settings_noteSizeInvalid') || 'Invalid size. Width: 400-1920, Height: 400-1080');
            }
        });
    }

    if (cancelNoteSizeBtn) {
        cancelNoteSizeBtn.addEventListener('click', () => {
            noteSizeModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    if (noteSizeModal) {
        noteSizeModal.addEventListener('click', (e) => {
            if (e.target === noteSizeModal) {
                noteSizeModal.style.display = 'none';
            }
        });
    }

    if (backFromCollectionBtn) backFromCollectionBtn.addEventListener('click', closeCollection);
    if (collectionCreateBtn) collectionCreateBtn.addEventListener('click', createCollection);
    if (collectionCancelBtn) collectionCancelBtn.addEventListener('click', closeCollectionDialog);
    if (collectionSaveBtn) collectionSaveBtn.addEventListener('click', saveCollection);
    if (collectionEditCancelBtn) collectionEditCancelBtn.addEventListener('click', closeCollectionEditDialog);
    const createNoteInCollectionBtn = document.getElementById('create-note-in-collection-btn');
    if (createNoteInCollectionBtn) createNoteInCollectionBtn.addEventListener('click', createNoteInCollection);
    const editCollectionBtn = document.getElementById('edit-collection-btn');
    if (editCollectionBtn) editCollectionBtn.addEventListener('click', editCollection);
    const deleteCollectionBtn = document.getElementById('delete-collection-btn');
    if (deleteCollectionBtn) deleteCollectionBtn.addEventListener('click', deleteCollection);

    // AI Workspace Modal event listeners
    const aiWorkspaceCollectionBtn = document.getElementById('ai-workspace-collection-btn');
    const aiWorkspaceModal = document.getElementById('ai-workspace-modal');
    const backFromAiWorkspaceBtn = document.getElementById('back-from-ai-workspace-btn');
    const aiWorkspaceOptions = document.getElementById('ai-workspace-options');
    const aiWorkspaceResult = document.getElementById('ai-workspace-result');
    const aiWorkspaceInput = document.getElementById('ai-workspace-input');
    const aiWorkspaceSendBtn = document.getElementById('ai-workspace-send-btn');

    if (aiWorkspaceCollectionBtn) {
        aiWorkspaceCollectionBtn.addEventListener('click', function (e) {
            // Store the clicked button for animation
            window.lastClickedAIButton = e.currentTarget;
            openAiWorkspaceModal();
        });
    }

    if (backFromAiWorkspaceBtn) {
        backFromAiWorkspaceBtn.addEventListener('click', closeAiWorkspaceModal);
    }

    if (aiWorkspaceSendBtn) {
        aiWorkspaceSendBtn.addEventListener('click', sendAiMessage);
    }

    if (aiWorkspaceInput) {
        aiWorkspaceInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAiMessage();
            }
        });
    }

    // AI Workspace option buttons event listeners
    if (aiWorkspaceOptions) {
        aiWorkspaceOptions.addEventListener('click', (e) => {
            const optionButton = e.target.closest('.ai-option-button');
            if (optionButton) {
                const action = optionButton.dataset.action;
                handleAiOptionClick(action);
            }
        });
    }

    // Close modal when clicking outside
    if (aiWorkspaceModal) {
        aiWorkspaceModal.addEventListener('click', (e) => {
            if (e.target === aiWorkspaceModal) {
                closeAiWorkspaceModal();
            }
        });
    }

    // Theme picker event listeners
    if (themeOptions && themeOptions.length > 0) {
        themeOptions.forEach(option => {
            option.addEventListener('click', (e) => selectTheme(e.target.closest('.theme-option')));
        });
    }

    // Collection context menu event listeners
    if (collectionContextMenu) {
        collectionContextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action === 'create-collection') {
                openCollectionDialog();
            }
            hideCollectionContextMenu();
        });
    }

    // Individual collection context menu event listeners
    if (individualCollectionContextMenu) {
        individualCollectionContextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            const collectionId = individualCollectionContextMenu.dataset.collectionId;

            if (action === 'select-multiple') {
                enterMultiSelectMode();
            } else if (action === 'pin-collection' && collectionId) {
                togglePinCollection(collectionId);
            } else if (action === 'unpin-collection' && collectionId) {
                togglePinCollection(collectionId);
            } else if (action === 'edit-collection' && collectionId) {
                editCollectionFromContext(collectionId);
            } else if (action === 'delete-collection' && collectionId) {
                deleteCollectionFromContext(collectionId);
            }

            hideIndividualCollectionContextMenu();
        });
    }

    // Note context menu event listeners
    if (noteContextMenu) {
        noteContextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            const noteId = noteContextMenu.dataset.noteId;

            if (action === 'undo-cut' && noteId) {
                e.stopPropagation();
                undoCutNote();
            } else if (action === 'select-multiple') {
                e.stopPropagation();
                enterMultiSelectMode();
            } else if (action === 'pin' && noteId) {
                e.stopPropagation();
                togglePinNote(noteId);
            } else if (action === 'unpin' && noteId) {
                e.stopPropagation();
                togglePinNote(noteId);
            } else if (action === 'move-to-collection' && noteId) {
                e.stopPropagation();
                cutNote(noteId);
            } else if (action === 'remove-from-collection' && noteId) {
                e.stopPropagation();
                removeNoteFromCollection(noteId);
            } else if (action === 'delete' && noteId) {
                e.stopPropagation();
                deleteNoteWithConfirmation(noteId);
            }

            hideNoteContextMenu();
        });
    }

    // Listener for storage changes (local context)
    dbManager.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.notes || changes.trash || changes.collections)) {
            loadAndDisplayNotes();
            if (trashPage.classList.contains('active')) {
                // Invalidate cache and force refresh
                trashCache = null;
                loadAndDisplayTrash(true);
            }
            if (collectionPage.classList.contains('active')) {
                loadAndDisplayCollectionNotes();
            }
        }
    });

    // Listener for storage changes from service worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'storageChanged') {
            const changes = message.changes;
            const namespace = message.namespace;

            if (namespace === 'local' && (changes.notes || changes.trash || changes.collections)) {
                console.log('[Main App] Storage changed from service worker:', changes);
                loadAndDisplayNotes();
                if (trashPage.classList.contains('active')) {
                    // Invalidate cache and force refresh
                    trashCache = null;
                    loadAndDisplayTrash(true);
                }
                if (collectionPage.classList.contains('active')) {
                    loadAndDisplayCollectionNotes();
                }
            }
        }
    });

    // Listener for messages from service worker (e.g., sync status)
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'sync_status') {
            hideSyncStatus(); // Hide loading status
            hideSyncToast(); // Hide loading toast
            // Show sync result after a short delay to allow hide animation
            setTimeout(() => {
                showSyncToastWithIcon(request.message, request.success, false);
            }, 100);
        } else if (request.action === 'updateNoteData') {
            // Handle note data updates from note windows
            handleNoteDataUpdate(request.noteId, request.data);
        } else if (request.action === 'aiTitleGenerated') {
            // Handle AI title generation complete
            handleAITitleGenerated(request.noteId, request.aiTitle);
        }
    });


    // --- Handle Note Data Updates ---
    async function handleNoteDataUpdate(noteId, data) {
        // Update the note card display if it exists
        const noteTab = document.querySelector(`[data-note-id="${noteId}"]`);
        if (noteTab && data.color) {
            // Update the border color of the note card with glassmorphism effect
            updateNoteCardAppearance(noteTab, data.color);
        }

        // Reload and display notes to ensure all changes are reflected
        await loadAndDisplayNotesWithCollections();
    }

    // --- Handle AI Title Generated ---
    async function handleAITitleGenerated(noteId, aiTitle) {
        // console.log('🎯 AI title generated for note:', noteId, '- Title:', aiTitle);

        // Wait a tiny bit for any pending DOM updates
        await new Promise(resolve => setTimeout(resolve, 50));

        // Find the note card immediately (should already exist)
        let noteCard = document.querySelector(`[data-note-id="${noteId}"]`);

        if (!noteCard) {
            // Don't reload - just skip the animation
            // The title will show up next time user opens main app
            return;
        }

        // Find the title element (h3 or .note-title)
        const titleElement = noteCard.querySelector('h3, .note-title');
        if (!titleElement) {
            return;
        }

        const oldTitle = titleElement.textContent.trim();

        // Skip if title is already the same
        if (oldTitle === aiTitle) {
            return;
        }

        // Clear current title and start typing new title
        titleElement.textContent = ''; // Clear immediately

        // Type new title character by character
        for (let i = 0; i <= aiTitle.length; i++) {
            titleElement.textContent = aiTitle.substring(0, i);
            await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per character
        }
    }

    // --- Typewriter Effect ---
    async function typewriterEffect(element, oldText, newText) {
        // Phase 1: Delete old text
        for (let i = oldText.length; i >= 0; i--) {
            element.textContent = oldText.substring(0, i);
            await new Promise(resolve => setTimeout(resolve, 30)); // 30ms per character
        }

        // Small pause
        await new Promise(resolve => setTimeout(resolve, 200));

        // Phase 2: Type new text
        for (let i = 0; i <= newText.length; i++) {
            element.textContent = newText.substring(0, i);
            await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per character
        }
    }

    // --- Extract Note Title (with AI-generated title priority) ---
    function extractNoteTitle(note) {
        // Priority 1: Use AI-generated title if available
        if (note.aiTitle) {
            let title = note.aiTitle;
            // Truncate if too long
            if (title.length > 60) {
                title = title.substring(0, 57) + '...';
            }
            return title;
        }

        // Priority 2: Default to "New Note" for notes without AI title
        return chrome.i18n.getMessage('note_defaultTitle') || 'New Note';
    }

    // --- Extract Note Preview (from content, excluding first line if it looks like title) ---
    function extractNotePreview(note) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        let fullText = tempDiv.textContent.trim();

        // Remove first line if it looks like a title (to avoid duplication)
        const lines = fullText.split('\n');
        let preview = '';

        if (lines.length > 1 && lines[0].length < 100) {
            // First line is likely a title, use rest as preview
            preview = lines.slice(1).join('\n').trim();
        } else {
            // Use full text as preview
            preview = fullText;
        }

        // If preview is empty, use first 100 chars of full text
        if (!preview || preview.length === 0) {
            preview = fullText.substring(0, 100);
        }

        return preview || chrome.i18n.getMessage('main_noContent') || 'No content';
    }

    // --- Update Note Card Appearance ---
    function updateNoteCardAppearance(noteTab, color) {
        if (!color) {
            // Use default color if no color provided
            color = '#fbbc04';
        }

        // Validate hex color format
        const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (!hexPattern.test(color)) {
            console.warn('Invalid color format:', color, 'using default color');
            color = '#fbbc04';
        }

        try {
            // Set border-top color
            noteTab.style.setProperty('border-top-color', color, 'important');

            // Set CSS variable for pinned note title color
            noteTab.style.setProperty('--note-color', color);
        } catch (error) {
            console.error('Error applying note card color:', error);
            // Fallback to default styling
            noteTab.style.setProperty('border-top-color', '#fbbc04', 'important');
            noteTab.style.setProperty('--note-color', '#fbbc04');
        }
    }


    // --- Display and Filter Notes ---
    function displayNote(note) {
        const noteTab = document.createElement('div');
        noteTab.className = 'note-tab';
        noteTab.dataset.noteId = note.id;

        // Add selection checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'selection-checkbox';
        checkbox.style.display = multiSelectMode ? 'flex' : 'none';
        noteTab.appendChild(checkbox);

        const title = extractNoteTitle(note);
        const fullPreview = extractNotePreview(note);

        // Only take the first line of preview and add "..." if longer
        const firstLine = fullPreview.split('\n')[0];
        const preview = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;

        const date = new Date(note.lastModified || Date.now());
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });


        noteTab.innerHTML = `
            <div class="note-header">
                <h3>${title}</h3>
                <span class="note-date">${formattedDate}</span>
            </div>
            <p class="note-preview">${preview}</p>
        `;

        // Set pinned attribute if note is pinned
        if (note.pinned) {
            noteTab.dataset.pinned = 'true';
        }

        // Apply color AFTER innerHTML is set
        updateNoteCardAppearance(noteTab, note.color || '#fbbc04');
        noteTab.addEventListener('click', (e) => {
            // Don't open note if in multi-select mode
            if (multiSelectMode) return;
            chrome.runtime.sendMessage({ action: "openNoteWindow", noteId: note.id });
        });
        noteTab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleNoteContextMenu(e, note.id);
        });

        // Enable drag for collection drops
        // note-card-drag-to-window.js will handle drag to window via mousedown/mousemove
        noteTab.draggable = true;
        
        // Set up dragstart for collection drops
        noteTab.addEventListener('dragstart', (e) => {
            // Only allow drag if not in multi-select mode or if this item is selected
            if (multiSelectMode) {
                const itemKey = `note:${note.id}`;
                if (!selectedItems.has(itemKey)) {
                    e.preventDefault();
                    return;
                }
                // Multi-select drag
                e.dataTransfer.setData('text/plain', 'multi-select-drag');
            } else {
                // Single note drag to collection
                e.dataTransfer.setData('text/plain', note.id);
            }
            e.dataTransfer.effectAllowed = 'move';
        });

        if (multiSelectMode) {
            // Multi-select mode - check if this note is selected and add appropriate drag listeners
            const itemKey = `note:${note.id}`;
            if (selectedItems.has(itemKey)) {
                addMultiSelectDragListeners(noteTab, 'note', note.id);
            }
        }

        notesListContainer.appendChild(noteTab);
    }

    async function loadAndDisplayNotes(animate = false) {
        // Use the unified function with optional animation
        await loadAndDisplayNotesWithCollections(animate);
    }

    // Initialize search highlighter
    const highlighter = window.searchHighlighter || new SearchHighlighter();

    // Debounce timer for search
    let searchDebounceTimer = null;

    function filterNotes() {
        // Clear previous debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        // Debounce search for better performance
        searchDebounceTimer = setTimeout(() => {
            performFilterAndHighlight();
        }, 150); // 150ms debounce
    }

    // Cat animation instance
    let catAnimation = null;

    // Initialize cat animation
    function initCatAnimation() {
        const container = document.getElementById('cat-animation-container');
        if (!container || catAnimation) return;

        // Load cat animation
        catAnimation = lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '../libs/Cat playing animation.json'
        });
    }

    // Show empty search state
    function showEmptySearchState() {
        const emptyState = document.getElementById('empty-search-state');
        if (emptyState) {
            emptyState.style.display = 'block';
            if (!catAnimation) {
                initCatAnimation();
            }
        }
    }

    // Hide empty search state
    function hideEmptySearchState() {
        const emptyState = document.getElementById('empty-search-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    function performFilterAndHighlight() {
        const filter = searchInput.value.trim();
        const tabs = notesListContainer.querySelectorAll('.note-tab');
        const collections = notesListContainer.querySelectorAll('.collection-card');

        if (!filter) {
            // Remove all highlights and show all items
            highlighter.clearBatch(tabs);
            highlighter.clearBatch(collections);
            tabs.forEach(tab => tab.style.setProperty('display', 'flex', 'important'));
            collections.forEach(collection => collection.style.setProperty('display', 'flex', 'important'));
            hideEmptySearchState();
            return;
        }

        const filterLower = filter.toLowerCase();
        const collectionsWithMatches = new Set();
        let hasAnyMatches = false;

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            // Filter and highlight notes
            tabs.forEach((tab, index) => {
                // Clear old highlights first
                highlighter.clearHighlight(tab);

                const content = tab.textContent.toLowerCase();
                const noteId = tab.dataset.noteId;
                const collectionId = tab.dataset.collectionId;

                const matches = content.includes(filterLower);

                if (matches) {
                    hasAnyMatches = true;
                    // Highlight immediately without stagger for better performance
                    highlighter.highlightInNote(tab, filter);

                    // Track collection
                    if (collectionId) {
                        collectionsWithMatches.add(collectionId);
                    }
                }

                tab.style.setProperty('display', matches ? 'flex' : 'none', 'important');
            });

            // Filter and highlight collections
            collections.forEach((collection, index) => {
                highlighter.clearHighlight(collection);

                const collectionId = collection.dataset.collectionId;
                const collectionName = collection.textContent.toLowerCase();

                const hasMatchingNotes = collectionsWithMatches.has(collectionId);
                const collectionNameMatches = collectionName.includes(filterLower);
                const shouldShow = hasMatchingNotes || collectionNameMatches;

                if (shouldShow) {
                    hasAnyMatches = true;
                }

                if (collectionNameMatches) {
                    // Highlight immediately without stagger for better performance
                    highlighter.highlightInCollection(collection, filter);
                }

                collection.style.setProperty('display', shouldShow ? 'flex' : 'none', 'important');
            });

            // Show/hide empty state based on results
            if (!hasAnyMatches) {
                showEmptySearchState();
            } else {
                hideEmptySearchState();
            }
        });
    }

    // --- Note Context Menu Functions ---
    function handleNoteContextMenu(e, noteId) {
        e.preventDefault();
        showNoteContextMenu(e.clientX, e.clientY, noteId);
    }

    // Hide all context menus except the specified one
    function hideAllContextMenusExcept(exceptMenu) {
        if (exceptMenu !== 'note') hideNoteContextMenu();
        if (exceptMenu !== 'collection') hideCollectionContextMenu();
        if (exceptMenu !== 'individualCollection') hideIndividualCollectionContextMenu();
        if (exceptMenu !== 'trash') hideTrashContextMenu();
    }

    // Helper function to adjust context menu position to prevent overflow
    function adjustContextMenuPosition(menu, x, y) {
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
    }

    async function showNoteContextMenu(x, y, noteId) {
        // Hide all other context menus first
        hideAllContextMenusExcept('note');

        // Store noteId for later use
        noteContextMenu.dataset.noteId = noteId;

        // Show/hide "Select Multiple" option - always show
        const selectMultipleItem = noteContextMenu.querySelector('[data-action="select-multiple"]');
        if (selectMultipleItem) {
            selectMultipleItem.style.display = 'flex';
        }

        // Show/hide separator after "Select Multiple" - always show
        const separator = noteContextMenu.querySelector('.context-menu-separator');
        if (separator) {
            separator.style.display = 'block';
        }

        // Show/hide "Remove from Collection" option based on current page
        const removeFromCollectionItem = noteContextMenu.querySelector('[data-action="remove-from-collection"]');
        if (removeFromCollectionItem) {
            removeFromCollectionItem.style.display = collectionPage.classList.contains('active') ? 'flex' : 'none';
        }

        // Show/hide "Move to Collection" option - hide when on collection page
        const moveToCollectionItem = noteContextMenu.querySelector('[data-action="move-to-collection"]');
        if (moveToCollectionItem) {
            moveToCollectionItem.style.display = collectionPage.classList.contains('active') ? 'none' : 'flex';
        }

        // Show/hide "Undo Cut" option - only show when this note is cut
        const undoCutItem = noteContextMenu.querySelector('[data-action="undo-cut"]');
        if (undoCutItem) {
            undoCutItem.style.display = (cutNoteId === noteId) ? 'flex' : 'none';
        }

        // Show/hide pin/unpin options based on current status
        try {
            const note = await dbManager.getNote(noteId);
            const pinItem = noteContextMenu.querySelector('[data-action="pin"]');
            const unpinItem = noteContextMenu.querySelector('[data-action="unpin"]');

            if (pinItem && unpinItem && note) {
                if (note.pinned) {
                    pinItem.style.display = 'none';
                    unpinItem.style.display = 'flex';
                } else {
                    pinItem.style.display = 'flex';
                    unpinItem.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error updating context menu:', error);
        }

        // Position the context menu with overflow prevention
        if (noteContextMenu) {
            adjustContextMenuPosition(noteContextMenu, x, y);

            // Show with animation
            setTimeout(() => {
                noteContextMenu.classList.add('show');
            }, 10);
        }
    }

    function hideNoteContextMenu() {
        if (noteContextMenu) {
            noteContextMenu.classList.remove('show');
            setTimeout(() => {
                noteContextMenu.style.display = 'none';
            }, 200);
        }
    }

    async function removeNoteFromCollection(noteId) {
        try {
            await chrome.runtime.sendMessage({
                action: 'removeNoteFromCollection',
                noteId: noteId
            });
            showToast(chrome.i18n.getMessage('toast_moved') || 'Moved');
            loadAndDisplayCollectionNotes();
        } catch (error) {
            console.error('Error removing note from collection:', error);
            showToast(chrome.i18n.getMessage('toast_moveFailed') || 'Move failed');
        }
    }

    async function moveSelectedItemsToCollection(collectionId) {
        try {
            const selectedNotes = Array.from(selectedItems).filter(item => item.startsWith('note:'));

            if (selectedNotes.length === 0) {
                showToast(chrome.i18n.getMessage('toast_noSelection') || 'No selection');
                return;
            }

            for (const item of selectedNotes) {
                const noteId = item.replace('note:', '');
                await chrome.runtime.sendMessage({
                    action: 'moveNoteToCollection',
                    noteId: noteId,
                    collectionId: collectionId
                });
            }

            // Clear selection and reload with animation for move operation
            exitMultiSelectMode();
            await loadAndDisplayNotesWithCollections(true);

            // Show success message
            const message = chrome.i18n.getMessage('collections_notesMoved') || `${selectedNotes.length} notes moved to collection`;
            showToast(message);
        } catch (error) {
            console.error('Error moving notes to collection:', error);
            showToast(chrome.i18n.getMessage('toast_moveFailed') || 'Move failed');
        }
    }

    async function deleteNoteWithConfirmation(noteId) {
        chrome.runtime.sendMessage({ action: "deleteNote", noteId: noteId }, () => {
            showToast(chrome.i18n.getMessage('messages_noteDeleted') || 'Note deleted');
        });
    }

    async function togglePinNote(noteId) {
        const note = await dbManager.getNote(noteId);
        if (note) {
            const newPinnedStatus = !note.pinned;
            chrome.runtime.sendMessage({
                action: "updateNoteData",
                noteId: noteId,
                data: { pinned: newPinnedStatus }
            }, () => {
                const message = newPinnedStatus ?
                    (chrome.i18n.getMessage('messages_notePinned') || 'Note pinned') :
                    (chrome.i18n.getMessage('messages_noteUnpinned') || 'Note unpinned');
                showToast(message);

                // Reload with animation for pin/unpin based on current page
                if (currentPage === 'collection') {
                    loadAndDisplayCollectionNotes(true);
                } else {
                    loadAndDisplayNotesWithCollections(true);
                }
            });
        }
    }

    // --- AI Workspace Synthesis (Bulk Operation) ---
    async function handleBulkSynthesis() {
        try {
            // Check if any items are selected
            if (selectedItems.size === 0) {
                showToast(chrome.i18n.getMessage('messages_selectNotesFirst'));
                return;
            }

            // Filter only notes (exclude collections)
            const selectedNotes = Array.from(selectedItems).filter(item => item.startsWith('note:'));

            if (selectedNotes.length === 0) {
                showToast(chrome.i18n.getMessage('messages_selectAtLeastOneNote'));
                return;
            }

            // Prompt user for the task they want AI to perform
            const userTask = prompt(chrome.i18n.getMessage('ai_workspace_prompt'));

            if (!userTask || userTask.trim().length === 0) {
                return; // User cancelled or entered empty task
            }

            // Show loading toast
            showToast(chrome.i18n.getMessage('ai_workspace_processing'), 5000);

            // Collect note contents
            const notesContent = [];
            const notes = await dbManager.getAllNotes();

            for (const item of selectedNotes) {
                const noteId = item.replace('note:', '');
                const note = notes[noteId];

                if (note && note.content) {
                    // Extract text content only (no HTML)
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = note.content;
                    const textContent = tempDiv.textContent || tempDiv.innerText || '';

                    if (textContent.trim().length > 0) {
                        notesContent.push(textContent.trim());
                    }
                }
            }

            if (notesContent.length === 0) {
                showToast(chrome.i18n.getMessage('ai_workspace_no_notes'));
                return;
            }

            // Get user email for authentication
            const userEmail = await getUserEmail();
            if (!userEmail) {
                showToast(chrome.i18n.getMessage('ai_signInRequired'));
                return;
            }

            // Call backend API - using specialized workspace synthesize endpoint
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/ai/workspace/synthesize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': userEmail
                },
                body: JSON.stringify({
                    notesContent: notesContent,
                    userTask: userTask.trim()
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                // Optimize error message from backend
                let errorMessage = result.error || chrome.i18n.getMessage('ai_workspace_analysisFailedDefault');

                // Shorten long messages
                if (errorMessage.length > 60) {
                    errorMessage = errorMessage.substring(0, 57) + '...';
                }

                showToast(errorMessage);

                // If premium feature error, show premium modal
                if (response.status === 403) {
                    // Don't show modal if payment verification is in progress
                    const upgradeBtn = document.getElementById('premium-upgrade-btn');
                    const hasSpinner = upgradeBtn?.querySelector('.payment-spinner') !== null;
                    const hasFlag = sessionStorage.getItem('payment_checking') === 'true';
                    if (!hasSpinner && !hasFlag) {
                        setTimeout(() => showPremiumModal(), 1000);
                    }
                }
                return;
            }

            // Create a new pinned note with AI analysis result
            const aiResult = result.result;
            const timestamp = new Date().toLocaleString();
            const noteContent = `<h1>🤖 ${chrome.i18n.getMessage('ai_workspace_collection_analysis')}</h1>
<p><strong>${chrome.i18n.getMessage('ai_workspace_task_label')}:</strong> ${userTask}</p>
<p><strong>${chrome.i18n.getMessage('ai_workspace_analyzed_label')}:</strong> ${selectedNotes.length} ${chrome.i18n.getMessage('ai_workspace_notes_label')} | ${timestamp}</p>
<hr>
${aiResult.split('\n').map(line => `<p>${line}</p>`).join('')}`;

            // Send message to create new note
            chrome.runtime.sendMessage({
                action: 'createNewNote',
                content: noteContent,
                pinned: true
            }, (response) => {
                if (response && response.success) {
                    const message = chrome.i18n.getMessage('ai_workspace_createdNoteWithInsights').replace('{count}', selectedNotes.length);
                    showToast(`✨ ${chrome.i18n.getMessage('ai_workspace_analysis_complete')} ${message}`);

                    // Exit multi-select mode and refresh
                    exitMultiSelectMode();

                    // Refresh the notes display
                    if (currentPage === 'collection') {
                        loadAndDisplayCollectionNotes();
                    } else {
                        loadAndDisplayNotesWithCollections();
                    }
                } else {
                    showToast(chrome.i18n.getMessage('ai_workspace_error'));
                }
            });

            // Refresh AI usage data
            await loadAIUsageData();

        } catch (error) {
            console.error('Error in bulk synthesis:', error);
            showToast(chrome.i18n.getMessage('ai_workspace_error'));
        }
    }

    // --- AI Workspace Modal Functions ---
    let currentAiConversation = null; // Store conversation context

    // Optimized circular reveal animation for AI Workspace - faster and smoother
    function circularRevealWorkspace(sourceElement, targetModal) {
        // Force position from top-right (where AI button should be)
        const sourceCenterX = window.innerWidth - 50; // 50px from right edge
        const sourceCenterY = 50; // 50px from top

        // Calculate the maximum distance to cover entire screen from this point
        const maxDistance = Math.sqrt(
            Math.pow(Math.max(sourceCenterX, window.innerWidth - sourceCenterX), 2) +
            Math.pow(Math.max(sourceCenterY, window.innerHeight - sourceCenterY), 2)
        ) * 2.5;

        // Create circular reveal element - start from icon size
        const circleReveal = document.createElement('div');
        circleReveal.className = 'ai-workspace-circular-reveal';
        const startSize = 50; // Start size matching icon
        circleReveal.style.left = (sourceCenterX - startSize / 2) + 'px';
        circleReveal.style.top = (sourceCenterY - startSize / 2) + 'px';
        circleReveal.style.width = startSize + 'px';
        circleReveal.style.height = startSize + 'px';
        document.body.appendChild(circleReveal);

        // Show modal immediately but transparent
        targetModal.style.display = 'flex';
        targetModal.style.opacity = '0';

        // Use CSS transitions instead of anime.js for better performance
        requestAnimationFrame(() => {
            // Apply transition
            circleReveal.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
            targetModal.style.transition = 'opacity 0.3s ease-out';

            // Trigger animation
            circleReveal.style.width = maxDistance + 'px';
            circleReveal.style.height = maxDistance + 'px';
            circleReveal.style.left = (sourceCenterX - maxDistance / 2) + 'px';
            circleReveal.style.top = (sourceCenterY - maxDistance / 2) + 'px';
            circleReveal.style.opacity = '0';

            // Fade in modal quickly
            setTimeout(() => {
                targetModal.style.opacity = '1';
            }, 100);

            // Cleanup
            setTimeout(() => {
                circleReveal.remove();
                targetModal.classList.add('show');
                targetModal.style.opacity = '';
                targetModal.style.transition = '';
            }, 500);
        });
    }

    // Sync AI workspace theme with main app theme
    function syncAiWorkspaceTheme() {
        const modal = document.getElementById('ai-workspace-modal');
        if (!modal) return;

        // Check if main app is in light theme
        const isLightTheme = document.body.classList.contains('light-theme');

        if (isLightTheme) {
            modal.classList.add('light-theme');
        } else {
            modal.classList.remove('light-theme');
        }
    }

    // Preload modal content to reduce lag
    let aiWorkspacePreloaded = false;
    function preloadAiWorkspaceModal() {
        if (aiWorkspacePreloaded) return;

        const modal = document.getElementById('ai-workspace-modal');
        if (modal) {
            // Preload by setting display and immediately hiding
            modal.style.display = 'flex';
            modal.style.visibility = 'hidden';
            modal.style.opacity = '0';

            // Force browser to render
            modal.offsetHeight;

            // Hide again
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.visibility = '';
                modal.style.opacity = '';
                aiWorkspacePreloaded = true;
            }, 50);
        }
    }

    async function openAiWorkspaceModal() {
        try {
            // Check if user is logged in
            const userEmail = await getUserEmail();
            if (!userEmail) {
                showToast(chrome.i18n.getMessage('ai_signInRequired'));
                return;
            }

            // Check number of notes in collection (limit: 20 notes)
            if (currentCollectionId) {
                const notes = await dbManager.getAllNotes();
                const collectionNotes = Object.values(notes).filter(note =>
                    note.collectionId === currentCollectionId && !note.deleted
                );

                const MAX_NOTES = 20;
                if (collectionNotes.length > MAX_NOTES) {
                    showAiWorkspaceLimitModal(collectionNotes.length, MAX_NOTES);
                    return;
                }
            }

            // Check premium status
            const serverStatus = await checkServerPremiumStatus(userEmail);
            const isPremium = serverStatus.isPremium;

            // Allow opening modal for all logged-in users, but show usage info
            // Premium users: unlimited access
            // Regular users: 4 uses per day

            const modal = document.getElementById('ai-workspace-modal');
            const collectionNameElement = document.getElementById('ai-workspace-collection-name');
            // Get the button that was clicked - use stored reference or find by ID
            let sourceButton = window.lastClickedAIButton || document.getElementById('ai-workspace-collection-btn');

            if (modal) {
                // Prepare modal content BEFORE showing (reduce lag)
                // Set collection name in header
                if (collectionNameElement && currentCollectionId) {
                    const collection = await dbManager.getCollection(currentCollectionId);
                    if (collection) {
                        collectionNameElement.textContent = collection.name;
                    } else {
                        collectionNameElement.textContent = chrome.i18n.getMessage('ai_workspace_title') || 'AI Workspace';
                    }
                } else if (collectionNameElement) {
                    collectionNameElement.textContent = chrome.i18n.getMessage('ai_workspace_title') || 'AI Workspace';
                }

                // Sync theme with main app
                syncAiWorkspaceTheme();

                // Reset modal state BEFORE showing
                showAiOptions();

                // Set body state immediately
                document.body.classList.add('ai-workspace-open');
                document.body.style.overflow = 'hidden';

                // Apply optimized circular reveal animation
                if (sourceButton) {
                    circularRevealWorkspace(sourceButton, modal);
                } else {
                    // Fallback: instant show with fade
                    modal.style.display = 'flex';
                    modal.style.opacity = '0';
                    requestAnimationFrame(() => {
                        modal.style.transition = 'opacity 0.2s ease-out';
                        modal.style.opacity = '1';
                        modal.classList.add('show');
                        setTimeout(() => {
                            modal.style.transition = '';
                        }, 200);
                    });
                }

                // Show AI input container
                const inputContainer = document.querySelector('.ai-workspace-input-container');
                if (inputContainer) {
                    inputContainer.classList.add('show');
                }

                // Don't show usage info for regular users - only show when limit is reached via backend error
            }
        } catch (error) {
            console.error('Error opening AI Workspace modal:', error);
            showToast(chrome.i18n.getMessage('ai_workspace_error') || 'Failed to open AI Workspace. Please try again.');
        }
    }

    function closeAiWorkspaceModal() {
        const modal = document.getElementById('ai-workspace-modal');
        if (modal) {
            // Optimized fade out using CSS transitions
            modal.style.transition = 'opacity 0.2s ease-out';
            modal.style.opacity = '0';

            setTimeout(() => {
                modal.classList.remove('show');
                modal.style.display = 'none';
                modal.style.opacity = '';
                modal.style.transition = '';
            }, 200);

            document.body.classList.remove('ai-workspace-open');
            document.body.style.overflow = '';

            // Hide AI input container
            const inputContainer = document.querySelector('.ai-workspace-input-container');
            if (inputContainer) {
                inputContainer.classList.remove('show');
            }

            // Hide processing indicator when closing modal
            hideAiProcessingIndicator();

            // Reset modal state
            showAiOptions();
            currentAiConversation = null;
        }
    }

    // Show AI Workspace limit modal when collection has too many notes
    function showAiWorkspaceLimitModal(currentCount, maxCount) {
        // Detect current theme - app uses 'light-theme' class, absence means dark
        const isLight = document.body.classList.contains('light-theme');

        const modalHtml = `
            <div id="ai-workspace-limit-overlay" class="ai-limit-modal-overlay ${isLight ? 'light' : 'dark'}">
                <div class="ai-limit-modal-box">
                    <h3 class="ai-limit-title">Cannot use AI Workspace</h3>
                    <p class="ai-limit-message">This collection has <strong>${currentCount} notes</strong>, exceeding the limit of <strong>${maxCount} notes</strong>.</p>
                    <button id="ai-workspace-limit-ok-btn" class="ai-limit-btn">OK</button>
                </div>
            </div>
            <style>
                .ai-limit-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    opacity: 1;
                    transition: opacity 0.2s;
                }
                .ai-limit-modal-overlay.dark {
                    background: rgba(0, 0, 0, 0.6);
                }
                .ai-limit-modal-box {
                    background: white;
                    border-radius: 14px;
                    padding: 24px;
                    max-width: 320px;
                    width: 90%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                    text-align: center;
                }
                .ai-limit-modal-overlay.dark .ai-limit-modal-box {
                    background: #2c2c2e;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                }
                .ai-limit-title {
                    margin: 0 0 12px 0;
                    font-size: 17px;
                    font-weight: 600;
                    color: #000;
                }
                .ai-limit-modal-overlay.dark .ai-limit-title {
                    color: #fff;
                }
                .ai-limit-message {
                    margin: 0 0 20px 0;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #666;
                }
                .ai-limit-modal-overlay.dark .ai-limit-message {
                    color: #98989d;
                }
                .ai-limit-message strong {
                    color: #000;
                }
                .ai-limit-modal-overlay.dark .ai-limit-message strong {
                    color: #fff;
                }
                .ai-limit-btn {
                    width: 100%;
                    padding: 12px;
                    background: #007AFF;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .ai-limit-btn:hover {
                    background: #0051D5;
                }
            </style>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('ai-workspace-limit-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Add event listener to close button
        const okBtn = document.getElementById('ai-workspace-limit-ok-btn');
        const modal = document.getElementById('ai-workspace-limit-overlay');

        if (okBtn && modal) {
            const closeModal = () => {
                modal.style.opacity = '0';
                setTimeout(() => {
                    modal.remove();
                }, 200);
            };

            okBtn.addEventListener('click', closeModal);

            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
        }
    }

    function showAiOptions() {
        const options = document.getElementById('ai-workspace-options');
        const result = document.getElementById('ai-workspace-result');
        const introArea = document.getElementById('ai-intro-area');

        if (options) options.style.display = 'flex';
        if (result) result.style.display = 'none';
        if (introArea) introArea.style.display = 'flex';

        // Clear active states
        document.querySelectorAll('.ai-option-button').forEach(button => {
            button.classList.remove('active');
        });
    }

    function showAiResult() {
        const options = document.getElementById('ai-workspace-options');
        const result = document.getElementById('ai-workspace-result');
        const introArea = document.getElementById('ai-intro-area');

        if (options) options.style.display = 'none'; // Hide options when showing result
        if (result) result.style.display = 'block';
        if (introArea) introArea.style.display = 'none'; // Hide intro when showing result
    }

    async function handleAiOptionClick(action) {
        try {
            // Set active state for selected option
            document.querySelectorAll('.ai-option-button').forEach(button => {
                button.classList.remove('active');
            });
            const selectedOption = document.querySelector(`[data-action="${action}"]`);
            if (selectedOption) {
                selectedOption.classList.add('active');
            }

            // Get collection notes
            const collectionNotes = await getCollectionNotes();
            if (collectionNotes.length === 0) {
                showToast(chrome.i18n.getMessage('ai_workspace_no_notes') || 'No notes found in this collection');
                return;
            }

            // Show loading
            showAiResult();
            const resultContent = document.getElementById('ai-result-content');

            if (resultContent) {
                resultContent.innerHTML = ``; // Clear processing text
            }

            // Show processing indicator at bottom left corner
            showAiProcessingIndicator();

            // Prepare notes content
            const notesContent = collectionNotes.map(note => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content;
                return tempDiv.textContent || tempDiv.innerText || '';
            }).filter(content => content.trim().length > 0);

            if (notesContent.length === 0) {
                showToast(chrome.i18n.getMessage('ai_workspace_no_notes') || 'No valid content found in collection notes');
                return;
            }

            // Determine endpoint and parameters based on action - using specialized workspace endpoints
            const userEmail = await getUserEmail();
            const backendUrl = serverSelector.getServerUrl();

            let endpoint = '';
            let requestBody = {};
            let userTask = ''; // Initialize userTask to avoid undefined error

            switch (action) {
                case 'synthesis':
                    // General synthesis with custom task
                    endpoint = `${backendUrl}/api/ai/workspace/summary`;
                    userTask = 'summary'; // Track the task type
                    requestBody = {
                        notesContent: notesContent,
                        streaming: true
                    };
                    break;
                case 'themes':
                    // Extract keywords/themes
                    endpoint = `${backendUrl}/api/ai/workspace/keywords`;
                    userTask = 'keywords'; // Track the task type
                    requestBody = {
                        notesContent: notesContent,
                        streaming: true
                    };
                    break;
                case 'todo':
                    // Extract tasks/action items
                    endpoint = `${backendUrl}/api/ai/workspace/tasks`;
                    userTask = 'tasks'; // Track the task type
                    requestBody = {
                        notesContent: notesContent,
                        streaming: true
                    };
                    break;
                case 'faq':
                    // Custom synthesis for FAQ
                    endpoint = `${backendUrl}/api/ai/workspace/synthesize`;
                    userTask = chrome.i18n.getMessage('ai_workspace_task_faq') || 'From these notes, create a list of frequently asked questions and answers (FAQ). Identify important topics and create appropriate questions with detailed answers.';
                    requestBody = {
                        notesContent: notesContent,
                        userTask: userTask,
                        streaming: true
                    };
                    break;
                case 'search':
                    // Custom synthesis for connections
                    endpoint = `${backendUrl}/api/ai/workspace/synthesize`;
                    userTask = chrome.i18n.getMessage('ai_workspace_task_search') || 'Find and explain connections between information in the notes. Identify links, contradictions, or relationships between different topics mentioned in the notes.';
                    requestBody = {
                        notesContent: notesContent,
                        userTask: userTask,
                        streaming: true
                    };
                    break;
                default:
                    return;
            }

            // Call AI API with streaming
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': userEmail
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.text().catch(() => '');
                const errorMessage = errorData || chrome.i18n.getMessage('ai_workspace_analysisFailedRetry');

                // Check if it's a daily limit error
                if (response.status === 429 && (errorMessage.includes('Daily AI Workspace limit') || errorMessage.includes('daily limit'))) {
                    // Show toast notification for limit reached
                    showToast(chrome.i18n.getMessage('ai_workspace_usage_limit'), 5000);
                    hideAiProcessingIndicator();
                    return;
                }

                if (resultContent) {
                    // Create chat messages container
                    const chatContainer = document.createElement('div');
                    chatContainer.className = 'ai-chat-messages';

                    // Add error message
                    const errorMessageDiv = document.createElement('div');
                    errorMessageDiv.className = 'ai-message assistant';
                    errorMessageDiv.innerHTML = `
                        <div class="ai-message-bubble" style="color: #ff6b6b;">❌ ${errorMessage}</div>
                    `;
                    chatContainer.appendChild(errorMessageDiv);

                    resultContent.innerHTML = '';
                    resultContent.appendChild(chatContainer);

                    // Auto scroll to bottom with delay to ensure DOM is rendered
                    setTimeout(() => {
                        const resultArea = document.getElementById('ai-workspace-result');
                        if (resultArea) {
                            resultArea.scrollTop = resultArea.scrollHeight;
                        }
                    }, 100);
                }
                hideAiProcessingIndicator();
                return;
            }

            // Process streaming response
            if (resultContent) {
                // Create chat messages container
                const chatContainer = document.createElement('div');
                chatContainer.className = 'ai-chat-messages';

                // Add AI message with streaming content
                const aiMessage = document.createElement('div');
                aiMessage.className = 'ai-message assistant';
                aiMessage.innerHTML = `
                    <div class="ai-message-bubble">
                        <div class="ai-streaming-content" id="ai-workspace-streaming-content"></div>
                    </div>
                `;
                chatContainer.appendChild(aiMessage);

                resultContent.innerHTML = '';
                resultContent.appendChild(chatContainer);

                // Process the stream
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                const streamingContent = document.getElementById('ai-workspace-streaming-content');

                try {
                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        fullContent += chunk;

                        // Hide typing indicator when starting to receive data
                        if (fullContent.length > 0) {
                            hideAiProcessingIndicator();
                        }

                        // Update the streaming content
                        if (streamingContent) {
                            streamingContent.innerHTML = formatAIResponse(fullContent);

                            // Auto scroll to bottom with delay to ensure DOM is rendered
                            setTimeout(() => {
                                const resultArea = document.getElementById('ai-workspace-result');
                                if (resultArea) {
                                    resultArea.scrollTop = resultArea.scrollHeight;
                                }
                            }, 50);
                        }
                    }

                    // Add action buttons after streaming completes
                    if (fullContent && aiMessage) {
                        addAIMessageActionButtons(aiMessage, fullContent);
                    }
                } finally {
                    reader.releaseLock();
                }
            }
            // Hide 3-dot effect
            hideAiProcessingIndicator();
            // Store conversation context for follow-up questions
            currentAiConversation = {
                notesContent: notesContent,
                initialTask: userTask,
                conversationHistory: []
            };

            // Refresh AI usage data
            await loadAIUsageData();

        } catch (error) {
            console.error('Error in AI option click:', error);
            const resultContent = document.getElementById('ai-result-content');
            if (resultContent) {
                // Create chat messages container
                const chatContainer = document.createElement('div');
                chatContainer.className = 'ai-chat-messages';

                // Add error message
                const errorMessageDiv = document.createElement('div');
                errorMessageDiv.className = 'ai-message assistant';
                errorMessageDiv.innerHTML = `
                    <div class="ai-message-bubble" style="color: #ff6b6b;">❌ An error occurred during AI analysis. Please try again.</div>
                `;
                chatContainer.appendChild(errorMessageDiv);

                resultContent.innerHTML = '';
                resultContent.appendChild(chatContainer);

                // Auto scroll to bottom with delay to ensure DOM is rendered
                setTimeout(() => {
                    const resultArea = document.getElementById('ai-workspace-result');
                    if (resultArea) {
                        resultArea.scrollTop = resultArea.scrollHeight;
                    }
                }, 100);
            }
            // Hide 3-dot effect on error
            hideAiProcessingIndicator();
        }
    }

    async function sendAiMessage() {
        const input = document.getElementById('ai-workspace-input');
        const message = input?.value?.trim();

        if (!message) return;

        // If no conversation exists, create new one
        if (!currentAiConversation) {
            const collectionNotes = await getCollectionNotes();
            if (collectionNotes.length === 0) {
                showToast(chrome.i18n.getMessage('messages_noNotesInCollection'));
                return;
            }

            // Create new conversation with all notes in collection
            const notesContent = collectionNotes.map(note => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = note.content;
                return tempDiv.textContent || tempDiv.innerText || '';
            }).filter(content => content.trim().length > 0);

            currentAiConversation = {
                notesContent: notesContent,
                initialTask: 'General conversation',
                conversationHistory: []
            };
        }

        try {
            // Hide options and intro when sending message
            showAiResult();

            // Add user message to conversation
            currentAiConversation.conversationHistory.push({
                role: 'user',
                content: message
            });

            // Clear input
            if (input) input.value = '';

            // Show loading in result area
            const resultContent = document.getElementById('ai-result-content');
            if (resultContent) {
                // Create chat messages container if it doesn't exist
                let chatContainer = resultContent.querySelector('.ai-chat-messages');
                if (!chatContainer) {
                    chatContainer = document.createElement('div');
                    chatContainer.className = 'ai-chat-messages';
                    resultContent.innerHTML = '';
                    resultContent.appendChild(chatContainer);
                }

                // Add user message
                const userMessage = document.createElement('div');
                userMessage.className = 'ai-message user';
                userMessage.innerHTML = `
                    <div class="ai-message-bubble">${message}</div>
                `;
                chatContainer.appendChild(userMessage);

                // Auto scroll to bottom with delay to ensure DOM is rendered
                setTimeout(() => {
                    const resultArea = document.getElementById('ai-workspace-result');
                    if (resultArea) {
                        resultArea.scrollTop = resultArea.scrollHeight;
                    }
                }, 100);
            }

            // Add subtle effect to send button
            const sendBtn = document.getElementById('ai-workspace-send-btn');
            if (sendBtn) {
                sendBtn.style.pointerEvents = 'none';
                sendBtn.style.transform = 'scale(0.95)';
                sendBtn.style.transition = 'transform 0.1s ease';
                // Restore after 200ms
                setTimeout(() => {
                    sendBtn.style.transform = 'scale(1)';
                    sendBtn.style.pointerEvents = 'auto';
                }, 200);
            }
            // Show 3-dot effect at bottom left corner
            showAiProcessingIndicator();

            // Call AI API for follow-up with streaming - using workspace chat endpoint
            const userEmail = await getUserEmail();
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/ai/workspace/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': userEmail
                },
                body: JSON.stringify({
                    message: message,
                    notesContent: currentAiConversation.notesContent,
                    streaming: true
                })
            });

            if (!response.ok) {
                const errorData = await response.text().catch(() => '');
                const errorMessage = errorData || chrome.i18n.getMessage('ai_workspace_responseFailedRetry');

                // Check if it's a daily limit error
                if (response.status === 429 && (errorMessage.includes('Daily AI Workspace limit') || errorMessage.includes('daily limit'))) {
                    // Show toast notification for limit reached
                    showToast(chrome.i18n.getMessage('ai_workspace_usage_limit'), 5000);
                    hideAiProcessingIndicator();
                    return;
                }

                if (resultContent) {
                    const chatContainer = resultContent.querySelector('.ai-chat-messages');
                    if (chatContainer) {
                        // Add error message
                        const errorMessageDiv = document.createElement('div');
                        errorMessageDiv.className = 'ai-message assistant';
                        errorMessageDiv.innerHTML = `
                            <div class="ai-message-bubble" style="color: #ff6b6b;">❌ ${errorMessage}</div>
                        `;
                        chatContainer.appendChild(errorMessageDiv);

                        // Auto scroll to bottom with delay to ensure DOM is rendered
                        setTimeout(() => {
                            const resultArea = document.getElementById('ai-workspace-result');
                            if (resultArea) {
                                resultArea.scrollTop = resultArea.scrollHeight;
                            }
                        }, 100);
                    }
                }
                hideAiProcessingIndicator();
                return;
            }

            // Display AI response with streaming
            if (resultContent) {
                // Get chat container
                const chatContainer = resultContent.querySelector('.ai-chat-messages');
                if (chatContainer) {
                    // Add AI message with streaming content
                    const aiMessage = document.createElement('div');
                    aiMessage.className = 'ai-message assistant';
                    aiMessage.innerHTML = `
                        <div class="ai-message-bubble">
                            <div class="ai-streaming-content" id="ai-workspace-chat-streaming-content"></div>
                        </div>
                    `;
                    chatContainer.appendChild(aiMessage);

                    // Process the stream
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let fullContent = '';
                    const streamingContent = document.getElementById('ai-workspace-chat-streaming-content');

                    try {
                        while (true) {
                            const { done, value } = await reader.read();

                            if (done) break;

                            const chunk = decoder.decode(value, { stream: true });
                            fullContent += chunk;

                            // Hide typing indicator when starting to receive data
                            if (fullContent.length > 0) {
                                hideAiProcessingIndicator();
                            }

                            // Update the streaming content
                            if (streamingContent) {
                                streamingContent.innerHTML = formatAIResponse(fullContent);

                                // Auto scroll to bottom with delay to ensure DOM is rendered
                                setTimeout(() => {
                                    const resultArea = document.getElementById('ai-workspace-result');
                                    if (resultArea) {
                                        resultArea.scrollTop = resultArea.scrollHeight;
                                    }
                                }, 50);
                            }
                        }

                        // Add AI response to conversation
                        currentAiConversation.conversationHistory.push({
                            role: 'assistant',
                            content: fullContent
                        });

                        // Add action buttons after streaming completes
                        if (fullContent && aiMessage) {
                            addAIMessageActionButtons(aiMessage, fullContent);
                        }

                    } finally {
                        reader.releaseLock();
                    }
                }
            }

            // Hide 3-dot effect
            hideAiProcessingIndicator();
            // Refresh AI usage data
            await loadAIUsageData();

        } catch (error) {
            console.error('Error sending AI message:', error);
            const resultContent = document.getElementById('ai-result-content');
            if (resultContent) {
                const chatContainer = resultContent.querySelector('.ai-chat-messages');
                if (chatContainer) {
                    // Add error message
                    const errorMessageDiv = document.createElement('div');
                    errorMessageDiv.className = 'ai-message assistant';
                    errorMessageDiv.innerHTML = `
                        <div class="ai-message-bubble" style="color: #ff6b6b;">❌ An error occurred. Please try again.</div>
                    `;
                    chatContainer.appendChild(errorMessageDiv);

                    // Auto scroll to bottom with delay to ensure DOM is rendered
                    setTimeout(() => {
                        const resultArea = document.getElementById('ai-workspace-result');
                        if (resultArea) {
                            resultArea.scrollTop = resultArea.scrollHeight;
                        }
                    }, 100);
                }
            }

            // Hide 3-dot effect on error
            hideAiProcessingIndicator();
        }
    }

    async function getCollectionNotes() {
        if (!currentCollectionId) return [];

        try {
            const notes = await dbManager.getAllNotes();
            return Object.values(notes).filter(note => note.collectionId === currentCollectionId);
        } catch (error) {
            console.error('Error getting collection notes:', error);
            return [];
        }
    }

    // Show typing indicator effect (Lottie animation)
    let aiProcessingAnimation = null;

    function showAiProcessingIndicator() {
        // Remove old indicator if exists
        hideAiProcessingIndicator();
        // Create indicator container
        const indicator = document.createElement('div');
        indicator.className = 'ai-processing';
        indicator.id = 'ai-processing-indicator';
        // Create div for Lottie animation
        const lottieDiv = document.createElement('div');
        lottieDiv.id = 'ai-typing-lottie';
        indicator.appendChild(lottieDiv);

        document.body.appendChild(indicator);
        // Use simple CSS animation instead of Lottie (Typing Indicator.json has loading issues)
        const container = document.getElementById('ai-typing-lottie');
        if (container) {
            container.innerHTML = `
                <div class="ai-typing-dots">
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                </div>
            `;
        }
    }

    // Hide typing indicator effect
    function hideAiProcessingIndicator() {
        const indicator = document.getElementById('ai-processing-indicator');
        if (indicator) {
            indicator.remove();
            // console.log('🛑 AI Typing Indicator stopped');
        }
    }


    // --- Page Navigation with Anime.js Animations ---

    // Helper function to animate page transitions with slide effect
    function animatePageSlide(fromPage, toPage, direction, callback) {
        if (!fromPage || !toPage || typeof anime === 'undefined') {
            // Fallback without animation
            if (fromPage) fromPage.style.display = 'none';
            if (toPage) toPage.style.display = 'block';
            if (callback) callback();
            return;
        }

        // direction: 'left' (forward) or 'right' (backward)
        const slideOut = direction === 'left' ? -100 : 100;
        const slideIn = direction === 'left' ? 100 : -100;

        // Prepare toPage for animation
        toPage.style.display = 'block';
        toPage.style.transform = `translateX(${slideIn}%)`;
        toPage.style.opacity = '1';

        // Animate both pages simultaneously for seamless transition
        let animationCompleted = 0;
        const onComplete = () => {
            animationCompleted++;
            if (animationCompleted === 2) {
                if (callback) callback();
            }
        };

        // Slide out old page
        anime({
            targets: fromPage,
            translateX: [0, slideOut + '%'],
            duration: 350,
            easing: 'easeInOutCubic',
            complete: () => {
                fromPage.style.display = 'none';
                fromPage.style.transform = '';
                fromPage.style.opacity = '';
                onComplete();
            }
        });

        // Slide in new page (starts at the same time)
        anime({
            targets: toPage,
            translateX: [slideIn + '%', 0],
            duration: 350,
            easing: 'easeInOutCubic',
            complete: () => {
                toPage.style.transform = '';
                toPage.style.opacity = '';
                onComplete();
            }
        });
    }

    // Helper function for collection page zoom animation
    function animateCollectionZoom(fromPage, toPage, sourceCard, callback) {
        if (!fromPage || !toPage || typeof anime === 'undefined') {
            // Fallback without animation
            if (fromPage) fromPage.style.display = 'none';
            if (toPage) toPage.style.display = 'block';
            if (callback) callback();
            return;
        }

        // Get source card position if available
        let startScale = 0.8;
        let startOpacity = 0;

        if (sourceCard) {
            const rect = sourceCard.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            toPage.style.transformOrigin = `${centerX}px ${centerY}px`;
            startScale = 0.3;
        }

        // Prepare toPage for animation
        toPage.style.display = 'block';
        toPage.style.transform = `scale(${startScale})`;
        toPage.style.opacity = startOpacity;

        // Fade out old page
        anime({
            targets: fromPage,
            opacity: [1, 0],
            duration: 200,
            easing: 'easeOutCubic',
            complete: () => {
                fromPage.style.display = 'none';
                fromPage.style.opacity = '';
            }
        });

        // Zoom in new page
        anime({
            targets: toPage,
            scale: [startScale, 1],
            opacity: [startOpacity, 1],
            duration: 500,
            delay: 100,
            easing: 'easeOutCubic',
            complete: () => {
                toPage.style.transform = '';
                toPage.style.opacity = '';
                toPage.style.transformOrigin = '';
                if (callback) callback();
            }
        });
    }

    // Helper function for collection page zoom out animation
    function animateCollectionZoomOut(fromPage, toPage, callback) {
        if (!fromPage || !toPage || typeof anime === 'undefined') {
            // Fallback without animation
            if (fromPage) fromPage.style.display = 'none';
            if (toPage) toPage.style.display = 'block';
            if (callback) callback();
            return;
        }

        // Prepare toPage for animation
        toPage.style.display = 'block';
        toPage.style.opacity = '0';

        // Zoom out old page
        anime({
            targets: fromPage,
            scale: [1, 0.8],
            opacity: [1, 0],
            duration: 400,
            easing: 'easeInCubic',
            complete: () => {
                fromPage.style.display = 'none';
                fromPage.style.transform = '';
                fromPage.style.opacity = '';
            }
        });

        // Fade in new page
        anime({
            targets: toPage,
            opacity: [0, 1],
            duration: 300,
            delay: 150,
            easing: 'easeOutCubic',
            complete: () => {
                toPage.style.opacity = '';
                if (callback) callback();
            }
        });
    }

    function openSettings() {
        exitMultiSelectMode();
        currentPage = 'settings';

        // No page transition animation to avoid lag
        if (mainPage) {
            mainPage.classList.remove('active');
            mainPage.style.display = 'none';
        }
        if (settingsPage) {
            settingsPage.style.display = '';
            settingsPage.classList.add('active');

            // Reset opacity and transform for all setting items (in case they were animated before)
            const settingItems = settingsPage.querySelectorAll('.setting-item, .settings-group-title');
            settingItems.forEach(item => {
                item.style.opacity = '1';
                item.style.transform = '';
            });
        }
        document.body.classList.add('settings-page');
        updateSelectionBar();

        // Force refresh AI usage data when opening settings (no cache)
        // This ensures cancelled subscriptions are reflected immediately
        loadAIUsageData(true);

        // Initialize performance optimizer
        if (window.settingsOptimizer) {
            window.settingsOptimizer.init();
        }
    }

    function closeSettings() {
        currentPage = 'main';

        // Cleanup optimizer before closing
        if (window.settingsOptimizer) {
            window.settingsOptimizer.cleanup();
        }

        // No page transition animation to avoid lag
        if (settingsPage) {
            settingsPage.classList.remove('active');
            settingsPage.style.display = 'none';
        }
        document.body.classList.remove('settings-page');
        if (mainPage) {
            mainPage.style.display = '';
            mainPage.classList.add('active');
        }
        updateSelectionBar();
        // Reload and animate notes when returning from settings
        loadAndDisplayNotesWithCollections(true);
    }

    function openTrash() {
        exitMultiSelectMode();
        currentPage = 'trash';

        // Cleanup optimizer when leaving settings
        if (window.settingsOptimizer) {
            window.settingsOptimizer.cleanup();
        }

        loadAndDisplayTrash();

        // Explicitly hide current pages first (prevents double display)
        if (settingsPage) {
            settingsPage.classList.remove('active');
            settingsPage.style.display = 'none';
        }
        if (mainPage) {
            mainPage.classList.remove('active');
            mainPage.style.display = 'none';
        }
        document.body.classList.remove('settings-page');

        // Show new page immediately (display is controlled by class)
        if (trashPage) {
            trashPage.style.display = ''; // Clear inline style
            trashPage.classList.add('active');
        }
        document.body.classList.add('trash-page');
        updateSelectionBar();

        // Re-run i18n replacement for any remaining placeholders
        if (typeof window.reinitializeI18n === 'function') {
            setTimeout(() => {
                window.reinitializeI18n();
            }, 100);
        }
    }

    function closeTrash() {
        currentPage = 'main';

        // Explicitly hide current page first (prevents double display)
        if (trashPage) {
            trashPage.classList.remove('active');
            trashPage.style.display = 'none';
        }
        document.body.classList.remove('trash-page');

        // Show new page immediately (display is controlled by class)
        if (settingsPage) {
            settingsPage.style.display = ''; // Clear inline style
            settingsPage.classList.add('active');

            // Reset opacity and transform for all setting items
            const settingItems = settingsPage.querySelectorAll('.setting-item, .settings-group-title');
            settingItems.forEach(item => {
                item.style.opacity = '1';
                item.style.transform = '';
            });
        }
        document.body.classList.add('settings-page');
        updateSelectionBar();
    }

    // --- Trash Functionality ---
    // Cache for trash data
    let trashCache = null;
    let trashCacheTime = 0;
    const TRASH_CACHE_DURATION = 5000; // 5 seconds

    async function loadAndDisplayTrash(forceRefresh = false) {
        try {
            // Show loading state
            if (trashContainer) {
                trashContainer.innerHTML = '<div class="loading-spinner-container"><div class="spinner"></div></div>';
            }

            // Check cache
            const now = Date.now();
            let trash;
            if (!forceRefresh && trashCache && (now - trashCacheTime < TRASH_CACHE_DURATION)) {
                trash = trashCache;
            } else {
                trash = await dbManager.getAllTrash();
                trashCache = trash;
                trashCacheTime = now;
            }

            if (trashContainer) trashContainer.innerHTML = '';
            const sortedTrash = Object.values(trash).sort((a, b) => (b.deletedAt || b.lastModified || 0) - (a.deletedAt || a.lastModified || 0));

            // Update trash stats
            updateTrashStats(sortedTrash.length);

            if (sortedTrash.length === 0) {
                if (trashContainer) {
                    trashContainer.innerHTML = `
                        <div class="empty-trash-state">
                            <svg class="empty-trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clip-rule="evenodd" />
                            </svg>
                            <h3>${chrome.i18n.getMessage('trash_empty') || 'Trash is empty'}</h3>
                            <p>Deleted notes and collections will appear here</p>
                        </div>
                    `;
                }
                return;
            }

            // Render items with fade-in animation
            sortedTrash.forEach((item, index) => {
                if (item.content) {
                    // This is a note
                    displayTrashNote(item, index);
                } else if (item.name) {
                    // This is a collection
                    displayTrashCollection(item, index);
                }
            });

            // Hide checkboxes if not in multi-select mode
            if (!multiSelectMode) {
                document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
                    checkbox.style.display = 'none';
                });
            } else {
                // Show checkboxes if in multi-select mode
                document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
                    checkbox.style.display = 'flex';
                });
            }

            // Animate trash items with stagger effect
            if (typeof anime !== 'undefined' && trashContainer) {
                const items = trashContainer.querySelectorAll('.note-tab');
                anime({
                    targets: items,
                    opacity: [0, 1],
                    translateY: [20, 0],
                    delay: anime.stagger(30),
                    duration: 400,
                    easing: 'easeOutCubic'
                });
            }
        } catch (error) {
            console.error('Error loading trash:', error);
            if (trashContainer) {
                trashContainer.innerHTML = `<p class="error-message">${chrome.i18n.getMessage('messages_failedToLoadTrashError')}</p>`;
            }
            showToast(chrome.i18n.getMessage('messages_failedToLoadTrash'));
        }
    }

    function displayTrashNote(note, index = 0) {
        const noteTab = document.createElement('div');
        noteTab.className = 'note-tab';
        noteTab.dataset.noteId = note.id;

        // Add selection checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'selection-checkbox';
        checkbox.style.display = multiSelectMode ? 'flex' : 'none';
        noteTab.appendChild(checkbox);

        const title = extractNoteTitle(note);
        const preview = extractNotePreview(note);

        // Format deletion time
        const deletedTime = note.deletedAt ? formatRelativeTime(note.deletedAt) : '';

        noteTab.innerHTML = `
                <div class="trash-note-content">
                    <div class="note-header">
                        <h3>${title}</h3>
                        ${deletedTime ? `<span class="deleted-time">${deletedTime}</span>` : ''}
                    </div>
                    <p>${preview}</p>
                </div>`;

        // Add right-click event listener
        noteTab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showTrashContextMenu(e.clientX, e.clientY, note.id, 'note');
        });

        // Fade-in animation
        noteTab.style.opacity = '0';
        noteTab.style.transform = 'translateY(10px)';
        trashContainer.appendChild(noteTab);

        requestAnimationFrame(() => {
            setTimeout(() => {
                noteTab.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                noteTab.style.opacity = '1';
                noteTab.style.transform = 'translateY(0)';
            }, index * 30); // Stagger animation
        });
    }

    // Helper function to update trash stats
    function updateTrashStats(count) {
        const trashCountElement = document.getElementById('trash-count');
        if (trashCountElement) {
            const itemText = count === 1 ? 'item' : 'items';
            trashCountElement.textContent = `${count} ${itemText}`;
        }
    }

    // Helper function to format relative time
    function formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        return `${Math.floor(days / 30)}mo ago`;
    }

    function displayTrashCollection(collection, index = 0) {
        const collectionTab = document.createElement('div');
        collectionTab.className = 'collection-card trash-collection';
        collectionTab.dataset.collectionId = collection.id;
        collectionTab.style.setProperty('--collection-color', collection.color);

        // Add selection checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'selection-checkbox';
        checkbox.style.display = multiSelectMode ? 'flex' : 'none';
        collectionTab.appendChild(checkbox);

        const themeIcons = {
            work: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 7L4 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 7V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 7V4C8 3.4 8.4 3 9 3H15C15.6 3 16 3.4 16 4V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            personal: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 21V19C20 17.9 19.1 17 18 17H6C4.9 17 4 17.9 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            ideas: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            study: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 3H6C6.6 3 7 3.4 7 4V20C7 20.6 6.6 21 6 21H2V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 3H18C18.6 3 19 3.4 19 4V20C19 20.6 18.6 21 18 21H7V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 8H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 16H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            travel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 16V8C21 7.4 20.6 7 20 7H4C3.4 7 3 7.4 3 8V16C3 16.6 3.4 17 4 17H20C20.6 17 21 16.6 21 16Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 7V5C7 4.4 7.4 4 8 4H16C16.6 4 17 4.4 17 5V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 17V19C7 19.6 7.4 20 8 20H16C16.6 20 17 19.6 17 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 7V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            hobby: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 15L20.09 18.26L23 19L20.09 19.74L19 23L17.91 19.74L15 19L17.91 18.26L19 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 15L6.09 18.26L9 19L6.09 19.74L5 23L3.91 19.74L1 19L3.91 18.26L5 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
        };

        const icon = themeIcons[collection.theme] || `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V5C2 3.9 2.9 3 4 3H9L11 5H20C21.1 5 22 5.9 22 7V19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

        // Format deletion time
        const deletedTime = collection.deletedAt ? formatRelativeTime(collection.deletedAt) : '';

        collectionTab.innerHTML = `
            <div class="collection-header">
                <div class="collection-icon">
                    ${icon}
                </div>
                <div class="collection-info">
                    <div class="collection-name">${collection.name}</div>
                    ${deletedTime ? `<div class="collection-deleted-time">${deletedTime}</div>` : ''}
                </div>
                <div class="collection-note-count">${collection.noteCount} ${chrome.i18n.getMessage('collections_notes') || 'notes'}</div>
            </div>`;

        // Add right-click event listener
        collectionTab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showTrashContextMenu(e.clientX, e.clientY, collection.id, 'collection');
        });

        // Fade-in animation
        collectionTab.style.opacity = '0';
        collectionTab.style.transform = 'translateY(10px)';
        trashContainer.appendChild(collectionTab);

        requestAnimationFrame(() => {
            setTimeout(() => {
                collectionTab.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                collectionTab.style.opacity = '1';
                collectionTab.style.transform = 'translateY(0)';
            }, index * 30); // Stagger animation
        });
    }

    async function deleteNotePermanently(noteId) {
        const message = chrome.i18n.getMessage('confirmations_deleteNotePermanently');
        const confirmed = await showCustomConfirm(message);
        if (confirmed) {
            // Animate before delete
            await animateTrashItemRemoval(noteId, 'note');
            chrome.runtime.sendMessage({ action: "deleteNotePermanently", noteId: noteId });
        }
    }

    async function deleteCollectionPermanently(collectionId) {
        const message = chrome.i18n.getMessage('confirmations_deleteCollectionPermanently') || 'Are you sure you want to permanently delete this collection?';
        const confirmed = await showCustomConfirm(message);
        if (confirmed) {
            // Animate before delete
            await animateTrashItemRemoval(collectionId, 'collection');
            chrome.runtime.sendMessage({ action: "deleteCollectionPermanently", collectionId: collectionId });
        }
    }

    async function restoreAllNotes() {
        const trash = await dbManager.getAllTrash();
        if (Object.keys(trash).length === 0) {
            showToast(chrome.i18n.getMessage('trash_empty'));
            return;
        }
        chrome.runtime.sendMessage({ action: "restoreAllTrash" }, () => {
            showToast(chrome.i18n.getMessage('messages_allNotesRestored'));
            closeTrash();
        });
    }

    async function clearAllTrashNotes() {
        const trash = await dbManager.getAllTrash();
        if (Object.keys(trash).length === 0) {
            showToast(chrome.i18n.getMessage('trash_empty'));
            return;
        }
        const message = chrome.i18n.getMessage('confirmations_deleteAllTrash');
        const confirmed = await showCustomConfirm(message);
        if (confirmed) {
            chrome.runtime.sendMessage({ action: "clearAllTrash" }, () => {
                showToast(chrome.i18n.getMessage('messages_trashEmptied'));
            });
        }
    }

    // --- Authentication and Sync ---
    async function updateAuthStatus() {
        try {
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(token);
                });
            });
            // Signed in
            if (googleSyncBtn) googleSyncBtn.style.display = 'none';
            const syncControls = document.getElementById('sync-controls');
            if (syncControls) syncControls.style.display = 'flex';
            await fetchUserInfo(token);

            // Update AI status when user is signed in
            // Check premium status first before setting AI unlocked
            await loadAIUsageData();

        } catch (error) {
            // Not signed in
            if (googleSyncBtn) googleSyncBtn.style.display = 'block';
            const syncControls = document.getElementById('sync-controls');
            if (syncControls) syncControls.style.display = 'none';
            if (userInfoContainer) userInfoContainer.style.display = 'none';

            // Reset AI status when not signed in
            await loadAIUsageData();
        }
    }

    async function fetchUserInfo(token) {
        try {
            // Use OAuth2 API to get all info - avoid second popup
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const userInfo = await userInfoResponse.json();
            // Get email and avatar from OAuth2 API
            userEmail.textContent = userInfo?.email || chrome.i18n.getMessage('messages_couldNotLoadEmail');

            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar) {
                if (userInfo?.picture) {
                    userAvatar.src = userInfo.picture;
                    userAvatar.style.display = 'block';
                } else {
                    userAvatar.style.display = 'block'; // Still show avatar even without image
                }

                // Always check premium status and apply VIP styling
                await applyVIPStyling(userAvatar);
            }
            if (userInfoContainer) userInfoContainer.style.display = 'flex';

        } catch (error) {
            console.error('Error fetching user info:', error);
            if (userInfoContainer) userInfoContainer.style.display = 'flex';
            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar) userAvatar.style.display = 'none';
        }
    }

    async function handleGoogleAuth() {
        // Show loading
        showLoadingOverlay(chrome.i18n.getMessage('messages_connectingToGoogle'));

        try {
            // Sign in with Google
            const userEmail = await signInWithGoogle();

            if (!userEmail) {
                hideLoadingOverlay();
                handleAuthError({ message: 'Failed to sign in' });
                return;
            }

            // Step 1: Get token for sync
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(token);
                });
            });

            // Step 2: Fetch user info
            updateLoadingMessage(chrome.i18n.getMessage('messages_loadingAccountInfo'));
            await fetchUserInfo(token);

            // Update UI
            if (googleSyncBtn) googleSyncBtn.style.display = 'none';
            const syncControls = document.getElementById('sync-controls');
            if (syncControls) syncControls.style.display = 'flex';

            // Step 3: Sync data
            updateLoadingMessage(chrome.i18n.getMessage('messages_syncingData') || 'Syncing data...');
            await chrome.runtime.sendMessage({ action: "syncNow" });

            // Step 4: Update AI status
            await forceRefreshAIStatus();
            await checkAIUnlockStatus();

            // Complete
            hideLoadingOverlay();
            showToast(chrome.i18n.getMessage('messages_signedInSuccessfully') || '✓ Signed in successfully!');
        } catch (error) {
            hideLoadingOverlay();
            console.error('Error during auth:', error);
            handleAuthError(error);
        }
    }

    function handleManualSync() {
        const syncIcon = document.querySelector('.sync-icon');
        if (syncIcon) {
            syncIcon.classList.add('spinning');
        }

        // Show syncing toast with spinning icon
        showSyncToastWithIcon(chrome.i18n.getMessage('messages_syncingWithDrive') || 'Syncing with Drive...', true, true);

        chrome.runtime.sendMessage({ action: "syncNow" }, async () => {
            await updateAuthStatus();

            // Remove spinning class after sync completes
            if (syncIcon) {
                setTimeout(() => {
                    syncIcon.classList.remove('spinning');
                }, 500);
            }
        });
    }

    async function handleSignOut() {
        chrome.identity.getAuthToken({ interactive: false }, async (token) => {
            if (token) {
                try {
                    const url = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
                    await window.fetch(url);
                    chrome.identity.removeCachedAuthToken({ token }, async () => {
                        showToast(chrome.i18n.getMessage('messages_signedOut'));

                        // Update UI immediately after sign out
                        if (googleSyncBtn) googleSyncBtn.style.display = 'block';
                        const syncControls = document.getElementById('sync-controls');
                        if (syncControls) syncControls.style.display = 'none';
                        if (userInfoContainer) userInfoContainer.style.display = 'none';

                        // Reset AI status when user signs out
                        await resetAIStatusOnLogout();

                        // Force refresh AI status display after logout
                        await forceRefreshAIStatus();

                    });
                } catch (error) {
                    console.error('Error during sign out:', error);
                    // Still update UI even if revoke fails
                    if (googleSyncBtn) googleSyncBtn.style.display = 'block';
                    const syncControls = document.getElementById('sync-controls');
                    if (syncControls) syncControls.style.display = 'none';
                    if (userInfoContainer) userInfoContainer.style.display = 'none';
                }
            } else {
                // No token, update UI immediately
                if (googleSyncBtn) googleSyncBtn.style.display = 'block';
                const syncControls = document.getElementById('sync-controls');
                if (syncControls) syncControls.style.display = 'none';
                if (userInfoContainer) userInfoContainer.style.display = 'none';

                // Reset AI status when no token found
                await resetAIStatusOnLogout();

                // Force refresh AI status display after logout
                await forceRefreshAIStatus();
            }
        });
    }

    // --- Theme and Language Management ---
    async function toggleTheme() {
        let currentTheme = 'dark';
        if (document.documentElement && document.body) {
            document.documentElement.classList.toggle('light-theme');
            document.body.classList.toggle('light-theme');
            currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        }
        await dbManager.saveSetting('theme', currentTheme);

        // Cache theme in localStorage for instant loading
        try {
            localStorage.setItem('quicknotes_theme_cache', currentTheme);
        } catch (e) {
            // Ignore localStorage errors
        }

        // Sync AI workspace theme if it's open
        syncAiWorkspaceTheme();

        // Notify all open windows (notes, ai-chat, search) to update their theme
        try {
            // Get all extension views (popups, tabs, etc.)
            const views = chrome.extension.getViews();
            views.forEach(view => {
                // Skip current window and only update windows with the theme function
                if (view !== window && typeof view.applyThemeFromParent === 'function') {
                    view.applyThemeFromParent(currentTheme);
                }
            });
        } catch (e) {
            console.error('Error syncing theme to other windows:', e);
        }

        // Also broadcast theme change via chrome.runtime for any windows that might have missed it
        try {
            chrome.runtime.sendMessage({
                action: 'themeChanged',
                theme: currentTheme
            }).catch(() => {
                // Ignore errors if no listeners
            });
        } catch (e) {
            // Ignore errors
        }
    }

    // Detect system theme preference
    function detectSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    async function loadSavedTheme() {
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

        // Cache theme in localStorage for instant loading next time
        try {
            localStorage.setItem('quicknotes_theme_cache', themeToApply);
        } catch (e) {
            // Ignore localStorage errors
        }

        // Apply theme to both html and body for consistency
        if (document.documentElement && document.body) {
            if (themeToApply === 'light') {
                document.documentElement.classList.add('light-theme');
                document.body.classList.add('light-theme');
            } else {
                document.documentElement.classList.remove('light-theme');
                document.body.classList.remove('light-theme');
            }
        }
    }

    async function exportData() {
        try {
            const data = await dbManager.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quick-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(chrome.i18n.getMessage('messages_exportedSuccessfully'));
        } catch (error) {
            showToast(chrome.i18n.getMessage('toast_failed') || 'Failed');
        }
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (typeof data === 'object' && data !== null && 'notes' in data) {
                    const message = chrome.i18n.getMessage('confirmations_overwriteData');
                    const confirmed = await showCustomConfirm(message);
                    if (confirmed) {
                        try {
                            console.log('[Import] Starting import process...');
                            
                            // Clear existing data
                            console.log('[Import] Clearing existing data...');
                            await dbManager.clear();
                            
                            // Import new data
                            console.log('[Import] Importing new data...');
                            await dbManager.importAll(data);
                            
                            console.log('[Import] Import complete, reloading...');
                            
                            // Reload immediately to ensure clean state
                            window.location.reload();
                            
                        } catch (importError) {
                            console.error('[Import] Import failed:', importError);
                            showToast('Import failed: ' + importError.message);
                            // Reload anyway to recover from error state
                            setTimeout(() => window.location.reload(), 2000);
                        }
                    }
                } else {
                    showToast(chrome.i18n.getMessage('messages_invalidFileFormat'));
                }
            } catch (error) {
                console.error('[Import] Error reading file:', error);
                showToast(chrome.i18n.getMessage('messages_errorReadingFile'));
            }
        };
        reader.readAsText(file);
    }

    // --- Animation Helpers ---

    // Apply button click animation
    function applyButtonAnimation(button) {
        if (!button || typeof anime === 'undefined') return;

        anime({
            targets: button,
            scale: [1, 0.95, 1],
            duration: 200,
            easing: 'easeOutQuad'
        });
    }

    // Apply shake animation for errors
    function applyShakeAnimation(element) {
        if (!element || typeof anime === 'undefined') return;

        anime({
            targets: element,
            translateX: [
                { value: -10, duration: 100 },
                { value: 10, duration: 100 },
                { value: -10, duration: 100 },
                { value: 10, duration: 100 },
                { value: 0, duration: 100 }
            ],
            easing: 'easeInOutSine'
        });
    }

    // Apply pulse animation for highlights
    function applyPulseAnimation(element) {
        if (!element || typeof anime === 'undefined') return;

        anime({
            targets: element,
            scale: [1, 1.05, 1],
            duration: 600,
            easing: 'easeInOutQuad'
        });
    }

    // Setup button animations for all buttons
    function setupButtonAnimations() {
        const buttons = document.querySelectorAll('button, .btn, .demo-btn');
        buttons.forEach(button => {
            button.addEventListener('click', function (e) {
                // Don't animate if button is disabled
                if (this.disabled) return;
                applyButtonAnimation(this);
            }, { passive: true });
        });
    }

    // --- UI Helpers ---
    // Toast functions are defined in toast-system.js
    // showToast, showErrorToast, showSuccessToast, showWarningToast, showInfoToast

    // Sync toast - Using new toast system
    function showSyncToast(message, success = true) {
        if (success) {
            showSuccessToast(message);
        } else {
            showErrorToast(message);
        }
    }

    function showSyncToastWithIcon(message, success = true, isLoading = false) {
        // Wait for loading screen to be hidden before showing toast
        const showToast = () => {
            const syncToast = document.getElementById('sync-toast');
            const syncMessage = document.getElementById('sync-message');
            const syncIcon = syncToast?.querySelector('.sync-icon');

            if (!syncToast || !syncMessage) return;

            // Set message
            syncMessage.textContent = message;

            // Handle loading state with spinning icon
            if (isLoading) {
                syncToast.classList.remove('error');
                if (syncIcon) {
                    syncIcon.style.display = ''; // Show icon
                    syncIcon.classList.add('spinning');
                }
                syncToast.classList.add('show');
                syncToast.classList.remove('hide');
            } else {
                // Hide icon for result toast
                if (syncIcon) {
                    syncIcon.style.display = 'none'; // Hide icon
                    syncIcon.classList.remove('spinning');
                }

                // Show result
                if (success) {
                    syncToast.classList.remove('error');
                } else {
                    syncToast.classList.add('error');
                }

                syncToast.classList.add('show');
                syncToast.classList.remove('hide');

                // Auto hide after 3 seconds
                setTimeout(() => {
                    syncToast.classList.remove('show');
                    syncToast.classList.add('hide');
                }, 3000);
            }
        };

        // Wait for loading screen to hide before showing toast (both loading and result)
        if (!isLoadingScreenHidden) {
            const checkInterval = setInterval(() => {
                if (isLoadingScreenHidden) {
                    clearInterval(checkInterval);
                    showToast();
                }
            }, 100);

            // Timeout after 5 seconds to prevent infinite waiting
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!isLoadingScreenHidden) {
                    showToast();
                }
            }, 5000);
        } else {
            showToast();
        }
    }

    function hideSyncToast() {
        const syncToast = document.getElementById('sync-toast');
        const syncIcon = syncToast?.querySelector('.sync-icon');

        if (syncToast) {
            syncToast.classList.remove('show');
            syncToast.classList.add('hide');
        }

        if (syncIcon) {
            syncIcon.classList.remove('spinning');
            syncIcon.style.display = ''; // Reset icon display
        }
    }

    function showCustomConfirm(message) {
        return new Promise((resolve) => {
            if (confirmMessage) confirmMessage.textContent = message;
            if (confirmOverlay) confirmOverlay.classList.add('visible');
            const cleanup = (result) => {
                if (confirmOverlay) confirmOverlay.classList.remove('visible');
                if (confirmYesBtn) confirmYesBtn.removeEventListener('click', onYes);
                if (confirmNoBtn) confirmNoBtn.removeEventListener('click', onNo);
                resolve(result);
            };
            const onYes = () => cleanup(true);
            const onNo = () => cleanup(false);
            if (confirmYesBtn) confirmYesBtn.addEventListener('click', onYes, { once: true });
            if (confirmNoBtn) confirmNoBtn.addEventListener('click', onNo, { once: true });
        });
    }

    // Loading overlay functions
    function showLoadingOverlay(message) {
        if (loadingScreen) {
            const loadingMessage = loadingScreen.querySelector('.app-title');
            if (loadingMessage) {
                loadingMessage.textContent = message;
            }
            loadingScreen.classList.remove('hidden');
            loadingScreen.style.display = 'flex';
        }
    }

    function hideLoadingOverlay() {
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
    }

    function updateLoadingMessage(message) {
        if (loadingScreen) {
            const loadingMessage = loadingScreen.querySelector('.app-title');
            if (loadingMessage) {
                loadingMessage.textContent = message;
            }
        }
    }

    // Auth error handling
    function handleAuthError(error) {
        let message = chrome.i18n.getMessage('messages_signInFailed') || 'Sign in failed';
        let details = '';

        if (error?.message?.includes('User did not approve') || error?.message?.includes('canceled')) {
            message = chrome.i18n.getMessage('messages_permissionDenied') || 'Permission denied';
            details = chrome.i18n.getMessage('messages_permissionDeniedDetails') || 'To use sync feature, please grant permission to the app.';
        } else if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
            message = chrome.i18n.getMessage('messages_networkError') || 'No network connection';
            details = chrome.i18n.getMessage('messages_networkErrorDetails') || 'Please check your internet connection and try again.';
        } else if (error?.message?.includes('OAuth2') || error?.message?.includes('auth')) {
            message = chrome.i18n.getMessage('messages_authError') || 'Authentication error';
            details = chrome.i18n.getMessage('messages_authErrorDetails') || 'Please try signing out and signing in again.';
        }

        console.error('Auth error:', error);

        // Show error toast with details
        if (details) {
            showToast(`${message}\n${details}`, 5000);
        } else {
            showToast(message, 3000);
        }

        // Update auth status
        updateAuthStatus();
    }


    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!noteContextMenu.contains(e.target)) {
            hideNoteContextMenu();
        }
        if (!collectionContextMenu.contains(e.target)) {
            hideCollectionContextMenu();
        }
        if (!individualCollectionContextMenu.contains(e.target)) {
            hideIndividualCollectionContextMenu();
        }
        if (!trashContextMenu.contains(e.target)) {
            hideTrashContextMenu();
        }
    });

    // Disable Chrome context menu globally, except for specific areas
    document.addEventListener('contextmenu', (e) => {
        // Check if the click is on an element that should show our custom context menu
        const isNoteElement = e.target.closest('.note-tab');
        const isCollectionElement = e.target.closest('.collection-card');
        const isTrashElement = e.target.closest('.note-tab, .collection-card') && trashPage.classList.contains('active');

        // Check for empty space clicks
        const isEmptySpace = e.target === notesListContainer ||
            e.target === mainPage ||
            e.target.classList.contains('collection-page') ||
            e.target.closest('.collection-page');

        // Only allow context menu for specific elements
        if (isNoteElement || isEmptySpace || isCollectionElement || isTrashElement) {
            // For empty space, handle it here
            if (isEmptySpace) {
                e.preventDefault();
                showCollectionContextMenu(e.clientX, e.clientY);
            }
            // For other elements, let their individual event listeners handle it
            // Don't call preventDefault here to avoid interfering with individual handlers
        } else {
            // Prevent Chrome context menu for all other areas
            e.preventDefault();
        }
    });

    // Context menu event listeners
    if (noteContextMenu) {
        noteContextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            const noteId = noteContextMenu.dataset.noteId;

            if (action === 'select-multiple') {
                enterMultiSelectMode();
                if (noteId) {
                    toggleItemSelection(noteId, 'note');
                }
            } else if (action === 'delete' && noteId) {
                deleteNoteWithConfirmation(noteId);
            } else if (action === 'pin' && noteId) {
                togglePinNote(noteId);
            } else if (action === 'move-to-collection' && noteId) {
                cutNote(noteId);
            } else if (action === 'remove-from-collection' && noteId) {
                removeNoteFromCollection(noteId);
            }

            hideNoteContextMenu();
        });
    }

    if (trashContextMenu) {
        trashContextMenu.addEventListener('click', async (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            const itemId = trashContextMenu.dataset.itemId;
            const itemType = trashContextMenu.dataset.itemType;

            if (action === 'restore' && itemId) {
                // Animate item before restore
                await animateTrashItemRemoval(itemId, itemType);

                if (itemType === 'note') {
                    chrome.runtime.sendMessage({ action: "restoreNote", noteId: itemId });
                } else if (itemType === 'collection') {
                    chrome.runtime.sendMessage({ action: "restoreCollection", collectionId: itemId });
                }
            } else if (action === 'delete-forever' && itemId) {
                if (itemType === 'note') {
                    deleteNotePermanently(itemId);
                } else if (itemType === 'collection') {
                    deleteCollectionPermanently(itemId);
                }
            }

            hideTrashContextMenu();
        });
    }

    // Helper function to animate item removal from trash
    async function animateTrashItemRemoval(itemId, itemType) {
        const selector = itemType === 'note'
            ? `[data-note-id="${itemId}"]`
            : `[data-collection-id="${itemId}"]`;
        const element = trashContainer?.querySelector(selector);

        if (!element) return;

        if (typeof anime !== 'undefined') {
            await anime({
                targets: element,
                opacity: [1, 0],
                translateX: [0, 50],
                scale: [1, 0.95],
                duration: 300,
                easing: 'easeInCubic'
            }).finished;
        } else {
            // Fallback CSS animation
            element.style.transition = 'all 0.3s ease';
            element.style.opacity = '0';
            element.style.transform = 'translateX(50px) scale(0.95)';
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    if (collectionContextMenu) {
        collectionContextMenu.addEventListener('click', async (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;

            if (action === 'add-note-here' && cutNoteId) {
                // Get current collection ID from the page
                const collectionId = currentPage === 'collection' ? currentCollectionId : null;
                if (collectionId) {
                    await pasteNoteToCollection(collectionId);
                }
            } else if (action === 'create-collection') {
                openCollectionDialog();
            }

            hideCollectionContextMenu();
        });
    }

    // Add specific event listener for collection page context menu
    document.addEventListener('contextmenu', (e) => {
        // Check if we're on collection page and clicking on empty space
        if (currentPage === 'collection') {
            const isCollectionPageElement = e.target.closest('#collection-page') ||
                e.target.classList.contains('collection-page') ||
                e.target.id === 'collection-page';

            if (isCollectionPageElement && !e.target.closest('.note-tab') && !e.target.closest('.collection-card')) {
                e.preventDefault();
                showCollectionContextMenu(e.clientX, e.clientY);
            }
        }
    });



    // Loading screen handling
    function hideLoadingScreen() {
        try {
            // Hide loading screen immediately after initialization
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
            }
            if (mainPage) {
                mainPage.classList.add('active');
            }

            // Mark loading screen as hidden
            isLoadingScreenHidden = true;

            // Show welcome animation for first-time users
            showWelcomeAnimationIfFirstTime();

        } catch (error) {
            console.error('Error hiding loading screen:', error);
        }
    }

    // Show welcome animation for first-time users
    async function showWelcomeAnimationIfFirstTime() {
        try {
            const hasSeenWelcome = await dbManager.getSetting('hasSeenWelcome');

            if (hasSeenWelcome) {
                return;
            }

            const welcomeOverlay = document.getElementById('welcome-overlay');
            const welcomeAnimationDiv = document.getElementById('welcome-animation');

            if (!welcomeOverlay || !welcomeAnimationDiv) {
                console.warn('Welcome overlay elements not found');
                return;
            }

            // Show overlay with fade in
            welcomeOverlay.style.display = 'flex';
            setTimeout(() => {
                welcomeOverlay.classList.add('show');
            }, 100);

            // Load and play welcome animation
            if (typeof lottie !== 'undefined') {
                const welcomeAnimation = lottie.loadAnimation({
                    container: welcomeAnimationDiv,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    path: '../libs/Welcome.json'
                });

                // Hide overlay when user clicks anywhere
                const hideWelcome = async () => {
                    welcomeOverlay.classList.remove('show');
                    setTimeout(() => {
                        welcomeOverlay.style.display = 'none';
                        welcomeAnimation.destroy();
                    }, 500);

                    // Mark as seen
                    await dbManager.saveSetting('hasSeenWelcome', true);

                    // Remove event listener
                    welcomeOverlay.removeEventListener('click', hideWelcome);
                };

                welcomeOverlay.addEventListener('click', hideWelcome);
            } else {
                console.error('Lottie library not loaded');
            }

        } catch (error) {
            console.error('Error showing welcome animation:', error);
        }
    }


    // Initialize default data for first-time users
    async function initializeDefaultData() {
        try {
            const hasInitialized = await dbManager.getSetting('hasInitialized');
            const notes = await dbManager.getAllNotes();

            // Update existing welcome notes to have correct size and background
            if (notes) {
                for (const noteId in notes) {
                    if (noteId.includes('welcome-note')) {
                        let needsUpdate = false;

                        // Update size if needed
                        if (!notes[noteId].size || notes[noteId].size.width !== 540 || notes[noteId].size.height !== 720) {
                            // console.log('🔧 Updating welcome note size from', notes[noteId].size, 'to 540x720');
                            notes[noteId].size = { width: 540, height: 720 };
                            needsUpdate = true;
                        }

                        // Update background if needed
                        if (!notes[noteId].background || notes[noteId].background === 'none') {
                            // console.log('🔧 Setting welcome note background to 1');
                            notes[noteId].background = '1';
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await dbManager.saveNote(notes[noteId]);
                            // console.log('✅ Updated welcome note');
                        }
                    }
                }
            }

            if (hasInitialized) {
                return;
            }

            // Check if we already have notes (from Drive sync)
            const existingNotes = await dbManager.getAllNotes();
            const existingCollections = await dbManager.getAllCollections();

            // If we have non-default notes, don't create welcome note
            const hasRealNotes = Object.keys(existingNotes).some(id => !existingNotes[id].isDefault);
            const hasRealCollections = Object.keys(existingCollections).some(id => !existingCollections[id].isDefault);

            if (hasRealNotes || hasRealCollections) {
                await dbManager.saveSetting('hasInitialized', true);
                return;
            }

            // Note: Default data can be deleted by users and will not be recreated
            // The isDefault flag helps identify these items for potential cleanup

            // Create welcome note with abstract background and random color (only for this note)
            // This background styling is embedded in the content and won't affect new notes

            // Use the same colors as note con
            const noteColors = ['#8b9dc3', '#a8c8a8', '#d4a5a5', '#b8a9c9', '#a5b8d4', '#c9a8a8'];
            const randomColor = noteColors[Math.floor(Math.random() * noteColors.length)];

            const welcomeNoteId = 'welcome-note-' + Date.now();
            const welcomeNote = {
                id: welcomeNoteId,
                content: `<h1>__MSG_welcome_note_title__</h1>
<p>__MSG_welcome_note_intro__</p>
<h2>__MSG_welcome_note_ai_title__</h2>
<p>__MSG_welcome_note_ai_content__</p>
<h2>__MSG_welcome_note_collections_title__</h2>
<p>__MSG_welcome_note_collections_content__</p>
<h2>__MSG_welcome_note_tips_title__</h2>
<p>__MSG_welcome_note_tips_content__</p>
<p>__MSG_welcome_note_footer__</p>`,
                lastModified: Date.now(),
                createdAt: Date.now(),
                color: randomColor,
                background: '1', // Set background 1 as default for welcome note
                pinned: true,
                isDefault: true,
                size: {
                    width: 500,
                    height: 600
                }
            };

            // Create default collection with matching random color
            const defaultCollectionId = 'default-collection-' + Date.now();
            const defaultCollection = {
                id: defaultCollectionId,
                name: '__MSG_welcome_collection_name__',
                description: '__MSG_welcome_collection_description__',
                color: randomColor,
                theme: 'ideas',
                createdAt: Date.now(),
                noteCount: 1,
                pinned: true,
                isDefault: true
            };

            // Add welcome note to default collection
            welcomeNote.collectionId = defaultCollectionId;

            // Process translation keys for welcome note content
            welcomeNote.content = processTranslationKeys(welcomeNote.content);
            defaultCollection.name = processTranslationKeys(defaultCollection.name);
            defaultCollection.description = processTranslationKeys(defaultCollection.description);

            // Save welcome note and collection
            await dbManager.saveNote(welcomeNote);
            await dbManager.saveCollection(defaultCollection);
            await dbManager.saveSetting('hasInitialized', true);


        } catch (error) {
            console.error('❌ [Main App] Error creating default data:', error);
        }
    }

    // Initialize UI with optimized loading
    async function initializeUI() {
        try {

            // Set a longer timeout only as emergency fallback (15 seconds)
            const emergencyTimeoutId = setTimeout(() => {
                hideLoadingScreen();
            }, 15000); // 15 second emergency timeout only

            // Check if this is first time user
            const hasInitialized = await dbManager.getSetting('hasInitialized');

            // For first-time users, start sync FIRST before initializing default data
            // This ensures we pull data from Drive before creating welcome note
            let syncPromise = null;
            if (!hasInitialized) {
                syncPromise = handleBackgroundSync().catch(error => {
                    console.error('Error in background sync:', error);
                    return null;
                });
            } else {
                // For existing users, sync in background (non-blocking)
                handleBackgroundSync().catch(error => {
                    console.error('Error in background sync:', error);
                });
            }

            // Start essential initialization tasks
            const essentialTasks = [
                // For first-time users, wait for sync before initializing
                (syncPromise ? syncPromise.then(() => initializeDefaultData()) : initializeDefaultData()).catch(error => {
                    console.error('Error in initializeDefaultData:', error);
                    return null;
                }),
                loadSavedTheme().catch(error => {
                    console.error('Error in loadSavedTheme:', error);
                    return null;
                })
            ];

            // Start non-essential tasks in background (slower loading)
            const backgroundTasks = [
                updateAuthStatus().catch(error => {
                    console.error('Error in updateAuthStatus:', error);
                    return null;
                }),
                loadAIUsageData().catch(error => {
                    console.error('Error in loadAIUsageData:', error);
                    return null;
                })
            ];

            // Start minimum loading time timer
            const startTime = Date.now();
            const minLoadingTime = 500; // 500ms minimum loading time

            // Wait for essential tasks to complete first (fast UI)
            await Promise.allSettled(essentialTasks);

            // Load and display notes after sync and initialization with animation
            await loadAndDisplayNotes(true).catch(error => {
                console.error('Error in loadAndDisplayNotes:', error);
                return null;
            });

            // Calculate remaining time to ensure minimum 500ms loading
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minLoadingTime - elapsedTime);


            // Hide loading screen after minimum delay (500ms for better UX)
            setTimeout(() => {
                hideLoadingScreen();

                // Setup button animations after UI is loaded
                setupButtonAnimations();
            }, remainingTime);

            // Clear the emergency timeout since we completed successfully
            clearTimeout(emergencyTimeoutId);

            // Start background tasks (non-blocking)
            Promise.allSettled(backgroundTasks).catch(error => {
                console.error('Error in background tasks:', error);
            });

        } catch (error) {
            console.error('Critical error during UI initialization:', error);
            // Still try to hide loading screen even if there's an error
            hideLoadingScreen();

            // Try to load basic functionality as fallback
            try {
                await loadAndDisplayNotes().catch(e => console.error('Fallback loadAndDisplayNotes failed:', e));
            } catch (fallbackError) {
                console.error('Fallback initialization also failed:', fallbackError);
            }
        }
    }

    // Handle background sync without blocking UI
    async function handleBackgroundSync() {
        try {
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(token);
                });
            });

            if (!token) {
                return;
            }

            // Always show sync toast when syncing
            showSyncToastWithIcon(chrome.i18n.getMessage('messages_syncingWithDrive') || 'Syncing with Drive...', true, true);

            // User is authenticated, proceed with sync in background
            chrome.runtime.sendMessage({ action: "syncNow" }).catch(() => {
                // Service worker may be inactive
            });
        } catch (error) {
            // User is not authenticated, skip sync silently
        }
    }


    // Hide sync status
    function hideSyncStatus() {
        const syncStatus = document.querySelector('.sync-status');
        if (syncStatus) {
            syncStatus.classList.remove('show');
            setTimeout(() => {
                if (syncStatus.parentNode) {
                    syncStatus.remove();
                }
            }, 300);
        }
    }

    // --- Collection Management Functions ---
    let currentCollectionId = null;
    let selectedTheme = 'work';
    let selectedColor = '#ff6b6b';

    function showCollectionContextMenu(x, y) {
        // Hide all other context menus first
        hideAllContextMenusExcept('collection');

        // Show/hide "Add Note Here" option based on whether a note is cut
        const addNoteHereItem = collectionContextMenu.querySelector('[data-action="add-note-here"]');
        const createCollectionItem = collectionContextMenu.querySelector('[data-action="create-collection"]');

        if (addNoteHereItem) {
            addNoteHereItem.style.display = cutNoteId ? 'flex' : 'none';
        }

        // Hide "Create Collection" option when on collection page
        if (createCollectionItem) {
            createCollectionItem.style.display = currentPage === 'collection' ? 'none' : 'flex';
        }

        adjustContextMenuPosition(collectionContextMenu, x, y);

        setTimeout(() => {
            collectionContextMenu.classList.add('show');
        }, 10);
    }

    function hideCollectionContextMenu() {
        collectionContextMenu.classList.remove('show');
        setTimeout(() => {
            collectionContextMenu.style.display = 'none';
        }, 200);
    }

    async function showIndividualCollectionContextMenu(x, y, collectionId) {
        // Hide all other context menus first
        hideAllContextMenusExcept('individualCollection');

        individualCollectionContextMenu.dataset.collectionId = collectionId;

        // Show/hide pin/unpin options based on current status
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getCollections'
            });

            if (response.success) {
                const collection = response.collections.find(c => c.id === collectionId);
                const pinItem = individualCollectionContextMenu.querySelector('[data-action="pin-collection"]');
                const unpinItem = individualCollectionContextMenu.querySelector('[data-action="unpin-collection"]');

                if (pinItem && unpinItem && collection) {
                    if (collection.pinned) {
                        pinItem.style.display = 'none';
                        unpinItem.style.display = 'flex';
                    } else {
                        pinItem.style.display = 'flex';
                        unpinItem.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Error updating collection context menu:', error);
        }

        adjustContextMenuPosition(individualCollectionContextMenu, x, y);

        setTimeout(() => {
            individualCollectionContextMenu.classList.add('show');
        }, 10);
    }

    function hideIndividualCollectionContextMenu() {
        individualCollectionContextMenu.classList.remove('show');
        setTimeout(() => {
            individualCollectionContextMenu.style.display = 'none';
        }, 200);
    }

    async function showTrashContextMenu(x, y, itemId, itemType) {
        // Hide all other context menus first
        hideAllContextMenusExcept('trash');

        trashContextMenu.dataset.itemId = itemId;
        trashContextMenu.dataset.itemType = itemType; // 'note' or 'collection'

        adjustContextMenuPosition(trashContextMenu, x, y);

        setTimeout(() => {
            trashContextMenu.classList.add('show');
        }, 10);
    }

    function hideTrashContextMenu() {
        trashContextMenu.classList.remove('show');
        setTimeout(() => {
            trashContextMenu.style.display = 'none';
        }, 200);
    }

    function openCollectionDialog() {
        collectionDialogOverlay.classList.add('visible');
        if (collectionNameInput) collectionNameInput.value = '';
        selectedTheme = 'work';
        selectedColor = '#ff6b6b';
        updateThemeSelection();

        // Animate dialog appearance
        if (typeof anime !== 'undefined') {
            const dialog = collectionDialogOverlay.querySelector('.collection-dialog');
            if (dialog) {
                anime({
                    targets: dialog,
                    scale: [0.8, 1],
                    opacity: [0, 1],
                    duration: 400,
                    easing: 'easeOutCubic',
                    complete: () => {
                        collectionNameInput.focus();
                    }
                });
            }
        } else {
            collectionNameInput.focus();
        }
    }

    function closeCollectionDialog() {
        if (typeof anime !== 'undefined') {
            const dialog = collectionDialogOverlay.querySelector('.collection-dialog');
            if (dialog) {
                anime({
                    targets: dialog,
                    scale: [1, 0.8],
                    opacity: [1, 0],
                    duration: 300,
                    easing: 'easeInCubic',
                    complete: () => {
                        collectionDialogOverlay.classList.remove('visible');
                    }
                });
            } else {
                collectionDialogOverlay.classList.remove('visible');
            }
        } else {
            collectionDialogOverlay.classList.remove('visible');
        }
    }

    function openCollectionEditDialog() {
        collectionEditDialogOverlay.classList.add('visible');
        if (collectionEditNameInput) collectionEditNameInput.value = '';
        selectedTheme = 'work';
        selectedColor = '#ff6b6b';
        updateThemeSelection();

        // Animate dialog appearance
        if (typeof anime !== 'undefined') {
            const dialog = collectionEditDialogOverlay.querySelector('.collection-dialog');
            if (dialog) {
                anime({
                    targets: dialog,
                    scale: [0.8, 1],
                    opacity: [0, 1],
                    duration: 400,
                    easing: 'easeOutCubic',
                    complete: () => {
                        collectionEditNameInput.focus();
                    }
                });
            }
        } else {
            collectionEditNameInput.focus();
        }
    }

    function closeCollectionEditDialog() {
        if (typeof anime !== 'undefined') {
            const dialog = collectionEditDialogOverlay.querySelector('.collection-dialog');
            if (dialog) {
                anime({
                    targets: dialog,
                    scale: [1, 0.8],
                    opacity: [1, 0],
                    duration: 300,
                    easing: 'easeInCubic',
                    complete: () => {
                        collectionEditDialogOverlay.classList.remove('visible');
                    }
                });
            } else {
                collectionEditDialogOverlay.classList.remove('visible');
            }
        } else {
            collectionEditDialogOverlay.classList.remove('visible');
        }
    }

    function selectTheme(themeElement) {
        selectedTheme = themeElement.dataset.theme;
        selectedColor = themeElement.dataset.color;
        updateThemeSelection();
    }

    function updateThemeSelection() {
        themeOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.theme === selectedTheme) {
                option.classList.add('selected');
            }
        });
    }

    async function createCollection() {
        const name = collectionNameInput.value.trim();
        if (!name) {
            showToast(chrome.i18n.getMessage('collections_enterCollectionName') || 'Please enter collection name');
            applyShakeAnimation(collectionNameInput);
            return;
        }

        try {
            if (currentCollectionId) {
                // Edit existing collection - no limit check needed
                await chrome.runtime.sendMessage({
                    action: 'updateCollection',
                    collectionId: currentCollectionId,
                    data: {
                        name: name,
                        color: selectedColor,
                        theme: selectedTheme
                    }
                });

                closeCollectionDialog();
                showToast(chrome.i18n.getMessage('collections_collectionUpdated'));
                loadAndDisplayCollectionNotes(); // Refresh collection page
                loadAndDisplayNotesWithCollections(); // Refresh main page
            } else {
                // Create new collection - check limit first
                const canCreate = await checkCollectionLimit();
                if (!canCreate) {
                    return; // Limit reached, message already shown
                }

                await chrome.runtime.sendMessage({
                    action: 'createCollection',
                    collectionData: {
                        name: name,
                        color: selectedColor,
                        theme: selectedTheme
                    }
                });

                closeCollectionDialog();
                showToast(chrome.i18n.getMessage('collections_collectionCreated'));
                loadAndDisplayNotesWithCollections(); // Refresh to show collections
            }
        } catch (error) {
            console.error('Error creating/updating collection:', error);
            showToast(chrome.i18n.getMessage('collections_errorCreatingUpdating'));
        }
    }

    // Check collection limit (10 for regular users, unlimited for premium)
    async function checkCollectionLimit() {
        try {
            // Get current collections count
            const response = await chrome.runtime.sendMessage({
                action: 'getCollections'
            });

            if (!response.success) {
                return true; // Allow creation if we can't check
            }

            const collectionsCount = response.collections.length;

            // Check if user is premium (unlimited collections)
            const aiUnlocked = await dbManager.getSetting('aiUnlocked');
            const isPremium = aiUnlocked === true || isAIUnlocked === true;

            if (isPremium) {
                // Premium users have unlimited collections
                return true;
            }

            // Regular users limited to 10 collections
            const COLLECTION_LIMIT = 10;

            if (collectionsCount >= COLLECTION_LIMIT) {
                // Show premium modal to encourage upgrade
                const limitText = '({count}/10)';
                showToast(`${chrome.i18n.getMessage('collections_limitReached') || 'Collection limit reached'} ${limitText.replace('{count}', COLLECTION_LIMIT)}`);

                // Show premium modal after a short delay
                setTimeout(async () => {
                    // Don't show modal if payment verification is in progress
                    const upgradeBtn = document.getElementById('premium-upgrade-btn');
                    const hasSpinner = upgradeBtn?.querySelector('.payment-spinner') !== null;
                    const hasFlag = sessionStorage.getItem('payment_checking') === 'true';
                    if (!hasSpinner && !hasFlag) {
                        await showPremiumModal();
                    }
                }, 1000);

                return false;
            }

            return true;
        } catch (error) {
            console.error('Error checking collection limit:', error);
            return true; // Allow creation if check fails
        }
    }

    function openCollection(collectionId, sourceCard) {
        exitMultiSelectMode();
        currentPage = 'collection';
        currentCollectionId = collectionId;

        // No page transition animation to avoid lag
        mainPage.classList.remove('active');
        mainPage.style.display = 'none';
        collectionPage.style.display = '';
        collectionPage.classList.add('active');

        // Re-run i18n replacement for any remaining placeholders
        if (typeof window.reinitializeI18n === 'function') {
            setTimeout(() => {
                window.reinitializeI18n();
            }, 100);
        }
        // Load WITH animation when opening from collection card (nice visual feedback)
        loadAndDisplayCollectionNotes(true);
    }

    function closeCollection() {
        currentPage = 'main';
        exitMultiSelectMode(); // Exit multi-select mode when leaving collection page

        // No page transition animation to avoid lag
        collectionPage.classList.remove('active');
        collectionPage.style.display = 'none';
        currentCollectionId = null;
        mainPage.style.display = '';
        mainPage.classList.add('active');
        // Reload and animate notes when returning from collection
        loadAndDisplayNotesWithCollections(true);
    }

    async function createNoteInCollection() {
        if (!currentCollectionId) return;

        try {
            // Create a new note and add it to the current collection
            const response = await chrome.runtime.sendMessage({
                action: "createNewNote",
                collectionId: currentCollectionId
            });

            if (response && response.success) {
                // Refresh the collection notes display
                loadAndDisplayCollectionNotes();
                showToast(chrome.i18n.getMessage('collections_noteCreated') || 'Note created in collection');
            } else {
                showToast(chrome.i18n.getMessage('collections_errorCreatingNote') || 'Error creating note');
            }
        } catch (error) {
            console.error('Error creating note in collection:', error);
            showToast(chrome.i18n.getMessage('collections_errorCreatingNote') || 'Error creating note');
        }
    }

    async function editCollection() {
        if (!currentCollectionId) return;

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getCollections'
            });

            if (response.success) {
                const collection = response.collections.find(c => c.id === currentCollectionId);
                if (collection) {
                    // Open edit dialog with current collection data
                    openCollectionEditDialog();
                    collectionEditNameInput.value = collection.name;
                    selectedTheme = collection.theme || 'work';
                    selectedColor = collection.color || '#ff6b6b';
                    updateThemeSelection();
                }
            }
        } catch (error) {
            console.error('Error loading collection for edit:', error);
            showToast(chrome.i18n.getMessage('collections_errorLoading'));
        }
    }

    async function saveCollection() {
        if (!currentCollectionId) return;

        const name = collectionEditNameInput.value.trim();
        if (!name) {
            showToast(chrome.i18n.getMessage('collections_enterCollectionName') || 'Please enter collection name');
            applyShakeAnimation(collectionEditNameInput);
            return;
        }

        try {
            await chrome.runtime.sendMessage({
                action: 'updateCollection',
                collectionId: currentCollectionId,
                data: {
                    name: name,
                    color: selectedColor,
                    theme: selectedTheme
                }
            });

            closeCollectionEditDialog();
            showToast(chrome.i18n.getMessage('collections_collectionUpdated'));
            loadAndDisplayCollectionNotes();
            loadAndDisplayNotesWithCollections();
        } catch (error) {
            console.error('Error updating collection:', error);
            showToast(chrome.i18n.getMessage('collections_errorUpdating'));
        }
    }

    async function deleteCollection() {
        if (!currentCollectionId) return;

        try {
            await chrome.runtime.sendMessage({
                action: 'deleteCollection',
                collectionId: currentCollectionId
            });

            showToast(chrome.i18n.getMessage('collections_collectionDeleted'));
            closeCollection();
            loadAndDisplayNotesWithCollections();
        } catch (error) {
            console.error('Error deleting collection:', error);
            showToast(chrome.i18n.getMessage('collections_errorDeleting'));
        }
    }

    async function togglePinCollection(collectionId) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getCollections'
            });

            if (response.success) {
                const collection = response.collections.find(c => c.id === collectionId);
                if (collection) {
                    const newPinnedStatus = !collection.pinned;
                    await chrome.runtime.sendMessage({
                        action: 'updateCollection',
                        collectionId: collectionId,
                        data: { pinned: newPinnedStatus }
                    });

                    const message = newPinnedStatus ?
                        chrome.i18n.getMessage('collections_collectionPinned') :
                        chrome.i18n.getMessage('collections_collectionUnpinned');
                    showToast(message);
                    // Reload with animation for pin/unpin
                    loadAndDisplayNotesWithCollections(true);
                }
            }
        } catch (error) {
            console.error('Error toggling collection pin:', error);
            showToast(chrome.i18n.getMessage('collections_errorTogglingPin'));
        }
    }

    async function editCollectionFromContext(collectionId) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getCollections'
            });

            if (response.success) {
                const collection = response.collections.find(c => c.id === collectionId);
                if (collection) {
                    openCollectionEditDialog();
                    collectionEditNameInput.value = collection.name;
                    selectedTheme = collection.theme || 'work';
                    selectedColor = collection.color || '#ff6b6b';
                    updateThemeSelection();

                    // Store the collection ID for editing
                    currentCollectionId = collectionId;
                }
            }
        } catch (error) {
            console.error('Error loading collection for edit:', error);
            showToast(chrome.i18n.getMessage('collections_errorLoading'));
        }
    }

    async function deleteCollectionFromContext(collectionId) {
        try {
            await chrome.runtime.sendMessage({
                action: 'deleteCollection',
                collectionId: collectionId
            });

            showToast(chrome.i18n.getMessage('collections_collectionDeleted'));
            loadAndDisplayNotesWithCollections();
        } catch (error) {
            console.error('Error deleting collection:', error);
            showToast(chrome.i18n.getMessage('collections_errorDeleting'));
        }
    }

    async function loadAndDisplayCollectionNotes(animate = false) {
        if (!currentCollectionId) return;

        try {
            const [notesResponse, collectionsResponse] = await Promise.all([
                chrome.runtime.sendMessage({
                    action: 'getCollectionNotes',
                    collectionId: currentCollectionId
                }),
                chrome.runtime.sendMessage({
                    action: 'getCollections'
                })
            ]);

            if (notesResponse.success) {
                displayCollectionNotes(notesResponse.notes, animate);
            }

            if (collectionsResponse.success) {
                const collection = collectionsResponse.collections.find(c => c.id === currentCollectionId);
                if (collection) {
                    updateCollectionHeader(collection);
                }
            }

            // Preload AI Workspace modal after collection is loaded to reduce lag
            setTimeout(() => preloadAiWorkspaceModal(), 500);
        } catch (error) {
            console.error('Error loading collection notes:', error);
        }
    }

    function updateCollectionHeader(collection) {
        const themeIcons = {
            work: `<img src="../note img/work.svg" alt="${chrome.i18n.getMessage('icons_work') || 'Work'}" width="28" height="28">`,
            personal: `<img src="../note img/personal.svg" alt="${chrome.i18n.getMessage('icons_personal') || 'Personal'}" width="28" height="28">`,
            ideas: `<img src="../note img/ideas.svg" alt="${chrome.i18n.getMessage('icons_ideas') || 'Ideas'}" width="28" height="28">`,
            study: `<img src="../note img/study.svg" alt="${chrome.i18n.getMessage('icons_study') || 'Study'}" width="28" height="28">`,
            travel: `<img src="../note img/travel.svg" alt="${chrome.i18n.getMessage('icons_travel') || 'Travel'}" width="28" height="28">`,
            hobby: `<img src="../note img/hobby.svg" alt="${chrome.i18n.getMessage('icons_hobby') || 'Hobby'}" width="28" height="28">`
        };

        const icon = themeIcons[collection.theme] || `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V5C2 3.9 2.9 3 4 3H9L11 5H20C21.1 5 22 5.9 22 7V19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

        document.getElementById('collection-color-indicator').style.backgroundColor = collection.color;
        const colorIndicator = document.getElementById('collection-color-indicator');
        const nameDisplay = document.getElementById('collection-name-display');
        const noteCount = document.getElementById('collection-note-count');
        if (colorIndicator) colorIndicator.innerHTML = icon;
        if (nameDisplay) nameDisplay.textContent = collection.name;
        if (noteCount) noteCount.textContent = `${collection.noteCount} ${chrome.i18n.getMessage('collections_noteCount') || 'notes'}`;
    }

    function displayCollectionNotes(notes, animate = false) {
        const container = document.getElementById('collection-notes-container');

        if (container) {
            container.innerHTML = '';

            if (notes.length === 0) {
                container.innerHTML = `<p class="empty-collection-message">${chrome.i18n.getMessage('collections_emptyCollection')}</p>`;
                return;
            }
        }

        if (container) {
            notes.forEach(note => {
                const noteElement = createCollectionNoteElement(note);
                container.appendChild(noteElement);
            });

            // Apply stagger animation ONLY when explicitly requested (pin/unpin operations)
            if (animate && typeof anime !== 'undefined') {
                const items = container.querySelectorAll('.note-tab');
                anime({
                    targets: items,
                    opacity: [0, 1],
                    translateY: [20, 0],
                    delay: anime.stagger(30),
                    duration: 400,
                    easing: 'easeOutCubic'
                });
            }
        }
    }

    function createNoteElement(note) {
        const noteTab = document.createElement('div');
        noteTab.className = 'note-tab';
        noteTab.dataset.noteId = note.id;

        const title = extractNoteTitle(note);
        const preview = extractNotePreview(note);
        const date = new Date(note.lastModified || Date.now());
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        noteTab.innerHTML = `
            <div class="note-header">
                <h3>${title}</h3>
                <span class="note-date">${formattedDate}</span>
            </div>
            <p>${preview}</p>
        `;

        // Set pinned attribute if note is pinned
        if (note.pinned) {
            noteTab.dataset.pinned = 'true';
        }

        // Apply color AFTER innerHTML is set
        updateNoteCardAppearance(noteTab, note.color || '#fbbc04');

        noteTab.addEventListener('click', (e) => {
            if (e.target.closest('.pin-icon')) {
                e.stopPropagation();
                togglePinNote(note.id);
                return;
            }
            // Don't open note if in multi-select mode
            if (multiSelectMode) return;
            chrome.runtime.sendMessage({ action: "openNoteWindow", noteId: note.id });
        });

        noteTab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleNoteContextMenu(e, note.id);
        });

        // Enable drag for collection drops
        noteTab.draggable = true;
        noteTab.addEventListener('dragstart', (e) => {
            if (multiSelectMode) {
                const itemKey = `note:${note.id}`;
                if (!selectedItems.has(itemKey)) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.setData('text/plain', 'multi-select-drag');
            } else {
                e.dataTransfer.setData('text/plain', note.id);
            }
            e.dataTransfer.effectAllowed = 'move';
        });

        return noteTab;
    }

    function createCollectionNoteElement(note) {
        const noteTab = document.createElement('div');
        noteTab.className = 'note-tab';
        noteTab.dataset.noteId = note.id;

        const title = extractNoteTitle(note);
        const preview = extractNotePreview(note);
        const date = new Date(note.lastModified || Date.now());
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        noteTab.innerHTML = `
            <div class="note-header">
                <h3>${title}</h3>
                <span class="note-date">${formattedDate}</span>
            </div>
            <p>${preview}</p>
        `;

        // Set pinned attribute if note is pinned
        if (note.pinned) {
            noteTab.dataset.pinned = 'true';
        }

        // Apply color AFTER innerHTML is set
        updateNoteCardAppearance(noteTab, note.color || '#fbbc04');

        noteTab.addEventListener('click', (e) => {
            // In multi-select mode, don't handle click here - let document listener handle it
            if (multiSelectMode) {
                return;
            }

            if (e.target.closest('.pin-icon')) {
                e.stopPropagation();
                togglePinNote(note.id);
                return;
            }

            chrome.runtime.sendMessage({ action: "openNoteWindow", noteId: note.id });
        });

        noteTab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleNoteContextMenu(e, note.id);
        });

        // Enable drag for collection drops (in collection view, drag is typically disabled)
        // But we keep it for consistency
        noteTab.draggable = false; // Disable in collection view to avoid confusion

        return noteTab;
    }

    // Track if this is initial load or page change (for animations)
    let shouldAnimateList = false;

    // Update loadAndDisplayNotes to include collections
    async function loadAndDisplayNotesWithCollections(animate = false) {
        const notes = await dbManager.getAllNotes();
        const collections = await dbManager.getAllCollections();
        if (notesListContainer) notesListContainer.innerHTML = '';

        // Combine collections and notes into one array for unified sorting
        const allItems = [];

        // Add collections to the array
        Object.values(collections).forEach(collection => {
            allItems.push({
                type: 'collection',
                data: collection,
                sortKey: collection.createdAt || 0,
                pinned: collection.pinned || false
            });
        });

        // Add notes not in collections to the array
        Object.values(notes)
            .filter(note => !note.collectionId && !note.isDraft) // Filter out draft notes
            .forEach(note => {
                allItems.push({
                    type: 'note',
                    data: note,
                    sortKey: note.lastModified || note.createdAt || 0,
                    pinned: note.pinned || false
                });
            });

        // Sort all items by pinned status first, then by creation/modification date
        allItems.sort((a, b) => {
            // First sort by pinned status (pinned items first)
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            // Then sort by creation/modification date (newest first)
            return b.sortKey - a.sortKey;
        });

        // Display all items in the sorted order
        allItems.forEach(item => {
            if (item.type === 'collection') {
                displayCollection(item.data);
            } else {
                displayNote(item.data);
            }
        });

        // Apply stagger animation ONLY when explicitly requested (initial load or page change)
        if (animate && typeof anime !== 'undefined') {
            const items = notesListContainer.querySelectorAll('.note-tab, .collection-card');
            anime({
                targets: items,
                opacity: [0, 1],
                translateY: [20, 0],
                delay: anime.stagger(30), // 30ms delay between each item
                duration: 400,
                easing: 'easeOutCubic'
            });
        }

        // Hide checkboxes if not in multi-select mode
        if (!multiSelectMode) {
            document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
                checkbox.style.display = 'none';
            });
        } else {
            // Show checkboxes if in multi-select mode
            document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
                checkbox.style.display = 'flex';
            });

            // Add drag listeners for selected items
            selectedItems.forEach(itemKey => {
                const [itemType, itemId] = itemKey.split(':');
                updateItemSelection(itemId, itemType);
            });
        }

        filterNotes();
    }

    function displayCollection(collection) {
        const collectionCard = document.createElement('div');
        collectionCard.className = 'collection-card';
        collectionCard.dataset.collectionId = collection.id;

        // Add selection checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'selection-checkbox';
        checkbox.style.display = multiSelectMode ? 'flex' : 'none';
        collectionCard.appendChild(checkbox);
        if (collection.pinned) {
            collectionCard.dataset.pinned = 'true';
        }

        const themeIcons = {
            work: `<img src="../note img/work.svg" alt="${chrome.i18n.getMessage('icons_work') || 'Work'}" width="28" height="28">`,
            personal: `<img src="../note img/personal.svg" alt="${chrome.i18n.getMessage('icons_personal') || 'Personal'}" width="28" height="28">`,
            ideas: `<img src="../note img/ideas.svg" alt="${chrome.i18n.getMessage('icons_ideas') || 'Ideas'}" width="28" height="28">`,
            study: `<img src="../note img/study.svg" alt="${chrome.i18n.getMessage('icons_study') || 'Study'}" width="28" height="28">`,
            travel: `<img src="../note img/travel.svg" alt="${chrome.i18n.getMessage('icons_travel') || 'Travel'}" width="28" height="28">`,
            hobby: `<img src="../note img/hobby.svg" alt="${chrome.i18n.getMessage('icons_hobby') || 'Hobby'}" width="28" height="28">`
        };

        const icon = themeIcons[collection.theme] || `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V5C2 3.9 2.9 3 4 3H9L11 5H20C21.1 5 22 5.9 22 7V19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

        collectionCard.innerHTML = `
            <div class="collection-header">
                <div class="collection-icon">
                    ${icon}
                </div>
                <div class="collection-info">
                    <div class="collection-name">${collection.name}</div>
                </div>
                <div class="collection-note-count">${collection.noteCount} notes</div>
            </div>
        `;

        // Apply color styling for collections
        collectionCard.style.setProperty('--collection-color', collection.color || '#ff6b6b');

        collectionCard.addEventListener('click', (e) => {
            // Don't open collection if in multi-select mode
            if (multiSelectMode) return;
            openCollection(collection.id, collectionCard);
        });

        collectionCard.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showIndividualCollectionContextMenu(e.clientX, e.clientY, collection.id);
        });

        // Add drag listeners for multi-select mode if collection is selected
        if (multiSelectMode) {
            const itemKey = `collection:${collection.id}`;
            if (selectedItems.has(itemKey)) {
                collectionCard.draggable = true;
                addMultiSelectDragListeners(collectionCard, 'collection', collection.id);
            }
        }

        // Add drag and drop functionality
        collectionCard.addEventListener('dragover', (e) => {
            // Handle both individual drag and multi-select drag
            e.preventDefault();
            collectionCard.classList.add('drag-over');
        });

        collectionCard.addEventListener('dragleave', (e) => {
            collectionCard.classList.remove('drag-over');
        });

        collectionCard.addEventListener('drop', async (e) => {
            e.preventDefault();
            collectionCard.classList.remove('drag-over');

            const noteId = e.dataTransfer.getData('text/plain');

            // Check if this is multi-select drag
            if (noteId === 'multi-select-drag' && multiSelectMode && selectedItems.size > 0) {
                // Handle multi-select drag
                await moveSelectedItemsToCollection(collection.id);
            } else if (noteId && noteId !== 'multi-select-drag') {
                // Handle individual drag
                try {
                    await chrome.runtime.sendMessage({
                        action: 'moveNoteToCollection',
                        noteId: noteId,
                        collectionId: collection.id
                    });
                    showToast(chrome.i18n.getMessage('messages_noteMovedToCollection'));
                    // Reload with animation for move operation
                    loadAndDisplayNotesWithCollections(true);
                } catch (error) {
                    console.error('Error moving note to collection:', error);
                    showToast(chrome.i18n.getMessage('collections_errorMovingNote'));
                }
            }
        });

        notesListContainer.appendChild(collectionCard);
    }

    // Update the original loadAndDisplayNotes function
    const originalLoadAndDisplayNotes = loadAndDisplayNotes;
    loadAndDisplayNotes = loadAndDisplayNotesWithCollections;

    // Reset AI status when user logs out
    async function resetAIStatusOnLogout() {
        try {
            // Reset AI unlock status when user logs out
            await dbManager.saveSetting('aiUnlocked', false);
            isAIUnlocked = false;

            // Update unlock button display
            await updateUnlockButtonDisplay();

        } catch (error) {
            console.error('Error resetting AI status:', error);
        }
    }

    // Check if user is logged in
    async function isUserLoggedIn() {
        try {
            // First check storage (faster and more reliable)
            const userEmail = await dbManager.getSetting('userEmail');
            if (userEmail) {
                return true;
            }

            // Fallback: Check OAuth token
            const token = await new Promise((resolve) => {
                chrome.identity.getAuthToken({ interactive: false }, (token) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                    } else {
                        resolve(token);
                    }
                });
            });

            return !!token;
        } catch (error) {
            console.error('Error checking login status:', error);
            return false;
        }
    }

    // Force refresh AI status - clears cache and refreshes immediately
    let forceRefreshTimeout = null;
    let isForceRefreshing = false;

    async function forceRefreshAIStatus() {
        // Prevent multiple simultaneous force refreshes
        if (isForceRefreshing) {
            return;
        }

        // Debounce force refresh to prevent excessive calls
        if (forceRefreshTimeout) {
            clearTimeout(forceRefreshTimeout);
        }

        forceRefreshTimeout = setTimeout(async () => {
            if (isForceRefreshing) return;

            isForceRefreshing = true;
            try {
                // Clear AI service cache
                chrome.runtime.sendMessage({ action: 'clearAICache' });

                // Clear local cache
                await dbManager.deleteSetting('aiUsageCache');
                await dbManager.deleteSetting('aiUnlocked');

                // Force refresh with no cache
                await loadAIUsageData(true);

            } catch (error) {
                console.error('Error force refreshing AI status:', error);
            } finally {
                isForceRefreshing = false;
            }
        }, 2000); // 2 second debounce
    }

    // Load AI Usage Data
    async function loadAIUsageData(forceRefresh = false) {
        try {
            // Check if user is logged in first
            const isLoggedIn = await isUserLoggedIn();
            if (!isLoggedIn) {
                // Reset AI unlock status when not logged in
                isAIUnlocked = false;
                await dbManager.saveSetting('aiUnlocked', false);

                // Update unlock button display
                updateUnlockButtonDisplay();

                // Show login required state
                updateAIUsageDisplay({
                    used: 0,
                    remaining: 0,
                    limit: 0,
                    percentage: 0,
                    canUse: false,
                    requiresLogin: true
                });
                return;
            }

            // Check unlock status for button display only
            await checkAIUnlockStatus();

            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getDailyUsageStats',
                    forceRefresh: forceRefresh
                }, resolve);
            });

            if (response && response.success && response.stats) {
                // Use server response directly - backend handles all logic
                updateAIUsageDisplay(response.stats);
            } else {
                // Log error details if available
                if (response && response.error) {
                    console.warn('Failed to load AI usage data:', response.error);
                } else {
                    console.warn('Failed to load AI usage data: No response or invalid response');
                }
                // Show default state
                updateAIUsageDisplay({
                    used: 0,
                    remaining: 15,
                    limit: 15,
                    percentage: 0,
                    canUse: true,
                    isPremium: false
                });
            }
        } catch (error) {
            console.error('Error loading AI usage data:', error);
            // Show default state on error
            updateAIUsageDisplay({
                used: 0,
                remaining: 15,
                limit: 15,
                percentage: 0,
                canUse: true
            });
        }
    }

    // Expose loadAIUsageData to window for optimizer to use
    window.loadAIUsageData = loadAIUsageData;

    // Cache for AI usage display to avoid unnecessary DOM updates
    let lastAIUsageDisplayData = null;

    // Update AI Usage Display (Optimized)
    function updateAIUsageDisplay(stats) {
        // Check if data has changed to avoid unnecessary DOM updates
        if (lastAIUsageDisplayData &&
            JSON.stringify(lastAIUsageDisplayData) === JSON.stringify(stats)) {
            return; // No changes, skip update
        }

        lastAIUsageDisplayData = { ...stats };

        // Batch DOM updates with requestAnimationFrame for better performance
        requestAnimationFrame(() => {
            const usageCount = document.getElementById('ai-usage-count');
            const usageProgress = document.getElementById('ai-usage-progress');
            const usagePercentage = document.getElementById('ai-usage-percentage');
            const resetTime = document.getElementById('ai-reset-time'); // Element may not exist

            // Check if login is required
            if (stats.requiresLogin) {
                if (usageCount) {
                    usageCount.textContent = '0/0';
                    usageCount.classList.remove('warning', 'danger', 'unlimited');
                    usageCount.classList.add('login-required');
                }
                if (usageProgress) {
                    usageProgress.style.width = '0%';
                    usageProgress.classList.remove('warning', 'danger', 'unlimited');
                    usageProgress.classList.add('login-required');
                }
                if (usagePercentage) {
                    usagePercentage.textContent = chrome.i18n.getMessage('ai_usageLocked') || 'LOCK';
                }
                if (resetTime) {
                    resetTime.textContent = chrome.i18n.getMessage('ai_signInToUnlock') || 'Sign in to unlock';
                }
                return;
            }

            // Check if AI is unlocked or premium
            // IMPORTANT: Prioritize server status (stats.isPremium) over local cache
            // This ensures cancelled subscriptions are reflected immediately
            const isPremiumActive = stats.isPremium === true;

            if (isPremiumActive) {
                if (usageCount) {
                    usageCount.textContent = chrome.i18n.getMessage('ai_usageUnlimited') || 'Unlimited';
                    usageCount.classList.remove('warning', 'danger', 'login-required');
                    usageCount.classList.add('unlimited');
                }
                if (usageProgress) {
                    usageProgress.style.width = '100%';
                    usageProgress.classList.remove('warning', 'danger', 'login-required');
                    usageProgress.classList.add('unlimited');
                }
                if (usagePercentage) {
                    usagePercentage.textContent = '∞';
                }
                if (resetTime) {
                    resetTime.textContent = chrome.i18n.getMessage('ai_premiumActive') || 'Premium Active';
                }

                // Sync local state with server state
                if (!isAIUnlocked) {
                    isAIUnlocked = true;
                    dbManager.saveSetting('aiUnlocked', true);
                }

                return;
            } else {
                // If server says not premium, update local state immediately
                if (isAIUnlocked) {
                    isAIUnlocked = false;
                    dbManager.saveSetting('aiUnlocked', false);
                    updateUnlockButtonDisplay();
                }
            }

            // Normal display when not unlocked
            if (usageCount) {
                usageCount.textContent = `${stats.used}/${stats.limit}`;
                usageCount.classList.remove('warning', 'danger', 'unlimited');
                if (stats.percentage >= 80) {
                    usageCount.classList.add('warning');
                }
                if (stats.percentage >= 95) {
                    usageCount.classList.add('danger');
                }
            }

            if (usageProgress) {
                usageProgress.style.width = `${stats.percentage}%`;
                usageProgress.classList.remove('warning', 'danger', 'unlimited');
                if (stats.percentage >= 80) {
                    usageProgress.classList.add('warning');
                }
                if (stats.percentage >= 95) {
                    usageProgress.classList.add('danger');
                }
            }

            if (usagePercentage) {
                usagePercentage.textContent = `${stats.percentage}%`;
            }
        }); // End of requestAnimationFrame
    }
    // - Only polls when settings page is active
    // - Stops when tab is not visible
    // - Increased interval from 10s to 30s
    // - Proper cleanup when leaving settings

    // Unlock AI functionality
    let isAIUnlocked = false;

    // Check if AI is unlocked
    async function checkAIUnlockStatus() {
        try {
            // Check local storage first
            const aiUnlocked = await dbManager.getSetting('aiUnlocked');
            isAIUnlocked = aiUnlocked === true;

            // Always check server status for synchronization
            const userEmail = await getUserEmail();
            if (userEmail) {
                const serverStatus = await checkServerPremiumStatus(userEmail);

                if (serverStatus.isPremium) {
                    // Sync from server to local
                    await dbManager.saveSetting('aiUnlocked', true);
                    isAIUnlocked = true;
                    // console.log('Premium status synced from server');

                    // Force refresh AI usage display after premium sync
                    // console.log('[Main App] Force refreshing AI usage display after premium sync...');
                    await forceRefreshAIStatus();

                    // Also refresh AI service in service worker
                    chrome.runtime.sendMessage({ action: 'clearAICache' });

                    // Update VIP styling for avatar
                    const userAvatar = document.getElementById('user-avatar');
                    if (userAvatar) {
                        await applyVIPStyling(userAvatar);
                    }
                } else {
                    // Reset AI unlocked status if not premium
                    await dbManager.saveSetting('aiUnlocked', false);
                    isAIUnlocked = false;
                    // console.log('User is not premium, resetting AI unlock status');
                }
            }

            updateUnlockButtonDisplay();
        } catch (error) {
            console.error('Error checking AI unlock status:', error);
        }
    }

    // Update unlock button display
    async function updateUnlockButtonDisplay() {
        const unlockBtn = document.getElementById('unlock-ai-btn');
        const premiumUnlockedBtn = document.getElementById('premium-unlocked-btn');

        if (unlockBtn && premiumUnlockedBtn) {
            // Check if user is logged in
            const isLoggedIn = await isUserLoggedIn();

            if (isAIUnlocked) {
                // Show premium unlocked button, hide unlock button
                unlockBtn.style.display = 'none';
                premiumUnlockedBtn.style.display = 'flex';
                premiumUnlockedBtn.disabled = false;
            } else if (!isLoggedIn) {
                // Show unlock button with disabled state
                unlockBtn.style.display = 'flex';
                premiumUnlockedBtn.style.display = 'none';
                unlockBtn.textContent = chrome.i18n.getMessage('settings_signInRequired') || 'Sign in required';
                unlockBtn.classList.remove('unlocked');
                unlockBtn.classList.add('disabled');
                unlockBtn.disabled = true;
            } else {
                // Check server when user is logged in
                const userEmail = await getUserEmail();
                if (userEmail) {
                    const serverStatus = await checkServerPremiumStatus(userEmail);
                    if (serverStatus.isPremium) {
                        // Sync from server
                        await dbManager.saveSetting('aiUnlocked', true);
                        isAIUnlocked = true;
                        unlockBtn.style.display = 'none';
                        premiumUnlockedBtn.style.display = 'flex';
                        premiumUnlockedBtn.disabled = false;
                        // console.log('🔓 Premium status synced from server in button display');
                        return;
                    }
                }

                // Show unlock button
                unlockBtn.style.display = 'flex';
                premiumUnlockedBtn.style.display = 'none';
                unlockBtn.textContent = chrome.i18n.getMessage('settings_unlockAI') || 'Unlock AI';
                unlockBtn.classList.remove('unlocked', 'disabled');
                unlockBtn.disabled = false;
            }
        }
    }

    // Direct to payment page
    async function goToPayment() {
        const upgradeBtn = document.getElementById('premium-upgrade-btn');
        const buttonText = upgradeBtn?.querySelector('span')?.textContent || 'Start Free Trial';

        // Get i18n text for comparison
        const freeTrialText = chrome.i18n.getMessage('premium_startFreeTrial') || 'Start Free Trial';
        const subscribeText = chrome.i18n.getMessage('premium_subscribeNow') || 'Subscribe Now';

        // Determine if this is a trial or paid checkout based on button text
        const isTrial = buttonText.includes(freeTrialText) || buttonText.includes('Free Trial');

        await createCheckoutSession('monthly', isTrial);
    }

    // Create checkout session with Lemon Squeezy
    async function createCheckoutSession(planType, isTrial = true) {
        // Update button to show checking state IMMEDIATELY when clicked
        const upgradeBtn = document.getElementById('premium-upgrade-btn');
        if (upgradeBtn) {
            // Save original button text for later restore
            const originalText = upgradeBtn.querySelector('span')?.textContent || 'Start Free Trial';
            upgradeBtn.dataset.originalText = originalText;

            upgradeBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="payment-spinner">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25"/>
                    <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
                </svg>
                <span>${chrome.i18n.getMessage('payment_checking') || 'Checking payment...'}</span>
            `;
            upgradeBtn.disabled = true;
            upgradeBtn.style.cursor = 'wait';

            // Set flag to indicate payment verification is in progress
            sessionStorage.setItem('payment_checking', 'true');
        }

        try {
            const userEmail = await getUserEmail();
            if (!userEmail) {
                showToast(chrome.i18n.getMessage('payment_signInRequired') || 'Please sign in to continue with payment');
                resetUpgradeButton();
                return;
            }

            const planData = {
                monthly: { productId: 'monthly-premium', price: 4.99 }
            };

            const plan = planData[planType];
            if (!plan) {
                showToast(chrome.i18n.getMessage('payment_invalidPlan') || 'Invalid plan selected');
                resetUpgradeButton();
                return;
            }

            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/payment/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Email': userEmail
                },
                body: JSON.stringify({
                    productId: plan.productId,
                    price: plan.price,
                    userEmail: userEmail
                })
            });

            if (!response.ok) {
                let errorMessage = chrome.i18n.getMessage('messages_checkoutFailed') || 'Failed to create checkout session. Please try again.';

                try {
                    const error = await response.json();
                    if (response.status === 403) {
                        errorMessage = error.error || 'You have already used the free trial. Please subscribe.';
                    } else if (error.error) {
                        errorMessage = error.error;
                    }
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }

                showToast(errorMessage);
                resetUpgradeButton();
                return;
            }

            const result = await response.json();

            if (result.success && result.checkoutUrl) {
                // Set pending payment flag BEFORE redirect
                sessionStorage.setItem('pending_payment', 'true');
                sessionStorage.setItem('pending_payment_time', Date.now().toString());

                // Open checkout in new tab
                chrome.tabs.create({ url: result.checkoutUrl });

                // Start checking payment status immediately
                startPaymentStatusCheck();
            } else {
                showToast(chrome.i18n.getMessage('messages_checkoutFailed') || 'Failed to create checkout session. Please try again.');
                resetUpgradeButton();
            }
        } catch (error) {
            console.error('Error creating checkout:', error);
            resetUpgradeButton();
            showToast(chrome.i18n.getMessage('messages_paymentError') || 'Payment error. Please try again.');
        }
    }

    // Sign in with OAuth popup
    async function signInWithGoogle() {
        try {
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, token => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(token);
                });
            });

            if (!token) return null;

            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const userInfo = await response.json();
            return userInfo.email;
        } catch (error) {
            console.error('Error signing in:', error.message || error);
            return null;
        }
    }

    // Get user email from OAuth
    async function getUserEmail() {
        try {
            // First try to get from storage (faster and more reliable)
            const userEmail = await dbManager.getSetting('userEmail');
            if (userEmail) {
                return userEmail;
            }

            // Fallback: Get email from OAuth2 token
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: false }, token => {
                    if (chrome.runtime.lastError) {
                        resolve(null); // Don't reject, just return null
                    } else {
                        resolve(token);
                    }
                });
            });

            if (!token) return null;

            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.warn('Failed to fetch user info from Google API');
                return null;
            }

            const userInfo = await response.json();

            // Save to storage for future use
            if (userInfo.email) {
                await dbManager.saveSetting('userEmail', userInfo.email);
            }

            return userInfo.email;
        } catch (error) {
            console.error('Error getting user email:', error.message || error);
            return null;
        }
    }

    // Cache for premium status checks
    let premiumStatusCache = new Map();
    const PREMIUM_CACHE_TTL = 60000; // 1 minute

    // Check server premium status (with caching)
    async function checkServerPremiumStatus(userEmail) {
        try {
            // Check cache first
            const now = Date.now();
            const cached = premiumStatusCache.get(userEmail);

            if (cached && (now - cached.timestamp < PREMIUM_CACHE_TTL)) {
                return cached.data; // Return from cache
            }

            // Fetch from server if cache miss or expired
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/usage/check`, {
                method: 'GET',
                headers: {
                    'x-user-email': userEmail
                }
            });

            if (response.ok) {
                const data = await response.json();
                const result = { isPremium: data.usage.isPremium };

                // Cache the result
                premiumStatusCache.set(userEmail, {
                    data: result,
                    timestamp: now
                });

                return result;
            }
            return { isPremium: false };
        } catch (error) {
            console.error('Error checking server premium status:', error);
            return { isPremium: false };
        }
    }

    // Function to invalidate premium cache (call when user upgrades/downgrades)
    function invalidatePremiumCache(userEmail = null) {
        if (userEmail) {
            premiumStatusCache.delete(userEmail);
        } else {
            premiumStatusCache.clear();
        }
    }

    // Apply VIP styling to user avatar based on premium status
    async function applyVIPStyling(userAvatar) {
        try {
            const userEmail = await getUserEmail();
            if (!userEmail) {
                return;
            }

            const premiumStatus = await checkServerPremiumStatus(userEmail);

            if (premiumStatus.isPremium) {
                // console.log('👑 [Main App] applyVIPStyling - User is premium, applying VIP styling');
                userAvatar.classList.add('vip');

            } else {
                userAvatar.classList.remove('vip');
            }
        } catch (error) {
            console.error('Error applying VIP styling:', error);
        }
    }


    // Check trial eligibility and update button text
    async function checkTrialEligibilityAndUpdateButton() {
        try {
            const userEmail = await getUserEmail();
            if (!userEmail) {
                // Default to trial button if not logged in
                updatePremiumButtonText('Start Free Trial');
                return;
            }

            // Check trial eligibility from server
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/payment/check-trial-eligibility/${encodeURIComponent(userEmail)}`, {
                method: 'GET',
                headers: {
                    'X-User-Email': userEmail
                }
            });

            if (response.ok) {
                const result = await response.json();

                if (result.success) {
                    if (result.canUseTrial) {
                        // User can use trial
                        updatePremiumButtonText('Start Free Trial');
                    } else {
                        // User has used trial, show payment button
                        updatePremiumButtonText('Subscribe Now');
                    }
                } else {
                    // Fallback to trial button
                    updatePremiumButtonText('Start Free Trial');
                }
            } else {
                // Fallback to trial button if server error
                updatePremiumButtonText('Start Free Trial');
            }
        } catch (error) {
            console.error('Error checking trial eligibility:', error);
            // Fallback to trial button
            updatePremiumButtonText('Start Free Trial');
        }
    }

    // Update premium button text
    function updatePremiumButtonText(text) {
        const upgradeBtn = document.getElementById('premium-upgrade-btn');
        if (upgradeBtn) {
            // IMPORTANT: Don't update if button is in checking state (has spinner)
            // This prevents resetting the button while payment verification is in progress
            const hasSpinner = upgradeBtn.querySelector('.payment-spinner');
            const hasFlag = sessionStorage.getItem('payment_checking') === 'true';

            if (hasSpinner || hasFlag) {
                return;
            }

            // Use i18n for button text
            let displayText = text;
            if (text === 'Start Free Trial') {
                displayText = chrome.i18n.getMessage('premium_startFreeTrial') || 'Start Free Trial';
            } else if (text === 'Subscribe Now') {
                displayText = chrome.i18n.getMessage('premium_subscribeNow') || 'Subscribe Now';
            }

            upgradeBtn.innerHTML = `
                <span>${displayText}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19M12 5L19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            upgradeBtn.disabled = false;
        }
    }

    // Debounce timer for premium modal
    let premiumModalTimeout = null;

    // Premium Modal Functions (with debounce)
    async function showPremiumModal() {
        const modal = document.getElementById('premium-modal-overlay');
        if (modal) {
            // Check trial eligibility and update button before showing modal
            // BUT only if not currently in payment checking state
            const upgradeBtn = document.getElementById('premium-upgrade-btn');
            const hasSpinner = upgradeBtn?.querySelector('.payment-spinner') !== null;
            const hasFlag = sessionStorage.getItem('payment_checking') === 'true';
            const isCheckingPayment = hasSpinner || hasFlag;

            if (!isCheckingPayment) {
                await checkTrialEligibilityAndUpdateButton();
            }

            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    // Debounced version to prevent multiple calls
    function showPremiumModalDebounced() {
        if (premiumModalTimeout) {
            clearTimeout(premiumModalTimeout);
        }

        premiumModalTimeout = setTimeout(() => {
            showPremiumModal();
            premiumModalTimeout = null;
        }, 500); // Debounce 500ms
    }

    function hidePremiumModal() {
        const modal = document.getElementById('premium-modal-overlay');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';

            // Stop payment status checking when modal is closed
            stopPaymentStatusCheck();
        }
    }

    function setupPremiumModalEventListeners() {
        const modal = document.getElementById('premium-modal-overlay');
        const upgradeBtn = document.getElementById('premium-upgrade-btn');

        if (modal) {
            // Close modal when clicking overlay
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hidePremiumModal();
                }
            });

            // Handle upgrade button click
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', async () => {
                    // Don't close modal immediately, start payment process
                    try {
                        await goToPayment();
                    } catch (error) {
                        console.error('Payment error:', error);
                        // Reset button state on error
                        const upgradeBtn = document.getElementById('premium-upgrade-btn');
                        if (upgradeBtn) {
                            upgradeBtn.innerHTML = `
                                <span>Start Free Trial</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M5 12H19M12 5L19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            `;
                            upgradeBtn.disabled = false;
                        }
                    }
                });
            }

            // Close modal with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('show')) {
                    hidePremiumModal();
                }
            });
        }
    }

    // Premium Info Modal Functions
    // Premium Info Lottie Animation
    let premiumInfoLottieAnimation = null;

    async function showPremiumInfoModal() {
        const modal = document.getElementById('premium-info-modal-overlay');
        if (modal) {
            // Load premium information
            await loadPremiumInfo();
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';

            // Start Lottie animation
            startPremiumInfoLottieAnimation();
        }
    }

    function hidePremiumInfoModal() {
        const modal = document.getElementById('premium-info-modal-overlay');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';

            // Stop Lottie animation
            stopPremiumInfoLottieAnimation();
        }
    }

    function startPremiumInfoLottieAnimation() {
        const animationDiv = document.getElementById('premium-info-lottie-animation');

        if (!animationDiv) {
            console.error('Premium info Lottie container not found');
            return;
        }

        // Destroy previous animation if exists
        if (premiumInfoLottieAnimation) {
            premiumInfoLottieAnimation.destroy();
            premiumInfoLottieAnimation = null;
        }

        // Clear animation div
        animationDiv.innerHTML = '';

        // Load and play Lottie animation
        if (typeof lottie !== 'undefined') {
            premiumInfoLottieAnimation = lottie.loadAnimation({
                container: animationDiv,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                path: '../libs/upgrade to premium.json'
            });
            // console.log('Premium info Lottie animation started');
        } else {
            console.error('Lottie library not loaded');
        }
    }

    function stopPremiumInfoLottieAnimation() {
        // Destroy animation to free memory
        if (premiumInfoLottieAnimation) {
            premiumInfoLottieAnimation.destroy();
            premiumInfoLottieAnimation = null;
            // console.log('Premium info Lottie animation stopped');
        }
    }





    // Load premium information from server
    async function loadPremiumInfo() {
        try {
            const userEmail = await getUserEmail();
            if (!userEmail) {
                console.error('No user email found');
                return;
            }

            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(`${backendUrl}/api/payment/verify/${encodeURIComponent(userEmail)}`, {
                method: 'GET',
                headers: {
                    'X-User-Email': userEmail
                }
            });

            if (response.ok) {
                const data = await response.json();
                updatePremiumInfoDisplay(data);
            } else {
                console.error('Failed to load premium info');
            }
        } catch (error) {
            console.error('Error loading premium info:', error);
        }
    }

    // Update premium info display
    function updatePremiumInfoDisplay(data) {
        // Update plan type
        const planTypeElement = document.getElementById('premium-plan-type');
        if (planTypeElement) {
            if (data.paymentType === 'trial') {
                planTypeElement.textContent = chrome.i18n.getMessage('premium_plan_trial') || 'Premium Trial (7 days)';
            } else if (data.paymentType === 'subscription') {
                planTypeElement.textContent = chrome.i18n.getMessage('premium_plan_monthly') || 'Premium Monthly ($4.99/month)';
            } else if (data.paymentType === 'one_time') {
                planTypeElement.textContent = chrome.i18n.getMessage('premium_plan_annual') || 'Premium Annual';
            } else {
                planTypeElement.textContent = 'Premium';
            }
        }

        // Update status
        const statusElement = document.getElementById('premium-status');
        if (statusElement) {
            if (data.isPremium && !data.isExpired) {
                if (data.subscriptionStatus === 'trialing') {
                    statusElement.textContent = chrome.i18n.getMessage('premium_status_trialing') || 'Trial Active';
                    statusElement.className = 'info-value status-trial';
                } else {
                    statusElement.textContent = chrome.i18n.getMessage('premium_status_active') || 'Active';
                    statusElement.className = 'info-value status-active';
                }
            } else if (data.isExpired) {
                statusElement.textContent = chrome.i18n.getMessage('premium_status_expired') || 'Expired';
                statusElement.className = 'info-value status-expired';
            } else if (data.subscriptionStatus === 'cancelled') {
                statusElement.textContent = chrome.i18n.getMessage('premium_status_cancelled') || 'Cancelled';
                statusElement.className = 'info-value status-cancelled';
            } else {
                statusElement.textContent = chrome.i18n.getMessage('premium_status_inactive') || 'Inactive';
                statusElement.className = 'info-value status-expired';
            }
        }

        // Expiry date is no longer displayed (removed from UI)

        // Update next billing (for subscriptions)
        const nextBillingElement = document.getElementById('premium-next-billing');
        if (nextBillingElement) {

            // For trial, show when it converts to paid
            if (data.subscriptionStatus === 'trialing' && data.nextRenewalDate) {
                const nextBillingDate = new Date(data.nextRenewalDate);
                if (!isNaN(nextBillingDate.getTime())) {
                    nextBillingElement.textContent = nextBillingDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) + ' (after trial)';
                } else {
                    nextBillingElement.textContent = 'N/A';
                }
            }
            // For active subscription, show next renewal
            else if (data.subscriptionStatus === 'active' && data.nextRenewalDate) {
                const nextBillingDate = new Date(data.nextRenewalDate);
                if (!isNaN(nextBillingDate.getTime())) {
                    nextBillingElement.textContent = nextBillingDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                } else {
                    nextBillingElement.textContent = 'N/A';
                }
            }
            // For cancelled subscription, show when access ends
            else if (data.subscriptionStatus === 'cancelled' && data.premiumExpiry) {
                const expiryDate = new Date(data.premiumExpiry);
                if (!isNaN(expiryDate.getTime())) {
                    nextBillingElement.textContent = expiryDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) + ' (access ends)';
                } else {
                    nextBillingElement.textContent = 'N/A';
                }
            }
            // Fallback: Use premiumExpiry if nextRenewalDate not available
            else if (data.premiumExpiry && (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trialing')) {
                const expiryDate = new Date(data.premiumExpiry);
                if (!isNaN(expiryDate.getTime())) {
                    nextBillingElement.textContent = expiryDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                } else {
                    nextBillingElement.textContent = 'N/A';
                }
            }
            else {
                nextBillingElement.textContent = 'N/A';
            }
        }
    }

    // Setup premium info modal event listeners
    function setupPremiumInfoModalEventListeners() {
        const modal = document.getElementById('premium-info-modal-overlay');
        const premiumUnlockedBtn = document.getElementById('premium-unlocked-btn');
        const manageBillingBtn = document.getElementById('premium-manage-billing-btn');
        const contactSupportBtn = document.getElementById('premium-contact-support-btn');

        // Close modal when clicking overlay
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hidePremiumInfoModal();
                }
            });
        }

        // Premium unlocked button
        if (premiumUnlockedBtn) {
            premiumUnlockedBtn.addEventListener('click', showPremiumInfoModal);
        }

        // Manage billing button
        if (manageBillingBtn) {
            manageBillingBtn.addEventListener('click', async () => {
                try {
                    const userEmail = await getUserEmail();
                    if (userEmail) {
                        // Open Lemon Squeezy customer portal
                        const customerPortalUrl = `https://app.lemonsqueezy.com/my-orders?email=${encodeURIComponent(userEmail)}`;
                        chrome.tabs.create({ url: customerPortalUrl });
                    }
                } catch (error) {
                    console.error('Error opening customer portal:', error);
                    showToast(chrome.i18n.getMessage('messages_unableToOpenBilling'));
                }
            });
        }

        // Contact support button
        if (contactSupportBtn) {
            contactSupportBtn.addEventListener('click', async () => {
                try {
                    const userEmail = await getUserEmail();
                    if (userEmail) {
                        // Generate token first to hide email from URL
                        const backendUrl = serverSelector.getServerUrl();
                        
                        const response = await fetch(`${backendUrl}/api/support/generate-token`, {
                            method: 'POST',
                            headers: {
                                'X-User-Email': userEmail
                            }
                        });
                        
                        if (response.ok) {
                            const { token } = await response.json();
                            const supportUrl = `${backendUrl}/support?token=${token}`;
                            chrome.tabs.create({ url: supportUrl });
                        } else {
                            throw new Error('Failed to generate support token');
                        }
                    }
                } catch (error) {
                    console.error('Error opening support page:', error);
                    showToast(chrome.i18n.getMessage('messages_unableToOpenSupport') || 'Unable to open support page');
                }
            });
        }

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
                hidePremiumInfoModal();
            }
        });
    }

    // Setup payment modal event listeners
    function setupPaymentEventListeners() {
        const unlockBtn = document.getElementById('unlock-ai-btn');

        if (unlockBtn) {
            unlockBtn.addEventListener('click', async () => {
                if (!isAIUnlocked) {
                    await showPremiumModal();
                }
            });
        }
    }

    // Payment verification state
    let paymentCheckInterval = null;
    let paymentCheckCount = 0;
    const MAX_PAYMENT_CHECKS = 150; // 5 minutes (150 * 2s) - Keep checking while modal is open

    // Check if user just returned from payment
    async function checkIfReturnedFromPayment() {
        try {
            // First, check if payment checking was in progress (restore button state)
            const paymentCheckingFlag = sessionStorage.getItem('payment_checking');
            if (paymentCheckingFlag === 'true') {
                // Restore button to checking state
                const upgradeBtn = document.getElementById('premium-upgrade-btn');
                if (upgradeBtn && !upgradeBtn.querySelector('.payment-spinner')) {
                    upgradeBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="payment-spinner">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25"/>
                            <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
                        </svg>
                        <span>${chrome.i18n.getMessage('payment_checking') || 'Checking payment...'}</span>
                    `;
                    upgradeBtn.disabled = true;
                    upgradeBtn.style.cursor = 'wait';
                }

                // Continue checking payment
                startPaymentStatusCheck();
                return; // Don't process other checks
            }

            // Check URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const paymentSuccess = urlParams.get('payment_success');
            const fromCheckout = urlParams.get('from_checkout');

            // Check session storage (set before redirect)
            const pendingPayment = sessionStorage.getItem('pending_payment');

            if (paymentSuccess === 'true' || fromCheckout === 'true' || pendingPayment) {
                // Clear session storage
                sessionStorage.removeItem('pending_payment');

                // Clear URL parameters
                if (window.history.replaceState) {
                    const cleanUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, cleanUrl);
                }

                // Show loading state
                showToast(chrome.i18n.getMessage('messages_verifyingPayment'), 'info');

                // Start payment verification after a short delay
                setTimeout(() => {
                    startPaymentStatusCheck();
                }, 1000);
            }
        } catch (error) {
            console.error('Error checking payment return:', error);
        }
    }

    // Start payment status checking
    function startPaymentStatusCheck() {
        // Clear any existing interval WITHOUT resetting button
        if (paymentCheckInterval) {
            clearInterval(paymentCheckInterval);
            paymentCheckInterval = null;
        }

        paymentCheckCount = 0;

        // Check immediately
        checkPaymentStatusOnce();

        // Then check every 2 seconds
        paymentCheckInterval = setInterval(async () => {
            await checkPaymentStatusOnce();
        }, 2000);
    }

    // Stop payment status checking
    function stopPaymentStatusCheck() {
        if (paymentCheckInterval) {
            clearInterval(paymentCheckInterval);
            paymentCheckInterval = null;
        }
        paymentCheckCount = 0;

        // Clear payment checking flag
        sessionStorage.removeItem('payment_checking');

        // Reset button state
        resetUpgradeButton();
    }

    // Reset upgrade button to default state
    function resetUpgradeButton() {
        const upgradeBtn = document.getElementById('premium-upgrade-btn');
        if (upgradeBtn && upgradeBtn.disabled) {
            // Get current button text based on trial eligibility
            const buttonText = upgradeBtn.dataset.originalText ||
                chrome.i18n.getMessage('premium_startFreeTrial') ||
                'Start Free Trial';

            upgradeBtn.innerHTML = `
                <span>${buttonText}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 12H19M12 5L19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            upgradeBtn.disabled = false;
            upgradeBtn.style.cursor = 'pointer';
        }
    }

    // Check payment status once
    async function checkPaymentStatusOnce() {
        try {
            paymentCheckCount++;

            const userEmail = await getUserEmail();
            if (!userEmail) {
                console.error('No user email for payment verification');
                stopPaymentStatusCheck();
                return;
            }

            // Call backend to verify payment
            const backendUrl = serverSelector.getServerUrl();
            const response = await fetch(
                `${backendUrl}/api/payment/verify/${encodeURIComponent(userEmail)}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                console.error('Payment verification failed:', response.status);

                if (paymentCheckCount >= MAX_PAYMENT_CHECKS) {
                    stopPaymentStatusCheck();
                    showToast(
                        chrome.i18n.getMessage('payment_checkTimeout') ||
                        'Payment check timeout. Please refresh if payment completed.'
                    );
                }
                return;
            }

            const result = await response.json();

            // Check if payment is successful
            if (result.success && result.isPremium && !result.isExpired) {
                // Stop checking
                stopPaymentStatusCheck();

                // Hide premium modal if open
                hidePremiumModal();

                // Show premium success modal with animation
                showPremiumSuccessModal();

                // Force refresh AI status
                await forceRefreshAIStatus();

                // Update UI
                await checkAIUnlockStatus();
                await loadAIUsageData(true);

                // Update avatar VIP styling
                const userAvatar = document.getElementById('user-avatar');
                if (userAvatar) {
                    await applyVIPStyling(userAvatar);
                }

                return;
            }

            // Check if max attempts reached (5 minutes)
            if (paymentCheckCount >= MAX_PAYMENT_CHECKS) {
                stopPaymentStatusCheck();

                showToast(
                    chrome.i18n.getMessage('payment_checkTimeout') ||
                    'Checked for 5 minutes. If payment completed, please close modal and reopen Settings to update.'
                );
            }

        } catch (error) {
            console.error('Error checking payment status:', error);

            if (paymentCheckCount >= MAX_PAYMENT_CHECKS) {
                stopPaymentStatusCheck();
                showToast(chrome.i18n.getMessage('messages_paymentVerificationError'));
            }
        }
    }

    // Show Premium Success Modal with Lottie animation
    function showPremiumSuccessModal() {
        const overlay = document.getElementById('premium-success-overlay');
        const animationContainer = document.getElementById('premium-success-animation');
        const sparklesContainer = document.getElementById('premium-sparkles');

        if (!overlay) return;

        // Load and play Lottie animation
        if (animationContainer && typeof lottie !== 'undefined') {
            // Clear any existing animation
            animationContainer.innerHTML = '';

            // Load the upgrade to premium animation
            fetch('../libs/upgrade to premium.json')
                .then(response => response.json())
                .then(animationData => {
                    lottie.loadAnimation({
                        container: animationContainer,
                        renderer: 'svg',
                        loop: true,
                        autoplay: true,
                        animationData: animationData
                    });
                })
                .catch(error => {
                    console.error('Error loading premium animation:', error);
                });
        }

        // Create sparkle effects
        if (sparklesContainer) {
            sparklesContainer.innerHTML = '';
            for (let i = 0; i < 20; i++) {
                const sparkle = document.createElement('div');
                sparkle.className = 'sparkle';
                sparkle.style.left = Math.random() * 100 + '%';
                sparkle.style.animationDelay = Math.random() * 3 + 's';
                sparkle.style.animationDuration = (2 + Math.random() * 2) + 's';
                sparklesContainer.appendChild(sparkle);
            }
        }

        // Show overlay with animation
        setTimeout(() => {
            overlay.classList.add('show');
        }, 100);

        // Setup close button
        const closeBtn = document.getElementById('premium-success-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                overlay.classList.remove('show');
            };
        }
    }

    // Initialize unlock system
    async function initializeUnlockSystem() {
        await checkAIUnlockStatus();
        setupPaymentEventListeners();
        setupPremiumModalEventListeners();
        setupPremiumInfoModalEventListeners();

        // Note: Payment status polling is handled by:
        // 1. startPaymentStatusCheck() when user clicks upgrade button
        // 2. settingsOptimizer when settings page is active
        // No need for additional periodic checking here
    }

    // Add CSS for unlocked state and payment spinner
    const style = document.createElement('style');
    style.textContent = `
        .setting-item.button-item .action-btn.unlock-btn.unlocked {
            background: linear-gradient(135deg, #4CAF50, #2E7D32);
            color: white;
        }
        .setting-item.button-item .action-btn.unlock-btn.unlocked:hover {
            background: linear-gradient(135deg, #4CAF50, #2E7D32);
            transform: none;
            box-shadow: none;
        }
        
        /* Payment spinner animation */
        .payment-spinner {
            animation: spin 1s linear infinite;
            margin-right: 8px;
            display: inline-block;
        }
        
        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }
        
        /* Upgrade button checking state */
        #premium-upgrade-btn:disabled {
            opacity: 0.9;
            cursor: wait !important;
            pointer-events: none;
        }
        
        #premium-upgrade-btn .payment-spinner circle,
        #premium-upgrade-btn .payment-spinner path {
            stroke: currentColor;
        }
        
        /* Ensure button content is centered */
        #premium-upgrade-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);

    initializeUI();
    initializeUnlockSystem();

    // Add CSS for welcome note theme optimization - Simplified and optimized
    const welcomeNoteStyle = document.createElement('style');
    welcomeNoteStyle.textContent = `
        /* Welcome note styling - simplified and optimized */
        .note-tab[data-note-id*="welcome-note"] {
            transition: all 0.3s ease !important;
        }
        
        /* Default text styling for welcome note */
        .note-tab[data-note-id*="welcome-note"] h1 {
            font-weight: bold !important;
        }
        
        .note-tab[data-note-id*="welcome-note"] h2 {
            font-weight: 600 !important;
        }
        
        /* Light theme styling */
        body.light-theme .note-tab[data-note-id*="welcome-note"] {
            background: rgba(255, 255, 255, 0.8) !important;
            border-color: rgba(0, 0, 0, 0.25) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1),
                       0 0 0 1px rgba(0, 0, 0, 0.05),
                       inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
        }
        
        body.light-theme .note-tab[data-note-id*="welcome-note"]:hover {
            background: rgba(255, 255, 255, 0.95) !important;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2),
                       0 0 0 1px rgba(0, 0, 0, 0.15),
                       inset 0 1px 0 rgba(255, 255, 255, 0.4),
                       inset 0 -1px 0 rgba(0, 0, 0, 0.05) !important;
        }
        
        body.light-theme .note-tab[data-note-id*="welcome-note"] * {
            color: #000000 !important;
        }
        
        /* Dark theme styling */
        body.dark-theme .note-tab[data-note-id*="welcome-note"] {
            background: rgba(44, 44, 46, 0.45) !important;
            border-color: rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15),
                       0 0 0 1px rgba(255, 255, 255, 0.05),
                       inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
        }
        
        body.dark-theme .note-tab[data-note-id*="welcome-note"] * {
            color: #ffffff !important;
        }
    `;
    document.head.appendChild(welcomeNoteStyle);

    // Optimized function to update welcome note theme
    function updateWelcomeNoteTheme() {
        const welcomeNotes = document.querySelectorAll('.note-tab[data-note-id*="welcome-note"]');
        if (welcomeNotes.length === 0) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#000000' : '#ffffff';

        welcomeNotes.forEach(note => {
            const textElements = note.querySelectorAll('h1, h2, h3, p, div, span');
            textElements.forEach(el => {
                el.style.color = textColor;
            });
        });
    }

    // Listen for theme changes and apply welcome note styling
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (mutation.target.classList.contains('light-theme') ||
                    mutation.target.classList.contains('dark-theme')) {
                    updateWelcomeNoteTheme();
                }
            }
        });
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });

    // Apply welcome note styling after UI loads
    setTimeout(updateWelcomeNoteTheme, 1000);

    // Add event listener for create collection button
    const createCollectionBtn = document.getElementById('create-collection-btn');
    if (createCollectionBtn) {
        createCollectionBtn.addEventListener('click', async () => {
            // Trigger the create collection context menu action
            const collectionContextMenu = document.getElementById('collection-context-menu');
            if (collectionContextMenu) {
                const createCollectionAction = collectionContextMenu.querySelector('[data-action="create-collection"]');
                if (createCollectionAction) {
                    createCollectionAction.click();
                }
            }
        });
    }

    // Cleanup optimizer when window unloads
    window.addEventListener('beforeunload', () => {
        if (window.settingsOptimizer) {
            window.settingsOptimizer.cleanup();
        }
    });

    // Initialize optimizer if starting on settings page
    if (currentPage === 'settings' && window.settingsOptimizer) {
        window.settingsOptimizer.init();
    }

    // Add window focus listener to reload notes with animation when returning from note window
    let lastFocusTime = Date.now();
    let lastSyncCheckTime = Date.now();

    window.addEventListener('focus', async () => {
        const now = Date.now();
        // Only reload with animation if window was unfocused for more than 500ms
        // This prevents unnecessary reloads when just clicking around
        if (now - lastFocusTime > 500) {
            if (currentPage === 'main') {
                loadAndDisplayNotesWithCollections(false); // No animation when returning from note
            } else if (currentPage === 'collection') {
                loadAndDisplayCollectionNotes(false); // No animation when returning from note
            }
        }

        // Auto-sync if window was unfocused for more than 5 minutes
        // This ensures data is synced when switching between devices
        if (now - lastSyncCheckTime > 300000) { // 5 minutes
            try {
                const token = await new Promise((resolve, reject) => {
                    chrome.identity.getAuthToken({ interactive: false }, token => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(token);
                    });
                });

                if (token) {
                    chrome.runtime.sendMessage({ action: "syncNow" }).catch(() => {
                        // Service worker may be inactive
                    });
                }
            } catch (error) {
                // User not authenticated, skip sync
            }
            lastSyncCheckTime = now;
        }

        lastFocusTime = now;
    });

    window.addEventListener('blur', () => {
        lastFocusTime = Date.now();
    });
});

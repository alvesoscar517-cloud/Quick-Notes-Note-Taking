// Note Tabs Manager
// Each tab represents a separate note with its own noteId in the database
class NoteTabsManager {
    constructor() {
        this.tabs = []; // Array of {id: tabId, noteId: noteId, title: title}
        this.activeTabId = null;
        this.tabCounter = 0;
        this.windowId = null;
        this.tabBar = null;
        this.tabList = null;
        this.addTabBtn = null;
    }

    async init(initialNoteId, quillEditor) {
        this.quillEditor = quillEditor;
        this.tabBar = document.getElementById('tab-bar');
        this.tabList = document.getElementById('tab-list');
        this.addTabBtn = document.getElementById('add-tab-btn');
        this.tabMenuBtn = document.getElementById('tab-menu-btn');

        // Get current window ID
        const windowInfo = await chrome.windows.getCurrent();
        this.windowId = windowInfo.id;

        console.log('[Tabs] Initializing tabs for window:', this.windowId, 'with initial note:', initialNoteId);

        // Load saved tabs for this window
        await this.loadTabs(initialNoteId);

        // Setup event listeners
        this.addTabBtn.addEventListener('click', () => this.createTab());

        // Initialize drag & drop system
        if (window.TabDragDropManager) {
            this.dragDropManager = new window.TabDragDropManager(this);
            this.dragDropManager.init();
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.key === 'PageDown')) {
                e.preventDefault();
                this.nextTab();
            } else if ((e.ctrlKey && e.key === 'Tab' && e.shiftKey) || (e.ctrlKey && e.key === 'PageUp')) {
                e.preventDefault();
                this.previousTab();
            } else if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                if (this.activeTabId !== null) {
                    this.closeTab(this.activeTabId);
                }
            } else if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.createTab();
            }
        });
    }

    nextTab() {
        if (this.tabs.length <= 1) return;
        const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
        const nextIndex = (currentIndex + 1) % this.tabs.length;
        this.switchTab(this.tabs[nextIndex].id);
    }

    previousTab() {
        if (this.tabs.length <= 1) return;
        const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
        const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
        this.switchTab(this.tabs[prevIndex].id);
    }

    async loadTabs(initialNoteId) {
        try {
            const storageKey = `window_${this.windowId}_tabs`;
            const savedTabs = await dbManager.getSetting(storageKey);
            console.log('[Tabs] Loaded tabs:', savedTabs);

            if (savedTabs && savedTabs.length > 0) {
                this.tabs = savedTabs;
                this.tabCounter = Math.max(...this.tabs.map(t => t.id)) + 1;

                // Only show tab bar if there are multiple tabs
                if (this.tabs.length > 1) {
                    this.tabBar.style.display = 'flex';
                    this.updateMenuButtonVisibility();
                } else {
                    this.tabBar.style.display = 'none';
                    this.updateMenuButtonVisibility();
                }

                // Render tabs
                for (const tab of this.tabs) {
                    await this.renderTab(tab);
                }

                // Find tab with initialNoteId or use last active
                const lastActiveId = await dbManager.getSetting(`window_${this.windowId}_activeTab`);
                let tabToActivate = this.tabs.find(t => t.noteId === initialNoteId);
                if (!tabToActivate) {
                    tabToActivate = this.tabs.find(t => t.id === lastActiveId) || this.tabs[0];
                }

                if (tabToActivate) {
                    await this.switchTab(tabToActivate.id);
                }

                this.updateTabCounter();
            } else {
                // No saved tabs, create first tab with initial note
                // Don't show tab bar for single tab
                if (initialNoteId) {
                    const note = await dbManager.getNote(initialNoteId);
                    const tabId = this.tabCounter++;
                    const tab = {
                        id: tabId,
                        noteId: initialNoteId,
                        title: this.extractTitle(note?.content) || 'Note',
                        created: Date.now()
                    };
                    this.tabs.push(tab);

                    // Hide tab bar for single tab
                    this.tabBar.style.display = 'none';
                    this.updateMenuButtonVisibility();

                    await this.renderTab(tab);
                    this.activeTabId = tabId;
                    this.updateTabCounter();
                    await this.saveTabs();

                    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                    if (tabElement) {
                        tabElement.classList.add('active');
                    }
                }
            }
        } catch (error) {
            console.error('[Tabs] Error loading tabs:', error);
        }
    }

    extractTitle(content) {
        if (!content) return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const text = tempDiv.textContent.trim();
        return text.split('\n')[0].substring(0, 20) || '';
    }

    async saveTabs() {
        try {
            await dbManager.saveSetting(`window_${this.windowId}_tabs`, this.tabs);
            await dbManager.saveSetting(`window_${this.windowId}_activeTab`, this.activeTabId);
            console.log('[Tabs] Saved tabs:', this.tabs);
        } catch (error) {
            console.error('[Tabs] Error saving tabs:', error);
        }
    }

    async createTab() {
        console.log('[Tabs] Creating new tab...');

        // Create new note in database
        const response = await chrome.runtime.sendMessage({
            action: "createNewNote",
            skipWindow: true // Don't open new window
        });

        if (response && response.noteId) {
            const tabId = this.tabCounter++;
            const tab = {
                id: tabId,
                noteId: response.noteId,
                title: 'New Note',
                created: Date.now()
            };

            this.tabs.push(tab);
            console.log('[Tabs] Created tab', tabId, 'for note', response.noteId, '- total tabs:', this.tabs.length);

            // Show tab bar when there are multiple tabs
            if (this.tabs.length > 1) {
                this.tabBar.style.display = 'flex';
                this.updateMenuButtonVisibility();
            }

            await this.renderTab(tab);
            await this.switchTab(tabId);
            this.updateTabCounter();
            await this.saveTabs();
        }
    }

    updateTabCounter() {
        let counter = this.addTabBtn.querySelector('.tab-counter');
        const actualTabCount = this.tabList.querySelectorAll('.note-tab').length;
        
        console.log('[Tabs] updateTabCounter - tabs array:', this.tabs.length, 'DOM tabs:', actualTabCount);
        
        if (this.tabs.length > 0) {
            if (!counter) {
                counter = document.createElement('span');
                counter.className = 'tab-counter';
                this.addTabBtn.appendChild(counter);
            }
            counter.textContent = this.tabs.length;
        } else if (counter) {
            counter.remove();
        }
    }

    async renderTab(tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'note-tab';
        tabElement.dataset.tabId = tab.id;
        tabElement.dataset.noteId = tab.noteId;

        // Get note color from database and apply to tab
        let noteColor = tab.color; // Use cached color if available
        if (!noteColor) {
            try {
                const note = await dbManager.getNote(tab.noteId);
                if (note && note.color) {
                    noteColor = note.color;
                    tab.color = note.color; // Cache color in tab data
                }
            } catch (error) {
                console.error('[Tabs] Error loading note color:', error);
            }
        }

        // Always apply color to tab element
        if (noteColor) {
            tabElement.style.setProperty('--tab-note-color', noteColor);
        }

        tabElement.innerHTML = `
            <span class="tab-title">${this.escapeHtml(tab.title)}</span>
            <button class="tab-close" title="Close tab (Ctrl+W)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;

        // Single click to switch tab
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchTab(tab.id);
            }
        });

        // Double click to rename tab
        tabElement.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.tab-close')) {
                e.preventDefault();
                e.stopPropagation();
                this.renameTab(tab.id);
            }
        });

        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tab.id);
        });

        // Right click for context menu
        tabElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showTabContextMenu(e, tab.id);
        });

        tabElement.style.opacity = '0';
        tabElement.style.transform = 'scale(0.8)';
        this.tabList.appendChild(tabElement);

        requestAnimationFrame(() => {
            tabElement.style.transition = 'all 0.2s ease';
            tabElement.style.opacity = '1';
            tabElement.style.transform = 'scale(1)';
        });
    }

    async switchTab(tabId) {
        if (this.activeTabId === tabId) return;

        console.log('[Tabs] Switching to tab', tabId);

        // Save current note immediately before switching
        if (this.activeTabId !== null) {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (currentTab) {
                // Use saveNoteImmediately to save without delay
                if (window.saveNoteImmediately) {
                    await window.saveNoteImmediately();
                } else if (window.saveNoteWithContext) {
                    // Fallback to saveNoteWithContext if saveNoteImmediately not available
                    await window.saveNoteWithContext('content');
                }
            }
        }

        // Switch to new tab
        this.activeTabId = tabId;
        const newTab = this.tabs.find(t => t.id === tabId);

        if (newTab && this.quillEditor) {
            // Load note content from database
            const note = await dbManager.getNote(newTab.noteId);
            console.log('[Tabs] Loading note', newTab.noteId, 'content length:', note?.content?.length || 0);

            // Update URL without reload
            const url = new URL(window.location.href);
            url.searchParams.set('id', newTab.noteId);
            window.history.replaceState({}, '', url);

            // Update global noteId
            if (window.updateCurrentNoteId) {
                window.updateCurrentNoteId(newTab.noteId);
            }

            // Load content
            this.quillEditor.enable(false);
            this.quillEditor.setText('');

            if (note && note.content) {
                try {
                    if (this.quillEditor.clipboard && this.quillEditor.clipboard.dangerouslyPasteHTML) {
                        this.quillEditor.clipboard.dangerouslyPasteHTML(0, note.content, 'silent');
                    } else {
                        // Fallback to root.innerHTML
                        this.quillEditor.root.innerHTML = note.content;
                    }
                } catch (error) {
                    console.error('[Tabs] Error loading content:', error);
                    // Fallback to root.innerHTML
                    this.quillEditor.root.innerHTML = note.content;
                }
            }

            setTimeout(() => {
                this.quillEditor.enable(true);
            }, 50);

            // Update tab title from content
            const title = this.extractTitle(note?.content) || 'Note';
            newTab.title = title;
            this.updateTabTitle(tabId, title);

            // Load note properties (color, background, etc.)
            if (window.loadNoteProperties) {
                await window.loadNoteProperties(note);
            }

            // Update tab bar background color to match current note
            if (note && note.color) {
                this.tabBar.style.setProperty('--note-accent-color', note.color);
                // Update current tab's color in cache
                newTab.color = note.color;
                // Update tab element's color
                const currentTabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                if (currentTabElement) {
                    currentTabElement.style.setProperty('--tab-note-color', note.color);
                }
            }

            // Update active state - keep all tabs with their colors
            document.querySelectorAll('.note-tab').forEach(el => el.classList.remove('active'));
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                tabElement.classList.add('active');
                tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }

            await this.saveTabs();
        }
    }

    updateTabTitle(tabId, newTitle) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.title = newTitle;
        }

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            const titleElement = tabElement.querySelector('.tab-title');
            if (titleElement) {
                titleElement.textContent = newTitle;
            }
        }
    }

    async closeTab(tabId, deleteNote = false) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        // Only delete note from database if explicitly requested
        if (deleteNote) {
            await chrome.runtime.sendMessage({
                action: "deleteNote",
                noteId: tab.noteId
            });
        }

        // If only one tab, close window
        if (this.tabs.length === 1) {
            window.close();
            return;
        }

        const tabIndex = this.tabs.findIndex(t => t.id === tabId);
        this.tabs.splice(tabIndex, 1);

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.style.transition = 'all 0.2s ease';
            tabElement.style.opacity = '0';
            tabElement.style.transform = 'scale(0.8)';
            setTimeout(() => tabElement.remove(), 200);
        }

        if (this.activeTabId === tabId) {
            const newActiveTab = this.tabs[Math.max(0, tabIndex - 1)];
            if (newActiveTab) {
                await this.switchTab(newActiveTab.id);
            }
        }

        // Hide tab bar if only one tab left
        if (this.tabs.length === 1) {
            this.tabBar.style.display = 'none';
            this.updateMenuButtonVisibility();
        }

        this.updateTabCounter();
        await this.saveTabs();
    }

    async removeTab(tabId) {
        // Remove tab without deleting the note (used for detaching tabs)
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        console.log('[Tabs] Removing tab', tabId, 'without deleting note', tab.noteId);

        // If only one tab, close window
        if (this.tabs.length === 1) {
            window.close();
            return;
        }

        const tabIndex = this.tabs.findIndex(t => t.id === tabId);
        this.tabs.splice(tabIndex, 1);

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.style.transition = 'all 0.2s ease';
            tabElement.style.opacity = '0';
            tabElement.style.transform = 'scale(0.8)';
            setTimeout(() => tabElement.remove(), 200);
        }

        if (this.activeTabId === tabId) {
            const newActiveTab = this.tabs[Math.max(0, tabIndex - 1)];
            if (newActiveTab) {
                await this.switchTab(newActiveTab.id);
            }
        }

        // Hide tab bar if only one tab left
        if (this.tabs.length === 1) {
            this.tabBar.style.display = 'none';
            this.updateMenuButtonVisibility();
        }

        this.updateTabCounter();
        await this.saveTabs();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showTabContextMenu(e, tabId) {
        const existingMenu = document.querySelector('.tab-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'tab-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        const isOnlyTab = this.tabs.length === 1;

        menu.innerHTML = `
            <div class="tab-context-item" data-action="close">Close Tab</div>
            <div class="tab-context-item ${isOnlyTab ? 'disabled' : ''}" data-action="close-others">Close Other Tabs</div>
            <div class="tab-context-item ${isOnlyTab ? 'disabled' : ''}" data-action="close-all">Close All Tabs</div>
            <div class="tab-context-divider"></div>
            <div class="tab-context-item" data-action="rename">Rename Tab</div>
            <div class="tab-context-divider"></div>
            <div class="tab-context-item tab-context-danger" data-action="delete">Delete Note</div>
        `;

        document.body.appendChild(menu);

        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.tab-context-item');
            if (!item || item.classList.contains('disabled')) return;

            const action = item.dataset.action;
            switch (action) {
                case 'close':
                    await this.closeTab(tabId, false); // Close tab only, don't delete note
                    break;
                case 'close-others':
                    await this.closeOtherTabs(tabId);
                    break;
                case 'close-all':
                    await this.closeAllTabs();
                    break;
                case 'rename':
                    this.renameTab(tabId);
                    break;
                case 'delete':
                    await this.deleteNote(tabId); // Delete note and close tab
                    break;
            }
            menu.remove();
        });

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    async closeOtherTabs(keepTabId) {
        // Save current tab immediately before closing others
        if (this.activeTabId !== null && this.activeTabId === keepTabId) {
            if (window.saveNoteImmediately) {
                await window.saveNoteImmediately();
            }
        }

        const tabsToClose = this.tabs.filter(t => t.id !== keepTabId);
        for (const tab of tabsToClose) {
            // Just close tabs, don't delete notes
            const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
            if (tabElement) {
                tabElement.style.transition = 'all 0.2s ease';
                tabElement.style.opacity = '0';
                tabElement.style.transform = 'scale(0.8)';
            }
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        this.tabs = this.tabs.filter(t => t.id === keepTabId);
        this.tabList.innerHTML = '';
        await this.renderTab(this.tabs[0]);
        await this.switchTab(keepTabId);

        // Hide tab bar when only one tab left
        if (this.tabs.length === 1) {
            this.tabBar.style.display = 'none';
            this.updateMenuButtonVisibility();
        }

        this.updateTabCounter();
        await this.saveTabs();
    }

    async closeAllTabs() {
        // Just close window, don't delete notes
        window.close();
    }

    async deleteNote(tabId) {
        // Delete note from database and close tab
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        // Confirm deletion
        const confirmed = confirm(`Delete note "${tab.title}"? This action cannot be undone.`);
        if (!confirmed) return;

        // Delete note from database
        await chrome.runtime.sendMessage({
            action: "deleteNote",
            noteId: tab.noteId
        });

        // Close the tab
        await this.closeTab(tabId, false);
    }

    renameTab(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const titleElement = tabElement?.querySelector('.tab-title');
        if (!titleElement) return;

        const currentTitle = tab.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'tab-rename-input';
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            color: #e8eaed;
            padding: 2px 6px;
            font-size: 13px;
            width: 100%;
            outline: none;
        `;

        titleElement.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = async () => {
            const newTitle = input.value.trim() || currentTitle;
            tab.title = newTitle;

            const newTitleElement = document.createElement('span');
            newTitleElement.className = 'tab-title';
            newTitleElement.textContent = newTitle;
            input.replaceWith(newTitleElement);

            await this.saveTabs();
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishRename();
            } else if (e.key === 'Escape') {
                const titleElement = document.createElement('span');
                titleElement.className = 'tab-title';
                titleElement.textContent = currentTitle;
                input.replaceWith(titleElement);
            }
        });
    }

    // Auto-update tab title when content changes
    autoUpdateTabTitle() {
        if (this.activeTabId !== null && this.quillEditor) {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (currentTab) {
                const text = this.quillEditor.getText().trim();
                if (text) {
                    const firstLine = text.split('\n')[0].substring(0, 20);
                    const newTitle = firstLine || 'Note';
                    if (newTitle !== currentTab.title) {
                        this.updateTabTitle(currentTab.id, newTitle);
                        this.saveTabs();
                    }
                }
            }
        }
    }

    getCurrentNoteId() {
        const currentTab = this.tabs.find(t => t.id === this.activeTabId);
        return currentTab ? currentTab.noteId : null;
    }

    // Update tab color when note color changes
    updateTabColor(noteId, newColor) {
        const tab = this.tabs.find(t => t.noteId === noteId);
        if (tab) {
            tab.color = newColor;
            const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
            if (tabElement) {
                tabElement.style.setProperty('--tab-note-color', newColor);
            }
            
            // If this is the active tab, update tab bar background too
            if (tab.id === this.activeTabId) {
                this.tabBar.style.setProperty('--note-accent-color', newColor);
            }
            
            this.saveTabs();
        }
    }

    updateMenuButtonVisibility() {
        if (!this.tabMenuBtn) return;

        const noteContainer = document.querySelector('.note-container');
        const topBar = document.querySelector('.top-bar');

        // Show menu button in tab bar only when tab bar is visible (multiple tabs)
        if (this.tabs.length > 1 && this.tabBar.style.display !== 'none') {
            this.tabMenuBtn.style.display = 'flex';
            // Force topbar to be visible (remove hidden class) before adding has-tab-bar
            if (topBar) {
                topBar.classList.remove('hidden');
            }
            // Add class to note container to lock topbar at 5px
            if (noteContainer) {
                noteContainer.classList.add('has-tab-bar');
            }
        } else {
            this.tabMenuBtn.style.display = 'none';
            // Remove class to show top-bar normally
            if (noteContainer) {
                noteContainer.classList.remove('has-tab-bar');
            }
        }
    }
}

window.NoteTabsManager = NoteTabsManager;

// Setup message listener for tab management from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!window.tabsManager) {
        sendResponse({ success: false, error: 'Tabs manager not initialized' });
        return false;
    }

    if (message.action === 'closeNoteTab') {
        // Close tab with specific noteId
        const tab = window.tabsManager.tabs.find(t => t.noteId === message.noteId);
        if (tab) {
            window.tabsManager.closeTab(tab.id).then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open for async response
        } else {
            sendResponse({ success: false, error: 'Tab not found' });
            return false;
        }
    } else if (message.action === 'hasNoteTab') {
        // Check if this window has a tab with specific noteId
        const hasTab = window.tabsManager.tabs.some(t => t.noteId === message.noteId);
        sendResponse({ success: true, hasTab: hasTab });
        return false; // Sync response
    } else if (message.action === 'switchToNoteTab') {
        // Switch to tab with specific noteId
        const tab = window.tabsManager.tabs.find(t => t.noteId === message.noteId);
        if (tab) {
            console.log('[Tabs] Switching to tab with noteId:', message.noteId);
            window.tabsManager.switchTab(tab.id).then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open for async response
        } else {
            sendResponse({ success: false, error: 'Tab not found' });
            return false;
        }
    }
    
    return false; // Default: don't keep channel open
});

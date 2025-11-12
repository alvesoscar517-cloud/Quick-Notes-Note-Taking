// Advanced Tab Drag & Drop System - Chrome-like behavior
// Supports: smooth reorder, drag out to new window, merge windows

class TabDragDropManager {
    constructor(tabsManager) {
        this.tabsManager = tabsManager;

        // Drag state
        this.draggedTab = null;
        this.draggedTabElement = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.currentX = 0;
        this.currentY = 0;

        // Drag modes
        this.dragMode = null; // null, 'reorder', 'detach'
        this.detachThreshold = 40; // pixels down to trigger detach

        // Reorder state
        this.placeholder = null;
        this.draggedIndex = -1;

        // Detach state
        this.ghostWindow = null;
        this.targetWindowId = null;
        this.mergeIndicator = null;

        // Throttling
        this.lastMoveTime = 0;
        this.moveThrottle = 16; // ~60fps
    }

    init() {
        this.setupDragListeners();
        this.setupWindowMergeListener();
        this.setupWindowDragDetection();
        console.log('[TabDrag] Initialized with window drag support');
    }

    setupDragListeners() {
        const tabList = this.tabsManager.tabList;
        let dragStartTimer = null;
        let potentialDragTab = null;
        let potentialDragEvent = null;

        // Use mousedown + hold to start drag (not double-click)
        tabList.addEventListener('mousedown', (e) => {
            const tabElement = e.target.closest('.note-tab');
            if (!tabElement || e.target.closest('.tab-close')) return;

            // Don't start drag if clicking on rename input
            if (e.target.classList.contains('tab-rename-input')) return;

            potentialDragTab = tabElement;
            potentialDragEvent = e;

            // Start drag after 200ms of holding
            dragStartTimer = setTimeout(() => {
                if (potentialDragTab && potentialDragEvent) {
                    console.log('[TabDrag] Hold detected, starting drag');
                    this.startDrag(potentialDragTab, potentialDragEvent);
                    potentialDragTab = null;
                    potentialDragEvent = null;
                }
            }, 200);
        });

        // Cancel drag start if mouse moves too much or releases quickly
        tabList.addEventListener('mousemove', (e) => {
            if (potentialDragTab && !this.draggedTab) {
                const deltaX = Math.abs(e.clientX - potentialDragEvent.clientX);
                const deltaY = Math.abs(e.clientY - potentialDragEvent.clientY);

                // If moved more than 5px, start drag immediately
                if (deltaX > 5 || deltaY > 5) {
                    clearTimeout(dragStartTimer);
                    console.log('[TabDrag] Movement detected, starting drag immediately');
                    this.startDrag(potentialDragTab, potentialDragEvent);
                    potentialDragTab = null;
                    potentialDragEvent = null;
                }
            }
        });

        tabList.addEventListener('mouseup', (e) => {
            // Cancel potential drag if released quickly
            if (dragStartTimer) {
                clearTimeout(dragStartTimer);
                dragStartTimer = null;
            }
            potentialDragTab = null;
            potentialDragEvent = null;
        });

        document.addEventListener('mousemove', (e) => {
            if (this.draggedTab) {
                this.onDrag(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.draggedTab) {
                this.endDrag(e);
            }
            // Always reset cursor on mouseup
            document.body.style.cursor = '';
            document.documentElement.style.cursor = '';
        });
    }

    startDrag(tabElement, e) {
        console.log('[TabDrag] startDrag called for tab:', tabElement.dataset.tabId);

        const tabId = parseInt(tabElement.dataset.tabId);
        const tab = this.tabsManager.tabs.find(t => t.id === tabId);
        if (!tab) {
            console.log('[TabDrag] Tab not found:', tabId);
            return;
        }

        this.draggedTabElement = tabElement;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.currentX = e.clientX;
        this.currentY = e.clientY;

        const rect = tabElement.getBoundingClientRect();
        this.draggedTab = {
            id: tabId,
            noteId: tabElement.dataset.noteId,
            element: tabElement,
            tab: tab,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: tabElement.offsetWidth,
            height: tabElement.offsetHeight
        };

        this.draggedIndex = this.tabsManager.tabs.findIndex(t => t.id === tabId);

        tabElement.classList.add('dragging');
        tabElement.style.cursor = 'grabbing';

        console.log('[TabDrag] ✓ Drag started successfully for tab:', tabId);
        console.log('[TabDrag] Now move mouse to drag');
    }



    onDrag(e) {
        if (!this.draggedTab) return;

        // Throttle for performance
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveThrottle) return;
        this.lastMoveTime = now;

        this.currentX = e.clientX;
        this.currentY = e.clientY;

        const deltaX = this.currentX - this.dragStartX;
        const deltaY = this.currentY - this.dragStartY;

        // Check if cursor is outside tab bar area (for detach)
        const tabBarRect = this.tabsManager.tabBar.getBoundingClientRect();
        const isOutsideTabBar = e.clientY < tabBarRect.top - 20 ||
            e.clientY > tabBarRect.bottom + 20 ||
            e.clientX < tabBarRect.left - 50 ||
            e.clientX > tabBarRect.right + 50;

        // Don't allow detach if only one tab
        const canDetach = this.tabsManager.tabs.length > 1;

        // Determine drag mode
        if (!this.dragMode) {
            if (canDetach && (Math.abs(deltaY) > this.detachThreshold || isOutsideTabBar)) {
                this.enterDetachMode();
            } else if (Math.abs(deltaX) > 5) {
                this.enterReorderMode();
            }
        } else if (this.dragMode === 'detach' && !isOutsideTabBar && Math.abs(deltaY) < this.detachThreshold / 2) {
            // Allow switching back to reorder if dragged back to tab bar
            this.switchToReorderMode();
        }

        // Handle based on mode
        if (this.dragMode === 'reorder') {
            this.handleReorderDrag(e);
        } else if (this.dragMode === 'detach') {
            this.handleDetachDrag(e);
        }
    }

    enterReorderMode() {
        this.dragMode = 'reorder';
        this.draggedTabElement.classList.add('dragging', 'reorder-mode');

        // Create placeholder
        this.placeholder = document.createElement('div');
        this.placeholder.className = 'tab-placeholder';
        this.placeholder.style.width = this.draggedTab.width + 'px';
        this.placeholder.style.height = this.draggedTab.height + 'px';

        // Make tab follow cursor
        this.draggedTabElement.style.position = 'fixed';
        this.draggedTabElement.style.zIndex = '10000';
        this.draggedTabElement.style.pointerEvents = 'none';

        console.log('[TabDrag] Entered reorder mode');
    }

    enterDetachMode() {
        // Don't allow detach if only one tab
        if (this.tabsManager.tabs.length === 1) {
            console.log('[TabDrag] Cannot detach - only one tab');
            return;
        }

        this.dragMode = 'detach';
        this.draggedTabElement.classList.add('dragging', 'detach-mode');
        this.draggedTabElement.classList.remove('reorder-mode');
        this.draggedTabElement.style.opacity = '0.5';

        // Remove placeholder if exists
        if (this.placeholder && this.placeholder.parentNode) {
            this.placeholder.remove();
            this.placeholder = null;
        }

        // Create ghost window
        this.createGhostWindow();

        console.log('[TabDrag] Entered detach mode');
    }

    switchToReorderMode() {
        console.log('[TabDrag] Switching back to reorder mode');

        // Remove detach mode elements
        if (this.ghostWindow) {
            this.ghostWindow.remove();
            this.ghostWindow = null;
        }

        this.hideMergeIndicator();
        this.targetWindowId = null;

        // Switch to reorder mode
        this.dragMode = 'reorder';
        this.draggedTabElement.classList.remove('detach-mode');
        this.draggedTabElement.classList.add('reorder-mode');
        this.draggedTabElement.style.opacity = '1';

        // Create placeholder
        if (!this.placeholder) {
            this.placeholder = document.createElement('div');
            this.placeholder.className = 'tab-placeholder';
            this.placeholder.style.width = this.draggedTab.width + 'px';
            this.placeholder.style.height = this.draggedTab.height + 'px';
        }

        // Make tab follow cursor
        this.draggedTabElement.style.position = 'fixed';
        this.draggedTabElement.style.zIndex = '10000';
        this.draggedTabElement.style.pointerEvents = 'none';
    }

    handleReorderDrag(e) {
        // Move tab with cursor (horizontal only)
        const tabBarRect = this.tabsManager.tabList.getBoundingClientRect();
        const x = Math.max(tabBarRect.left, Math.min(e.clientX - this.draggedTab.offsetX, tabBarRect.right - this.draggedTab.width));

        this.draggedTabElement.style.left = x + 'px';
        this.draggedTabElement.style.top = tabBarRect.top + 'px';

        // Update placeholder position
        this.updatePlaceholderPosition(e);
    }

    updatePlaceholderPosition(e) {
        const tabList = this.tabsManager.tabList;
        const tabs = Array.from(tabList.querySelectorAll('.note-tab:not(.dragging)'));

        let insertIndex = tabs.length;

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const rect = tab.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;

            if (e.clientX < midpoint) {
                insertIndex = i;
                break;
            }
        }

        // Insert placeholder
        if (insertIndex < tabs.length) {
            tabList.insertBefore(this.placeholder, tabs[insertIndex]);
        } else {
            tabList.appendChild(this.placeholder);
        }
    }

    handleDetachDrag(e) {
        // Update ghost window position
        if (this.ghostWindow) {
            const width = 400;
            const height = 300;
            this.ghostWindow.style.left = (e.clientX - width / 2) + 'px';
            this.ghostWindow.style.top = (e.clientY - 30) + 'px';

            // Add visual feedback based on distance from tab bar
            const tabBarRect = this.tabsManager.tabBar.getBoundingClientRect();
            const isReallyOutside = e.clientY < tabBarRect.top - 20 ||
                e.clientY > tabBarRect.bottom + 50 ||
                e.clientX < tabBarRect.left - 50 ||
                e.clientX > tabBarRect.right + 50;

            // Visual feedback: scale up and make more opaque when ready to create window
            if (isReallyOutside && !this.targetWindowId) {
                this.ghostWindow.style.opacity = '1';
                this.ghostWindow.style.transform = 'scale(1)';
                this.ghostWindow.classList.add('ready-to-create');
            } else {
                this.ghostWindow.style.opacity = '0.6';
                this.ghostWindow.style.transform = 'scale(0.95)';
                this.ghostWindow.classList.remove('ready-to-create');
            }
        }

        // Check for window merge
        this.checkWindowMerge(e);
    }

    createGhostWindow() {
        this.ghostWindow = document.createElement('div');
        this.ghostWindow.className = 'ghost-window';

        const title = this.draggedTab.tab.title || 'Note';
        const escapedTitle = this.escapeHtml(title);

        this.ghostWindow.innerHTML = `
            <div class="ghost-window-header">
                <div class="ghost-window-tab">${escapedTitle}</div>
            </div>
            <div class="ghost-window-body">
                <div class="ghost-window-preview">📝</div>
            </div>
            <div class="ghost-window-create-hint">↓ ${chrome.i18n.getMessage('dragDropCreateWindow') || 'Drop to create new window'}</div>
            <div class="ghost-window-merge-hint">${chrome.i18n.getMessage('dragDropMergeWindow') || 'Drop to merge windows'}</div>
        `;

        document.body.appendChild(this.ghostWindow);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async checkWindowMerge(e) {
        try {
            const windows = await chrome.windows.getAll({ populate: true });
            const currentWindowId = this.tabsManager.windowId;

            let foundTarget = false;

            for (const win of windows) {
                if (win.id === currentWindowId) continue;

                // Check if it's a note window
                const isNoteWindow = win.tabs.some(tab =>
                    tab.url && tab.url.includes('note.html')
                );

                if (!isNoteWindow) continue;

                // Check if cursor is over this window
                const isOver = this.isCursorOverWindow(e, win);

                if (isOver) {
                    foundTarget = true;
                    if (this.targetWindowId !== win.id) {
                        this.targetWindowId = win.id;
                        this.showMergeIndicator(win);
                    }
                    break;
                }
            }

            if (!foundTarget && this.targetWindowId) {
                this.hideMergeIndicator();
                this.targetWindowId = null;
            }
        } catch (error) {
            console.error('[TabDrag] Error checking window merge:', error);
        }
    }

    isCursorOverWindow(e, windowInfo) {
        const { left, top, width, height } = windowInfo;
        return e.screenX >= left &&
            e.screenX <= left + width &&
            e.screenY >= top &&
            e.screenY <= top + height;
    }

    showMergeIndicator(targetWindow) {
        if (this.ghostWindow) {
            this.ghostWindow.classList.add('merge-ready');
            this.ghostWindow.classList.remove('ready-to-create');
        }

        // Send message to target window to show indicator
        const targetTab = targetWindow.tabs.find(tab =>
            tab.url && tab.url.includes('note.html')
        );

        if (targetTab) {
            chrome.tabs.sendMessage(targetTab.id, {
                action: 'showMergeIndicator'
            }).catch(() => { });
        }

        console.log('[TabDrag] Showing merge indicator for window:', targetWindow.id);
    }

    hideMergeIndicator() {
        if (this.ghostWindow) {
            this.ghostWindow.classList.remove('merge-ready');
        }

        // Send message to all windows to hide indicator
        chrome.windows.getAll({ populate: true }).then(windows => {
            windows.forEach(win => {
                const noteTab = win.tabs.find(tab =>
                    tab.url && tab.url.includes('note.html')
                );
                if (noteTab) {
                    chrome.tabs.sendMessage(noteTab.id, {
                        action: 'hideMergeIndicator'
                    }).catch(() => { });
                }
            });
        });
    }

    async endDrag(e) {
        if (!this.draggedTab) return;

        console.log('[TabDrag] Ending drag, mode:', this.dragMode);

        if (this.dragMode === 'reorder') {
            await this.finishReorder();
        } else if (this.dragMode === 'detach') {
            await this.finishDetach(e);
        }

        this.cleanup();
    }

    async finishReorder() {
        if (!this.placeholder || !this.placeholder.parentNode) {
            console.log('[TabDrag] No placeholder, aborting reorder');
            return;
        }

        const tabList = this.tabsManager.tabList;
        const placeholderIndex = Array.from(tabList.children).indexOf(this.placeholder);

        // Calculate new index (accounting for placeholder)
        let newIndex = placeholderIndex;
        if (placeholderIndex > this.draggedIndex) {
            newIndex--;
        }

        if (newIndex !== this.draggedIndex) {
            // Reorder tabs array
            const [movedTab] = this.tabsManager.tabs.splice(this.draggedIndex, 1);
            this.tabsManager.tabs.splice(newIndex, 0, movedTab);

            // Re-render all tabs
            tabList.innerHTML = '';
            for (const tab of this.tabsManager.tabs) {
                await this.tabsManager.renderTab(tab);
            }

            // Restore active state
            const activeTabElement = tabList.querySelector(`[data-tab-id="${this.tabsManager.activeTabId}"]`);
            if (activeTabElement) {
                activeTabElement.classList.add('active');
            }

            // Save new order
            await this.tabsManager.saveTabs();

            console.log('[TabDrag] Reordered tabs, new index:', newIndex);
        }
    }

    async finishDetach(e) {
        const tabId = this.draggedTab.id;
        const noteId = this.draggedTab.noteId;

        // Check if cursor is still far from tab bar (confirm detach intent)
        const tabBarRect = this.tabsManager.tabBar.getBoundingClientRect();
        const isReallyOutside = e.clientY < tabBarRect.top - 20 ||
            e.clientY > tabBarRect.bottom + 50 ||
            e.clientX < tabBarRect.left - 50 ||
            e.clientX > tabBarRect.right + 50;

        // Check if merging into another window
        if (this.targetWindowId) {
            await this.mergeIntoWindow(tabId, noteId, this.targetWindowId);
        } else if (isReallyOutside) {
            // Only create new window if really dragged outside
            await this.createNewWindow(tabId, noteId, e);
        } else {
            // Dragged back to tab bar area, cancel detach
            console.log('[TabDrag] Detach cancelled - dropped near tab bar');
        }
    }

    async createNewWindow(tabId, noteId, e) {
        console.log('[TabDrag] Creating new window for tab:', tabId);
        console.log('[TabDrag] Current tabs count:', this.tabsManager.tabs.length);

        try {
            // Get current window size to match it
            const currentWindow = await chrome.windows.getCurrent();
            const width = currentWindow.width || 800;
            const height = currentWindow.height || 600;

            // Calculate position
            let left = Math.round(e.screenX - width / 2);
            let top = Math.round(e.screenY - 50);

            // Ensure position is on screen
            if (left < 0) left = 50;
            if (top < 0) top = 50;

            console.log('[TabDrag] Creating window at:', left, top, 'size:', width, 'x', height);

            // Create new window at cursor position with same size as current window
            const newWindow = await chrome.windows.create({
                url: `note/note.html?id=${noteId}`,
                type: 'popup',
                width: width,
                height: height,
                left: left,
                top: top
            });

            console.log('[TabDrag] ✓ Created new window:', newWindow.id);

            // CRITICAL: Wait for new window to fully load before removing tab
            // This prevents race conditions and ensures the new window is stable
            await new Promise(resolve => setTimeout(resolve, 800));

            console.log('[TabDrag] New window loaded, now removing tab from source');

            // Remove tab from current window (without deleting the note)
            // If this is the last tab, the source window will close automatically
            await this.tabsManager.removeTab(tabId);

            console.log('[TabDrag] ✓ Tab detached successfully');

        } catch (error) {
            console.error('[TabDrag] ✗ Error creating new window:', error);
        }
    }

    async mergeIntoWindow(tabId, noteId, targetWindowId) {
        console.log('[TabDrag] Merging tab into window:', targetWindowId);

        try {
            const windows = await chrome.windows.getAll({ populate: true });
            const targetWindow = windows.find(w => w.id === targetWindowId);

            if (!targetWindow) return;

            const targetTab = targetWindow.tabs.find(tab =>
                tab.url && tab.url.includes('note.html')
            );

            if (targetTab) {
                // Get tab data
                const tabData = this.tabsManager.tabs.find(t => t.id === tabId);

                // Send message to target window
                await chrome.tabs.sendMessage(targetTab.id, {
                    action: 'addTabFromDrop',
                    noteId: noteId,
                    tabData: tabData
                });

                // Remove from current window (without deleting the note)
                await this.tabsManager.removeTab(tabId);

                // Focus target window
                await chrome.windows.update(targetWindowId, { focused: true });

                console.log('[TabDrag] Successfully merged tab');
            }
        } catch (error) {
            console.error('[TabDrag] Error merging windows:', error);
        }
    }

    cleanup() {
        // Remove classes
        if (this.draggedTabElement) {
            this.draggedTabElement.classList.remove('dragging', 'reorder-mode', 'detach-mode');
            this.draggedTabElement.style.position = '';
            this.draggedTabElement.style.left = '';
            this.draggedTabElement.style.top = '';
            this.draggedTabElement.style.zIndex = '';
            this.draggedTabElement.style.opacity = '';
            this.draggedTabElement.style.pointerEvents = '';
            this.draggedTabElement.style.cursor = '';
        }

        // Reset cursor on body and document
        document.body.style.cursor = '';
        document.documentElement.style.cursor = '';

        // Remove placeholder
        if (this.placeholder && this.placeholder.parentNode) {
            this.placeholder.remove();
        }

        // Remove ghost window
        if (this.ghostWindow) {
            this.ghostWindow.remove();
        }

        // Hide merge indicators
        this.hideMergeIndicator();

        // Reset state
        this.draggedTab = null;
        this.draggedTabElement = null;
        this.placeholder = null;
        this.ghostWindow = null;
        this.dragMode = null;
        this.targetWindowId = null;
        this.draggedIndex = -1;
    }

    setupWindowMergeListener() {
        // Listen for messages from other windows
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'addTabFromDrop') {
                this.handleIncomingTab(message.noteId, message.tabData);
                sendResponse({ success: true });
                return true;
            } else if (message.action === 'showMergeIndicator') {
                this.showLocalMergeIndicator();
                sendResponse({ success: true });
            } else if (message.action === 'hideMergeIndicator') {
                this.hideLocalMergeIndicator();
                sendResponse({ success: true });
            } else if (message.action === 'showWindowMergeTarget') {
                this.showLocalWindowMergeTarget();
                sendResponse({ success: true });
            } else if (message.action === 'hideWindowMergeTarget') {
                this.hideLocalWindowMergeTarget();
                sendResponse({ success: true });
            } else if (message.action === 'mergeAllTabs') {
                this.handleIncomingAllTabs(message.tabs);
                sendResponse({ success: true });
                return true;
            }
        });
    }

    showLocalMergeIndicator() {
        if (!this.mergeIndicator) {
            this.mergeIndicator = document.createElement('div');
            this.mergeIndicator.className = 'window-merge-indicator';
            this.mergeIndicator.innerHTML = `
                <div class="window-merge-indicator-text">📝 ${chrome.i18n.getMessage('dragDropMergeHere') || 'Drop tab here to merge'}</div>
            `;
            document.body.appendChild(this.mergeIndicator);
        }
        this.mergeIndicator.style.display = 'block';
    }

    hideLocalMergeIndicator() {
        if (this.mergeIndicator) {
            this.mergeIndicator.style.display = 'none';
        }
    }

    async handleIncomingTab(noteId, tabData) {
        console.log('[TabDrag] Receiving tab from another window:', noteId);

        // Add tab to current window
        const tabId = this.tabsManager.tabCounter++;
        const newTab = {
            id: tabId,
            noteId: noteId,
            title: tabData.title || 'Note',
            created: Date.now()
        };

        this.tabsManager.tabs.push(newTab);

        // Show tab bar if hidden
        if (this.tabsManager.tabs.length > 1) {
            this.tabsManager.tabBar.style.display = 'flex';
            this.tabsManager.updateMenuButtonVisibility();
        }

        await this.tabsManager.renderTab(newTab);
        await this.tabsManager.switchTab(tabId);
        this.tabsManager.updateTabCounter();
        await this.tabsManager.saveTabs();
    }

    async handleIncomingAllTabs(tabs) {
        console.log('[WindowDrag] Receiving', tabs.length, 'tabs from another window');
        console.log('[WindowDrag] Current tabs before merge:', this.tabsManager.tabs.length);
        console.log('[WindowDrag] Current tab IDs:', this.tabsManager.tabs.map(t => `${t.id}:${t.noteId}`));
        console.log('[WindowDrag] Incoming tab noteIds:', tabs.map(t => t.noteId));

        // Hide merge indicator immediately
        this.hideLocalWindowMergeTarget();

        // Add all tabs to current window (skip duplicates by noteId)
        let addedCount = 0;
        for (const tabData of tabs) {
            // Check if noteId already exists
            const exists = this.tabsManager.tabs.some(t => t.noteId === tabData.noteId);
            if (exists) {
                console.log('[WindowDrag] Skipping duplicate noteId:', tabData.noteId);
                continue;
            }

            const tabId = this.tabsManager.tabCounter++;
            const newTab = {
                id: tabId,
                noteId: tabData.noteId,
                title: tabData.title || 'Note',
                created: tabData.created || Date.now()
            };

            this.tabsManager.tabs.push(newTab);
            await this.tabsManager.renderTab(newTab);
            addedCount++;
        }

        console.log('[WindowDrag] Added', addedCount, 'new tabs');
        console.log('[WindowDrag] Total tabs after merge:', this.tabsManager.tabs.length);

        // Show tab bar
        if (this.tabsManager.tabs.length > 1) {
            this.tabsManager.tabBar.style.display = 'flex';
            this.tabsManager.updateMenuButtonVisibility();
        }

        // Switch to first new tab
        if (addedCount > 0) {
            const firstNewTab = this.tabsManager.tabs[this.tabsManager.tabs.length - addedCount];
            if (firstNewTab) {
                await this.tabsManager.switchTab(firstNewTab.id);
            }
        }

        this.tabsManager.updateTabCounter();
        await this.tabsManager.saveTabs();

        console.log('[WindowDrag] Successfully added all tabs');
    }

    showLocalWindowMergeTarget() {
        if (!this.windowMergeTargetIndicator) {
            this.windowMergeTargetIndicator = document.createElement('div');
            this.windowMergeTargetIndicator.className = 'window-merge-target-indicator';
            document.body.appendChild(this.windowMergeTargetIndicator);
        }
        this.windowMergeTargetIndicator.style.display = 'block';
    }

    hideLocalWindowMergeTarget() {
        if (this.windowMergeTargetIndicator) {
            this.windowMergeTargetIndicator.remove();
            this.windowMergeTargetIndicator = null;
        }
    }

    // ========== WINDOW-TO-WINDOW DRAG & DROP ==========

    setupWindowDragDetection() {
        // Monitor window position to detect dragging
        let lastWindowBounds = null;
        let isDragging = false;
        let dragCheckInterval = null;

        const checkWindowPosition = async () => {
            try {
                const currentWindow = await chrome.windows.getCurrent();

                if (!lastWindowBounds) {
                    lastWindowBounds = {
                        left: currentWindow.left,
                        top: currentWindow.top,
                        state: currentWindow.state
                    };
                    return;
                }

                // Ignore if window is maximized or minimized
                if (currentWindow.state !== 'normal') {
                    isDragging = false;
                    this.hideWindowDragIndicator();
                    lastWindowBounds = {
                        left: currentWindow.left,
                        top: currentWindow.top,
                        state: currentWindow.state
                    };
                    return;
                }

                // Check if window moved
                const moved = currentWindow.left !== lastWindowBounds.left ||
                    currentWindow.top !== lastWindowBounds.top;

                if (moved && !isDragging) {
                    // Window started moving
                    isDragging = true;
                    this.onWindowDragStart(currentWindow);
                } else if (moved && isDragging) {
                    // Window is moving
                    await this.onWindowDrag(currentWindow);
                } else if (!moved && isDragging) {
                    // Window stopped moving
                    isDragging = false;
                    await this.onWindowDragEnd(currentWindow);
                }

                lastWindowBounds = {
                    left: currentWindow.left,
                    top: currentWindow.top,
                    state: currentWindow.state
                };
            } catch (error) {
                // Window might be closed
                if (dragCheckInterval) {
                    clearInterval(dragCheckInterval);
                }
            }
        };

        // Check every 100ms
        dragCheckInterval = setInterval(checkWindowPosition, 100);

        // Cleanup
        window.addEventListener('beforeunload', () => {
            if (dragCheckInterval) {
                clearInterval(dragCheckInterval);
            }
        });

        console.log('[WindowDrag] Window drag detection enabled');
    }

    onWindowDragStart(currentWindow) {
        console.log('[WindowDrag] Window drag started');
        // No indicator needed - user knows they're dragging
    }

    async onWindowDrag(currentWindow) {
        // Check if window overlaps with another note window
        try {
            const windows = await chrome.windows.getAll({ populate: true });

            let foundTarget = false;

            for (const win of windows) {
                if (win.id === currentWindow.id) continue;
                if (win.state !== 'normal') continue;

                // Check if it's a note window
                const isNoteWindow = win.tabs.some(tab =>
                    tab.url && tab.url.includes('note.html')
                );

                if (!isNoteWindow) continue;

                // Check if windows overlap significantly
                const overlaps = this.checkWindowOverlap(currentWindow, win);

                if (overlaps) {
                    foundTarget = true;
                    if (this.targetWindowId !== win.id) {
                        this.targetWindowId = win.id;
                        await this.showWindowMergeTarget(win);
                    }
                    break;
                }
            }

            if (!foundTarget && this.targetWindowId) {
                await this.hideWindowMergeTarget();
                this.targetWindowId = null;
            }
        } catch (error) {
            console.error('[WindowDrag] Error checking overlap:', error);
        }
    }

    async onWindowDragEnd(currentWindow) {
        console.log('[WindowDrag] Window drag ended, target:', this.targetWindowId);

        this.hideWindowDragIndicator();

        // If over target window, merge all tabs
        if (this.targetWindowId) {
            await this.mergeAllTabsIntoWindow(currentWindow.id, this.targetWindowId);
            await this.hideWindowMergeTarget();
            this.targetWindowId = null;
        }
    }

    checkWindowOverlap(window1, window2) {
        // Calculate window bounds
        const w1 = {
            left: window1.left,
            right: window1.left + window1.width,
            top: window1.top,
            bottom: window1.top + window1.height
        };

        const w2 = {
            left: window2.left,
            right: window2.left + window2.width,
            top: window2.top,
            bottom: window2.top + window2.height
        };

        // Calculate overlap
        const overlapLeft = Math.max(w1.left, w2.left);
        const overlapRight = Math.min(w1.right, w2.right);
        const overlapTop = Math.max(w1.top, w2.top);
        const overlapBottom = Math.min(w1.bottom, w2.bottom);

        if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
            const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
            const window1Area = window1.width * window1.height;
            const overlapPercentage = overlapArea / window1Area;

            // 40% overlap threshold
            return overlapPercentage > 0.4;
        }

        return false;
    }

    showWindowDragIndicator() {
        if (!this.windowDragIndicator) {
            this.windowDragIndicator = document.createElement('div');
            this.windowDragIndicator.className = 'window-drag-indicator';
            this.windowDragIndicator.innerHTML = `
                <div class="window-drag-message">
                    <div class="window-drag-icon">🪟</div>
                    <div class="window-drag-text">Kéo cửa sổ này vào cửa sổ note khác để gộp tất cả tabs</div>
                </div>
            `;
            document.body.appendChild(this.windowDragIndicator);
        }
    }

    hideWindowDragIndicator() {
        if (this.windowDragIndicator) {
            this.windowDragIndicator.remove();
            this.windowDragIndicator = null;
        }
    }

    async showWindowMergeTarget(targetWindow) {
        console.log('[WindowDrag] Showing merge target:', targetWindow.id);

        const targetTab = targetWindow.tabs.find(tab =>
            tab.url && tab.url.includes('note.html')
        );

        if (targetTab) {
            try {
                await chrome.tabs.sendMessage(targetTab.id, {
                    action: 'showWindowMergeTarget'
                });
            } catch (error) {
                // Ignore
            }
        }
    }

    async hideWindowMergeTarget() {
        try {
            const windows = await chrome.windows.getAll({ populate: true });

            for (const win of windows) {
                const noteTab = win.tabs.find(tab =>
                    tab.url && tab.url.includes('note.html')
                );

                if (noteTab) {
                    chrome.tabs.sendMessage(noteTab.id, {
                        action: 'hideWindowMergeTarget'
                    }).catch(() => { });
                }
            }
        } catch (error) {
            // Ignore
        }
    }

    async mergeAllTabsIntoWindow(sourceWindowId, targetWindowId) {
        console.log('[WindowDrag] Merging all tabs from window', sourceWindowId, 'into', targetWindowId);

        try {
            const windows = await chrome.windows.getAll({ populate: true });
            const targetWindow = windows.find(w => w.id === targetWindowId);

            if (!targetWindow) {
                console.error('[WindowDrag] Target window not found');
                return;
            }

            const targetTab = targetWindow.tabs.find(tab =>
                tab.url && tab.url.includes('note.html')
            );

            if (!targetTab) {
                console.error('[WindowDrag] Target tab not found');
                return;
            }

            // Get all tabs from source window
            const sourceTabs = this.tabsManager.tabs.map(tab => ({
                id: tab.id,
                noteId: tab.noteId,
                title: tab.title,
                created: tab.created
            }));

            console.log('[WindowDrag] Source window has', sourceTabs.length, 'tabs');
            console.log('[WindowDrag] Sending tabs to target window:', targetWindowId);

            // Send all tabs to target window
            await chrome.tabs.sendMessage(targetTab.id, {
                action: 'mergeAllTabs',
                tabs: sourceTabs
            });

            // Wait a bit for merge to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Close source window
            await chrome.windows.remove(sourceWindowId);

            // Focus target window
            await chrome.windows.update(targetWindowId, { focused: true });

            console.log('[WindowDrag] Successfully merged windows');
        } catch (error) {
            console.error('[WindowDrag] Error merging windows:', error);
        }
    }
}

// Export
window.TabDragDropManager = TabDragDropManager;

// Note Card Drag to Window System
// Allows dragging note cards from main app to note windows

class NoteCardDragToWindow {
    constructor() {
        this.draggedNoteId = null;
        this.ghostWindow = null;
        this.targetWindowId = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.draggedElement = null;
        this.checkInterval = null;
        this.lastMouseEvent = null;
        this.hasMoved = false;
        this.mouseDownTime = 0;
    }

    init() {
        this.setupDragListeners();
        this.disableNativeNoteDrag();
        console.log('[CardDrag] Note card to window drag initialized');
    }

    disableNativeNoteDrag() {
        // Don't disable draggable - let native drag work for collection drops
        // We'll use mousedown/mousemove to detect drag to window instead
        console.log('[CardDrag] Native drag enabled for collection compatibility');
    }

    setupDragListeners() {
        // Don't prevent native drag - it's needed for collection drops
        // We'll use custom mousedown/mousemove logic for drag to window

        // Mousedown to start tracking (only for drag to window, not collection)
        document.addEventListener('mousedown', (e) => {
            const noteTab = e.target.closest('.note-tab');
            if (!noteTab || !noteTab.dataset.noteId) return;
            
            // Don't interfere with selection checkbox or right click
            if (e.target.closest('.selection-checkbox') || e.button === 2) return;

            // Don't interfere if note is draggable (multi-select mode or collection drag)
            if (noteTab.draggable) return;

            // Don't prevent default - let native drag work
            // e.preventDefault();
            // e.stopPropagation();

            this.draggedElement = noteTab;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.hasMoved = false;
            this.mouseDownTime = Date.now();
        });

        // Mousemove to detect and handle drag
        document.addEventListener('mousemove', (e) => {
            this.lastMouseEvent = e;

            if (!this.draggedElement) return;

            // Don't handle if element is draggable (native drag is active)
            if (this.draggedElement.draggable) {
                this.draggedElement = null;
                return;
            }

            const deltaX = Math.abs(e.clientX - this.dragStartX);
            const deltaY = Math.abs(e.clientY - this.dragStartY);

            // Mark as moved if any movement detected
            if (deltaX > 2 || deltaY > 2) {
                this.hasMoved = true;
            }

            // Start drag if moved more than 10px
            if (!this.isDragging && (deltaX > 10 || deltaY > 10)) {
                this.startDrag(this.draggedElement, e);
            }

            if (this.isDragging && this.ghostWindow) {
                this.updateGhostPosition(e);
            }
        });

        // Prevent click when dragging or if mouse moved (only for custom drag)
        document.addEventListener('click', (e) => {
            const noteTab = e.target.closest('.note-tab');
            if (noteTab && !noteTab.draggable && (this.isDragging || this.hasMoved)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Reset flag after preventing click
                this.hasMoved = false;
                return false;
            }
        }, true);

        // Mouseup to end drag
        document.addEventListener('mouseup', async (e) => {
            const wasDragging = this.isDragging;
            const hadElement = this.draggedElement;

            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            // If element is draggable, don't handle (native drag is active)
            if (hadElement && hadElement.draggable) {
                this.draggedElement = null;
                this.hasMoved = false;
                return;
            }

            // If not dragging but had element, check if it was a click
            if (!wasDragging && hadElement && !this.hasMoved) {
                const clickDuration = Date.now() - this.mouseDownTime;
                // If quick click (< 200ms) and no movement, trigger note open
                if (clickDuration < 200 && !hadElement.draggable) {
                    const noteId = hadElement.dataset.noteId;
                    if (noteId) {
                        chrome.runtime.sendMessage({ action: "openNoteWindow", noteId: noteId });
                    }
                }
                this.draggedElement = null;
                this.hasMoved = false;
                return;
            }

            // If not dragging, just reset
            if (!wasDragging || !this.draggedNoteId) {
                this.draggedElement = null;
                this.hasMoved = false;
                return;
            }

            console.log('[CardDrag] Drag ended, target window:', this.targetWindowId);

            // Prevent click event after drag
            if (wasDragging) {
                this.hasMoved = true; // Ensure click is prevented
                setTimeout(() => {
                    this.isDragging = false;
                    this.hasMoved = false;
                }, 100);
            }

            // If dropped on a note window, add as tab
            if (this.targetWindowId) {
                await this.addNoteToWindow(this.draggedNoteId, this.targetWindowId);
            } else {
                // If dropped outside, create new window
                const mainAppWindow = await chrome.windows.getCurrent();
                const isOutsideMainApp = this.isOutsideWindow(e, mainAppWindow);
                
                if (isOutsideMainApp) {
                    await this.createNewNoteWindow(this.draggedNoteId, e);
                }
            }

            this.cleanup();
        });
    }

    startDrag(noteTab, e) {
        this.isDragging = true;
        this.draggedNoteId = noteTab.dataset.noteId;
        console.log('[CardDrag] Started dragging note:', this.draggedNoteId);

        // Create ghost preview
        this.createGhostPreview(noteTab);

        // Start checking for target windows periodically
        this.checkInterval = setInterval(() => {
            if (this.lastMouseEvent) {
                this.checkTargetWindow(this.lastMouseEvent);
            }
        }, 100);
    }

    createGhostPreview(noteTab) {
        this.ghostWindow = document.createElement('div');
        this.ghostWindow.className = 'note-card-ghost';
        
        const title = noteTab.querySelector('h3')?.textContent || 'Note';
        const preview = noteTab.querySelector('.note-preview')?.textContent || '';

        this.ghostWindow.innerHTML = `
            <div class="ghost-note-header">
                <h3>${this.escapeHtml(title)}</h3>
            </div>
            <div class="ghost-note-preview">${this.escapeHtml(preview)}</div>
        `;

        document.body.appendChild(this.ghostWindow);
    }

    updateGhostPosition(e) {
        if (!this.ghostWindow) return;

        const x = e.clientX + 10;
        const y = e.clientY + 10;

        this.ghostWindow.style.left = x + 'px';
        this.ghostWindow.style.top = y + 'px';
    }

    async checkTargetWindow(e) {
        try {
            const windows = await chrome.windows.getAll({ populate: true });
            let foundTarget = false;

            for (const win of windows) {
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
                        await this.showMergeIndicator(win);
                        
                        // Visual feedback - just scale up
                        if (this.ghostWindow) {
                            this.ghostWindow.style.opacity = '1';
                            this.ghostWindow.style.transform = 'scale(1)';
                        }
                    }
                    break;
                }
            }

            if (!foundTarget && this.targetWindowId) {
                await this.hideMergeIndicator();
                this.targetWindowId = null;
                
                // Reset visual feedback
                if (this.ghostWindow) {
                    this.ghostWindow.style.opacity = '0.9';
                    this.ghostWindow.style.transform = 'scale(0.95)';
                    this.ghostWindow.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }
            }
        } catch (error) {
            console.error('[CardDrag] Error checking target window:', error);
        }
    }

    isCursorOverWindow(e, windowInfo) {
        const { left, top, width, height } = windowInfo;
        return e.screenX >= left &&
            e.screenX <= left + width &&
            e.screenY >= top &&
            e.screenY <= top + height;
    }

    isOutsideWindow(e, windowInfo) {
        const { left, top, width, height } = windowInfo;
        const margin = 50;
        
        return e.screenX < left - margin ||
            e.screenX > left + width + margin ||
            e.screenY < top - margin ||
            e.screenY > top + height + margin;
    }

    async showMergeIndicator(targetWindow) {
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

    async hideMergeIndicator() {
        try {
            const windows = await chrome.windows.getAll({ populate: true });

            for (const win of windows) {
                const noteTab = win.tabs.find(tab =>
                    tab.url && tab.url.includes('note.html')
                );

                if (noteTab) {
                    chrome.tabs.sendMessage(noteTab.id, {
                        action: 'hideWindowMergeTarget'
                    }).catch(() => {});
                }
            }
        } catch (error) {
            // Ignore
        }
    }

    async addNoteToWindow(noteId, targetWindowId) {
        console.log('[CardDrag] Adding note', noteId, 'to window', targetWindowId);

        try {
            const windows = await chrome.windows.getAll({ populate: true });
            const targetWindow = windows.find(w => w.id === targetWindowId);

            if (!targetWindow) return;

            const targetTab = targetWindow.tabs.find(tab =>
                tab.url && tab.url.includes('note.html')
            );

            if (targetTab) {
                // Get note data
                const note = await dbManager.getNote(noteId);
                if (!note) return;

                const title = this.extractTitle(note.content) || 'Note';

                // Send message to target window to add tab
                await chrome.tabs.sendMessage(targetTab.id, {
                    action: 'addTabFromDrop',
                    noteId: noteId,
                    tabData: {
                        noteId: noteId,
                        title: title,
                        created: Date.now()
                    }
                });

                // Focus target window
                await chrome.windows.update(targetWindowId, { focused: true });

                console.log('[CardDrag] Successfully added note to window');
            }
        } catch (error) {
            console.error('[CardDrag] Error adding note to window:', error);
        }
    }

    async createNewNoteWindow(noteId, e) {
        console.log('[CardDrag] Creating new window for note:', noteId);

        try {
            // Use the same method as opening note normally (via background script)
            chrome.runtime.sendMessage({ 
                action: "openNoteWindow", 
                noteId: noteId 
            });

            console.log('[CardDrag] Opened note window for:', noteId);
        } catch (error) {
            console.error('[CardDrag] Error creating new window:', error);
        }
    }

    extractTitle(content) {
        if (!content) return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const text = tempDiv.textContent.trim();
        return text.split('\n')[0].substring(0, 20) || '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    cleanup() {
        if (this.ghostWindow) {
            this.ghostWindow.remove();
            this.ghostWindow = null;
        }

        this.hideMergeIndicator();
        this.draggedNoteId = null;
        this.targetWindowId = null;
        this.isDragging = false;
        this.draggedElement = null;
        this.lastMouseEvent = null;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.noteCardDragToWindow = new NoteCardDragToWindow();
        window.noteCardDragToWindow.init();
    });
} else {
    window.noteCardDragToWindow = new NoteCardDragToWindow();
    window.noteCardDragToWindow.init();
}

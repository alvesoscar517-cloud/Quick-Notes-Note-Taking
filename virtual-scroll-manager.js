// virtual-scroll-manager.js - Virtual Scrolling Implementation
// Version: 1.0 - Optimized for Quick Notes

class VirtualScrollManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemHeight: 96, // Height of each item (adjustable)
            bufferSize: 5, // Number of buffer items above and below
            threshold: 100, // Threshold to load more data
            ...options
        };
        
        this.data = [];
        this.visibleItems = [];
        this.startIndex = 0;
        this.endIndex = 0;
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.totalHeight = 0;
        this.isScrolling = false;
        
        this.init();
    }
    
    init() {
        this.setupContainer();
        this.setupScrollListener();
        this.setupResizeListener();
    }
    
    setupContainer() {
        // Create container for virtual scrolling
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';
        // Create viewport container
        this.viewport = document.createElement('div');
        this.viewport.style.position = 'relative';
        this.viewport.style.width = '100%';
        this.container.appendChild(this.viewport);
        // Create spacer to maintain scroll height
        this.spacer = document.createElement('div');
        this.spacer.style.position = 'absolute';
        this.spacer.style.top = '0';
        this.spacer.style.left = '0';
        this.spacer.style.width = '100%';
        this.spacer.style.pointerEvents = 'none';
        this.viewport.appendChild(this.spacer);
        // Create container for visible items
        this.itemsContainer = document.createElement('div');
        this.itemsContainer.style.position = 'relative';
        this.viewport.appendChild(this.itemsContainer);
    }
    
    setupScrollListener() {
        this.container.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    }
    
    setupResizeListener() {
        const resizeObserver = new ResizeObserver(() => {
            this.updateDimensions();
            this.updateVisibleItems();
        });
        resizeObserver.observe(this.container);
    }
    
    handleScroll() {
        if (this.isScrolling) return;
        
        this.isScrolling = true;
        requestAnimationFrame(() => {
            this.scrollTop = this.container.scrollTop;
            this.updateVisibleItems();
            this.isScrolling = false;
        });
    }
    
    updateDimensions() {
        this.containerHeight = this.container.clientHeight;
        this.totalHeight = this.data.length * this.options.itemHeight;
        this.spacer.style.height = `${this.totalHeight}px`;
    }
    
    updateVisibleItems() {
        if (this.data.length === 0) return;
        // Calculate range of items to display
        const visibleStart = Math.floor(this.scrollTop / this.options.itemHeight);
        const visibleEnd = Math.min(
            visibleStart + Math.ceil(this.containerHeight / this.options.itemHeight) + 1,
            this.data.length
        );
        
        // Add buffer
        const bufferStart = Math.max(0, visibleStart - this.options.bufferSize);
        const bufferEnd = Math.min(this.data.length, visibleEnd + this.options.bufferSize);
        
        // Only update if range changes
        if (bufferStart !== this.startIndex || bufferEnd !== this.endIndex) {
            this.startIndex = bufferStart;
            this.endIndex = bufferEnd;
            this.renderVisibleItems();
        }
        
        // Check if need to load more data
        this.checkLoadMore();
    }
    
    renderVisibleItems() {
        // Clear all current items
        this.itemsContainer.innerHTML = '';
        this.visibleItems = [];
        // Render items in range
        for (let i = this.startIndex; i < this.endIndex; i++) {
            const item = this.data[i];
            if (item) {
                const itemElement = this.createItemElement(item, i);
                this.itemsContainer.appendChild(itemElement);
                this.visibleItems.push(itemElement);
            }
        }
        
        // Update position of items container
        this.itemsContainer.style.transform = `translateY(${this.startIndex * this.options.itemHeight}px)`;
    }
    
    createItemElement(item, index) {
        const element = document.createElement('div');
        element.className = 'virtual-scroll-item';
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.left = '0';
        element.style.width = '100%';
        element.style.height = `${this.options.itemHeight}px`;
        element.style.transform = `translateY(${(index - this.startIndex) * this.options.itemHeight}px)`;
        
        // Call callback to render item content
        if (this.options.renderItem) {
            this.options.renderItem(element, item, index);
        }
        
        return element;
    }
    
    checkLoadMore() {
        // Check if scroll is near the end
        const scrollBottom = this.scrollTop + this.containerHeight;
        const threshold = this.totalHeight - this.options.threshold;
        
        if (scrollBottom >= threshold && this.options.onLoadMore) {
            this.options.onLoadMore();
        }
    }
    
    // Public methods
    setData(data) {
        this.data = data;
        this.updateDimensions();
        this.updateVisibleItems();
    }
    
    addItem(item) {
        this.data.push(item);
        this.updateDimensions();
        this.updateVisibleItems();
    }
    
    removeItem(index) {
        this.data.splice(index, 1);
        this.updateDimensions();
        this.updateVisibleItems();
    }
    
    updateItem(index, item) {
        if (this.data[index]) {
            this.data[index] = item;
            // Only re-render if item is visible
            if (index >= this.startIndex && index < this.endIndex) {
                const itemElement = this.itemsContainer.children[index - this.startIndex];
                if (itemElement && this.options.renderItem) {
                    this.options.renderItem(itemElement, item, index);
                }
            }
        }
    }
    
    scrollToIndex(index) {
        const scrollTop = index * this.options.itemHeight;
        this.container.scrollTop = scrollTop;
    }
    
    scrollToTop() {
        this.container.scrollTop = 0;
    }
    
    scrollToBottom() {
        this.container.scrollTop = this.totalHeight;
    }
    
    getVisibleRange() {
        return {
            start: this.startIndex,
            end: this.endIndex,
            total: this.data.length
        };
    }
    
    destroy() {
        this.container.removeEventListener('scroll', this.handleScroll);
        if (this.container.contains(this.viewport)) {
            this.container.removeChild(this.viewport);
        }
    }
}

// Utility functions for virtual scrolling
class VirtualScrollUtils {
    static createNoteItem(note, index) {
        const item = document.createElement('div');
        item.className = 'note-item virtual-note-item';
        item.style.height = '80px';
        item.style.padding = '12px';
        item.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        item.style.cursor = 'pointer';
        item.style.transition = 'all 0.2s ease';
        
        // Extract title and content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        
        const h1Element = tempDiv.querySelector('h1');
        const pElement = tempDiv.querySelector('p');
        
        let title, content;
        
        if (h1Element && pElement) {
            title = h1Element.textContent.trim() || 'Untitled';
            content = pElement.textContent.trim();
        } else {
            title = tempDiv.firstChild?.textContent.trim() || 'Untitled';
            content = tempDiv.textContent.trim();
        }
        
        // Truncate content for preview
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        
        item.innerHTML = `
            <div class="note-item-content">
                <div class="note-title">${title}</div>
                <div class="note-preview">${preview}</div>
                <div class="note-date">${this.formatDate(note.timestamp || note.lastModified)}</div>
            </div>
        `;
        
        // Add hover effects
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });
        
        return item;
    }
    
    static createSearchResultItem(note, index) {
        const item = document.createElement('div');
        item.className = 'search-result virtual-search-item';
        item.style.height = '100px';
        item.style.padding = '16px';
        item.style.marginBottom = '12px';
        item.style.borderRadius = '12px';
        item.style.cursor = 'pointer';
        item.style.transition = 'all 0.2s ease';
        item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        item.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        
        // Extract title and content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        
        const h1Element = tempDiv.querySelector('h1');
        const pElement = tempDiv.querySelector('p');
        
        let title, content;
        
        if (h1Element && pElement) {
            title = h1Element.textContent.trim() || 'Untitled';
            content = pElement.textContent.trim();
        } else {
            title = tempDiv.firstChild?.textContent.trim() || 'Untitled';
            content = tempDiv.textContent.trim();
        }
        
        // Truncate content for preview
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        
        item.innerHTML = `
            <div class="result-title">${title}</div>
            <div class="result-preview">${preview}</div>
            <div class="result-date">${this.formatDate(note.timestamp || note.lastModified)}</div>
        `;
        
        // Add hover effects
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            item.style.transform = 'translateY(-2px)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            item.style.transform = 'translateY(0)';
        });
        
        return item;
    }
    
    static formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
    
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VirtualScrollManager, VirtualScrollUtils };
}

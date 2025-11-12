// search-highlight-helper.js - Helper functions for search highlighting
// Provides smooth, animated highlighting for search results

class SearchHighlighter {
    constructor() {
        this.highlightClass = 'search-highlight';
        this.matchClass = 'highlight-match';
    }

    /**
     * Highlight search terms in an element
     * @param {HTMLElement} element - The element to highlight in
     * @param {string} searchTerm - The term to highlight
     */
    highlightText(element, searchTerm) {
        if (!searchTerm || !element) return;

        // Get all text nodes
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            // Skip if parent already has highlight
            if (!node.parentElement.classList.contains(this.highlightClass)) {
                textNodes.push(node);
            }
        }

        // Process each text node
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const lowerText = text.toLowerCase();
            const lowerSearch = searchTerm.toLowerCase();
            
            if (lowerText.includes(lowerSearch)) {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                let index = lowerText.indexOf(lowerSearch);

                while (index !== -1) {
                    // Add text before match
                    if (index > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(text.substring(lastIndex, index))
                        );
                    }

                    // Add highlighted match
                    const highlight = document.createElement('span');
                    highlight.className = this.highlightClass;
                    highlight.textContent = text.substring(index, index + searchTerm.length);
                    fragment.appendChild(highlight);

                    lastIndex = index + searchTerm.length;
                    index = lowerText.indexOf(lowerSearch, lastIndex);
                }

                // Add remaining text
                if (lastIndex < text.length) {
                    fragment.appendChild(
                        document.createTextNode(text.substring(lastIndex))
                    );
                }

                textNode.parentNode.replaceChild(fragment, textNode);
            }
        });
    }

    /**
     * Remove all highlights from an element
     * @param {HTMLElement} element - The element to remove highlights from
     */
    removeHighlights(element) {
        if (!element) return;
        
        const highlights = element.querySelectorAll(`.${this.highlightClass}`);
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            const text = document.createTextNode(highlight.textContent);
            parent.replaceChild(text, highlight);
            // Normalize to merge adjacent text nodes
            parent.normalize();
        });
    }

    /**
     * Highlight in note card (title and preview)
     * @param {HTMLElement} noteElement - The note card element
     * @param {string} searchTerm - The term to highlight
     */
    highlightInNote(noteElement, searchTerm) {
        if (!noteElement || !searchTerm) return;

        // Add animation class
        noteElement.classList.add(this.matchClass);

        // Highlight in title
        const titleElement = noteElement.querySelector('h3, .note-title');
        if (titleElement) {
            this.highlightText(titleElement, searchTerm);
        }

        // Highlight in preview/content
        const previewElement = noteElement.querySelector('.note-preview, p');
        if (previewElement) {
            this.highlightText(previewElement, searchTerm);
        }
    }

    /**
     * Highlight in collection card
     * @param {HTMLElement} collectionElement - The collection card element
     * @param {string} searchTerm - The term to highlight
     */
    highlightInCollection(collectionElement, searchTerm) {
        if (!collectionElement || !searchTerm) return;

        // Add animation class
        collectionElement.classList.add(this.matchClass);

        const nameElement = collectionElement.querySelector('.collection-name');
        if (nameElement) {
            this.highlightText(nameElement, searchTerm);
        }

        // Also check description if exists
        const descElement = collectionElement.querySelector('.collection-description');
        if (descElement) {
            this.highlightText(descElement, searchTerm);
        }
    }

    /**
     * Clear highlights and animation from element
     * @param {HTMLElement} element - The element to clear
     */
    clearHighlight(element) {
        if (!element) return;
        
        this.removeHighlights(element);
        element.classList.remove(this.matchClass);
    }

    /**
     * Batch highlight multiple elements
     * @param {NodeList|Array} elements - Elements to highlight
     * @param {string} searchTerm - The term to highlight
     * @param {string} type - 'note' or 'collection'
     */
    highlightBatch(elements, searchTerm, type = 'note') {
        if (!elements || !searchTerm) return;

        elements.forEach(element => {
            if (type === 'note') {
                this.highlightInNote(element, searchTerm);
            } else if (type === 'collection') {
                this.highlightInCollection(element, searchTerm);
            }
        });
    }

    /**
     * Clear all highlights from multiple elements
     * @param {NodeList|Array} elements - Elements to clear
     */
    clearBatch(elements) {
        if (!elements) return;

        elements.forEach(element => {
            this.clearHighlight(element);
        });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SearchHighlighter = SearchHighlighter;
}

// Create global instance
if (typeof window !== 'undefined') {
    window.searchHighlighter = new SearchHighlighter();
}

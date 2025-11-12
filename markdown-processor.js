// markdown-processor.js - Unified Markdown Processing with marked.js
// Uses marked.js for Markdown → HTML and Quill's clipboard for HTML → Delta

/**
 * Initialize marked.js with custom configuration
 */
function initializeMarkedProcessor() {
    if (typeof marked === 'undefined') {
        console.error('[Markdown Processor] marked.js not loaded!');
        return false;
    }

    // Configure marked.js
    marked.setOptions({
        breaks: true,        // Convert \n to <br>
        gfm: true,          // GitHub Flavored Markdown
        headerIds: false,   // Don't add IDs to headers
        mangle: false,      // Don't escape autolinked email addresses
        pedantic: false,    // Don't be too strict
        sanitize: false,    // We'll handle XSS ourselves
        smartLists: true,   // Use smarter list behavior
        smartypants: false  // Don't use smart typography
    });

    console.log('[Markdown Processor] Initialized successfully');
    return true;
}

/**
 * Convert markdown to HTML for display (chat, result panels)
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
function markdownToHTML(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';

    try {
        // Use marked.js to convert
        const html = marked.parse(markdown);
        return html;
    } catch (error) {
        console.error('[Markdown Processor] Error converting to HTML:', error);
        // Fallback: return escaped text
        return escapeHtml(markdown).replace(/\n/g, '<br>');
    }
}

/**
 * Convert markdown to Quill Delta using marked.js + Quill's clipboard API
 * @param {string} markdown - Markdown text
 * @param {Object} quillInstance - Optional Quill instance for clipboard conversion
 * @returns {Array} Quill Delta operations
 */
function markdownToQuillDelta(markdown, quillInstance = null) {
    if (!markdown || typeof markdown !== 'string') return [{ insert: '\n' }];

    try {
        // Step 1: Convert Markdown to HTML using marked.js
        const html = marked.parse(markdown);

        // Step 2: Convert HTML to Quill Delta
        // If Quill instance is available, use its clipboard for accurate conversion
        if (quillInstance && quillInstance.clipboard && quillInstance.clipboard.convert) {
            try {
                const delta = quillInstance.clipboard.convert(html);
                return delta.ops || delta;
            } catch (clipboardError) {
                console.warn('[Markdown Processor] Clipboard conversion failed:', clipboardError);
            }
        }

        // Fallback: Use DOMParser + manual conversion
        return htmlToQuillDelta(html);
    } catch (error) {
        console.error('[Markdown Processor] Error converting to Delta:', error);
        // Fallback: return plain text
        return [{ insert: markdown + '\n' }];
    }
}

/**
 * Convert HTML to Quill Delta format (fallback method)
 * @param {string} html - HTML string
 * @returns {Array} Quill Delta operations
 */
function htmlToQuillDelta(html) {
    if (!html) return [{ insert: '\n' }];

    const delta = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Process the body content
    processHTMLNode(doc.body, delta);

    // Ensure delta ends with newline
    if (delta.length === 0 || delta[delta.length - 1].insert !== '\n') {
        delta.push({ insert: '\n' });
    }

    return delta;
}

/**
 * Process HTML node recursively and convert to Delta operations
 * @param {Node} node - HTML node
 * @param {Array} delta - Delta operations array
 * @param {Object} attributes - Current formatting attributes
 */
function processHTMLNode(node, delta, attributes = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) {
            if (Object.keys(attributes).length > 0) {
                delta.push({ insert: text, attributes: { ...attributes } });
            } else {
                delta.push({ insert: text });
            }
        }
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toLowerCase();
    const newAttributes = { ...attributes };

    // Map HTML tags to Quill inline attributes
    switch (tagName) {
        case 'strong':
        case 'b':
            newAttributes.bold = true;
            break;
        case 'em':
        case 'i':
            newAttributes.italic = true;
            break;
        case 'u':
            newAttributes.underline = true;
            break;
        case 's':
        case 'strike':
        case 'del':
            newAttributes.strike = true;
            break;
        case 'code':
            // Only for inline code, not code blocks
            if (node.parentElement && node.parentElement.tagName.toLowerCase() !== 'pre') {
                newAttributes.code = true;
            }
            break;
        case 'a':
            newAttributes.link = node.getAttribute('href');
            break;
    }

    // Handle block elements
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li'].includes(tagName)) {
        // Process children first
        for (let child of node.childNodes) {
            processHTMLNode(child, delta, newAttributes);
        }

        // Add block formatting
        const blockAttributes = {};

        if (tagName === 'h1') blockAttributes.header = 1;
        else if (tagName === 'h2') blockAttributes.header = 2;
        else if (tagName === 'h3') blockAttributes.header = 3;
        else if (tagName === 'h4') blockAttributes.header = 4;
        else if (tagName === 'h5') blockAttributes.header = 5;
        else if (tagName === 'h6') blockAttributes.header = 6;
        else if (tagName === 'blockquote') blockAttributes.blockquote = true;
        else if (tagName === 'pre') blockAttributes['code-block'] = true;
        else if (tagName === 'li') {
            const parent = node.parentElement;
            if (parent) {
                if (parent.tagName.toLowerCase() === 'ol') {
                    blockAttributes.list = 'ordered';
                } else if (parent.tagName.toLowerCase() === 'ul') {
                    // Check for checklist
                    const checkbox = node.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        blockAttributes.list = checkbox.checked ? 'checked' : 'unchecked';
                    } else {
                        blockAttributes.list = 'bullet';
                    }
                }
            }
        }

        // Add newline with block attributes
        if (Object.keys(blockAttributes).length > 0) {
            delta.push({ insert: '\n', attributes: blockAttributes });
        } else {
            delta.push({ insert: '\n' });
        }
    } else if (['ul', 'ol'].includes(tagName)) {
        // Process list items
        for (let child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
                processHTMLNode(child, delta, newAttributes);
            }
        }
    } else if (tagName === 'br') {
        delta.push({ insert: '\n' });
    } else {
        // Inline elements - process children
        for (let child of node.childNodes) {
            processHTMLNode(child, delta, newAttributes);
        }
    }
}

/**
 * Insert markdown content into Quill editor
 * Uses Quill's clipboard API for accurate conversion
 * @param {Object} quillEditor - Quill editor instance
 * @param {string} markdown - Markdown text
 * @param {number} index - Insert position
 */
function insertMarkdownIntoQuill(quillEditor, markdown, index = null) {
    if (!quillEditor || !markdown) {
        console.error('[Markdown Processor] Invalid parameters:', { quillEditor: !!quillEditor, markdown: !!markdown });
        return;
    }

    const insertIndex = index !== null ? index :
        (quillEditor.getSelection()?.index || quillEditor.getLength() - 1);

    console.log('[Markdown Processor] Inserting at index:', insertIndex, 'Content length:', markdown.length);

    try {
        // Method 1: Use Quill's clipboard API with dangerouslyPasteHTML (most reliable)
        if (quillEditor.clipboard && typeof marked !== 'undefined') {
            console.log('[Markdown Processor] Using clipboard.dangerouslyPasteHTML');

            // Convert markdown to HTML first
            const html = marked.parse(markdown);
            console.log('[Markdown Processor] HTML length:', html.length, 'Preview:', html.substring(0, 100));

            // Use dangerouslyPasteHTML to insert at position
            quillEditor.clipboard.dangerouslyPasteHTML(insertIndex, html, 'user');

            // Calculate new cursor position
            const newLength = quillEditor.getLength();
            quillEditor.setSelection(newLength - 1, 0, 'user');

            console.log('[Markdown Processor] Successfully inserted using dangerouslyPasteHTML');
            return;
        }
    } catch (error) {
        console.error('[Markdown Processor] dangerouslyPasteHTML failed:', error);
    }

    // Method 2: Try using clipboard.convert + updateContents
    try {
        if (quillEditor.clipboard && quillEditor.clipboard.convert && typeof marked !== 'undefined') {
            console.log('[Markdown Processor] Using clipboard.convert + updateContents');

            // Convert markdown to HTML first
            const html = marked.parse(markdown);

            // Use Quill's clipboard to convert HTML to Delta
            const delta = quillEditor.clipboard.convert(html);
            console.log('[Markdown Processor] Delta ops:', delta.ops ? delta.ops.length : 'no ops');

            // Create a Delta object for insertion
            if (typeof Quill !== 'undefined' && Quill.import) {
                const Delta = Quill.import('delta');
                const insertDelta = new Delta()
                    .retain(insertIndex)
                    .concat(delta);

                quillEditor.updateContents(insertDelta, 'user');

                // Set cursor position
                const contentLength = delta.ops.reduce((sum, op) => {
                    return sum + (typeof op.insert === 'string' ? op.insert.length : 1);
                }, 0);
                quillEditor.setSelection(insertIndex + contentLength, 0, 'user');

                console.log('[Markdown Processor] Successfully inserted using updateContents');
                return;
            }
        }
    } catch (error) {
        console.error('[Markdown Processor] updateContents failed:', error);
    }

    // Method 3: Fallback - plain text insertion
    console.warn('[Markdown Processor] Using plain text fallback');
    try {
        quillEditor.insertText(insertIndex, markdown + '\n', 'user');
        quillEditor.setSelection(insertIndex + markdown.length + 1, 0, 'user');
        console.log('[Markdown Processor] Inserted as plain text');
    } catch (error) {
        console.error('[Markdown Processor] Plain text insertion failed:', error);
    }
}

/**
 * Universal AI content processor
 * @param {string} content - AI response content
 * @param {string} outputFormat - 'html' or 'delta'
 * @returns {string|Array} Processed content
 */
function processAIContent(content, outputFormat = 'html') {
    if (!content) return outputFormat === 'html' ? '' : [{ insert: '\n' }];

    if (outputFormat === 'html') {
        return markdownToHTML(content);
    } else if (outputFormat === 'delta') {
        return markdownToQuillDelta(content);
    }

    return content;
}

/**
 * Convert markdown to plain text (remove all markdown syntax)
 * @param {string} markdown - Markdown text
 * @returns {string} Plain text without markdown syntax
 */
function markdownToPlainText(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';

    let text = markdown;

    // Remove code blocks first (```code```)
    text = text.replace(/```[\s\S]*?```/g, '');

    // Remove inline code (`code`)
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove images (![alt](url))
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

    // Remove links but keep text ([text](url))
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove bold (**text** or __text__)
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');

    // Remove italic (*text* or _text_)
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');

    // Remove strikethrough (~~text~~)
    text = text.replace(/~~([^~]+)~~/g, '$1');

    // Remove headers (# ## ### etc)
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Remove horizontal rules (---, ***, ___)
    text = text.replace(/^[-*_]{3,}$/gm, '');

    // Remove blockquotes (> text)
    text = text.replace(/^>\s+/gm, '');

    // Convert unordered list markers to bullets
    text = text.replace(/^\s*[-*+]\s+/gm, '• ');

    // Convert ordered list markers
    text = text.replace(/^\s*(\d+)\.\s+/gm, '$1. ');

    // Remove task list markers (- [ ] or - [x])
    text = text.replace(/^\s*-\s*\[([ x])\]\s+/gm, '');

    // Clean up extra whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions
if (typeof window !== 'undefined') {
    window.MarkdownProcessor = {
        initialize: initializeMarkedProcessor,
        toHTML: markdownToHTML,
        toDelta: markdownToQuillDelta,
        insertIntoQuill: insertMarkdownIntoQuill,
        process: processAIContent,
        toPlainText: markdownToPlainText
    };

    // Auto-initialize when marked.js is loaded
    if (typeof marked !== 'undefined') {
        initializeMarkedProcessor();
    } else {
        // Wait for marked.js to load
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof marked !== 'undefined') {
                initializeMarkedProcessor();
            }
        });
    }
}

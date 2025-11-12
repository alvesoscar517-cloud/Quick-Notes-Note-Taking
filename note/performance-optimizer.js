// Performance Optimizer for Note Editor
// Performance optimization for note editor

class NotePerformanceOptimizer {
    constructor() {
        this.debounceTimers = new Map();
        this.rafCallbacks = new Map();
        this.observers = new Map();
        this.imageCache = new Map();
        this.lazyLoadQueue = [];
    }

    // Debounce function - optimize for save operations
    debounce(key, callback, delay) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }

        const timer = setTimeout(() => {
            callback();
            this.debounceTimers.delete(key);
        }, delay);

        this.debounceTimers.set(key, timer);
    }

    // RequestAnimationFrame throttle - optimize for animations
    rafThrottle(key, callback) {
        if (this.rafCallbacks.has(key)) {
            return;
        }

        const rafId = requestAnimationFrame(() => {
            callback();
            this.rafCallbacks.delete(key);
        });

        this.rafCallbacks.set(key, rafId);
    }

    // Lazy load images - only load when needed
    lazyLoadImage(img) {
        if (!('IntersectionObserver' in window)) {
            // Fallback for browsers without support
            img.src = img.dataset.src;
            return;
        }

        const observerKey = 'imageObserver';

        if (!this.observers.has(observerKey)) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const image = entry.target;
                        if (image.dataset.src) {
                            image.src = image.dataset.src;
                            image.removeAttribute('data-src');
                        }
                        observer.unobserve(image);
                    }
                });
            }, {
                rootMargin: '50px' // Load 50px ahead
            });

            this.observers.set(observerKey, observer);
        }

        this.observers.get(observerKey).observe(img);
    }

    // Optimize Quill editor performance
    optimizeQuillEditor(quillEditor) {
        if (!quillEditor) return;
        // Reduce update frequency
        const originalUpdate = quillEditor.update;
        quillEditor.update = (...args) => {
            this.rafThrottle('quillUpdate', () => {
                originalUpdate.apply(quillEditor, args);
            });
        };

        // Optimize scroll performance
        const editorElement = quillEditor.root;
        if (editorElement) {
            editorElement.style.willChange = 'scroll-position';

            // Passive event listeners cho scroll
            editorElement.addEventListener('scroll', () => {
                this.rafThrottle('editorScroll', () => {
                    // Handle scroll updates
                });
            }, { passive: true });
        }
    }

    // Batch DOM updates
    batchDOMUpdates(updates) {
        requestAnimationFrame(() => {
            updates.forEach(update => update());
        });
    }

    // Optimize animation performance
    optimizeAnimation(element) {
        if (!element) return;

        // Use CSS transforms instead of position changes
        element.style.willChange = 'transform, opacity';
        element.style.transform = 'translateZ(0)'; // Force GPU acceleration
    }

    // Memory cleanup
    cleanup() {
        // Clear all timers
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // Cancel all RAF callbacks
        this.rafCallbacks.forEach(rafId => cancelAnimationFrame(rafId));
        this.rafCallbacks.clear();

        // Disconnect observers
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();

        // Clear caches
        this.imageCache.clear();
        this.lazyLoadQueue = [];
    }

    // Optimize event listeners
    addOptimizedEventListener(element, event, handler, options = {}) {
        const optimizedHandler = (e) => {
            this.rafThrottle(`event_${event}`, () => handler(e));
        };

        element.addEventListener(event, optimizedHandler, {
            passive: options.passive !== false,
            ...options
        });

        return () => element.removeEventListener(event, optimizedHandler);
    }

    // Reduce reflows and repaints
    measureAndUpdate(measureFn, updateFn) {
        // Measure phase
        const measurements = measureFn();

        // Update phase (batched)
        requestAnimationFrame(() => {
            updateFn(measurements);
        });
    }

    // Optimize Lottie animations
    optimizeLottieAnimation(animation) {
        if (!animation) return;

        // Reduce quality for better performance
        animation.setQuality('low');

        // Pause when not visible
        const container = animation.wrapper;
        if (container && 'IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        animation.play();
                    } else {
                        animation.pause();
                    }
                });
            });

            observer.observe(container);
            this.observers.set('lottieObserver', observer);
        }
    }

    // Optimize save operations
    optimizeSave(saveFunction, delay = 2000) {
        return (...args) => {
            this.debounce('save', () => saveFunction(...args), delay);
        };
    }

    // Virtual scrolling helper
    setupVirtualScroll(container, items, renderItem) {
        const ITEM_HEIGHT = 50; // Adjust based on your item height
        const BUFFER = 5; // Number of items to render outside viewport

        let scrollTop = 0;
        let visibleStart = 0;
        let visibleEnd = 0;

        const updateVisibleItems = () => {
            const containerHeight = container.clientHeight;
            visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
            visibleEnd = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER);

            // Render only visible items
            const fragment = document.createDocumentFragment();
            for (let i = visibleStart; i < visibleEnd; i++) {
                fragment.appendChild(renderItem(items[i], i));
            }

            container.innerHTML = '';
            container.appendChild(fragment);
        };

        this.addOptimizedEventListener(container, 'scroll', (e) => {
            scrollTop = e.target.scrollTop;
            updateVisibleItems();
        });

        updateVisibleItems();
    }
}

// Export singleton instance
const performanceOptimizer = new NotePerformanceOptimizer();

// Auto cleanup on page unload
window.addEventListener('beforeunload', () => {
    performanceOptimizer.cleanup();
});

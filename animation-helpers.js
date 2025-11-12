// Animation Helpers for Quick Notes
// Use anime.js to create smooth effects

/**
 * Check if anime.js is available
 */
function isAnimeAvailable() {
    return typeof anime !== 'undefined';
}

/**
 * Animate page transition with horizontal slide (2 pages slide simultaneously, adjacent to each other)
 * @param {HTMLElement} fromPage - Current page
 * @param {HTMLElement} toPage - Target page
 * @param {string} direction - 'left' (forward) or 'right' (backward)
 * @param {Function} callback - Callback after animation completes
 */
function animatePageSlide(fromPage, toPage, direction, callback) {
    if (!fromPage || !toPage || !isAnimeAvailable()) {
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

/**
 * Animate collection page zoom in from card
 * @param {HTMLElement} fromPage - Current page
 * @param {HTMLElement} toPage - Collection page
 * @param {HTMLElement} sourceCard - Clicked card (optional)
 * @param {Function} callback - Callback after animation completes
 */
function animateCollectionZoom(fromPage, toPage, sourceCard, callback) {
    if (!fromPage || !toPage || !isAnimeAvailable()) {
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

/**
 * Animate collection page zoom out when closing
 * @param {HTMLElement} fromPage - Collection page
 * @param {HTMLElement} toPage - Main page
 * @param {Function} callback - Callback after animation completes
 */
function animateCollectionZoomOut(fromPage, toPage, callback) {
    if (!fromPage || !toPage || !isAnimeAvailable()) {
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

/**
 * Animate dialog/modal open
 * @param {HTMLElement} dialog - Dialog element
 * @param {Function} callback - Callback after animation completes
 */
function animateDialogOpen(dialog, callback) {
    if (!dialog || !isAnimeAvailable()) {
        if (callback) callback();
        return;
    }

    anime({
        targets: dialog,
        scale: [0.8, 1],
        opacity: [0, 1],
        duration: 400,
        easing: 'easeOutCubic',
        complete: callback
    });
}

/**
 * Animate dialog/modal close
 * @param {HTMLElement} dialog - Dialog element
 * @param {Function} callback - Callback after animation completes
 */
function animateDialogClose(dialog, callback) {
    if (!dialog || !isAnimeAvailable()) {
        if (callback) callback();
        return;
    }

    anime({
        targets: dialog,
        scale: [1, 0.8],
        opacity: [1, 0],
        duration: 300,
        easing: 'easeInCubic',
        complete: callback
    });
}

/**
 * Animate collection card when created/displayed
 * @param {HTMLElement} card - Card element
 * @param {number} delay - Delay before starting animation (ms)
 */
function animateCollectionCard(card, delay = 0) {
    if (!card || !isAnimeAvailable()) return;

    anime({
        targets: card,
        scale: [0.9, 1],
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 500,
        delay: delay,
        easing: 'easeOutCubic'
    });
}

/**
 * Animate note card when created/displayed
 * @param {HTMLElement} note - Note element
 * @param {number} delay - Delay before starting animation (ms)
 */
function animateNoteCard(note, delay = 0) {
    if (!note || !isAnimeAvailable()) return;

    anime({
        targets: note,
        scale: [0.95, 1],
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 400,
        delay: delay,
        easing: 'easeOutCubic'
    });
}

/**
 * Animate list items with stagger effect
 * @param {string|HTMLElement[]} items - Selector or array of elements
 * @param {Object} options - Animation options
 */
function animateListStagger(items, options = {}) {
    if (!isAnimeAvailable()) return;

    const defaults = {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 400,
        delay: anime.stagger(50), // 50ms delay between each item
        easing: 'easeOutCubic'
    };

    anime({
        targets: items,
        ...defaults,
        ...options
    });
}

/**
 * Animate button click with scale effect
 * @param {HTMLElement} button - Button element
 */
function animateButtonClick(button) {
    if (!button || !isAnimeAvailable()) return;

    anime({
        targets: button,
        scale: [1, 0.95, 1],
        duration: 200,
        easing: 'easeOutQuad'
    });
}

/**
 * Animate element shake (for error/warning)
 * @param {HTMLElement} element - Element to shake
 */
function animateShake(element) {
    if (!element || !isAnimeAvailable()) return;

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

/**
 * Animate element pulse (for notification/highlight)
 * @param {HTMLElement} element - Element to pulse
 */
function animatePulse(element) {
    if (!element || !isAnimeAvailable()) return;

    anime({
        targets: element,
        scale: [1, 1.05, 1],
        duration: 600,
        easing: 'easeInOutQuad'
    });
}

/**
 * Animate fade in
 * @param {HTMLElement} element - Element to fade in
 * @param {Function} callback - Callback after animation completes
 */
function animateFadeIn(element, callback) {
    if (!element || !isAnimeAvailable()) {
        if (element) element.style.opacity = '1';
        if (callback) callback();
        return;
    }

    anime({
        targets: element,
        opacity: [0, 1],
        duration: 300,
        easing: 'easeOutCubic',
        complete: callback
    });
}

/**
 * Animate fade out
 * @param {HTMLElement} element - Element to fade out
 * @param {Function} callback - Callback after animation completes
 */
function animateFadeOut(element, callback) {
    if (!element || !isAnimeAvailable()) {
        if (element) element.style.opacity = '0';
        if (callback) callback();
        return;
    }

    anime({
        targets: element,
        opacity: [1, 0],
        duration: 300,
        easing: 'easeInCubic',
        complete: callback
    });
}

/**
 * Animate slide in from right
 * @param {HTMLElement} element - Element to slide in
 * @param {Function} callback - Callback after animation completes
 */
function animateSlideInRight(element, callback) {
    if (!element || !isAnimeAvailable()) {
        if (callback) callback();
        return;
    }

    anime({
        targets: element,
        translateX: [100, 0],
        opacity: [0, 1],
        duration: 400,
        easing: 'easeOutCubic',
        complete: callback
    });
}

/**
 * Animate slide out to left
 * @param {HTMLElement} element - Element to slide out
 * @param {Function} callback - Callback after animation completes
 */
function animateSlideOutLeft(element, callback) {
    if (!element || !isAnimeAvailable()) {
        if (callback) callback();
        return;
    }

    anime({
        targets: element,
        translateX: [0, -100],
        opacity: [1, 0],
        duration: 300,
        easing: 'easeInCubic',
        complete: callback
    });
}

/**
 * Animate rotate (for loading icons)
 * @param {HTMLElement} element - Element to rotate
 * @param {boolean} infinite - Whether to loop infinitely
 */
function animateRotate(element, infinite = true) {
    if (!element || !isAnimeAvailable()) return;

    return anime({
        targets: element,
        rotate: '1turn',
        duration: 1000,
        easing: 'linear',
        loop: infinite
    });
}

/**
 * Animate bounce (for notifications)
 * @param {HTMLElement} element - Element to bounce
 */
function animateBounce(element) {
    if (!element || !isAnimeAvailable()) return;

    anime({
        targets: element,
        translateY: [
            { value: -20, duration: 200, easing: 'easeOutQuad' },
            { value: 0, duration: 200, easing: 'easeInQuad' },
            { value: -10, duration: 150, easing: 'easeOutQuad' },
            { value: 0, duration: 150, easing: 'easeInQuad' }
        ]
    });
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isAnimeAvailable,
        animatePageSlide,
        animateCollectionZoom,
        animateCollectionZoomOut,
        animateDialogOpen,
        animateDialogClose,
        animateCollectionCard,
        animateNoteCard,
        animateListStagger,
        animateButtonClick,
        animateShake,
        animatePulse,
        animateFadeIn,
        animateFadeOut,
        animateSlideInRight,
        animateSlideOutLeft,
        animateRotate,
        animateBounce
    };
}

// toast-system.js - Simple Toast similar to main_app

class ToastSystem {
    constructor() {
        this.currentToast = null;
        this.defaultDuration = 3000;
    }
    show(message, duration = this.defaultDuration) {
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return;
        }
        // Remove old toast if exists
        if (this.currentToast && this.currentToast.parentNode) {
            this.currentToast.parentNode.removeChild(this.currentToast);
        }

        // Create new toast
        const toast = document.createElement('div');
        toast.className = 'unified-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        this.currentToast = toast;

        // Show animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto hide
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 400);
        }, duration);
    }
}

// Initialize
const toastSystem = new ToastSystem();

// Enhanced function - supports both (message, duration) and (message, type) signatures
function showToast(message, typeOrDuration = 3000) {
    // Check if second parameter is a type string or duration number
    let duration = 3000;
    
    if (typeof typeOrDuration === 'string') {
        // It's a type (success, error, warning, info) - use default duration
        duration = 3000;
        // Type is ignored in this simple implementation, but we accept it for compatibility
    } else if (typeof typeOrDuration === 'number') {
        // It's a duration
        duration = typeOrDuration;
    }
    
    toastSystem.show(message, duration);
}

// Alias for compatibility
function showErrorToast(message, duration = 3000) {
    showToast(message, duration);
}

function showSuccessToast(message, duration = 3000) {
    showToast(message, duration);
}

function showWarningToast(message, duration = 3000) {
    showToast(message, duration);
}

function showInfoToast(message, duration = 3000) {
    showToast(message, duration);
}

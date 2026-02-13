
export class ToastMessager {
    constructor() {
        this.container = document.getElementById('toast-container');
    }

    /**
     * Display a toast message
     * @param {string} text - Message content
     * @param {number} duration - Time in ms before hiding (default 3000)
     */
    addMessage(text, duration = 3000) {
        if (!this.container) {
            console.warn('Toast container not found');
            return;
        }

        const toast = document.createElement('div');
        toast.classList.add('toast');
        toast.textContent = text; // Just text for now to avoid XSS if we used innerHTML

        // Append to container
        this.container.appendChild(toast);

        // Force reflow to enable transition
        void toast.offsetWidth;

        // Trigger show animation
        requestAnimationFrame(() => {
            toast.classList.add('showing');
        });

        // Set timeout to remove
        setTimeout(() => {
            this.removeMessage(toast);
        }, duration);
    }

    removeMessage(toast) {
        toast.classList.remove('showing');
        toast.classList.add('hiding');

        // Wait for transition to end before removing from DOM
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, { once: true });
    }
}

// Global instance 
const toastMessager = new ToastMessager();

// Temporary Test Trigger
// const popBtn = document.getElementById('pop-btn');
// if (popBtn) {
//     popBtn.addEventListener('click', () => {
//         // Random message for variety
//         const messages = [
//             "System: Operation successful.",
//             "Warning: Low signal strength.",
//             "Info: Data saved to local storage.",
//             "Error: Connection interrupted.",
//             "Notice: New message received."
//         ];
//         const randomMsg = messages[Math.floor(Math.random() * messages.length)];
//         toastMessager.addMessage(randomMsg);
//     });
// }

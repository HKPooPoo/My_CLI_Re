import * as IDB from './obsolete-indexdb.js';

class BlackboardManager {
    constructor() {
        // Shared Buttons
        this.pushBtn = document.querySelector('.push-btn');
        this.pullBtn = document.querySelector('.pull-btn');

        // Map Page ID (data-page) to Input Element
        this.pages = {
            'blackboard-log': document.getElementById('log-textarea'),
            'blackboard-todo': document.getElementById('todo-textarea')
        };

        this.init();
    }

    async init() {
        try {
            await IDB.init();
        } catch (e) {
            console.error("Failed to init IDB", e);
            return;
        }

        // Initial Load for all pages
        for (const [scrollName, input] of Object.entries(this.pages)) {
            if (input) {
                this.loadContent(scrollName, input);

                // Auto-save draft
                input.addEventListener('input', (e) => {
                    IDB.updateDraft(scrollName, e.target.value);
                });
            }
        }

        // Attach Shared Listeners
        if (this.pushBtn) {
            this.pushBtn.addEventListener('click', () => this.handleAction('push'));
        }
        if (this.pullBtn) {
            this.pullBtn.addEventListener('click', () => this.handleAction('pull'));
        }
    }

    async loadContent(scrollName, input) {
        // User requesting: On refresh, head should be on index 1 (latest)
        const content = await IDB.resetToLatestHistory(scrollName);
        input.value = content || "";
    }

    getActiveContext() {
        // Find which page is currently active (handled by navi.js)
        for (const [scrollName, input] of Object.entries(this.pages)) {
            // The input is inside the .page div
            const pageDiv = input.closest('.page');
            if (pageDiv && pageDiv.classList.contains('active')) {
                return { scrollName, input };
            }
        }
        return null;
    }

    async handleAction(actionType) {
        const ctx = this.getActiveContext();
        if (!ctx) return; // No active blackboard page

        let result;
        if (actionType === 'push') {
            result = await IDB.push(ctx.scrollName);
        } else {
            result = await IDB.pull(ctx.scrollName);
        }

        const btn = actionType === 'push' ? this.pushBtn : this.pullBtn;

        if (result.action !== 'ignore' && result.action !== 'stop') {
            // Success (New Draft or Navigated)
            ctx.input.value = result.content !== null ? result.content : "";
            this.flashButton(btn, 'var(--text-green)'); // Success color
        } else {
            // Failure / Boundary / Empty
            this.flashButton(btn, 'var(--text-red)'); // Error color
        }
    }

    flashButton(btn, color) {
        if (!btn) return;
        const original = btn.style.borderColor;
        btn.style.borderColor = color;

        setTimeout(() => {
            btn.style.borderColor = '';
        }, 300);
    }
}

// Instantiate
new BlackboardManager();

/**
 * Features
 */
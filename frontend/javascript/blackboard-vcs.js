
export class InfiniteList {
    constructor(containerSelector, itemSelector = ".vcs-list-item") {
        this.container = document.querySelector(containerSelector);
        if (!this.container) return; // Guard clause if element doesn't exist on page

        this.itemSelector = itemSelector;
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));
        this.activeIndex = this.items.findIndex(item => item.classList.contains("active"));
        if (this.activeIndex === -1 && this.items.length > 0) {
            this.activeIndex = 0;
            this.updateUI();
        }

        this.initEventListeners();
    }

    initEventListeners() {
        // Scroll Wheel
        this.container.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (this.items.length === 0) return;

            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        });

        // Click
        this.container.addEventListener("click", (e) => {
            const item = e.target.closest(this.itemSelector);
            if (item) {
                const index = this.items.indexOf(item);
                if (index !== -1) {
                    this.setCursor(index);
                }
            }
        });

        // Handle dynamic updates (if items are added/removed later)
        // For now, we assume static or manual re-init, but a MutationObserver could be added if needed.
    }

    moveCursor(direction) {
        // direction: 1 for down, -1 for up
        let newIndex = this.activeIndex + direction;

        // Wrap around
        if (newIndex >= this.items.length) {
            newIndex = 0;
        } else if (newIndex < 0) {
            newIndex = this.items.length - 1;
        }

        this.setCursor(newIndex);
    }

    setCursor(index) {
        if (index === this.activeIndex) return;

        // Remove active from old
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.remove("active");
        }

        this.activeIndex = index;

        // Add active to new
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.add("active");
            this.scrollIntoView(this.items[this.activeIndex]);
        }
    }

    scrollIntoView(element) {
        // Simple scrollIntoView or custom logic
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Call this if the DOM list changes
    refresh() {
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));
        const domActiveIndex = this.items.findIndex(item => item.classList.contains("active"));
        if (domActiveIndex !== -1) {
            this.activeIndex = domActiveIndex;
        } else if (this.activeIndex === -1 && this.items.length > 0) {
            this.activeIndex = 0;
            this.items[0].classList.add("active");
        }
    }
}

// Initialize for the specific lists used in index.html
document.addEventListener("DOMContentLoaded", () => {
    // We have multiple .vcs-list-container, so we need to initialize for each
    const containers = document.querySelectorAll(".vcs-list-container");

    // We can't just pass selector if we have multiple identical classes. 
    // We should iterate and instantiate for each element.
    // However, the class logic above takes a selector. Let's modify usage or class slightly.
    // Actually, looking at the HTML, they are inside different parents (Branch vs Stash pages).
    // Let's rely on specific contexts if possible, or just iterate elements.

    // Better approach: Modify class to accept Element instead of Selector, or handle NodeList.
    // Let's keep it simple: Instantiate for each found container.

    containers.forEach(container => {
        new InfiniteListElement(container);
    });
});

class InfiniteListElement {
    constructor(containerElement, itemSelector = ".vcs-list-item") {
        this.container = containerElement;
        this.itemSelector = itemSelector;
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));

        // Find initially active item
        this.activeIndex = this.items.findIndex(item => item.classList.contains("active"));
        if (this.activeIndex === -1 && this.items.length > 0) {
            this.activeIndex = 0;
            this.items[0].classList.add("active");
        }

        this.initEventListeners();
    }

    initEventListeners() {
        // Scroll Wheel
        this.container.addEventListener("wheel", (e) => {
            e.preventDefault();
            this.refresh(); // Refresh in case items changed
            if (this.items.length === 0) return;

            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        });

        // Click
        this.container.addEventListener("click", (e) => {
            this.refresh();
            const item = e.target.closest(this.itemSelector);
            if (item) {
                const index = this.items.indexOf(item);
                if (index !== -1) {
                    this.setCursor(index);
                }
            }
        });
    }

    moveCursor(direction) {
        let newIndex = this.activeIndex + direction;

        if (newIndex >= this.items.length) {
            newIndex = 0;
        } else if (newIndex < 0) {
            newIndex = this.items.length - 1;
        }

        this.setCursor(newIndex);
    }

    setCursor(index) {
        // Remove active from old
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.remove("active");
        }

        this.activeIndex = index;

        // Add active to new
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.add("active");
            this.scrollIntoView(this.items[this.activeIndex]);
        }
    }

    scrollIntoView(element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    refresh() {
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));
        const domActiveIndex = this.items.findIndex(item => item.classList.contains("active"));
        if (domActiveIndex !== -1) {
            this.activeIndex = domActiveIndex;
        } else if (this.activeIndex >= this.items.length) {
            this.activeIndex = this.items.length - 1;
        }
    }
}

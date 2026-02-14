/**
 * 無限捲動列表控制類別
 * 用於處理分支、隱藏 (Stash) 等列表的游標移動與選取
 */
export class InfiniteList {
    constructor(containerElement, itemSelector = ".vcs-list-item") {
        this.container = containerElement;
        this.itemSelector = itemSelector;
        this.items = [];
        this.activeIndex = -1;

        this.refresh();
        this.initEventListeners();
    }

    initEventListeners() {
        this.container.addEventListener("wheel", (e) => {
            e.preventDefault();
            this.refresh();
            if (this.items.length === 0) return;
            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        });

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
        if (this.items.length === 0) return;
        let newIndex = this.activeIndex + direction;
        if (newIndex >= this.items.length) newIndex = 0;
        else if (newIndex < 0) newIndex = this.items.length - 1;
        this.setCursor(newIndex);
    }

    setCursor(index) {
        if (index < 0 || index >= this.items.length) return;
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.remove("active");
        }
        this.activeIndex = index;
        const newItem = this.items[this.activeIndex];
        if (newItem) {
            newItem.classList.add("active");
            newItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    refresh() {
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));
        const domActiveIndex = this.items.findIndex(item => item.classList.contains("active"));
        if (domActiveIndex !== -1) {
            this.activeIndex = domActiveIndex;
        } else if (this.items.length > 0) {
            this.activeIndex = 0;
            this.items[0].classList.add("active");
        } else {
            this.activeIndex = -1;
        }
    }
}

// 自動初始化所有列表
export function initAllInfiniteLists() {
    const listInstances = new Map();
    const containers = document.querySelectorAll(".vcs-list-container");
    containers.forEach(container => {
        if (!listInstances.has(container)) {
            listInstances.set(container, new InfiniteList(container));
        } else {
            listInstances.get(container).refresh();
        }
    });
}

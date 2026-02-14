/**
 * 無限捲動列表控制類別
 * 用於處理分支、隱藏 (Stash) 等列表的游標移動與選取
 */
export class InfiniteList {
    /**
     * @param {HTMLElement} containerElement 列表容器元素
     * @param {string} itemSelector 項目選取器 (預設為 .vcs-list-item)
     */
    constructor(containerElement, itemSelector = ".vcs-list-item") {
        this.container = containerElement;
        this.itemSelector = itemSelector;
        this.items = [];
        this.activeIndex = -1;

        this.refresh();
        this.initEventListeners();
    }

    /**
     * 初始化事件監聽
     */
    initEventListeners() {
        // 滾輪事件：切換選取項
        this.container.addEventListener("wheel", (e) => {
            e.preventDefault();
            this.refresh();
            if (this.items.length === 0) return;

            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        });

        // 點擊事件：直接跳轉游標
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

    /**
     * 移動游標 (支援循環)
     * @param {number} direction 方向 (1 為下，-1 為上)
     */
    moveCursor(direction) {
        if (this.items.length === 0) return;
        let newIndex = this.activeIndex + direction;

        if (newIndex >= this.items.length) {
            newIndex = 0;
        } else if (newIndex < 0) {
            newIndex = this.items.length - 1;
        }

        this.setCursor(newIndex);
    }

    /**
     * 設定游標位置並更新 UI
     * @param {number} index 目標索引
     */
    setCursor(index) {
        if (index < 0 || index >= this.items.length) return;

        // 移除舊的 active 狀態
        if (this.items[this.activeIndex]) {
            this.items[this.activeIndex].classList.remove("active");
        }

        this.activeIndex = index;

        // 新增新的 active 狀態並確保其在可視範圍內
        const newItem = this.items[this.activeIndex];
        if (newItem) {
            newItem.classList.add("active");
            newItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    /**
     * 重新整理列表項，同步 DOM 狀態
     */
    refresh() {
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));

        // 根據 DOM 狀態校正當前 activeIndex
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

// 當頁面載入或黑板列表更新時，自動對所有 .vcs-list-container 進行初始化
document.addEventListener("DOMContentLoaded", () => {
    const listInstances = new Map();

    const initAllLists = () => {
        const containers = document.querySelectorAll(".vcs-list-container");
        containers.forEach(container => {
            // 如果該容器尚未被監管，則建立新的執行個體
            if (!listInstances.has(container)) {
                listInstances.set(container, new InfiniteList(container));
            } else {
                // 如果已經存在，則執行 refresh 同步最新 DOM
                listInstances.get(container).refresh();
            }
        });
    };

    initAllLists();

    // 監聽來自 blackboard.js 的自定義事件，以便在分支列表變動時即時重新整理
    window.addEventListener("blackboard:listUpdated", () => {
        initAllLists();
    });
});

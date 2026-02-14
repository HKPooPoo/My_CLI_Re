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
        // 使用 { passive: false } 確保 e.preventDefault() 能生效
        this.container.addEventListener("wheel", (e) => {
            // 執行 refresh 確保目前的 DOM 結構與記憶體同步
            this.refresh();

            if (this.items.length === 0) return;

            // 只有當確定有 items 時才攔截原生捲動
            e.preventDefault();

            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        }, { passive: false });

        this.container.addEventListener("click", (e) => {
            const item = e.target.closest(this.itemSelector);
            if (item) {
                this.refresh();
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

        // 循環邏輯
        if (newIndex >= this.items.length) newIndex = 0;
        else if (newIndex < 0) newIndex = this.items.length - 1;

        this.setCursor(newIndex);
    }

    setCursor(index) {
        if (index < 0 || index >= this.items.length) return;

        // 視覺更新：先移除所有項目的 active 類別
        this.items.forEach(item => item.classList.remove("active"));

        this.activeIndex = index;
        const newItem = this.items[this.activeIndex];

        if (newItem) {
            newItem.classList.add("active");
            // 捲動到可視區域，確保 UX 流暢
            newItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    /**
     * 同步 DOM 項目與內部 state
     */
    refresh() {
        // 重新抓取容器內的所有目標項目
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));

        // 優先從 DOM 中尋找目前被標記為 active 的項目
        const domActiveIndex = this.items.findIndex(item => item.classList.contains("active"));

        if (domActiveIndex !== -1) {
            this.activeIndex = domActiveIndex;
        } else if (this.items.length > 0) {
            // 如果 DOM 中沒有 active (例如剛同步完)，則預設選中第一個
            this.activeIndex = 0;
            this.items[0].classList.add("active");
        } else {
            this.activeIndex = -1;
        }
    }
}

// 實例化快取
const listInstances = new WeakMap();

/**
 * 初始化頁面中所有的無限列表
 */
export function initAllInfiniteLists() {
    const containers = document.querySelectorAll(".vcs-list-container");
    containers.forEach(container => {
        let instance = listInstances.get(container);
        if (!instance) {
            instance = new InfiniteList(container);
            listInstances.set(container, instance);
        } else {
            instance.refresh(); // 已存在的列表只需更新內部引用
        }
    });
}

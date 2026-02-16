/**
 * Infinite List Controller
 * =================================================================
 * 介紹：負責處理 UI 列表 (如 VCS 分支列表、Stash 列表) 的「無限滾動」與「游標導航」邏輯。
 * 職責：
 * 1. 同步：確保 JavaScript 快取中的列表項與當前 DOM 結構保持一致 (Refresh)。
 * 2. 導航：控制 Active 指標的移動，並實作循環選取 (向上溢出至底，向下溢出至頂)。
 * 3. 滾動：接管容器的 Wheel 事件，將滾輪物理捲動轉換為邏輯項目移位。
 * 4. UX：確保選中的項目始終處於可視區域 (ScrollIntoView)。
 * 依賴：無
 * =================================================================
 */

import { playAudio } from "./audio.js";

export class InfiniteList {
    /**
     * @param {HTMLElement} containerElement 包含列表項的容器
     * @param {string} itemSelector 子項目的 CSS 選擇器
     */
    constructor(containerElement, itemSelector = ".vcs-list-item") {
        this.container = containerElement;
        this.itemSelector = itemSelector;
        this.items = [];      // 用於快取 DOM 引用
        this.activeIndex = -1;

        this.refresh();
        this.initEventListeners();
    }

    /**
     * 綁定底層事件
     */
    initEventListeners() {
        // --- 滾輪接管 ---
        this.container.addEventListener("wheel", (e) => {
            this.refresh(); // 滾動前先確保引用最新 (例如剛渲染完)

            if (this.items.length === 0) return;

            // 步驟：1. 阻斷瀏覽器原生捲動 2. 判斷滾輪方向 3. 演進游標
            e.preventDefault();
            const direction = e.deltaY > 0 ? 1 : -1;
            this.moveCursor(direction);
        }, { passive: false });

        // --- 點擊反饋 ---
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

    /**
     * 位移游標 (演進邏輯)
     */
    moveCursor(direction) {
        if (this.items.length === 0) return;

        let newIndex = this.activeIndex + direction;

        // --- 循環處理 ---
        if (newIndex >= this.items.length) newIndex = 0;              // 超過底部回到頂部
        else if (newIndex < 0) newIndex = this.items.length - 1;     // 超過頂部回到底部

        this.setCursor(newIndex, false);
    }

    /**
     * 強制設定游標位置 (渲染邏輯)
     * @param {number} index 目標索引
     * @param {boolean} silent 是否靜音
     */
    setCursor(index, silent = false) {
        if (index < 0 || index >= this.items.length) return;

        // 移除舊高亮
        this.items.forEach(item => item.classList.remove("active"));

        this.activeIndex = index;
        const newItem = this.items[this.activeIndex];

        if (newItem) {
            newItem.classList.add("active");
            // 保保：確保元素在長列表中不會因滾動而消失，平滑對齊到最近邊緣
            newItem.scrollIntoView({ behavior: "smooth", block: "nearest" });

            // --- 播放音效 ---
            if (!silent && this.container.dataset.soundItem) {
                playAudio(this.container.dataset.soundItem);
            }

            // [Event]: 通知外部選取變更
            window.dispatchEvent(new CustomEvent("blackboard:selectionChanged", {
                detail: { index: this.activeIndex, item: newItem }
            }));
        }
    }

    /**
     * 數據同步 (Sync Heartbeat)
     * 邏輯：重新抓取所有符合選擇器的 DOM 項，並嘗試恢復先前的 Active 狀態，若丟失則歸零。
     */
    refresh() {
        this.items = Array.from(this.container.querySelectorAll(this.itemSelector));

        // 嘗試從現實 DOM 中找回靈魂
        const domActiveIndex = this.items.findIndex(item => item.classList.contains("active"));

        if (domActiveIndex !== -1) {
            this.activeIndex = domActiveIndex;
        } else if (this.items.length > 0) {
            // 系統初始化或剛同步完的預設行為
            this.setCursor(0, true);
        } else {
            this.activeIndex = -1;
        }
    }
}

// --- 實例工廠 ---
const listInstances = new WeakMap(); // 使用 WeakMap 避免內存洩漏，讓 DOM 銷毀時對象也能自動釋放

/**
 * 全域初始化入口
 * 用於頁面渲染完成後，自動掃描並賦予列表無限滾動能力。
 */
export function initAllInfiniteLists() {
    const containers = document.querySelectorAll(".vcs-list-container");
    containers.forEach(container => {
        let instance = listInstances.get(container);
        if (!instance) {
            instance = new InfiniteList(container);
            listInstances.set(container, instance);
        } else {
            instance.refresh(); // 若已存在，則執行同步
        }
    });
}

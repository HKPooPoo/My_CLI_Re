/**
 * MultiStepButton Component
 * =================================================================
 * 介紹：一個具備靈活「狀態演進」機制的按鈕組件，支援單階或多階交互。
 * 職責：
 * 1. 狀態機管理：根據傳入的 `steps` 陣列長度自動判定按鈕階數。
 * 2. 交互回饋：每一步可獨立配置 `label` (文字/HTML)、`sound` (音效) 與 `action` (回調)。
 * 3. 自動重置：在多階模式下，若超過超時時間未繼續點擊，自動跳回初始狀態。
 * 4. CSS 樣式同步：動態切換 `btn-state-x` 類別供樣式表鉤選。
 * 依賴：audio.js
 * =================================================================
 */

import { playAudio } from "./audio.js";

export class MultiStepButton {
    /**
     * 建構函數
     * @param {HTMLElement} element 目標按鈕元素
     * @param {Object[]|Object} steps 步驟配置 (支援單個物件或物件陣列)
     * @param {number} timeout 多階點擊的有效等待時間 (毫秒)
     */
    constructor(element, steps, timeout = 3000) {
        if (!element) return;
        this.element = element;
        // 靈活性擴充：若只傳入單一物件，自動包裹為單階陣列，簡化單音效按鈕的調用
        this.steps = Array.isArray(steps) ? steps : [steps];
        this.timeout = timeout;
        this.state = 0;
        this.timer = null;

        this.init();
    }

    /**
     * 初始化監聽器
     */
    init() {
        this.updateUI();
        this.element.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleClick();
        });
    }

    /**
     * 核心點擊處理邏輯
     * 步驟：1. 提取當前狀態配置 2. 播音效 3. 執行 Action 4. 判定狀態轉移或重置
     */
    handleClick() {
        const currentStep = this.steps[this.state];

        // --- 執行反饋 ---
        if (currentStep.sound) {
            playAudio(currentStep.sound);
        }

        if (currentStep.action) {
            currentStep.action();
        }

        // --- 狀態演進判定 ---
        if (this.steps.length > 1) {
            // 多階模式路徑
            if (this.state < this.steps.length - 1) {
                this.state++;
                this.updateUI();
                this.resetTimer(); // 重新計時，逾時則重置
            } else {
                // 已到達最後一階，迴圈回起點
                this.reset();
            }
        } else {
            // 單階模式路徑：僅用於音效反饋，不演進狀態
            this.updateUI();
        }
    }

    /**
     * UI 同步渲染
     * 步驟：1. 更新內部 HTML (支援 Ruby/繁中標籤) 2. 更新 CSS 狀態類別
     */
    updateUI() {
        const step = this.steps[this.state];
        if (!step) return;

        // 優化：單階按鈕且無 label 配置時，保留原 HTML 不閃爍
        if (this.steps.length > 1 || this.element.innerHTML === "") {
            this.element.innerHTML = step.label || this.element.innerHTML;
        }

        // 移除所有舊狀態類別並添加新類別
        this.steps.forEach((_, i) => this.element.classList.remove(`btn-state-${i}`));
        this.element.classList.add(`btn-state-${this.state}`);
    }

    /**
     * 重置計時器：用戶若停頓太久，則放棄當前演進進度
     */
    resetTimer() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.reset(), this.timeout);
    }

    /**
     * 硬重置回狀態 0
     */
    reset() {
        if (this.timer) clearTimeout(this.timer);
        this.state = 0;
        this.updateUI();
    }
}

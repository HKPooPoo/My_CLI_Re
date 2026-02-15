import { playAudio } from "./audio.js";

/**
 * MultiStepButton 組件
 * 支援多階點擊，每階具備獨立標籤、音效與回調函數
 */
export class MultiStepButton {
    /**
     * @param {HTMLElement} element 按鈕 DOM 元素
     * @param {Object[]} steps 步驟定義陣列 [{ label, sound, action }]
     * @param {number} timeout 重置超時時間 (ms)，預設 3000
     */
    constructor(element, steps, timeout = 3000) {
        if (!element) return;
        this.element = element;
        this.steps = steps;
        this.timeout = timeout;
        this.state = 0;
        this.timer = null;

        this.init();
    }

    init() {
        this.updateUI();
        this.element.addEventListener("click", (e) => {
            e.preventDefault();
            this.handleClick();
        });
    }

    handleClick() {
        const currentStep = this.steps[this.state];

        // 1. 播放音效 (如果定義)
        if (currentStep.sound) {
            playAudio(currentStep.sound);
        }

        // 2. 執行該階段函數 (如果定義)
        if (currentStep.action) {
            currentStep.action(this.state);
        }

        // 3. 處理狀態演進
        if (this.state < this.steps.length - 1) {
            this.state++;
            this.updateUI();
            this.resetTimer();
        } else {
            // 最後一步後重置
            this.reset();
        }
    }

    updateUI() {
        const step = this.steps[this.state];
        if (!step) return;

        // 更新內容
        this.element.innerHTML = step.label;

        // 更新樣式類別 (btn-state-N)
        this.steps.forEach((_, i) => {
            this.element.classList.remove(`btn-state-${i}`);
        });
        this.element.classList.add(`btn-state-${this.state}`);
    }

    resetTimer() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.reset();
        }, this.timeout);
    }

    reset() {
        if (this.timer) clearTimeout(this.timer);
        this.state = 0;
        this.updateUI();
    }
}

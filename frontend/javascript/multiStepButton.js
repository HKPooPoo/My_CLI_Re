import { playAudio } from "./audio.js";

/**
 * MultiStepButton 組件
 * 支援多階點擊，每階具備獨立標籤、音效與回調函數
 */
export class MultiStepButton {
    /**
     * @param {HTMLElement} element 按鈕 DOM 元素
     * @param {Object[]|Object} steps 步驟定義陣列或單個物件
     * @param {number} timeout 重置超時時間 (ms)
     */
    constructor(element, steps, timeout = 3000) {
        if (!element) return;
        this.element = element;
        // 如果傳入單個物件，自動封裝成單階陣列
        this.steps = Array.isArray(steps) ? steps : [steps];
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

        // 1. 播放音效
        if (currentStep.sound) {
            playAudio(currentStep.sound);
        }

        // 2. 執行該階段函數
        if (currentStep.action) {
            currentStep.action();
        }

        // 3. 處理狀態演進
        if (this.steps.length > 1) {
            if (this.state < this.steps.length - 1) {
                this.state++;
                this.updateUI();
                this.resetTimer();
            } else {
                // 最後一步後重置
                this.reset();
            }
        } else {
            // 單階模式：不演進狀態，僅重置 Timer (如果有)
            this.updateUI();
        }
    }

    updateUI() {
        const step = this.steps[this.state];
        if (!step) return;

        // 只有在多階模式下且 label 有變動才更新 HTML，避免單階按鈕閃爍
        if (this.steps.length > 1 || this.element.innerHTML === "") {
            this.element.innerHTML = step.label || this.element.innerHTML;
        }

        // 更新樣式類別
        this.steps.forEach((_, i) => this.element.classList.remove(`btn-state-${i}`));
        this.element.classList.add(`btn-state-${this.state}`);
    }

    resetTimer() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.reset(), this.timeout);
    }

    reset() {
        if (this.timer) clearTimeout(this.timer);
        this.state = 0;
        this.updateUI();
    }
}

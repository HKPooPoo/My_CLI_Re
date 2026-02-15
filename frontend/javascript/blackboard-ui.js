/**
 * Blackboard UI - Presentation Layer
 * =================================================================
 * 介紹：負責黑板系統的所有 DOM 交互、介面渲染與自定義事件廣播。
 * 職責：
 * 1. 維護介面元素的引用清單 (elements)。
 * 2. 實作黑板狀態指示器 (分支名、Head 索引、儲存狀態) 的動態更新。
 * 3. 負責文字框 (Textarea) 的雙向數據存取。
 * 4. 具備高階渲染邏輯：渲染分支列表，並自動處理「Local/Remote 混合顯示」與「同步/非同步狀態標籤」。
 * 5. 處理 UI 內的內聯事件 (如分改名)。
 * 依賴：無 (由 blackboard.js 調用)
 * =================================================================
 */

export const BBUI = {
    // --- DOM 引用清單 ---
    elements: {
        pushBtn: document.querySelector(".push-btn"),
        pullBtn: document.querySelector(".pull-btn"),
        branchName: document.querySelector(".branch-name"),
        headIndex: document.querySelector(".branch-head"),
        savedStatus: document.querySelector(".branch-is-saved"),
        branchBtn: document.getElementById("branch-btn"),
        commitBtn: document.getElementById("commit-btn"),
        checkoutBtn: document.getElementById("checkout-btn"),
        textarea: document.getElementById("log-textarea")
    },

    /**
     * 更新狀態指示器 (Indicators)
     */
    updateIndicators(branch, head, isSaved = true) {
        if (this.elements.branchName && branch !== undefined) this.elements.branchName.textContent = branch;
        if (this.elements.headIndex && head !== undefined) this.elements.headIndex.textContent = head;
        if (this.elements.savedStatus) {
            this.elements.savedStatus.textContent = isSaved ? "SAVED" : "UNSAVED";
        }
    },

    /**
     * 設定文字框內容並強制重設儲存標籤
     */
    setTextarea(text) {
        if (this.elements.textarea) {
            this.elements.textarea.value = text;
            this.updateIndicators(undefined, undefined, true);
        }
    },

    /**
     * 讀取文字框內容
     */
    getTextareaValue() {
        return this.elements.textarea ? this.elements.textarea.value : "";
    },

    /**
     * 轉義 HTML 特殊字元防止 XSS
     */
    escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    },

    /**
     * 渲染分支列表 (VCS List)
     */
    renderBranchList(branches, activeBranchId, activeOwner) {
        const container = document.querySelector(".vcs-list-container");
        if (!container) return;

        // 使用 DocumentFragment 在記憶體中進行操作，避免頻繁觸發 Reflow
        const fragment = document.createDocumentFragment();

        branches.forEach(branch => {
            const item = document.createElement("div");
            const isActive = branch.id === activeBranchId && branch.owner === activeOwner;

            item.className = `vcs-list-item ${isActive ? 'active' : ''}`;
            item.dataset.branchId = branch.id;
            item.dataset.branchName = branch.name;
            item.dataset.isLocal = branch.isLocal;
            item.dataset.isServer = branch.isServer;
            item.dataset.isDirty = branch.isDirty;

            // 轉義顯示內容
            const safeName = this.escapeHTML(branch.name);
            const safeOwner = this.escapeHTML(branch.owner);

            // --- 狀態標籤生成邏輯 ---
            let ownerDisplay = "";
            if (branch.isLocal && branch.isServer) {
                const syncStatus = branch.isDirty ? "asynced" : "synced";
                ownerDisplay = `local, <br>online/${this.escapeHTML(branch.serverOwner)} [${syncStatus}]`;
            } else if (branch.isServer) {
                ownerDisplay = `online/${this.escapeHTML(branch.serverOwner)} [asynced]`;
            } else {
                ownerDisplay = "local";
            }

            item.innerHTML = `
                <input type="text" class="vcs-list-branch" value="${safeName}" placeholder="Name your branch..." name="vcs-list-branch" maxlength="64">
                <div class="vcs-list-timestamp">${branch.displayTime}</div>
                <div class="vcs-list-owner">${ownerDisplay}</div>
            `;

            // 改名監聽：由 UI 對象直接捕捉並向上廣播自定義事件，不處理具體資料邏輯
            const input = item.querySelector(".vcs-list-branch");
            input.addEventListener("change", (e) => {
                const newName = e.target.value.trim() || branch.name;
                window.dispatchEvent(new CustomEvent("blackboard:branchRename", {
                    detail: { branchId: branch.id, newName }
                }));
            });

            fragment.appendChild(item);
        });

        // 使用 replaceChildren 一次性替換所有子元素，這是目前效能最優的 DOM 更新方式
        container.replaceChildren(fragment);

        // 打開信號讓 blackboard-ui-list.js 重新計算無限滾動高度
        window.dispatchEvent(new CustomEvent("blackboard:listUpdated"));
    }
};

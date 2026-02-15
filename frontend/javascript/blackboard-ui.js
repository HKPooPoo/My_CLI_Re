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
     * 渲染分支列表 (VCS List)
     * 步驟：
     * 1. 清空容器。
     * 2. 遍歷分支清單 -> 根據 ID 與 Owner 判定 Active 狀態。
     * 3. 計算並構造擁有者文字 (如 local, online/uid [synced])。
     * 4. 插入 DOM 並綁定內部改名 Input 的 Change 事件。
     * 5. 廣播 listUpdated 事件觸發無限滾動刷新。
     */
    renderBranchList(branches, activeBranchId, activeOwner) {
        const container = document.querySelector(".vcs-list-container");
        if (!container) return;

        container.innerHTML = "";

        branches.forEach(branch => {
            const item = document.createElement("div");
            // 注意：Active 必須 ID 與 Owner 同時匹配 (排除只有其中一邊存在的情況)
            const isActive = branch.id === activeBranchId && branch.owner === activeOwner;

            item.className = `vcs-list-item ${isActive ? 'active' : ''}`;
            item.dataset.branchId = branch.id;
            item.dataset.branchName = branch.name;

            // --- 狀態標籤生成邏輯 ---
            let ownerDisplay = "";
            if (branch.isLocal && branch.isServer) {
                const syncStatus = branch.isDirty ? "asynced" : "synced";
                ownerDisplay = `local, online/${branch.owner} [${syncStatus}]`;
            } else if (branch.isServer) {
                ownerDisplay = `online/${branch.owner} [asynced]`;
            } else {
                ownerDisplay = "local";
            }

            item.innerHTML = `
                <input type="text" class="vcs-list-branch" value="${branch.name}" placeholder="Name your branch..." name="vcs-list-branch" maxlength="32">
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

            container.appendChild(item);
        });

        // 打開信號讓 blackboard-ui-list.js 重新計算無限滾動高度
        window.dispatchEvent(new CustomEvent("blackboard:listUpdated"));
    }
};

/**
 * Blackboard 介面渲染與事件綁定層
 */
export const BBUI = {
    // DOM 引用
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
     * 更新畫面上的狀態指示器
     */
    updateIndicators(branch, head, isSaved = true) {
        if (this.elements.branchName) this.elements.branchName.textContent = branch;
        if (this.elements.headIndex) this.elements.headIndex.textContent = head;
        if (this.elements.savedStatus) {
            this.elements.savedStatus.textContent = isSaved ? "SAVED" : "UNSAVED";
        }
    },

    /**
     * 設定黑板文字內容
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
     * 渲染分支列表
     */
    renderBranchList(branches, activeBranchId, activeOwner) {
        const container = document.querySelector(".vcs-list-container");
        if (!container) return;

        container.innerHTML = "";

        branches.forEach(branch => {
            const item = document.createElement("div");
            // 雙重檢查：ID 相同且擁有者相同才是真正的 Active
            const isActive = branch.id === activeBranchId && branch.owner === activeOwner;

            item.className = `vcs-list-item ${isActive ? 'active' : ''}`;
            item.dataset.branchId = branch.id;
            item.dataset.branchName = branch.name;

            // 根據邏輯判定顯示文字
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

            // 監聽改名事件
            const input = item.querySelector(".vcs-list-branch");
            input.addEventListener("change", (e) => {
                const newName = e.target.value.trim() || branch.name;
                window.dispatchEvent(new CustomEvent("blackboard:branchRename", {
                    detail: { branchId: branch.id, newName }
                }));
            });

            container.appendChild(item);
        });

        // 觸發自定義事件讓 InfiniteList 更新
        window.dispatchEvent(new CustomEvent("blackboard:listUpdated"));
    }
};

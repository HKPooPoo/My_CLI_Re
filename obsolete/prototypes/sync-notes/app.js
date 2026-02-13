/**
 * GIT-LIKE VCS PROTOTYPE
 * ======================
 * IndexedDB-based Version Control System
 * 
 * Two Stores:
 * - objects: { commit_hash, parent_hash, timestamp, scroll_snapshot, message }
 * - refs: { branch_name, head_commit_hash }
 */

// ==========================================
// 1. DATABASE MANAGER (IndexedDB)
// ==========================================
class DBManager {
    constructor(dbName = 'VCS_DB') {
        this.dbName = dbName;
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Objects Store: Commits
                if (!db.objectStoreNames.contains('objects')) {
                    db.createObjectStore('objects', { keyPath: 'commit_hash' });
                }

                // Refs Store: Branches
                if (!db.objectStoreNames.contains('refs')) {
                    db.createObjectStore('refs', { keyPath: 'branch_name' });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log("✅ VCS DB Opened");
                resolve(this.db);
            };

            request.onerror = (e) => reject("DB Error: " + e.target.error);
        });
    }

    // Generic transaction helper
    async _tx(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Objects (Commits)
    async putObject(obj) {
        return this._tx('objects', 'readwrite', s => s.put(obj));
    }
    async getObject(hash) {
        return this._tx('objects', 'readonly', s => s.get(hash));
    }
    async getAllObjects() {
        return this._tx('objects', 'readonly', s => s.getAll());
    }

    // Refs (Branches)
    async putRef(ref) {
        return this._tx('refs', 'readwrite', s => s.put(ref));
    }
    async getRef(name) {
        return this._tx('refs', 'readonly', s => s.get(name));
    }
    async getAllRefs() {
        return this._tx('refs', 'readonly', s => s.getAll());
    }
}

// ==========================================
// 2. VERSION CONTROL SYSTEM
// ==========================================
class VCS {
    constructor(db) {
        this.db = db;

        // Runtime State
        this.HEAD = "main";           // Current branch name
        this.current_hash = null;     // Current commit hash
        this.is_dirty = false;        // Modified since last commit?

        // Working Directory (The Scroll)
        this.scroll = [""];           // Array of note pages
        this.scrollIndex = 0;         // Current page index
    }

    async init() {
        // Ensure 'main' branch exists
        let mainRef = await this.db.getRef("main");
        if (!mainRef) {
            await this.db.putRef({ branch_name: "main", head_commit_hash: null });
            console.log("📌 Created 'main' branch");
        } else {
            this.current_hash = mainRef.head_commit_hash;
            // Load snapshot if exists
            if (this.current_hash) {
                const commit = await this.db.getObject(this.current_hash);
                if (commit) {
                    this.scroll = commit.scroll_snapshot;
                }
            }
        }
        console.log(`🌿 HEAD -> ${this.HEAD} @ ${this.current_hash || 'empty'}`);
    }

    // --- SCROLL NAVIGATION ---

    push() {
        // Only push if current page has content
        if (this.scroll[this.scrollIndex].trim() === "") {
            UI.flash("Current page is empty!");
            return;
        }
        // Create new blank page
        this.scroll.splice(this.scrollIndex + 1, 0, "");
        this.scrollIndex++;
        this.is_dirty = true;
        UI.log(`📄 New page created at index ${this.scrollIndex}`);
        this.updateUI();
    }

    pull() {
        if (this.scrollIndex > 0) {
            this.scrollIndex--;
            UI.log(`📜 Pulled to page ${this.scrollIndex}`);
            this.updateUI();
        } else {
            UI.flash("Already at the first page.");
        }
    }

    // --- GIT-LIKE OPERATIONS ---

    generateHash() {
        // Simple hash: timestamp + random
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    async branch(branchName) {
        const existing = await this.db.getRef(branchName);
        if (existing) {
            throw new Error(`Branch '${branchName}' already exists`);
        }
        // Copy current HEAD's commit hash to new branch
        const currentRef = await this.db.getRef(this.HEAD);
        await this.db.putRef({
            branch_name: branchName,
            head_commit_hash: currentRef ? currentRef.head_commit_hash : null
        });
        UI.log(`🌿 Created branch '${branchName}'`);
    }

    async switch_branch(targetBranch) {
        if (this.is_dirty) {
            throw new Error("Uncommitted changes! Commit or discard first.");
        }
        const ref = await this.db.getRef(targetBranch);
        if (!ref) {
            throw new Error(`Branch '${targetBranch}' not found`);
        }

        this.HEAD = targetBranch;
        this.current_hash = ref.head_commit_hash;

        // Load snapshot
        if (this.current_hash) {
            const commit = await this.db.getObject(this.current_hash);
            this.scroll = commit ? [...commit.scroll_snapshot] : [""];
        } else {
            this.scroll = [""];
        }
        this.scrollIndex = 0;

        UI.log(`🔀 Switched to '${targetBranch}' @ ${this.current_hash || 'empty'}`);
        this.updateUI();
    }

    async commit(message) {
        if (!this.is_dirty && this.current_hash) {
            UI.flash("Nothing to commit.");
            return;
        }

        const newHash = this.generateHash();
        const currentRef = await this.db.getRef(this.HEAD);

        const commitObj = {
            commit_hash: newHash,
            parent_hash: currentRef ? currentRef.head_commit_hash : null,
            timestamp: Date.now(),
            scroll_snapshot: [...this.scroll], // Deep copy
            message: message || "No message"
        };

        // Save commit object
        await this.db.putObject(commitObj);

        // Move branch pointer
        await this.db.putRef({
            branch_name: this.HEAD,
            head_commit_hash: newHash
        });

        this.current_hash = newHash;
        this.is_dirty = false;

        UI.log(`✅ [${this.HEAD} ${newHash.slice(0, 7)}] ${message}`);
        this.updateUI();
    }

    async checkout(targetHash, force = false) {
        if (this.is_dirty && !force) {
            throw new Error("Uncommitted changes will be lost! Use force option.");
        }

        const commit = await this.db.getObject(targetHash);
        if (!commit) {
            throw new Error(`Commit '${targetHash}' not found`);
        }

        // Load snapshot
        this.scroll = [...commit.scroll_snapshot];
        this.scrollIndex = 0;

        // Move branch pointer (hard reset)
        await this.db.putRef({
            branch_name: this.HEAD,
            head_commit_hash: targetHash
        });
        this.current_hash = targetHash;
        this.is_dirty = false;

        UI.log(`⏪ Checked out ${targetHash.slice(0, 7)}`);
        this.updateUI();
    }

    async merge(sourceBranch) {
        const sourceRef = await this.db.getRef(sourceBranch);
        if (!sourceRef || !sourceRef.head_commit_hash) {
            throw new Error(`Branch '${sourceBranch}' has no commits`);
        }

        const sourceCommit = await this.db.getObject(sourceRef.head_commit_hash);
        if (!sourceCommit) {
            throw new Error("Source commit not found");
        }

        // Simple append strategy: add pages that don't exist
        const sourcePages = sourceCommit.scroll_snapshot;
        let added = 0;
        for (const page of sourcePages) {
            if (!this.scroll.includes(page) && page.trim() !== "") {
                this.scroll.push(page);
                added++;
            }
        }

        this.is_dirty = true;
        UI.log(`🔀 Merged '${sourceBranch}': Added ${added} pages. Don't forget to commit!`);
        this.updateUI();
    }

    async getLog() {
        const allCommits = await this.db.getAllObjects();
        // Sort by timestamp descending
        return allCommits.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getBranches() {
        return await this.db.getAllRefs();
    }

    // --- UI SYNC ---
    updateUI() {
        UI.setScroll(this.scroll[this.scrollIndex]);
        UI.setStatus(this.HEAD, this.current_hash, this.is_dirty, this.scrollIndex, this.scroll.length);
    }

    markDirty() {
        this.is_dirty = true;
        UI.setDirty(true);
    }

    setCurrentPage(text) {
        this.scroll[this.scrollIndex] = text;
    }
}

// ==========================================
// 3. UI CONTROLLER
// ==========================================
const UI = {
    textarea: null,
    statusBar: null,
    logArea: null,

    init() {
        this.textarea = document.getElementById('editor');
        this.statusBar = document.getElementById('status-bar');
        this.logArea = document.getElementById('log-area');
    },

    setScroll(text) {
        if (this.textarea) {
            this.textarea.value = text || "";
        }
    },

    setStatus(branch, hash, dirty, pageIdx, totalPages) {
        if (this.statusBar) {
            const dirtyMark = dirty ? " *" : "";
            const hashShort = hash ? hash.slice(0, 7) : "empty";
            this.statusBar.textContent = `🌿 ${branch}${dirtyMark} | 📍 ${hashShort} | 📄 ${pageIdx + 1}/${totalPages}`;
        }
    },

    setDirty(dirty) {
        // Update dirty indicator in status
    },

    log(msg) {
        console.log(msg);
        if (this.logArea) {
            const line = document.createElement('div');
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            this.logArea.prepend(line);
            // Keep only last 20 lines
            while (this.logArea.children.length > 20) {
                this.logArea.removeChild(this.logArea.lastChild);
            }
        }
    },

    flash(msg) {
        alert(msg);
    },

    async renderBranches(vcs) {
        const branches = await vcs.getBranches();
        const container = document.getElementById('branch-list');
        if (!container) return;
        container.innerHTML = '';
        for (const b of branches) {
            const div = document.createElement('div');
            div.className = 'branch-item' + (b.branch_name === vcs.HEAD ? ' active' : '');
            div.textContent = b.branch_name;
            div.onclick = async () => {
                try {
                    await vcs.switch_branch(b.branch_name);
                    UI.renderBranches(vcs);
                } catch (e) {
                    UI.flash(e.message);
                }
            };
            container.appendChild(div);
        }
    },

    async renderLog(vcs) {
        const commits = await vcs.getLog();
        const container = document.getElementById('commit-list');
        if (!container) return;
        container.innerHTML = '';
        for (const c of commits) {
            const div = document.createElement('div');
            div.className = 'commit-item' + (c.commit_hash === vcs.current_hash ? ' current' : '');
            div.innerHTML = `
                <span class="hash">${c.commit_hash.slice(0, 7)}</span>
                <span class="msg">${c.message}</span>
                <span class="time">${new Date(c.timestamp).toLocaleString()}</span>
            `;
            div.onclick = async () => {
                if (confirm(`Checkout ${c.commit_hash.slice(0, 7)}?`)) {
                    try {
                        await vcs.checkout(c.commit_hash, true);
                        UI.renderLog(vcs);
                    } catch (e) {
                        UI.flash(e.message);
                    }
                }
            };
            container.appendChild(div);
        }
    }
};

// ==========================================
// 4. BOOTSTRAP
// ==========================================
let vcs = null;

async function main() {
    UI.init();

    const db = new DBManager();
    await db.open();

    vcs = new VCS(db);
    await vcs.init();
    vcs.updateUI();

    // Bind UI Events
    const editor = document.getElementById('editor');
    let debounceTimer;
    editor.addEventListener('input', (e) => {
        vcs.setCurrentPage(e.target.value);
        vcs.markDirty();

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Auto-save to IDB could go here
        }, 500);
    });

    // Buttons
    document.getElementById('btn-push').onclick = () => vcs.push();
    document.getElementById('btn-pull').onclick = () => vcs.pull();

    document.getElementById('btn-commit').onclick = async () => {
        const msg = prompt("Commit message:");
        if (msg !== null) {
            await vcs.commit(msg);
            UI.renderLog(vcs);
        }
    };

    document.getElementById('btn-branch').onclick = async () => {
        const name = prompt("New branch name:");
        if (name) {
            try {
                await vcs.branch(name);
                UI.renderBranches(vcs);
            } catch (e) {
                UI.flash(e.message);
            }
        }
    };

    document.getElementById('btn-merge').onclick = async () => {
        const name = prompt("Merge from branch:");
        if (name) {
            try {
                await vcs.merge(name);
            } catch (e) {
                UI.flash(e.message);
            }
        }
    };

    // Initial render
    UI.renderBranches(vcs);
    UI.renderLog(vcs);
    UI.log("🚀 VCS Ready");
}

document.addEventListener('DOMContentLoaded', main);

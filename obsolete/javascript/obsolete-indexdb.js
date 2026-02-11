const indexDB = window.indexedDB;

let db;

export function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexDB.open("blackboard", 1);

        request.onerror = (e) => {
            console.error("IndexDB error: " + e);
            reject(e);
        }

        request.onupgradeneeded = (e) => {
            const db = request.result;
            // 修正：補上第二個參數 keyPath
            const storeScroll = db.createObjectStore("scroll", { keyPath: ["scrollName", "index"] });
            storeScroll.createIndex("timeStamp", "timeStamp", { unique: false });
        }

        request.onsuccess = (e) => {
            db = request.result;
            console.log("IndexedDB blackboard ready.");
            resolve(db);
        }
    });
}

export function getDisplayContent(scrollName) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");

        const tx = db.transaction("scroll", "readonly");
        const store = tx.objectStore("scroll");

        // Step 1: Get Metadata (view_index) at index -1
        const reqMeta = store.get([scrollName, -1]);

        reqMeta.onsuccess = () => {
            const meta = reqMeta.result;
            const viewIndex = meta ? meta.view_index : 0;

            // Step 2: Get Content (Draft at 0, History at 1+)
            const reqContent = store.get([scrollName, viewIndex]);

            reqContent.onsuccess = () => {
                resolve(reqContent.result ? reqContent.result.content : "");
            };
            reqContent.onerror = () => resolve("");
        };
        reqMeta.onerror = () => resolve("");
    });
}

// 新增功能：重整時強制回到最新歷史記錄 (Index 1)
export function resetToLatestHistory(scrollName) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");
        const tx = db.transaction("scroll", "readwrite");
        const store = tx.objectStore("scroll");

        // Check if index 1 exists (History exists)
        store.get([scrollName, 1]).onsuccess = (e) => {
            if (e.target.result) {
                // History exists, set Metadata to view_index 1
                const meta = { scrollName: scrollName, index: -1, view_index: 1 };
                store.put(meta);

                // Return content of index 1
                resolve(e.target.result.content);
            } else {
                // No history, stick to 0 (default)
                store.get([scrollName, -1]).onsuccess = (e2) => {
                    let meta = e2.target.result || { scrollName: scrollName, index: -1, view_index: 0 };
                    if (meta.view_index !== 0) {
                        meta.view_index = 0;
                        store.put(meta);
                    }
                    // Get draft content
                    store.get([scrollName, 0]).onsuccess = (e3) => {
                        resolve(e3.target.result ? e3.target.result.content : "");
                    };
                };
            }
        };
    });
}

export function updateDraft(scrollName, content) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");

        const tx = db.transaction("scroll", "readwrite");
        const store = tx.objectStore("scroll");

        // Step 1: Get View Index
        const reqMeta = store.get([scrollName, -1]);

        reqMeta.onsuccess = () => {
            const meta = reqMeta.result || { scrollName: scrollName, index: -1, view_index: 0 };
            const viewIndex = meta.view_index;

            store.put({
                scrollName: scrollName,
                index: viewIndex,
                content: content,
                timeStamp: Date.now()
            });
            resolve(true);
        };
        reqMeta.onerror = () => reject("Meta read failed");
    });
}

export function getStackStatus(scrollName) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");

        const tx = db.transaction("scroll", "readonly");
        const store = tx.objectStore("scroll");

        // Get View Index
        const reqMeta = store.get([scrollName, -1]);

        reqMeta.onsuccess = () => {
            const meta = reqMeta.result || { view_index: 0 };
            const viewIndex = meta.view_index;
            resolve(viewIndex === 0 ? "Draft" : `${viewIndex}/?`);
        };
    });
}

export function push(scrollName) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");
        const tx = db.transaction("scroll", "readwrite");
        const store = tx.objectStore("scroll");

        store.get([scrollName, -1]).onsuccess = (e) => {
            const meta = e.target.result || { scrollName, index: -1, view_index: 0 };

            // Case 1: Navigating Back (History -> Draft direction)
            if (meta.view_index > 0) {
                meta.view_index--;
                store.put(meta);

                store.get([scrollName, meta.view_index]).onsuccess = (e2) => {
                    resolve({ action: 'nav', content: e2.target.result ? e2.target.result.content : "" });
                };
            }
            // Case 2: Pushing Draft to History
            else {
                store.get([scrollName, 0]).onsuccess = (e2) => {
                    const draft = e2.target.result ? e2.target.result.content : "";
                    if (!draft || draft.trim() === "") {
                        return resolve({ action: 'ignore', content: draft });
                    }

                    const MAX_HISTORY = 10;
                    const range = IDBKeyRange.bound([scrollName, 1], [scrollName, MAX_HISTORY]);

                    store.getAll(range).onsuccess = (e3) => {
                        const historyItems = e3.target.result || [];

                        // Update existing items index++
                        historyItems.forEach(item => {
                            if (item.index < MAX_HISTORY) {
                                store.put({ ...item, index: item.index + 1 });
                            }
                        });

                        // Insert new item at 1
                        store.put({
                            scrollName: scrollName,
                            index: 1,
                            content: draft,
                            timeStamp: Date.now()
                        });

                        // Clear Draft
                        store.put({
                            scrollName: scrollName,
                            index: 0,
                            content: "",
                            timeStamp: Date.now()
                        });

                        resolve({ action: 'new', content: '' });
                    };
                };
            }
        };
    });
}

export function pull(scrollName) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not ready");
        const tx = db.transaction("scroll", "readwrite");
        const store = tx.objectStore("scroll");

        store.get([scrollName, -1]).onsuccess = (e) => {
            const meta = e.target.result || { scrollName, index: -1, view_index: 0 };
            const nextIndex = meta.view_index + 1;

            store.get([scrollName, nextIndex]).onsuccess = (e2) => {
                const nextItem = e2.target.result;
                if (nextItem) {
                    meta.view_index = nextIndex;
                    store.put(meta);
                    resolve({ action: 'nav', content: nextItem.content });
                } else {
                    resolve({ action: 'stop', content: null });
                }
            };
        };
    });
}
import db, { Dexie } from "./indexedDB.js"
import { ToastMessager } from "./toast.js"

const toast = new ToastMessager()

const DRAFT_TIMESTAMP = Number.MAX_SAFE_INTEGER

function getHKTTimestamp(dateInput) {
    const now = dateInput ? new Date(dateInput) : new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const hkt = new Date(utc + (3600000 * 8));
    return hkt.toISOString().replace('Z', '+08:00');
}

db.on("populate", async () => {
    await db.blackboard.add({
        owner: "guest",
        branch: "master",
        timestamp: DRAFT_TIMESTAMP,
        text: "",
        bin: "",
        createdAt: getHKTTimestamp()
    });
});

if (!localStorage.getItem('currentUser')) {
    localStorage.setItem("currentUser", "guest")
    localStorage.setItem("currentBranch", "master")
}

let currentUserBranch = {
    owner: localStorage.getItem("currentUser"),
    branch: localStorage.getItem("currentBranch")
}

let currentHead = 0
// Just adjust this, 10 is for the concern of localStorage initially
let maxSlot = 10

let $pushBtn = document.querySelector(".push-btn")
let $pullBtn = document.querySelector(".pull-btn")
let $branchNameIndicator = document.querySelector(".branch-name")
let $branchHeadIndicator = document.querySelector(".branch-head")
let $branchSavedIndicator = document.querySelector(".branch-is-saved")
let $blackboardTextarea = document.getElementById("log-textarea")
let $branchListContainer = document.querySelector('[data-page="blackboard-branch"] .vcs-list-container')
let $branchBtn = document.getElementById("branch-btn")
let $checkoutBtn = document.getElementById("checkout-btn")
let $dropBtn = document.getElementById("drop-btn")

    ; (async () => {
        await setTextarea(currentHead)
        updateIndicators()
        await updateBranchList()
    })()

$pushBtn.addEventListener("click", push)
$pullBtn.addEventListener("click", pull)
$branchBtn.addEventListener("click", createBranch)
$checkoutBtn.addEventListener("click", checkoutBranch)
$dropBtn.addEventListener("click", dropBranch)

async function push() {
    await saveToDB()
    clearTimeout(debounceTimer)

    if (!$blackboardTextarea.value.trim()) return
    if (currentHead > 0) {
        currentHead--
        await setTextarea(currentHead)
        updateIndicators()
        return
    }

    const textToPush = $blackboardTextarea.value.trim()

    // 1. Add new Commit (History)
    await db.blackboard.add({
        ...currentUserBranch,
        timestamp: Date.now(),
        text: textToPush,
        bin: ""
    })

    // 2. Reset Draft (The record with MAX_TIMESTAMP)
    const draft = await db.blackboard.where('[owner+branch+timestamp]')
        .equals([currentUserBranch.owner, currentUserBranch.branch, DRAFT_TIMESTAMP])
        .first()

    if (draft) {
        draft.text = ""
        await db.blackboard.put(draft)
    } else {
        await db.blackboard.add({
            ...currentUserBranch,
            timestamp: DRAFT_TIMESTAMP,
            text: "",
            bin: "",
            createdAt: getHKTTimestamp()
        })
    }

    // 3. Prune old records (Keep maxSlot items total)
    const collection = db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )

    const count = await collection.count()

    if (count > maxSlot) {
        // Delete oldest records
        // We want to keep the newest 'maxSlot' items.
        // In natural sort order (oldest first), we delete the first (count - maxSlot) items.
        const keysToDelete = await collection
            .limit(count - maxSlot)
            .primaryKeys()

        await db.blackboard.bulkDelete(keysToDelete)
    }

    $blackboardTextarea.value = ""
    updateIndicators()
    await updateBranchList()
}

async function pull() {
    const count = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .count()

    if (currentHead < count - 1) {
        await saveToDB()
        clearTimeout(debounceTimer)
        currentHead++
        await setTextarea(currentHead)
        updateIndicators()
    }
}

async function setTextarea(index) {
    // Get the N-th newest item (Reverse order)
    const entry = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .reverse()
        .offset(index)
        .first()

    // If no entry found (e.g. fresh install with no data and populate didn't run), default to empty string
    // Also ensures we handle the case where draft might be missing efficiently
    $blackboardTextarea.value = entry?.text ?? ""

    // If we are at Head 0 (Draft) and it doesn't exist in DB, we treat it as empty draft.
    // The push function will create it.
}

function updateIndicators() {
    $branchNameIndicator.textContent = currentUserBranch.branch
    $branchHeadIndicator.textContent = currentHead
    $branchSavedIndicator.textContent = "SAVED"
}

let debounceTimer = null

$blackboardTextarea.addEventListener("input", () => {
    $branchSavedIndicator.textContent = "UNSAVED"
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(saveToDB, 500)
})

async function saveToDB() {
    const textToSave = $blackboardTextarea.value
    const targetHead = currentHead

    const entry = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        )
        .reverse()
        .offset(targetHead)
        .first()

    if (entry) {
        if (entry.text !== textToSave) {
            await db.blackboard.update(entry.id, { text: textToSave })
        }
    } else if (targetHead === 0) {
        await db.blackboard.add({
            ...currentUserBranch,
            timestamp: DRAFT_TIMESTAMP,
            text: textToSave,
            bin: "",
            createdAt: getHKTTimestamp()
        })
    }

    if ($blackboardTextarea.value === textToSave) {
        $branchSavedIndicator.textContent = "SAVED"
    }
}

async function updateBranchList() {
    if (!$branchListContainer) return

    const branches = new Map() // branchName -> { owner, draftRecord, earliestTimestamp }

    await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, Dexie.minKey, Dexie.minKey],
            [currentUserBranch.owner, Dexie.maxKey, Dexie.maxKey]
        )
        .reverse()
        .each(record => {
            let info = branches.get(record.branch)
            if (!info) {
                info = { owner: record.owner, draftRecord: null, earliestTimestamp: null }
                branches.set(record.branch, info)
            }

            if (record.timestamp === DRAFT_TIMESTAMP) {
                info.draftRecord = record
            } else {
                // Since iterating reverse (Newest first), the last one we see is oldest
                info.earliestTimestamp = record.timestamp
            }
        })

    $branchListContainer.innerHTML = ""

    for (const [branchName, info] of branches) {
        let displayTime = "unknown"
        let timestampToSave = null

        // Determine correct timestamp
        if (info.draftRecord && info.draftRecord.createdAt) {
            displayTime = info.draftRecord.createdAt
        } else {
            // Missing createdAt. Heal it.
            // Use earliest commit time (formatted), or current HKT time if totally empty
            displayTime = getHKTTimestamp(info.earliestTimestamp)
            timestampToSave = displayTime
        }

        // Heal DB if needed
        if (timestampToSave && info.draftRecord) {
            await db.blackboard.update(info.draftRecord.id, { createdAt: timestampToSave })
            // Update memory so next check passes/consistency
            info.draftRecord.createdAt = timestampToSave
        }

        const item = document.createElement("div")
        item.classList.add("vcs-list-item")
        if (currentUserBranch.branch === branchName) {
            item.classList.add("active")
        }

        item.innerHTML = `
            <input type="text" class="vcs-list-branch" value="${branchName}" placeholder="branch name" name="vcs-list-branch" maxlength="32">
            <div class="vcs-list-timestamp">${displayTime}</div>
            <div class="vcs-list-owner">${info.owner}</div>
        `

        const input = item.querySelector(".vcs-list-branch")

        input.addEventListener("click", (e) => {
            // e.stopPropagation()
            // Allow click to bubble so InfiniteList can handle 'active' class
        })

        input.addEventListener("change", async (e) => {
            const newName = e.target.value.trim()
            if (newName && newName !== branchName) {
                await renameBranch(branchName, newName)
            } else {
                e.target.value = branchName
            }
        })

        // item.addEventListener("click", async () => {
        //     if (currentUserBranch.branch !== branchName) {
        //         await switchBranch(branchName)
        //     }
        // })

        $branchListContainer.appendChild(item)
    }
}

async function switchBranch(branchName) {
    if (currentUserBranch.branch === branchName) return

    await saveToDB()

    currentUserBranch.branch = branchName
    localStorage.setItem("currentBranch", branchName)

    currentHead = 0
    await setTextarea(currentHead)
    updateIndicators()
    updateBranchList()
}

async function renameBranch(oldName, newName) {
    if (oldName === newName) return

    const existing = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, newName, Dexie.minKey],
            [currentUserBranch.owner, newName, Dexie.maxKey]
        ).count()

    if (existing > 0) {
        toast.addMessage(`System: Branch "${newName}" already exists.`)
        await updateBranchList()
        return
    }

    const records = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, oldName, Dexie.minKey],
            [currentUserBranch.owner, oldName, Dexie.maxKey]
        ).toArray()

    await db.transaction('rw', db.blackboard, async () => {
        for (const record of records) {
            await db.blackboard.update(record.id, { branch: newName })
        }
    })

    if (currentUserBranch.branch === oldName) {
        currentUserBranch.branch = newName
        localStorage.setItem("currentBranch", newName)
        updateIndicators()
    }

    await updateBranchList()
}

async function createBranch() {
    const timestamp = getHKTTimestamp()
    const newBranchName = timestamp // Use timestamp as default branch name

    // Confirm uniqueness (though timestamp is likely unique)
    const existing = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, newBranchName, Dexie.minKey],
            [currentUserBranch.owner, newBranchName, Dexie.maxKey]
        ).count()

    if (existing > 0) {
        toast.addMessage(`System: Branch "${newBranchName}" already exists.`)
        await updateBranchList()
        return
    }

    // Get all records from current branch
    const records = await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.minKey],
            [currentUserBranch.owner, currentUserBranch.branch, Dexie.maxKey]
        ).toArray()

    // Transactionally duplicate them
    await db.transaction('rw', db.blackboard, async () => {
        let currentDraftText = ""
        let currentDraftBin = ""

        // Copy history (Exclude Draft)
        for (const record of records) {
            if (record.timestamp === DRAFT_TIMESTAMP) {
                // Capture current draft content
                currentDraftText = record.text
                currentDraftBin = record.bin
                continue
            }

            await db.blackboard.add({
                owner: record.owner,
                branch: newBranchName,
                timestamp: record.timestamp,
                text: record.text,
                bin: record.bin
            })
        }

        // Create new Draft for the new branch with Creation Timestamp AND content from current draft
        await db.blackboard.add({
            owner: currentUserBranch.owner,
            branch: newBranchName,
            timestamp: DRAFT_TIMESTAMP,
            text: currentDraftText,
            bin: currentDraftBin,
            createdAt: timestamp
        })
    })

    // Update list to show new branch
    await updateBranchList()
}

async function checkoutBranch() {
    // Find the actively selected item (handled by blackboard-vcs.js or similar logic)
    // Note: Since we rely on InfiniteList logic or manual selection, we look for '.active'
    const activeItem = $branchListContainer.querySelector(".vcs-list-item.active")
    if (!activeItem) return

    const input = activeItem.querySelector(".vcs-list-branch")
    const branchName = input.value

    if (branchName) {
        await switchBranch(branchName)
    }
}

async function dropBranch() {
    const activeItem = $branchListContainer.querySelector(".vcs-list-item.active")
    if (!activeItem) return

    const input = activeItem.querySelector(".vcs-list-branch")
    const branchNameToDrop = input.value
    const owner = currentUserBranch.owner

    // Count unique branches to decide logic
    const uniqueBranches = new Set()
    await db.blackboard.where('[owner+branch+timestamp]')
        .between(
            [owner, Dexie.minKey, Dexie.minKey],
            [owner, Dexie.maxKey, Dexie.maxKey]
        )
        .each(record => {
            uniqueBranches.add(record.branch)
        })

    const hasParent = uniqueBranches.size > 1

    if (hasParent) {
        // Drop itself (Delete the branch)
        // Direct execute as per instruction
        await db.transaction('rw', db.blackboard, async () => {
            await db.blackboard.where('[owner+branch+timestamp]')
                .between(
                    [owner, branchNameToDrop, Dexie.minKey],
                    [owner, branchNameToDrop, Dexie.maxKey]
                ).delete()
        })

        toast.addMessage(`System: Branch "${branchNameToDrop}" deleted.`)

        // If we dropped the current branch, switch to another
        if (branchNameToDrop === currentUserBranch.branch) {
            uniqueBranches.delete(branchNameToDrop)
            // Prefer master, else first available
            const fallback = uniqueBranches.has('master') ? 'master' : uniqueBranches.values().next().value
            await switchBranch(fallback)
        } else {
            await updateBranchList()
        }
    } else {
        // No parent (Last branch) -> Clean the record (Wipe)
        // Direct execute as per instruction
        await db.transaction('rw', db.blackboard, async () => {
            await db.blackboard.where('[owner+branch+timestamp]')
                .between(
                    [owner, branchNameToDrop, Dexie.minKey],
                    [owner, branchNameToDrop, Dexie.maxKey]
                ).delete()

            // Restore empty draft
            await db.blackboard.add({
                owner: owner,
                branch: branchNameToDrop,
                timestamp: DRAFT_TIMESTAMP,
                text: "",
                bin: ""
            })
        })

        toast.addMessage(`System: Branch "${branchNameToDrop}" wiped.`)

        if (branchNameToDrop === currentUserBranch.branch) {
            currentHead = 0
            await setTextarea(currentHead)
            updateIndicators()
        }
        await updateBranchList()
    }
}

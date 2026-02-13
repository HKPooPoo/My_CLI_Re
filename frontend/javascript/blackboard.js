import db, { Dexie } from "./indexedDB.js"

const DRAFT_TIMESTAMP = Number.MAX_SAFE_INTEGER

db.on("populate", async () => {
    await db.blackboard.add({
        owner: "guest",
        branch: "master",
        timestamp: DRAFT_TIMESTAMP,
        text: "",
        bin: ""
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

    ; (async () => {
        await setTextarea(currentHead)
        updateIndicators()
    })()

$pushBtn.addEventListener("click", push)
$pullBtn.addEventListener("click", pull)

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
            bin: ""
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
            bin: ""
        })
    }

    if ($blackboardTextarea.value === textToSave) {
        $branchSavedIndicator.textContent = "SAVED"
    }
}

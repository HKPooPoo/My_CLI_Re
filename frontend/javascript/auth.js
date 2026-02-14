import { ToastMessager } from "./toast.js";
import db, { Dexie } from "./indexedDB.js";

const toast = new ToastMessager();

const $uidInput = document.getElementById("auth-uid");
const $passcodeInput = document.getElementById("auth-passcode");
const $loginBtn = document.getElementById("btn-login");
const $registerBtn = document.getElementById("btn-register");
const $logoutBtn = document.getElementById("btn-logout");
const $loginStatusDisplay = document.getElementById("login-status-display");

const $loginRegisterContainer = document.querySelector(".auth-login-register-container");
const $logoutContainer = document.querySelector(".auth-logout-container");
const $authShowUidContainer = document.querySelector(".auth-show-uid-container");

// Sync Logic
async function syncDown(uid) {
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });

        if (!response.ok) return; // Silent fail or toast?

        const data = await response.json();
        const records = data.records;

        if (records && records.length > 0) {
            await db.transaction('rw', db.blackboard, async () => {
                for (const record of records) {
                    // Check existence to prevent duplicates if sync runs multiple times or partial state
                    const existing = await db.blackboard.where('[owner+branch+timestamp]')
                        .equals([record.owner, record.branch, record.timestamp])
                        .first();

                    if (!existing) {
                        await db.blackboard.add(record);
                    } else {
                        // Update content if needed? Assume Server is truth?
                        // For 'checkout', yes.
                        await db.blackboard.update(existing.id, record);
                    }
                }
            });
        }
    } catch (e) {
        console.error("Sync Error:", e);
    }
}

async function cleanupAndLogout() {
    const currentUser = localStorage.getItem("currentUser");
    if (currentUser && currentUser !== "guest") {
        // Delete all records belonging to this user
        await db.blackboard.where('[owner+branch+timestamp]')
            .between(
                [currentUser, Dexie.minKey, Dexie.minKey],
                [currentUser, Dexie.maxKey, Dexie.maxKey]
            )
            .delete();
    }

    // Clear Session
    localStorage.setItem("currentUser", "guest");
    updateHUD("guest");
    toast.addMessage("System: Logged out.");

    // Refresh
    setTimeout(() => window.location.reload(), 1000);
}


// Helper to update HUD and UI visibility
function updateHUD(username) {
    if ($loginStatusDisplay) {
        $loginStatusDisplay.textContent = username;
    }

    // Toggle UI visibility
    if (username && username !== "guest") {
        // Logged in
        if ($loginRegisterContainer) $loginRegisterContainer.style.display = "none";
        if ($logoutContainer) $logoutContainer.style.display = "flex";
        if ($authShowUidContainer) $authShowUidContainer.textContent = username;
    } else {
        // Logged out / Guest
        if ($loginRegisterContainer) $loginRegisterContainer.style.display = "flex";
        if ($logoutContainer) $logoutContainer.style.display = "none";
        if ($authShowUidContainer) $authShowUidContainer.textContent = "";
    }
}

// Initial check on load
// We don't reload here, just update UI
updateHUD(localStorage.getItem("currentUser") || "guest");

// Override console.log or similar to trigger updates in blackboard.js? 
// No, the clean way is to reload the page to let blackboard.js re-init with new localStorage values.

// Login
if ($loginBtn) {
    $loginBtn.addEventListener("click", async () => {
        const uid = $uidInput.value.trim();
        const passcode = $passcodeInput.value.trim();

        if (!uid || !passcode) {
            toast.addMessage("System: UID and Passcode required.");
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ uid, passcode })
            });

            const data = await response.json();

            if (response.ok) {
                // Login Success
                localStorage.setItem("currentUser", data.user.uid);
                // Optionally update currentBranch logic if needed, 
                // but for now just switch user identity.
                updateHUD(data.user.uid);
                toast.addMessage(`System: Welcome back, ${data.user.uid}.`);

                // Reset inputs
                $uidInput.value = "";
                $passcodeInput.value = "";

                // Sync Data
                toast.addMessage(`System: Syncing data...`);
                await syncDown(data.user.uid);

                // RELOAD page to re-init blackboard with new user
                setTimeout(() => window.location.reload(), 1000);
            } else {
                toast.addMessage(`Error: ${data.message || 'Login failed'}`);
            }
        } catch (error) {
            console.error(error);
            toast.addMessage("Error: Connection failed.");
        }
    });
}

// Register
if ($registerBtn) {
    $registerBtn.addEventListener("click", async () => {
        const uid = $uidInput.value.trim();
        const passcode = $passcodeInput.value.trim();

        if (!uid || !passcode) {
            toast.addMessage("System: UID and Passcode required.");
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ uid, passcode })
            });

            const data = await response.json();

            if (response.ok) {
                toast.addMessage("System: Registration successful. Please login.");
            } else {
                toast.addMessage(`Error: ${data.message || 'Registration failed'}`);
            }
        } catch (error) {
            console.error(error);
            toast.addMessage("Error: Connection failed.");
        }
    });
}

// Logout
if ($logoutBtn) {
    $logoutBtn.addEventListener("click", cleanupAndLogout);
}

import { playAudio } from "./audio.js";

const ONLINE_STR = "ONLINE"
const OFFLINE_STR = "OFFLINE"

const dbStatusDisplay = document.getElementById("db-status-display");
const loginStatusDisplay = document.getElementById("login-status-display");

function updateLoginStatus() {
    const currentUser = localStorage.getItem("currentUser");
    loginStatusDisplay.textContent = currentUser;
}
updateLoginStatus();

async function updateDatabaseStatus() {
    // status.php
    try {
        const response = await fetch('/api/status');
        const responseJSON = await response.json();

        if (responseJSON.status === ONLINE_STR) {
            if (isStatusHasNoChange(ONLINE_STR)) return; //Avoid replaceCrtTextColorBy() refresh color on same status
            replaceCrtTextColorBy("crt-text-green");
            dbStatusDisplay.textContent = ONLINE_STR
        } else if (responseJSON.status === OFFLINE_STR) {
            if (isStatusHasNoChange(OFFLINE_STR)) return;
            replaceCrtTextColorBy("crt-text-red");
            dbStatusDisplay.textContent = OFFLINE_STR
        }
    } catch (error) {
        console.error("DB Status Check Failed:", error);
        replaceCrtTextColorBy("crt-text-red");
        dbStatusDisplay.textContent = "ERROR";
    }

}

// crt-vfx.css def
function replaceCrtTextColorBy(crtTextColor) {
    dbStatusDisplay.classList.remove("crt-text-green");
    dbStatusDisplay.classList.remove("crt-text-orange");
    dbStatusDisplay.classList.remove("crt-text-red");

    dbStatusDisplay.classList.add(crtTextColor);
}

//Avoid replaceCrtTextColorBy() refresh color on same status
let previousStatus = "CONNECTING...";

function isStatusHasNoChange(nextStatus) {
    if (nextStatus === previousStatus) return true;
    previousStatus = nextStatus;
    return false;
}

//theme change (dark and light)
let localStorageSavedTheme = localStorage.getItem("data-theme"); // localStorage save theme
let crtMode = localStorageSavedTheme === "light" ? false : true;
if (!crtMode) document.documentElement.setAttribute("data-theme", "light");
document.getElementById("theme-change-btn").addEventListener("click", () => {
    playAudio("UIPipboyOKPress.mp3");
    if (crtMode) {
        document.documentElement.setAttribute("data-theme", "light");
        crtMode = false;
        localStorage.setItem("data-theme", "light");
    } else {
        document.documentElement.removeAttribute("data-theme");
        crtMode = true;
        localStorage.setItem("data-theme", "");
    }
})

replaceCrtTextColorBy("crt-text-orange") // Initially, it is "CONNECTING..." in orange
updateDatabaseStatus();
setInterval(updateDatabaseStatus, 8964);
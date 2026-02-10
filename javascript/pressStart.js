import { setActiveNaviItem, updateNaviPosition } from "./navi.js";

const overlay = document.getElementById("press-start-overlay");

let justGainedFocus = false;
let focusTimer;
let firstTriggered = false;

/**
 * Must focus on windows before allow trigger click event
 */
window.addEventListener("focus", () => {
    justGainedFocus = true;

    clearTimeout(focusTimer); //no blur timer after re-focus

    setTimeout(() => {
        justGainedFocus = false;
    }, 200)
})

/**
 * 1. First access will not have animation, but static press-start-overlay
 * 2. After press-start-overlay was triggered, later manifest will have animation
 */
overlay.addEventListener("blur", () => {
    if (!firstTriggered) return;

    overlay.classList.add("crt-switch-on");
})

/**
 * 1. If press-start-overlay is manifest, allow click to close + animation
 */
overlay.addEventListener("click", () => {
    if (!overlay.style.display === "flex" || justGainedFocus) return;

    overlay.classList.add("crt-switch-off");

    // Auto select blackboard-log on first trigger (no -ed)
    if (!firstTriggered) {
        if (!localStorage.getItem("navi-item-head")) localStorage.setItem("navi-item-head", "blackboard");
        setActiveNaviItem(document.querySelector(`.navi-item[data-navi-item="${localStorage.getItem("navi-item-head")}"]`));
        updateNaviPosition(`${localStorage.getItem("navi-item-head")}`);
        firstTriggered = true;
    }
})

/**
 * Destroy animated class
 */
overlay.addEventListener("animationend", () => {
    if (overlay.classList.contains("crt-switch-on")) {
        overlay.classList.remove("crt-switch-on");
    }
    else if (overlay.classList.contains("crt-switch-off")) {
        overlay.classList.remove("crt-switch-off");
        overlay.style.display = "none";
    }
})

/**
 * Display press-start-overlay after 1 minute + revert animation
 */
window.addEventListener("blur", () => {
    if (overlay.style.display === "flex") return;

    focusTimer = setTimeout(() => {
        overlay.classList.add("crt-switch-on");
        overlay.style.display = "flex";
    }, 600000000) //default 60000
})
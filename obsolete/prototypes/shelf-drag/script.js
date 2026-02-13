const shelfContainer = document.getElementById('feature-shelf-container');
const backBtn = document.getElementById('feature-shelf-back-btn');
const featureBtns = document.querySelectorAll('[data-feature-btn]');
const shelves = document.querySelectorAll('[data-feature-shelf]');

let isDragging = false;
let startX = 0;
let currentTranslateX = 0; // Initialize at 0 (closed)
let startTranslateX = 0;
const DEFAULT_OPEN_WIDTH = 64; // 64vw

// 1. Handle Feature Button Clicks
featureBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-feature-btn');
        if (!targetId) return; // N/A button

        // Show the correct shelf content
        shelves.forEach(shelf => {
            if (shelf.getAttribute('data-feature-shelf') === targetId) {
                shelf.style.display = 'flex';
                // If specific shelf has its own display logic (like block vs flex), handle here.
                // The CSS sets .feature-shelf to display:none, and specific ones might need flex.
                // For this prototype, 'flex' generic style handles it well for the container content.
            } else {
                shelf.style.display = 'none';
            }
        });

        // Open the shelf if it's closed or update position
        // If it's already open (some negative translate), we might just switch content.
        // But the user said "pop from right", implying an action.
        // If it is closed (0), open to default.
        if (currentTranslateX === 0) {
            openShelf();
        }
    });
});

function openShelf() {
    // Calculate 64vw in pixels
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const targetPx = -1 * (DEFAULT_OPEN_WIDTH / 100) * vw;

    setTransform(targetPx);
}

function closeShelf() {
    setTransform(0);
}

function setTransform(x) {
    currentTranslateX = x;
    shelfContainer.style.transform = `translate3d(${x}px, 0, 0)`;
}

// 2. Handle Dragging
backBtn.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startTranslateX = currentTranslateX;

    // Disable transition for real-time dragging
    shelfContainer.classList.add('no-transition');

    // Prevent text selection during drag
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    let newTranslateX = startTranslateX + deltaX;

    // Clamping
    // Max is 0 (closed, right edge)
    // Min is -window.innerWidth (fully open, left edge)
    const minTranslate = -window.innerWidth;
    const maxTranslate = 0;

    if (newTranslateX > maxTranslate) newTranslateX = maxTranslate;
    if (newTranslateX < minTranslate) newTranslateX = minTranslate;

    currentTranslateX = newTranslateX;
    shelfContainer.style.transform = `translate3d(${newTranslateX}px, 0, 0)`;
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        shelfContainer.classList.remove('no-transition');

        // Optional: Snap to closest state? (Open/Closed)
        // User said: "draged to adjust the position", implying it can stay anywhere.
        // So we leave it where it is.
    }
});

// 3. Handle Double Click to Close
backBtn.addEventListener('dblclick', () => {
    closeShelf();
});

// Handle Window Resize to keep the relative position?
// For now, simpler is better. If user resizes, the pixel value persists, 
// which might mean the shelf covers more/less percentage. 
// Ideally we might want to store percentage, but drag logic is easier in pixels.
window.addEventListener('resize', () => {
    // Ensure we don't go out of bounds if window shrinks
    const minTranslate = -window.innerWidth;
    if (currentTranslateX < minTranslate) {
        setTransform(minTranslate);
    }
});

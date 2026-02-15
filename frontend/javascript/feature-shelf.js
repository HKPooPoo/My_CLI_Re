/**
 * Feature Shelf - Lateral Dashboard Controller
 * =================================================================
 * 介紹：負責管理側邊展開式功能面板 (Feature Shelf) 的交互邏輯。
 * 職責：
 * 1. 抽屜式展開：控制面板在畫面右側的顯隱與位移。
 * 2. 自由拖拽 (Draggable)：支援透過手把按鈕進行水平拖拽調整寬度。
 * 3. 磁吸對齊 (Snapping)：拖拽結束後自動對齊至最近的預設百分比寬度。
 * 4. 內容分發：根據點擊的功能按鈕 ID，自動顯示對應的子面板 (如 Translator)。
 * 依賴：CSS 變數 (--shelf-open-width), no-transition class
 * =================================================================
 */

// --- DOM 引用 ---
const $featureShelfContainer = document.querySelector('.feature-shelf-container');
const $featureShelfBackBtn = document.querySelector('.feature-shelf-back-btn');
const $featureBtns = document.querySelectorAll('.feature-btn');
const $featureShelves = document.querySelectorAll('.feature-shelf');

// --- 拖拽狀態 ---
let isDragging = false;
let dragStartX = 0;
let initialTranslateX = 0;
let currentTranslateX = 0; // 當前實際位移 (負值表示向左展開)

const DEFAULT_OPEN_WIDTH_VW = 60; // 預設展開寬度 (視口 60%)

// --- 初始化監聽 ---
$featureBtns.forEach($btn => {
    $btn.addEventListener('click', () => handleFeatureBtnClick($btn));
});

// 手把拖拽 (PC 鼠標)
$featureShelfBackBtn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 防止文字選取干擾拖拽
    startDrag(e.clientX);
});

// 手把拖拽 (移動端觸控)
$featureShelfBackBtn.addEventListener('touchstart', (e) => {
    startDrag(e.touches[0].clientX);
}, { passive: false });

// 快速關閉：按兩下手把
$featureShelfBackBtn.addEventListener('dblclick', () => closeShelf());

// 窗口自動補償：縮放視窗時保持相對位置
window.addEventListener('resize', () => {
    if (currentTranslateX === 0) return;
    snapToNearestPosition();
});

/**
 * 功能按鈕點擊分發邏輯
 */
function handleFeatureBtnClick($clickedBtn) {
    const targetFeatureId = $clickedBtn.dataset.featureBtn;
    if (!targetFeatureId) return;

    // 特殊邏輯映射：如所有 translate-* 核心都指向同一個 translator 面板
    const shelfId = (id) => id.startsWith('translate-') ? 'translator' : id;
    const resolvedId = shelfId(targetFeatureId);

    const $targetShelf = document.querySelector(`.feature-shelf[data-feature-shelf="${resolvedId}"]`);
    if (!$targetShelf) return;

    // 1. 切換面板內部顯隱內容
    $featureShelves.forEach($shelf => {
        $shelf.style.display = ($shelf === $targetShelf) ? 'flex' : 'none';
    });

    // 2. 展開判定：若當前處於關閉或過窄狀態，則強制全開至預設寬度
    const targetOpenPx = calculateMaxOpenPx();
    if (currentTranslateX > targetOpenPx + 1) openShelf();
}

/**
 * 物理渲染執行
 */
function updateShelfTransform(translateX) {
    currentTranslateX = translateX;
    $featureShelfContainer.style.transform = `translate3d(${translateX}px, 0, 0)`;
}

// --- 輔助工具 ---
function getScreenWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
}

function calculateMaxOpenPx() {
    const screenWidth = getScreenWidth();
    const cssVar = getComputedStyle($featureShelfContainer).getPropertyValue('--shelf-open-width').trim();
    const widthVw = cssVar ? parseFloat(cssVar) : DEFAULT_OPEN_WIDTH_VW;
    return -1 * (widthVw / 100) * screenWidth;
}

function openShelf() {
    updateShelfTransform(calculateMaxOpenPx());
}

function closeShelf() {
    updateShelfTransform(0);
}

// --- 拖拽核心邏輯 ---

/**
 * 啟動拖拽
 * 步驟：1. 紀錄起點 2. 關閉 CSS 過渡效果 (加速反饋) 3. 綁定全域監聽器
 */
function startDrag(clientX) {
    isDragging = true;
    dragStartX = clientX;
    initialTranslateX = currentTranslateX;

    $featureShelfContainer.classList.add('no-transition');

    // 只有在拖拽中才監聽全域事件，優化性能
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
}

/**
 * 計算位移
 */
function handleDragMove(e) {
    if (!isDragging) return;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - dragStartX;
    let newTranslateX = initialTranslateX + deltaX;

    // 邊界約束：0 (關閉) ~ -100% (全開)
    const maxTranslate = 0;
    const minTranslate = -getScreenWidth();

    if (newTranslateX > maxTranslate) newTranslateX = maxTranslate;
    if (newTranslateX < minTranslate) newTranslateX = minTranslate;

    updateShelfTransform(newTranslateX);
}

/**
 * 結束並磁吸
 * 步驟：1. 解除全域監聽 2. 恢復 CSS 過渡動畫 3. 根據當前位置吸附到最近節點
 */
function handleDragEnd() {
    if (!isDragging) return;

    isDragging = false;
    $featureShelfContainer.classList.remove('no-transition');

    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);

    snapToNearestPosition();
}

/**
 * 磁吸對齊邏輯
 * 邏輯：定義一系列百分比斷點 (0%, 40%, 60%...)，找出與當前位置最接近的一個，強制平滑移動過去。
 */
function snapToNearestPosition() {
    const screenWidth = getScreenWidth();
    const snapRatios = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]; // 定義感應磁點
    const snapPositions = snapRatios.map(ratio => -1 * ratio * screenWidth);

    let closestPosition = 0;
    let minDiff = Infinity;

    snapPositions.forEach(pos => {
        const diff = Math.abs(currentTranslateX - pos);
        if (diff < minDiff) {
            minDiff = diff;
            closestPosition = pos;
        }
    });

    updateShelfTransform(closestPosition);
}

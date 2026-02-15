/**
 * Feature Shelf - Lateral Dashboard Controller
 * =================================================================
 * 介紹：負責管理側邊展開式功能面板 (Feature Shelf) 的交互邏輯。
 * 職責：
 * 1. 抽屜式展開：控制面板在畫面右側的顯隱與位移。
 * 2. 自由拖拽 (Draggable)：支援透過手把按鈕進行水平拖拽調整寬度。
 * 3. 磁吸對齊 (Snapping)：拖拽結束後自動對齊至最近的預設百分比寬度。
 * 4. 內容分發：根據點擊的功能按鈕 ID，自動顯示對應的子面板 (如 Translator)。
 * 依賴：CSS 變數 (--shelf-open-width), no-transition class, audio.js
 * =================================================================
 */

import { playAudio } from "./audio.js";

// --- DOM 引用 ---
const $featureShelfContainer = document.querySelector('.feature-shelf-container');
const $featureShelfBackBtn = document.querySelector('.feature-shelf-back-btn');
const $featureBtns = document.querySelectorAll('.feature-btn');
const $featureShelves = document.querySelectorAll('.feature-shelf');

// --- 拖拽狀態 ---
let isDragging = false;
let dragStartX = 0;
let initialTranslateX = 0;
let currentTranslateX = 0;

const DEFAULT_OPEN_WIDTH_VW = 60;

// --- 初始化監聽 ---
$featureBtns.forEach($btn => {
    $btn.addEventListener('click', () => {
        playAudio("Click.mp3"); // 特徵切換音效
        handleFeatureBtnClick($btn);
    });
});

// 手把拖拽 (PC 鼠標)
$featureShelfBackBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX);
});

// 手把拖拽 (移動端觸控)
$featureShelfBackBtn.addEventListener('touchstart', (e) => {
    startDrag(e.touches[0].clientX);
}, { passive: false });

// 快速關閉：按兩下手把
$featureShelfBackBtn.addEventListener('dblclick', () => {
    playAudio("UISelectOff.mp3");
    closeShelf();
});

// 窗口自動補償
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

    const shelfId = (id) => id.startsWith('translate-') ? 'translator' : id;
    const resolvedId = shelfId(targetFeatureId);

    const $targetShelf = document.querySelector(`.feature-shelf[data-feature-shelf="${resolvedId}"]`);
    if (!$targetShelf) return;

    $featureShelves.forEach($shelf => {
        $shelf.style.display = ($shelf === $targetShelf) ? 'flex' : 'none';
    });

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
    playAudio("UISelectOn.mp3"); // 展開音效
    updateShelfTransform(calculateMaxOpenPx());
}

function closeShelf() {
    updateShelfTransform(0);
}

// --- 拖拽核心邏輯 ---

/**
 * 啟動拖拽
 * @param {number} clientX 初始水平坐標
 */
function startDrag(clientX) {
    playAudio("UIPipboyOKPress.mp3"); // 按下即鳴：提供即時物理反饋
    isDragging = true;
    dragStartX = clientX;
    initialTranslateX = currentTranslateX;

    $featureShelfContainer.classList.add('no-transition');

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
}

function handleDragMove(e) {
    if (!isDragging) return;
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - dragStartX;
    let newTranslateX = initialTranslateX + deltaX;

    const maxTranslate = 0;
    const minTranslate = -getScreenWidth();

    if (newTranslateX > maxTranslate) newTranslateX = maxTranslate;
    if (newTranslateX < minTranslate) newTranslateX = minTranslate;

    updateShelfTransform(newTranslateX);
}

function handleDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    $featureShelfContainer.classList.remove('no-transition');

    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);

    snapToNearestPosition();

    // 根據結果播放不同音效
    if (currentTranslateX === 0) {
        playAudio("UISelectOff.mp3");
    } else {
        playAudio("UIGeneralFocus.mp3");
    }
}

function snapToNearestPosition() {
    const screenWidth = getScreenWidth();
    const snapRatios = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
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

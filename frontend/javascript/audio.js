/**
 * Global Audio Manager
 * =================================================================
 * 介紹：負責全站音效素材的預載與播放調度。
 * 職責：
 * 1. 管理音效清單與資源路徑。
 * 2. 啟動時自動預載音效至快取，確保播放無延遲。
 * 3. 處理行動裝置檢測，避免在手機端自動播放造成崩潰或限制。
 * 依賴：無
 * =================================================================
 */

// --- 配置區 ---
const audioFolderDir = "./audio/";

const audioFiles = [
    "Cassette.mp3",
    "Click.mp3",
    "Erase.mp3",
    "UIGeneralCancel.mp3",
    "UIGeneralFocus.mp3",
    "UIGeneralOK.mp3",
    "UIPipboyOK.mp3",
    "UIPipboyOKPress.mp3",
    "UISelectOff.mp3",
    "UISelectOn.mp3"
];

// --- 資源快取 ---
const audioCache = {};

// --- 初始化：執行預載 ---
// 步驟：遍歷清單 -> 建立 Audio 對象 -> 設定預載屬性 -> 存入快取
audioFiles.forEach(file => {
    const link = audioFolderDir + file;
    const audio = new Audio();
    audio.src = link;
    audio.preload = 'auto';
    audio.load();
    audioCache[file] = audio;
});

/**
 * 播放指定音效
 * @param {string} fileName 音效檔名 (需包含副檔名)
 */
export function playAudio(fileName) {
    // 步驟：1. 檢查參數是否存在 2. 檢測是否為行動裝置 3. 重設時間軸以支援連續觸發 (機槍模式) 4. 執行播放
    if (!fileName || !audioCache[fileName] || isMobile()) return;

    audioCache[fileName].currentTime = 0;
    audioCache[fileName].play();
}

/**
 * 行動裝置檢測
 * 註：手機端瀏覽器通常禁止腳本自動播放音效，故預設不啟用。
 */
function isMobile() {
    return /Android|iPhone/i.test(navigator.userAgent);
}
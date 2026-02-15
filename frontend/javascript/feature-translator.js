/**
 * Feature - Translator (Language Translation)
 * =================================================================
 * 介紹：負責處理文字翻譯功能，將黑板文字透過 PHP Proxy 送往翻譯 API。
 * 職責：
 * 1. 按鈕映射：自動識別以 `translate-` 為前綴的功能按鈕並解析目標語言代碼。
 * 2. 資料交互：抓取當前黑板 (Textarea) 內容作為源文，並將結果輸出至專屬顯示區。
 * 3. 異常處理：在輸出區顯示「Translating...」狀態，並捕捉網絡或 API 報錯。
 * 依賴：/api/translate (後端 Proxy)
 * =================================================================
 */

// --- 配置與引用 ---
const TRANSLATE_BTN_PREFIX = 'translate-';
const $translateBtns = document.querySelectorAll('[data-feature-btn^="translate-"]');
const $translatorOutput = document.getElementById('feature-translator-output');
const $translatorInput = document.getElementById('log-textarea');

// --- 事件處理 ---
$translateBtns.forEach($btn => {
    $btn.addEventListener('click', async () => {
        if (!$translatorInput || !$translatorOutput) return;

        const text = $translatorInput.value.trim();
        if (!text) {
            $translatorOutput.value = "Tip: Please input text in the blackboard first.";
            return;
        }

        // 步驟：1. 解析目標語言 (如 en, ja) 2. 顯示等待狀態 3. 呼叫 API 函式 4. 渲染結果
        const targetLang = $btn.dataset.featureBtn.replace(TRANSLATE_BTN_PREFIX, '');
        $translatorOutput.value = "Translating...";

        try {
            const translation = await translateText(text, targetLang);
            $translatorOutput.value = translation || "No translation returned.";
        } catch (e) {
            console.error("Translation Error:", e);
            $translatorOutput.value = "Error: " + e.message;
        }
    });
});

/**
 * 遠程翻譯請求
 * 邏輯：透過 POST 發送 JSON 數據至後端 Proxy，後端負責掛載 API Key。
 */
async function translateText(text, targetLang) {
    const url = "/api/translate";

    const payload = {
        text: text,
        target: targetLang
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
    }

    // 回傳解析後的翻譯字串
    return data.data?.translations?.[0]?.translatedText;
}

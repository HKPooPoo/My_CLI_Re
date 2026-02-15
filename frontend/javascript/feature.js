/**
 * Feature - Voice to Text (Speech Recognition)
 * =================================================================
 * 介紹：負責處理語音輸入功能，將錄音轉換為 Base64 並透過 PHP Proxy 調用 Speech API。
 * 職責：
 * 1. 錄音管理：使用 MediaRecorder API 進行音頻採集。
 * 2. 游標追蹤：實時監控 Textarea 的游標位置，確保聽寫結果準確插入。
 * 3. 狀態反饋：提供 Recording (錄音中)、Processing (處理中)、Error (出錯) 的視覺狀態。
 * 4. 插入邏輯：處理文字插入後的字串拼接與輸入事件觸發 (以連動黑板自動儲存)。
 * 依賴：/api/speech (後端 Proxy)
 * =================================================================
 */

// --- DOM 引用 ---
const $voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
const $textarea = document.getElementById("log-textarea");

// --- 錄音狀態與快取 ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// --- 游標位置追蹤 ---
let savedCursorPosition = 0;
let isTextareaFocused = false;

// --- 初始化監聽 ---
if ($voiceBtn && $textarea) {
    // 預防機制：在點擊按鈕時不讓 Textarea 失去焦點 (避免手機鍵盤縮回)
    $voiceBtn.addEventListener('mousedown', (e) => {
        if (document.activeElement === $textarea) {
            e.preventDefault();
        }
    });

    $textarea.addEventListener('focus', () => { isTextareaFocused = true; });
    $textarea.addEventListener('blur', () => { isTextareaFocused = false; });

    // 實時更新游標位置：覆蓋所有可能的輸入與移動情境
    ['keyup', 'click', 'input', 'focus'].forEach(event => {
        $textarea.addEventListener(event, () => {
            savedCursorPosition = $textarea.selectionStart;
        });
    });

    $voiceBtn.addEventListener("click", toggleRecording);
}

/**
 * 切換錄音狀態
 */
async function toggleRecording() {
    if (!$textarea) return;

    if (!isRecording) {
        // 開始錄音前置檢查：必須聚焦在文字框
        if (!isTextareaFocused) {
            flashError();
            return;
        }
        savedCursorPosition = $textarea.selectionStart;
        await startRecording();
    } else {
        await stopRecording();
    }
}

/**
 * 錯誤閃爍反饋
 */
function flashError() {
    $voiceBtn.classList.add('error');
    setTimeout(() => {
        $voiceBtn.classList.remove('error');
    }, 500);
}

/**
 * 執行錄音採集
 * 步驟：1. 申請麥克風權限 2. 建立 MediaRecorder 3. 收集 AudioChunks 4. 註冊 Stop 回調進行轉碼
 */
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop()); // 立即釋放麥克風
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        $voiceBtn.classList.add("recording");

    } catch (err) {
        console.error("Mic Access Error:", err);
        $voiceBtn.classList.remove("recording");
    }
}

/**
 * 停止錄音並切換至處理狀態
 */
async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }
    $voiceBtn.classList.remove("recording");
    $voiceBtn.classList.add("processing");
}

/**
 * 調用 Speech API (透過 Proxy)
 * 步驟：1. 將 Blob 轉為 Base64 2. 送往 /api/speech 3. 解析轉錄文字 4. 調用插入函數
 */
async function transcribeAudio(audioBlob) {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);

    reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        try {
            const response = await fetch("/api/speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audio: base64Audio })
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);

            const data = await response.json();
            if (data.error) {
                console.error("Speech API Error:", data.error);
                return;
            }

            const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
            if (transcript) {
                insertTextAtCursor(transcript);
            }

        } catch (error) {
            console.error("Transcribe Request Error:", error);
            flashError();
        } finally {
            $voiceBtn.classList.remove("active", "recording", "processing");
            isRecording = false;
        }
    };
}

/**
 * 文字插入邏輯
 * 步驟：1. 獲取原文字與預存游標位 2. 切開字串並置入轉錄內容 3. 觸發 input 事件以觸發黑板自動儲存 4. 修正游標位
 */
function insertTextAtCursor(text) {
    if (!$textarea) return;

    const originalText = $textarea.value;
    const pos = savedCursorPosition;
    const validPos = Math.min(Math.max(0, pos), originalText.length);

    const newText = originalText.substring(0, validPos) + text + originalText.substring(validPos);
    $textarea.value = newText;

    // 重要：手動觸發 input 事件，否則 blackboard.js 不會監聽到內容變動
    $textarea.dispatchEvent(new Event('input'));

    const newCursorPos = validPos + text.length;

    // 更新游標位置，並處理移動端焦點防噴發
    $textarea.setSelectionRange(newCursorPos, newCursorPos);
    if (document.activeElement !== $textarea) {
        $textarea.blur(); // 若本來就沒聚焦，不強制 focus
    }
}

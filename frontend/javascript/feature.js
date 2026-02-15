/**
 * Feature - Voice to Text (Speech Recognition)
 * =================================================================
 * 介紹：負責處理語音輸入功能，將錄音轉換為 Base64 並透過 PHP Proxy 調用 Speech API。
 * 職責：
 * 1. 錄音管理：使用 MediaRecorder API 進行音頻採集。
 * 2. 游標追蹤：實時監控 Textarea 的游標位置，確保聽寫結果準確插入。
 * 3. 狀態反饋：提供 Recording (錄音中)、Processing (處理中)、Error (出錯) 的視覺狀態。
 * 4. 插入邏輯：處理文字插入後的字串拼接與輸入事件觸發 (以連動黑板自動儲存)。
 * 依賴：/api/speech (後端 Proxy), audio.js
 * =================================================================
 */

import { playAudio } from "./audio.js";

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
    $voiceBtn.addEventListener('mousedown', (e) => {
        if (document.activeElement === $textarea) e.preventDefault();
    });

    $textarea.addEventListener('focus', () => { isTextareaFocused = true; });
    $textarea.addEventListener('blur', () => { isTextareaFocused = false; });

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

    // 播放點擊音效
    playAudio("Click.mp3");

    if (!isRecording) {
        if (!isTextareaFocused) {
            flashError();
            BBMessage.error("SELECT BOARD.");
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
    playAudio("UIGeneralCancel.mp3"); // 錯誤音效
    $voiceBtn.classList.add('error');
    setTimeout(() => { $voiceBtn.classList.remove('error'); }, 500);
}

/**
 * 執行錄音採集
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
            stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        $voiceBtn.classList.add("recording");
        playAudio("UISelectOn.mp3"); // 開始錄音音效

        // 全域提示
        window.voiceMsg = BBMessage.info("LISTENING...");

    } catch (err) {
        console.error("Mic Access Error:", err);
        $voiceBtn.classList.remove("recording");
        flashError();
    }
}

/**
 * 停止錄音
 */
async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }
    $voiceBtn.classList.remove("recording");
    $voiceBtn.classList.add("processing");
    playAudio("UISelectOff.mp3"); // 停止錄音音效

    if (window.voiceMsg) {
        window.voiceMsg.update("DECODING...");
    }
}

/**
 * 調用 Speech API
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

            const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
            if (transcript) {
                insertTextAtCursor(transcript);
                playAudio("UIGeneralOK.mp3"); // 識別成功音效

                if (window.voiceMsg) {
                    window.voiceMsg.update("VERIFIED.");
                }
            } else {
                if (window.voiceMsg) window.voiceMsg.close();
                BBMessage.error("NO SPEECH.");
            }

        } catch (error) {
            console.error("Transcribe Request Error:", error);
            flashError();
            if (window.voiceMsg) window.voiceMsg.close();
            BBMessage.error("OFLINE.");
        } finally {
            $voiceBtn.classList.remove("active", "recording", "processing");
            isRecording = false;
            window.voiceMsg = null;
        }
    };
}

/**
 * 文字插入邏輯
 */
function insertTextAtCursor(text) {
    if (!$textarea) return;

    const originalText = $textarea.value;
    const pos = savedCursorPosition;
    const validPos = Math.min(Math.max(0, pos), originalText.length);

    const newText = originalText.substring(0, validPos) + text + originalText.substring(validPos);
    $textarea.value = newText;

    $textarea.dispatchEvent(new Event('input'));

    const newCursorPos = validPos + text.length;
    $textarea.setSelectionRange(newCursorPos, newCursorPos);
    if (document.activeElement !== $textarea) $textarea.blur();
}

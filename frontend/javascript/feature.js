
// Voice-to-Text using PHP Proxy (No API Key Exposed)
const $voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
const $textarea = document.getElementById("log-textarea");

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Track Cursor
let savedCursorPosition = 0;
let isTextareaFocused = false;

if ($voiceBtn && $textarea) {
    // Prevent focus loss on button PRESS
    $voiceBtn.addEventListener('mousedown', (e) => {
        if (document.activeElement === $textarea) {
            e.preventDefault(); // Keep focus on textarea
        }
    });

    // Track focus
    $textarea.addEventListener('focus', () => { isTextareaFocused = true; });
    $textarea.addEventListener('blur', () => { isTextareaFocused = false; });

    // Track cursor continuously
    ['keyup', 'click', 'input', 'focus'].forEach(event => {
        $textarea.addEventListener(event, () => {
            savedCursorPosition = $textarea.selectionStart;
        });
    });

    $voiceBtn.addEventListener("click", toggleRecording);
} else {
    console.error("Voice-to-text elements not found.");
}

async function toggleRecording() {
    if (!$textarea) return;

    if (!isRecording) {
        // START: Check if textarea is focused
        if (!isTextareaFocused) {
            flashError();
            return;
        }

        // Save position at start
        savedCursorPosition = $textarea.selectionStart;

        await startRecording();
    } else {
        // STOP
        await stopRecording();
    }
}

function flashError() {
    $voiceBtn.classList.add('error');
    setTimeout(() => {
        $voiceBtn.classList.remove('error');
    }, 500);
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // Stop all mic tracks immediately
            stream.getTracks().forEach(track => track.stop());

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;

        // Visual feedback
        $voiceBtn.classList.add("recording");

    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Mic Error");
        $voiceBtn.classList.remove("recording");
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }

    // Processing state
    $voiceBtn.classList.remove("recording");
    $voiceBtn.classList.add("processing");
}

async function transcribeAudio(audioBlob) {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);

    reader.onloadend = async () => {
        // Get Base64
        const base64Audio = reader.result.split(',')[1];

        try {
            // Call PHP Proxy
            const url = "/api/speech";

            const payload = {
                audio: base64Audio
            };

            // console.log("Sending Speech-to-Text request to proxy...");

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const data = await response.json();
            // console.log("Speech-to-Text response:", data);

            if (data.error) {
                console.error("Speech API Error:", data.error);
                alert("API Error: " + (data.error.message || "Unknown Error"));
                return;
            }

            const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;

            if (transcript) {
                insertTextAtCursor(transcript);
            } else {
                console.warn("No transcription returned");
            }

        } catch (error) {
            console.error("Request Error:", error);
            flashError(); // Network error feedback
        } finally {
            // Always reset UI
            $voiceBtn.classList.remove("active");
            $voiceBtn.classList.remove("recording");
            $voiceBtn.classList.remove("processing");
            isRecording = false;
        }
    };
}

function insertTextAtCursor(text) {
    if (!$textarea) return;

    // Logic: Insert at savedCursorPosition
    const originalText = $textarea.value;
    const pos = savedCursorPosition;

    // Ensure pos is within bounds
    const validPos = Math.min(Math.max(0, pos), originalText.length);

    const newText = originalText.substring(0, validPos) + text + originalText.substring(validPos);
    $textarea.value = newText;

    // Trigger input
    $textarea.dispatchEvent(new Event('input'));

    // Move cursor to end of inserted text
    const newCursorPos = validPos + text.length;

    // Update selection range so next typing happens at correct spot
    // But DO NOT force focus() if it was lost, to avoid keyboard popup on mobile

    if (document.activeElement === $textarea) {
        $textarea.setSelectionRange(newCursorPos, newCursorPos);
        // Already focused, keep it
    } else {
        // If not focused (e.g. mobile keyboard closed), just update selection without focusing
        // Setting selection range on a non-focused element usually doesn't trigger focus/keyboard
        $textarea.setSelectionRange(newCursorPos, newCursorPos);
        // Explicitly ensure blur to stay safe against keyboard popup
        $textarea.blur();
    }
}

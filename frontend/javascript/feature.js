
// Voice-to-Text (Laravel API Backend)
const $voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
const $textarea = document.getElementById("log-textarea");

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Track Cursor
let savedCursorPosition = 0;
let isTextareaFocused = false;

// Timer
let recordingStartTime = null;
let timerInterval = null;
const MAX_RECORDING_SECONDS = 55; // Google Sync API limit ~60s, stop at 55 for safety

if ($voiceBtn && $textarea) {
    // Prevent focus loss on button PRESS
    $voiceBtn.addEventListener('mousedown', (e) => {
        if (document.activeElement === $textarea) {
            e.preventDefault();
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
}

async function toggleRecording() {
    if (!$textarea) return;

    if (!isRecording) {
        // START: Check if textarea is focused
        if (!isTextareaFocused) {
            flashError();
            return;
        }

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

// === Timer Display ===
function startTimer() {
    recordingStartTime = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);

        // Auto-stop at limit
        if (elapsed >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return;
        }

        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    $voiceBtn.dataset.timer = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    $voiceBtn.dataset.timer = '';
}

// === Recording ===
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
            stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;

        // Visual: recording state + timer
        $voiceBtn.classList.add("recording");
        startTimer();

    } catch (err) {
        console.error("Error accessing microphone:", err);
        flashError();
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }

    // Transition: recording → processing
    stopTimer();
    $voiceBtn.classList.remove("recording");
    $voiceBtn.classList.add("processing");
}

// === Transcription ===
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

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                console.error("Speech API Error:", data.error);
                flashError();
                return;
            }

            // V2 (Chirp) response format
            const transcript = extractTranscript(data);

            if (transcript) {
                insertTextAtCursor(transcript);
            } else {
                console.warn("No transcription returned");
                flashError();
            }

        } catch (error) {
            console.error("Request Error:", error);
            flashError();
        } finally {
            resetButtonState();
        }
    };
}

// === Parse both V1 and V2 response formats ===
function extractTranscript(data) {
    // V1: { results: [{ alternatives: [{ transcript, confidence }] }] }
    const v1 = data.results?.[0]?.alternatives?.[0]?.transcript;
    if (v1) return v1;

    // V2 (Chirp): { results: [{ alternatives: [{ transcript }] }] }
    // Same structure but sometimes nested differently
    if (Array.isArray(data.results)) {
        for (const result of data.results) {
            const alt = result.alternatives?.[0];
            if (alt?.transcript) return alt.transcript;
        }
    }

    return null;
}

// === Reset Button State ===
function resetButtonState() {
    $voiceBtn.classList.remove("active", "recording", "processing");
    $voiceBtn.dataset.timer = '';
    isRecording = false;
}

// === Insert Text at Cursor ===
function insertTextAtCursor(text) {
    if (!$textarea) return;

    const originalText = $textarea.value;
    const pos = savedCursorPosition;
    const validPos = Math.min(Math.max(0, pos), originalText.length);

    const newText = originalText.substring(0, validPos) + text + originalText.substring(validPos);
    $textarea.value = newText;

    // Trigger input event for other listeners (e.g. Blackboard autosave)
    $textarea.dispatchEvent(new Event('input'));

    const newCursorPos = validPos + text.length;

    if (document.activeElement === $textarea) {
        $textarea.setSelectionRange(newCursorPos, newCursorPos);
    } else {
        $textarea.setSelectionRange(newCursorPos, newCursorPos);
        $textarea.blur();
    }
}

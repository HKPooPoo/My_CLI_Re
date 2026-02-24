/**
 * Speech-to-Text MOD - Voice input to text conversion
 * =================================================================
 * Records audio via MediaRecorder, sends to Google Speech API,
 * inserts transcribed text at cursor position in the active textarea.
 * =================================================================
 */

import { playAudio } from '../../javascript/audio.js';
import { BBMessage } from '../../javascript/blackboard-msg.js';
import { SpeechService } from '../../javascript/services/speech-service.js';
import { t } from '../../javascript/i18n.js';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let savedCursorPosition = 0;
let isTextareaFocused = false;
let $voiceBtn = null;
let $textarea = null;

export default {
    // --- Identity ---
    id: 'speech-to-text',
    group: 'linguistics',
    nameKey: 'mods.speechToText.name',
    descriptionKey: 'mods.speechToText.desc',
    defaultEnabled: true,

    // --- Feature integration ---
    featureButtons: [
        { id: 'voice-to-textbox', labelKey: 'mods.speechToText.btn' },
    ],
    shelfPanelId: null, // No shelf panel — inserts directly into textarea

    // --- Page awareness ---
    pages: {
        'blackboard-log': { textareaSelector: '#log-textarea' },
    },

    // --- Provider & Config ---
    providers: [
        { id: 'google-speech', type: 'cloud', nameKey: 'mods.speechToText.provider.google' },
    ],
    configSchema: [],
    sharedConfigGroup: null,

    // --- Lifecycle ---
    async init(ctx) {
        // Defer DOM binding until button is created by loader
        // Use event delegation on the feature container
        const container = document.querySelector('.feature-container');
        container?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-feature-btn="voice-to-textbox"]');
            if (!btn) return;
            // Don't call toggleRecording here — feature-shelf already plays Click.mp3
            // and calls activate(). We handle it in activate().
        });

        // Prevent mousedown on button from stealing textarea focus
        container?.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('[data-feature-btn="voice-to-textbox"]');
            if (!btn) return;
            $textarea = this._getActiveTextarea();
            if (document.activeElement === $textarea) e.preventDefault();
        });
    },

    async activate(ctx) {
        $voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
        $textarea = this._getActiveTextarea();
        if (!$voiceBtn || !$textarea) return;

        this._bindTextareaEvents();
        await this._toggleRecording();
    },

    async deactivate() {},

    async checkHealth() {
        return 'online';
    },

    destroy() {},

    // --- Private ---

    _getActiveTextarea() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return document.getElementById('log-textarea');
        const page = activePage.dataset.page;
        const pageDef = this.pages[page];
        if (!pageDef) return document.getElementById('log-textarea');
        return document.querySelector(pageDef.textareaSelector);
    },

    _bindTextareaEvents() {
        if (!$textarea) return;
        // Track focus state
        $textarea._sttFocusHandler = $textarea._sttFocusHandler || (() => { isTextareaFocused = true; });
        $textarea._sttBlurHandler = $textarea._sttBlurHandler || (() => { isTextareaFocused = false; });
        $textarea._sttCursorHandler = $textarea._sttCursorHandler || (() => {
            savedCursorPosition = $textarea.selectionStart;
        });

        // Remove old listeners to avoid duplication
        $textarea.removeEventListener('focus', $textarea._sttFocusHandler);
        $textarea.removeEventListener('blur', $textarea._sttBlurHandler);

        $textarea.addEventListener('focus', $textarea._sttFocusHandler);
        $textarea.addEventListener('blur', $textarea._sttBlurHandler);

        ['keyup', 'click', 'input', 'focus'].forEach(event => {
            $textarea.removeEventListener(event, $textarea._sttCursorHandler);
            $textarea.addEventListener(event, $textarea._sttCursorHandler);
        });

        // Check if currently focused
        isTextareaFocused = (document.activeElement === $textarea);
        savedCursorPosition = $textarea.selectionStart;
    },

    async _toggleRecording() {
        if (!$textarea) return;

        if (!isRecording) {
            if (!isTextareaFocused) {
                this._flashError();
                BBMessage.error(t('mods.speechToText.selectBoard'));
                return;
            }
            savedCursorPosition = $textarea.selectionStart;
            await this._startRecording();
        } else {
            await this._stopRecording();
        }
    },

    _flashError() {
        playAudio("UIGeneralCancel.mp3");
        if ($voiceBtn) {
            $voiceBtn.classList.add('error');
            setTimeout(() => { $voiceBtn.classList.remove('error'); }, 500);
        }
    },

    async _startRecording() {
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
                await this._transcribeAudio(audioBlob);
            };

            mediaRecorder.start();
            isRecording = true;
            if ($voiceBtn) $voiceBtn.classList.add("recording");
            playAudio("UISelectOn.mp3");
            window.voiceMsg = BBMessage.info(t('mods.speechToText.listening'));
        } catch (err) {
            console.error("Mic Access Error:", err);
            if ($voiceBtn) $voiceBtn.classList.remove("recording");
            this._flashError();
        }
    },

    async _stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            isRecording = false;
        }
        if ($voiceBtn) {
            $voiceBtn.classList.remove("recording");
            $voiceBtn.classList.add("processing");
        }
        playAudio("UISelectOff.mp3");
        if (window.voiceMsg) {
            window.voiceMsg.update(t('mods.speechToText.processing'));
        }
    },

    async _transcribeAudio(audioBlob) {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);

        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            try {
                const data = await SpeechService.recognize({ audio: base64Audio });
                const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
                if (transcript) {
                    this._insertTextAtCursor(transcript);
                    playAudio("UIGeneralOK.mp3");
                    if (window.voiceMsg) {
                        window.voiceMsg.update(t('mods.speechToText.verified'));
                    }
                } else {
                    if (window.voiceMsg) window.voiceMsg.close();
                    BBMessage.error(t('mods.speechToText.noSpeech'));
                }
            } catch (error) {
                console.error("Transcribe Request Error:", error);
                this._flashError();
                if (window.voiceMsg) window.voiceMsg.close();
                BBMessage.error(t('mods.speechToText.offline'));
            } finally {
                if ($voiceBtn) $voiceBtn.classList.remove("active", "recording", "processing");
                isRecording = false;
                window.voiceMsg = null;
            }
        };
    },

    _insertTextAtCursor(text) {
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
};

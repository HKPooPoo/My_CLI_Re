/**
 * Speech-to-Text MOD Template - Voice input to text conversion
 * =================================================================
 * Single-instance template. Records audio via MediaRecorder, sends to
 * Google Speech API, inserts transcribed text at cursor position.
 *
 * v2.0.0: Uses ModContext API (ctx.board.insertAtCursor, ctx.ui.toast)
 * =================================================================
 */

import { playAudio } from '../../javascript/audio.js';
import { SpeechService } from '../../javascript/services/speech-service.js';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let savedCursorPosition = 0;
let isTextareaFocused = false;
let $voiceBtn = null;
let $textarea = null;

/** Keep a reference to ctx.i18n.t and ctx.ui for use in callbacks */
let _t = null;
let _ui = null;

export default {
    // --- Identity ---
    id: 'speech-to-text',
    group: 'linguistics',
    nameKey: 'mods.speechToText.name',
    descriptionKey: 'mods.speechToText.desc',

    // --- Metadata (v2) ---
    version: '2.0.0',

    // --- Instance architecture ---
    maxInstances: 1,

    getButtonDataId(config) {
        return 'voice-to-textbox';
    },

    getInstanceName(config, tFn) {
        return tFn('mods.speechToText.name');
    },

    defaultInstances: [{ config: {} }],

    // --- Feature integration ---
    shelfPanelId: null,

    // --- Page awareness ---
    pages: {
        'blackboard-log': { textareaSelector: '#log-textarea' },
    },

    // --- Provider & Config ---
    providers: [
        { id: 'google-speech', type: 'cloud', nameKey: 'mods.speechToText.provider.google' },
    ],
    configSchema: [],

    // --- Lifecycle ---
    async init(ctx) {
        // Cache i18n for use in async callbacks
        _t = ctx.i18n.t;
        _ui = ctx.ui;

        const container = document.querySelector('.feature-container');
        container?.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('[data-feature-btn="voice-to-textbox"]');
            if (!btn) return;
            $textarea = this._getActiveTextarea();
            if (document.activeElement === $textarea) e.preventDefault();
        });
    },

    async activate(ctx) {
        // Update refs from latest ctx
        _t = ctx.i18n.t;
        _ui = ctx.ui;

        $voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
        $textarea = ctx.board.getTextarea() || this._getActiveTextarea();
        if (!$voiceBtn || !$textarea) return;

        this._bindTextareaEvents();
        await this._toggleRecording(ctx);
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
        $textarea._sttFocusHandler = $textarea._sttFocusHandler || (() => { isTextareaFocused = true; });
        $textarea._sttBlurHandler = $textarea._sttBlurHandler || (() => { isTextareaFocused = false; });
        $textarea._sttCursorHandler = $textarea._sttCursorHandler || (() => {
            savedCursorPosition = $textarea.selectionStart;
        });

        $textarea.removeEventListener('focus', $textarea._sttFocusHandler);
        $textarea.removeEventListener('blur', $textarea._sttBlurHandler);

        $textarea.addEventListener('focus', $textarea._sttFocusHandler);
        $textarea.addEventListener('blur', $textarea._sttBlurHandler);

        ['keyup', 'click', 'input', 'focus'].forEach(event => {
            $textarea.removeEventListener(event, $textarea._sttCursorHandler);
            $textarea.addEventListener(event, $textarea._sttCursorHandler);
        });

        isTextareaFocused = (document.activeElement === $textarea);
        savedCursorPosition = $textarea.selectionStart;
    },

    async _toggleRecording(ctx) {
        if (!$textarea) return;

        if (!isRecording) {
            if (!isTextareaFocused) {
                this._flashError();
                _ui.toastError(_t('mods.speechToText.selectBoard'));
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
            window.voiceMsg = _ui.toast(_t('mods.speechToText.listening'));
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
            window.voiceMsg.update(_t('mods.speechToText.processing'));
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
                        window.voiceMsg.update(_t('mods.speechToText.verified'));
                    }
                } else {
                    if (window.voiceMsg) window.voiceMsg.close();
                    _ui.toastError(_t('mods.speechToText.noSpeech'));
                }
            } catch (error) {
                console.error("Transcribe Request Error:", error);
                this._flashError();
                if (window.voiceMsg) window.voiceMsg.close();
                _ui.toastError(_t('mods.speechToText.offline'));
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

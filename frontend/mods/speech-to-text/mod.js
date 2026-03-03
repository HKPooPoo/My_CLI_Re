/**
 * Speech-to-Text MOD — Code module (data in manifest.json)
 */

// BYPASS: Direct import — no ctx.audio API exists
import { playAudio } from '../../javascript/audio.js';
import { SpeechService } from '../../javascript/services/speech-service.js';

export default {
    getButtonDataId(config) {
        return 'voice-to-textbox';
    },

    getInstanceName(config, tFn) {
        return tFn('mods.speechToText.name');
    },

    async init(ctx) {
        this._t = ctx.i18n.t;
        this._ui = ctx.ui;

        // BYPASS: Direct DOM access — no ctx.ui.onButtonMousedown() API, need to prevent textarea blur on button click
        const container = document.querySelector('.feature-container');
        container?.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('[data-feature-btn="voice-to-textbox"]');
            if (!btn) return;
            this._textarea = this._getActiveTextarea();
            if (document.activeElement === this._textarea) e.preventDefault();
        });
    },

    async activate(ctx) {
        this._t = ctx.i18n.t;
        this._ui = ctx.ui;

        // BYPASS: Direct DOM query — no ctx.ui.getButton() API
        this._voiceBtn = document.querySelector('[data-feature-btn="voice-to-textbox"]');
        this._textarea = ctx.board.getTextarea();
        if (!this._voiceBtn || !this._textarea) return;

        this._bindTextareaEvents();
        await this._toggleRecording(ctx);
    },

    async deactivate() {},

    async checkHealth() {
        return 'online';
    },

    destroy() {},

    // --- Private ---

    // BYPASS: Direct DOM query — no ctx available in init() mousedown handler, no persistent ctx.board.getTextarea()
    _getActiveTextarea() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return null;
        const page = activePage.dataset.page;
        const pageDef = this.pages[page];
        if (!pageDef) return null;
        return document.querySelector(pageDef.textareaSelector);
    },

    _bindTextareaEvents() {
        if (!this._textarea) return;
        this._textarea._sttFocusHandler = this._textarea._sttFocusHandler || (() => { this._isTextareaFocused = true; });
        this._textarea._sttBlurHandler = this._textarea._sttBlurHandler || (() => { this._isTextareaFocused = false; });
        this._textarea._sttCursorHandler = this._textarea._sttCursorHandler || (() => {
            this._savedCursorPosition = this._textarea.selectionStart;
        });

        this._textarea.removeEventListener('focus', this._textarea._sttFocusHandler);
        this._textarea.removeEventListener('blur', this._textarea._sttBlurHandler);

        this._textarea.addEventListener('focus', this._textarea._sttFocusHandler);
        this._textarea.addEventListener('blur', this._textarea._sttBlurHandler);

        ['keyup', 'click', 'input', 'focus'].forEach(event => {
            this._textarea.removeEventListener(event, this._textarea._sttCursorHandler);
            this._textarea.addEventListener(event, this._textarea._sttCursorHandler);
        });

        this._isTextareaFocused = (document.activeElement === this._textarea);
        this._savedCursorPosition = this._textarea.selectionStart;
    },

    async _toggleRecording(ctx) {
        if (!this._textarea) return;

        if (!this._isRecording) {
            if (!this._isTextareaFocused) {
                this._flashError();
                this._ui.toastError(this._t('mods.speechToText.selectBoard'));
                return;
            }
            this._savedCursorPosition = this._textarea.selectionStart;
            await this._startRecording();
        } else {
            await this._stopRecording();
        }
    },

    _flashError() {
        playAudio("UIGeneralCancel.mp3");
        if (this._voiceBtn) {
            this._voiceBtn.classList.add('error');
            setTimeout(() => { this._voiceBtn.classList.remove('error'); }, 500);
        }
    },

    async _startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            this._audioChunks = [];

            this._mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this._audioChunks.push(event.data);
            };

            this._mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(this._audioChunks, { type: 'audio/webm' });
                await this._transcribeAudio(audioBlob);
            };

            this._mediaRecorder.start();
            this._isRecording = true;
            if (this._voiceBtn) this._voiceBtn.classList.add("recording");
            playAudio("UISelectOn.mp3");
            this._voiceMsg = this._ui.toastLoading(this._t('mods.speechToText.listening'));
        } catch (err) {
            console.error("Mic Access Error:", err);
            if (this._voiceBtn) this._voiceBtn.classList.remove("recording");
            this._flashError();
            this._ui.toastError(this._t('mods.speechToText.micDenied'));
        }
    },

    async _stopRecording() {
        if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            this._mediaRecorder.stop();
            this._isRecording = false;
        }
        if (this._voiceBtn) {
            this._voiceBtn.classList.remove("recording");
            this._voiceBtn.classList.add("processing");
        }
        playAudio("UISelectOff.mp3");
        if (this._voiceMsg) this._voiceMsg.close();
        this._voiceMsg = this._ui.toastLoading(this._t('mods.speechToText.processing'));
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
                    if (this._voiceMsg) {
                        this._voiceMsg.update(this._t('mods.speechToText.verified'));
                    }
                } else {
                    if (this._voiceMsg) this._voiceMsg.close();
                    this._ui.toastError(this._t('mods.speechToText.noSpeech'));
                }
            } catch (error) {
                console.error("Transcribe Request Error:", error);
                this._flashError();
                if (this._voiceMsg) this._voiceMsg.close();
                this._ui.toastError(this._t('mods.speechToText.offline'));
            } finally {
                if (this._voiceBtn) this._voiceBtn.classList.remove("active", "recording", "processing");
                this._isRecording = false;
                this._voiceMsg = null;
            }
        };
    },

    // BYPASS: Direct textarea manipulation — no ctx.board.insertAtCursor() API yet
    _insertTextAtCursor(text) {
        if (!this._textarea) return;
        const originalText = this._textarea.value;
        const pos = this._savedCursorPosition;
        const validPos = Math.min(Math.max(0, pos), originalText.length);

        const newText = originalText.substring(0, validPos) + text + originalText.substring(validPos);
        this._textarea.value = newText;
        this._textarea.dispatchEvent(new Event('input'));

        const newCursorPos = validPos + text.length;
        this._textarea.setSelectionRange(newCursorPos, newCursorPos);
        if (document.activeElement !== this._textarea) this._textarea.blur();
    }
};

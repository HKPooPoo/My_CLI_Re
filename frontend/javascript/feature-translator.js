/**
 * Feature - Translator (Language Translation)
 * =================================================================
 * Handles text translation via PHP Proxy.
 * MOD-aware: checks if offline-translate MOD is enabled and online,
 * then sends provider='libretranslate' to the backend.
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { TranslationService } from "./services/translation-service.js";
import { ModState } from "./mod-state.js";
import { t } from './i18n.js';

const TRANSLATE_BTN_PREFIX = 'translate-';
const $translateBtns = document.querySelectorAll('[data-feature-btn^="translate-"]');
const $translatorOutput = document.getElementById('feature-translator-output');
const $translatorInput = document.getElementById('log-textarea');

$translateBtns.forEach($btn => {
    $btn.addEventListener('click', async () => {
        playAudio("Click.mp3");

        if (!$translatorInput || !$translatorOutput) return;

        const text = $translatorInput.value.trim();
        if (!text) {
            $translatorOutput.value = t('translator.bufferEmpty');
            return;
        }

        const targetLang = $btn.dataset.featureBtn.replace(TRANSLATE_BTN_PREFIX, '');
        $translatorOutput.value = t('translator.decrypting');

        try {
            const translation = await translateText(text, targetLang);
            $translatorOutput.value = translation || t('translator.nullResult');
        } catch (e) {
            console.error("Translation Error:", e);
            $translatorOutput.value = t('translator.criticalBreach', { error: e.message.toUpperCase() });
        }
    });
});

/**
 * Remote translation request (MOD-aware provider selection)
 */
async function translateText(text, targetLang) {
    const payload = { text, target: targetLang };

    // Check if offline-translate MOD is enabled and its server is online
    if (ModState.isEnabled('offline-translate') && ModState.getServerStatus('offline-translate') === 'online') {
        payload.provider = 'libretranslate';
    }

    try {
        const data = await TranslationService.translate(payload);
        return data.data?.translations?.[0]?.translatedText;
    } catch (error) {
        if (error.message) throw new Error(error.message);
        throw error;
    }
}

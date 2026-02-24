/**
 * Feature - Translator (Language Translation)
 * =================================================================
 * Handles text translation via PHP Proxy.
 * MOD-aware: per-language MOD lookup determines provider.
 *   - If offline MOD enabled + server online → libretranslate
 *   - Otherwise → google (default)
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
 * Remote translation request (per-language MOD-aware provider selection)
 */
async function translateText(text, targetLang) {
    const payload = { text, target: targetLang };

    // Check if offline MOD for this language is enabled and its server is online
    const offlineModId = `translate-${targetLang}-offline`;
    if (ModState.isEnabled(offlineModId) && ModState.getServerStatus(offlineModId) === 'online') {
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

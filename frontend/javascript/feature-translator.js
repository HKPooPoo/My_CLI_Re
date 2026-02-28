/**
 * Feature - Translator (Language Translation)
 * =================================================================
 * Handles text translation via PHP Proxy.
 * Provider: Google Cloud Translation API.
 * =================================================================
 */

import { playAudio } from "./audio.js";
import { TranslationService } from "./services/translation-service.js";
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
            const data = await TranslationService.translate({ text, target: targetLang });
            const translation = data.data?.translations?.[0]?.translatedText;
            $translatorOutput.value = translation || t('translator.nullResult');
        } catch (e) {
            console.error("Translation Error:", e);
            $translatorOutput.value = t('translator.criticalBreach', { error: e.message.toUpperCase() });
        }
    });
});


// Translator — Each button represents a target language, source is auto-detected
// Optimization: Translate selected text only, loading animation, detected language display

const TRANSLATE_BTN_PREFIX = 'translate-';
const $translateBtns = document.querySelectorAll('[data-feature-btn^="translate-"]');
const $translatorOutput = document.getElementById('feature-translator-output');
const $translatorInput = document.getElementById('log-textarea');

let activeTranslateTargetLang = null;

// === Local Translation Cache ===
const translationCache = new Map();

function getCacheKey(text, lang) {
    return `${lang}::${text}`;
}

// === Debounce ===
let isTranslating = false;
let loadingInterval = null;

// === Loading Animation ===
function startLoadingAnimation() {
    let dots = 0;
    $translatorOutput.value = "Translating";
    loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        $translatorOutput.value = "Translating" + ".".repeat(dots);
    }, 300);
}

function stopLoadingAnimation() {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
}

// === Get Text: Selected or Full ===
function getTranslationSource() {
    if (!$translatorInput) return { text: '', isSelection: false };

    const start = $translatorInput.selectionStart;
    const end = $translatorInput.selectionEnd;

    // If user has selected text, translate only the selection
    if (start !== end) {
        return {
            text: $translatorInput.value.substring(start, end).trim(),
            isSelection: true,
            selStart: start,
            selEnd: end
        };
    }

    // Otherwise, translate entire content
    return {
        text: $translatorInput.value.trim(),
        isSelection: false
    };
}

$translateBtns.forEach($btn => {
    // Prevent focus loss from textarea when clicking translate buttons
    $btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });

    $btn.addEventListener('click', async () => {
        if (!$translatorInput || !$translatorOutput) return;
        if (isTranslating) return;

        const source = getTranslationSource();
        if (!source.text) return;

        const targetLang = $btn.dataset.featureBtn.replace(TRANSLATE_BTN_PREFIX, '');
        activeTranslateTargetLang = targetLang;

        // Check local cache
        const cacheKey = getCacheKey(source.text, targetLang);
        if (translationCache.has(cacheKey)) {
            $translatorOutput.value = translationCache.get(cacheKey);
            return;
        }

        isTranslating = true;
        $translateBtns.forEach(b => b.disabled = true);
        startLoadingAnimation();

        try {
            const result = await translateText(source.text, targetLang);
            stopLoadingAnimation();

            if (result.translatedText) {
                // Format: show detected language + translation
                const langLabel = result.detectedSourceLanguage
                    ? `[${result.detectedSourceLanguage.toUpperCase()} → ${targetLang.toUpperCase()}]`
                    : `[→ ${targetLang.toUpperCase()}]`;

                const prefix = source.isSelection ? `(Selected) ` : '';
                const displayText = `${prefix}${langLabel}\n${result.translatedText}`;

                $translatorOutput.value = displayText;
                translationCache.set(cacheKey, displayText);
            } else {
                $translatorOutput.value = "No translation returned.";
            }
        } catch (e) {
            stopLoadingAnimation();
            console.error("Translation Error:", e);
            $translatorOutput.value = "Error: " + e.message;
        } finally {
            isTranslating = false;
            $translateBtns.forEach(b => b.disabled = false);
        }
    });
});

async function translateText(text, targetLang) {
    const url = "/api/translate";

    const payload = {
        text: text,
        target: targetLang
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const translation = data.data?.translations?.[0];

    return {
        translatedText: translation?.translatedText || null,
        detectedSourceLanguage: translation?.detectedSourceLanguage || null
    };
}

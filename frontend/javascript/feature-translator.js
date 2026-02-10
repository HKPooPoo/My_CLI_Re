
// Translator — Each button represents a target language, source is auto-detected
const TRANSLATE_BTN_PREFIX = 'translate-';
const $translateBtns = document.querySelectorAll('[data-feature-btn^="translate-"]');
const $translatorOutput = document.getElementById('feature-translator-output');
const $translatorInput = document.getElementById('log-textarea');

let activeTranslateTargetLang = null;

$translateBtns.forEach($btn => {
    $btn.addEventListener('click', async () => {
        if (!$translatorInput || !$translatorOutput) return;

        const text = $translatorInput.value.trim();
        if (!text) return;

        const targetLang = $btn.dataset.featureBtn.replace(TRANSLATE_BTN_PREFIX, '');
        activeTranslateTargetLang = targetLang;

        $translatorOutput.value = "Translating...";

        try {
            const translation = await translateText(text, targetLang);
            $translatorOutput.value = translation || "No translation returned.";
        } catch (e) {
            console.error("Translation Error:", e);
            $translatorOutput.value = "Error: " + e.message;
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

    return data.data?.translations?.[0]?.translatedText;
}


/**
 * File Attach MOD — Opens native file picker or camera on mobile.
 *
 * Action-only MOD (no shelf panel). Clicking the feature button
 * triggers the page's hidden file input. The existing EditorAttachments
 * change handler processes the selected file automatically.
 *
 * Page-to-input mapping lives in manifest.json `pages` — the MOD reads
 * `this.pages[page].fileInputSelector` at activation time, following
 * the same pattern as speech-to-text reading textareaSelector.
 */

const ICON_FILE = '/images/file_attach.svg';
const ICON_CAMERA = '/images/camera_attach.svg';

export default {
    getButtonDataId(config) {
        return config.mode === 'camera' ? 'camera-attach' : 'file-attach';
    },

    getIconUrl(config) {
        return config.mode === 'camera' ? ICON_CAMERA : ICON_FILE;
    },

    getInstanceName(config, tFn) {
        return config.mode === 'camera'
            ? tFn('mods.fileAttach.nameCamera')
            : tFn('mods.fileAttach.nameFile');
    },

    getDeployPages(_config) {
        return ['blackboard-log', 'walkie-typie-text', 'broadcast-channel'];
    },

    async init(_ctx) {},

    async activate(ctx) {
        const page = ctx.page;
        const pageDef = this.pages?.[page];
        if (!pageDef?.fileInputSelector) {
            ctx.ui.toastError(ctx.i18n.t('mods.fileAttach.noTextarea'));
            return;
        }

        // BYPASS: Direct DOM access for file input — no framework API for triggering file selection
        const input = document.querySelector(pageDef.fileInputSelector);
        if (!input) return;

        const mode = ctx.config.mode || 'file';
        if (mode === 'camera') {
            const origAccept = input.accept;
            input.accept = 'image/*';
            input.setAttribute('capture', 'environment');
            const restore = () => {
                input.accept = origAccept;
                input.removeAttribute('capture');
            };
            input.addEventListener('change', restore, { once: true });
            // Handle cancel — no change event fires, restore on window regaining focus
            window.addEventListener('focus', () => setTimeout(restore, 300), { once: true });
        }

        input.click();
    },

    async deactivate(_ctx) {},
    async checkHealth() { return 'online'; },
    destroy() {},
};

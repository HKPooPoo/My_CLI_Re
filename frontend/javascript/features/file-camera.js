/**
 * Feature: Camera Capture — triggers the hidden file input with camera mode.
 * Mobile-friendly shortcut for photo attachments.
 */

const ICON_URL = '/images/camera_attach.svg';

const PAGE_INPUT_MAP = {
    'blackboard-log':    '#bb-file-input',
    'walkie-typie-text': '#wt-file-input',
    'broadcast-channel': '#bc-file-input',
};

export const feature = {
    id: 'file-camera',
    iconUrl: ICON_URL,
    pages: Object.keys(PAGE_INPUT_MAP),
    hasShelf: false,
    onClick() {
        const page = document.querySelector('.page.active')?.dataset.page;
        const selector = PAGE_INPUT_MAP[page];
        if (!selector) return;
        const input = document.querySelector(selector);
        if (!input) return;
        const origAccept = input.accept;
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        const restore = () => {
            input.accept = origAccept || '*/*';
            input.removeAttribute('capture');
        };
        input.addEventListener('change', restore, { once: true });
        window.addEventListener('focus', () => setTimeout(restore, 300), { once: true });
        input.click();
    },
};

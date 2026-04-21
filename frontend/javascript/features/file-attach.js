/**
 * Feature: File Attach — triggers the hidden file input on the current page.
 * No shelf panel. Action-only.
 */

const ICON_URL = '/images/file_attach.svg';

const PAGE_INPUT_MAP = {
    'blackboard-log':    '#bb-file-input',
    'walkie-typie-text': '#wt-file-input',
    'broadcast-channel': '#bc-file-input',
};

export const feature = {
    id: 'file-attach',
    iconUrl: ICON_URL,
    pages: Object.keys(PAGE_INPUT_MAP),
    hasShelf: false,
    onClick() {
        const page = document.querySelector('.page.active')?.dataset.page;
        const selector = PAGE_INPUT_MAP[page];
        if (!selector) return;
        const input = document.querySelector(selector);
        if (!input) return;
        input.removeAttribute('capture');
        input.accept = '*/*';
        input.click();
    },
};

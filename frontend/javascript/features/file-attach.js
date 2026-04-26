/**
 * Feature: File Attach — triggers the hidden file input on the current page.
 *
 * No shelf panel. Action-only.
 *
 * Mobile devices present their native "Take Photo / Choose File" picker
 * when the input has `accept="*\/*"` and no `capture` attribute. One button
 * therefore covers both photo-capture and disk-pick paths without a
 * separate camera entry.
 *
 * Broadcast visibility gate: hidden when the current user is not the owner
 * of the active channel. Non-owners see announcements but cannot attach.
 */

import { BCChannel } from '../broadcast-channel.js';
import { IXThread } from '../inbox-thread.js';

const ICON_URL = '/images/file_attach.svg';

const PAGE_INPUT_MAP = {
    'blackboard-log':    '#bb-file-input',
    'walkie-typie-text': '#wt-file-input',
    'broadcast-channel': '#bc-file-input',
    'inbox-thread':      null, // resolved dynamically — see onClick
};

export const feature = {
    id: 'file-attach',
    iconUrl: ICON_URL,
    pages: Object.keys(PAGE_INPUT_MAP),
    hasShelf: false,
    shouldShow(page) {
        if (page === 'broadcast-channel') {
            return !!BCChannel?.isOwnerMode;
        }
        return true;
    },
    onClick() {
        const page = document.querySelector('.page.active')?.dataset.page;
        let selector = PAGE_INPUT_MAP[page];
        // Inbox has two file inputs — pick by perspective:
        //   sender   → submission file input
        //   receiver → instruction file input
        if (page === 'inbox-thread') {
            if (IXThread.mode === 'receiver') {
                const focused = document.activeElement;
                if (focused?.id === 'inbox-receiver-textarea') {
                    selector = '#inbox-feedback-file-input';
                } else {
                    selector = '#inbox-instruction-file-input';
                }
            } else {
                selector = '#inbox-file-input';
            }
        }
        if (!selector) return;
        const input = document.querySelector(selector);
        if (!input) return;
        input.removeAttribute('capture');
        input.accept = '*/*';
        input.click();
    },
};

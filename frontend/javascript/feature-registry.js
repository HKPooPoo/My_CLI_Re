/**
 * Feature Registry — the hardcoded list of features surfaced by the scaffold.
 *
 * To add a feature: create a module in features/ that exports `feature`
 * with shape { id, iconUrl, pages[], hasShelf, initShelf?, onOpen?, onClick? },
 * then append it here.
 *
 * This replaces the Nginx-autoindex + manifest.json plugin discovery
 * of the old MOD system. Single source of truth, no async boot, no
 * instance model, no config schemas.
 */

import { feature as FileAttachFeature } from './features/file-attach.js';
import { feature as FileCameraFeature } from './features/file-camera.js';
import { feature as LlmFeature } from './features/llm.js';
import { feature as CalendarFeature } from './features/calendar.js';
import { feature as FlashcardFeature } from './features/flashcard.js';
import { feature as MarkdownFeature } from './features/markdown-preview.js';

export const FEATURES = [
    FileAttachFeature,
    FileCameraFeature,
    LlmFeature,
    CalendarFeature,
    FlashcardFeature,
    MarkdownFeature,
];

export function getFeature(id) {
    return FEATURES.find(f => f.id === id) || null;
}

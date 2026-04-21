/**
 * Feature Registry — the hardcoded list of features surfaced by the scaffold.
 *
 * Order here = visual top-to-bottom order of feature buttons in the
 * scaffold (right-side strip). Current classroom-scenario order:
 *   1. File attach  (always-needed utility)
 *   2. Calendar     (per-branch schedule)
 *   3. Flashcard    (per-branch study set)
 *   4. AI Tutor     (reads page / branch + calendar + flashcards)
 *
 * Features may expose an optional shouldShow(page, context) hook.
 * Returning false hides the button on that page for that context —
 * used by Broadcast to gate editable features behind title ownership.
 */

import { feature as FileAttachFeature } from './features/file-attach.js';
import { feature as CalendarFeature   } from './features/calendar.js';
import { feature as FlashcardFeature  } from './features/flashcard.js';
import { feature as LlmFeature        } from './features/llm.js';

export const FEATURES = [
    FileAttachFeature,
    CalendarFeature,
    FlashcardFeature,
    LlmFeature,
];

export function getFeature(id) {
    return FEATURES.find(f => f.id === id) || null;
}

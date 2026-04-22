/**
 * Platform Version Constant
 * =================================================================
 * PLATFORM_VERSION — displayed in UI (blackboard-misc page).
 * Hand-maintained. Bump on visible milestones. The MOD subsystem is
 * gone so MOD_API_VERSION was retired; features/*.js modules carry
 * their own internal versioning if they ever need it.
 *
 * History:
 *   0.9.0 — pre-overhaul CRT build (final state in the backup fork)
 *   1.0.0 — classroom overhaul (Tiers 0–22): new palette, feature
 *           shelf, dashboard, LLM tutor, calendar, drag-and-drop
 *           preview blocks, 4-icon status legend, cross-board
 *           consistency sweep. Stakeholder-ready demo baseline.
 * =================================================================
 */

export const PLATFORM_VERSION = '1.0.0';

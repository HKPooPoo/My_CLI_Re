# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow (MANDATORY)

**Every task must be wrapped in two commits — one BEFORE changes and one AFTER.**

1. **Before starting work:** Stage and commit all current uncommitted changes with message `WIP: before <short task description>`
2. **After completing work:** Stage and commit all changes with a descriptive message summarising what was done
3. Do NOT push to remote — this repo is local-only
4. Keep commits atomic: one task = one before/after commit pair

## Keeping CLAUDE.md Current (MANDATORY)

**This file must stay in sync with the codebase.** When an implementation changes documented behavior — new settings, new events, new layers, changed defaults, new templates, altered APIs — update the relevant sections of CLAUDE.md in the same commit. If you added it, document it. If you changed it, update the docs. Stale documentation is worse than no documentation.

## Handover Notes — 2026-04-21 Session (for the next LLM taking over)

This project is being handed to a new conversation. The previous
session was long and covered many topics. Summary for context only —
do NOT re-do this work; it is already in the codebase. Read the full
code + this file top to bottom before touching anything.

### What this session actually shipped

Items below are all committed and working. Documented in the
respective sections of this file — go there for the contract, don't
re-derive from guesses.

1. **MultiStepButton standardisation** (earlier session): all
   destructive buttons are now `steps: 3` with optional `dynamicLabel`.
   See the MultiStepButton and Dynamic State Buttons sections.
2. **WT single-slot notification stack + per-partner `[NEW]` indicator**
   — see the dedicated section. Uses `visibilitychange` as the single
   reset trigger; one call-tone per away session.
3. **BB/BC head-index inline reorder** — type a target in `.branch-head`,
   Enter swaps via timestamp exchange. See Head Indicator Interactions.
4. **File extension whitelist** replacing blacklist; 33 allowed
   extensions in `FileService.isAllowedExtension`. Three enforcement
   points + backend. See the file-hash section.
5. **state.owner universal "local" invariant** — state.owner is
   ALWAYS the literal `"local"` in local mode; never a specific tag.
   Self-healing across 9+ call sites. See the Branch-tag section.
6. **File mutation timestamp bump** (attach / detach / file rename) —
   now mirrors text-edit `updateText` path under the same
   `updateTimestamp` setting. Cross-device dirty detection works
   identically for text and files. See the file-hash section.
7. **Toast close-race fix** — `removeMessage` handles the
   pre-`.showing` state. See Toast & Messages lifecycle.
8. **Cross-tab `bb:record:mutated` handler always refreshes list**;
   manual COMMIT + auto-commit broadcast after success. See Cross-Tab
   Sync.
9. **Push/pull defense ladder ported to WT + BC owner mode** — the
   five-step revalidation from BB, now aligned across all three.
   See Save & Navigation Contracts.
10. **MISC page buttons**: renamed UPDATE APP → INITIALIZE WEBSITE
    DATA; hint copy updated. See MISC Page Action Buttons.
11. **Navi resize handler skips `updatePage`** (`skipPageUpdate`
    parameter). Prevents mobile keyboard pop from destroying the
    focused textarea DOM. See Navigation System.
12. **File chip `[CLOUD]` single-click preview restored** (two-click
    drift fixed). See File chip icon vs download button.
13. **Attach path get-then-put guard + BB commit exists-skip status
    promotion** — chip status no longer stuck at `[LOCAL]`. See the
    file-hash section.
14. **Hints audit** — `hints.branchName`, `hints.config.loopList`
    expanded with concrete examples, `hints.wt.theyBoard` timing
    corrected (50ms → 20ms).

### Known unresolved — shelf textarea horizontal offset

**The one issue I could not fix.** Reproducible on mobile:

1. Add an LLM MOD instance.
2. Open its shelf (not fully dragged open — stays at the default
   60vw position or any partial position).
3. Tap the `.mod-shelf-prompt` textarea.
4. Type until a line's width reaches the visible edge of the shelf.
5. The textarea's visible text shifts LEFT to keep the caret in
   view — content drifts out of the left side. User sees their text
   "pull" sideways rather than wrapping to the next line.

The shelf's CSS contract:

- `.feature-shelf-container` is `position: absolute; left: 100%;
  width: 100vw;` and slides in via `transform: translate3d(Xpx, 0, 0)`
  (X = negative, = how far the shelf is opened).
- When shelf is opened 60vw, the shelf container is still 100vw —
  40vw is off-screen to the right of the visible edge.
- Textareas inside (`.mod-shelf-prompt`, `.mod-shelf-output`) take
  their width from the container.

Attempted fixes (all reverted):
- `overflow-wrap: anywhere` + `word-break: break-word` on textarea —
  didn't help alone, the content still shifted.
- `width: 100%` + `max-width: 100%` + `min-width: 0` +
  `box-sizing: border-box` + `overflow-x: hidden` — also didn't help.
- Reducing `.feature-shelf-container` width from 100vw → 60vw — DID
  fix the drift, but broke drag-beyond-default (user wants the drag
  semantics preserved).
- JS publishing `--shelf-visible-width` CSS var from
  `updateShelfTransform` so the textarea width matches the visible
  region dynamically — user reported it "completely broke the UI"
  (exact failure mode not captured).

**What the next LLM should investigate:**
- Is the drift caused by the textarea's own `scrollLeft`, or by a
  browser "scroll caret into view" behaviour that nudges an
  ancestor? Instrumenting with `scrollLeft` / `getBoundingClientRect`
  on the touch event would reveal the answer.
- Mobile-specific: iOS Safari and Android Chrome each have their own
  quirks around focus + keyboard + viewport. `visualViewport.offsetLeft`
  on input might be involved.
- A reliable repro needs the real mobile device (same-domain desktop
  DevTools mobile emulation does NOT reliably reproduce this —
  confirmed during this session).
- User wants to preserve: draggable shelf (any width), no fixed shelf
  width, and no "magical" caret behaviour. Whatever fix ships must
  keep the drag-to-any-position feature intact.

### This project's biggest architectural tensions (for next LLM's awareness)

These aren't unresolved bugs, but they're where complexity keeps
biting. Read the relevant sections before proposing structural
changes:

1. **`state.owner` vs record.owner split.** CLAUDE.md's Branch-tag
   section now says state.owner must always be `"local"` literal.
   The record-level owner tag still carries sync-state info. Nine
   call sites had this wrong historically; the invariant is
   self-healing. If you see any code that reads `state.owner` and
   branches on its tag, that's a bug.
2. **Local-first sync with no server-side dirty signal.** The
   `[asynced]` tag is local-only; other devices can't see it. Cross-
   device dirty detection relies on timestamp mismatch via
   `MAX(blackboards.timestamp)`. Any new mutation that changes content
   without bumping timestamp would silently break this — hence
   `updateText` / `updateFileHash` / rename etc. all bump timestamp
   under `updateTimestamp: true` (default).
3. **Shelf width vs content width.** See the unresolved bug above.
4. **MOD `data-loading` convention.** Consumers (ASCII Animator) can
   observe but producers never import consumers. This is good — don't
   refactor to direct imports.
5. **Toast lifecycle has a rAF-delayed `.showing` class.** Any
   fast-fail path (catch running before rAF) must go through
   `removeMessage`, which now handles both pre-shown and post-shown
   cases. Don't add bespoke toast cleanup at call sites.
6. **Extensive use of `position: absolute` with `right: 0`.** If the
   page-container's scroll width ever exceeds viewport width (e.g.
   from a wide child somewhere), the entire right-anchored scaffold
   drifts. `.page-container` has `overflow-x: hidden` to prevent this.
   If someone removes that rule, scaffold drift will return.

### Process notes for the next LLM

- **CLAUDE.md is MANDATORY to keep current.** The previous session
  repeatedly violated this rule — fixes were made without doc
  updates, which made every subsequent similar bug harder to
  diagnose. The `dac9397` consolidated catch-up commit was a
  back-payment for those violations.
- **Git workflow**: every non-trivial task should have a WIP commit
  before and a descriptive commit after. This was also violated
  repeatedly — not worth reverting historically but enforce going
  forward.
- **User prefers 繁體中文** in conversation (explicit instruction;
  memory file at `~/.claude/projects/-home-yu/memory/feedback_language.md`).
  Code, commit messages, and comments stay English.
- **User tests manually on mobile.** Don't assume desktop DevTools
  mobile emulation reveals all bugs — several in this session
  couldn't be repro'd on desktop.
- **When stuck on a bug, ask — don't keep iterating.** This session
  had multiple cases of 2-3 failed attempts in a row on the same
  visible symptom. Better to ask the user a clarifying question
  after the first miss.

## Handover Notes — Classroom Overhaul (same 2026-04-21 session, continuation)

Following the notes above, the SAME date brought a structural overhaul
per stakeholder feedback that rejected the CRT sandbox identity. This
fork at `/home/yu/Projects/!My_CLI_Re` is now **demo-only**; user keeps
the original MyCLI in a backup folder for personal use. **Cut
ruthlessly here — no backwards-compat obligations.**

Master plan lives at `documents/OVERHAUL_PLAN.md` (not git-tracked —
the `documents/` folder is in `.gitignore`). That doc has a Decision
Log section; every new user decision gets appended with a date.

### What the overhaul has shipped

(Tier numbers reference OVERHAUL_PLAN.md §7.)

1. **Tier 0–3** — Retirement of CRT visual identity:
   - Deleted `en.json` / `zh-TW.json`; single-locale (`default.json`).
   - Deleted 6 MOD folders (light-theme, ascii-animator, info-screensaver,
     speech-to-text, translate, stopwatch folders pre-Tier-8).
   - Deleted `crt-vfx.css`, `theme-engine.js`, `.theme-light` branches.
   - New palette (`#a62e42` wine / `#fefefe` / `#c56fd5` / `#f5f5f5` /
     `#7d7d7d` / derived `#262626`). Inter font. New banner SVG.

2. **Tier 7** — Auth landing:
   - Auth sub-page becomes the default landing for logged-out users.
   - Login success auto-navigates to broadcast-list (Announce).
   - `setSubNaviHead(naviItem, subName)` new `navi.js` export.

3. **Tier 8+10** — MOD system removed; Feature Shelf introduced:
   - Deleted `frontend/mods/` folder entirely, plus `mod-state.js`,
     `mod-context.js`, `mod-hooks.js`, `mod-tools.js`,
     `mod-board-provider.js`, `mod-field-registry.js`,
     `mods-manager.js`, `mods-misc.js`, `feature-markdown.js`.
   - New: `javascript/feature-registry.js` + `javascript/features/*.js`
     modules (llm, calendar, flashcard, file-attach).
   - `feature-shelf.js` rewritten: reads FEATURES array, creates
     buttons + shelves from plain JS, no manifest / lifecycle / ctx.
   - MODS main-nav section + all mods-list / mods-config / mods-misc
     pages removed from `index.html`.
   - Old metadata-provider hooks in blackboard.js / broadcast-channel.js
     / walkie-typie-text.js removed (were imported from deleted
     `mod-board-provider.js`).

4. **Auth overlay** — single global `#auth-locked-overlay` inside
   `.page-container`, Press Start visual style, `inert` on siblings
   for F12-bypass defence. LOCKED_PAGES whitelist:
   `blackboard-log`, `blackboard-branch`, `walkie-typie-list`,
   `walkie-typie-text`, `broadcast-channel`, `broadcast-list`.
   Old per-page overlays (walkie-typie-auth-overlay, etc.) retired.

5. **Tier 9a** — AI Tutor shelf (`features/llm.js`):
   - 4 hardcoded prompts: Summarize page / Summarize notebook /
     Translate to 繁中 / Suggest a schedule.
   - SEND left + dropdown right on same row (shelf drags right-to-left).
   - Markdown render via marked.js + sanitiser; user-select enabled.
   - "Suggest a schedule" uses dynamic prompt composition (empty /
     all-past / has-upcoming branches) with strict three-part output
     (MISSION / COGNITION / SCHEDULE) + few-shot example + banned-
     activity list. qwen3.5:4b via Ollama, temperature 0.3.

6. **Tier 9b + Tier 14 part 1** — User settings sync infrastructure
   + BB Calendar:
   - New backend endpoints: `GET /api/user/settings` and
     `PUT /api/user/settings` (UserSettingsController). Stored in
     existing `users.settings` JSONB column; no migration.
   - New frontend `sync-service.js`: in-memory mirror of
     `users.settings`; debounced 2s PUT on setSetting; fetches on
     `auth:updated`; events `settings:synced` + `settings:changed`.
   - `features/calendar.js` renders a month grid with per-day
     editor; data via `sync-service.getSetting('calendar')`; title
     is `{uid} CALENDAR`. BB calendar is PERSONAL — does NOT merge
     with BC channel calendars.
   - AI Tutor's "Suggest a schedule" reads calendar via same
     `sync-service` — single source of truth.

7. **Tier 9f** — Shelf drag handle: two vertical grip bars via
   `::before`/`::after`, brand-coloured hover, bars thicken on drag.
   No more `>>` text; `aria-label` carries the affordance.

8. **ASCII option A** — `javascript/ascii/{shelf-spinner,toast-spinner}.js`
   ported verbatim from the pre-Tier-8 ascii-animator backup.
   Attach via MutationObserver on the existing `data-loading="true"`
   convention — zero call-site changes elsewhere. WebGL layers
   (matrix-rain, perlin-bg, mouse-light) intentionally skipped.

9. **Tier 11 + head-indicator consistency sweep** — Page Previewer
   rail beside the textarea on both BB-log and BC-channel; shared
   `.head-indicator` scoped to editor-only pages (removed `show-branch`
   from `blackboard-branch` / `broadcast-list`); boot-time
   `${placeholder}` text cleared; `.sub-navi-indicator` display gate
   un-commented. See "Page Previewer Rail" section.

10. **Tier 11.5 — reverts + head-indicator corrections**. BB Topic
    input removed (single textarea restored). Native `title` tooltip
    on preview blocks removed (stakeholder: "not that kind of cheap
    hover show title"). Head-indicator colons restored — format is
    `[SAVED]:branch_name:head`. `.branch-head` inline reorder feature
    fully removed: `contenteditable` attribute gone; `hud.js` Enter /
    Escape / blur handlers and `.branch-name` click proxy gone;
    `branchHead:reorderRequested` / `branchHead:syncRequested` events
    no longer dispatched or consumed; `hints.branchName` simplified;
    `reorderVirtual` / `reorderFailed` i18n keys removed. BC
    subscriber mode's `.branch-is-saved` now renders empty (no more
    `[SUBSCRIBED]` leak). `BBCore.swapRecordsByHead` / `BCDb.swapRecordsByHead`
    kept in-place but unreferenced, awaiting Tier 21 drag-and-drop.

13. **Tier 22 / 22.5 — unified status icons + preview drag-and-drop + cleanups**.
    One icon vocabulary shared by BB / WT / BC list rows. **Only active
    states render** — inactive slots are absent from the DOM entirely,
    mirroring the text-based `[SAVED]:name:head` convention where a row
    shows one or two tokens at a time, not a four-slot legend. Icons are
    16 × 16, laid out **horizontally** in the top-right corner, painted
    in `--brand` wine. Helper `frontend/javascript/list-status.js`
    exports `buildStatusLegend(state)` (HTML string) and
    `makeStatusLegend(state)` (DOM node); both skip slots where the
    state key is falsy.

    **Icon vocabulary** (5 SVGs in `frontend/images/status-*.svg`):
    - **HEAD** (eye, `status-head.svg`) — currently open in editor
    - **LOCAL** (floppy save, `status-local.svg`) — on this device only, not on server
    - **SYNCED** (cloud, `status-synced.svg`) — on server, in sync with local
    - **NOT-SYNCED** (cloud with cross, `status-asynced.svg`) — on server but local diverges
    - **NEW** (envelope with dot, `status-new.svg`) — unread signal from partner (WT only)

    **Per-board icon subsets — each board opts into ONLY the slots its
    data model natively expresses. Boards DO NOT share a uniform schema:**

    | Board | Active slots | Why this subset |
    |---|---|---|
    | **BB** (branch list) | HEAD, LOCAL, SYNCED, NOT-SYNCED | BB has per-branch VCS; all four states are native. HEAD fires on `branch.id === currentHeadId` (`= state.branchId`, the branch in the log editor) — NOT the list cursor `activeBranchId`. LOCAL/SYNCED/ASYNCED derive from `branch.isLocal`, `branch.isServer`, `branch.isDirty`. |
    | **WT** (connection list) | NEW only | WT is P2P live; no per-connection sync tag exists in the data model. The only legitimate status is **unread**, already tracked by `_newMessagePartners` Set (maintained on `walkie-typie:content-update`, cleared on `navi:pageChanged → walkie-typie-text`). Fires when `_newMessagePartners.has(conn.partner_uid)`. No eye, no floppy, no clouds. |
    | **BC** (channel list) | SYNCED, NOT-SYNCED only | BC's only meaningful row-level status is "is this channel cast, and if so is it current?" No eye (clicking a row opens it — the feedback loop is the navigation itself). No floppy (un-cast `isLocalOnly` channels show no icon at all — panel disappears). Cloud fires when `serverChannelId && !isLocalOnly && !(isOwnerOf(ch) && ch.isDirty)`; cloud-cross fires when `serverChannelId && !isLocalOnly && isOwnerOf(ch) && ch.isDirty`. Subscribers never see the cross — they can't mutate server content, so "divergence" is meaningless for them. |

    The project's native VCS `HEAD` (per-record cursor within a branch,
    shown in the `.head-indicator` strip on the log page) is a SEPARATE
    concept from the BB eye icon. List-item HEAD = "which container is
    currently open"; VCS HEAD = "which record inside the open container
    is being viewed." Don't conflate them.

    Container styling: white-backed rounded panel (`background: #fff`,
    1 px border, 3 px × 6 px padding) so the icon stack is legible over
    any list-item background including the brand-tinted `.active` row.
    The panel only renders when at least one slot applies — a row with
    no active state gets no panel at all.

    Also in this tier:
    - `[SUBSCRIBED]` span removed from `.branch-name` inside the head
      indicator — subscription state now lives solely on the BC list
      row's icon legend
    - `.delete-page-btn` repositioned `position: absolute; top: 8px;
      right: 8px` inside each editor-wrapper (was bottom-centre)
    - `boardSwap` ("MY SIDE FIRST") setting retired — in-session
      switch button remains but the preference is not persisted;
      `SCOPE_DEFAULTS.wt` down to `{ notifications: true }`
    - **Preview block drag-and-drop** shipped:
      - Desktop: `draggable="true"` on non-virtual blocks + HTML5
        `dragstart/over/drop` on the rail → `swapRecordsByHead(from, to)`
      - Mobile: during existing 300 ms peek, if `touchend` lands on a
        different block than `touchstart`, treat the peek-drag as a
        swap. Same semantic: release-on-different-block = reorder.
      - `.page-preview-block.dragging` CSS dims the source block
      - BC restricts both paths to owner mode; readers never see
        `draggable` or get the drop handler
    - Retired `status-online / offline / cloud / owner / subscribed`
      SVGs are no longer referenced by the renderers (files remain on
      disk pending a future cleanup pass). Active set: `head / local /
      synced / asynced` (4 files).

15. **Tier 22.11 — UX polish pass (stakeholder-visible quality)**.
    - **Preview blocks** now have grip-dot affordance (`::after`
      radial-gradient on the right edge), `cursor: grab` / `grabbing`,
      hover scale `1.04` + `shadow-brand`. Users can see at a glance
      the blocks are interactive.
    - **Feature buttons** slide left 4 px on hover with a brand-
      coloured shadow (feels like drawer handles pulling out). Click
      adds a micro scale-down for tactile feedback. The button whose
      shelf is currently open gets `.active` class (kept slid-out +
      glowing) — `feature-shelf.js` adds/removes the class in the
      click handler and `closeShelf()`.
    - **`.editor-actions` right offset** bumped from `8px` to
      `calc(var(--sub-navi-height) + 8px)` so RESET + DELETE PAGE
      clear the feature-container column (no z-index wrestling).
    - **Invisible spacer button** (`.feature-btn.feature-btn-spacer`,
      `visibility: hidden; pointer-events: none; tabindex=-1`) is
      inserted at the top of `.feature-container` on bootstrap. It
      claims one slot in the `justify-content: space-around` layout,
      pushing visible feature buttons down clear of the
      `.editor-actions` zone without manual offset math.
    - **WT centre-swap button** flips LEFT on narrow screens
      (`@media (max-width: 768px) or (max-height: 768px)` →
      `left: 0; right: auto; transform: translate(-100%, -50%)`)
      instead of remaining pinned right where it collided with the
      WE board's push/pull labels.
    - **Feature button hints** — `hints.feature.{file-attach / calendar
      / flashcard / llm}` added to `default.json`. `feature-shelf.js`
      auto-applies `data-hint = "hints.feature.{id}"` when the feature
      doesn't override `hintKey`.
    - **Platform version bump**: `PLATFORM_VERSION = '1.0.0'` in
      `version.js` (was `0.9.0` — stuck since the pre-overhaul fork).
      The version-string comment now documents the history so future
      bumps carry milestone context.

14. **Tier 22.9 — BC dirty tracking + RESET button + drop-overlay
    scope**.
    - `BCMeta.setDirty(localId, bool)` + `BCMeta.isDirty(localId)`
      persist a channel-level dirty flag in `broadcast_channels.isDirty`
      (Dexie schemaless field).
    - `BCChannel._markLocalDirty()` helper called from every owner
      mutation site (save, attach, detach, rename, drag swap, delete
      page) — flips the flag when the channel has a `serverChannelId`
      (uncast channels stay `isLocalOnly` and show no icon either way).
    - Cast success clears the flag in `broadcast-list.js` cast
      handler; `BCMeta.setDirty(localId, false)` is called right after
      `setServerChannelId`.
    - `broadcast:localDirty` window event (fired by `_markLocalDirty`)
      lets `broadcast-list.js` flip the row's `isDirty` and re-render
      without a network fetch.
    - `broadcast-list.js fetchChannels` now reads `meta.isDirty` into
      `ch.isDirty` so cross-tab / cross-device refreshes pick up the
      dirty state naturally.
    - **BC RESET button** (`#bc-reset-btn`) lives next to DELETE PAGE
      inside a new `.editor-actions` flex wrapper in the BC editor.
      3-step destructive. Handler fetches server records + channel
      metadata, wipes local records via `BCDb.deleteAllRecords`,
      re-imports via `BCDb.importRecords`, clears dirty, dispatches
      `broadcast:localBootstrapped` to refresh the list. Visibility:
      owner-only AND requires `serverChannelId` (uncast channels have
      nothing to reset to).
    - **Drop-overlay scope** — the dashed frame now hugs only the
      textarea area. BB/BC override shifts `left: calc(8vw + 56px)`
      (8vw gutter + 48 px preview rail + 8 px gap) so the overlay
      doesn't cover the preview rail. WT keeps `left: 8vw`. Small-
      screen media query echoes the offset with `4vw` gutter.

12. **Tier 20 — DELETE PAGE button**. Adds `#bb-delete-page-btn`,
    `#wt-delete-page-btn`, `#bc-delete-page-btn` inside each editor-
    wrapper. All three use `MultiStepButton { steps: 3 }` (destructive
    confirm). Handler deletes the record at `state.currentHead` from
    the respective IDB table (`blackboard` / `walkie_typie` /
    `broadcast_boards`). If the branch / channel becomes empty,
    `state.isVirtual = true; state.currentHead = 0`. If currentHead
    was past the new max, clamps to `count - 1`. BB + BC broadcast
    `bb:record:mutated` / `bc:record:mutated` cross-tab events; BB
    also schedules auto-commit. Virtual state (NEW blank page) rejects
    delete with `common.deletePageFailed`. BC delete button is hidden
    in subscriber mode and when no channel is loaded — `loadChannel()`
    sets `display: ''` when `isOwnerMode`, `auth:updated` and
    `broadcast:cleared` set `display: 'none'`. Shared CSS lives in
    `editor-attachments.css` (`.delete-page-btn` + `.btn-armed`).

11. **Tier 18 — settings purge + hardcoded defaults**. The
    `maxSlot / maxFiles / autoCleanBlanks / updateTimestamp / loopList`
    per-scope toggles are all retired. Behaviour is now hardcoded
    project-wide:
    - `BOARD_MAX_SLOT = 100` (all boards: BB + WT + BC)
    - `RECORD_MAX_FILES = 10` (all attach paths)
    - Auto-clean-blanks OFF (blank pages preserved — no scrub)
    - Update-timestamp OFF (all edits in-place, position stable)
    - Loop-list OFF (InfiniteList stops at top/bottom)
    Exposed via `settings.js` exports `BOARD_MAX_SLOT` and
    `RECORD_MAX_FILES`. Config pages trimmed: BB keeps `autoSync` +
    global `showHints / screensaverTimeout`; WT keeps `boardSwap /
    notifications`; BC config page is empty (reset button only).
    `BBCore.updateText / updateFileHash / scrubBranch` survive but
    are no longer called by any save/push/pull path; retained for
    future drag-and-drop (Tier 21). i18n keys pruned:
    `config.maxSlotLabel / maxFilesLabel / autoCleanBlanks /
    updateTimestamp / loopList` and their `hints.config.*` variants
    all removed from `default.json`.

### Still pending (post-demo backlog)

- **Tier 9c** — BC Calendar server-side (new table or
  `broadcast_channels.calendar` JSONB), owner-writes / subscribers-
  read. Title: `{channel name} CALENDAR`.
- **Tier 9d** — BB Flashcard maker + player (per-branch, sync-backed).
- **Tier 9e** — BC Flashcard (per-channel server-side, same
  ownership semantics as BC Calendar).
- **Tier 14 part 2** — Server sync for Flashcard data.
- **Tier 13** — List status icons + 4 px left border sweep.
- **Tier 15** — Read/PIN ratio on announcements + Ctrl-K search.
- **Tier 16** — Restaurant backend purge.
- **Tier 17** — README + SW precache rebuild.
- **Pending mission**: LLM multi-branch aggregation (memory:
  `project_pending_llm_multipage.md`).

### Doc-discipline rule for this session

**Every Tier commit must update both** `CLAUDE.md` (for structural
truth) **and** `documents/OVERHAUL_PLAN.md` (for Status + Decision
Log). I violated this between Tier 7 and Tier 14 part 1 and
back-paid with a single catch-up commit; do not repeat.

---

## Project Overview

**My CLI Re** (My Clean Logging Interface) is a versioned communication platform with a unified Board model across three visibility scopes — personal (Blackboard), paired (Walkie-Typie), and public (Broadcast). Docker-based full-stack: Laravel 12 (PHP-FPM) backend + vanilla JS frontend served by Nginx, retro CRT terminal aesthetic.

## CRITICAL: Board Model & Operation Semantics

**This project uses VCS-inspired terminology but the operations do NOT match git semantics. Never assume git behavior.**

```
Board = timestamped text record (text + optional file attachments)
Blackboard  = Board(scope: SELF)    → personal, multi-branch timelines
Walkie-Typie = Board(scope: PAIR)   → P2P paired boards, real-time whisper
Broadcast    = Board(scope: PUBLIC) → public channels, one-to-many
```

| Term | MyCLI Meaning (NOT git) |
|------|------------------------|
| **Push** | Navigate toward NEWER records (decrement head index) |
| **Pull** | Navigate toward OLDER records (increment head index) |
| **Commit** | Upload ALL local records to server (full-branch replacement, Last-Write-Wins) |
| **Checkout** | Re-download the current HEAD branch from server (same branch selected) |
| **Switch** | Change to a different branch (different branch selected) |
| **Fork** | Duplicate all records into a new independent branch (NO parent pointer, NO ancestry) |
| **Branch** | Independent flat timeline of text snapshots (NO tree, NO parent-child) |
| **HEAD** | In-memory integer offset into the record list (0 = newest) |
| **Drop** | Delete server-side records for a branch |
| **Clean** | Wipe all records in a branch, leaving one empty placeholder |

**What does NOT exist:** No tree/DAG, no parent pointers, no merge, no diff, no commit graph, no conflict resolution. Branches are flat sorted lists of timestamped records.

**Virtual State (BB only):** When user PUSHes past head 0, system enters "virtual" state — blank textarea with no backing record. Typing creates a new record and exits virtual mode.

**Storage:** Local-first, manual-sync. IndexedDB (primary) ←commit/checkout→ PostgreSQL (backup). Owner tag encodes sync state: `"local"` | `"local, online/{uid} [synced]"` | `"local, online/{uid} [asynced]"`.

**branch_id:** `Date.now()` — millisecond timestamp, NOT sequential. Branch name is a separate display label stored on every record.

### Known Design Decisions

**LWW Commit (Last-Write-Wins):** Commit is full-branch replacement — client sends all records, server DELETEs records not in payload then UPSERTs the rest. No conflict detection, no optimistic locking. Accepted for personal notebook system: same-user dual-device simultaneous commit is near-impossible (auto-sync deviceId prevents self-echo). Diff-Match-Patch is not applicable — DMP solves intra-document text conflicts, not inter-record set conflicts. Timestamp-Based Union Merge was considered but rejected — `updateText()` uses delete + create (IndexedDB primary key includes timestamp, cannot update in place), so union merge would resurrect old record versions. Correct merge would require record lineage tracking, which exceeds the system's complexity budget.

**Logout preserves local data (intentional).** `auth.js` logout only clears the Sanctum session, `localStorage.currentUser/currentTitle`, and in-memory state. IndexedDB tables (`blackboard`, `walkie_typie`, `broadcast_boards`, `broadcast_channels`, `file_blobs`) are untouched. Rationale: local-first — the device is the user's primary storage; logging out is about ending a server session, not erasing notes. Owner tags (e.g. `"local, online/alice [synced]"`) remain after Alice logs out. **Only account deletion** (pending mission E2) fully wipes user-scoped local data.

Known risk on shared devices: Bob logging in after Alice will see Alice's locally-persisted branches tagged `online/alice [synced]`. Bob's edits to those records stay local until Bob's own commit creates a parallel server copy under Bob's user_id; Alice's server records are unaffected. This is acceptable for the target single-user personal-notebook use case but documented here for consideration if multi-user shared-device usage becomes a requirement.

**File blobs also persist on logout.** `db.file_blobs` caches downloaded attachments by hash. Since hashes are content-addressed (SHA-256), a cached blob from Alice is readable by Bob if Bob encounters the same hash — harmless for shared server-committed files (both were authorized to see them), but worth noting when considering strict-isolation scenarios.

**File hash is name-sensitive: `SHA-256(content || 0x00 || original_name)`.** Two uploads with identical content but different filenames produce different hashes (no dedupe). Same content + same name → same hash → dedupe. This enables per-record file rename without a server rename endpoint: the chip name input is editable (Enter/blur commits), `editor-attachments._renameFile()` recomputes the hash under the new name, puts the blob under the new hash in `file_blobs` (status='local'), and fires `onRename(oldHash, newHash, meta)` so the host (BB/WT/BC) swaps the hash in the record's `file_hash` field. Next auto-commit uploads the new blob; the old server hash becomes orphan-eligible via the 24h cleanup. **Per-record uniqueness:** the same hash cannot appear twice in one record — attach/rename that would collide shows `files.duplicateInRecord` / `files.renameDuplicate` toast and is rejected. **Client and server must compute the same hash** — `FileService.upload(blob, filename)` sends the explicit filename so Blob uploads don't degrade to `"blob"` on the server. **BB attach / detach / file-rename / branch-rename all downgrade owner tag from `[synced]` to `[asynced]`** — each of these mutations makes the record (or every record in the branch, for branch-rename) reference content that diverges from what the server has: a new file attached, an existing file removed, a chip renamed to a new hash, or the branch itself re-labelled (commit sends `branch_name` per record, so a local label change is a real divergence). Leaving the tag as `[synced]` would mislead observers (including other tabs) into seeing a branch that looks server-consistent. All four paths use the shared `markAsynced` helper in `blackboard-core.js`. Commit re-promotes back to `[synced]` once upload succeeds.

**File mutations are always in-place (Tier 18).** The `updateTimestamp` setting was retired — `onAttach` / `onDetach` / `onRename` on `blackboard.js` do a `modify()` on the record (parallels `updateTextInPlace`) and call `markAsynced(owner)` on the record's owner tag. The record stays at its existing timestamp, so head position is stable across file mutations.

Cross-device `isDirty` detection now relies solely on the `[asynced]` owner tag. `MAX(blackboards.timestamp)` is no longer bumped by local edits (file or text), so other devices can't see the divergence until the next commit. This is an explicit trade-off for position stability — Tier 18 priorities stable head indices over cross-device live-dirtying.

`blackboard-ui.js` renders the visible `[synced]`/`[asynced]` tag from `branch.isDirty`, which is true when `getAllBranches()` flagged any record in this branch with an `[asynced]` owner (condition (b) from earlier designs). Condition (a) — timestamp mismatch — is effectively dead now that edits don't bump timestamps; the tag transition happens via `markAsynced()` alone.

**File chip status guards — must stay in sync with the attach / commit / rename paths:**
- **Attach path (`editor-attachments.js:280`)** checks `db.file_blobs.get(hash)` BEFORE `put`. If the row already exists (possibly `status: 'synced'`) only `last_accessed` is updated; status is preserved. Without this guard, re-attaching the same `(content + name)` pair anywhere on the device regressed the chip to `[LOCAL]` because `put` overwrote status. Mirrors the same guard long held by `_renameFile` (line 733-746).
- **BB commit `exists(hash)` skip (`blackboard-vcs.js:186-196`)** also *promotes* a stale `status: 'local'` to `'synced'` when it skips the upload. Without this, a chip once stuck on `[LOCAL]` (from attach regressions, cross-record dedupe, etc.) never self-healed — every subsequent commit re-skipped, never reconciled. WT / BC commit paths use a `status !== 'synced'` gate instead of `exists()`, so they redundantly re-upload but always promote on success; no equivalent bug there.
- **Extension whitelist.** All file entry points go through `FileService.isAllowedExtension(name)` (`file-service.js`). `ALLOWED_EXTENSIONS` is a 33-entry set (text / docs / images / audio / video / archives). Unknown / missing / trailing-dot extensions are rejected. Enforcement points: (1) `EditorAttachments.handleFile` — covers drag / drop / paste / picker (all converge there), (2) `_renameFile` — prevents chip rename to a forbidden extension, (3) `FileService.upload` — defence-in-depth for any MOD or direct caller that bypasses the two client gates. Backend `FileController.php:31-46` re-checks authoritatively. The older blacklist (retained as commented-out reference in both front and back) couldn't cover disguised-binary uploads by design — a `.exe` renamed to `.md` before drag slipped through.

**File chip icon vs download button.** Two buttons, two intents, no overlap:
- **Icon** (`<a href="/api/files/{hash}?inline=1" target="_blank" rel="noopener">`) — single-click contract: `source → IDB (if needed) → browser inline preview`. Click behaviour is state-dependent:
  - `[SYNC]`: no preventDefault; native anchor navigation opens the inline URL — server renders preview directly, IDB already has the blob cached from prior use.
  - `[LOCAL]`: preventDefault + pre-open blank tab synchronously (user-gesture preservation for popup blocker), `_ensureLocal` returns the local blob, `win.location = URL.createObjectURL(blob)`.
  - `[CLOUD]`: preventDefault + pre-open blank tab synchronously, `_ensureLocal` downloads the blob into `file_blobs` (chip promotes `is-cloud` → `is-synced` in place), then `win.location = FileService.viewUrl(hash)` navigates the pre-opened tab to the server inline URL for preview. Single click completes the full flow; an earlier implementation split this into two clicks (download first, click again to preview) and was reverted as a contract violation.
- **Download button** (`[⬇]`) — single-click contract: `source → IDB (if needed) → Save-As to disk`, NEVER opens a browser preview. `downloadFile()` → `_ensureLocal()` → `_saveBlobAs()`. Regardless of chip state, the end state is a saved file. `[CLOUD]` download shares the same `_ensureLocal` side effect, so the chip also promotes to `[SYNC]`.

**`GET /api/files/{hash}?inline=1`** uses `response()->file()` with `Content-Disposition: inline`; without the flag it uses `response()->download()` with `Content-Disposition: attachment`.

**Branch tag and file-chip status are independent state machines.** They look similar (both have three states, both describe "sync-ness") but answer different questions and update on different triggers. Confusing them leads to wrong mental models.

| Aspect | Branch tag (`owner` column) | File-chip status |
|--------|----------------------------|------------------|
| Question answered | *"When did this device last reconcile with the server for this branch?"* | *"Right now, does this blob live on this device, the server, or both?"* |
| Stored? | Yes — written into `owner` on record insert/update | No — recomputed from `file_blobs[hash].status` every render |
| Triggers that write it | commit success / commit partial-failure / checkout / rename (by our `onRename`) | N/A — derived state |
| States | `local` · `local, online/{uid} [synced]` · `local, online/{uid} [asynced]` | `[LOCAL]` · `[SYNC]` · `[CLOUD]` |
| Detects remote divergence? | **No.** Stays `[synced]` even when another device has committed over this branch, until this device pulls. | N/A — chip is local-existence only. |

Both machines are deliberately passive about "what is on the server right this moment". Neither will fabricate a state by querying the server to make the UI look fresher. The server is the source of truth only when the user (or auto-sync) triggers a pull (checkout / recover / 5s branch-list poll / visibilitychange / online event / WebSocket `BlackboardUpdated`).

**Consequences to keep in mind:**
- Three chip states can coexist in one record — a page can show `[LOCAL]` (just attached), `[SYNC]` (previously uploaded and cached), and `[CLOUD]` (another device uploaded, not yet downloaded here) side by side. This is correct; do not normalise.
- A branch tag of `[synced]` **does not** mean "server has not moved" — it means "last time we reconciled, we were equal". Fresh data may be one pull away.
- A device that only receives server updates (never mutates locally) should not be marked `[asynced]` — the tag is about *my* outgoing divergence, not *their* incoming changes. "Behind the server" has no tag today; users discover it when they pull.
- `[LOCAL]` chip does not imply `[asynced]` branch. A file can be `[LOCAL]` (newly attached) while the branch is still `[synced]` from a previous commit — the branch's tag only flips when an explicit trigger fires. Our `onRename` is the one place where a file-level mutation flips the branch tag immediately, because rename fundamentally changes what the branch *references* on the server.
- **`state.owner` is ALWAYS the literal `"local"` in local mode — never a specific tag.** This is stronger than "drop after rename/reorder"; specific tags (`[synced]`, `[asynced]`, etc.) must **never** be stored in `state.owner`. Rationale: `BBCore.getRecord` / `getAllRecordsForBranch` / `countRecords` / `cleanupOldRecords` trigger their `startsWith('local')` branch **only when** `owner === 'local'` literally; any specific tag takes the exact `[owner+branch_id+timestamp]` index path and only matches records with that same tag. Branches naturally go mixed the first time a user edits a synced branch — `[synced]` records that are touched flip to `[asynced]`; untouched `[synced]` records stay; newly-typed records are pure `"local"`. A specific-tag `state.owner` picks a subset, leaving other records invisible to `getRecord`, so navigation / `syncView` paint blank and the user reads "my records got deleted". The records ARE there; `state.owner`'s tag just filtered them out. Keeping `state.owner = "local"` universally means every query sees every local-prefix record.
  - **Record owner tag is separate from `state.owner`.** The RECORD's owner remains informative: `markAsynced(entry.owner)` on single-record mutations (attach / detach / rename) stays — the `[asynced]` tag on the record is load-bearing for `hasAsyncedRecord` dirty detection when a file-only change doesn't bump the timestamp. What changes is *where* specific tags live: on records (fine), not on `state.owner` (never).
  - **Self-healing**: every call site that previously did `state.owner = newOwner` or `state.owner = anyRecord.owner` now does `state.owner = "local"` defensively, so if any legacy path re-introduces a specific tag, the next mutation reconciles. The covered sites: `onAttach` (virtual + non-virtual), `onDetach`, `onRename` file-chip, rename listener, reorder listener, CLEAN listener, cross-tab mutation handler, `initBoard`, `checkout`.
  - **Virtual-attach new record inherits `markAsynced(branch.owner)` as a redundant signal** — on an empty branch it's `"local"`, on a previously-synced branch it's `"local, online/{uid} [asynced]"`. Two independent dirty signals (timestamp mismatch + `hasAsyncedRecord`) both flag the branch dirty, so even if one path ever breaks, the other still catches it. This is the one deliberate case where `record.owner ≠ state.owner` — state.owner stays at the `"local"` catch-all for navigation, while the record carries tag-level provenance.

This is a Local-First trade-off: UI states are honest snapshots of local knowledge, not optimistic queries against a live server. The alternative (reactive polling per chip / per tag) was rejected because it creates race conditions, burns bandwidth, and makes offline behaviour degrade poorly. The fix path when staleness matters is always "pull", not "compute harder".

### Service Worker NavigationRoute

`sw-src.js` registers a `NavigationRoute` that serves cached `/index.html` for all top-level navigations. The denylist MUST include **`/^\/api\//`** or file downloads opened in a new tab (e.g. clicking a SYNCED chip icon) would be hijacked into the SPA shell under `/api/files/...`, where relative `<link>` paths 404 and the user sees an unstyled page. Also denies `/^\/pages\//` so standalone pages stay standalone.

### Cross-Tab Sync

`cross-tab-sync.js` wraps a `BroadcastChannel('mycli-sync')` event bus. Any tab on this device that mutates local IndexedDB state posts a typed event (`bb:record:mutated`, `wt:record:mutated`, `bc:record:mutated`) with the minimum identifying detail (branchId/localChannelId, timestamp). Receivers re-read from IndexedDB — the message is just a trigger, the DB is the source of truth. This covers cross-TAB updates; cross-DEVICE updates still go through WebSocket via Reverb.

Wired atomic mutation points (one broadcast per user action): chip rename (Enter/blur), chip attach (drop / picker / paste), chip detach (`[×]` click), branch rename, head-index reorder, CLEAN, COMMIT (both manual button and auto-sync path). **Text save is a deliberate exception** — the textarea save is a 200ms debounce that fires mid-keystroke; broadcasting it would leak in-progress characters to the observer tab and produce per-keystroke flicker. Only atomic user actions cross the bus.

**Consumer-side gate**: the `bb:record:mutated` handler in `blackboard.js:956` splits two concerns — `updateBranchList()` runs **unconditionally** so the VCS list reflects mutations on ANY branch (Tab1 edits branch A → Tab2 viewing branch B still refreshes its list so branch A's row shows the new `[asynced]`/`[synced]` tag); only `state.owner` alignment + `syncView()` are gated on `detail.branchId === state.branchId` since those only make sense for the currently-viewed branch. An earlier implementation gated `updateBranchList()` too, which made cross-branch mutations silently invisible in observer tabs until the next 5 s poll.

## Development Commands

```bash
docker compose up -d --build          # Build and start all services
docker compose down                    # Stop all services
docker compose logs -f api             # Tail API logs
docker exec my-cli-api php artisan migrate
docker exec my-cli-api php artisan migrate:fresh --seed
docker exec my-cli-api php artisan test                        # Run all tests
docker exec my-cli-api php artisan test --filter TestClassName # Run single test
docker exec my-cli-api ./vendor/bin/pint                       # Lint (Laravel Pint)
npm run build:sw                       # Rebuild SW precache manifest after frontend changes
# First-time setup:
npm install                            # Install workbox-build (dev tooling)
docker exec my-cli-api sh -c "cp .env.example .env && php artisan key:generate && php artisan migrate --force"
```

| Service | URL |
|---------|-----|
| Frontend | `http://localhost` |
| API | `http://localhost/api` |
| PgAdmin | `http://localhost:8080` |
| Mailpit | `http://localhost:8025` |
| Reverb (WS) | `ws://localhost:8081` |
| PostgreSQL | `localhost:5431` |

## Testing

### CRITICAL: Docker SQLite Isolation

**Tests MUST use SQLite in-memory, NEVER production PostgreSQL.** Docker sets `DB_CONNECTION=pgsql` as an OS-level env var. PHPUnit's `phpunit.xml <env>` tags **cannot override OS-level env vars** even with `force="true"`. Without proper isolation, `RefreshDatabase` runs `migrate:fresh` which **drops all production tables**.

**How it works:** `TestCase::setUp()` calls `putenv('DB_CONNECTION=sqlite')` + `$_ENV` + `$_SERVER` overrides BEFORE `parent::setUp()` creates the Laravel app and runs migrations. This ensures `RefreshDatabase` targets SQLite in-memory, not PostgreSQL.

**Database-agnostic migrations:** Any migration using PostgreSQL-specific SQL (e.g. `ALTER TABLE ... ALTER COLUMN ... TYPE text`) MUST be guarded with `if (DB::getDriverName() === 'pgsql')`. SQLite stores all strings as TEXT natively, so column type changes are unnecessary there.

```bash
docker exec my-cli-api php artisan test                        # Run all tests (safe — uses SQLite)
docker exec my-cli-api php artisan test --filter TestClassName # Run single test class
```

### Test Suite (293 tests, 674 assertions)

| Test Class | Tests | What it covers |
|------------|-------|----------------|
| `AuthServiceTest` | 23 | register, login, /passwd, /bind, requestPasswordReset, single-token policy, email-substitution rejection, token length |
| `AuthControllerTest` | 42 | HTTP integration: register validation (10), login (4), logout, status (2), /passwd + /bind commands (6), reset/bind requests (7), lifecycle, unbind-email (5), delete-account (5) |
| `BackendServiceControllerTest` | 22 | HTTP integration: status health check, translation validation + mock, speech validation + size limit, LLM chat validation + provider routing, ollama health mock + cache |
| `BlackboardServiceTest` | 19 | LWW commit, blank skip, dedup, cache, events, CRUD |
| `BlackboardControllerTest` | 36 | HTTP integration: commit validation, auth guards, response format, round-trip, LWW via HTTP, fetch filters unavailable file_hash (A5), DANGER ZONE delete-all-branches |
| `BroadcastChannelServiceTest` | 19 | cast (DELETE+INSERT), rename, destroy, pin/unpin, title guard |
| `BroadcastChannelControllerTest` | 34 | HTTP integration: public index/fetchBoards, cast validation + title guard, rename/destroy ownership, pin/unpin, lifecycle |
| `FileControllerTest` | 29 | HTTP integration: upload + name-sensitive dedup (same name dedupes, different name creates separate hashes), extension whitelist (script/exec types rejected, unknown/extensionless rejected, common doc/media types accepted), download (happy + disk missing), status transitions (staged→committed via BB/WT/BC commit/cast), orphan detection across BB/WT/BC tables, clean command, full lifecycle |
| `FileServiceTest` | 15 | name-sensitive upload dedup (same content + same name dedupes; same content + different name → separate rows), markCommitted, markOrphaned, cleanupOrphaned |
| `WalkieTypieControllerTest` | 40 | HTTP integration: connection CRUD, signal, tag update (incl. non-connected 404), board commit/fetch, lifecycle round-trip |
| `WalkieTypieBoardServiceTest` | 12 | LWW commit, partner signal, connection access control |

### Test Conventions

- Use `#[Test]` attribute (NOT `/** @test */` doc-comment — deprecated in PHPUnit 12)
- `Cache::flush()` in `setUp()` when service uses `Cache::remember()` (array cache persists across tests)
- Timestamp manipulation: set `$model->timestamps = false` before `save()` to prevent Eloquent auto-overriding `created_at`/`updated_at`
- Event assertions: `Event::fake([EventClass::class])` before calling service methods that broadcast
- File tests: `Storage::fake('local')` in setUp to avoid real disk writes

## Data Backup & Restore

Automated PostgreSQL backup via `pg_dump`, scheduled through Laravel's task scheduler. Backups stored in `backend/storage/backups/`. The `postgresql-client` package is installed in the PHP Docker image (`Dockerfile`).

```bash
# Manual backup (from host)
docker exec my-cli-api php artisan app:backup

# List existing backups
docker exec my-cli-api ls storage/backups/

# Restore (interactive confirmation)
docker exec -it my-cli-api php artisan app:backup --restore=backup_2026-03-11_163949.sql

# Restore (scripted, skip confirmation)
docker exec my-cli-api php artisan app:backup --restore=backup_2026-03-11_163949.sql --force
```

**Schedule:** Daily at 03:00 AM via `routes/console.php`. Auto-prunes to keep last 7 backups. Command: `DatabaseBackup` (`app/Console/Commands/DatabaseBackup.php`).

## Architecture

### Docker Services (11)

nginx (static SPA + reverse proxy) · api (Laravel 12 PHP-FPM) · reverb (WebSocket) · queue (`queue:listen`) · scheduler (cron) · db (PostgreSQL 16) · redis · pgadmin · mailpit · tunnel (Cloudflare) · ollama (Qwen3.5 LLM, GPU, auto-pull via entrypoint)

### Backend (`backend/`)

**Pattern:** Thin controllers validate input → call Service → return JSON. All logic in Services.

| Feature | Controller | Service |
|---------|-----------|---------|
| Blackboard | `BlackboardController` | `BlackboardService` |
| Walkie-Typie | `WalkieTypieController` | `WalkieTypieBoardService` |
| Broadcast | `BroadcastChannelController` | `BroadcastChannelService` |
| Files | `FileController` | `FileService` |
| Auth | `AuthController` | `AuthService` |
| Translation | `TranslationController` | — (in controller) |
| Speech | `SpeechController` | — (in controller) |
| Status | `StatusController` | — |
| LLM (MOD) | `LlmController` | — (in controller) |
| MOD Health | `ModController` | — |
Models: `User`, `File` only. Events (5): `BlackboardUpdated`, `BroadcastChannelUpdated`, `WalkieTypieConnectionUpdated`, `WalkieTypieContentUpdated`, `WalkieTypieSignal`. Mail: `ResetPasscodeMail`, `BindEmailMail`. Commands: `CleanOrphanedFiles`.

**Rate limiting** (`routes/api.php`): AI endpoints 10/min · Auth login/register 30/min · Auth commands 10/min. All other endpoints (reads, writes, files, mods) are unthrottled — local single-user app with Redis caching. Client-side 429 handling: `api.js` dispatches `api:rateLimited` event (debounced by `frontend.toast.rateLimitDebounce`), `blackboard-msg.js` listens and shows toast.

### Centralized Timing Config

**All debounce, polling, cache TTL, and toast durations live in `backend/config/timing.json`** — one JSON file is the single source of truth. Deployers tune the system by editing this file alone.

- **Backend** reads via `config('timing.backend.cacheTTL.*')` (Laravel config, auto-loaded from `config/timing.php` → `timing.json`).
- **Frontend** fetches once at boot via `GET /api/config/timing`, then synchronous access: `import { T } from './timing.js'; T('frontend.input.bbSaveDebounce')`.
- **Out of scope:** Auth reset/bind tokens (10-min security expiry, hardcoded in AuthService).

Frontend timings in milliseconds; backend `cacheTTL` values in seconds (Laravel convention). See the `_comment_*` keys in timing.json for inline documentation.

### Database Schema (11 main tables)

**Main DB (PostgreSQL `my-cli-db`):**

- **users** — uid (unique), passcode, title, email, settings (JSONB nullable)
- **blackboards** — user_id FK, branch_id (varchar), branch_name, timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **walkie_typie_connections** — user_id FK, partner_id FK, partner_tag, my_branch_id, partner_branch_id, last_signal; UNIQUE(user_id, partner_id)
- **walkie_typie_boards** — user_id FK, branch_id, branch_name (nullable), timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **broadcast_channels** — name (unique), user_id FK, last_signal (bigint ms)
- **broadcast_boards** — channel_id FK cascade, timestamp (bigint ms), text, file_hash (text); UNIQUE(channel_id, timestamp)
- **broadcast_pins** — user_id FK cascade, channel_id FK cascade; UNIQUE(user_id, channel_id)
- **files** — hash (unique), user_id FK, original_name, mime_type, size (bigint), disk_path, status (default 'staged')

`file_hash` migrated from varchar(512) to text for JSON array serialization. File status lifecycle: `staged` → `committed` → `orphaned` (cleaned after 24h). Stale `staged` files (uploaded but never committed within 24h) are also marked `orphaned` by the hourly cron and cleaned in the next cycle. Performance indexes migration adds composite indexes for frequent query patterns.

### Frontend (`frontend/`)

Multi-section SPA — pure HTML, CSS, ES modules. No framework.

**Key directories:** `javascript/` (47 modules + `services/` 12 + `vendor/` 5) · `mods/` (mod-loader + 12 template folders) · `stylesheets/` (19 CSS files) · `locales/` (en.json, zh-TW.json, default.json) · `images/` (21 files) · `audio/` (10 MP3s)

**Architectural patterns:** Event-driven (`window.dispatchEvent`) · Hybrid storage (IndexedDB local + PostgreSQL via API) · Real-time via Laravel Echo/Reverb · Service layer abstracts all HTTP calls · Debounce lifecycle via `TimerGroup` (`timer-group.js`) — named timer scheduling with `cancel/cancelAll/flush`; used by BB, BC, WT for input debounce management

### Navigation System (`navi.js`)

Two-level hierarchy: main navi (`data-navi-item`: blackboard, walkie-typie, broadcast, mods) → sub-navi (`data-sub-navi-item`). State in `stateOfEachNaviItem[name]`.

- `updateNaviPosition($naviItem, silent, instant, skipPageUpdate)` — repositions sub-navi track via `translateX()`, highlights active, calls `updatePage()` (unless `skipPageUpdate`), triggers CRT glitch, saves to localStorage
- `updatePage(subNaviItem)` — toggles `.active` on `.page` elements, controls push/pull buttons, head-indicator, feature scaffold based on CSS classes: `.can-push-pull`, `.show-branch`, `.have-feature`
- **Gotcha:** `updateNaviPosition()` by default calls `updatePage()` which changes the visible page. Never call from background data fetches unless the relevant section is active.
- **Resize path** (window resize, e.g. mobile keyboard show/hide) passes `skipPageUpdate = true` — repositions the track only, does not re-fire `updatePage` / `navi:pageChanged`. Without this, tapping a textarea on mobile dismisses the keyboard instantly because downstream listeners (e.g. `mods-manager.js` listening for `navi:pageChanged === 'mods-config'`) rebuild the config field DOM, destroying the focused textarea.
- Dispatches `navi:pageChanged` with `{ page }` on sub-navi change (suppressed when `skipPageUpdate`)

### Custom Events

| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `auth:updated` | auth.js | — | Login/logout/register completed |
| `navi:pageChanged` | navi.js | `{ page }` | Sub-navigation changed |
| `list:selectionChanged` | blackboard-ui-list.js | `{ index, item }` | List cursor moved |
| `list:updated` | blackboard-ui.js | — | VCS/broadcast list data refreshed |
| `broadcast:selected` | broadcast-list.js | `ch` | Channel clicked |
| `broadcast:cleared` | broadcast-list.js, broadcast-channel.js | — | Channel deleted |
| `broadcast:channelRenamed` | broadcast-channel.js, broadcast-list.js | `{ channelId, newName }` | Channel renamed |
| `broadcast:signalUpdated` | broadcast-channel.js | `{ channelId }` | Board content updated |
| `blackboard:branchRename` | blackboard-ui.js | `{ branchId, newName }` | Branch name edited |
| `pwa:installable` | pwa.js | — | PWA install prompt available |
| `i18n:ready` | i18n.js | — | Locale loaded and DOM rendered |
| `settings:changed` | settings.js | `{ scope, key, value }` | Any setting changed |
| `walkie-typie:connection-update` | walkie-typie-core.js | `connection_data` | WS connection event received |
| `walkie-typie:content-update` | walkie-typie-core.js | `content_data` | WS content event received |
| `walkie-typie:disconnected` | walkie-typie-list.js | `{ partner_id }` | Partner disconnected |
| `walkie-typie:selected` | walkie-typie-list.js | `{ connection }` | Connection selected in list |
| `settings:synced` | sync-service.js | `{ settings }` | Server settings loaded into mirror after login or successful PUT |
| `screensaver:activated` | pressStart.js | `{ initial }` | Overlay shown (idle timeout or page load) |
| `screensaver:deactivated` | pressStart.js | — | Overlay dismissed by click |
| `api:rateLimited` | api.js | — | 429 response received (5s debounce) |

**Gotcha:** `list:selectionChanged` fires from ALL InfiniteList instances — listeners MUST check `container.contains(detail.item)` to filter.

### i18n System (`i18n.js`) — single-locale after Tier 2

**All user-facing strings MUST use the i18n system.** Never hardcode display text.

- **JS:** `t('section.key')` or `t('section.key', { var })` for interpolation
- **HTML:** `data-i18n="key"` for textContent, `data-i18n-placeholder="key"` for placeholder
- **New strings:** Add to `frontend/locales/default.json` only
- The `en.json` and `zh-TW.json` files were removed in Tier 2 (single-locale policy per user mandate). `initI18n()` fetches `default.json` directly; fallback still retries `default.json` on failure.

Vocabulary is the academic classroom voice (NOTEBOOK / CHAT / ANNOUNCE / NEWER / OLDER / UPLOAD / DOWNLOAD / OPEN / COPY / REMOVE / WIPE / CLEAR). Code-level identifiers (`commit`, `checkout`, `push`, `pull`, `branch`) stay unchanged — the rename is display-layer only.

- `mergeStrings(partial)` deep-merges into global strings.
- `renderDOM()` re-scans all `data-i18n*` elements — MultiStepButton is i18n-aware: elements with `data-i18n` re-read via `t()` and re-capture on `i18n:ready`.

### MultiStepButton (`multiStepButton.js`)

Standardised countdown-confirm button. N-step pattern (N = total clicks to fire):

| Steps | Flow |
|-------|------|
| 1 (instant) | `Kill` → fire |
| 2 | `Kill` → `Kill!` → fire |
| 3 | `Kill` → `Killx2` → `Kill!` → fire |
| 4 | `Kill` → `Killx3` → `Killx2` → `Kill!` → fire |
| N | `Kill` → `Killx(N-1)` → … → `Killx2` → `Kill!` → fire |

**API:**
```js
new MultiStepButton(el, {
    action,              // async fn — executes on final click
    sound,               // audio on every click
    fireSound,           // audio on final click only (defaults to sound)
    steps: 1,            // int ≥1 or () => int. 1 = instant, N = N-step countdown.
    dynamicLabel: false, // if true, re-read base label from el.textContent each arming
    timeout: 3000,       // ms before armed state auto-resets
});

btn.reset();             // public — force back to step 0
```

**Project standard:** every non-instant button uses `steps: 3`. Raise/lower per button only when UX justifies it — the component supports any N ≥ 1. 1-click stays for reversible or informational actions (PUSH, PULL, FORK, LOGIN, BC CREATE/DELETE, PIN, Mods ADD/UP/DOWN/DELETE, settings toggles, file chip remove/download, feature-shelf open/close). 3-click applies to destructive or heavy mutations (COMMIT, CAST, CUT, ADD, LOGOUT, REGISTER, BIND EMAIL, UNBIND EMAIL, DELETE ACCOUNT, WIPE LOCAL, DROP ALL BRANCHES, BB CHECKOUT/SWITCH, BB CLEAN).

**Label derivation:**
- **Static mode (default):** initial label from `data-i18n` → `t(key)`. Intermediate with `r` clicks left tries locale `{key}X{r}`; the final armed step (r=1) tries `{key}Final`. Formula fallback `{base}x{r}` / `{base}!` when the locale key is missing. This gives translators a per-state override hook without forcing every project to ship X/Final keys.
  - Example: `data-i18n="auth.logoutBtn"` → `"LOGOUT"` → `t('auth.logoutBtnX2')` = `"LOGOUTx2"` → `t('auth.logoutBtnFinal')` = `"LOGOUT!"`.
- **Dynamic mode (`dynamicLabel: true`):** base label is read from `el.textContent` fresh at the start of each arming cycle. Intermediate/final always use the formula (no locale lookup) so the countdown tracks whatever external code last wrote. Use for buttons where an external updater owns the label (CHECKOUT/SWITCH, CLEAN/DROP/DELETE).

**Dynamic-button contract:** external code that mutates `textContent` MUST call `btn.reset()` BEFORE writing the new label. Otherwise the armed countdown lingers on top of a stale cached base (e.g. `CHECKOUTx2` → list selection flips to another branch → label becomes `SWITCH` but the step-2 armed action is still wired to CHECKOUT). `updateCheckoutButtonState()` and `updateDropButtonState()` in `blackboard.js` call `btn.reset()` as the first thing they do.

**Dynamic step count:** pass `steps` as a function when different states of the same button need different confirmation depth. The function is resolved at click time. Example — BB DROP button triples only for CLEAN; DROP and DELETE stay 1-click:
```js
steps: () => currentDropAction === 'clean' ? 3 : 1
```

**Public `reset()`:** clears the timer, sets step back to 0, removes `.btn-armed`, restores `textContent` to the cached base label. Safe to call any time. Also wired to the auto-reset timer.

**Double-fire protection:** `aria-busy="true"` during async action; internal `busy` flag blocks re-entry.

### Dynamic State Buttons (Blackboard)

Buttons whose label/behaviour change based on list selection context. Now wired through `MultiStepButton` with `dynamicLabel: true` — the external `updateXButtonState()` owns the textContent, MultiStepButton owns the countdown state machine. Every updater calls `btn.reset()` first to drop any armed state before swapping the label.

**Checkout/Switch** (`checkout-btn`): `updateCheckoutButtonState()` on `list:selectionChanged`.
- `selected.id === state.branchId` → **CHECKOUT** (re-download from server, `targetOwner="remote"`) — **3-step** (overwrites local with server)
- `selected.id !== state.branchId` → **SWITCH** (change branch, `targetOwner` based on `isLocal`) — **1-click** (reversible — just moves the editor pointer; local data untouched either way)
- `steps: () => currentCheckoutAction === 'checkout' ? 3 : 1`.

**Clean/Drop/Delete** (`drop-btn`): `updateDropButtonState()` on `list:selectionChanged`.
- `isLocal && hasContent` → **CLEAN** (wipe local records, keep branch) — **3-step** (destroys unsynced user content)
- `isServer` (no local content) → **DROP** (delete server copy) — **1-click** (local copy survives, re-commit restores)
- `isLocal && !hasContent && !isServer` → **DELETE** (remove empty branch) — **1-click** (branch was empty anyway)
- `steps: () => currentDropAction === 'clean' ? 3 : 1`.

### Head Indicator Interactions

The `.head-indicator` strip (left-side vertical label inside `.page-container` — shared DOM, CSS-gated by the active page's `show-branch` class) renders three colon-separated divs:
- `.branch-is-saved` — `[SAVED]` / `[UNSAVED]` (BB) or `[DRAFT]` / `[POSTED]` (BC owner). **Empty string in BC reader mode** — subscribers have no outgoing-dirty concept, so the indicator reads `:channel_name:head`.
- `.branch-name` — current branch name (BB) or channel name (BC). **Read-only here; rename happens on the list page.**
- `.branch-head` — current head index (0 = newest). **Read-only** — no contenteditable, no inline reorder. Tier 11.5 removed the "type a number + Enter to swap pages" feature.

**Format**: three divs separated by `:` text nodes → `[SAVED]:branch_name:0`. The colons are literal text in `index.html` between the div closing tags, not a CSS pseudo-element, so copying the indicator's text from the DOM preserves them.

**Visibility gating**: `show-branch` is set only on the two **editor** pages (`blackboard-log`, `broadcast-channel`); list pages no longer show the indicator. Empty divs in the shared DOM (no `${placeholder}` template literal) keep the pre-init state clean — each page's own JS writes the first real values when it activates.

**Page reorder via drag-and-drop**: deferred to Tier 21. The `BBCore.swapRecordsByHead` / `BCDb.swapRecordsByHead` functions remain in place (unused for now) so the underlying swap-by-timestamp mechanic is ready when the preview-block drag-and-drop UX arrives.

### Page Previewer Rail (Tier 11)

**Layout.** Inside `.editor-wrapper` (BB-log + BC-channel):
```
.editor-wrapper
  .attachment-chips
  .log-editor-row       ← flex-row container
    .page-preview-rail  ← vertical column of .page-preview-block
    textarea
  (hidden file input)
  .drop-overlay
```

Topic input was proposed in Tier 11 part 1 and reverted in Tier 11.5 per stakeholder feedback — the single textarea is the record body; no separate topic field.

**Rail render.** `#bb-preview-rail` (BB) / `#bc-preview-rail` (BC), populated on every `syncView()` / `syncOwnerView()` / `syncReaderView()` so it mirrors navigation, saves, cross-tab mutations, and WebSocket updates without a separate trigger system.

- One `.page-preview-block` per record, newest at top. `.active` on the current head, `.virtual` for the unsaved virtual page, `.unsynced` when `record.owner === 'local'` or `record.owner.includes('[asynced]')`.
- **No `title` tooltip** — stakeholder rejected the native browser tooltip; hover-preview itself is the reveal mechanism.
- **Read-only peek**: hover locks `textarea.readOnly = true` and overwrites the textarea with the target record's text. Mouseleave restores the snapshot captured on first-enter. Without the `readOnly` lock, typing during hover would clobber the LIVE record (whose `state.currentHead` hasn't moved) with the peeked record's content.
- **Click to navigate**: commits the peek, saves current value, moves `state.currentHead = head`, fires `syncView()`. BC reader mode just moves `readerHead` + `syncReaderView()`.
- `_previewRailCache` backs the hover lookup so mouseover doesn't hit IndexedDB per enter.
- **Active-element guard on first entry**: if the user is already typing when the mouse enters, no snapshot + no overwrite — peek is inert.

**Mobile (Tier 19)**:
- Block width 48 px (Material-Design touch minimum), gap 6 px, border-left 6 px.
- Alternating `:nth-child(even)` `--bg-card` tint so neighbouring blocks read as distinct targets even when the rail is dense.
- `touchstart` on a block starts a 300 ms timer. A release before the timer fires is a short tap → navigate (same handler as desktop `click`). Holding past 300 ms enters **preview mode**: snapshot textarea, lock `readOnly`, paint the tapped block's content.
- `touchmove` during preview mode resolves the block under the finger via `document.elementFromPoint(clientX, clientY)` → `closest('.page-preview-block')` and swaps the preview. This mirrors desktop `mouseover` + `mouseout` semantics, which aren't fired during touch. Mid-gesture drag > 10 px before the timer cancels the peek (treated as a scroll — user was reaching past the rail).
- `touchend` / `touchcancel` restore the snapshot, unlock, and clear the `.peeking` marker.
- `.page-preview-rail { touch-action: none }` in CSS prevents the browser from hijacking the gesture for scrolling.
- `.peeking` class marks the block currently being previewed; desktop `:hover` uses the same visual so the two input paths converge on the same style.

### Toast & Messages

- `toast.addMessage(text, duration, type, loading)` — creates animated toast, returns `{ update(text, duration), close() }`
- `BBMessage.info(text)` — prefixes "SYSTEM > ", `BBMessage.error(text)` — prefixes "CRITICAL > ", `BBMessage.success(text)` — prefixes "SYSTEM > "
- `BBMessage.loading(text)` — prefixes "SYSTEM > ", sets `data-loading="true"` on toast element. `.update()` auto-removes `data-loading`. Use for async operations that show progress (auth, sync, fork, etc.)
- `BBMessage.requireLogin()` — standard login-required message
- **ModContext:** `ctx.ui.toast()`, `ctx.ui.toastError()`, `ctx.ui.toastSuccess()`, `ctx.ui.toastLoading()`

**Lifecycle & close-race contract** (`toast.js`):
1. `addMessage` creates the `.toast` div and appends it to `#toast-container` — **no `.showing` class yet**.
2. `requestAnimationFrame(() => toast.classList.add('showing'))` — the class lands **one frame later**, which triggers the fade-in transition.
3. Auto-remove timer fires on `duration` (or never if `duration === 0`, the loading case).
4. `close()` calls `removeMessage(toast)` which transitions `.showing` → `.hiding` + DOM removal via `transitionend`.

**Race hazard — fast-fail paths.** Any async call site that creates a loading toast and immediately catches + closes it (e.g. `msg.close()` after `await BBVCS.commit()` throws synchronously at its `!loggedInUser` check) can reach `close()` BEFORE step 2's rAF fires. If `removeMessage` short-circuits on `!toast.classList.contains('showing')`, the toast stays in the DOM forever. `removeMessage` MUST handle the pre-shown case: transition-via-`.hiding` when `.showing` is set, immediate DOM removal otherwise.

Any new caller relying on `BBMessage.loading(...)` + `msg.close()` in a catch block inherits this contract — the toast primitive is authoritative on cleanup; don't add bespoke removal workarounds at call sites.

### CSS Architecture (`stylesheets/`)

**Theme (post-Tier-3 classroom palette):** CSS custom properties on `:root`. **Single light theme only** — the dark CRT theme, `.theme-light` class, `theme-engine.js`, and the Light Theme MOD were removed in the overhaul.

Brand palette (HKPolyU Blackboard Learn inspired, set by user):
- `--brand: #a62e42` (wine red — active, title, primary CTA)
- `--brand-dark: #7a1f30` (hover / armed)
- `--accent: #c56fd5` (purple — minor decorative only)
- `--bg-page: #fefefe`
- `--bg-card: #f5f5f5`
- `--text-muted: #7d7d7d`
- `--text-body: #262626`

Legacy semantic aliases remain as pass-throughs so unupdated page CSS continues to work:
- `--text-green → var(--text-body)` · `--text-orange → var(--brand)` · `--text-red → var(--brand)` · `--text-cyan → var(--text-muted)` · `--text-yellow → var(--brand)`
- `--bg-primary → var(--bg-page)` · `--bg-secondary → var(--bg-card)`

All `--text-shadow-*` variables are `none` (glow effects removed). Global border line is `2px solid var(--border-subtle)` (`--border-subtle: #e5e5e5`). Font: `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` (Courier New gone).

**CRT VFX removed:** `crt-vfx.css`, `.crt-scanner`, `.crt-noise-layer`, `.glitchEffect` are all deleted. Atomic colour classes (`.crt-text-orange`, `.crt-text-green`, etc.) are redefined in `style.css` to map to the current palette, so existing HTML references still render in-theme.

**Layout:** `--container-width: clamp(300px, 86vw, 512px)`, `--font-size: clamp(0.875rem, ...)`, fixed `--navi-height: 64px`, `--sub-navi-height: 48px`

**Global flex-column default:** `style.css` lines 113-124 set all `body`, `nav`, `div`, `span`, `.header`, `.body`, `.footer` to `display: flex; flex-direction: column; position: relative`. This means every div/span defaults to vertical flex layout. `justify-content` acts on the vertical axis, `align-items` on horizontal. For horizontal layout, explicitly set `flex-direction: row`. All elements have `position: relative` by default.

### Save & Navigation Contracts (BB / WT / BC)

The three boards share the same save and push/pull patterns. Divergences are bugs.

**Save (textarea → IndexedDB)** — `BBVCS.save` / `WTVCS.save` / `BCChannel.save`:
- `state.isVirtual`: create a new record only when textarea is non-empty.
- Otherwise fetch record at `state.currentHead`; no-op if identical text.
- **Tier 18: always `updateTextInPlace`** — edited record keeps its original timestamp, stays at its head position. No rebase. `updateText` (delete + re-insert) is no longer called by save / push / pull paths.

**Push / Pull (navigation)** — `BBVCS.push/pull` / `WTVCS.push/pull` / `BCChannel.ownerPush/ownerPull`:
1. Save first (unless read-only).
2. Pre-scrub snapshot: `entryBefore = getRecord(currentHead)`.
3. `cleanupOldRecords(owner, branchId, BOARD_MAX_SLOT)` — hardcoded 100-page cap; blanks are preserved (no `scrubBranch` call).
4. Five-step revalidation ladder:
   - `count === 0` → `state.currentHead = 0; state.isVirtual = true; return true`.
   - `currentHead >= count` → clamp to `count - 1; return true` (don't navigate further).
   - `entryAfter = getRecord(currentHead)`; if `entryBefore.timestamp !== entryAfter.timestamp` → cleanup shifted contents into this slot → `return true` without moving cursor (caller refreshes).
   - Otherwise advance cursor (`currentHead--` for push, `currentHead++` for pull).
   - Push at head 0 → `state.isVirtual = true`; pull at `count - 1` → stay.

Reader-mode navigation (BC `readerPush/Pull`, WT THEY board) walks an in-memory array — no scrub, no defenses needed.

Any new board type or navigation variant MUST reproduce this ladder; missing step 4 was the root cause of "pages silently disappear after push on a blank record" class of bugs.

### Real-Time (WebSocket)

`echo-service.js` — singleton Laravel Echo instance connecting to Reverb.

**Server events:**

| Event | `broadcastAs()` | Channel | Payload |
|-------|-----------------|---------|---------|
| `BlackboardUpdated` | `blackboard.updated` | Private `App.Models.User.{uid}` | `{ branch_id, device_id }` |
| `BroadcastChannelUpdated` | `broadcast.channel.updated` | Public `broadcast-channel.{id}` | `{ channel_id, name, owner_uid, last_signal, action }` |
| `WalkieTypieConnectionUpdated` | `walkie-typie.updated` | Private `App.Models.User.{uid}` | `{ connection_data }` |
| `WalkieTypieContentUpdated` | `walkie-typie.content` | Private `App.Models.User.{uid}` | `{ content_data: { text, branch_id, sender_uid } }` |
| `WalkieTypieSignal` | `walkie-typie.content` | Private `App.Models.User.{partnerUid}` | `{ content_data: { branch_id, sender_uid, timestamp, text: null } }` |

**Client whisper** (no server): `'typing'` on private `walkie-typie.{uid1}.{uid2}` (sorted), 20ms debounce (`timing.json` → `frontend.input.wtWhisperDebounce`).

**WT layers:** Whisper (20ms) → IndexedDB save (200ms) → Server commit (2s) + signal event → partner re-sync.

### WT Notification Stack + `[NEW]` Indicator

Two decoupled features over the WT incoming-signal flow. Walkie-talkie semantic: one call-tone per away session + per-partner unread marker.

**Desktop notification stack** (`walkie-typie-text.js`) — single-slot gate over the native `Notification` API. Module-level boolean `_notificationStackActive`. `notify(senderUid, senderTag)` has four short-circuits, in order:
1. `Settings.get('wt', 'notifications')` must be true — the WT config page NOTIFY toggle (`SCOPE_DEFAULTS.wt.notifications = true`; wired via `walkie-typie-config.js:39`'s `createToggleControl` → `hints.config.notifications`).
2. `Notification.permission === 'granted'` — browser-level.
3. `document.hidden` — if the tab is foreground the user already sees the chat, no beep.
4. `!_notificationStackActive` — first sender of the current away session owns the slot; subsequent senders silenced.

All four pass → `new Notification(t('walkieTypie.newSignal', { sender: senderTag || senderUid }))` (no body, no preview — walkie-talkie is tone-only, content is not duplicated to the OS), set `_notificationStackActive = true`. Reset ONLY on `visibilitychange` → `!document.hidden`. Entering MyCLI = clearing the pending-call light.

Called from two sites in `walkie-typie-text.js`: committed-content path (line ~386) and whisper path (line ~512). Both pass `currentConnection.partner_uid + partner_tag`.

**Per-partner `[NEW]` indicator** (`walkie-typie-list.js`) — in-memory `Set<partner_uid>` (`_newMessagePartners`), not persisted; reload clears.

- **Mark trigger**: window `walkie-typie:content-update` event. Reads `e.detail.sender_uid` (the event payload is the unwrapped `content_data`, not wrapped in `{content_data}` — `walkie-typie-core.js:45` strips the wrapper). Add to set.
- **DOM update is surgical**: `_applyNewTagToRow(partnerUid)` finds the row via `[data-partner-uid="..."]` and rewrites only the `.walkie-typie-list-uid` textContent. **NOT** a `WTList.render()` call. The reason: full render wipes `innerHTML`, destroys the `.active` class on the currently-selected partner, triggers `InfiniteList.refresh` → `setCursor(0, true)` → `list:selectionChanged` → 500ms debounce → `walkie-typie:selected` → `WTText.loadConnection` → **SFX and board re-sync on every inbound signal**. Surgical patch avoids the cascade.
- **Clear trigger**: window `navi:pageChanged` event; if new page is `walkie-typie-text` and `WTList.selectedConnection` is set, remove that partner's uid from the set and patch the row. Matches the user flow "list item active → go to text sub-navi → `[NEW]` off".
- **Full-render consistency**: `WTList.render()` also consults the set when building each row (display `{uid} [NEW]` when set contains it), so the other entry points (fetchConnections / handleUpdate / handleDelete) stay consistent. `WTList.render` also now preserves the `.active` class from `selectedConnection?.partner_uid` to avoid the same InfiniteList cascade (matches BB / BC render behaviour).

### PWA & Service Worker (Workbox)

**`sw.js` is auto-generated — never edit it directly.** Edit `sw-src.js` instead and run `npm run build:sw`.

- **Build:** `npm run build:sw` runs `workbox-build.injectManifest()` → scans `frontend/` → injects versioned manifest (URL + content hash per file) into `sw-src.js` → outputs `sw.js`
- **Precache:** Workbox `precacheAndRoute()` handles all core files (CSS, JS, locales, audio, images). Per-file revision hashes — only changed files are re-downloaded on update. No manual `CACHE_NAME` bumps needed.
- **Navigation:** `NavigationRoute` serves cached `/index.html` for all SPA routes
- **Runtime SWR:** Non-precached same-origin GET requests (MOD files, etc.) use `StaleWhileRevalidate` strategy with `runtime-swr` cache. `/api/` and cross-origin requests are excluded.
- **Update flow:** `updatefound` → toast → `SKIP_WAITING` → silent takeover (no forced reload)
- **MOD files are NOT precached.** `mods/mod-loader.js` is the only MOD entry point in the precache. All other MOD files (`mods/*/`) are cached lazily by the runtime SWR handler on first page load.
- **Glob config** is in `scripts/build-sw.js`. `globIgnores` excludes `javascript/vendor/textmode.js` (large WebGL2 lib, ascii-animator MOD only).
- **Legacy cleanup:** Activate handler deletes old `blackboard-*` caches from before Workbox migration.

### MISC Page Action Buttons

`.misc-action-container` on the blackboard-misc page holds six reset / install / wipe actions, ordered by blast radius (top = per-scope; bottom = full-device). Colour intent: orange = reversible config, cyan = UI only, green = safe install, red = destructive.

| # | Button | Steps | Scope | Action |
|---|---|---|---|---|
| 1 | **RESET CONFIG** (orange) | 3 | Active scope (BB/WT/BC) | `Settings.resetScope(scope)` → `SCOPE_DEFAULTS[scope]`. Config toggles only; local data untouched. |
| 2 | **FLUSH TOAST** (cyan) | 1 | UI | `toast.clearAll()`. Dismisses every visible toast. Useful when a loading toast is stuck. |
| 3 | **INSTALL APP** (green) | 1 | PWA | `pwa.js::triggerInstallFromMisc()`. Branches: already-standalone → info toast; `deferredPrompt` available → `prompt()` + `userChoice`; iOS Safari → "Share → Add to Home Screen" hint; else → "install unavailable" hint. |
| 4 | **WIPE LOCAL BRANCHES** (red) | 3 | Device IDB | `db.blackboard.clear()` + `walkie_typie.clear()` + `broadcast_channels.clear()` + `broadcast_boards.clear()` + `file_blobs.clear()` → reload. localStorage / sessionStorage / Cache API / Service Worker / login cookie all SURVIVE. |
| 5 | **DROP ALL BRANCHES** (red) | 3 | Server (BB) | `DELETE /api/blackboard/branches` — server wipes all of the user's BB branches. Requires login. Local IDB untouched; next commit per branch re-creates on server. |
| 6 | **INITIALIZE WEBSITE DATA** (red) | 3 | Device (full) | Cache API `caches.keys() → delete` all + `serviceWorker.getRegistrations().unregister()` all + `indexedDB.deleteDatabase(name)` (schema + version reset) + `localStorage.clear()` + `sessionStorage.clear()` → reload. Login cookie is HttpOnly so Sanctum session survives; `/auth/status` re-hydrates on next boot. Equivalent to DevTools → Application → Clear site data minus cookies. |

Semantic spread: action 4's clear is a subset of action 6's erase. 4 preserves settings / language / theme / navi state / MOD instances; 6 returns the device to a first-visit baseline. Do NOT collapse them.

## Feature Shelf (post-MOD architecture, since Tier 8+10)

**The MOD plugin subsystem was removed in the Classroom overhaul.** What remains is the same right-side drawer mechanism, now driven by a hardcoded feature registry instead of autoindex discovery + manifests + shared config + context sandbox. Much simpler.

### Feature registry

`frontend/javascript/feature-registry.js` is the single source of truth. It imports each feature module from `frontend/javascript/features/` and appends them in top-to-bottom visual order:

| id | pages | has shelf | Purpose |
|---|---|---|---|
| `file-attach` | blackboard-log, walkie-typie-text, broadcast-channel | — | Native file picker; on mobile shows Take Photo + Choose File |
| `calendar` | blackboard-log, broadcast-channel | ✓ | **Data model: `{ "YYYY-MM-DD": ["event", "event", ...] }` — arrays, not single strings**, so merging is concatenation. Editor is an incremental list (one-line entries, no line breaks; add via input+Add button, remove per row with ×). Day cell shows numeric count + one colour dot per source type present (brand=self, accent=channel). Polymorphic on page: **BB merges** self (`users.settings.calendar`, editable) with every channel calendar the user cares about — subscribed (`is_pinned`) OR owned (`owner_uid === currentUid`) — as read-only items labelled by channel name. Owners don't auto-pin their own channels, so the `is_pinned || owned` union is what ensures a single-account test still shows merged results. BC = the channel's own calendar only; owner drafts in local IDB, cast bundles to server; subscribers see the cast copy read-only. |
| `flashcard` | blackboard-log, broadcast-channel | ✓ | Maker + Player; per-branch (BB) or per-channel (BC) |
| `llm` | blackboard-log, broadcast-channel | ✓ | AI Tutor: dropdown prompts → Ollama streaming |

Each feature module exports:
```js
export const feature = {
    id: 'calendar',
    iconUrl: '/images/calendar.svg',
    pages: ['blackboard-log', 'broadcast-channel'],  // where button shows
    hasShelf: true,               // false = onClick action-only (file-attach)
    initShelf($shelf) { ... },    // called ONCE per boot to populate shelf
    onOpen($shelf) { ... },       // called each time shelf opens
    onClick() { ... },            // for hasShelf: false buttons
    shouldShow(page) { ... },     // OPTIONAL runtime gate — used by file-attach
                                  // to hide on BC when not channel owner
};
```

No ctx, no manifest, no config schema, no lifecycle hooks. Features import board state / settings / toasts directly.

### feature-shelf.js lifecycle

1. DOMContentLoaded → `bootstrap()`:
   - For each feature: create `<button.feature-btn data-feature-btn="{id}">`
   - For each feature with `hasShelf !== false`: create `<div.feature-shelf data-feature-shelf="{id}">` and call `feature.initShelf($shelf)` once
2. `navi:pageChanged` → `updateFeatureButtons(page)` — show/hide buttons via `feature.pages` + optional `feature.shouldShow(page)`
3. `broadcast:selected` / `broadcast:cleared` → also re-evaluate (owner-mode gate for BC features)
4. Button click: if `hasShelf` → open + `feature.onOpen($shelf)`; else `feature.onClick()`
5. Shelf drag + double-click close: unchanged mechanics from pre-overhaul scaffold

### Shelf drag handle

`.feature-shelf-back-btn` renders **two vertical grip bars** via `::before` + `::after` pseudo-elements. No textContent; aria-label carries the affordance ("Drag to resize · double-click to close"). Hover: bars turn brand-colour + grow height. Drag (`.no-transition` class on container): bars thicken to 4px.

### User settings sync (per-user cross-device)

`sync-service.js` mirrors the authenticated user's `users.settings` JSONB column in memory. Features read/write via dotted paths:

- `getSetting(path, defaultValue)` — synchronous read from the mirror
- `setSetting(path, value)` — update mirror + schedule 2 s debounced PUT
- `settings:synced` event — fires after successful GET on login or after PUT
- `settings:changed` event — fires after each setSetting call

**Backend (user-scoped):** `GET /api/user/settings` and `PUT /api/user/settings` (UserSettingsController). Session-auth; LWW on write. Schema is client-opinionated, server validates only that the body is a JSON object:

```json
{
    "app":      { "autoSync": true, ... },
    "calendar": { "YYYY-MM-DD": ["event", "event", ...], ... }
}
```

On `auth:updated` (login/logout), sync-service flushes pending pushes from the outgoing identity, then fetches the incoming user's settings.

**Backend (channel-scoped):** stored in `broadcast_channels.calendar` JSONB column (migration `2026_04_21_000001_add_calendar_to_broadcast_channels.php`). **Writes happen ONLY through the existing `cast` endpoint — bundled with records in the same transaction.** No per-edit live PUT. This matches the text + file sync cadence: owner edits locally, clicks CAST, everything (records + calendar) uploads together. `GET /api/broadcast/channels/{channelId}/calendar` remains for read (subscribers, Dashboard rollup, WebSocket-triggered refresh). `BroadcastCalendarService` in the frontend wraps the GET only. The `cast` payload now accepts an optional `calendar` field; `BroadcastChannelService::cast(User, name, records, ?calendar)` persists it. The channel index (`GET /api/broadcast/channels`) already returns `broadcast_channels.*` — calendar flows to subscribers with the normal channel list fetch.

**Local BC calendar storage:** `db.broadcast_channels.calendar` field (IndexedDB, schemaless column). `BCMeta.getCalendar(localId)` / `BCMeta.setCalendar(localId, dict)` are the read/write API. `bootstrapFromServer` copies server `calendar` into the local row when an owner opens a channel they own but have no local copy of (cross-device, after WIPE LOCAL, etc.).

The Calendar feature's BC mode reads/writes via BCMeta (local) and relies on the owner's next cast to push the calendar to the server. Subscribers read via the channel index or direct GET.

**Known spec drift:** the overhaul spec says "multiple users with matching title can modify a channel", but all BC write operations — cast, rename, destroy, and now calendar — currently check strict UID match against `channel.user_id`. This is a known deviation inherited from pre-overhaul code; fixing it requires a coordinated sweep across all four write paths + backend test updates. Not addressed in Tier 9c.

### Authenticated page overlay

Pages listed in `LOCKED_PAGES` (`auth-landing.js`) show a full-screen `#auth-locked-overlay` (single element inside `.page-container`) when the user is signed out. Same Press Start visual style — solid `bg-page` background, brand-bordered card with "SIGN IN TO CONTINUE".

**Defense in depth:** siblings of the overlay inside `.page-container` receive the native `inert` HTML attribute, which disables pointer / keyboard / focus on the whole subtree. F12-deleting the overlay still leaves underlying content non-interactive until `inert` itself is cleared.

**Locked pages**: `blackboard-log`, `blackboard-branch`, `walkie-typie-list`, `walkie-typie-text`, `broadcast-channel`, `broadcast-list`. Other sub-pages (auth, misc, config) stay accessible to guests.

### Dashboard overlay

Tier-12 overlay that reuses the `#press-start-overlay` element. State is carried on the element via classes:

| Class on `#press-start-overlay` | Content shown |
|---|---|
| (none) | "TAP TO START" label |
| `.dashboard-mode` | `#dashboard-content` grid (hides label) |
| `display: none` | Fully hidden |

**Visual shell: same as Press Start** — solid page-bg backdrop + single centred `.dashboard-label` card (brand border, bg-card). No multi-column grid, no per-card headers, no close button. The three content sections stack vertically inside one card.

Sections (each = `.dashboard-section` with title + list):

- **UPCOMING** — next 7 days of `users.settings.calendar` via `getSetting('calendar')`.
- **ANNOUNCEMENTS** — channels from `db.broadcast_channels` (local IndexedDB), sorted by `last_signal`.
- **NOTEBOOKS** — BB branches grouped from `db.blackboard`, sorted by latest record timestamp.

Each `.dashboard-item` click → navigate to the relevant sub-page + `closeDashboard()`. Click on backdrop (anything in the overlay outside `.dashboard-label`) also dismisses — same semantics as the original Press Start splash.

**Triggers:**
- Auto-pop on the first logged-out → logged-in transition per session (`sessionStorage['dashboard-shown']` flag).
- Click on `#hud-news-badge` (header right-side button, visible only when logged in).

Press-start's own click handler guards against firing in `.dashboard-mode` so splash dismissal semantics don't collide.

### Post-login automated flow

On the logged-out → logged-in transition, three actions fire in order:

1. `auth-landing.js` calls `setSubNaviHead('blackboard', 'blackboard-log')` so BB's remembered sub-navi moves OFF Auth — a later click on the NOTEBOOK main-nav lands on NOTE, not the login page.
2. `auth-landing.js` calls `navigateTo('broadcast', 'broadcast-channel')` — user lands on the Announce channel sub-page.
3. `dashboard.js` (same event) fires `setTimeout(openDashboard, 50)` so the dashboard overlays on top of the broadcast-channel view one tick later.

All three are guaranteed by the `_previouslyLoggedIn` edge-detection in each module and `sessionStorage['dashboard-shown']` dedupe for step 3.

### ASCII bootstrap

`frontend/javascript/ascii/index.js` boots two DOM-only animation layers (ported verbatim from the pre-overhaul ascii-animator MOD):

- `shelf-spinner.js` — watches for textareas with `data-loading="true"` and appends rotating `/ - \ |` frames.
- `toast-spinner.js` — watches `#toast-container` for toasts with `data-loading="true"` and prefixes animated braille frames.

Both rely on the project-wide `data-loading` convention. No WebGL layers ported (matrix-rain / perlin-bg / mouse-light skipped as decorative-only).

### Adding a new feature

1. Create `frontend/javascript/features/{your-id}.js` exporting a `feature` object per the shape above.
2. Append the import to `frontend/javascript/feature-registry.js`.
3. Add an icon SVG to `frontend/images/` (or set `iconUrl` to an existing one).
4. If the feature needs persisted state, use `sync-service.js` with a dotted path under `settings.*`.
5. If the feature gates on context (e.g. owner mode on BC), implement `shouldShow(page)`.

No discovery step, no manifest, no cache. Refresh the browser.

## Platform Workarounds

### iOS WebKit (`writing-mode: sideways-lr` bug)
iOS renders `sideways-lr` CW instead of CCW. Fix in `page-blackboard-log.css`:
```css
@supports (-webkit-touch-callout: none) {
    .head-indicator { writing-mode: vertical-rl; scale: -1 -1; }
}
```
`navi.js` detects iOS and uses `translateX(+256%)` (instead of `-256%`) for the head-indicator hide direction. The feature scaffold uses `translateX(256%)` for both iOS and non-iOS.

### iOS detection
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```

### Mobile audio
`audio.js` skips playback on mobile (autoplay restrictions).

## Nginx Routing
- `/api/files` — upload streaming, request buffering disabled, 3600s timeout
- `/app` — proxied to Reverb WebSocket
- `/api/*` — PHP-FPM FastCGI
- All else — `index.html` (SPA fallback)

(The `/mods/` autoindex route was retired with the MOD subsystem. Feature modules are regular ES module imports; no runtime folder discovery.)

## Environment Variables

Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (translation & speech)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- `MAIL_*` — Standard Laravel mail credentials for password reset emails

These are set in root `.env` and injected via `docker-compose.yml`, NOT in `backend/.env.example`.

## Host Machine

Local dev & deployment: Intel i7-13th Gen · RTX 4080 · 64GB RAM · Windows 11 · Docker Desktop · Cloudflare Tunnel. Capable of running local AI models (Whisper, Llama 3 8B+). MOD provider architecture (`cloud`/`server`/`client`) leverages this.

## MCP Servers

```bash
# Context7 — real-time library documentation
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
# dbhub — direct PostgreSQL access
claude mcp add my-db -- npx -y @bytebase/dbhub --dsn "postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:5431/<POSTGRES_DB>"
```

## Custom Audit Agents (`.claude/agents/`)

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **css-auditor** | CRT theme, flex layout, dark/light mode | After CSS changes |
| **i18n-checker** | Locale key parity, hardcoded strings | After adding UI text |
| **event-flow-tracer** | Race conditions, orphaned events | After changing event dispatch/listeners |

---

# ═══════════════════════════════════════════════════════════════
# NON-MAIN MODULE: Restaurant
# This section is ISOLATED from the main MyCLI platform above.
# When working on main features, IGNORE this section entirely.
# When working on restaurant features, refer to BOTH the shared
# infrastructure above (Docker, testing, i18n) AND this section.
# ═══════════════════════════════════════════════════════════════

## Restaurant Module

Standalone ordering system embedded in the MyCLI platform. Uses a **separate PostgreSQL connection** (`restaurant`) — completely independent from the main `my-cli-db`.

### Backend (`app/Restaurant/`)

All restaurant backend code is isolated under `App\Restaurant\` namespace with a dedicated route file `routes/restaurant.php` (registered via `bootstrap/app.php` `then` callback).

| Feature | Controller | Service |
|---------|-----------|---------|
| Orders | `Restaurant\Controllers\RestaurantOrderController` | `Restaurant\Services\RestaurantOrderService` |
| Branch & Sessions | `Restaurant\Controllers\RestaurantBranchController` | `Restaurant\Services\RestaurantBranchService` |
| Deliverers | `Restaurant\Controllers\RestaurantDelivererController` | `Restaurant\Services\RestaurantDelivererService` |

**Event:** `Restaurant\Events\RestaurantOrderUpdated` — `broadcastAs('restaurant.order.updated')` on public channel `restaurant-orders.{branchCode}`, payload `{ order_number, action, branch_code }`.

**Mail:** `Restaurant\Mail\RestaurantReceiptMail` — view at `resources/views/restaurant/receipt.blade.php`.

### Database Schema (separate PostgreSQL connection `restaurant`)

- **menu_items** — category (JSONB i18n), name (JSONB i18n), price, image, options_schema (JSONB), timeslots (JSONB), sort_order, available (bool)
- **orders** — order_number (unique), status (default 'preparing'), total, branch_id FK nullable, table_number, session_token
- **order_items** — order_id FK cascade, menu_item_id FK nullable, name (snapshot), base_price, qty, options (JSONB), subtotal
- **branches** — code (unique), name; seeded with TM (Tuen Mun), TSW (Tin Shui Wai)
- **restaurant_sessions** — branch_id FK cascade, table_number, token (unique), status (default 'active'), expires_at

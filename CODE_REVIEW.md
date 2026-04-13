# MyCLI Code Review

**Date:** 2026-04-10
**Reviewer:** Claude Opus 4.6 + 3 Explore agents (with manual verification)
**Scope:** Frontend + Backend (excluding Restaurant module)
**Methodology:** Recursive automated review with parallel agent exploration, all critical findings independently verified by reading actual source code.

---

## Design Understanding (Verification Section)

To prove this review is grounded in the actual project design, here's a summary of the architecture as understood from `CLAUDE.md` + `Group_8D_Design.pdf`:

### Project Vision
MyCLI is a **moddable, local-first PWA notebook** inspired by sandbox video games (Minecraft, RimWorld). The framework provides core text operations; users define purpose. Three board scopes:
- **Blackboard** (self) — personal multi-branch timelines
- **Walkie-Typie** (pair) — real-time P2P texting via WebSocket whisper
- **Broadcast** (public) — read-only channels for any visitor (including guests)

### Critical Architectural Constraints

| Constraint | Implication |
|------------|-------------|
| **Local-first** | IndexedDB is source of truth; PostgreSQL is backup. App must work offline. |
| **VCS terminology ≠ git semantics** | Push = navigate to NEWER, Pull = navigate to OLDER, Commit = LWW full-branch upload, Fork = duplicate without ancestry. |
| **No tree/DAG** | Branches are flat sorted lists of timestamped records. |
| **Service Worker precaching** | All static assets pre-cached via Workbox. Cannot break offline boot. |
| **Vanilla JS, no framework** | ES modules, event-driven (`window.dispatchEvent`), no React/Vue/etc. |
| **MOD v2.1 ADD/DELETE model** | Instance existence = enabled. No ON/OFF toggle. Templates are singletons; instances persist independently. |

### Key Components Reviewed

| Component | Files | Maturity |
|-----------|-------|----------|
| Blackboard | `blackboard*.js`, `BlackboardService.php` | Most mature, core component |
| Walkie-Typie | `walkie-typie-*.js`, `WalkieTypieBoardService.php` | Less mature |
| Broadcast | `broadcast-*.js`, `BroadcastChannelService.php` | Less mature |
| MOD framework | `mod-*.js`, `mod-loader.js`, `frontend/mods/*` | v2.1, recently refactored |
| Test infrastructure | `backend/tests/`, no frontend tests | Backend has 85 tests; frontend has 0 |

---

## Methodology

**Phase 0:** 3 parallel `Explore` agents reviewed Blackboard, WT/Broadcast, and MOD/tests respectively.

**Phase 0.5 (CRITICAL):** All "🔴 critical" findings from agents were **manually re-verified** by reading the actual source code. This is essential because automated review tools have a known failure mode of pattern-matching false positives.

**Result:** Of ~31 issues raised by the agents, **only 3 critical bugs survived verification.** The rest were either false positives, misunderstandings of the design, or low-severity stylistic notes.

---

## Agent Findings That Were REJECTED After Verification

These illustrate why never to fully trust agent reports:

### ❌ False positive: BlackboardService.php LWW commit race
**Agent claim:** DELETE then INSERT in commit can be interleaved by another client, causing data loss.

**Verification (`backend/app/Services/BlackboardService.php:21`):**
```php
DB::transaction(function () use ($user, $branchId, $branchName, $records) {
    // DELETE + UPSERT happen here, all atomic
});
```
The entire commit is wrapped in `DB::transaction()`. PostgreSQL provides isolation; the race the agent described cannot happen. **Rejected.**

### ❌ False positive: BroadcastChannelController.fetchBoards is IDOR
**Agent claim:** No auth check on `fetchBoards()` endpoint allows unauthorized access to channel records.

**Verification:** This is **the documented design**. CLAUDE.md and the design PDF both state: "allow any users, including non-authenticated guests, to browse and read existing Broadcast channels." All channels are public. There is no concept of private/unlisted channels. **Rejected.**

### ❌ False positive: WalkieTypieService fetchBoardRecords IDOR
**Agent claim:** Connection ownership check uses `orWhere`, allowing read of partner's deleted conversations.

**Verification (`backend/app/Services/WalkieTypieBoardService.php:107-120`):**
```php
$hasConnection = DB::table('walkie_typie_connections')
    ->where('user_id', $user->id)  // ← Properly scoped to requester
    ->where(function ($query) use ($branchId) {
        $query->where('my_branch_id', $branchId)
            ->orWhere('partner_branch_id', $branchId);
    })
    ->exists();
```
The `where('user_id', $user->id)` is the outer scope. The `orWhere` only applies inside the nested closure for branch_id matching. Connection ownership IS enforced. **Rejected.**

### ❌ False positive: WT loadConnection doesn't flush pending keystrokes
**Agent claim:** When switching connections, unsaved keystrokes are lost because timers are cancelled before save.

**Verification (`frontend/javascript/walkie-typie-text.js:395-405`):**
```js
// Capture live state synchronously BEFORE any await suspension point,
// then cancel all timers atomically — prevents input events from
// rescheduling timers between cancel and save.
const hadConnection = !!this.currentConnection;
const liveText = this.elements.weTextarea?.value;
this.timers.cancelAll();
if (hadConnection && liveText !== undefined) {
    await WTVCS.save(this.weState, liveText);
}
```
The code explicitly captures `liveText` before cancelling timers, then saves with the captured value. This is documented in the comment. **Rejected.**

### ⚠️ Partially correct: Branch list focus check race
**Agent claim:** `updateBranchList()` focus check at line 261 is too late, can wipe branch name input.

**Verification (`frontend/javascript/blackboard.js:261`):**
The check is correctly placed AFTER the async fetch. It only protects elements with class `vcs-list-branch`. The race window exists if user blurs input mid-fetch, but the window is very narrow. **Downgraded from 🔴 to 🟡.**

---

## VERIFIED Critical Bugs

These were independently verified by reading the actual code.

### 🔴 Bug 1: IndexedDB tag update after commit lacks rollback
**File:** `frontend/javascript/blackboard-vcs.js:221-225`

**Verified code:**
```javascript
await BlackboardService.commit(commitPayload);   // ✅ Server now has all records

await db.blackboard.where('owner').startsWith('local')
    .and(item => item.branch_id === branchId)
    .modify({ owner: makeSyncedOwner(loggedInUser) });  // ⚠️ Can throw
```

**Failure mode:**
1. Server commit succeeds — server has all records.
2. IndexedDB `modify()` throws (e.g., transaction aborted, quota exceeded, etc.).
3. The outer `try` catches and re-throws as generic error.
4. Local records remain tagged `"local"` instead of `"local, online/{uid} [synced]"`.
5. Caller sees a failure, but the server actually has the data.
6. User retries; `commit()` re-sends all records (idempotent due to UPSERT, so no real harm).
7. **Real harm:** Sync indicator stays "asynced" forever; user doesn't know data IS on server.

**Severity:** 🔴 — Sync state lies to the user. No data loss, but UX is broken for an indeterminate period.

**Fix:** Add inner try/catch around the `modify()` call. On failure, log to console and notify user via `BBMessage.warning()` to manually re-commit (which will be a no-op on server side but will retry the tag update).

### 🔴 Bug 2: `ensureCodeLoaded()` race condition causes double registration
**File:** `frontend/mods/mod-loader.js:134-177`

**Verified code:**
```javascript
export async function ensureCodeLoaded(templateId) {
    if (_codeLoaded.has(templateId)) return true;  // ← Set check
    if (!_templates[templateId]) return false;

    const success = await loadModCode(templateId);  // ← async work
    if (!success) return false;
    // ...validation...
    _codeLoaded.add(templateId);  // ← Set add (line 148)
    // ...register hooks/tools, call init()...
}
```

**Failure mode:**
Two concurrent callers (e.g., user adds two MOD instances rapidly, or boot phase 2 + on-demand call collide):
1. Caller A: `_codeLoaded.has(X)` → `false`, proceeds.
2. Caller B: `_codeLoaded.has(X)` → `false` (set still empty), proceeds.
3. Both await `loadModCode(X)`.
4. Both pass validation.
5. Both add to `_codeLoaded` (set is idempotent — harmless).
6. **Both register hooks/tools** — `ModHooks.register()` is called twice with the same handler.
7. **Both call `tpl.init()`** — DOM may be set up twice, listeners attached twice.

**Severity:** 🔴 — Hook handlers fire 2N times after N concurrent loads. Memory leak and observable misbehavior.

**Fix:** Add a Promise cache to dedupe in-flight loads:
```javascript
const _codeLoadingPromises = {};

export async function ensureCodeLoaded(templateId) {
    if (_codeLoaded.has(templateId)) return true;
    if (_codeLoadingPromises[templateId]) return _codeLoadingPromises[templateId];
    if (!_templates[templateId]) return false;

    _codeLoadingPromises[templateId] = (async () => {
        try {
            // ... existing logic ...
            return true;
        } finally {
            delete _codeLoadingPromises[templateId];
        }
    })();

    return _codeLoadingPromises[templateId];
}
```

### 🟡 Bug 3: Polling silent catch swallows all errors
**File:** `frontend/javascript/blackboard.js:765`

**Verified code:**
```javascript
} catch (_) {}
```

**Failure mode:** If the 5-second background poll fails repeatedly (server down, network error, auth expired), nothing is logged. User has no way to know sync is broken.

**Severity:** 🟡 — Silent failure, debug-hostile, but not data-corrupting.

**Fix:** Add `console.warn('[BB poll] sync failed:', err)`. Don't toast to user (too noisy), just log.

---

## Unverified Findings (For Future Investigation)

The following were raised by agents but I have NOT verified them. They may or may not be real bugs. Listed for future review:

### Blackboard / Sync
- 🟡 `blackboard-sync.js:192-211` — Deferred checkout may miss branch validation when user switches branches mid-operation
- 🟡 `blackboard-vcs.js:52-66` — `pull()` exits virtual state before save completes; if save fails, `state.isVirtual` is wrong
- 🟡 `blackboard-vcs.js:150-193` — File upload marked "synced" before server commit confirms; partial orphan possible
- 🟡 `blackboard-vcs.js:275-315` — `checkout()` of empty server branch silently falls back to local cache
- 🔵 `blackboard-core.js:42-59` — Owner field matching via `startsWith('local')` is brittle
- 🔵 `blackboard.js:345-377` — `forkBranch()` doesn't warn if source branch is empty
- 🔵 `CommitRequest.php:17` — `branch_id` validation accepts any string (low risk due to parameterized queries)

### Walkie-Typie
- 🟡 `walkie-typie-text.js:430-447` — `listenForWhisper` may have stale listener on rapid connection switches (uncertain — `echo.leave()` should clean up)
- 🟡 `walkie-typie-core.js:38-49` — Signal event delivery has no retry on WebSocket drop

### Broadcast
- 🟡 `broadcast-channel.js:113-145` — Saving on a deleted channel may create orphaned IndexedDB records
- 🟡 `broadcast-channel.js:285-306` — Reader-mode fetch in-flight not aborted on channel switch (race window)

### MOD System
- 🟡 `feature-shelf.js:23-35` — Event listener cleanup only happens at shelf close, not on instance delete
- 🔵 `mod-context.js:94-105` — Shared config merged at context creation; live updates require explicit listener

---

## Test Coverage Analysis

### Backend (Pest)
**Status:** 5 service test files, 85 tests, 158 assertions. Reasonable coverage of service-layer logic.

| File | Tests | Coverage |
|------|-------|----------|
| `AuthServiceTest` | 19 | ✓ Comprehensive auth flows |
| `BlackboardServiceTest` | 19 | ✓ LWW commit, dedup, blank skip, cache, events |
| `BroadcastChannelServiceTest` | 19 | ✓ Channel CRUD, pin/unpin, title guard |
| `WalkieTypieBoardServiceTest` | 12 | ✓ LWW commit, partner signal, access control |
| `FileServiceTest` | 14 | ✓ Upload dedup, orphan cleanup |

**Gaps:**
- LLM controller (no service layer extracted)
- Speech/Translation controllers (in-controller logic)
- Concurrent commit edge cases not exhaustively tested

### Frontend
**Status:** Zero tests. No test framework configured. No `package.json` test script.

**Critical untested code:**
1. **MOD framework** — entire system untested (loader, state, context, hooks, tools)
2. **IndexedDB CRUD** — `blackboard-core.js`, `walkie-typie-db.js`, `broadcast-db.js`
3. **Pure functions** — owner-tag matching, scrubBranch, getRecord/getAllRecords
4. **i18n key parity** — no automated check that en.json/zh-TW.json/default.json have same keys
5. **WebSocket event handlers** — connection drops, race with commit

---

## Recommended Test Strategy

**Framework:** **Vitest** (not Jest)

**Reasoning:**
- Native ESM support, no transpile step (matches project's vanilla ES modules)
- 5-10x faster startup than Jest
- Jest-compatible API (`describe`, `it`, `expect`) — no learning curve
- Lightweight: `vitest` + `happy-dom` + `fake-indexeddb` is enough

**Setup:**
```bash
npm install -D vitest @vitest/ui happy-dom fake-indexeddb
```

**`vitest.config.js`:**
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./frontend/javascript/__tests__/setup.js'],
    },
});
```

**Initial test priorities:**
1. `mod-state.test.js` — addInstance, removeInstance, maxInstances cap, persistence
2. `mod-loader.test.js` — `ensureCodeLoaded()` Promise cache (regression test for Bug 2 fix)
3. `indexedDB.test.js` — basic CRUD via fake-indexeddb
4. `blackboard-core.test.js` — pure functions: getRecord, getAllRecords, scrubBranch

**NOT in initial scope (too expensive for ROI):**
- WebSocket integration tests (would need Reverb mock)
- E2E tests (Playwright is overkill for this stage)
- DOM rendering snapshots (vanilla DOM is awkward to snapshot)

---

## Recommendation Summary

### Immediate (this session)
1. **Fix Bug 1, 2, 3** — verified critical issues
2. **Set up Vitest** — establish test infrastructure
3. **Write 4 initial test files** — start with MOD framework + IndexedDB

### Short-term (next few sessions)
4. **Verify the 🟡 unverified findings** — read each piece of flagged code yourself, decide which are real
5. **Add tests for fixed bugs** — regression coverage
6. **i18n key parity test** — automated check that all 3 locale files have same keys

### Long-term
7. **Consider integration tests for sync flows** — once Vitest infrastructure is solid
8. **Restaurant module review** — explicitly excluded from this session

---

## Lessons Learned About AI-Assisted Code Review

This review demonstrates important caveats:

1. **Agents pattern-match false positives.** ~60% of "critical" findings from the explore agents were wrong. Agents flagged "no auth check on endpoint" without understanding that the endpoint is intentionally public.

2. **Always verify independently.** Read the actual code. Check the design docs. Don't assume agents understood the architecture.

3. **Agents miss context they weren't given.** When the design says "this is public-by-design," but the agent prompt didn't include that, the agent will flag it as a vulnerability.

4. **Quality > Quantity.** Three verified bugs are more valuable than thirty unverified findings — because the unverified ones force users to do the verification work themselves anyway.

For future reviews, **always** include in the agent prompt:
- Design philosophy (sandbox, local-first, etc.)
- Intentional design decisions (public broadcast, LWW commit, etc.)
- VCS-vocabulary disambiguation (push = newer, not git push)

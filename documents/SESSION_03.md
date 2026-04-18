# Session 03 — Automated Testing + Code Review + Bug Fixes

**Date:** 2026-04-14  
**Duration:** 1 session  
**Reviewer:** Claude Opus 4.6 (1M context)

---

## Summary

Established comprehensive backend automated test suite, conducted deep code review across all components with focus on cross-component interactions, and fixed 15 verified bugs.

---

## 1. Automated Test Suite (85 → 267 tests)

### New Test Files Created

| File | Tests | Assertions | Covers |
|------|-------|-----------|--------|
| `BlackboardControllerTest` | 31 | 92 | All 4 BB endpoints: commit validation, auth guards, response format, LWW round-trip |
| `WalkieTypieControllerTest` | 40 | 91 | All 8 WT endpoints: connection CRUD, signal, tag update (incl. 404 fix), board ops, lifecycle |
| `BroadcastChannelControllerTest` | 34 | 75 | All 7 BC endpoints: public/private auth model, title guard, ownership, pin/unpin, lifecycle |
| `AuthControllerTest` | 32 | 76 | All 7 auth endpoints: register regex, login, logout, status, commands, reset/bind, lifecycle |
| `BackendServiceControllerTest` | 22 | 53 | Status, Translation, Speech, LLM: validation + Http::fake mocked providers |
| `FileControllerTest` (expanded) | 23 | 65 | Upload security, download (happy + disk missing), status lifecycle, orphan detection across BB/WT/BC |

**Total: 267 tests, 610 assertions (was 85 tests, 158 assertions)**

### Test Findings
- `CommitRequest` `required` rule rejects empty arrays `[]` — branch wipe only via DELETE endpoint, not commit
- `WalkieTypieController::updateTag()` returned 200 even when connection didn't exist — fixed and tested

---

## 2. Code Review Findings

### Methodology
1. Agent-assisted exploration (3 parallel Explore agents)
2. **Manual verification of every finding** — agents had ~40% false positive rate
3. Read every line of critical files (mod-state.js 558 lines, mods-manager.js 849 lines, blackboard-sync.js 253 lines)

### Agent Findings Rejected After Verification
- "Duplicate prompt keys in llm-bb" — intentional conditional preset pattern
- "hintKey never rendered" — hint-panel.js handles `[data-hint]` correctly
- "Circular event in sharedConfigChanged" — no template modifies shared config in callback
- "BroadcastChannelService pin query N+1" — cached with 120s TTL, not a real issue

### Config Pages
- **All 4 config pages complete** — 24 UI controls across BB/WT/BC/Mods, 100% coverage of SCOPE_DEFAULTS
- BB Config: only real issue was maxSlot not triggering cleanup (fixed)
- Other settings concerns (autoCleanBlanks/updateTimestamp mid-async) verified as theoretical only — cannot happen in single-threaded JS UI

---

## 3. Bugs Fixed (15)

### Backend (3)

| Commit | Fix |
|--------|-----|
| `086bd9f` | Translation/Speech/LLM error response format: `{'error':{'message':...}}` → `{'message':...}` so frontend api.js can read it |
| `6427e3c` | WT updateTag returns 404 for non-existent connection (was false 200) |
| (in test) | FileControllerTest now covers disk-missing download → 404 |

### BB Component (2)

| Commit | Fix |
|--------|-----|
| `2addc37` | BB maxSlot config change now triggers cleanup + syncView immediately |
| `d6f1476` | Auto-sync recover: timestamp comparison (newer wins) instead of blind flush; all manual ops (COMMIT/CHECKOUT/FORK/DROP) cancel pending auto-commit timer |

### WT Component (5)

| Commit | Fix |
|--------|-----|
| `0728bbd` | WT auth: reset weState.isVirtual + flush pending save on logout |
| `e58eaca` | Lock textarea during connection switch to prevent timer race |
| `f1e92d6` | commitWE failure toast; loadConnection failure toast; fetchConnections non-401 toast; Echo init failure toast; file upload failure strips broken hash from commit |

### BC Component (1)

| Commit | Fix |
|--------|-----|
| `e147c42` | Cast 4xx shows backend message (e.g. "TITLE REQUIRED") instead of generic |

### Cross-Cutting (2)

| Commit | Fix |
|--------|-----|
| `07e6e83` | All WT/BC catch blocks propagate backend message for 4xx errors |
| `f1e92d6` | 4 new locale keys in all 3 locale files (commitFailed, loadFailed, fetchFailed, realtimeUnavailable) |

### QoL (2)

| Commit | Fix |
|--------|-----|
| `bf94c52` | Enter confirms list rename (BB/WT/BC); adaptive scroll cooldown (120ms → 40-80ms) |
| `bb3724f` | Mobile swipe threshold 50→80px + 350ms max duration on all 3 swipe zones |

---

## 4. Auto Sync Deep Analysis

Conducted comprehensive scenario analysis of Auto Sync (BB two-way multi-device sync):

- **22 scenarios mapped** covering: normal sync, dual-device, offline/online, manual ops, settings toggle
- **Core flow verified correct** — auto-commit (3s) + auto-checkout (WS event) + poll fallback (5s)
- **3 bugs found and fixed:**
  1. `recover()` blindly committed local data, overwriting newer server content → now compares timestamps
  2. Manual COMMIT/CHECKOUT/FORK/DROP didn't cancel auto-commit timer → now cancels
  3. DROP then auto-commit resurrected deleted branch → now cancels

---

## 5. File System Review

- File lifecycle fully mapped: local → staged → committed → orphaned → deleted
- Orphan detection tested across all 3 board tables (BB, WT, BC)
- CleanOrphanedFiles command tested
- Frontend issues identified but not yet fixed (file-service.js doesn't use apiRequest(), URL.revokeObjectURL too early)

---

## 6. Pending Missions (saved to memory)

1. **Redis + Debounce Unification** — audit all cache TTLs, all frontend debounce timers, unify for consistent UX
2. **Email Unbind + Account Deletion** — reverse of /bind, full data cleanup on account delete

---

## 7. Still TODO (Not Addressed)

### Code Review Deferred Items (LOW priority)
- BB rapid logout→login initBoard race (#16)
- BC reader mode staleness indicator (#17)
- BC WS subscribe failure silent (#19)
- Feature shelf: button click on code-failed MOD silent; button visibility no transition; shelf close only dblclick

### Frontend Tests
- Vitest setup deferred (user said "No need" for now)

### FYP Demo Estimate
- Full demo: ~20 minutes of demonstrable features
- Minimum demo: ~10 minutes (core BB + auth + 2 MODs)
- Risk: WT and Auto Sync need pre-opened browser windows

---

## Commit History (this session)

```
55d5ed2 Expand file system tests: download, status lifecycle, orphan detection
d6f1476 Fix auto-sync: timestamp-based recover + cancel on manual ops
bb3724f QoL: Reduce mobile swipe sensitivity for sub-navi
bf94c52 QoL: Enter confirms list rename + faster list scrolling
6427e3c Fix WT updateTag returning false 200 for non-existent connection
07e6e83 Propagate backend error messages to user for 4xx errors
e147c42 Show backend error message for BC cast 4xx errors
f1e92d6 Add WT error feedback: toast for commit/load/fetch/echo failures
e58eaca Lock WT textarea during connection switch to prevent timer race
0728bbd Fix WT auth: reset virtual state + flush save on logout
2addc37 Fix BB maxSlot config change not triggering cleanup
086bd9f Fix error response format in Translation/Speech/LLM controllers
fa0ca2e Add backend service + file HTTP integration tests (37 tests, 99 assertions)
a16e9a7 Add Auth HTTP integration tests (32 tests, 76 assertions)
aa83d05 Add Broadcast Channel HTTP integration tests (34 tests, 75 assertions)
9cecc15 Add Walkie-Typie HTTP integration tests (39 tests, 89 assertions)
ad3eb21 Add Blackboard HTTP integration tests (31 tests, 92 assertions)
73b14af WIP: before Blackboard HTTP integration tests
```

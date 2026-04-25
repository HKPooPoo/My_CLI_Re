<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\BlackboardService;
use App\Services\BroadcastChannelService;
use App\Services\InboxService;
use App\Services\WalkieTypieBoardService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Demo seeder for Stage 4 Project Demonstration Presentation.
 *
 * Layers a coherent classroom scenario on top of `whitelist:smoke-seed`:
 *
 *   Lecturer01 (title=SEHH2238) is the lecturer of "2026SEHH2238 Programming Project".
 *   S20260001 .. S20260006 are enrolled (whitelist 2026SEHH2238).
 *
 *   The demonstrator (the user presenting) logs in as either
 *   Lecturer01 or S20260001 and walks through:
 *     • Dashboard (UPCOMING / ANNOUNCEMENTS / NOTEBOOKS rollup)
 *     • Notebook  — pre-filled lecture / personal pages
 *     • Chat      — pre-filled whisper history with peer + lecturer
 *     • Announce  — channels with calendar + flashcards + records
 *     • Inbox     — submissions in 3 different states
 *
 * Idempotent: the whitelist seeder uses updateOrInsert; this command
 * uses Service::cast / commit / createInbox which all handle existing
 * rows, plus try/catch around 409 NAME ALREADY TAKEN aborts.
 */
class DemoSeed extends Command
{
    protected $signature = 'demo:seed {--reset : Wipe demo content before re-seeding}';
    protected $description = 'Populate the 2026SEHH2238 classroom scenario for Stage 4 demo';

    private const T_BASE = 1777075200000; // 2026-04-25 00:00:00 UTC in ms — demo anchor

    public function handle(
        BlackboardService $bb,
        WalkieTypieBoardService $wt,
        BroadcastChannelService $bc,
        InboxService $inbox,
    ): int {
        // ── Step 1: base accounts via whitelist:smoke-seed (idempotent) ─
        Artisan::call('whitelist:smoke-seed');
        $this->info('[1/6] Base accounts + whitelists ensured.');

        $lecturer = User::where('uid', 'Lecturer01')->firstOrFail();
        $s1 = User::where('uid', 'S20260001')->firstOrFail();
        $s2 = User::where('uid', 'S20260002')->firstOrFail();
        $s3 = User::where('uid', 'S20260003')->firstOrFail();

        $whitelistA = DB::table('whitelists')->where('code', '2026SEHH2238')->first();
        if (!$whitelistA) {
            $this->error('Whitelist 2026SEHH2238 not found — smoke-seed failed?');
            return self::FAILURE;
        }

        if ($this->option('reset')) {
            $this->resetDemoContent($lecturer, [$s1, $s2, $s3]);
            $this->info('[—]   Demo content wiped (per --reset flag).');
        }

        // ── Step 2: notebooks (Blackboard) ──────────────────────────────
        $this->seedNotebooks($bb, $lecturer, $s1, $s2);
        $this->info('[2/6] Notebooks seeded.');

        // ── Step 3: announcements (Broadcast) ───────────────────────────
        $this->seedChannels($bc, $lecturer, (int) $whitelistA->id, $s1, $s2, $s3);
        $this->info('[3/6] Announce channels + calendar + flashcards seeded.');

        // ── Step 4: chat (Walkie-Typie) connections + history ───────────
        $this->seedChat($wt, $lecturer, $s1, $s2);
        $this->info('[4/6] Chat connections + whisper history seeded.');

        // ── Step 5: inbox + submissions ─────────────────────────────────
        $this->seedInboxes($inbox, $lecturer, (int) $whitelistA->id, $s1, $s2, $s3);
        $this->info('[5/6] Inbox + 3 submission rows seeded.');

        // ── Step 6: dashboard fuel — personal calendar in users.settings ─
        $this->seedPersonalCalendar($s1);
        $this->info('[6/6] Personal calendar in user settings seeded.');

        $this->printPlan();
        return self::SUCCESS;
    }

    /**
     * Notebooks per actor. Each commit uses the Service so the cache
     * is invalidated correctly and BlackboardUpdated events fire on
     * any device currently logged in.
     */
    private function seedNotebooks(BlackboardService $bb, User $lec, User $s1, User $s2): void
    {
        // Lecturer's lecture-plan notebook
        $lecBranchId = (string) (self::T_BASE - 86400000 * 14); // 14 days ago = branch creation
        $bb->commit($lec, $lecBranchId, 'SEHH2238 Lecture Plans', [
            ['timestamp' => self::T_BASE - 86400000 * 13, 'text' => "Week 10 — HITL Pair-Programming\n\nDiscussion outline:\n• Why human review remains the bottleneck even with LLM copilots\n• Cycle-time gains: 3-5x for boilerplate, ~1x for novel architecture\n• Acceptable use vs academic dishonesty — the line is documentation\n\nReading: Stryker (2026), IBM HITL article."],
            ['timestamp' => self::T_BASE - 86400000 * 7,  'text' => "Week 11 — SDLC Review\n\nCompare:\n• Waterfall — predictable but rigid\n• Iterative — feedback at each gate\n• Agile — sprint-bounded continuous delivery\n• HITL — iterative + LLM copilot, post-2024\n\nIn-class exercise: classify each student's project under one of the four models, justify in 3 sentences."],
            ['timestamp' => self::T_BASE - 86400000 * 2,  'text' => "Week 12 — Stage 4 Demo Prep\n\nMarking criteria reminder:\n• Demonstration weight: 20%\n• Q&A weight: 5%\n• Late arrival: -5% individual mark\n• EVERY group member must speak\n\nFor solo-survivor groups (8D, 11A): demonstrate journey + deliverable both."],
        ]);

        // S20260001 — engaged student with two notebooks
        $s1ProjBranch = (string) (self::T_BASE - 86400000 * 20);
        $bb->commit($s1, $s1ProjBranch, 'SEHH2238 Notes', [
            ['timestamp' => self::T_BASE - 86400000 * 19, 'text' => "L01 — Project kickoff (groups assigned)\n\nGroup 8D:\n  YU Shing Hei (24121627A)\n  + 3 others (TBC engagement)\n\nDeliverables stack: Proposal → Design → Code → Demo → Final Report"],
            ['timestamp' => self::T_BASE - 86400000 * 12, 'text' => "L05 — Architectural Patterns\n\n• MVC vs MVVM vs Flux\n• Service layer keeps controllers thin\n• Local-first: device = source of truth, server = opt-in backup"],
            ['timestamp' => self::T_BASE - 86400000 * 5,  'text' => "L09 — Real-time Transport\n\nLong-polling vs WebSocket vs SSE.\n\nFor MyCLI: Reverb chosen because\n  (1) Pusher-protocol compatible,\n  (2) Laravel-team maintained,\n  (3) ~50ms keystroke whisper acceptable for chat use case."],
            ['timestamp' => self::T_BASE - 86400000 * 1,  'text' => "L11 — TODO before next class\n\n[ ] Watch HITL lecture recording\n[ ] Submit Stage 5 draft via Inbox before Tuesday\n[ ] Review whitelist semantics — is detach the same as setting null?\n[ ] Practise 15-min demo with timer (currently overrunning)"],
        ]);

        $s1DiaryBranch = (string) (self::T_BASE - 86400000 * 30);
        $bb->commit($s1, $s1DiaryBranch, 'Personal Diary', [
            ['timestamp' => self::T_BASE - 86400000 * 28, 'text' => "Switched to Omarchy on the home laptop. Tiling-window workflow is faster for parallel terminals — VS Code on the left, three Docker logs streaming on the right, Claude Code in the middle. No more alt-tab fatigue."],
            ['timestamp' => self::T_BASE - 86400000 * 6,  'text' => "Notebook test: a personal diary in MyCLI itself feels strange (am I dogfooding too aggressively?), but the per-page model maps onto journaling cleanly. One day = one page. Reorder when retro-thinking."],
        ]);

        // S20260002 — light user with sparse notebook
        $s2Branch = (string) (self::T_BASE - 86400000 * 10);
        $bb->commit($s2, $s2Branch, 'Programming Notes', [
            ['timestamp' => self::T_BASE - 86400000 * 9, 'text' => "PHP namespace import order — vendor first, then app, then relative. PSR-12."],
            ['timestamp' => self::T_BASE - 86400000 * 3, 'text' => "Docker compose up -d takes ~12s on cold cache. Restart-only takes ~2s. Use restart-only when iterating on Laravel code."],
        ]);
    }

    /**
     * Two channels owned by Lecturer01, both whitelisted to 2026SEHH2238.
     * One channel carries calendar + flashcards (for shelf demo); the
     * other is a plain announcements channel.
     */
    private function seedChannels(BroadcastChannelService $bc, User $lec, int $whitelistAId, User $s1, User $s2, User $s3): void
    {
        // Channel 1 — primary lecture channel with calendar + flashcards
        $ch1Records = [
            ['timestamp' => self::T_BASE - 86400000 * 10, 'text' => "Welcome to SEHH2238 Programming Project, 2026 cohort. This channel carries lecture-day announcements, deadline reminders, and reference material. Pin it (top-right) so you don't miss live updates."],
            ['timestamp' => self::T_BASE - 86400000 * 6,  'text' => "Stage 4 Project Demonstration Presentation — book a 15-minute slot via the schedule sheet. EVERY group member must present. Late arrivals receive individual mark deduction."],
            ['timestamp' => self::T_BASE - 86400000 * 3,  'text' => "Reminder: bring your laptop with the demo running locally. The classroom WiFi is not whitelisted for Cloudflare Tunnel access — you cannot rely on the public URL."],
            ['timestamp' => self::T_BASE - 86400000 * 1,  'text' => "Office hours moved this week — Tuesday 14:00 instead of Thursday 10:00. Stage 5 Final Report draft review available, bring printed copy."],
        ];

        $ch1Calendar = [
            $this->dateOffset(+1) => ['Lecture 13 — Stage 4 Pre-flight'],
            $this->dateOffset(+3) => ['Tutorial 12 — SDLC Review'],
            $this->dateOffset(+5) => ['Stage 4 Project Demonstration', 'Q&A 5min after each demo'],
            $this->dateOffset(+7) => ['Office Hours — Final Report draft consultation'],
            $this->dateOffset(+12) => ['Stage 5 Final Report — submission deadline'],
        ];

        $ch1Flashcards = [
            'cards' => [
                ['front' => 'What does HITL stand for in modern SDLC?', 'back' => 'Human-In-The-Loop pair-programming workflow with an LLM copilot. Developer reviews and tests every generated artefact before commit.'],
                ['front' => 'Define LWW commit',                          'back' => 'Last-Write-Wins. The full record set is uploaded; the server replaces server-side state with the payload. No conflict detection.'],
                ['front' => 'Why JSONB over JSON in PostgreSQL?',           'back' => 'JSONB is binary-encoded, indexable via GIN, and faster to query. JSON preserves whitespace and is faster to insert; JSONB is the right default for read-heavy workloads.'],
                ['front' => 'Local-first architecture in one sentence',     'back' => 'The device IndexedDB is the source of truth; the server is an opt-in backup invoked via manual UPLOAD/DOWNLOAD actions.'],
                ['front' => 'Workbox role',                                 'back' => 'Generates a versioned Service Worker (sw.js) from a source template (sw-src.js), injecting per-file content hashes for precise cache invalidation.'],
                ['front' => 'Why Reverb over native WebSocket?',            'back' => 'Reverb speaks the Pusher protocol (so Laravel Echo client just works), is maintained by the Laravel team, and ships with Docker-friendly configuration.'],
                ['front' => 'What is a whitelist preset in MyCLI?',          'back' => 'A reusable named member set ({code, name, members[]}) that an authorised owner applies to a channel or inbox. Detach reverts to closed (no audience).'],
                ['front' => 'Difference between push/pull and UPLOAD/DOWNLOAD?', 'back' => 'Push/pull (NEWER/OLDER) are page-navigation buttons within one notebook. UPLOAD/DOWNLOAD (commit/checkout) syncs the whole notebook to/from the server.'],
            ],
            'mode' => 'sequential',
            'playState' => null,
        ];

        $ch1Name = 'SEHH2238 Lecture Updates';
        $ch1 = $bc->cast($lec, $ch1Name, $ch1Records, $ch1Calendar, $ch1Flashcards);
        $bc->applyWhitelist($lec, (int) $ch1->id, $whitelistAId);

        // Channel 2 — secondary discussion channel
        $ch2Records = [
            ['timestamp' => self::T_BASE - 86400000 * 4, 'text' => "Stage 5 Final Report — common questions:\n\nQ: Page count?\nA: 20–30 pages, references and appendix not counted.\n\nQ: Cover page format?\nA: As shown in the rubric. Course code, title, group ID, student IDs, names."],
            ['timestamp' => self::T_BASE - 86400000 * 1, 'text' => "Reminder: backup your work daily. The Inbox here accepts submissions up to the deadline; after that, late submissions go through the LMS escalation process — slower and case-by-case."],
        ];
        $ch2Name = 'Programming Project Discussion';
        $ch2 = $bc->cast($lec, $ch2Name, $ch2Records, null, null);
        $bc->applyWhitelist($lec, (int) $ch2->id, $whitelistAId);

        // Pins — show that some students have followed both channels
        foreach ([$s1, $s2, $s3] as $student) {
            DB::table('broadcast_pins')->updateOrInsert(
                ['user_id' => $student->id, 'channel_id' => $ch1->id],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
        DB::table('broadcast_pins')->updateOrInsert(
            ['user_id' => $s1->id, 'channel_id' => $ch2->id],
            ['created_at' => now(), 'updated_at' => now()]
        );
    }

    /**
     * Two chat connections with whisper history:
     *   S20260001 ↔ S20260002   — peer chat
     *   S20260001 ↔ Lecturer01  — student-lecturer
     */
    private function seedChat(WalkieTypieBoardService $wt, User $lec, User $s1, User $s2): void
    {
        $this->ensureConnection($s1, $s2);
        $this->ensureConnection($s1, $lec);

        // S1 ↔ S2 history
        $wt->commit($s1, "wt_{$s1->id}_{$s2->id}", $s2->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 2,        'text' => 'finished q3 yet?'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 6e5,  'text' => 'mine\'s overrunning the 15min, what\'s yours like?'],
            ['timestamp' => self::T_BASE - 86400000 * 1 + 3e5,  'text' => 'thanks, see you tmr at the lab'],
        ]);
        $wt->commit($s2, "wt_{$s2->id}_{$s1->id}", $s1->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 2 + 3e5,  'text' => 'almost — stuck on the diff-match-patch part. why does the slide say it doesn\'t apply to record sets?'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 9e5,  'text' => '13 minutes when i practised yesterday'],
        ]);

        // S1 ↔ Lecturer01 history
        $wt->commit($s1, "wt_{$s1->id}_{$lec->id}", $lec->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 3,        'text' => 'good afternoon prof, quick question on the inbox whitelist'],
            ['timestamp' => self::T_BASE - 86400000 * 3 + 4e5,  'text' => 'if you detach the whitelist, do existing submitters still see their old submissions?'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 12e5, 'text' => 'understood, thanks!'],
        ]);
        $wt->commit($lec, "wt_{$lec->id}_{$s1->id}", $s1->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 3 + 7e5,  'text' => 'yes — visibility is read-preserved. they can still read but can\'t resubmit. write access is gated strictly by the current whitelist.'],
            ['timestamp' => self::T_BASE - 86400000 * 3 + 9e5,  'text' => 'so an evicted student keeps their already-graded work in view; they just can\'t upload over it.'],
        ]);
    }

    private function ensureConnection(User $a, User $b): void
    {
        $now = (int) (microtime(true) * 1000);
        DB::table('walkie_typie_connections')->updateOrInsert(
            ['user_id' => $a->id, 'partner_id' => $b->id],
            [
                'partner_tag'        => $b->uid,
                'my_branch_id'       => "wt_{$a->id}_{$b->id}",
                'partner_branch_id'  => "wt_{$b->id}_{$a->id}",
                'last_signal'        => $now,
                'created_at'         => now(),
                'updated_at'         => now(),
            ]
        );
        DB::table('walkie_typie_connections')->updateOrInsert(
            ['user_id' => $b->id, 'partner_id' => $a->id],
            [
                'partner_tag'        => $a->uid,
                'my_branch_id'       => "wt_{$b->id}_{$a->id}",
                'partner_branch_id'  => "wt_{$a->id}_{$b->id}",
                'last_signal'        => $now,
                'created_at'         => now(),
                'updated_at'         => now(),
            ]
        );
    }

    /**
     * Two inboxes — one with three submissions in different states,
     * one empty (clean state for the demonstrator to submit live).
     */
    private function seedInboxes(InboxService $inbox, User $lec, int $whitelistAId, User $s1, User $s2, User $s3): void
    {
        // Inbox 1 — has 3 submissions, 2 with feedback, 1 awaiting feedback
        $name1 = 'Programming Project Stage 5 Submission';
        $existing = DB::table('inboxes')->where('name', $name1)->first();
        if ($existing) {
            $inbox1Id = (int) $existing->id;
        } else {
            $inbox1 = $inbox->createInbox(
                $lec,
                $name1,
                'Submit your Stage 5 Final Report draft for review. Plain text in the SUBMISSION pane; attach your .docx via the file chip. Resubmit any time before deadline.',
                $whitelistAId,
            );
            $inbox1Id = (int) $inbox1->id;
        }

        // S1 — submitted with feedback (graded)
        $inbox->submit($s1, $inbox1Id,
            "Stage 5 Final Report — first complete draft.\n\nMain sections done: Executive Summary, Schedule Review, all five Stage Summaries, System (hardware + tools + outputs + installation), Summary of Program (flow + features + tests + backup), Discussion (modifications + difficulties), Future Development, Conclusion. Team Distribution and References pending final review.\n\nPage count currently 24. Will tighten the Discussion section to bring it under 30. Open to feedback on whether the HITL framing reads as authentic or evasive.",
            null,
        );
        $inbox->writeFeedback($lec, $inbox1Id, $s1->uid,
            "Solid draft — page count is fine where it is. Tighten Discussion section 6.A (group attrition) into one paragraph; current three paragraphs read as repetitive. HITL framing is fine, supported by Stryker citation. Add a sentence acknowledging the lecturer-side trade-off for marking transparency.\n\nGrade indication: A- range pending final clean-up. Resubmit before Tuesday for final-grade lock-in.",
        );

        // S2 — submitted but no feedback yet (awaiting state — fuels [NEW] indicator)
        $inbox->submit($s2, $inbox1Id,
            "Initial submission — Stages 1–3 sections drafted. Stage 4 still in note form because I'm finalising the demo script first. Will resubmit a complete draft before the deadline. Question: is it acceptable to cite IBM's HITL article without a stable DOI?",
            null,
        );

        // S3 — submitted with feedback
        $inbox->submit($s3, $inbox1Id,
            "Final draft — 27 pages. Cover page, ToC, Executive Summary, Stages 1-5, System, Summary of Program, Discussion, Future Development, Conclusion, Team Distribution, References, Appendix A (repo + access), Appendix B (cost). All cross-references checked.",
            null,
        );
        $inbox->writeFeedback($lec, $inbox1Id, $s3->uid,
            "Well-structured. References list is thorough. Two minor points:\n\n1. Appendix B cost table — distinguish 'cash outlay' from 'opportunity cost' in the man-day row. Current presentation conflates the two.\n2. Stage 3 Programming summary — add one paragraph on the test isolation incident (SQLite vs Postgres). It's the kind of detail markers reward.\n\nPass-grade locked. Submit a final clean copy before deadline for grade upgrade consideration.",
        );

        // Inbox 2 — empty (the live-demo target)
        $name2 = 'Lab 03 Code Review';
        if (!DB::table('inboxes')->where('name', $name2)->exists()) {
            $inbox2 = $inbox->createInbox(
                $lec,
                $name2,
                'Submit your Lab 03 (Docker compose + Postgres setup) for review. SUBMISSION pane: paste your docker-compose.yml plus a 1-paragraph summary of what blockers you hit and how you resolved them.',
                $whitelistAId,
            );
        }
    }

    /**
     * Personal calendar in users.settings JSONB — fuels the
     * NOTEBOOK Calendar feature when S20260001 is logged in, plus
     * the DASHBOARD UPCOMING rollup.
     */
    private function seedPersonalCalendar(User $s1): void
    {
        $cal = [
            $this->dateOffset(+1) => ['Group 8D demo rehearsal — 2pm library room 4'],
            $this->dateOffset(+2) => ['Lecture 13 — bring laptop', 'Tutorial homework due'],
            $this->dateOffset(+5) => ['Stage 4 Demo — 14:30 slot, Y401', 'Bring printed Final Report draft'],
            $this->dateOffset(+12) => ['Stage 5 Final Report deadline — 23:59 LMS'],
        ];

        $existing = DB::table('users')->where('id', $s1->id)->value('settings');
        $current = $existing ? json_decode($existing, true) : [];
        $current['calendar'] = array_merge($current['calendar'] ?? [], $cal);

        DB::table('users')->where('id', $s1->id)->update([
            'settings'   => json_encode($current),
            'updated_at' => now(),
        ]);
    }

    private function resetDemoContent(User $lec, array $students): void
    {
        // Wipe lecturer-owned channels (cascade kills broadcast_boards)
        DB::table('broadcast_channels')
            ->where('user_id', $lec->id)
            ->whereIn('name', ['SEHH2238 Lecture Updates', 'Programming Project Discussion'])
            ->delete();

        // Wipe lecturer-owned inboxes (cascade kills inbox_submissions)
        DB::table('inboxes')
            ->where('user_id', $lec->id)
            ->whereIn('name', ['Programming Project Stage 5 Submission', 'Lab 03 Code Review'])
            ->delete();

        // Wipe demo notebooks (BB + WT)
        $studentIds = array_map(fn(User $u) => $u->id, $students);
        DB::table('blackboards')->whereIn('user_id', array_merge([$lec->id], $studentIds))->delete();
        DB::table('walkie_typie_boards')->whereIn('user_id', array_merge([$lec->id], $studentIds))->delete();

        foreach ($students as $s) {
            DB::table('walkie_typie_connections')->where('user_id', $s->id)->delete();
            DB::table('walkie_typie_connections')->where('partner_id', $s->id)->delete();
        }
    }

    private function dateOffset(int $days): string
    {
        // YYYY-MM-DD relative to demo anchor (T_BASE = 2026-04-25)
        $ts = (int) (self::T_BASE / 1000) + $days * 86400;
        return gmdate('Y-m-d', $ts);
    }

    private function printPlan(): void
    {
        $this->newLine();
        $this->info('═══════════════ DEMO SCENARIO READY ═══════════════');
        $this->line('All passcodes = the uid itself (e.g. Lecturer01 / S20260001).');
        $this->newLine();
        $this->line('▌ LECTURER PERSPECTIVE — login as Lecturer01');
        $this->line('  Dashboard pops up: UPCOMING (5 calendar events), ANNOUNCEMENTS');
        $this->line('  (2 own channels), NOTEBOOKS (Lecture Plans).');
        $this->line('  → NOTEBOOK > Lecture Plans (3 lecture pages, AI Tutor "Summarise notebook")');
        $this->line('  → ANNOUNCE > SEHH2238 Lecture Updates');
        $this->line('     • 4 cast records, calendar shelf (5 events), flashcard shelf (8 cards)');
        $this->line('     • whitelist shelf shows 2026SEHH2238 applied; DETACH demo target');
        $this->line('  → INBOX > Programming Project Stage 5 Submission');
        $this->line('     • preview rail shows 3 student blocks');
        $this->line('     • S20260001 — graded (✓), S20260002 — awaiting (·), S20260003 — graded (✓)');
        $this->line('     • click S20260002 block → write feedback live → POST');
        $this->line('  → INBOX > Lab 03 Code Review (empty — empty-state placeholder visible)');
        $this->line('  → CHAT > S20260001 (lecturer side, 2 historical replies)');
        $this->newLine();
        $this->line('▌ STUDENT PERSPECTIVE — login as S20260001');
        $this->line('  Dashboard pops up: UPCOMING (4 personal events), ANNOUNCEMENTS');
        $this->line('  (2 pinned channels), NOTEBOOKS (SEHH2238 Notes + Personal Diary).');
        $this->line('  → NOTEBOOK > SEHH2238 Notes (4 lecture pages, page-preview rail)');
        $this->line('  → NOTEBOOK > Personal Diary (2 entries, Calendar shelf shows 4 events)');
        $this->line('  → CHAT > S20260002 (3 messages each side, peer)');
        $this->line('  → CHAT > Lecturer01 (3 student msgs + 2 lecturer replies)');
        $this->line('  → ANNOUNCE > SEHH2238 Lecture Updates (read-only, calendar + flashcards visible)');
        $this->line('  → INBOX > Programming Project Stage 5 Submission');
        $this->line('     • SUBMISSION shows own submitted text');
        $this->line('     • FEEDBACK shows lecturer\'s graded comment');
        $this->line('  → INBOX > Lab 03 Code Review (empty — submit live during demo)');
        $this->newLine();
        $this->line('▌ EDGE CASES (optional probe accounts)');
        $this->line('  S20260002 — submitted, NO feedback yet → demo "awaiting feedback" state');
        $this->line('  S20260006 — overlap (in BOTH whitelists)');
        $this->line('  S20260007 — only in 2026SEHH3140 → cannot see Lecturer01\'s channels');
        $this->newLine();
        $this->line('Reset: php artisan demo:seed --reset');
        $this->line('       (re-runs the seed afterwards; idempotent)');
    }
}

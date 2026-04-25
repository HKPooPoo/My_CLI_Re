<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\BlackboardService;
use App\Services\BroadcastChannelService;
use App\Services\InboxService;
use App\Services\WalkieTypieBoardService;
use App\Services\WhitelistService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Demo seeder for Stage 4 Project Demonstration Presentation.
 *
 * Scenario: S20260001 is a student taking SEHH3140 Programming
 * Project (lecturer = Lecturer01) and LCH1019 Japanese I (textbook
 * Minna no Nihongo Shokyu I — class material is out of demo scope,
 * student carries the material as a notebook + flashcard deck).
 *
 *   Lecturer01  (title flipped to SEHH3140 by this seeder)
 *     • SEHH3140 Lecture Plans  (3-page Notebook, Week 10/11/12)
 *     • SEHH3140 Programming Project  (Channel — 3 cast pages,
 *       lightweight channel calendar with Stage 4 demo + Stage 5
 *       deadline)
 *     • SEHH3140 Programming Project Submission  (Inbox; 3
 *       submissions in the three demo-relevant states — graded /
 *       awaiting / graded)
 *
 *   S20260001  (added to 2026SEHH3140 whitelist by this seeder so
 *               Lecturer01's channel + inbox are visible)
 *     • SEHH3140 Programming Project  (3-page Notebook, student
 *       perspective Week 10/11/12)
 *     • LCH1019 Japanese I  (3-page Notebook, Minna L1/L2/L3) +
 *       12-card flashcard deck (vocabulary + grammar from L1-3)
 *     • Personal calendar with 4 exam dates and the 2026-04-26
 *       group demo-video record meeting
 *     • Chat history with S20260002 (peer) and Lecturer01
 *
 * Idempotent: artisan smoke-seed handles base accounts; this command
 * uses Service::cast / commit / createInbox which all upsert.
 */
class DemoSeed extends Command
{
    protected $signature = 'demo:seed {--reset : Wipe demo content before re-seeding}';
    protected $description = 'Populate the SEHH3140 + LCH1019 classroom scenario for Stage 4 demo';

    private const T_BASE = 1777075200000; // 2026-04-25 00:00:00 UTC in ms — demo anchor

    public function handle(
        BlackboardService $bb,
        WalkieTypieBoardService $wt,
        BroadcastChannelService $bc,
        InboxService $inbox,
        WhitelistService $whitelist,
    ): int {
        // ── Step 1: base accounts via whitelist:smoke-seed (idempotent) ─
        Artisan::call('whitelist:smoke-seed');
        $this->info('[1/7] Base accounts + whitelists ensured.');

        $lecturer = User::where('uid', 'Lecturer01')->firstOrFail();
        $s1 = User::where('uid', 'S20260001')->firstOrFail();
        $s2 = User::where('uid', 'S20260002')->firstOrFail();
        $s3 = User::where('uid', 'S20260003')->firstOrFail();

        $whitelistB = DB::table('whitelists')->where('code', '2026SEHH3140')->first();
        if (!$whitelistB) {
            $this->error('Whitelist 2026SEHH3140 not found — smoke-seed failed?');
            return self::FAILURE;
        }
        $whitelistBId = (int) $whitelistB->id;

        if ($this->option('reset')) {
            $this->resetDemoContent($lecturer, [$s1, $s2, $s3]);
            $this->info('[—]   Demo content wiped (per --reset flag).');
        }

        // ── Step 2: actor adjustments — Lecturer01 → SEHH3140; S1/S2/S3 into 2026SEHH3140 ─
        $this->adjustActors($whitelist, $lecturer, [$s1, $s2, $s3], $whitelistBId);
        $lecturer->refresh();
        $this->info('[2/7] Lecturer01 retitled SEHH3140; S20260001/2/3 enrolled in 2026SEHH3140.');

        // ── Step 3: notebooks (Blackboard) ──────────────────────────────
        $this->seedNotebooks($bb, $lecturer, $s1);
        $this->info('[3/7] Notebooks seeded (Lecturer plans · SEHH3140 student · LCH1019 student).');

        // ── Step 4: SEHH3140 Programming Project channel ────────────────
        $this->seedChannel($bc, $lecturer, $whitelistBId);
        $this->info('[4/7] SEHH3140 Programming Project channel seeded (3 cast pages + lecture calendar).');

        // ── Step 5: chat (Walkie-Typie) connections + history ───────────
        $this->seedChat($wt, $lecturer, $s1, $s2);
        $this->info('[5/7] Chat connections + whisper history seeded.');

        // ── Step 6: inbox + submissions ─────────────────────────────────
        $this->seedInbox($inbox, $lecturer, $whitelistBId, $s1, $s2, $s3);
        $this->info('[6/7] Inbox + 3 submission rows seeded.');

        // ── Step 7: personal calendar + LCH1019 flashcards on S20260001 ─
        $this->seedStudentSettings($s1);
        $this->info('[7/7] S20260001 personal calendar + LCH1019 flashcards seeded.');

        $this->printPlan();
        return self::SUCCESS;
    }

    /**
     * Bring the smoke-seed's pristine state into the SEHH3140 demo
     * scenario:
     *   • Lecturer01.title:  SEHH2238 → SEHH3140  (the
     *     `whitelist_distributions` rule already grants
     *     `title=SEHH3140 → can apply 2026SEHH3140`, so this single
     *     update flips the apply-permission too)
     *   • S20260001 added to 2026SEHH3140 members so they see
     *     Lecturer01's channel + inbox once whitelisted.
     */
    private function adjustActors(WhitelistService $whitelist, User $lecturer, array $students, int $whitelistBId): void
    {
        DB::table('users')
            ->where('id', $lecturer->id)
            ->update(['title' => 'SEHH3140', 'updated_at' => now()]);

        // Every focus-cohort student needs membership so the SEHH3140
        // channel + inbox accept their submissions / show in their list.
        foreach ($students as $student) {
            $whitelist->addMember($whitelistBId, $student->uid);
        }
    }

    /**
     * Three notebooks. Per user's "I'll deal with tutorial materials
     * later" instruction, lecture-side pages reference handouts but
     * don't invent week-specific course material. Lesson summaries
     * are minimal scaffolds — placeholders the demonstrator (or the
     * real student) fills in.
     */
    private function seedNotebooks(BlackboardService $bb, User $lec, User $s1): void
    {
        // Lecturer01's SEHH3140 lecture plans — 3 pages, Week 10/11/12
        $lecBranchId = (string) (self::T_BASE - 86400000 * 21);
        $bb->commit($lec, $lecBranchId, 'SEHH3140 Lecture Plans', [
            ['timestamp' => self::T_BASE - 86400000 * 14, 'text' =>
                "Week 10 — Stage 3 Programming wrap-up\n" .
                "─────────────────────────────────────\n\n" .
                "• Confirm every group has a working MVP demo-able locally\n" .
                "• Walk through the Stage 4 marking rubric (15 min present + 5 min Q&A)\n" .
                "• Remind: EVERY group member must speak; late = individual deduction\n" .
                "• In-class exercise — pair groups for cross-review of demo scripts\n\n" .
                "Tutorial materials (W10 lab): see handout — exercise on commit\n" .
                "semantics + Last-Write-Wins replacement strategies."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 7, 'text' =>
                "Week 11 — Stage 4 Demo Preparation\n" .
                "─────────────────────────────────────\n\n" .
                "• Each group books a 15-min slot via the schedule sheet\n" .
                "• Discuss: how to demonstrate journey AND deliverable in 15 min\n" .
                "• Common failure modes — over-running on backend explanation,\n" .
                "  under-demonstrating user flow\n" .
                "• In-class dry-run — first three volunteers + structured feedback\n\n" .
                "Tutorial materials (W11 lab): self-record practice run, watch\n" .
                "playback, identify three things to cut + one thing to add."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 0, 'text' =>
                "Week 12 — Stage 5 Final Report Guidance\n" .
                "─────────────────────────────────────\n\n" .
                "• Page count: 20–30 pages (cover + ToC + sections per rubric)\n" .
                "• Cover page: course code, group ID, every member's ID + name\n" .
                "• Schedule Review must address deviations — be honest, not defensive\n" .
                "• Submission via Inbox (this MyCLI instance) — mirror submit also via LMS\n" .
                "• Office hours: Tuesday 14:00, draft review available\n\n" .
                "Tutorial materials (W12 lab): peer-review pairs swap drafts;\n" .
                "fill in the rubric checklist for the partner before tutorial ends."
            ],
        ]);

        // S20260001's SEHH3140 student notebook — 3 pages, Week 10/11/12
        $s1ProjBranch = (string) (self::T_BASE - 86400000 * 22);
        $bb->commit($s1, $s1ProjBranch, 'SEHH3140 Programming Project', [
            ['timestamp' => self::T_BASE - 86400000 * 14, 'text' =>
                "Week 10 — Stage 3 wrap notes\n" .
                "─────────────────────────────────\n\n" .
                "• MVP needs to demo-run locally before W11 dry-run\n" .
                "• Stage 4 = 15 min presentation + 5 min Q&A; every member speaks\n" .
                "• Pairing exercise — partner group gave good feedback on\n" .
                "  pacing (stop over-explaining the Docker setup)\n\n" .
                "Tutorial reference: W10 lab handout (commit semantics + LWW).\n" .
                "Action items: \n" .
                "  [x] confirm Docker compose up clean from a fresh clone\n" .
                "  [ ] write the 15-min script with timing markers"
            ],
            ['timestamp' => self::T_BASE - 86400000 * 7, 'text' =>
                "Week 11 — Demo prep\n" .
                "─────────────────────────────────\n\n" .
                "• Booked the 14:30 Friday slot in Y401\n" .
                "• Dry-run first attempt: 19 min — must cut\n" .
                "• Cut candidates: Round 1 sandbox detour history (just one line),\n" .
                "  full architecture diagram (let it speak for itself)\n" .
                "• Add: live AI Tutor + Flashcard demo (currently buried)\n\n" .
                "Tutorial reference: W11 self-record exercise. Re-watching my\n" .
                "playback, I keep saying 'um' between slides — pause practice."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 1, 'text' =>
                "Week 12 — Final report draft notes\n" .
                "─────────────────────────────────\n\n" .
                "• Stage 5 deadline: 7/5 23:59 LMS\n" .
                "• Demo Inbox accepts drafts before deadline; lecturer reviews\n" .
                "• Cover page format ready; ToC auto-generated from headings\n" .
                "• Pending sections: Discussion §7.2 (difficulties), Future Dev\n\n" .
                "Tutorial reference: W12 peer-review checklist — to be done\n" .
                "after the demo is recorded (4/26)."
            ],
        ]);

        // S20260001's LCH1019 student notebook — 3 pages, Lesson 1/2/3
        $s1JpBranch = (string) (self::T_BASE - 86400000 * 28);
        $bb->commit($s1, $s1JpBranch, 'LCH1019 Japanese I', [
            ['timestamp' => self::T_BASE - 86400000 * 21, 'text' =>
                "Lesson 1 — 自己しょうかい (Self-introduction)\n" .
                "─────────────────────────────────────────\n\n" .
                "Grammar pattern: ～は～です\n" .
                "  わたしは がくせいです。 → I am a student.\n" .
                "  あのひとは せんせいです。 → That person is a teacher.\n\n" .
                "Negation: ～は～じゃ ありません\n" .
                "  わたしは せんせいじゃ ありません。 → I am not a teacher.\n\n" .
                "Greeting: はじめまして。どうぞ よろしく おねがいします。\n\n" .
                "Tutorial reference: textbook pp. 8–14 (Minna Shokyu I L1).\n" .
                "Vocabulary list to memorise — see flashcard deck."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 14, 'text' =>
                "Lesson 2 — これ・それ・あれ (Demonstratives)\n" .
                "─────────────────────────────────────────\n\n" .
                "Three-way distance system (different from English this/that):\n" .
                "  これ — near speaker\n" .
                "  それ — near listener\n" .
                "  あれ — far from both\n\n" .
                "Possessive linking: ～の～\n" .
                "  わたしの ほん → my book\n" .
                "  せんせいの かばん → teacher's bag\n\n" .
                "Question form: ～は なんですか。 → What is X?\n" .
                "  これは なんですか。 → これは ほんです。\n\n" .
                "Tutorial reference: textbook pp. 16–22 (Minna Shokyu I L2)."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 7, 'text' =>
                "Lesson 3 — ここ・そこ・あそこ (Locations)\n" .
                "─────────────────────────────────────────\n\n" .
                "Existence pattern: ～は～に あります (inanimate)\n" .
                "  ほんは つくえの うえに あります。\n" .
                "  → The book is on the desk.\n\n" .
                "Location particles:\n" .
                "  うえ (top) · した (bottom) · なか (inside) · そば (next to)\n\n" .
                "Question form: ～は どこに ありますか。\n" .
                "  きょうしつは どこに ありますか。\n" .
                "  → きょうしつは 3かいに あります。\n\n" .
                "Tutorial reference: textbook pp. 24–30 (Minna Shokyu I L3).\n" .
                "Self-test: complete drill 3-A and 3-B before next class."
            ],
        ]);

        // Stash the LCH1019 branch_id for the flashcard step (sync-service
        // path is `branchAssets.{branch_id}.flashcard`).
        $this->lch1019BranchId = $s1JpBranch;
    }

    private string $lch1019BranchId = '';

    /**
     * Single SEHH3140 channel owned by Lecturer01, whitelisted to
     * 2026SEHH3140. Three cast pages + a lightweight channel calendar
     * (lecture / demo / deadline only — exam dates live on personal
     * calendars). No channel flashcards; the LCH1019 notebook
     * exercises the flashcard feature instead.
     */
    private function seedChannel(BroadcastChannelService $bc, User $lec, int $whitelistBId): void
    {
        $records = [
            ['timestamp' => self::T_BASE - 86400000 * 14, 'text' =>
                "Welcome to SEHH3140 Programming Project, 2026 cohort. This\n" .
                "channel carries lecture-day announcements, deadline reminders,\n" .
                "and reference material. Subscribe (top-right) to receive live\n" .
                "updates, and check the calendar pane for upcoming events."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 7, 'text' =>
                "Stage 4 Project Demonstration — 30/4. Each group books a\n" .
                "15-minute slot via the schedule sheet. EVERY group member\n" .
                "must present. Late arrivals receive individual mark deduction.\n\n" .
                "Bring your laptop with the demo running locally. Classroom\n" .
                "WiFi is not whitelisted for Cloudflare Tunnel — public URL\n" .
                "may be unreliable on the day."
            ],
            ['timestamp' => self::T_BASE - 86400000 * 1, 'text' =>
                "Stage 5 Final Report submission — 7/5 23:59 (LMS).\n\n" .
                "Office hours moved this week: Tuesday 14:00 instead of\n" .
                "Thursday 10:00. Bring a printed draft if you want a structured\n" .
                "review. The Inbox in this MyCLI instance is the unofficial\n" .
                "channel for early drafts; the LMS submission remains the\n" .
                "official deliverable."
            ],
        ];

        $calendar = [
            $this->dateOffset(+1)  => ['Lecture 13 — Stage 4 pre-flight (bring laptop)'],
            $this->dateOffset(+5)  => ['Stage 4 Project Demonstration', 'Q&A 5 min after each slot'],
            $this->dateOffset(+7)  => ['Office Hours — Final Report draft consultation'],
            $this->dateOffset(+12) => ['Stage 5 Final Report — submission deadline (LMS)'],
        ];

        $channelName = 'SEHH3140 Programming Project';
        $channel = $bc->cast($lec, $channelName, $records, $calendar, null);
        $bc->applyWhitelist($lec, (int) $channel->id, $whitelistBId);

        // S20260001 + S20260002 + S20260003 all subscribe so the channel
        // shows on their list with a [SUBSCRIBED] marker.
        foreach (['S20260001', 'S20260002', 'S20260003'] as $uid) {
            $u = User::where('uid', $uid)->first();
            DB::table('broadcast_pins')->updateOrInsert(
                ['user_id' => $u->id, 'channel_id' => $channel->id],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    /**
     * Two chat connections — peer (S1↔S2) + student-lecturer (S1↔Lec).
     * Both threads themed around Stage 4 demo / Stage 5 report so the
     * conversation feels in-character for the demo day.
     */
    private function seedChat(WalkieTypieBoardService $wt, User $lec, User $s1, User $s2): void
    {
        $this->ensureConnection($s1, $s2);
        $this->ensureConnection($s1, $lec);

        // S1 ↔ S2 — peer demo prep
        $wt->commit($s1, "wt_{$s1->id}_{$s2->id}", $s2->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 2,        'text' => 'how is your dry-run going? mine\'s 19 min, need to cut'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 6e5,  'text' => 'are we still recording the demo video tomorrow afternoon?'],
            ['timestamp' => self::T_BASE - 86400000 * 1 + 3e5,  'text' => 'thanks, see you tmr 2pm at library room 4'],
        ]);
        $wt->commit($s2, "wt_{$s2->id}_{$s1->id}", $s1->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 2 + 3e5,  'text' => 'mine\'s 16 min — try cutting the architecture diagram, it speaks for itself'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 9e5,  'text' => 'yes, 4/26 2pm, library room 4 (booked it last week)'],
        ]);

        // S1 ↔ Lecturer01 — Stage 5 inbox question
        $wt->commit($s1, "wt_{$s1->id}_{$lec->id}", $lec->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 3,        'text' => 'good afternoon prof, quick question on the Stage 5 inbox'],
            ['timestamp' => self::T_BASE - 86400000 * 3 + 4e5,  'text' => 'is submitting via the MyCLI inbox enough, or must I also upload to LMS?'],
            ['timestamp' => self::T_BASE - 86400000 * 2 + 12e5, 'text' => 'understood, thanks!'],
        ]);
        $wt->commit($lec, "wt_{$lec->id}_{$s1->id}", $s1->uid, [
            ['timestamp' => self::T_BASE - 86400000 * 3 + 7e5,  'text' => 'LMS is the official deliverable — the MyCLI inbox is for early drafts so I can flag issues before deadline'],
            ['timestamp' => self::T_BASE - 86400000 * 3 + 9e5,  'text' => 'submit to MyCLI as soon as you have a complete draft; final clean copy still goes through LMS'],
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
     * Single SEHH3140 inbox with three submissions in the three
     * demo-relevant states: graded / awaiting feedback / graded. The
     * "awaiting feedback" entry fuels the lecturer-side [NEW] indicator.
     */
    private function seedInbox(InboxService $inbox, User $lec, int $whitelistBId, User $s1, User $s2, User $s3): void
    {
        $name = 'SEHH3140 Programming Project Submission';
        $existing = DB::table('inboxes')->where('name', $name)->first();
        if ($existing) {
            $inboxId = (int) $existing->id;
        } else {
            $row = $inbox->createInbox(
                $lec,
                $name,
                'Submit your Stage 5 Final Report draft for early review. Plain text in the SUBMISSION pane; attach your .docx via the file chip. Resubmit any time before deadline. The LMS submission remains the official deliverable.',
                $whitelistBId,
            );
            $inboxId = (int) $row->id;
        }

        // S1 — submitted with feedback (graded)
        $inbox->submit($s1, $inboxId,
            "Stage 5 Final Report — first complete draft.\n\nMain sections done: Executive Summary, Schedule Review, all five Stage Summaries, System (hardware + tools + outputs + installation), Demonstration User Accounts (per the new §5), Summary of Program (flow + features + tests + backup), Discussion (modifications + difficulties), Future Development, Conclusion. Team Distribution and References pending final review.\n\nPage count currently 26. Open to feedback on whether the §5 demo walkthrough reads as useful or filler.",
            null,
        );
        $inbox->writeFeedback($lec, $inboxId, $s1->uid,
            "Solid draft — the §5 demo walkthrough is the right call, keep it. A marker without context can replay your demonstration from §5 alone, which is exactly the kind of accessibility a Final Report should aim for.\n\nTwo points to tighten:\n  1. Schedule Review §2.2 — the table is dense; consider one bullet under each key date instead of leaving them naked.\n  2. Discussion §7.1.7 (sandbox→classroom) — strong section, but it reads as 'we did this' when it should read as 'we did this BECAUSE'. Add the why.\n\nGrade indication: A- range pending final clean-up.",
        );

        // S2 — submitted but no feedback yet (awaiting state)
        $inbox->submit($s2, $inboxId,
            "Initial submission — Stages 1–3 sections drafted. Stage 4 still in note form because I'm finalising the demo script first. Will resubmit a complete draft before the deadline.\n\nQuestion: is it acceptable to cite IBM's HITL article without a stable DOI? My APA reference reads 'Stryker (2026), IBM article' — the article doesn't carry a DOI on the IBM page.",
            null,
        );

        // S3 — submitted with feedback
        $inbox->submit($s3, $inboxId,
            "Final draft — 27 pages. Cover page, ToC, Executive Summary, Stages 1–5, System, Summary of Program, Discussion, Future Development, Conclusion, Team Distribution, References, Appendix A (repo + access), Appendix B (cost). All cross-references checked.",
            null,
        );
        $inbox->writeFeedback($lec, $inboxId, $s3->uid,
            "Well-structured. References list is thorough. Two minor points:\n\n  1. Appendix B cost table — distinguish 'cash outlay' from 'opportunity cost' in the man-day row. Current presentation conflates the two.\n  2. Stage 3 Programming summary — add one paragraph on the test isolation incident (SQLite vs Postgres). It's the kind of detail markers reward.\n\nPass-grade locked. Submit a final clean copy before deadline for grade upgrade consideration.",
        );
    }

    /**
     * Personal calendar: 4 exam dates from the user (Computer Networking
     * 7/5, Data Structure 10/5, Logic 12/5, Software Engineering 15/5)
     * + the 26/4 group demo-video record. LCH1019 flashcards live in
     * the same `users.settings` JSONB at
     * `branchAssets.{branchId}.flashcard`.
     */
    private function seedStudentSettings(User $s1): void
    {
        $existing = DB::table('users')->where('id', $s1->id)->value('settings');
        $current = $existing ? (json_decode($existing, true) ?: []) : [];

        // Personal calendar
        $personalCal = [
            $this->dateOffset(+1)  => ['8D group demo-video record — 2pm library room 4'],
            '2026-05-07' => ['Computer Networking — exam'],
            '2026-05-10' => ['Data Structure — exam'],
            '2026-05-12' => ['Logic and Reasoning — exam'],
            '2026-05-15' => ['Software Engineering — exam'],
        ];
        $current['calendar'] = array_merge($current['calendar'] ?? [], $personalCal);

        // LCH1019 flashcards on the corresponding BB branch (per-branch
        // BB flashcard store; sync-service path = `branchAssets.{id}.flashcard`)
        $flashcards = [
            ['front' => 'わたし',                'back' => 'I (1st-person pronoun) / 我'],
            ['front' => 'せんせい',              'back' => 'teacher / 老師'],
            ['front' => 'がくせい',              'back' => 'student / 學生'],
            ['front' => 'はじめまして',          'back' => 'How do you do? / 初次見面'],
            ['front' => '～は～です',            'back' => 'X is Y (copula) / 「X 是 Y」'],
            ['front' => '～は～じゃ ありません', 'back' => 'X is not Y / 「X 不是 Y」'],
            ['front' => 'これ',                 'back' => 'this (near speaker) / 這個'],
            ['front' => 'それ',                 'back' => 'that (near listener) / 那個'],
            ['front' => 'あれ',                 'back' => 'that over there / 那邊那個'],
            ['front' => '～の～',                'back' => 'possessive particle (の) / 所屬助詞「的」'],
            ['front' => 'ここ・そこ・あそこ',    'back' => 'here / there / over there / 這裡・那裡・那邊'],
            ['front' => '～は～に あります',     'back' => 'X is at Y (inanimate location) / 「X 在 Y」(無生物)'],
        ];

        $current['branchAssets'] ??= [];
        $current['branchAssets'][$this->lch1019BranchId] ??= [];
        $current['branchAssets'][$this->lch1019BranchId]['flashcard'] = [
            'cards'     => $flashcards,
            'mode'      => 'sequential',
            'playState' => null,
        ];

        DB::table('users')->where('id', $s1->id)->update([
            'settings'   => json_encode($current, JSON_UNESCAPED_UNICODE),
            'updated_at' => now(),
        ]);
    }

    private function resetDemoContent(User $lec, array $students): void
    {
        // Channels — old + new names so re-runs are clean
        DB::table('broadcast_channels')
            ->where('user_id', $lec->id)
            ->whereIn('name', [
                'SEHH3140 Programming Project',
                'SEHH2238 Lecture Updates',
                'Programming Project Discussion',
            ])
            ->delete();

        // Inboxes — old + new names so re-runs are clean
        DB::table('inboxes')
            ->where('user_id', $lec->id)
            ->whereIn('name', [
                'SEHH3140 Programming Project Submission',
                'Programming Project Stage 5 Submission',
                'Lab 03 Code Review',
            ])
            ->delete();

        // Notebooks (BB + WT)
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
        $ts = (int) (self::T_BASE / 1000) + $days * 86400;
        return gmdate('Y-m-d', $ts);
    }

    private function printPlan(): void
    {
        $this->newLine();
        $this->info('═══════════════ DEMO SCENARIO READY ═══════════════');
        $this->line('All passcodes = the uid itself (e.g. Lecturer01 / S20260001).');
        $this->newLine();
        $this->line('▌ LECTURER PERSPECTIVE — login as Lecturer01 (title=SEHH3140)');
        $this->line('  Dashboard pops up: UPCOMING (4 channel calendar events),');
        $this->line('  ANNOUNCEMENTS (1 owned channel), NOTEBOOKS (Lecture Plans).');
        $this->line('  → NOTEBOOK > SEHH3140 Lecture Plans (3 pages, Week 10/11/12)');
        $this->line('  → ANNOUNCE > SEHH3140 Programming Project');
        $this->line('     • 3 cast records, calendar shelf (4 lecture/deadline events)');
        $this->line('     • whitelist shelf shows 2026SEHH3140 applied; DETACH demo target');
        $this->line('  → INBOX > SEHH3140 Programming Project Submission');
        $this->line('     • preview rail shows 3 student blocks');
        $this->line('     • S20260001 — graded (✓), S20260002 — awaiting (·), S20260003 — graded (✓)');
        $this->line('     • click S20260002 block → write feedback live → POST');
        $this->line('  → CHAT > S20260001 (Stage 5 inbox question, 2 lecturer replies)');
        $this->newLine();
        $this->line('▌ STUDENT PERSPECTIVE — login as S20260001');
        $this->line('  Dashboard pops up: UPCOMING (group meeting + 4 exam dates),');
        $this->line('  ANNOUNCEMENTS (subscribed SEHH3140 Programming Project),');
        $this->line('  NOTEBOOKS (SEHH3140 Programming Project + LCH1019 Japanese I).');
        $this->line('  → NOTEBOOK > SEHH3140 Programming Project (3 pages, student notes)');
        $this->line('  → NOTEBOOK > LCH1019 Japanese I (3 lessons + 12-card flashcard deck');
        $this->line('     from Minna no Nihongo Shokyu I L1–L3)');
        $this->line('  → CHAT > S20260002 (peer demo prep, 3 messages each side)');
        $this->line('  → CHAT > Lecturer01 (Stage 5 question, 3 student msgs + 2 replies)');
        $this->line('  → ANNOUNCE > SEHH3140 Programming Project (read-only, calendar visible)');
        $this->line('  → INBOX > SEHH3140 Programming Project Submission');
        $this->line('     • SUBMISSION shows own submitted text');
        $this->line('     • FEEDBACK shows lecturer\'s graded comment');
        $this->newLine();
        $this->line('▌ KEY DATES SEEDED');
        $this->line('  2026-04-26  8D group demo-video record (S1 personal calendar)');
        $this->line('  2026-04-26  Lecture 13 (channel calendar)');
        $this->line('  2026-04-30  Stage 4 Demo (channel calendar)');
        $this->line('  2026-05-02  Office Hours (channel calendar)');
        $this->line('  2026-05-07  Stage 5 deadline + Computer Networking exam');
        $this->line('  2026-05-10  Data Structure exam');
        $this->line('  2026-05-12  Logic and Reasoning exam');
        $this->line('  2026-05-15  Software Engineering exam');
        $this->newLine();
        $this->line('Reset: php artisan demo:seed --reset');
    }
}

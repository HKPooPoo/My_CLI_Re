<?php

namespace Tests\Feature;

use App\Models\File;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class FileControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->user = User::factory()->create(['uid' => 'uploader']);
    }

    // =========================================================================
    //  POST /api/files (upload)
    // =========================================================================

    #[Test]
    public function upload_stores_file_and_returns_metadata(): void
    {
        $file = UploadedFile::fake()->create('notes.txt', 100, 'text/plain');

        $response = $this->actingAs($this->user)->postJson('/api/files', [
            'file' => $file,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['hash', 'name', 'mime', 'size']);

        $this->assertEquals('notes.txt', $response->json('name'));
        $this->assertNotEmpty($response->json('hash'));
    }

    #[Test]
    public function upload_works_without_auth(): void
    {
        $file = UploadedFile::fake()->create('guest.txt', 50, 'text/plain');

        $response = $this->postJson('/api/files', [
            'file' => $file,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['hash']);
    }

    #[Test]
    public function upload_rejects_missing_file(): void
    {
        $response = $this->postJson('/api/files', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function upload_rejects_blocked_php_extension(): void
    {
        $file = UploadedFile::fake()->create('evil.php', 10, 'text/plain');

        $response = $this->postJson('/api/files', ['file' => $file]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function upload_rejects_blocked_exe_extension(): void
    {
        $file = UploadedFile::fake()->create('malware.exe', 10, 'application/octet-stream');

        $response = $this->postJson('/api/files', ['file' => $file]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function upload_rejects_blocked_html_extension(): void
    {
        $file = UploadedFile::fake()->create('xss.html', 10, 'text/html');

        $response = $this->postJson('/api/files', ['file' => $file]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function upload_rejects_blocked_sh_extension(): void
    {
        $file = UploadedFile::fake()->create('script.sh', 10, 'text/plain');

        $response = $this->postJson('/api/files', ['file' => $file]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    #[Test]
    public function upload_accepts_safe_extensions(): void
    {
        $safeFiles = ['doc.pdf', 'pic.png', 'photo.jpg', 'data.json', 'sheet.csv'];

        foreach ($safeFiles as $name) {
            $file = UploadedFile::fake()->create($name, 10);
            $response = $this->postJson('/api/files', ['file' => $file]);
            $this->assertNotEquals(422, $response->status(), "File '{$name}' should be accepted");
        }
    }

    #[Test]
    public function upload_deduplicates_by_hash(): void
    {
        $content = 'identical content for dedup test';
        $file1 = UploadedFile::fake()->createWithContent('a.txt', $content);
        $file2 = UploadedFile::fake()->createWithContent('b.txt', $content);

        $r1 = $this->postJson('/api/files', ['file' => $file1]);
        $r2 = $this->postJson('/api/files', ['file' => $file2]);

        $this->assertEquals($r1->json('hash'), $r2->json('hash'));
    }

    // =========================================================================
    //  GET /api/files/{hash}/exists
    // =========================================================================

    #[Test]
    public function exists_returns_true_for_uploaded_file(): void
    {
        $file = UploadedFile::fake()->create('test.txt', 10, 'text/plain');
        $uploadResponse = $this->postJson('/api/files', ['file' => $file]);
        $hash = $uploadResponse->json('hash');

        $response = $this->getJson("/api/files/{$hash}/exists");

        $response->assertStatus(200)
            ->assertJson(['exists' => true]);
    }

    #[Test]
    public function exists_returns_false_for_unknown_hash(): void
    {
        $response = $this->getJson('/api/files/nonexistent_hash_value/exists');

        $response->assertStatus(200)
            ->assertJson(['exists' => false]);
    }

    // =========================================================================
    //  GET /api/files/{hash}/meta
    // =========================================================================

    #[Test]
    public function meta_returns_file_metadata(): void
    {
        $file = UploadedFile::fake()->create('report.pdf', 500, 'application/pdf');
        $uploadResponse = $this->postJson('/api/files', ['file' => $file]);
        $hash = $uploadResponse->json('hash');

        $response = $this->getJson("/api/files/{$hash}/meta");

        $response->assertStatus(200)
            ->assertJsonStructure(['hash', 'name', 'mime', 'size', 'status'])
            ->assertJson([
                'hash' => $hash,
                'name' => 'report.pdf',
                'status' => 'staged',
            ]);
    }

    #[Test]
    public function meta_returns_404_for_unknown_hash(): void
    {
        $response = $this->getJson('/api/files/unknown_hash/meta');

        $response->assertStatus(404)
            ->assertJson(['message' => 'FILE NOT FOUND']);
    }

    // =========================================================================
    //  GET /api/files/{hash} (download)
    // =========================================================================

    #[Test]
    public function download_returns_404_for_unknown_hash(): void
    {
        $response = $this->getJson('/api/files/unknown_hash');

        $response->assertStatus(404)
            ->assertJson(['message' => 'FILE NOT FOUND']);
    }

    #[Test]
    public function download_returns_file_for_uploaded_hash(): void
    {
        $file = UploadedFile::fake()->createWithContent('download-test.txt', 'Download me');
        $uploadResponse = $this->postJson('/api/files', ['file' => $file]);
        $hash = $uploadResponse->json('hash');

        $response = $this->get("/api/files/{$hash}");

        $response->assertStatus(200);
        $this->assertStringContainsString('text/plain', $response->headers->get('content-type'));
    }

    #[Test]
    public function download_returns_404_when_db_exists_but_disk_missing(): void
    {
        // Create DB record pointing to non-existent file
        \App\Models\File::create([
            'hash' => 'ghost_hash_on_disk',
            'user_id' => $this->user->id,
            'original_name' => 'ghost.txt',
            'mime_type' => 'text/plain',
            'size' => 100,
            'disk_path' => 'files/gh/os/ghost_hash_on_disk.txt',
            'status' => 'committed',
        ]);

        $response = $this->getJson('/api/files/ghost_hash_on_disk');

        $response->assertStatus(404)
            ->assertJson(['message' => 'FILE MISSING FROM DISK']);
    }

    // =========================================================================
    //  File status transitions via board commit
    // =========================================================================

    #[Test]
    public function file_status_transitions_staged_to_committed_via_board_commit(): void
    {
        // Upload file → status = staged
        $file = UploadedFile::fake()->createWithContent('staged.txt', 'Stage me');
        $uploadResponse = $this->actingAs($this->user)->postJson('/api/files', ['file' => $file]);
        $hash = $uploadResponse->json('hash');

        $this->assertDatabaseHas('files', ['hash' => $hash, 'status' => 'staged']);

        // Commit a BB record referencing this file → status should become committed
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'file-test-br',
            'branch_name' => 'File Test',
            'records' => [
                ['timestamp' => 1000, 'text' => 'Has file', 'file_hash' => $hash],
            ],
        ])->assertStatus(200);

        $this->assertDatabaseHas('files', ['hash' => $hash, 'status' => 'committed']);
    }

    // =========================================================================
    //  Orphan detection: file no longer referenced by any board
    // =========================================================================

    #[Test]
    public function mark_orphaned_detects_unreferenced_committed_files(): void
    {
        $fileService = app(\App\Services\FileService::class);

        // Create a committed file
        \App\Models\File::create([
            'hash' => 'orphan_test_hash',
            'user_id' => $this->user->id,
            'original_name' => 'orphan.txt',
            'mime_type' => 'text/plain',
            'size' => 50,
            'disk_path' => 'files/or/ph/orphan_test_hash.txt',
            'status' => 'committed',
        ]);

        // No board references this hash → should be marked orphaned
        $marked = $fileService->markOrphaned();

        $this->assertGreaterThan(0, $marked);
        $this->assertDatabaseHas('files', ['hash' => 'orphan_test_hash', 'status' => 'orphaned']);
    }

    #[Test]
    public function mark_orphaned_keeps_files_referenced_by_bb(): void
    {
        $fileService = app(\App\Services\FileService::class);

        \App\Models\File::create([
            'hash' => 'referenced_hash',
            'user_id' => $this->user->id,
            'original_name' => 'safe.txt',
            'mime_type' => 'text/plain',
            'size' => 50,
            'disk_path' => 'files/re/fe/referenced_hash.txt',
            'status' => 'committed',
        ]);

        // BB record references this file
        \Illuminate\Support\Facades\DB::table('blackboards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'br1', 'branch_name' => 'Main',
            'timestamp' => 1000, 'text' => 'With file', 'file_hash' => 'referenced_hash',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $fileService->markOrphaned();

        // Should still be committed, not orphaned
        $this->assertDatabaseHas('files', ['hash' => 'referenced_hash', 'status' => 'committed']);
    }

    #[Test]
    public function mark_orphaned_keeps_files_referenced_by_wt(): void
    {
        $fileService = app(\App\Services\FileService::class);

        \App\Models\File::create([
            'hash' => 'wt_ref_hash',
            'user_id' => $this->user->id,
            'original_name' => 'wt-safe.txt',
            'mime_type' => 'text/plain',
            'size' => 50,
            'disk_path' => 'files/wt/re/wt_ref_hash.txt',
            'status' => 'committed',
        ]);

        // WT board references this file
        \Illuminate\Support\Facades\DB::table('walkie_typie_boards')->insert([
            'user_id' => $this->user->id, 'branch_id' => 'wt-br1',
            'timestamp' => 1000, 'text' => 'WT file', 'file_hash' => 'wt_ref_hash',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $fileService->markOrphaned();

        $this->assertDatabaseHas('files', ['hash' => 'wt_ref_hash', 'status' => 'committed']);
    }

    #[Test]
    public function mark_orphaned_keeps_files_referenced_by_bc(): void
    {
        $fileService = app(\App\Services\FileService::class);

        \App\Models\File::create([
            'hash' => 'bc_ref_hash',
            'user_id' => $this->user->id,
            'original_name' => 'bc-safe.txt',
            'mime_type' => 'text/plain',
            'size' => 50,
            'disk_path' => 'files/bc/re/bc_ref_hash.txt',
            'status' => 'committed',
        ]);

        // BC board references this file
        $chId = \Illuminate\Support\Facades\DB::table('broadcast_channels')->insertGetId([
            'name' => 'file-test-ch', 'user_id' => $this->user->id,
            'last_signal' => 1000, 'created_at' => now(), 'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('broadcast_boards')->insert([
            'channel_id' => $chId, 'timestamp' => 1000, 'text' => 'BC file',
            'file_hash' => 'bc_ref_hash', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $fileService->markOrphaned();

        $this->assertDatabaseHas('files', ['hash' => 'bc_ref_hash', 'status' => 'committed']);
    }

    // =========================================================================
    //  Clean orphaned files command
    // =========================================================================

    #[Test]
    public function clean_orphaned_command_runs_successfully(): void
    {
        $this->artisan('files:clean-orphaned')
            ->assertExitCode(0);
    }

    // =========================================================================
    //  End-to-end: upload → commit → exists → meta → download
    // =========================================================================

    #[Test]
    public function full_lifecycle_upload_commit_exists_meta(): void
    {
        $file = UploadedFile::fake()->createWithContent('lifecycle.txt', 'Hello lifecycle test');

        // 1. Upload
        $uploadResponse = $this->actingAs($this->user)->postJson('/api/files', ['file' => $file]);
        $uploadResponse->assertStatus(200);
        $hash = $uploadResponse->json('hash');

        // Status: staged
        $this->assertDatabaseHas('files', ['hash' => $hash, 'status' => 'staged']);

        // 2. Commit referencing the file → status: committed
        $this->actingAs($this->user)->postJson('/api/blackboard/commit', [
            'branch_id' => 'lifecycle-br',
            'branch_name' => 'Lifecycle',
            'records' => [['timestamp' => 1000, 'text' => 'With file', 'file_hash' => $hash]],
        ])->assertStatus(200);

        $this->assertDatabaseHas('files', ['hash' => $hash, 'status' => 'committed']);

        // 3. Exists
        $this->getJson("/api/files/{$hash}/exists")
            ->assertJson(['exists' => true]);

        // 4. Meta
        $this->getJson("/api/files/{$hash}/meta")
            ->assertJson(['name' => 'lifecycle.txt', 'status' => 'committed']);

        // 5. Download
        $this->get("/api/files/{$hash}")
            ->assertStatus(200);
    }
}

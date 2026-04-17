<?php

namespace Tests\Feature;

use App\Models\File;
use App\Models\User;
use App\Services\FileService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class FileServiceTest extends TestCase
{
    use RefreshDatabase;

    private FileService $service;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->service = app(FileService::class);
        $this->user = User::factory()->create(['uid' => 'tester']);
    }

    // =========================================================================
    //  upload()
    // =========================================================================

    #[Test] /* F1 */
    public function upload_stores_file_and_creates_record(): void
    {
        $file = UploadedFile::fake()->create('doc.txt', 100, 'text/plain');

        $record = $this->service->upload($file, $this->user->id);

        $this->assertNotNull($record->hash);
        $this->assertEquals('doc.txt', $record->original_name);
        $this->assertEquals('staged', $record->status);
        $this->assertEquals($this->user->id, $record->user_id);
        Storage::disk('local')->assertExists($record->disk_path);
    }

    #[Test] /* F2 */
    public function upload_deduplicates_by_content_and_name(): void
    {
        // Hash incorporates filename; same content + same name → dedupe
        $file1 = UploadedFile::fake()->createWithContent('same.txt', 'identical content');
        $file2 = UploadedFile::fake()->createWithContent('same.txt', 'identical content');

        $record1 = $this->service->upload($file1, $this->user->id);
        $record2 = $this->service->upload($file2, $this->user->id);

        $this->assertEquals($record1->id, $record2->id);
        $this->assertDatabaseCount('files', 1);
    }

    #[Test] /* F2b */
    public function upload_same_content_different_name_creates_separate_records(): void
    {
        // Enables per-user rename without mutating others' records
        $file1 = UploadedFile::fake()->createWithContent('a.txt', 'identical content');
        $file2 = UploadedFile::fake()->createWithContent('b.txt', 'identical content');

        $record1 = $this->service->upload($file1, $this->user->id);
        $record2 = $this->service->upload($file2, $this->user->id);

        $this->assertNotEquals($record1->hash, $record2->hash);
        $this->assertDatabaseCount('files', 2);
    }

    #[Test] /* F3 */
    public function upload_different_content_creates_separate_records(): void
    {
        $file1 = UploadedFile::fake()->createWithContent('a.txt', 'content A');
        $file2 = UploadedFile::fake()->createWithContent('b.txt', 'content B');

        $this->service->upload($file1, $this->user->id);
        $this->service->upload($file2, $this->user->id);

        $this->assertDatabaseCount('files', 2);
    }

    // =========================================================================
    //  getByHash()
    // =========================================================================

    #[Test] /* F4 */
    public function get_by_hash_returns_file(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'hello');
        $record = $this->service->upload($file, $this->user->id);

        $found = $this->service->getByHash($record->hash);

        $this->assertNotNull($found);
        $this->assertEquals($record->id, $found->id);
    }

    #[Test] /* F5 */
    public function get_by_hash_returns_null_for_unknown(): void
    {
        $this->assertNull($this->service->getByHash('nonexistent-hash'));
    }

    // =========================================================================
    //  markCommitted() / markCommittedBatch()
    // =========================================================================

    #[Test] /* F6 */
    public function mark_committed_changes_status(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'data');
        $record = $this->service->upload($file, $this->user->id);
        $this->assertEquals('staged', $record->status);

        $this->service->markCommitted($record->hash);

        $record->refresh();
        $this->assertEquals('committed', $record->status);
    }

    #[Test] /* F7 */
    public function mark_committed_batch_updates_multiple(): void
    {
        $r1 = $this->service->upload(
            UploadedFile::fake()->createWithContent('a.txt', 'aaa'), $this->user->id
        );
        $r2 = $this->service->upload(
            UploadedFile::fake()->createWithContent('b.txt', 'bbb'), $this->user->id
        );

        $this->service->markCommittedBatch([$r1->hash, $r2->hash]);

        $r1->refresh();
        $r2->refresh();
        $this->assertEquals('committed', $r1->status);
        $this->assertEquals('committed', $r2->status);
    }

    #[Test] /* F8 */
    public function mark_committed_batch_ignores_empty_array(): void
    {
        // Should not throw
        $this->service->markCommittedBatch([]);
        $this->assertTrue(true);
    }

    // =========================================================================
    //  markOrphaned()
    // =========================================================================

    #[Test] /* F9 */
    public function mark_orphaned_marks_unreferenced_committed_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'orphan');
        $record = $this->service->upload($file, $this->user->id);
        $record->update(['status' => 'committed']);

        // No board references this file hash
        $marked = $this->service->markOrphaned();

        $this->assertGreaterThanOrEqual(1, $marked);
        $record->refresh();
        $this->assertEquals('orphaned', $record->status);
    }

    #[Test] /* F10 */
    public function mark_orphaned_keeps_referenced_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'referenced');
        $record = $this->service->upload($file, $this->user->id);
        $record->update(['status' => 'committed']);

        // Create a board record referencing this file
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id,
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'timestamp' => 1000,
            'text' => 'With file',
            'file_hash' => $record->hash,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->service->markOrphaned();

        $record->refresh();
        $this->assertEquals('committed', $record->status);
    }

    #[Test] /* F10b */
    public function mark_orphaned_keeps_files_referenced_by_json_array(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'in-array');
        $record = $this->service->upload($file, $this->user->id);
        $record->update(['status' => 'committed']);

        // Reference via JSON array in file_hash
        DB::table('blackboards')->insert([
            'user_id' => $this->user->id,
            'branch_id' => 'br1',
            'branch_name' => 'Main',
            'timestamp' => 1000,
            'text' => 'Multi-file',
            'file_hash' => json_encode([$record->hash, 'other-hash']),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->service->markOrphaned();

        $record->refresh();
        $this->assertEquals('committed', $record->status);
    }

    #[Test] /* F11 */
    public function mark_orphaned_marks_stale_staged_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'stale');
        $record = $this->service->upload($file, $this->user->id);
        // Simulate 25-hour-old staged file (bypass mass assignment)
        $record->created_at = now()->subHours(25);
        $record->timestamps = false;
        $record->save();
        $record->timestamps = true;

        $marked = $this->service->markOrphaned();

        $this->assertGreaterThanOrEqual(1, $marked);
        $record->refresh();
        $this->assertEquals('orphaned', $record->status);
    }

    // =========================================================================
    //  cleanupOrphaned()
    // =========================================================================

    #[Test] /* F12 */
    public function cleanup_orphaned_deletes_old_orphaned_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'cleanup-me');
        $record = $this->service->upload($file, $this->user->id);
        $diskPath = $record->disk_path;
        $record->status = 'orphaned';
        $record->updated_at = now()->subHours(25);
        $record->timestamps = false;
        $record->save();
        $record->timestamps = true;

        $deleted = $this->service->cleanupOrphaned(24);

        $this->assertEquals(1, $deleted);
        $this->assertDatabaseMissing('files', ['hash' => $record->hash]);
        Storage::disk('local')->assertMissing($diskPath);
    }

    #[Test] /* F13 */
    public function cleanup_orphaned_keeps_recent_orphaned_files(): void
    {
        $file = UploadedFile::fake()->createWithContent('test.txt', 'keep-me');
        $record = $this->service->upload($file, $this->user->id);
        $record->status = 'orphaned';
        $record->updated_at = now()->subHours(1); // only 1 hour old
        $record->timestamps = false;
        $record->save();
        $record->timestamps = true;

        $deleted = $this->service->cleanupOrphaned(24);

        $this->assertEquals(0, $deleted);
        $this->assertDatabaseHas('files', ['hash' => $record->hash]);
    }
}

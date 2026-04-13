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

    // =========================================================================
    //  End-to-end: upload → exists → meta → download
    // =========================================================================

    #[Test]
    public function full_lifecycle_upload_exists_meta(): void
    {
        $file = UploadedFile::fake()->createWithContent('lifecycle.txt', 'Hello lifecycle test');

        // 1. Upload
        $uploadResponse = $this->actingAs($this->user)->postJson('/api/files', ['file' => $file]);
        $uploadResponse->assertStatus(200);
        $hash = $uploadResponse->json('hash');

        // 2. Exists
        $this->getJson("/api/files/{$hash}/exists")
            ->assertJson(['exists' => true]);

        // 3. Meta
        $metaResponse = $this->getJson("/api/files/{$hash}/meta");
        $metaResponse->assertStatus(200)
            ->assertJson([
                'name' => 'lifecycle.txt',
                'status' => 'staged',
            ]);
    }
}
